# liberate.sh

Live at [liberate.sh](https://liberate.sh).

Paste a website's address and get it back as a WordPress site you can host anywhere.

Plenty of people are on a closed site builder — Wix, Squarespace, Shopify, Webflow, GoDaddy — with no easy way to leave and take their site with them. liberate.sh copies the site, rebuilds it as WordPress, and hands you the result as a zip.

What you get is a WordPress site folder: your pages and media, and a theme carrying the original look. It opens in [Studio](https://developer.wordpress.com/studio/), the free WordPress app, which can push it to WordPress.com or Pressable. Hosts that run WordPress on SQLite can take it as it is; anywhere else, Studio is the way in.

## How it works

The copying happens at WordPress.com, which captures the site with a real browser and rebuilds it with its static site importer. This server doesn't copy anything itself and doesn't keep what comes back: it checks the address, asks for a copy, follows it while it runs, and sends you to the download when it's ready.

What it does keep is a few hundred bytes per job, so a bookmarked link still knows which site it belongs to. There's no queue, no archive on disk, and nothing to clean up afterwards.

Copies aren't perfect. Complex layouts come back with gaps, and when the importer says so, the download still arrives — with a line admitting that some pages may be missing pieces. A site with gaps beats no site.

liberate.sh runs as a registered WordPress.com application with a daily limit on how many sites it can copy, so it can run out for the day. Asking for a site that's already being copied costs nothing and gives you the same one back.

## Running it locally

```bash
# Simulated runs: no WordPress.com, no credentials. Hosts containing "fail" fail.
LIBERATE_FAKE_PIPELINE=1 npm run dev

# The real thing, with the application's credentials.
npm run dev
```

Then open http://localhost:8080. `npm run build` followed by `npm start` runs the production build. Credentials go in `.env` — see `.env.example`; the secret is issued by the WordPress.com side and never lives in this repository.

## Configuration

| Variable | Default | |
| --- | --- | --- |
| `PORT` | `8080` | |
| `WPCOM_CLIENT_ID`, `WPCOM_CLIENT_SECRET` | unset | The registered application. Required unless runs are simulated. |
| `WPCOM_API_BASE` | `https://public-api.wordpress.com` | For a sandbox. |
| `LIBERATE_DATA_DIR` | `$RAILWAY_VOLUME_MOUNT_PATH`, else `.data` | Where the small per-job records live. Must be persistent. |
| `LIBERATE_RETENTION_HOURS` | `72` | How long a link keeps working. |
| `LIBERATE_JOBS_PER_HOUR` | `3` | Per visitor. |
| `LIBERATE_TRUST_PROXY` | `1` | Proxy hops in front of the app, for client IPs. |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | unset | Set both to require a [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) check. |

## Deploying

liberate.sh runs on [Spacefast](https://spacefast.com/): pushing to `trunk` builds `npm run build:spacefast`, which puts the page, the worker routes and `sf.jsonc` into `dist-spacefast/`. There the routes run as Functions and the job records live in the space's own database, so the only things to configure are `WPCOM_CLIENT_ID` and `WPCOM_CLIENT_SECRET`.

It also ships as a container for anywhere else (`Dockerfile`, `railway.json`): the same app with Express in front and the records on disk, which needs a small persistent directory and a single replica so every request sees the same records.

## Guard rails

The service copies arbitrary websites on request, so:

- Addresses must be public ones, checked after DNS resolution, and WordPress.com checks them again on its side.
- Visitors confirm they own the site or may copy it, and are rate limited, optionally behind a Turnstile check.
- A job's link is unguessable, and it expires.
- The credential it holds can only ask for copies. It carries no access to anyone's WordPress.com account or sites.

## Known limitations

- Fidelity is whatever the capture and the importer manage on their own. No AI is involved, and intricate designs come back imperfect.
- A copied site is a large download, mostly media and WordPress itself.
- WordPress on SQLite isn't what most hosts run, so moving in usually means going through Studio.
- The daily limit is the whole service's ceiling, not a per-visitor one.
