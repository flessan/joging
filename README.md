# Joging

A plug-and-play, privacy-first journey tracker for the web and installable PWA. No account, no PMTiles download, and no GPS before a journey is started.

## Use it

1. Open Joging over HTTPS.
2. Press **Perbarui lokasi** to show your current position, or tap the map to choose a manual point.
3. Press **Mulai perjalanan** to begin the timer and GPS trail.
4. Press **Istirahat** to save a sleep-marked rest checkpoint and pause both the timer and GPS watcher.
5. Press **Lanjutkan** to add a resume checkpoint and restart the GPS trail.
6. Press **Selesai** to save the journey summary and stop location tracking.

The map appears automatically. It uses the standard OpenStreetMap raster tile service and therefore needs an internet connection. No map archive or API key needs to be prepared.

## GPS trail and distance

- **Perbarui lokasi** uses a one-shot `getCurrentPosition()` request. When a journey is active, the refreshed point is also added to the route.
- After the user explicitly starts a journey, Joging uses `watchPosition()` to collect GPS samples and draw a connected route line on the map.
- The watcher stops when the user pauses or finishes the journey. It also stops while the app page is hidden and resumes only when the page is visible again and the journey is still active.
- GPS samples with poor accuracy, tiny movements, or implausible jumps are filtered to reduce map noise.
- Rest checkpoints are shown with a dedicated sleep icon marker. Start, resume, finish, GPS and manual points remain visible along the route.
- When GPS is unavailable, the user can tap the map to add manual points.

Distance is calculated with the Haversine formula between accepted GPS or manual points as straight-line segments. The live trail is more detailed than occasional checkpoints, but it is still an estimate: GPS drift, signal loss, browser throttling, and the distance between samples can make it differ from the route travelled on roads or paths. Mobile browsers may suspend location updates when the app is backgrounded or the screen is locked, so Joging stops its watcher when the page becomes hidden rather than promising background tracking.

## Journey statistics

After finishing a trip, Joging shows:

- Estimated distance.
- Total elapsed time, active time, and rest time.
- Average speed and average pace.
- Checkpoint count and XP earned.
- Local history, level progress, daily streak, and achievement badges.

## Gamification

Trips award XP based on distance and active time. Milestone badges add bonus XP. Levels, badges, streaks, and trip history are stored locally in the browser. Use the export button to download a JSON backup of completed trips and progress.

## Privacy boundaries

- No account, analytics, tracking SDK, application backend, or upload endpoint.
- Trip checkpoints, timestamps, statistics, XP, and history remain in browser IndexedDB.
- Location is never requested before a user action. The continuous GPS watcher runs only during an explicitly started, active, visible-page journey; it stops on rest, finish, and page visibility changes.
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
