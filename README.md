# SVarticles

A personal research feed for organizing articles shared in Slack into a
structured page by section and tags — built for a VC analyst workflow
(general market, enterprise updates, portfolio companies, potential
companies).

## Using it

The site fetches its data as JSON at load time, so it needs to be served
over `http(s)` — double-clicking `index.html` directly won't work (the
browser blocks that fetch for security reasons on `file://` pages). Two ways
to run it:

- **Hosted (recommended):** see "Hosting it" below — a real URL you can open
  from your phone or laptop, no setup each time.
- **Local testing:** from this folder, run `python3 -m http.server 8000` and
  open `http://localhost:8000`.

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
  your browser's built-in text-to-speech, and a 📖 button (once the full
  article text has been extracted) that reads the *entire* article instead
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
automatically.

What happens next depends on whether you've set up **live sync** (the ⚙
button — see below):

- **Live sync on:** the Worker fetches the article, writes the summary/tags,
  pulls a photo, and commits it — usually done in 15–30 seconds, and the
  finished card appears right in the app. If it fails for any reason (bad
  network, site blocked it, etc.), it automatically falls back to the queue
  below instead of losing what you typed.
- **Live sync off (default):** it shows up immediately in that section
  tagged **"awaiting summary."** Click **Sync with Claude** to get a
  copy-paste payload of everything queued (new links + any notes you've
  typed), paste it to Claude in this repo, and Claude does the same
  fetch/summarize/tag/photo work by hand, then commits it. Click **Clear
  synced queue** once Claude confirms.

You can also skip the "+" step entirely and just paste a Slack message
(link + why it was shared + who/where + which section) straight to Claude in
chat — same result, no live sync required.

Notes you type in any article's "My notes" box always save locally in your
browser instantly; with live sync on they also auto-save to the repo a couple
seconds after you stop typing (look for "Saved" under the notes label).
Without live sync, they go out with your next Claude sync instead.

## Weekly Roundup

This one's always manual, live sync or not. Ask Claude "generate this week's
roundup" (in this repo, any time) and it reads everything added that week,
writes a short synthesis plus any themes that came up more than once, and
appends it to `data/roundups.json`. It shows up on the home page and in the
"Weekly Roundup" tab.

## Hosting it (recommended — one-time setup)

`main` always has the latest version of the site, so you can host it for a
permanent URL instead of running a local server each time:

1. Go to the repo on GitHub → **Settings** → **Pages**.
2. Under "Build and deployment", set **Source** to "Deploy from a branch".
3. Set **Branch** to `main`, folder `/ (root)`, then **Save**.
4. GitHub will publish it at `https://ccgolub2022-web.github.io/svarticles/`
   within a minute or two.

No build step is needed — it's already plain HTML/CSS/JS. Every time a
commit lands on `main` (from you, from Claude, or from the live-sync Worker),
the hosted site updates automatically within a minute or two.

## Live sync (optional — makes Add Article fully automatic)

By default, adding an article queues it locally and you hand it to Claude in
a chat to finish. If you'd rather it happen automatically the moment you
click "Add," deploy the small Cloudflare Worker in `worker/`. It fetches the
article, classifies/summarizes it with the Anthropic API, and commits the
result straight to `data/articles.json`.

This costs a small amount (Anthropic bills per API call — realistically
cents per article) and needs two accounts only you can create; I can't hold
credentials on your behalf. Here's the full setup:

**1. Get an Anthropic API key**
- Go to [console.anthropic.com](https://console.anthropic.com), create an
  account if needed, and add a small amount of credit (Settings → Billing).
- Create a key under **API Keys** — copy it, you'll need it in step 4.
- This is separate from any Claude.ai / Claude Code subscription — it's
  billed per token used, not a flat fee.

**2. Create a free Cloudflare account**
- Sign up at [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up).
  The free tier easily covers personal usage like this.

**3. Create a GitHub token for the Worker to commit with**
- GitHub → your avatar → **Settings** → **Developer settings** →
  **Personal access tokens** → **Fine-grained tokens** → **Generate new
  token**.
- Scope it to **only this repository** (`svarticles`), with **Contents:
  Read and write** permission — nothing else.
- Copy the token, you'll need it in step 4.

**4. Install Wrangler (Cloudflare's CLI) and deploy**

From the `worker/` folder in this repo:

```
cd worker
npx wrangler login          # opens a browser to connect your Cloudflare account
npx wrangler secret put ANTHROPIC_API_KEY     # paste the key from step 1
npx wrangler secret put GITHUB_TOKEN          # paste the token from step 3
npx wrangler secret put WORKER_SECRET         # make up any long random password — you'll reuse it in step 5
npx wrangler deploy
```

`wrangler deploy` prints the Worker's URL, something like
`https://svarticles-worker.<your-subdomain>.workers.dev`. Copy it.

If your GitHub Pages URL isn't `https://ccgolub2022-web.github.io`, or you
test locally on a different port, edit `ALLOWED_ORIGINS` in
`worker/wrangler.toml` to match before deploying (comma-separated list) —
the Worker only accepts requests from origins on that list.

**5. Connect the site to it**
- Open the site, click the **⚙** button in the top bar.
- Paste the Worker URL from step 4 and the `WORKER_SECRET` you made up.
- Click **Save**. The gear icon turns green when it's active.

That's it — "+ Add Article" and note edits now go live. You can turn it off
any time from the same settings panel; everything falls back to the manual
Claude-sync flow instantly, nothing else changes.

**Optional hardening:** the Worker checks a shared secret, but for extra
peace of mind you can also add a rate limit in the Cloudflare dashboard
(Workers & Pages → your Worker → Settings → Triggers → Rate limiting) to cap
requests per minute, which bounds worst-case API spend if the URL ever
leaked.

## Files

- `index.html`, `styles.css`, `app.js` — the page itself
- `data/articles.json` — the article database
- `data/roundups.json` — weekly synthesis records
- `worker/` — optional Cloudflare Worker for live sync (see above)
- `CLAUDE.md` — classification rules Claude (and the Worker) follow when
  adding articles
