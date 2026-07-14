// SVarticles front end. Reads TAXONOMY + ARTICLES from data/articles.js.
//
// Two localStorage overlays sit on top of the repo's data/articles.js:
//  - notes overlay: personal "My notes" text typed into any article
//  - pending queue: links added via "+ Add Article" that Claude hasn't
//    written up yet (rendered inline in whichever section you assigned them
//    to, tagged "awaiting summary")
// Neither is written back to the repo automatically. Click "Sync with
// Claude" to get a paste-ready payload, hand it to Claude in a chat, and it
// will fetch/classify the links and merge everything into data/articles.js.

const NOTES_KEY = "sva_notes_overlay_v1";
const PENDING_KEY = "sva_pending_queue_v2";
const SIDEBAR_KEY = "sva_sidebar_collapsed_v1";

const CATEGORY_META = [
  { bucket: "General Market", abbr: "GM", tagline: "Macro, public markets, and broad industry trends." },
  { bucket: "Enterprise Updates", abbr: "EU", tagline: "Industry-level updates across Workforce, Healthcare, Fintech." },
  { bucket: "Portfolio Companies", abbr: "PC", tagline: "Updates from your current portfolio companies." },
  { bucket: "Potential Companies", abbr: "PO", tagline: "Prospective / private companies you're tracking." },
];

const state = {
  view: "home",          // "home" | "section"
  bucket: "All",         // "All" | one of TAXONOMY.primaryBuckets
  sector: null,           // "Workforce" | "Healthcare" | "Fintech" | null
  tag: null,               // string | null (cross-cutting theme or any tag)
  query: "",
  pendingOnly: false,
  expanded: new Set(),
  speech: { queue: [], index: -1, playing: false, paused: false },
};

// ---------------- Read aloud (Web Speech API) ----------------
// Fully client-side text-to-speech so articles can be listened to hands-free
// (e.g. while driving). No network/API calls involved. Each queue entry is
// { article, mode } where mode is "summary" or "full".

const speechSupported = typeof window !== "undefined" && "speechSynthesis" in window;
let speechToken = 0;

function speechTextFor(article, mode) {
  if (mode === "full" && article.fullText && article.fullText.trim().length) {
    return `${article.title}. ${article.fullText}`;
  }
  const parts = [article.title];
  if (article.source) parts.push(`From ${article.source}.`);
  parts.push(article.summary || "No summary written yet for this one.");
  if (article.keyTakeaways && article.keyTakeaways.length) {
    parts.push("Key takeaways: " + article.keyTakeaways.join(". ") + ".");
  }
  if (article.openQuestions && article.openQuestions.length) {
    parts.push("Open questions: " + article.openQuestions.join(". ") + ".");
  }
  return parts.join(" ");
}

function playArticle(article, mode) {
  if (!speechSupported) return;
  state.speech = { queue: [{ article, mode }], index: 0, playing: false, paused: false };
  speakCurrent();
}

function playSection(articles) {
  if (!speechSupported) return;
  const queue = articles
    .filter(a => a.summary && a.summary.trim().length)
    .map(a => ({ article: a, mode: "summary" }));
  if (!queue.length) return;
  state.speech = { queue, index: 0, playing: false, paused: false };
  speakCurrent();
}

