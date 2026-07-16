// SVarticles live-sync Worker.
//
// Two endpoints, both POST, both requiring an X-Worker-Secret header that
// matches the WORKER_SECRET binding:
//
//   POST /add-article   { url, bucket, sector, sender, channel, quickNote, dateAdded }
//     -> fetches the article, extracts an image, classifies/summarizes it
//        with the Anthropic API, commits the finished record to
//        data/articles.json on GitHub, and returns it.
//
//   POST /update-notes  { id, myNotes }
//     -> finds the article by id in data/articles.json and overwrites
//        myNotes, committing the change.
//
// See ../CLAUDE.md for the classification rules this mirrors, and
// ../README.md for deployment instructions.

const TAXONOMY = {
  primaryBuckets: ["General Market", "Enterprise Updates", "Portfolio Companies", "Potential Companies"],
  sectorBuckets: ["Enterprise Updates", "Portfolio Companies", "Potential Companies"],
  sectors: ["Workforce", "Healthcare", "Fintech"],
};

// "input" deliberately excluded: it's a void element (no closing tag), and
// has no text content to skip anyway, so it's not worth the risk of
// onEndTag never firing and leaving skipDepth permanently non-zero.
const SKIP_TAGS = ["script", "style", "noscript", "svg", "nav", "header", "footer", "form", "iframe", "button", "select", "template"];
const MAX_EXTRACTED_TEXT = 12000;
const MAX_FULLTEXT_CHARS = 6000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      if (request.method !== "POST") {
        return json({ ok: false, error: "Method not allowed" }, 405, cors);
      }
      if (!checkSecret(request, env)) {
        return json({ ok: false, error: "Unauthorized" }, 401, cors);
      }

      if (url.pathname === "/add-article") {
        return json(await handleAddArticle(request, env), 200, cors);
      }
      if (url.pathname === "/update-notes") {
        return json(await handleUpdateNotes(request, env), 200, cors);
      }
      return json({ ok: false, error: "Not found" }, 404, cors);
    } catch (err) {
      return json({ ok: false, error: String(err && err.message || err) }, 500, cors);
    }
  },
};

// ---------------- Routes ----------------

async function handleAddArticle(request, env) {
  const body = await request.json();
  const { url: articleUrl, bucket, sector, sender, channel, quickNote, dateAdded } = body;

  if (!articleUrl) throw new Error("Missing 'url'");
  if (!TAXONOMY.primaryBuckets.includes(bucket)) throw new Error("Invalid 'bucket'");
  if (sector && !TAXONOMY.sectors.includes(sector)) throw new Error("Invalid 'sector'");
  const finalDate = dateAdded || new Date().toISOString().slice(0, 10);

  const { articles, sha } = await getArticlesFile(env);

  const existing = articles.find(a => normalizeUrl(a.url) === normalizeUrl(articleUrl));
  if (existing) {
    return { ok: true, duplicate: true, article: existing };
  }

  const extracted = await fetchAndExtract(articleUrl);
  const classified = await classifyWithClaude(env, {
    url: articleUrl, bucket, sector, sender, channel, quickNote, extracted,
  });

  const record = {
    id: uniqueId(finalDate, classified.title || extracted.title || articleUrl, articles),
    title: classified.title || extracted.title || articleUrl,
    url: articleUrl,
    source: classified.source || extracted.source || "",
    slackChannel: channel || "",
    sender: sender || "",
    sharedAt: finalDate,
    whyShared: quickNote || "",
    primaryBucket: bucket,
    sector: sector || null,
    companyName: classified.companyName || "",
    tags: Array.isArray(classified.tags) ? classified.tags : [],
    imageUrl: extracted.imageUrl || "",
    summary: classified.summary || "",
    fullText: (classified.fullText || "").slice(0, MAX_FULLTEXT_CHARS),
    keyTakeaways: Array.isArray(classified.keyTakeaways) ? classified.keyTakeaways : [],
    openQuestions: Array.isArray(classified.openQuestions) ? classified.openQuestions : [],
    myNotes: "",
    relatedArticleIds: [],
    dateAdded: finalDate,
  };

  articles.push(record);
  await commitArticlesFile(env, articles, sha, `Add article via live sync: ${record.title}`);

  return { ok: true, article: record };
}

