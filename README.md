# Joging

Private-first route tracker for the web and installable PWA. The app is designed to keep route data on the user's device and to work without a network connection after installation and map import.

## Current foundation

- Vite + TypeScript, without a framework layer.
- MapLibre GL JS for the map renderer.
- PMTiles for single-file offline map archives.
- IndexedDB for locally storing the selected map archive.
- Vite PWA / Workbox for caching the application shell.
- Manual map selection: click the map to place a pin, then drag the pin to adjust it. just that ^^

## Project structure

```text
.
├── main-site/
│   ├── index.html
│   ├── public/
│   │   └── icons/
│   │       └── app-icon.svg
│   └── src/
│       ├── map/
│       │   └── offline-map.ts
│       ├── storage/
│       │   └── map-store.ts
│       ├── main.ts
│       ├── styles.css
│       └── vite-env.d.ts
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Development

Requires Node.js 20.19 or newer.

```sh
pnpm install
pnpm dev
```

Create a production build:

```sh
pnpm build
pnpm preview
```

The production output is written to `dist/`.

## Offline map format

Joging does not request tiles from a public tile server. Import a local `.pmtiles` archive using **Impor peta**. The archive is validated in the browser, stored in IndexedDB, and read through PMTiles' browser `FileSource`. The selected archive is never uploaded by the app.

Supported archives in this initial map foundation:

- Raster PMTiles: PNG, JPEG, WebP, and AVIF.
- Vector PMTiles: MVT archives using the Protomaps basemap layer schema. The initial local style renders land use, water, buildings, and roads. Text labels and POI symbols will be added with locally bundled glyph and sprite assets in a later map polish pass.

No basemap dataset is committed to this repository. Map datasets can be large and have different geographic coverage and licensing terms; importing a region-specific file keeps the initial PWA download small. Always retain the archive's required attribution and follow its data licence.

## Offline and privacy boundaries

- The service worker precaches the built app shell and static assets.
- The map archive is stored separately in IndexedDB, not in the service worker cache.
- MapLibre reads the selected archive from a local browser `File` object using PMTiles `FileSource`. There is no remote style URL, tile URL, geocoder, analytics script, or application API in this setup.
- This foundation does not call the Geolocation API. GPS access will only be introduced later behind an explicit one-shot user action with `getCurrentPosition()`; continuous `watchPosition()` tracking is not part of the design.
- Clearing browser site data can remove locally stored maps and, later, trip history. Users should export important trip records when an export feature is added.

The app's first visit and updates still require the browser to download the web app from its hosting origin. After the service worker has installed and the map archive has been imported, the app and map can be used offline.