function speakCurrent() {
  const s = state.speech;
  if (s.index < 0 || s.index >= s.queue.length) { stopPlayback(); return; }
  const token = ++speechToken;
  const { article, mode } = s.queue[s.index];
  // Reflect the requested state immediately rather than waiting on the
  // browser's onstart event, which can be slow or (on some platforms/voices)
  // never fire at all — the UI shouldn't look inert while audio is loading.
  s.playing = true;
  s.paused = false;
  delete s.error;
  renderMiniPlayer();
  renderMain();
  let startedOk = false;
  const utter = new SpeechSynthesisUtterance(speechTextFor(article, mode));
  utter.rate = 1;
  utter.onstart = () => {
    if (token !== speechToken) return;
    startedOk = true;
    s.playing = true;
    s.paused = false;
    renderMiniPlayer();
    renderMain();
  };
  utter.onend = () => {
    if (token !== speechToken) return;
    s.index++;
    if (s.index < s.queue.length) speakCurrent(); else stopPlayback();
  };
  utter.onerror = (e) => {
    if (token !== speechToken) return;
    // "interrupted"/"canceled" happen when we ourselves call cancel() below
    // for the next track — that's not a failure, the token guard already
    // filters stray callbacks from that. A hard failure is one where the
    // browser never actually started speaking at all (e.g. no TTS voices
    // installed) — surface that instead of silently closing the player.
    if (!startedOk && e.error !== "interrupted" && e.error !== "canceled") {
      s.error = "Couldn't play audio — this browser/device may not have text-to-speech voices installed.";
      s.playing = false;
      renderMiniPlayer();
      renderMain();
      return;
    }
    s.index++;
    if (s.index < s.queue.length) speakCurrent(); else stopPlayback();
  };
  speechSynthesis.cancel();
  speechSynthesis.speak(utter);
}

function togglePausePlayback() {
  if (!speechSupported) return;
  const s = state.speech;
  if (s.paused) { speechSynthesis.resume(); s.paused = false; }
  else { speechSynthesis.pause(); s.paused = true; }
  renderMiniPlayer();
}

function skipPlayback() {
  const s = state.speech;
  if (s.index < s.queue.length - 1) { s.index++; speakCurrent(); }
  else stopPlayback();
}

function stopPlayback() {
  speechToken++;
  if (speechSupported) speechSynthesis.cancel();
  state.speech = { queue: [], index: -1, playing: false, paused: false };
  renderMiniPlayer();
  renderMain();
}

function isPlayingArticle(a, mode) {
  const s = state.speech;
  if (s.index < 0 || !s.queue[s.index]) return false;
  const current = s.queue[s.index];
  return current.article.id === a.id && (mode === undefined || current.mode === mode);
}

function renderMiniPlayer() {
  const bar = document.getElementById("miniPlayer");
  if (!bar) return;
  const s = state.speech;
  if (s.index < 0 || !s.queue[s.index]) {
    bar.classList.remove("open");
    return;
  }
  const current = s.queue[s.index];
  bar.classList.add("open");
  bar.classList.toggle("error", !!s.error);
  document.getElementById("miniPlayerTitle").textContent = current.article.title;
  document.getElementById("miniPlayerProgress").textContent = s.error
    ? s.error
    : (s.queue.length > 1 ? `Article ${s.index + 1} of ${s.queue.length}` : (current.mode === "full" ? "Listening — full article" : "Listening — summary"));
  document.getElementById("miniPlayerPauseBtn").style.display = s.error ? "none" : "";
  document.getElementById("miniPlayerSkipBtn").style.display = s.error ? "none" : "";
  document.getElementById("miniPlayerPauseBtn").textContent = s.paused ? "▶" : "⏸";
}

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
function addPendingArticle({ url, bucket, sector, sender, channel, quickNote }) {
  const today = new Date().toISOString().slice(0, 10);
  const list = loadPendingQueue();
  const entry = {
    id: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    url, bucket, sector: sector || null,
    sender: sender || "", channel: channel || "", quickNote: quickNote || "",
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
    primaryBucket: p.bucket,
    sector: p.sector || null,
    companyName: "",
    tags: [],
    imageUrl: "",
    summary: "",
    fullText: "",
    keyTakeaways: [],
    openQuestions: [],
    myNotes: overlay[p.id] || "",
    relatedArticleIds: [],
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
  if (state.pendingOnly && !a._pending) return false;
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
function sectorCount(bucket, sector) {
  return countFor(a => a.primaryBucket === bucket && a.sector === sector);
}
function unreadCount(bucket) {
  return countFor(a => a.primaryBucket === bucket && isUnread(a));
}
function pendingCountTotal() {
  return countFor(a => a._pending);
}

// ---------------- Sidebar ----------------

function isSidebarCollapsed() {
  return localStorage.getItem(SIDEBAR_KEY) === "1";
}
function setSidebarCollapsed(collapsed) {
  localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0");
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  const btn = document.getElementById("sidebarToggleBtn");
  if (btn) {
    btn.textContent = collapsed ? "»" : "«";
    btn.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
  }
}

function renderSidebar() {
  const nav = document.getElementById("nav");
  nav.innerHTML = "";

  nav.appendChild(navItem("Home", "🏠", null, state.view === "home", () => goHome()));
  nav.appendChild(navItem("All Articles", "All", mergedArticles().length, state.view === "section" && state.bucket === "All" && !state.tag && !state.pendingOnly, () => {
    setState({ view: "section", bucket: "All", sector: null, tag: null, pendingOnly: false });
  }));

  nav.appendChild(navItem("Weekly Roundup", "WR", ROUNDUPS.length, state.view === "roundups", () => {
    setState({ view: "roundups" });
  }));

  nav.appendChild(divider());

  CATEGORY_META.forEach(meta => {
    nav.appendChild(navItem(meta.bucket, meta.abbr, bucketCount(meta.bucket), state.view === "section" && state.bucket === meta.bucket, () => {
      setState({ view: "section", bucket: meta.bucket, sector: null, tag: null, pendingOnly: false });
    }));
  });

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
        setState({ view: "section", tag: theme, bucket: "All", sector: null, pendingOnly: false });
      }
    };
    themesWrap.appendChild(chip);
  });
}

