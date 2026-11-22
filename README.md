# Dekrov Links

Minimal, standalone link hub for **Dekrov**. Pure HTML + CSS; no framework, backend, JavaScript, build step, or analytics.

## Files

- `index.html` — the page and all external links.
- `style.css` — page styling and responsive layout.

## Editing the links

Each destination is a plain HTML `<a class="link-card" ...>` element in `index.html`. To add or change a destination, update the link URL, title and subtitle. Update the destination counter (currently 06) if you add/remove cards. External links open separately using `rel="noopener noreferrer"`.

## Publishing on GitHub Pages

1. Open **Settings → Pages** in this repository.
2. Choose **Deploy from a branch**.
3. Select **main** and **/(root)**, then **Save**.
4. The initial site URL will be **https://dekrovdev.github.io/dekrov-links/**.

### Custom domain: links.dekrov.com

After Pages is live:

1. At the DNS provider for `dekrov.com`, add a **CNAME**: name `links`, target `dekrovdev.github.io`.
2. In **GitHub repository Settings → Pages → Custom domain**, enter `links.dekrov.com` and save. GitHub will save a root-level `CNAME` file.
3. Wait for DNS propagation and certificate creation, then turn on **Enforce HTTPS** when GitHub offers it.

Set up DNS before setting the custom domain, since the default preview URL may redirect to the custom hostname.

The logo is requested from `https://dekrov.com/assets/favicon-dk.png`, matching the main portfolio branding. No third-party scripts or tracking.
