# SVarticles

A personal research feed for organizing articles shared in Slack into a
structured page by topic, sub-topic, and tags — built for a VC analyst
workflow (markets, prospective companies, industry sectors, portfolio
updates).

## Using it

Open `index.html` directly in a browser (double-click it, or drag it into a
tab). No server or build step needed.

- The **home page** is a set of big tiles — Markets, Companies, Company
  Sectors, Portfolio Companies — each showing its count and a breakdown by
  sub-topic or sector (Workforce/Healthcare/Fintech). Click a tile to drill
  into that section; click the logo (or "Home" in the sidebar) to come back.
- An **Inbox strip** on the home page flags anything that still needs
  classification, with a one-click jump into the Inbox.
- The left sidebar gives direct jumps into any section or sub-section, plus
  "Cross-cutting themes" chips (AI, regulation, distribution, competition,
  pricing, workflow) that filter across everything.
- Search by title, company, tag, sender, or channel.
- Click a card to expand it and read the summary, key takeaways, open
  questions, and add your own notes.

## Adding new articles

Since there's no live Slack integration, articles get in one of two ways:

1. **Quick add (fast path).** Click **+ Add Article**, paste the link, and
   optionally note who sent it, which channel, and a quick note on why it's
   worth reading — the date is filled in automatically. It lands in the
   Inbox tagged "quick add — pending" with none of the AI classification
   done yet.
2. **Sync with Claude.** Click **Sync with Claude** to get a copy-paste
   payload of everything queued (new links + any notes you've typed). Paste
   it to Claude in this repo — Claude fetches each link, classifies it per
   `CLAUDE.md`, writes the full record (summary, takeaways, tags, etc.), and
   commits it to `data/articles.js`. Once Claude confirms, click **Clear
   synced queue** in the same modal and reload the page.

You can also skip the "+" step and just paste a Slack message (link + why it
was shared + who/where) straight to Claude in chat — same result.

Notes you type in any article's "My notes" box are saved locally in your
browser as you go; they're included automatically the next time you sync.

## Hosting it (optional)

To access this from anywhere instead of opening the file locally, enable
GitHub Pages for this repo (Settings → Pages → deploy from the `main`
branch, root folder) — no other changes needed.

## Files

- `index.html`, `styles.css`, `app.js` — the page itself
- `data/articles.js` — the article database + taxonomy definitions
- `CLAUDE.md` — classification rules Claude follows when adding articles