function navItem(label, abbr, count, active, onClick) {
  const el = document.createElement("div");
  el.className = "nav-item" + (active ? " active" : "");
  el.innerHTML = `
    <span class="nav-abbr">${abbr}</span>
    <span class="nav-label">${label}</span>
    ${count === null ? "" : `<span class="count nav-label">${count}</span>`}
  `;
  el.title = label;
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
  setState({ view: "home", bucket: "All", sector: null, tag: null, query: "", pendingOnly: false });
  document.getElementById("searchInput").value = "";
}

// ---------------- Main content ----------------

function renderMain() {
  const main = document.getElementById("content");
  main.innerHTML = "";
  if (state.view === "home") {
    renderHome(main);
  } else if (state.view === "roundups") {
    renderRoundupsView(main);
  } else {
    renderSection(main);
  }
}

function renderHome(main) {
  const totalArticles = mergedArticles().length;
  const pendingCount = pendingCountTotal();

  const hero = document.createElement("div");
  hero.className = "hero";
  hero.innerHTML = `
    <div>
      <h1 class="hero-title">Research feed</h1>
      <p class="hero-sub">${totalArticles} article${totalArticles === 1 ? "" : "s"} tracked${pendingCount ? ` · ${pendingCount} awaiting summary` : ""}</p>
    </div>
  `;
  const addBtn = bigAddButton();
  hero.appendChild(addBtn);
  main.appendChild(hero);

  if (ROUNDUPS.length) {
    const latest = ROUNDUPS[ROUNDUPS.length - 1];
    main.appendChild(renderRoundupCard(latest, { compact: true }));
  }

  if (pendingCount > 0) {
    const strip = document.createElement("div");
    strip.className = "inbox-strip";
    strip.innerHTML = `
      <div>
        <div class="inbox-strip-title">${pendingCount} article${pendingCount === 1 ? "" : "s"} awaiting AI summary</div>
        <div class="inbox-strip-sub">Added by you, already filed into a section — sync with Claude to get the summary, tags, and photo.</div>
      </div>
      <button class="btn">Review →</button>
    `;
    strip.querySelector("button").onclick = () => setState({ view: "section", bucket: "All", sector: null, tag: null, pendingOnly: true });
    main.appendChild(strip);
  }

  const grid = document.createElement("div");
  grid.className = "tile-grid";
  CATEGORY_META.forEach(meta => grid.appendChild(renderTile(meta)));
  main.appendChild(grid);
}

