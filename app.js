// SVarticles front end. Reads TAXONOMY + ARTICLES from data/articles.js.
//
// Two localStorage overlays sit on top of the repo's data/articles.js:
//  - notes overlay: personal "My notes" text typed into any article
//  - pending queue: links added via "+ Add Article" that Claude hasn't
//    classified yet (rendered as Inbox cards until synced)
// Neither is written back to the repo automatically. Click "Sync with
// Claude" to get a paste-ready payload, hand it to Claude in a chat, and it
// will fetch/classify the links and merge everything into data/articles.js.

const NOTES_KEY = "sva_notes_overlay_v1";
const PENDING_KEY = "sva_pending_queue_v1";

const CATEGORY_META = [
  { bucket: "Markets", tagline: "Macro, rates, public markets, and sector-wide trends.", breakdown: "subTopic" },
  { bucket: "Companies", tagline: "Prospective / private companies you're tracking.", breakdown: "sector" },
  { bucket: "Company Sectors", tagline: "Industry-level trends across Workforce, Healthcare, Fintech.", breakdown: "sector" },
  { bucket: "Portfolio Companies", tagline: "Updates from your current portfolio companies.", breakdown: "sector" },
];

const state = {
  view: "home",          // "home" | "section"
  bucket: "All",         // "All" | one of TAXONOMY.primaryBuckets
  sector: null,           // "Workforce" | "Healthcare" | "Fintech" | null
  subTopic: null,          // string | null
  tag: null,               // string | null (cross-cutting theme or any tag)
  query: "",
  expanded: new Set(),
};

// ---------------- Storage ----------------

function loadNotesOverlay() {
  try { return JSON.parse(localStorage.getItem(NOTES_KEY) || "{}"); }
  catch { return {}; }
}
function saveNoteOverlay(id, text) {
  const overlay = loadNotesOverlay();
  overlay[id] = text;
  localStorage.setItem(NOTES_KEY, JSON.stringify(overlay));
  renderSyncIndicator();
}

function loadPendingQueue() {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) || "[]"); }
  catch { return []; }
}
function savePendingQueue(list) {
  localStorage.setItem(PENDING_KEY, JSON.stringify(list));
  renderSyncIndicator();
}
function addPendingArticle({ url, sender, channel, quickNote }) {
  const today = new Date().toISOString().slice(0, 10);
  const list = loadPendingQueue();
  const entry = {
    id: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    url, sender: sender || "", channel: channel || "", quickNote: quickNote || "",
    dateAdded: today,
  };
  list.unshift(entry);
  savePendingQueue(list);
  return entry;
}
function removePendingArticle(id) {
  savePendingQueue(loadPendingQueue().filter(p => p.id !== id));
  renderSidebar();
  renderMain();
}

function pendingToArticle(p, overlay) {
  return {
    id: p.id,
    title: p.url,
    url: p.url,
    source: "",
    slackChannel: p.channel,
    sender: p.sender,
    sharedAt: p.dateAdded,
    whyShared: p.quickNote,
    primaryBucket: "Inbox",
    subTopic: "",
    sector: null,
    companyName: "",
    tags: [],
    summary: "",
    keyTakeaways: [],
    openQuestions: [],
    myNotes: overlay[p.id] || "",
    relatedArticleIds: [],
    needsReviewReason: "Added via + Add Article — ask Claude to fetch this link, classify it, and write the full record in data/articles.js.",
    dateAdded: p.dateAdded,
    _pending: true,
  };
}

function mergedArticles() {
  const overlay = loadNotesOverlay();
  const base = ARTICLES.map(a => overlay[a.id] !== undefined ? { ...a, myNotes: overlay[a.id] } : a);
  const pending = loadPendingQueue().map(p => pendingToArticle(p, overlay));
  return pending.concat(base);
}

function isUnread(a) {
  return !a._pending && !(a.myNotes && a.myNotes.trim().length);
}

