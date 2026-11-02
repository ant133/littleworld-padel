# Publish at padel.annetta.dev

## 1. Enable GitHub Pages

1. Open https://github.com/ant133/littleworld-padel/settings/pages while signed in as `ant133`.
2. Under **Build and deployment**, select **GitHub Actions** as the source.
3. Open https://github.com/ant133/littleworld-padel/actions and select **Deploy GitHub Pages**.
4. If a deployment has not already started, select **Run workflow**, choose `main`, then **Run workflow**.
5. Wait for both `build` and `deploy` to turn green.
6. Before adding a custom domain, test https://ant133.github.io/littleworld-padel/.

## 2. Set the custom domain on GitHub

1. Return to https://github.com/ant133/littleworld-padel/settings/pages.
2. Under **Custom domain**, enter `padel.annetta.dev` and select **Save**.
3. A DNS-check warning is expected until the next step is complete.

This repository uses a custom Actions workflow. GitHub stores the custom domain in Pages settings; a `CNAME` file in the repository is not required for this deployment method.

## 3. Add the DNS record

1. Sign in to the DNS provider that manages the authoritative nameservers for `annetta.dev`.
2. Open the DNS zone for `annetta.dev`.
3. Add this record:

| Field | Value |
| --- | --- |
| Type | CNAME |
| Name / Host | padel |
| Target / Value | ant133.github.io |
| TTL | Auto or 3600 seconds |

Some providers require the full name `padel.annetta.dev` instead of `padel`. The target is a hostname: do not include `https://`, a slash, or `littleworld-padel`.

If a record already exists for the exact host `padel`, replace that conflicting record. Leave the root `annetta.dev`, `www`, email, and other subdomains unchanged. If using Cloudflare, select **DNS only** (gray cloud) for this record while GitHub checks DNS and provisions its certificate.

## 4. Verify DNS and HTTPS

1. Allow DNS to propagate; this can take up to 24 hours.
2. On Windows, run:

```powershell
Resolve-DnsName padel.annetta.dev -Type CNAME
```

3. Confirm that the CNAME target is `ant133.github.io`.
4. Return to the repository's Pages settings and wait for the DNS check to succeed and the HTTPS certificate to be issued.
5. Enable **Enforce HTTPS** when available. Certificate provisioning may take up to an hour after correct DNS is detected.
6. Visit https://padel.annetta.dev and check that the game renders and its controls work.
7. Download https://padel.annetta.dev/littleworld-offline.html and open the saved file with the network disconnected.

The custom domain serves the game at `/`. The default GitHub Pages address redirects to the configured custom domain.

## 5. Publish future changes

Edit the project, run the appropriate checks, commit, and push to `main`. The workflow rebuilds the page automatically. Check the Actions tab if an update does not appear; wait for the deployment to finish, then refresh the browser.

## Troubleshooting

- **404:** Check that Pages source is GitHub Actions and the latest deployment succeeded.
- **DNS check fails:** Confirm `padel` is a CNAME to `ant133.github.io`, remove conflicting records for that same host, and wait for propagation.
- **HTTPS unavailable:** Wait for certificate provisioning; confirm DNS is correct and any proxy is disabled while provisioning.
- **Workflow fails:** Open its failed step in Actions. The build requires the `src/`, `tools/`, and `vendor/three.min.js` files in the repository.

## Official references

- [Configure a publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Manage a custom domain](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
- [Secure Pages with HTTPS](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https)
