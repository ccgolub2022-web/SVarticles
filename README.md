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

## Hosting it (recommended — one-time setup)

`main` always has the latest version of the site, so you can host it for a
permanent URL instead of opening the file locally each time:

1. Go to the repo on GitHub → **Settings** → **Pages**.
2. Under "Build and deployment", set **Source** to "Deploy from a branch".
3. Set **Branch** to `main`, folder `/ (root)`, then **Save**.
4. GitHub will publish it at `https://ccgolub2022-web.github.io/SVarticles/`
   within a minute or two.

No build step is needed — it's already plain HTML/CSS/JS. Every time Claude
commits new articles or you push a change, the live site updates automatically
within a minute of the push landing on `main`.

## Files

- `index.html`, `styles.css`, `app.js` — the page itself
- `data/articles.js` — the article database + taxonomy definitions
- `CLAUDE.md` — classification rules Claude follows when adding articles