function renderTile(meta) {
  const { bucket, tagline } = meta;
  const count = bucketCount(bucket);
  const unread = unreadCount(bucket);
  const recent = mergedArticles()
    .filter(a => a.primaryBucket === bucket)
    .sort((a, b) => (b.dateAdded || "").localeCompare(a.dateAdded || ""))
    .slice(0, 3);

  const tile = document.createElement("div");
  tile.className = "tile";
  tile.onclick = () => setState({ view: "section", bucket, sector: null, tag: null, pendingOnly: false });

  tile.innerHTML = `
    <div class="tile-head">
      <div class="tile-name">${bucket}</div>
      <div class="tile-count">${count}</div>
    </div>
    <div class="tile-tagline">${tagline}</div>
    <div class="tile-snapshot">
      ${recent.length
        ? recent.map(a => `<div class="tile-snapshot-row">${a._pending ? "⏳ " : ""}${escapeHtml(a.title)}</div>`).join("")
        : `<div class="tile-snapshot-empty">Nothing here yet</div>`}
    </div>
    ${unread ? `<div class="tile-unread">${unread} to catch up on</div>` : ""}
  `;
  return tile;
}

// ---------------- Weekly Roundup ----------------

function roundupToSpeechArticle(r) {
  return {
    id: "roundup-" + r.id,
    title: `Weekly roundup: ${r.weekLabel}`,
    summary: r.summary,
    keyTakeaways: r.keyThemes.map(t => t.theme),
    openQuestions: [],
  };
}

function renderRoundupCard(r, { compact }) {
  const card = document.createElement("div");
  card.className = "roundup-card";

  const head = document.createElement("div");
  head.style.display = "flex";
  head.style.justifyContent = "space-between";
  head.style.alignItems = "flex-start";
  head.style.gap = "12px";
  head.innerHTML = `
    <div>
      <div class="roundup-eyebrow">${compact ? "This week's roundup" : "Weekly roundup"}</div>
      <div class="roundup-week">${escapeHtml(r.weekLabel)}</div>
    </div>
  `;
  if (speechSupported) {
    const listenBtn = document.createElement("button");
    const speechArticle = roundupToSpeechArticle(r);
    const playing = isPlayingArticle(speechArticle) && state.speech.playing && !state.speech.paused;
    listenBtn.className = "listen-btn" + (playing ? " listening" : "");
    listenBtn.title = playing ? "Pause" : "Listen to this roundup";
    listenBtn.textContent = playing ? "⏸" : "🔊";
    listenBtn.onclick = (e) => {
      e.stopPropagation();
      if (isPlayingArticle(speechArticle)) togglePausePlayback();
      else playArticle(speechArticle, "summary");
    };
    head.appendChild(listenBtn);
  }
  card.appendChild(head);

  const summary = document.createElement("div");
  summary.className = "roundup-summary";
  summary.textContent = r.summary;
  card.appendChild(summary);

  const themes = document.createElement("div");
  themes.className = "roundup-themes";
  r.keyThemes.forEach(t => {
    const chip = document.createElement("span");
    chip.className = "roundup-theme-chip";
    chip.textContent = `${t.theme} (${t.articleIds.length})`;
    chip.onclick = () => {
      const first = ARTICLES.find(a => a.id === t.articleIds[0]);
      if (!first) return;
      state.expanded.add(first.id);
      setState({ view: "section", bucket: "All", sector: null, tag: null, query: "", pendingOnly: false });
      document.getElementById("searchInput").value = "";
    };
    themes.appendChild(chip);
  });
  card.appendChild(themes);

  if (compact && ROUNDUPS.length > 1) {
    const link = document.createElement("div");
    link.className = "back-link";
    link.style.marginTop = "12px";
    link.textContent = `View all ${ROUNDUPS.length} roundups →`;
    link.onclick = () => setState({ view: "roundups" });
    card.appendChild(link);
  }

  return card;
}

