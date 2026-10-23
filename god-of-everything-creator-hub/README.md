# GOD OF EVERYTHING Creator Hub

A no-login public creator directory. Creator page data is stored in Cloudflare KV; the site does not create fan accounts or store browsing history. The report button opens the visitor's email app and does not store reports or automatically send them.

## Files

- `index.html` — complete responsive website UI.
- `functions/api/health.js` — API health check.
- `functions/api/creators/index.js` — creator search/list and page creation API.
- `functions/api/creators/[slug].js` — public creator page API and private-token editing.
- `wrangler.toml` — optional local Wrangler configuration template.

## Deploy to Cloudflare Pages using GitHub

1. Upload all files and the `functions` folder to the root of your GitHub repository. Keep the folder names and file names exactly as provided.
2. In Cloudflare Dashboard, open **Workers & Pages** and create or open your Pages project connected to this GitHub repository.
3. Use framework preset **None**. For this static site, leave the build command blank and set the build output directory to `.` (dot), if the UI asks for it.
4. Create a KV namespace named `creator_profiles` under Workers KV.
5. In your Pages project, open **Settings → Functions → KV namespace bindings** (the exact menu wording can vary), add a binding with variable name `CREATOR_PAGES`, and choose `creator_profiles`.
6. Save the binding and trigger a new deployment. The binding is available to Functions after redeploy.
7. Open `https://YOUR-PAGES-DOMAIN/api/health`. It should return JSON with `"ok":true`.
8. Open the site and create a test creator page. Test its public link in a private/incognito browser window.

Do not deploy this repository as a GitHub Pages-only site if you need persistent creator storage. GitHub Pages serves static files but does not execute the `functions` API. The frontend will show an API connection error until deployed to Cloudflare Pages with the KV binding.

## Edit links and privacy

Page creation returns a public URL and a private edit URL. The edit token is kept in the URL fragment, which browsers do not send to the server in ordinary HTTP requests. Keep the full private edit URL secret; anyone with it can edit that creator page. If it is lost, there is no account recovery flow in this no-login version.

## Storage behavior

Only creator page records (name, slug, bio, image URLs, social URLs, edit-token hash, and timestamps) are stored in KV. No fan accounts or reports are stored. Reports use `mailto:visvamgg@gmail.com`, which opens the visitor's configured email application. Automatic email delivery is not configured.

## Limits and abuse prevention

This is a starter deployment. Public no-login page creation can be abused by bots or impersonators. Before promoting it widely, consider adding Cloudflare Turnstile and rate limiting, plus a moderation/deletion process. Do not store passwords, personal secrets, or sensitive information in public profiles.