async function handleUpdateNotes(request, env) {
  const body = await request.json();
  const { id, myNotes } = body;
  if (!id) throw new Error("Missing 'id'");

  const { articles, sha } = await getArticlesFile(env);
  const target = articles.find(a => a.id === id);
  if (!target) throw new Error("Article not found: " + id);

  target.myNotes = myNotes || "";
  await commitArticlesFile(env, articles, sha, `Update notes: ${target.title}`);

  return { ok: true };
}

// ---------------- Article fetch + extraction ----------------

async function fetchAndExtract(articleUrl) {
  const result = { title: "", source: "", imageUrl: "", text: "" };
  let pageOrigin = "";
  try { pageOrigin = new URL(articleUrl).origin; } catch { /* leave blank */ }

  let response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    response = await fetch(articleUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SVarticlesBot/1.0; +https://github.com/)" },
    });
    clearTimeout(timeout);
  } catch {
    return result; // fetch failed entirely — Claude will work from URL/quickNote alone
  }
  if (!response || !response.ok) return result;

  let ogImage = "", twitterImage = "", ogSiteName = "", pageTitle = "";
  const textChunks = [];
  let textLen = 0;
  // el.remove() only affects the *output* stream — it does not stop a
  // separately-registered "body *" text handler from firing for that same
  // descendant text, since each selector's handlers are matched against the
  // original parse tree independently. To actually skip text inside
  // script/nav/header/etc, track nesting depth explicitly and gate the text
  // handler on it.
  let skipDepth = 0;

  const rewriter = new HTMLRewriter()
    .on('meta[property="og:image"]', { element(el) { if (!ogImage) ogImage = el.getAttribute("content") || ""; } })
    .on('meta[name="twitter:image"]', { element(el) { if (!twitterImage) twitterImage = el.getAttribute("content") || ""; } })
    .on('meta[property="og:site_name"]', { element(el) { if (!ogSiteName) ogSiteName = el.getAttribute("content") || ""; } })
    .on("title", { text(t) { if (textLen < MAX_EXTRACTED_TEXT) pageTitle += t.text; } })
    .on("body *", {
      text(t) {
        if (skipDepth > 0 || textLen >= MAX_EXTRACTED_TEXT) return;
        const chunk = t.text;
        textChunks.push(chunk);
        textLen += chunk.length;
      },
    });
  SKIP_TAGS.forEach(tag => rewriter.on(tag, {
    element(el) {
      skipDepth++;
      el.onEndTag(() => { skipDepth = Math.max(0, skipDepth - 1); });
    },
  }));

  try {
    await rewriter.transform(response).text();
  } catch {
    // partial extraction is fine — use whatever was captured before the error
  }

  result.title = pageTitle.trim().slice(0, 300);
  result.source = ogSiteName.trim() || (pageOrigin ? pageOrigin.replace(/^https?:\/\/(www\.)?/, "") : "");
  result.imageUrl = resolveUrl(ogImage || twitterImage, pageOrigin);
  result.text = textChunks.join(" ").replace(/\s+/g, " ").trim().slice(0, MAX_EXTRACTED_TEXT);
  return result;
}

function resolveUrl(maybeUrl, origin) {
  if (!maybeUrl) return "";
  try { return new URL(maybeUrl, origin || undefined).toString(); }
  catch { return ""; }
}

// ---------------- Anthropic classification ----------------