function renderRoundupsView(main) {
  const titleWrap = document.createElement("div");
  titleWrap.className = "section-header";
  titleWrap.innerHTML = `
    <div>
      <span class="back-link" id="backHome">← Home</span>
      <h1 class="section-title">Weekly Roundup</h1>
      <p class="section-desc">${ROUNDUPS.length} week${ROUNDUPS.length === 1 ? "" : "s"} summarized</p>
    </div>
  `;
  main.appendChild(titleWrap);
  document.getElementById("backHome").onclick = goHome;

  if (!ROUNDUPS.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No roundups yet. Ask Claude to “generate this week's roundup” once you've got a few articles in.";
    main.appendChild(empty);
    return;
  }

  [...ROUNDUPS].reverse().forEach(r => main.appendChild(renderRoundupCard(r, { compact: false })));
}

function renderSection(main) {
  const filtered = mergedArticles().filter(matchesFilters);

  const titleWrap = document.createElement("div");
  titleWrap.className = "section-header";
  const back = `<span class="back-link" id="backHome">← Home</span>`;
  let heading = state.pendingOnly ? "Awaiting AI summary" : (state.tag ? `Theme: ${state.tag}` : (state.bucket === "All" ? "All Articles" : state.bucket));
  const listenableCount = filtered.filter(a => a.summary && a.summary.trim().length).length;
  const showSectorDropdown = TAXONOMY.sectorBuckets.includes(state.bucket);

  titleWrap.innerHTML = `
    <div>
      ${back}
      <h1 class="section-title">${heading}</h1>
      <p class="section-desc">${filtered.length} article${filtered.length === 1 ? "" : "s"}</p>
    </div>
    <div class="section-header-actions">
      ${showSectorDropdown ? `
        <select class="sector-select" id="sectorFilterSelect">
          <option value="">All sectors</option>
          ${TAXONOMY.sectors.map(sec => `<option value="${sec}" ${state.sector === sec ? "selected" : ""}>${sec}</option>`).join("")}
        </select>
      ` : ""}
      ${speechSupported && listenableCount ? `<button class="btn" id="listenSectionBtn">🔊 Listen to section (${listenableCount})</button>` : ""}
    </div>
  `;
  main.appendChild(titleWrap);
  document.getElementById("backHome").onclick = goHome;
  const listenSectionBtn = document.getElementById("listenSectionBtn");
  if (listenSectionBtn) listenSectionBtn.onclick = () => playSection(filtered);
  const sectorSelect = document.getElementById("sectorFilterSelect");
  if (sectorSelect) sectorSelect.onchange = (e) => setState({ sector: e.target.value || null });

  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No articles here yet. Click “+ Add Article” to drop in a link.";
    main.appendChild(empty);
    return;
  }

  // "All Articles" groups by section so the whole database still reads as
  // four folders; within a single section it's just a flat list — narrowing
  // by sector happens via the dropdown above, not automatic sub-grouping.
  if (state.bucket === "All" && !state.tag && !state.query && !state.pendingOnly) {
    TAXONOMY.primaryBuckets.forEach(b => {
      const items = filtered.filter(a => a.primaryBucket === b);
      if (!items.length) return;
      const gh = document.createElement("div");
      gh.className = "group-heading";
      gh.innerHTML = `<span>${b}</span><span class="line"></span>`;
      main.appendChild(gh);
      items.forEach(a => main.appendChild(renderCard(a)));
    });
  } else {
    filtered.forEach(a => main.appendChild(renderCard(a)));
  }
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

  if (a.imageUrl) {
    const thumb = document.createElement("img");
    thumb.className = "card-thumb";
    thumb.src = a.imageUrl;
    thumb.alt = "";
    thumb.onerror = () => thumb.remove();
    head.appendChild(thumb);
  }

  const left = document.createElement("div");
  left.className = "card-head-main";
  const badges = [`<span class="badge badge-bucket">${a.primaryBucket}</span>`];
  if (a.sector) badges.push(`<span class="badge badge-sector">${a.sector}</span>`);
  if (a._pending) badges.push(`<span class="badge badge-pending">awaiting summary</span>`);
  if (isUnread(a)) badges.push(`<span class="badge badge-unread">unread</span>`);
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

  const headRight = document.createElement("div");
  headRight.className = "card-head-right";
  if (speechSupported && a.summary && a.summary.trim().length) {
    const summaryPlaying = isPlayingArticle(a, "summary") && state.speech.playing && !state.speech.paused;
    const listenBtn = document.createElement("button");
    listenBtn.className = "listen-btn" + (summaryPlaying ? " listening" : "");
    listenBtn.title = summaryPlaying ? "Pause" : "Listen to summary";
    listenBtn.textContent = summaryPlaying ? "⏸" : "🔊";
    listenBtn.onclick = (e) => {
      e.stopPropagation();
      if (isPlayingArticle(a, "summary")) togglePausePlayback();
      else playArticle(a, "summary");
    };
    headRight.appendChild(listenBtn);

    if (a.fullText && a.fullText.trim().length) {
      const fullPlaying = isPlayingArticle(a, "full") && state.speech.playing && !state.speech.paused;
      const fullBtn = document.createElement("button");
      fullBtn.className = "listen-btn" + (fullPlaying ? " listening" : "");
      fullBtn.title = fullPlaying ? "Pause" : "Listen to full article";
      fullBtn.textContent = fullPlaying ? "⏸" : "📖";
      fullBtn.onclick = (e) => {
        e.stopPropagation();
        if (isPlayingArticle(a, "full")) togglePausePlayback();
        else playArticle(a, "full");
      };
      headRight.appendChild(fullBtn);
    }
  }
  headRight.appendChild(chevron);

  head.appendChild(left);
  head.appendChild(headRight);
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
        setState({ view: "section", tag: state.tag && state.tag.toLowerCase() === t.toLowerCase() ? null : t, bucket: "All", sector: null, pendingOnly: false });
      };
      tagRow.appendChild(chip);
    });
    card.appendChild(tagRow);
  }

  const body = document.createElement("div");
  body.className = "card-body";

  if (a.imageUrl) {
    const img = document.createElement("img");
    img.className = "card-hero-image";
    img.src = a.imageUrl;
    img.alt = "";
    img.onerror = () => img.remove();
    body.appendChild(img);
  }

  if (a.whyShared) body.appendChild(field("Why it was shared", `<div class="field-value">${escapeHtml(a.whyShared)}</div>`));
  if (a.summary) body.appendChild(field("Summary", `<div class="field-value">${escapeHtml(a.summary)}</div>`));
  if (a.keyTakeaways && a.keyTakeaways.length) body.appendChild(field("Key takeaways", listHtml(a.keyTakeaways)));
  if (a.openQuestions && a.openQuestions.length) body.appendChild(field("Open questions", listHtml(a.openQuestions)));

  if (a._pending) {
    const note = document.createElement("div");
    note.className = "needs-review";
    note.textContent = "Added by you — sync with Claude to get the summary, tags, and photo for this one.";
    body.appendChild(note);

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
        setState({ view: "section", bucket: "All", sector: null, tag: null, query: "", pendingOnly: false });
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

function updateAddModalSectorState() {
  const bucket = document.getElementById("addBucketInput").value;
  const sectorSelect = document.getElementById("addSectorInput");
  const showSector = TAXONOMY.sectorBuckets.includes(bucket);
  sectorSelect.disabled = !showSector;
  sectorSelect.closest(".form-field").style.display = showSector ? "" : "none";
  if (!showSector) sectorSelect.value = "";
}

function openAddModal() {
  document.getElementById("addUrlInput").value = "";
  document.getElementById("addBucketInput").value = "";
  document.getElementById("addSectorInput").value = "";
  document.getElementById("addSenderInput").value = "";
  document.getElementById("addChannelInput").value = "";
  document.getElementById("addNoteInput").value = "";
  document.getElementById("addDateDisplay").textContent = new Date().toISOString().slice(0, 10);
  document.getElementById("addFormError").style.display = "none";
  updateAddModalSectorState();
  document.getElementById("addModal").classList.add("open");
  setTimeout(() => document.getElementById("addUrlInput").focus(), 50);
}
function closeAddModal() {
  document.getElementById("addModal").classList.remove("open");
}
function submitAddModal() {
  const urlInput = document.getElementById("addUrlInput");
  const bucketInput = document.getElementById("addBucketInput");
  const errorEl = document.getElementById("addFormError");
  let url = urlInput.value.trim();

  if (!url) { errorEl.textContent = "Add a link first."; errorEl.style.display = "block"; urlInput.focus(); return; }
  if (!bucketInput.value) { errorEl.textContent = "Choose which section this belongs in."; errorEl.style.display = "block"; bucketInput.focus(); return; }
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;

  addPendingArticle({
    url,
    bucket: bucketInput.value,
    sector: document.getElementById("addSectorInput").value,
    sender: document.getElementById("addSenderInput").value.trim(),
    channel: document.getElementById("addChannelInput").value.trim(),
    quickNote: document.getElementById("addNoteInput").value.trim(),
  });

  closeAddModal();
  setState({ view: "section", bucket: bucketInput.value, sector: null, tag: null, pendingOnly: false });
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
      return `  { url: ${JSON.stringify(p.url)}, bucket: ${JSON.stringify(p.bucket)}, sector: ${JSON.stringify(p.sector)}, sender: ${JSON.stringify(p.sender)}, channel: ${JSON.stringify(p.channel)}, quickNote: ${JSON.stringify(note)}, dateAdded: ${JSON.stringify(p.dateAdded)} },`;
    });
    parts.push(`// New links — fetch each URL, classify per CLAUDE.md, and add full records to data/articles.js\n// (bucket/sector are already chosen — keep them as-is)\nconst NEW_LINKS = [\n${lines.join("\n")}\n];`);
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
  setSidebarCollapsed(isSidebarCollapsed());
  renderSidebar();
  renderMain();
  renderSyncIndicator();

  document.getElementById("sidebarToggleBtn").addEventListener("click", () => {
    setSidebarCollapsed(!isSidebarCollapsed());
  });

  document.getElementById("searchInput").addEventListener("input", (e) => {
    setState({ view: "section", bucket: state.bucket === "All" ? "All" : state.bucket, query: e.target.value, pendingOnly: false });
  });
  document.getElementById("brand").addEventListener("click", goHome);

  document.getElementById("addArticleBtn").addEventListener("click", openAddModal);
  document.getElementById("closeAddModalBtn").addEventListener("click", closeAddModal);
  document.getElementById("submitAddModalBtn").addEventListener("click", submitAddModal);
  document.getElementById("addUrlInput").addEventListener("keydown", (e) => { if (e.key === "Enter") submitAddModal(); });
  document.getElementById("addBucketInput").addEventListener("change", updateAddModalSectorState);

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

  document.getElementById("miniPlayerPauseBtn").addEventListener("click", togglePausePlayback);
  document.getElementById("miniPlayerSkipBtn").addEventListener("click", skipPlayback);
  document.getElementById("miniPlayerStopBtn").addEventListener("click", stopPlayback);
});