// ---------------- Filtering ----------------

function matchesFilters(a) {
  if (state.bucket !== "All" && a.primaryBucket !== state.bucket) return false;
  if (state.sector && a.sector !== state.sector) return false;
  if (state.subTopic && a.subTopic !== state.subTopic) return false;
  if (state.tag) {
    const inTags = (a.tags || []).map(t => t.toLowerCase()).includes(state.tag.toLowerCase());
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
function unreadCount(bucket) {
  return countFor(a => a.primaryBucket === bucket && isUnread(a));
}

// ---------------- Sidebar ----------------

function renderSidebar() {
  const nav = document.getElementById("nav");
  nav.innerHTML = "";

  nav.appendChild(navItem("Home", null, state.view === "home", () => goHome()));
  nav.appendChild(navItem("All Articles", mergedArticles().length, state.view === "section" && state.bucket === "All" && !state.tag, () => {
    setState({ view: "section", bucket: "All", sector: null, subTopic: null, tag: null });
  }));

  const inboxCount = bucketCount("Inbox");
  nav.appendChild(navItem("Inbox", inboxCount, state.view === "section" && state.bucket === "Inbox", () => {
    setState({ view: "section", bucket: "Inbox", sector: null, subTopic: null, tag: null });
  }));

  nav.appendChild(divider());

  // Markets: subgroups by subTopic
  nav.appendChild(navItem("Markets", bucketCount("Markets"), state.view === "section" && state.bucket === "Markets" && !state.subTopic, () => {
    setState({ view: "section", bucket: "Markets", sector: null, subTopic: null, tag: null });
  }));
  const marketsSub = document.createElement("div");
  marketsSub.className = "nav-sub";
  TAXONOMY.subTopics["Markets"].forEach(st => {
    marketsSub.appendChild(navItem(st, subTopicCount("Markets", st), state.view === "section" && state.bucket === "Markets" && state.subTopic === st, () => {
      setState({ view: "section", bucket: "Markets", sector: null, subTopic: st, tag: null });
    }, true));
  });
  nav.appendChild(marketsSub);

  // Companies: subgroups by sector
  nav.appendChild(navItem("Companies", bucketCount("Companies"), state.view === "section" && state.bucket === "Companies" && !state.sector, () => {
    setState({ view: "section", bucket: "Companies", sector: null, subTopic: null, tag: null });
  }));
  const companiesSub = document.createElement("div");
  companiesSub.className = "nav-sub";
  TAXONOMY.sectors.forEach(sec => {
    companiesSub.appendChild(navItem(sec, sectorCount("Companies", sec), state.view === "section" && state.bucket === "Companies" && state.sector === sec, () => {
      setState({ view: "section", bucket: "Companies", sector: sec, subTopic: null, tag: null });
    }, true));
  });
  nav.appendChild(companiesSub);

  // Company Sectors
  nav.appendChild(navItem("Company Sectors", bucketCount("Company Sectors"), state.view === "section" && state.bucket === "Company Sectors" && !state.sector, () => {
    setState({ view: "section", bucket: "Company Sectors", sector: null, subTopic: null, tag: null });
  }));
  const sectorsSub = document.createElement("div");
  sectorsSub.className = "nav-sub";
  TAXONOMY.sectors.forEach(sec => {
    sectorsSub.appendChild(navItem(sec, sectorCount("Company Sectors", sec), state.view === "section" && state.bucket === "Company Sectors" && state.sector === sec, () => {
      setState({ view: "section", bucket: "Company Sectors", sector: sec, subTopic: null, tag: null });
    }, true));
  });
  nav.appendChild(sectorsSub);

  // Portfolio Companies
  nav.appendChild(navItem("Portfolio Companies", bucketCount("Portfolio Companies"), state.view === "section" && state.bucket === "Portfolio Companies" && !state.sector, () => {
    setState({ view: "section", bucket: "Portfolio Companies", sector: null, subTopic: null, tag: null });
  }));
  const portfolioSub = document.createElement("div");
  portfolioSub.className = "nav-sub";
  TAXONOMY.sectors.forEach(sec => {
    portfolioSub.appendChild(navItem(sec, sectorCount("Portfolio Companies", sec), state.view === "section" && state.bucket === "Portfolio Companies" && state.sector === sec, () => {
      setState({ view: "section", bucket: "Portfolio Companies", sector: sec, subTopic: null, tag: null });
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
        setState({ view: "section", tag: theme, bucket: "All", sector: null, subTopic: null });
      }
    };
    themesWrap.appendChild(chip);
  });
}

function navItem(label, count, active, onClick, small) {
  const el = document.createElement("div");
  el.className = "nav-item" + (active ? " active" : "");
  el.innerHTML = `<span>${label}</span>${count === null ? "" : `<span class="count">${count}</span>`}`;
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

function goHome() {
  setState({ view: "home", bucket: "All", sector: null, subTopic: null, tag: null, query: "" });
  document.getElementById("searchInput").value = "";
}

// ---------------- Main content ----------------

function renderMain() {
  const main = document.getElementById("content");
  main.innerHTML = "";
  if (state.view === "home") {
    renderHome(main);
  } else {
    renderSection(main);
  }
}

function renderHome(main) {
  const totalArticles = mergedArticles().length;
  const inboxCount = bucketCount("Inbox");

  const hero = document.createElement("div");
  hero.className = "hero";
  hero.innerHTML = `
    <div>
      <h1 class="hero-title">Research feed</h1>
      <p class="hero-sub">${totalArticles} article${totalArticles === 1 ? "" : "s"} tracked${inboxCount ? ` · ${inboxCount} waiting on classification` : ""}</p>
    </div>
  `;
  const addBtn = bigAddButton();
  hero.appendChild(addBtn);
  main.appendChild(hero);

  if (inboxCount > 0) {
    const strip = document.createElement("div");
    strip.className = "inbox-strip";
    strip.innerHTML = `
      <div>
        <div class="inbox-strip-title">Inbox — ${inboxCount} item${inboxCount === 1 ? "" : "s"} need${inboxCount === 1 ? "s" : ""} classification</div>
        <div class="inbox-strip-sub">Newly added links, or articles Claude wasn't confident classifying yet.</div>
      </div>
      <button class="btn">Review Inbox →</button>
    `;
    strip.querySelector("button").onclick = () => setState({ view: "section", bucket: "Inbox", sector: null, subTopic: null, tag: null });
    main.appendChild(strip);
  }

  const grid = document.createElement("div");
  grid.className = "tile-grid";
  CATEGORY_META.forEach(meta => grid.appendChild(renderTile(meta)));
  main.appendChild(grid);
}

function renderTile(meta) {
  const { bucket, tagline, breakdown } = meta;
  const count = bucketCount(bucket);
  const unread = unreadCount(bucket);

  const tile = document.createElement("div");
  tile.className = "tile";
  tile.onclick = () => setState({ view: "section", bucket, sector: null, subTopic: null, tag: null });

  const rows = breakdown === "subTopic"
    ? TAXONOMY.subTopics[bucket].map(st => [st, subTopicCount(bucket, st)])
    : TAXONOMY.sectors.map(sec => [sec, sectorCount(bucket, sec)]);

  tile.innerHTML = `
    <div class="tile-head">
      <div class="tile-name">${bucket}</div>
      <div class="tile-count">${count}</div>
    </div>
    <div class="tile-tagline">${tagline}</div>
    <div class="tile-breakdown">
      ${rows.map(([label, n]) => `<div class="tile-row"><span>${label}</span><span class="tile-row-count">${n}</span></div>`).join("")}
    </div>
    ${unread ? `<div class="tile-unread">${unread} to catch up on</div>` : ""}
  `;
  return tile;
}

function renderSection(main) {
  const filtered = mergedArticles().filter(matchesFilters);

  const titleWrap = document.createElement("div");
  const back = `<span class="back-link" id="backHome">← Home</span>`;
  let heading = state.tag ? `Theme: ${state.tag}` : (state.bucket === "All" ? "All Articles" : state.bucket);
  if (state.sector) heading += ` — ${state.sector}`;
  if (state.subTopic) heading += ` — ${state.subTopic}`;
  titleWrap.innerHTML = `
    ${back}
    <h1 class="section-title">${heading}</h1>
    <p class="section-desc">${filtered.length} article${filtered.length === 1 ? "" : "s"}</p>
  `;
  main.appendChild(titleWrap);
  document.getElementById("backHome").onclick = goHome;

  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No articles here yet. Click “+ Add Article” to drop in a link.";
    main.appendChild(empty);
    return;
  }

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
  if (a._pending) badges.push(`<span class="badge badge-pending">quick add — pending</span>`);
  else if (a.primaryBucket === "Inbox") badges.push(`<span class="badge badge-inbox">needs review</span>`);
  if (isUnread(a) && a.primaryBucket !== "Inbox") badges.push(`<span class="badge badge-unread">unread</span>`);
  left.innerHTML = `
    <div class="card-title-row">
      <a class="card-title" href="${escapeAttr(a.url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${escapeHtml(a.title)}</a>
      ${badges.join(" ")}
    </div>
    <div class="card-meta">${escapeHtml(a.source || "")}${a.source ? " · " : ""}${escapeHtml(a.slackChannel || "")}${a.slackChannel ? " · " : ""}shared by ${escapeHtml(a.sender || "—")} · ${escapeHtml(a.sharedAt || a.dateAdded || "")}</div>
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
        setState({ view: "section", tag: state.tag && state.tag.toLowerCase() === t.toLowerCase() ? null : t, bucket: "All", sector: null, subTopic: null });
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
    nr.textContent = (a._pending ? "" : "Needs review: ") + a.needsReviewReason;
    body.appendChild(nr);
  }

  if (a._pending) {
    const removeBtn = document.createElement("button");
    removeBtn.className = "btn remove-pending-btn";
    removeBtn.textContent = "Remove from queue";
    removeBtn.onclick = (e) => {
      e.stopPropagation();
      removePendingArticle(a.id);
    };
    body.appendChild(removeBtn);
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
        setState({ view: "section", bucket: "All", sector: null, subTopic: null, tag: null, query: "" });
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

// ---------------- Add Article ----------------

function bigAddButton() {
  const btn = document.createElement("button");
  btn.className = "btn add-article-btn add-article-btn-hero";
  btn.innerHTML = `<span class="plus">+</span> Add Article`;
  btn.onclick = openAddModal;
  return btn;
}

function openAddModal() {
  document.getElementById("addUrlInput").value = "";
  document.getElementById("addSenderInput").value = "";
  document.getElementById("addChannelInput").value = "";
  document.getElementById("addNoteInput").value = "";
  document.getElementById("addDateDisplay").textContent = new Date().toISOString().slice(0, 10);
  document.getElementById("addModal").classList.add("open");
  setTimeout(() => document.getElementById("addUrlInput").focus(), 50);
}
function closeAddModal() {
  document.getElementById("addModal").classList.remove("open");
}
function submitAddModal() {
  const urlInput = document.getElementById("addUrlInput");
  let url = urlInput.value.trim();
  if (!url) { urlInput.focus(); return; }
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;

  addPendingArticle({
    url,
    sender: document.getElementById("addSenderInput").value.trim(),
    channel: document.getElementById("addChannelInput").value.trim(),
    quickNote: document.getElementById("addNoteInput").value.trim(),
  });

  closeAddModal();
  setState({ view: "section", bucket: "Inbox", sector: null, subTopic: null, tag: null });
}

// ---------------- Sync with Claude ----------------

function renderSyncIndicator() {
  const notesCount = Object.values(loadNotesOverlay()).filter(v => v && v.trim().length).length;
  const pendingCount = loadPendingQueue().length;
  const btn = document.getElementById("syncBtn");
  const dirty = notesCount + pendingCount > 0;
  btn.innerHTML = dirty ? `Sync with Claude<span class="dirty-dot"></span>` : `Sync with Claude`;
}

function openSyncModal() {
  const overlay = loadNotesOverlay();
  const pending = loadPendingQueue();
  const pendingIds = new Set(pending.map(p => p.id));

  const noteEntries = Object.entries(overlay).filter(([id, v]) => v && v.trim().length && !pendingIds.has(id));

  const parts = [];
  if (pending.length) {
    const lines = pending.map(p => {
      const note = overlay[p.id] && overlay[p.id].trim().length ? overlay[p.id] : p.quickNote;
      return `  { url: ${JSON.stringify(p.url)}, sender: ${JSON.stringify(p.sender)}, channel: ${JSON.stringify(p.channel)}, quickNote: ${JSON.stringify(note)}, dateAdded: ${JSON.stringify(p.dateAdded)} },`;
    });
    parts.push(`// New links — fetch each URL, classify per CLAUDE.md, and add full records to data/articles.js\nconst NEW_LINKS = [\n${lines.join("\n")}\n];`);
  }
  if (noteEntries.length) {
    const lines = noteEntries.map(([id, notes]) => `  { id: ${JSON.stringify(id)}, myNotes: ${JSON.stringify(notes)} },`);
    parts.push(`// Note updates — merge into existing articles' myNotes by id\nconst NOTES_UPDATES = [\n${lines.join("\n")}\n];`);
  }
  const snippet = parts.length
    ? parts.join("\n\n")
    : "// Nothing to sync yet. Add a link with “+ Add Article” or write a note, then sync.";

  document.getElementById("syncTextarea").value = snippet;
  document.getElementById("clearPendingBtn").style.display = pending.length ? "inline-block" : "none";
  document.getElementById("syncModal").classList.add("open");
}
function closeSyncModal() {
  document.getElementById("syncModal").classList.remove("open");
}
function clearPendingQueue() {
  if (!confirm("Clear the pending queue? Only do this after Claude has added these links to data/articles.js.")) return;
  savePendingQueue([]);
  renderSidebar();
  renderMain();
  closeSyncModal();
}

// ---------------- Init ----------------

document.addEventListener("DOMContentLoaded", () => {
  renderSidebar();
  renderMain();
  renderSyncIndicator();

  document.getElementById("searchInput").addEventListener("input", (e) => {
    setState({ view: "section", bucket: state.bucket === "Inbox" || state.bucket === "All" ? "All" : state.bucket, query: e.target.value });
  });
  document.getElementById("brand").addEventListener("click", goHome);

  document.getElementById("addArticleBtn").addEventListener("click", openAddModal);
  document.getElementById("closeAddModalBtn").addEventListener("click", closeAddModal);
  document.getElementById("submitAddModalBtn").addEventListener("click", submitAddModal);
  document.getElementById("addUrlInput").addEventListener("keydown", (e) => { if (e.key === "Enter") submitAddModal(); });

  document.getElementById("syncBtn").addEventListener("click", openSyncModal);
  document.getElementById("closeSyncModalBtn").addEventListener("click", closeSyncModal);
  document.getElementById("clearPendingBtn").addEventListener("click", clearPendingQueue);
  document.getElementById("copySyncBtn").addEventListener("click", () => {
    const ta = document.getElementById("syncTextarea");
    ta.select();
    document.execCommand("copy");
    const btn = document.getElementById("copySyncBtn");
    const orig = btn.textContent;
    btn.textContent = "Copied";
    setTimeout(() => btn.textContent = orig, 1200);
  });
});
