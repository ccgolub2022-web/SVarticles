# SVarticles

A personal research feed for organizing articles shared in Slack into a
structured page by section and tags — built for a VC analyst workflow
(general market, enterprise updates, portfolio companies, potential
companies).

## Using it

Open `index.html` directly in a browser (double-click it, or drag it into a
tab). No server or build step needed.

- The **home page** is a set of tiles — General Market, Enterprise Updates,
  Portfolio Companies, Potential Companies — each a snapshot: its count, a
  few of its most recent articles, and how many you haven't taken notes on
  yet. Click a tile to open that section; click the logo (or "Home" in the
  sidebar) to come back.
- The left **sidebar** is flat (no nested sub-menus) and collapsible — click
  the `«` at the top to shrink it to icons-only, handy on a smaller screen.
- Inside a section, a **sector dropdown** (Workforce / Healthcare / Fintech)
  narrows Enterprise Updates, Portfolio Companies, and Potential Companies.
  General Market has no sector axis — use tags instead.
- "Cross-cutting themes" chips (AI, regulation, distribution, competition,
  pricing, workflow) filter across every section at once.
- Search by title, company, tag, sender, or channel.
- Click a card to expand it and read the summary, key takeaways, open
  questions, and add your own notes.
- **Listen instead of reading.** Every expanded card has a 🔊 button that
  reads the title, summary, key takeaways, and open questions aloud using
  your browser's built-in text-to-speech, and a 📖 button (once Claude has
  extracted the full article text) that reads the *entire* article instead
  of just the summary. Each section header also has a "Listen to section"
  button that queues every article in view and plays through them
  back-to-back — handy for catching up while driving. A player bar at the
  bottom shows progress with pause/skip/stop, and keeps playing as you
  browse to other pages.
- **This Week's Roundup** on the home page (and the "Weekly Roundup" tab)
  shows a synthesis of what came in recently and the themes that showed up
  more than once — see below for how it gets generated.

## Adding new articles

Click **+ Add Article**, paste the link (an article, a LinkedIn post,
anything with a URL), and pick which of the 4 sections it belongs in — you
decide that part, not Claude. Optionally add the sector, who sent it, which
channel, and a quick note on why it's worth reading; the date fills in
automatically. It shows up immediately in that section tagged **"awaiting
summary"** — no separate Inbox to remember to revisit.

To get the actual summary, tags, and photo: click **Sync with Claude** to
get a copy-paste payload of everything queued (new links + any notes you've
typed), and paste it to Claude in this repo. Claude fetches each link,
writes the summary/takeaways/tags, pulls a photo from the article (its
`og:image`), and extracts the full article text for the 📖 full-article
listen option — then commits it to `data/articles.js`. Once Claude
confirms, click **Clear synced queue** in the same modal.

You can also skip the "+" step and just paste a Slack message (link + why it
was shared + who/where + which section) straight to Claude in chat — same
result.

Notes you type in any article's "My notes" box are saved locally in your
browser as you go; they're included automatically the next time you sync.

## Weekly Roundup

Ask Claude "generate this week's roundup" (in this repo, any time) and it
reads everything added that week, writes a short synthesis plus any themes
that came up more than once, and appends it to `data/roundups.js`. It shows
up on the home page and in the "Weekly Roundup" tab. Nothing runs on a
schedule automatically — it's a one-line ask whenever you want to catch up
your own thinking or want something to hand to the team.

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
- `data/roundups.js` — weekly synthesis records
- `CLAUDE.md` — classification rules Claude follows when adding articles
