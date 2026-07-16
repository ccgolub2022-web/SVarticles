# SVarticles — VC Article Organizer

This repo is a personal research tool for a VC analyst at SemperVirens. It turns
articles (and LinkedIn posts, etc.) shared in Slack group chats into a structured,
taggable research page covering general market news, enterprise/industry updates,
portfolio companies, and potential companies.

The site itself is `index.html` + `styles.css` + `app.js`, reading its data
from `data/articles.jsonon` (fetched at load time, so it must stay valid JSON —
no comments, no trailing commas). It's a static page (hosted on GitHub
Pages) with one optional piece of live infrastructure: `worker/` is a
Cloudflare Worker the user can deploy so "+ Add Article" and note edits
happen automatically instead of going through you. See `worker/index.js` and
the README's "Live sync" section if asked about that path — it mirrors the
same classification rules documented here, just running unattended. Most of
your job is unchanged either way: when the Worker isn't configured (or a
request to it fails), everything falls back to the manual flow below.

The Worker can also run on a schedule to **auto-ingest** articles from RSS
feeds and NewsAPI (see the README's "Automatic feed ingestion" section). This
is the one path where the section isn't user-chosen — the Worker asks Claude to
pick the `primaryBucket`/`sector` and to drop off-thesis items, and tags each
record `auto-ingested`. Records with that tag came in this way; everything else
was assigned by the user.

## Your job in this repo

The user always assigns the section (and sector, where relevant) themselves
via the **+ Add Article** form in the app — there is no "Inbox" or
uncertain-classification bucket. Your job is to fill in everything else:
fetch the article, write the summary/takeaways, tag it, and find an image.

There are two ways an article reaches you. Handle both the same way from
the fetch step onward.

**A. Pasted Slack message.** The user pastes a Slack message (text, link,
and/or screenshot) directly in chat, and tells you which of the 4 sections
it belongs in (ask if they don't say).

**B. "Sync with Claude" payload.** The user picks the section (and sector,
if applicable) right in the **+ Add Article** form, so by the time you see
it the bucket is already decided. Clicking **Sync with Claude** gives you a
payload shaped like:

```js
// New links — fetch each URL, classify per CLAUDE.md, and add full records to data/articles.json
const NEW_LINKS = [
  { url: "...", bucket: "...", sector: "...", sender: "...", channel: "...", quickNote: "...", dateAdded: "2026-07-13" },
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
   you can infer from the URL/quickNote, and say so plainly in `summary`
   (e.g. "Couldn't access the full article — paywalled.") so the user knows
   it's thin.
2. **Keep `bucket` and `sector` exactly as given** — the user already chose
   them in the app. Don't second-guess or reclassify. If you genuinely think
   it's misfiled, say so to the user in chat rather than silently moving it.
3. **Extract an image**: look for an `og:image` (or `twitter:image`) meta
   tag in the fetched page and put its URL in `imageUrl`. Leave `imageUrl`
   as `""` if none is found — never invent or guess an image URL.
4. **Extract the full article text** into `fullText` as clean plain text
   (strip nav/ads/boilerplate) so the user can have it read aloud in full,
   not just the summary. Cap it around 6000 characters for very long pieces;
   leave `""` if the fetch failed or the content is behind a paywall.
5. Treat `sender` → `sender`, `channel` → `slackChannel`, `quickNote` →
   `whyShared` (combine with anything useful from the fetched content),
   `dateAdded` → both `sharedAt` and `dateAdded` unless the article text
   reveals a more precise shared time.
6. Write the summary/takeaways/tags per the tone and tagging rules below,
   then append the full record to the array in `data/articles.json` (valid
   JSON only — no comments, no trailing commas).

A sync payload may also contain a `MANUAL_ARTICLES` array — full records the
user wrote themselves via the **Write your own** form (title, summary,
takeaways, tags, notes all already filled in). For each of these, **append the
record to `data/articles.json` as-is** — don't refetch a URL, reclassify, or
rewrite the summary. Just sanity-check the JSON and, if the `id` collides with
an existing one, give it a unique suffix. These have no `og:image`, so leave
`imageUrl` as whatever's given (usually `""`).

For each `NOTES_UPDATES` entry, find the existing article by `id` in
`data/articles.json` and overwrite its `myNotes` field.

After processing a sync payload, commit, and tell the user it's safe to
click **Clear synced queue** in the app (this only clears their local
pending-links cache, it doesn't touch the repo).

Always read the current `data/articles.json` before adding to it, so you don't
duplicate an article (match on `url` first) and so new tags/company names stay
consistent with ones already used.

## Taxonomy

**Primary buckets** (`primaryBucket` field) — exactly 4, chosen by the user:

- **General Market** — macro, public markets, rates, competitive/industry
  landscape pieces not about one specific company or sector vertical. No
  sector, no sub-topic — just tags (see below) for nuance.
- **Enterprise Updates** — industry/sector-level trend pieces about
  Workforce, Healthcare, or Fintech in general, not one specific company.
  Set `sector`.
- **Potential Companies** — a specific private/prospective company you're
  tracking or diligencing (not yet in the portfolio). Set `sector` and
  `companyName`.
- **Portfolio Companies** — updates about a current portfolio company. Set
  `sector` and `companyName`.

**Sector** (`sector` field) applies to `Enterprise Updates`,
`Potential Companies`, and `Portfolio Companies`: `Workforce`, `Healthcare`,
or `Fintech`. Always `null` for `General Market`. If a company article
doesn't fit one of the three sectors, leave `sector` null — don't invent a
new sector unless the same new sector shows up repeatedly (ask the user
before adding one).

There is no sub-topic axis anymore (no "Macro / Rates / Public markets"
style subdivisions) — use `tags` for that nuance instead so the sidebar
stays simple.

**Tags** (`tags` field, array of strings): company names, industry, geography,
stage (e.g. `seed`, `series-c`), event type (e.g. `product-launch`,
`fundraising`, `leadership-change`), and cross-cutting themes: `AI`,
`regulation`, `distribution`, `competition`, `pricing`, `workflow`. Use
lowercase, hyphenated tags for consistency (e.g. `series-c`, `product-launch`).

## Record schema (`data/articles.json`)

Shape below is annotated for reference only — the actual file is plain JSON
(quoted keys, no comments, no trailing commas).

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
  primaryBucket: "General Market" | "Enterprise Updates" | "Potential Companies" | "Portfolio Companies",
  sector: "Workforce" | "Healthcare" | "Fintech" | null,   // null for General Market
  companyName: "",                    // "" if not company-specific
  tags: [],
  imageUrl: "",                       // og:image from the article; "" if none found — never invent one
  summary: "",                        // 2-4 sentence synthesis, not a repeat of the article
  fullText: "",                       // clean plain-text of the full article, for full read-aloud; "" if unavailable
  keyTakeaways: [],                   // short bullet strings
  openQuestions: [],                  // short bullet strings
  myNotes: "",                        // usually left "" for the user to fill in after reading
  relatedArticleIds: [],              // ids of other articles in the same theme/cluster
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

This one stays manual even when live sync is set up — the Worker only
handles new articles and note edits, not roundups. When the user asks for
"this week's roundup" (or similar — "summarize this week", "what came in
this week"), read every article in `data/articles.json` with `dateAdded` in
the requested week (default: the last 7 days, Monday through Sunday) and
append one record to the array in `data/roundups.json` (valid JSON, no
comments/trailing commas — the shape below is annotated for reference only):

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
