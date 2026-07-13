// SVarticles front end. Reads TAXONOMY + ARTICLES from data/articles.js.
// Personal notes typed into the page are saved to localStorage as an overlay
// (the repo file data/articles.js is only updated when Claude commits new
// records/notes). Use "Export my notes" to hand edits back to Claude.

const NOTES_KEY = "sva_notes_overlay_v1";

const state = {
  bucket: "All",       // "All" | one of TAXONOMY.primaryBuckets
  sector: null,         // "Workforce" | "Healthcare" | "Fintech" | null
  subTopic: null,        // string | null
  tag: null,             // string | null (cross-cutting theme or any tag)
  query: "",
  expanded: new Set(),
};

function loadNotesOverlay() {
  try { return JSON.parse(localStorage.getItem(NOTES_KEY) || "{}"); }
  catch { return {}; }
}
function saveNoteOverlay(id, text) {
  const overlay = loadNotesOverlay();
  overlay[id] = text;
  localStorage.setItem(NOTES_KEY, JSON.stringify(overlay));
  renderDirtyIndicator();
}

function mergedArticles() {
  const overlay = loadNotesOverlay();
  return ARTICLES.map(a => overlay[a.id] !== undefined ? { ...a, myNotes: overlay[a.id] } : a);
}

function matchesFilters(a) {
  if (state.bucket !== "All" && a.primaryBucket !== state.bucket) return false;
  if (state.sector && a.sector !== state.sector) return false;
  if (state.subTopic && a.subTopic !== state.subTopic) return false;
  if (state.tag) {
    const inTags = (a.tags || []).map(t => t.toLowerCase()).includes(state.tag.toLowerCase());
    const inTheme = state.tag.toLowerCase() === (a.tags || []).find(t => t.toLowerCase() === state.tag.toLowerCase());
    if (!inTags) return false;
  }
  if (state.query) {
    const q = state.query.toLowerCase();
    const hay = [a.title, a.companyName, a.source, a.sender, a.slackChannel, a.summary, ...(a.tags||[])]
      .filter(Boolean).join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function countFor(filterFn) {
  return mergedArticles().filter(filterFn).length;
}

function bucketCount(bucket) {
  return countFor(a => a.primaryBucket === bucket);
}
function subTopicCount(bucket, subTopic) {
  return countFor(a => a.primaryBucket === bucket && a.subTopic === subTopic);
}
function sectorCount(bucket, sector) {
  return countFor(a => a.primaryBucket === bucket && a.sector === sector);
}

// ---------------- Sidebar ----------------

function renderSidebar() {
  const nav = document.getElementById("nav");
  nav.innerHTML = "";

  const allItem = navItem("All Articles", mergedArticles().length, state.bucket === "All" && !state.tag, () => {
    setState({ bucket: "All", sector: null, subTopic: null, tag: null });
  });
  nav.appendChild(allItem);

  const inboxCount = bucketCount("Inbox");
  nav.appendChild(navItem("Inbox", inboxCount, state.bucket === "Inbox", () => {
    setState({ bucket: "Inbox", sector: null, subTopic: null, tag: null });
  }));

  nav.appendChild(divider());

  // Markets: subgroups by subTopic
  nav.appendChild(navItem("Markets", bucketCount("Markets"), state.bucket === "Markets" && !state.subTopic, () => {
    setState({ bucket: "Markets", sector: null, subTopic: null, tag: null });
  }));
  const marketsSub = document.createElement("div");
  marketsSub.className = "nav-sub";
  TAXONOMY.subTopics["Markets"].forEach(st => {
    marketsSub.appendChild(navItem(st, subTopicCount("Markets", st), state.bucket === "Markets" && state.subTopic === st, () => {
      setState({ bucket: "Markets", sector: null, subTopic: st, tag: null });
    }, true));
  });
  nav.appendChild(marketsSub);

  // Companies: subgroups by sector
  nav.appendChild(navItem("Companies", bucketCount("Companies"), state.bucket === "Companies" && !state.sector, () => {
    setState({ bucket: "Companies", sector: null, subTopic: null, tag: null });
  }));
  const companiesSub = document.createElement("div");
  companiesSub.className = "nav-sub";
  TAXONOMY.sectors.forEach(sec => {
    companiesSub.appendChild(navItem(sec, sectorCount("Companies", sec), state.bucket === "Companies" && state.sector === sec, () => {
      setState({ bucket: "Companies", sector: sec, subTopic: null, tag: null });
    }, true));
  });
  nav.appendChild(companiesSub);

  // Company Sectors
  nav.appendChild(navItem("Company Sectors", bucketCount("Company Sectors"), state.bucket === "Company Sectors" && !state.sector, () => {
    setState({ bucket: "Company Sectors", sector: null, subTopic: null, tag: null });
  }));
  const sectorsSub = document.createElement("div");
  sectorsSub.className = "nav-sub";
  TAXONOMY.sectors.forEach(sec => {
    sectorsSub.appendChild(navItem(sec, sectorCount("Company Sectors", sec), state.bucket === "Company Sectors" && state.sector === sec, () => {
      setState({ bucket: "Company Sectors", sector: sec, subTopic: null, tag: null });
    }, true));
  });
  nav.appendChild(sectorsSub);

  // Portfolio Companies
  nav.appendChild(navItem("Portfolio Companies", bucketCount("Portfolio Companies"), state.bucket === "Portfolio Companies" && !state.sector, () => {
    setState({ bucket: "Portfolio Companies", sector: null, subTopic: null, tag: null });
  }));
  const portfolioSub = document.createElement("div");
  portfolioSub.className = "nav-sub";
  TAXONOMY.sectors.forEach(sec => {
    portfolioSub.appendChild(navItem(sec, sectorCount("Portfolio Companies", sec), state.bucket === "Portfolio Companies" && state.sector === sec, () => {
      setState({ bucket: "Portfolio Companies", sector: sec, subTopic: null, tag: null });
    }, true));
  });
  nav.appendChild(portfolioSub);

  // Cross-cutting themes
  const themesWrap = document.getElementById("themeChips");
  themesWrap.innerHTML = "";
  TAXONOMY.crossCuttingThemes.forEach(theme => {
    const chip = document.createElement("span");
    chip.className = "tag" + (state.tag && state.tag.toLowerCase() === theme.toLowerCase() ? " active-filter" : "");
    chip.textContent = theme;
    chip.onclick = () => {
      if (state.tag && state.tag.toLowerCase() === theme.toLowerCase()) {
        setState({ tag: null });
      } else {
        setState({ tag: theme, bucket: "All", sector: null, subTopic: null });
      }
    };
    themesWrap.appendChild(chip);
  });
}

function navItem(label, count, active, onClick, small) {
  const el = document.createElement("div");
  el.className = "nav-item" + (active ? " active" : "");
  el.innerHTML = `<span>${label}</span><span class="count">${count}</span>`;
  el.onclick = onClick;
  return el;
}
function divider() {
  const d = document.createElement("div");
  d.className = "nav-divider";
  return d;
}

function setState(patch) {
  Object.assign(state, patch);
  renderSidebar();
  renderMain();
}

// ---------------- Main content ----------------

function renderMain() {
  const main = document.getElementById("content");
  main.innerHTML = "";

  const filtered = mergedArticles().filter(matchesFilters);

  const title = document.createElement("div");
  let heading = state.tag ? `Theme: ${state.tag}` : (state.bucket === "All" ? "All Articles" : state.bucket);
  if (state.sector) heading += ` — ${state.sector}`;
  if (state.subTopic) heading += ` — ${state.subTopic}`;
  title.innerHTML = `<h1 class="section-title">${heading}</h1><p class="section-desc">${filtered.length} article${filtered.length === 1 ? "" : "s"}</p>`;
  main.appendChild(title);

  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No articles here yet. Paste a Slack link to Claude to add one.";
    main.appendChild(empty);
    return;
  }

  // Grouping: when viewing "All" or a bucket without a narrower filter, group by
  // the natural subdivision of that bucket for readability.
  const groups = groupArticles(filtered);
  groups.forEach(([label, items]) => {
    if (label) {
      const gh = document.createElement("div");
      gh.className = "group-heading";
      gh.innerHTML = `<span>${label}</span><span class="line"></span>`;
      main.appendChild(gh);
    }
    items.forEach(a => main.appendChild(renderCard(a)));
  });
}

function groupArticles(items) {
  // Explicit subTopic/sector filter already narrowed things down -> no sub-grouping needed.
  if (state.subTopic || state.sector || state.tag || state.query) {
    return [[null, items]];
  }
  if (state.bucket === "Markets") {
    return TAXONOMY.subTopics["Markets"]
      .map(st => [st, items.filter(a => a.subTopic === st)])
      .concat([["Other", items.filter(a => !TAXONOMY.subTopics["Markets"].includes(a.subTopic))]])
      .filter(([, arr]) => arr.length);
  }
  if (state.bucket === "Companies") {
    return TAXONOMY.sectors
      .map(sec => [sec, items.filter(a => a.sector === sec)])
      .concat([["Other / Unspecified Sector", items.filter(a => !TAXONOMY.sectors.includes(a.sector))]])
      .filter(([, arr]) => arr.length);
  }
  if (state.bucket === "Company Sectors" || state.bucket === "Portfolio Companies") {
    return TAXONOMY.sectors
      .map(sec => [sec, items.filter(a => a.sector === sec)])
      .filter(([, arr]) => arr.length);
  }
  if (state.bucket === "All") {
    return TAXONOMY.primaryBuckets
      .map(b => [b, items.filter(a => a.primaryBucket === b)])
      .filter(([, arr]) => arr.length);
  }
  return [[null, items]];
}

function renderCard(a) {
  const card = document.createElement("div");
  card.className = "card" + (state.expanded.has(a.id) ? " expanded" : "");

  const head = document.createElement("div");
  head.className = "card-head";
  head.onclick = () => {
    state.expanded.has(a.id) ? state.expanded.delete(a.id) : state.expanded.add(a.id);
    renderMain();
  };

  const left = document.createElement("div");
  const badges = [`<span class="badge badge-bucket">${a.primaryBucket}</span>`];
  if (a.sector) badges.push(`<span class="badge badge-sector">${a.sector}</span>`);
  if (a.primaryBucket === "Inbox") badges.push(`<span class="badge badge-inbox">needs review</span>`);
  left.innerHTML = `
    <div class="card-title-row">
      <a class="card-title" href="${escapeAttr(a.url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${escapeHtml(a.title)}</a>
      ${badges.join(" ")}
    </div>
    <div class="card-meta">${escapeHtml(a.source || "")} · ${escapeHtml(a.slackChannel || "")} · shared by ${escapeHtml(a.sender || "")} · ${escapeHtml(a.sharedAt || a.dateAdded || "")}</div>
  `;
  const chevron = document.createElement("div");
  chevron.className = "card-chevron";
  chevron.textContent = state.expanded.has(a.id) ? "▲" : "▼";

  head.appendChild(left);
  head.appendChild(chevron);
  card.appendChild(head);

  if (a.tags && a.tags.length) {
    const tagRow = document.createElement("div");
    tagRow.className = "tag-row";
    a.tags.forEach(t => {
      const chip = document.createElement("span");
      chip.className = "tag" + (state.tag && state.tag.toLowerCase() === t.toLowerCase() ? " active-filter" : "");
      chip.textContent = t;
      chip.onclick = (e) => {
        e.stopPropagation();
        setState({ tag: state.tag && state.tag.toLowerCase() === t.toLowerCase() ? null : t, bucket: "All", sector: null, subTopic: null });
      };
      tagRow.appendChild(chip);
    });
    card.appendChild(tagRow);
  }

  const body = document.createElement("div");
  body.className = "card-body";

  if (a.whyShared) body.appendChild(field("Why it was shared", `<div class="field-value">${escapeHtml(a.whyShared)}</div>`));
  if (a.summary) body.appendChild(field("Summary", `<div class="field-value">${escapeHtml(a.summary)}</div>`));
  if (a.keyTakeaways && a.keyTakeaways.length) body.appendChild(field("Key takeaways", listHtml(a.keyTakeaways)));
  if (a.openQuestions && a.openQuestions.length) body.appendChild(field("Open questions", listHtml(a.openQuestions)));

  if (a.needsReviewReason) {
    const nr = document.createElement("div");
    nr.className = "needs-review";
    nr.textContent = "Needs review: " + a.needsReviewReason;
    body.appendChild(nr);
  }

  if (a.relatedArticleIds && a.relatedArticleIds.length) {
    const related = document.createElement("div");
    related.className = "field";
    const relLabel = document.createElement("div");
    relLabel.className = "field-label";
    relLabel.textContent = "Related articles";
    related.appendChild(relLabel);
    a.relatedArticleIds.forEach(rid => {
      const other = ARTICLES.find(x => x.id === rid);
      if (!other) return;
      const chip = document.createElement("span");
      chip.className = "related-chip";
      chip.textContent = other.title;
      chip.onclick = (e) => {
        e.stopPropagation();
        state.expanded.add(other.id);
        setState({ bucket: "All", sector: null, subTopic: null, tag: null, query: "" });
        document.getElementById("searchInput").value = "";
      };
      related.appendChild(chip);
    });
    body.appendChild(related);
  }

  const notesField = document.createElement("div");
  notesField.className = "field";
  notesField.innerHTML = `<div class="field-label">My notes</div>`;
  const textarea = document.createElement("textarea");
  textarea.className = "notes-textarea";
  textarea.placeholder = "What did you take away from this? Anything to revisit?";
  textarea.value = a.myNotes || "";
  textarea.addEventListener("input", () => saveNoteOverlay(a.id, textarea.value));
  notesField.appendChild(textarea);
  body.appendChild(notesField);

  card.appendChild(body);
  return card;
}

function field(label, innerHtml) {
  const wrap = document.createElement("div");
  wrap.className = "field";
  wrap.innerHTML = `<div class="field-label">${label}</div>${innerHtml}`;
  return wrap;
}
function listHtml(items) {
  return `<ul class="field-value">${items.map(i => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
}
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

// ---------------- Export / dirty state ----------------

function renderDirtyIndicator() {
  const overlay = loadNotesOverlay();
  const dirtyCount = Object.keys(overlay).length;
  const btn = document.getElementById("exportBtn");
  btn.innerHTML = dirtyCount ? `Export my notes<span class="dirty-dot"></span>` : `Export my notes`;
}

function openExportModal() {
  const overlay = loadNotesOverlay();
  const entries = Object.entries(overlay).filter(([, v]) => v && v.trim().length);
  const lines = entries.map(([id, notes]) => `  { id: ${JSON.stringify(id)}, myNotes: ${JSON.stringify(notes)} },`);
  const snippet = entries.length
    ? `// Paste this to Claude and ask it to merge these into data/articles.js\nconst NOTES_UPDATES = [\n${lines.join("\n")}\n];`
    : "// No notes have been added yet. Type in a \"My notes\" box on any article, then export.";
  document.getElementById("exportTextarea").value = snippet;
  document.getElementById("exportModal").classList.add("open");
}
function closeExportModal() {
  document.getElementById("exportModal").classList.remove("open");
}

// ---------------- Init ----------------

document.addEventListener("DOMContentLoaded", () => {
  renderSidebar();
  renderMain();
  renderDirtyIndicator();

  document.getElementById("searchInput").addEventListener("input", (e) => {
    setState({ query: e.target.value });
  });
  document.getElementById("exportBtn").addEventListener("click", openExportModal);
  document.getElementById("closeModalBtn").addEventListener("click", closeExportModal);
  document.getElementById("copyModalBtn").addEventListener("click", () => {
    const ta = document.getElementById("exportTextarea");
    ta.select();
    document.execCommand("copy");
    const btn = document.getElementById("copyModalBtn");
    const orig = btn.textContent;
    btn.textContent = "Copied";
    setTimeout(() => btn.textContent = orig, 1200);
  });
});
