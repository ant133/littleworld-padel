# Littleworld Jakarta Padel Cup

A physics-driven 3D pixel-art doubles padel diorama for annetta.dev.

In **Match setup → Create player · Play with Annetta**, enter a name and gender to generate an Indonesian player with random stats and appearance. The creator selects a Women's or Mixed team with Annetta Arslan H; press **New Match** to begin. Created players remain selectable in eligible match types and are saved in this browser's IndexedDB. Saved players belong to the current site origin and device; clearing site data removes them.

- Repository: https://github.com/ant133/littleworld-padel
- Intended website: https://padel.annetta.dev
- Default Pages address: https://ant133.github.io/littleworld-padel/
- [Complete GitHub Pages and custom-domain setup](docs/GITHUB_PAGES.md)
- [Architecture and module boundaries](CONTRACT.md)
- [Testing summary](docs/TESTING.md)

## Build

Use Node.js 22 or later. No npm install is needed.

```sh
node tools/dupcheck.js
node tools/build.js
```

The output files are `dist/littleworld-online.html` (three.js r128 from cdnjs) and `dist/littleworld-offline.html` (three.js embedded). Open either in a browser. The offline file can be saved and opened without a network connection.

Pushing to `main` runs `.github/workflows/pages.yml`, builds the project, and deploys the online page plus the offline download to GitHub Pages. Enable GitHub Actions as the Pages source once, as described in the setup guide.
