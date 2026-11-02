# Littleworld Jakarta Padel Cup

A physics-driven 3D pixel-art doubles padel diorama for annetta.dev.

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
