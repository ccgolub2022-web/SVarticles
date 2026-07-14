# SVarticles — VC Article Organizer

This repo is a personal research tool for a VC analyst at SemperVirens. It turns
articles shared in Slack group chats into a structured, taggable research page
covering markets, prospective companies, industry sectors, and portfolio company
updates.

The site itself is `index.html` + `styles.css` + `app.js`, reading its data
from `data/articles.js`. There is no backend — it's a static page opened
directly in a browser (or hosted on GitHub Pages).

## Your job in this repo

There are two ways an article reaches you. Handle both the same way from
step 2 onward — classify, write the record, append, commit.

**A. Pasted Slack message.** The user pastes a Slack message (text, link,
and/or screenshot) directly in chat.

**B. "Sync with Claude" payload.** The user clicks **+ Add Article** on the
page to queue a link (just the URL + optional sender/channel/quick note —
the app auto-fills today's date), then clicks **Sync with Claude** and
pastes you a payload shaped like:

```js
// New links — fetch each URL, classify per CLAUDE.md, and add full records to data/articles.js
const NEW_LINKS = [
  { url: "...", sender: "...", channel: "...", quickNote: "...", dateAdded: "2026-07-13" },
];
// Note updates — merge into existing articles' myNotes by id
const NOTES_UPDATES = [
  { id: "...", myNotes: "..." },
];
```

For each `NEW_LINKS` entry:
1. **Fetch the article** with WebFetch to get its actual title, publisher,
   and content — don't guess from the URL alone. If the fetch fails
   (paywall, login wall, blocked), still create the record using whatever
   you can infer from the URL/quickNote, and note the fetch failure in
   `needsReviewReason` so the user knows the summary is thin.
2. Treat `sender` → `sender`, `channel` → `slackChannel`, `quickNote` →
   `whyShared` (combine with anything useful from the fetched content),
   `dateAdded` → both `sharedAt` and `dateAdded` unless the article text
   reveals a more precise shared time.
3. Classify and write the full record as in the manual flow below, then
   append it to `ARTICLES` in `data/articles.js`.

For each `NOTES_UPDATES` entry, find the existing article by `id` in
`data/articles.js` and overwrite its `myNotes` field.

After processing a sync payload, commit, and tell the user it's safe to
click **Clear synced queue** in the app (this only clears their local
pending-links cache, it doesn't touch the repo).

**Classification steps** (both flows):

1. **Extract metadata**: title, URL, source/publisher, Slack channel, sender,
   timestamp, and the message text explaining why it was shared. Ask the user
   for anything you can't infer (e.g. which channel, if not stated).
2. **Classify it** using the taxonomy below.
3. **Write a review-ready record** and append it to the `ARTICLES` array in
   `data/articles.js`, following the exact schema in that file.
4. **Commit** (and push, if asked) so the change shows up when the page is
   reloaded.
5. If you can't classify an article confidently, put it in `Inbox` and fill
   `needsReviewReason` with a short explanation plus your best-guess category.

Always read the current `data/articles.js` before adding to it, so you don't
duplicate an article (match on `url` first) and so new tags/company names stay
consistent with ones already used.

## Taxonomy

**Primary buckets** (`primaryBucket` field):

- **Markets** — `subTopic` one of: `Macro`, `Rates / Fed`, `Public markets`,
  `Sector trends`, `Competition / market structure`
- **Companies** — prospective/private companies of interest (not yet in
  portfolio). `subTopic` one of: `Company strategy`, `Product launches`,
  `Financial performance`, `Fundraising / M&A`, `Leadership / org changes`.
  Also set `sector` (see below) and `companyName`.
- **Company Sectors** — industry-level trend pieces not about one specific
  company. `subTopic`/`sector` is one of `Workforce`, `Healthcare`, `Fintech`.
- **Portfolio Companies** — updates about current portfolio companies.
  Set `sector` (`Workforce` / `Healthcare` / `Fintech`) and `companyName`.
- **Inbox** — not yet classified with confidence.

**Sector** (`sector` field) applies to `Companies`, `Company Sectors`, and
`Portfolio Companies`: `Workforce`, `Healthcare`, or `Fintech`. If a company
article doesn't fit one of these three, leave `sector` null — don't invent a
new sector unless the same new sector shows up repeatedly (ask the user before
adding one).

**Classification principle**: if an article could fit more than one bucket,
pick the bucket matching its *main point* and add the other angle as a tag.
Don't create new categories/subtopics unless a pattern repeats across several
articles — ask the user first.

**Tags** (`tags` field, array of strings): company names, industry, geography,
stage (e.g. `seed`, `series-c`), event type (e.g. `product-launch`,
`fundraising`, `leadership-change`), and cross-cutting themes: `AI`,
`regulation`, `distribution`, `competition`, `pricing`, `workflow`. Use
lowercase, hyphenated tags for consistency (e.g. `series-c`, `product-launch`).

## Record schema (`data/articles.js`)

```js
{
  id: "2026-07-13-brief-slug",       // date-prefixed slug, unique
  title: "",
  url: "",
  source: "",                        // publisher, e.g. "TechCrunch"
  slackChannel: "",
  sender: "",
  sharedAt: "",                       // when it was shared in Slack, free text or ISO date
  whyShared: "",                      // paraphrase of the Slack message context
  primaryBucket: "Markets" | "Companies" | "Company Sectors" | "Portfolio Companies" | "Inbox",
  subTopic: "",                       // see taxonomy above; "" if Inbox and unknown
  sector: "Workforce" | "Healthcare" | "Fintech" | null,
  companyName: "",                    // "" if not company-specific
  tags: [],
  summary: "",                        // 2-4 sentence synthesis, not a repeat of the article
  keyTakeaways: [],                   // short bullet strings
  openQuestions: [],                  // short bullet strings
  myNotes: "",                        // usually left "" for the user to fill in after reading
  relatedArticleIds: [],              // ids of other articles in the same theme/cluster
  needsReviewReason: "",              // only for Inbox: why it's uncertain + best-guess category
  dateAdded: "2026-07-13"             // ISO date this record was added
}
```

## Tone for summaries/takeaways

Be concise, analytical, and synthesis-focused — don't restate the article.
Focus on categorization, relevance, and what's useful to remember. Prioritize
depth of synthesis for articles that are: about major market shifts, about
important private companies, about Workforce/Healthcare/Fintech, or shared by
multiple people/channels (a signal of importance).

## Grouping related articles

If several articles share a theme (e.g. three articles this week about AI
pricing in fintech), set each one's `relatedArticleIds` to point at the others
so the page clusters them together, even across different primary buckets.

## Weekly Roundup

When the user asks for "this week's roundup" (or similar — "summarize this
week", "what came in this week"), read every article in `data/articles.js`
with `dateAdded` in the requested week (default: the last 7 days, Monday
through Sunday) and write one record to the `ROUNDUPS` array in
`data/roundups.js`:

```js
{
  id: "2026-07-07-2026-07-13",        // weekStart-weekEnd
  weekLabel: "Jul 7 – Jul 13, 2026",   // human-readable
  weekStart: "2026-07-07",             // ISO date, Monday
  weekEnd: "2026-07-13",               // ISO date, Sunday
  summary: "",                         // 3-5 sentence synthesis of the week's throughline(s)
  keyThemes: [
    { theme: "", articleIds: [] },     // only include themes 2+ articles actually share — don't force one
  ],
  generatedAt: "2026-07-13"
}
```

`summary` should read like a briefing, not a list — what mattered this week
and why, referencing the articles implicitly. Only surface a `keyThemes`
entry when multiple articles genuinely converge on it; a quiet week with no
real pattern is a valid (and honest) summary. Append the new record and
commit — don't overwrite prior weeks. If a roundup already exists for the
requested week, update that record instead of creating a duplicate.
