# SVarticles

A personal research feed for organizing articles shared in Slack into a
structured page by topic, sub-topic, and tags — built for a VC analyst
workflow (markets, prospective companies, industry sectors, portfolio
updates).

## Using it

Open `index.html` directly in a browser (double-click it, or drag it into a
tab). No server or build step needed.

- Browse by section in the left sidebar (Inbox, Markets, Companies, Company
  Sectors, Portfolio Companies), each with sub-groups.
- Click "Cross-cutting themes" chips (or any tag on a card) to filter across
  everything by theme (AI, regulation, distribution, competition, pricing,
  workflow).
- Search by title, company, tag, sender, or channel.
- Click a card to expand it and read the summary, key takeaways, open
  questions, and add your own notes.
- Notes you type are saved locally in your browser. Click **Export my
  notes** any time to get a snippet you can hand back to Claude to merge
  permanently into `data/articles.js`.

## Adding new articles

Paste a Slack message (the link, the text explaining why it was shared, and
which channel/who sent it) to Claude in this repo. Claude follows the rules
in `CLAUDE.md` to classify it and append a record to `data/articles.js`.
Reload `index.html` to see it.

## Hosting it (optional)

To access this from anywhere instead of opening the file locally, enable
GitHub Pages for this repo (Settings → Pages → deploy from the `main`
branch, root folder) — no other changes needed.

## Files

- `index.html`, `styles.css`, `app.js` — the page itself
- `data/articles.js` — the article database + taxonomy definitions
- `CLAUDE.md` — classification rules Claude follows when adding articles