async function classifyWithClaude(env, { url, bucket, sector, sender, channel, quickNote, extracted }) {
  const system = `You are helping a VC analyst at SemperVirens maintain a research feed. The user has already
chosen which section (bucket) and sector this article belongs in via a form — do not change or
question that, just write up the record.

Be concise, analytical, and synthesis-focused in the summary and takeaways — don't restate the
article. Focus on categorization, relevance, and what's useful to remember. If the extracted
article text looks empty, thin, or unrelated to the URL (e.g. a paywall/login page), say so
plainly in the summary (e.g. "Couldn't access the full article — likely paywalled.") rather than
inventing content.

Tags: company names, industry, geography, stage (seed, series-c), event type (product-launch,
fundraising, leadership-change), and cross-cutting themes (AI, regulation, distribution,
competition, pricing, workflow). Lowercase, hyphenated.

fullText should be a clean plain-text version of the article body (strip nav/ads/boilerplate),
up to about 6000 characters, suitable for text-to-speech read-aloud. Leave it empty if the
article text wasn't actually available.`;

  const userMessage = `URL: ${url}
Section (already chosen by the user): ${bucket}${sector ? " / " + sector : ""}
Sender: ${sender || "(not given)"}
Slack channel: ${channel || "(not given)"}
Why it was shared (user's note): ${quickNote || "(no note given)"}

Extracted page title: ${extracted.title || "(none)"}
Extracted site/source name: ${extracted.source || "(none)"}

Extracted article text:
${extracted.text || "(could not fetch article content — page may be paywalled, blocked, or JS-rendered)"}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      system,
      messages: [{ role: "user", content: userMessage }],
      tools: [{
        name: "record_article",
        description: "Return the structured research record for this article.",
        input_schema: {
          type: "object",
          properties: {
            title: { type: "string", description: "Real article title (fix up the extracted one if it's messy)." },
            source: { type: "string", description: "Publisher name, e.g. 'TechCrunch'." },
            companyName: { type: "string", description: "Specific company this is about, if any. Empty string if not company-specific." },
            tags: { type: "array", items: { type: "string" } },
            summary: { type: "string", description: "2-4 sentence synthesis, not a repeat of the article." },
            keyTakeaways: { type: "array", items: { type: "string" } },
            openQuestions: { type: "array", items: { type: "string" } },
            fullText: { type: "string", description: "Clean plain-text article body, up to ~6000 characters. Empty if unavailable." },
          },
          required: ["title", "source", "companyName", "tags", "summary", "keyTakeaways", "openQuestions", "fullText"],
        },
      }],
      tool_choice: { type: "tool", name: "record_article" },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  const toolUse = (data.content || []).find(b => b.type === "tool_use" && b.name === "record_article");
  if (!toolUse) throw new Error("Anthropic response had no record_article tool call");
  return toolUse.input;
}

// ---------------- GitHub commit ----------------

async function getArticlesFile(env) {
  const path = env.ARTICLES_PATH || "data/articles.json";
  const apiUrl = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}?ref=${env.GITHUB_BRANCH || "main"}`;
  const res = await fetch(apiUrl, { headers: githubHeaders(env) });
  if (!res.ok) throw new Error(`GitHub read failed (${res.status}): ${await res.text().catch(() => "")}`);
  const data = await res.json();
  const content = b64DecodeUnicode(data.content.replace(/\n/g, ""));
  return { articles: JSON.parse(content), sha: data.sha };
}

async function commitArticlesFile(env, articles, sha, message) {
  const path = env.ARTICLES_PATH || "data/articles.json";
  const apiUrl = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;
  const newContent = JSON.stringify(articles, null, 2) + "\n";
  const res = await fetch(apiUrl, {
    method: "PUT",
    headers: githubHeaders(env),
    body: JSON.stringify({
      message,
      content: b64EncodeUnicode(newContent),
      sha,
      branch: env.GITHUB_BRANCH || "main",
    }),
  });
  if (!res.ok) throw new Error(`GitHub commit failed (${res.status}): ${await res.text().catch(() => "")}`);
}

function githubHeaders(env) {
  return {
    "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
    "Accept": "application/vnd.github+json",
    "User-Agent": "svarticles-worker",
    "content-type": "application/json",
  };
}

// ---------------- Helpers ----------------

function checkSecret(request, env) {
  const provided = request.headers.get("X-Worker-Secret") || "";
  return env.WORKER_SECRET && provided === env.WORKER_SECRET;
}

function corsHeaders(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  const headers = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Worker-Secret",
  };
  if (allowed.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(obj, status, corsHdrs) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", ...corsHdrs },
  });
}

function normalizeUrl(u) {
  return String(u || "").trim().replace(/\/$/, "").toLowerCase();
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60) || "article";
}

function uniqueId(dateAdded, title, existingArticles) {
  const base = `${dateAdded}-${slugify(title)}`;
  const ids = new Set(existingArticles.map(a => a.id));
  if (!ids.has(base)) return base;
  let n = 2;
  while (ids.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

function b64DecodeUnicode(str) {
  return decodeURIComponent(
    atob(str)
      .split("")
      .map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
      .join("")
  );
}
function b64EncodeUnicode(str) {
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode("0x" + p1))
  );
}
