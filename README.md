# Joging

A plug-and-play, privacy-first journey tracker for the web and installable PWA. No account, no PMTiles download, and no background GPS tracking.

## Use it

1. Open Joging over HTTPS.
2. Press **Mulai perjalanan** and allow a one-shot location request, or tap the map to choose a manual checkpoint.
3. Press **Istirahat** to save a rest point and pause the active timer.
4. Press **Lanjutkan** when you are ready to move again.
5. Press **Selesai** to save the journey summary.

The map appears automatically. It uses the standard OpenStreetMap raster tile service and therefore needs an internet connection. No map archive or API key needs to be prepared.

## Journey statistics

After finishing a trip, Joging shows:

- Estimated checkpoint-to-checkpoint distance.
- Total elapsed time, active time, and rest time.
- Average speed and average pace.
- Checkpoint count and XP earned.
- Local history, level progress, daily streak, and achievement badges.

**Distance limitation:** GPS is sampled only after an explicit button press with `getCurrentPosition()`. Joging does not use continuous `watchPosition()` tracking. Distance is calculated with the Haversine formula between saved checkpoints as straight-line segments. It is an estimate and can be shorter than the actual streets or footpaths travelled. For better estimates, save occasional rest/resume checkpoints or add manual points on the map.

## Gamification

Trips award XP based on distance and active time. Milestone badges add bonus XP. Levels, badges, streaks, and trip history are stored locally in the browser. Use the export button to download a JSON backup of completed trips and progress.

## Privacy boundaries

- No account, analytics, tracking SDK, application backend, or upload endpoint.
- Trip checkpoints, timestamps, statistics, XP, and history remain in browser IndexedDB.
- Location is requested only after a user action. The app never starts a background GPS watcher.
- When GPS is unavailable, a user-selected map point can be used as a manual checkpoint.
- The OpenStreetMap tile server receives normal map tile requests. Like any external map provider, it can receive the browser's IP address and the tile coordinates for the map area being viewed. Joging does not send its saved trip history or checkpoint list to that service.
- The app shell is precached as a PWA. The basemap itself is not promised to work offline; the public OpenStreetMap tile service does not permit bulk tile downloads or offline prefetching. Follow the [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/).

Clearing browser site data can remove local trip history and gamification progress. Export a backup before clearing site data or changing browsers.

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

## Stack

- Vite + TypeScript.
- MapLibre GL JS with OpenStreetMap raster tiles.
- IndexedDB through `idb-keyval`.
- Vite PWA / Workbox for the application shell.
