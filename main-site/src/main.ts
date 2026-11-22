import "./styles.css";
import { registerSW } from "virtual:pwa-register";
import { createTripMap, type Coordinate, type RoutePoint, type TripMapHandle } from "./map/trip-map";
import {
  DEFAULT_APP_DATA,
  loadAppData,
  saveAppData,
  type ActiveTrip,
  type AppData,
  type SavedTrip
} from "./storage/trip-store";

const $ = <T extends HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Elemen wajib tidak ditemukan: ${selector}`);
  return element;
};

const el = {
  map: $("#map"),
  mapState: $("#map-state-label"),
  sessionTitle: $("#session-title"),
  followToggle: $("#follow-toggle"),
  drawerLevelLabel: $("#drawer-level-label"),
  detailsDrawer: $("#details-drawer") as HTMLDialogElement,
  drawerTrigger: $("#open-details-drawer") as HTMLButtonElement,
  drawerClose: $("#close-details-drawer") as HTMLButtonElement,
  drawerDragHandle: $("#drawer-drag-handle") as HTMLDivElement,
  drawerContent: $("#drawer-content") as HTMLDivElement,
  mapHint: $("#map-hint"),
  selectedLabel: $("#selected-label"),
  selectedCoordinate: $("#selected-coordinate"),
  clearSelection: $("#clear-selection"),
  refreshLocation: $("#refresh-location"),
  start: $("#start-button"),
  rest: $("#rest-button"),
  resume: $("#resume-button"),
  finish: $("#finish-button"),
  finishPaused: $("#finish-paused-button"),
  activeActions: $("#active-actions"),
  pausedActions: $("#paused-actions"),
  status: $("#session-status"),
  help: $("#session-help"),
  distance: $("#live-distance"),
  duration: $("#live-duration"),
  checkpoints: $("#live-checkpoints"),
  speed: $("#live-speed"),
  levelNumber: $("#level-number"),
  levelName: $("#level-name"),
  xpLabel: $("#xp-label"),
  xpProgress: $("#xp-progress"),
  xpNext: $("#xp-next"),
  streak: $("#streak-count"),
  badgeCount: $("#badge-count"),
  badgeGrid: $("#badge-grid"),
  tripCount: $("#trip-count"),
  history: $("#history-list"),
  result: $("#result-section"),
  resultSubtitle: $("#result-subtitle"),
  resultDistance: $("#result-distance"),
  resultXp: $("#result-xp"),
  resultTotal: $("#result-total-time"),
  resultActive: $("#result-active-time"),
  resultRest: $("#result-rest-time"),
  resultPace: $("#result-pace"),
  resultSpeed: $("#result-speed"),
  resultStops: $("#result-stops"),
  earnedBadges: $("#earned-badges"),
  closeResult: $("#close-result"),
  export: $("#export-button"),
  toast: $("#toast"),
  updateBanner: $("#update-banner"),
  update: $("#update-button")
};

type Phase = "idle" | "active" | "paused";
let appData: AppData = { ...DEFAULT_APP_DATA };
let currentTrip: ActiveTrip | null = null;
let phase: Phase = "idle";
let selectedPoint: Coordinate | null = null;
let busy = false;
let toastTimeout: ReturnType<typeof setTimeout> | undefined;
let locationWatchId: number | null = null;
let lastLocationWatchError: number | null = null;

const BADGES = [
  { id: "first-trip", title: "Langkah Pertama", description: "Selesaikan perjalanan pertamamu.", reward: 30, requirement: "1 perjalanan" },
  { id: "first-km", title: "Satu Kilometer", description: "Kumpulkan total jarak 1 km.", reward: 25, requirement: "Total 1 km" },
  { id: "five-km", title: "Penjelajah", description: "Kumpulkan total jarak 5 km.", reward: 40, requirement: "Total 5 km" },
  { id: "five-trips", title: "Mulai Konsisten", description: "Selesaikan lima perjalanan.", reward: 50, requirement: "5 perjalanan" },
  { id: "ten-km", title: "Sepuluh Kilometer", description: "Kumpulkan total jarak 10 km.", reward: 75, requirement: "Total 10 km" },
  { id: "three-days", title: "Jaga Ritme", description: "Berjalan selama tiga hari berbeda secara beruntun.", reward: 40, requirement: "Streak 3 hari" }
] as const;

let mapHandle: TripMapHandle | undefined;
mapHandle = createTripMap(
  el.map,
  (coordinate) => {
    el.selectedLabel.textContent = "Titik manual dipilih";
    el.selectedCoordinate.textContent = `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`;
    el.mapHint.hidden = true;

    if (phase === "active" && currentTrip) {
      selectedPoint = null;
      mapHandle?.setSelected(null);
      addPoint({
        ...coordinate,
        at: Date.now(),
        label: "Jejak",
        source: "manual"
      });
      void persist().catch(() => notify("Checkpoint manual gagal disimpan.", true));
      notify("Titik manual ditambahkan ke jejak perjalanan.");
    } else {
      selectedPoint = coordinate;
    }
  },
  () => {
    el.mapState.textContent = "Peta siap";
    if (currentTrip?.points.length) mapHandle?.setRoute(currentTrip.points);
  },
  (message) => {
    el.mapState.textContent = "Peta tidak lengkap";
    console.warn("Joging map:", message);
  },
  (enabled) => {
    el.followToggle.setAttribute("aria-pressed", String(enabled));
    el.followToggle.classList.toggle("is-enabled", enabled);
  }
);

function notify(message: string, isError = false): void {
  el.toast.textContent = message;
  el.toast.classList.toggle("is-error", isError);
  el.toast.hidden = false;
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { el.toast.hidden = true; }, 3600);
}

function syncStatsDrawerState(): void {
  el.drawerTrigger.setAttribute("aria-expanded", String(el.detailsDrawer.open));
}

function openStatsDrawer(): void {
  if (el.detailsDrawer.open) return;
  el.detailsDrawer.showModal();
  syncStatsDrawerState();
}

function closeStatsDrawer(): void {
  if (el.detailsDrawer.open) el.detailsDrawer.close();
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function formatCompactDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}j ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}d`;
  return `${seconds}d`;
}

function formatPace(secondsPerKm: number | null): string {
  if (secondsPerKm === null || !Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return "-";
  const seconds = Math.round(secondsPerKm);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} /km`;
}

function calculateDistance(points: RoutePoint[]): number {
  if (points.length < 2) return 0;
  const radius = 6371000;
  let total = 0;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const lat1 = previous.latitude * Math.PI / 180;
    const lat2 = current.latitude * Math.PI / 180;
    const deltaLat = (current.latitude - previous.latitude) * Math.PI / 180;
    const deltaLon = (current.longitude - previous.longitude) * Math.PI / 180;
    const a = Math.sin(deltaLat / 2) ** 2
      + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
    total += radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  return total;
}

function getActiveTime(now = Date.now()): number {
  if (!currentTrip) return 0;
  return currentTrip.activeMs + (phase === "active" ? Math.max(0, now - currentTrip.lastResumedAt) : 0);
}

function getTotalTime(now = Date.now()): number {
  return currentTrip ? Math.max(0, now - currentTrip.startedAt) : 0;
}

function updateLiveStats(): void {
  const points = currentTrip?.points ?? [];
  const distance = calculateDistance(points);
  const activeMs = getActiveTime();
  const totalMs = getTotalTime();
  const km = distance / 1000;
  const speed = activeMs > 0 ? km / (activeMs / 3600000) : 0;

  el.distance.innerHTML = `${km.toFixed(2)} <small>km</small>`;
  el.duration.textContent = currentTrip ? formatDuration(totalMs) : "00:00:00";
  el.checkpoints.textContent = String(points.length);
  el.speed.innerHTML = speed > 0 ? `${speed.toFixed(1)} <small>km/j</small>` : '- <small>km/j</small>';
}

function setPhase(nextPhase: Phase): void {
  phase = nextPhase;
  el.start.hidden = nextPhase !== "idle";
  el.activeActions.hidden = nextPhase !== "active";
  el.pausedActions.hidden = nextPhase !== "paused";

  const labels: Record<Phase, string> = {
    idle: "Belum dimulai",
    active: "Sedang berjalan",
    paused: "Sedang istirahat"
  };
  el.status.innerHTML = `<span></span>${labels[nextPhase]}`;
  el.status.className = `session-status is-${nextPhase}`;

  if (nextPhase === "idle") {
    el.sessionTitle.textContent = "Siap berangkat?";
    el.help.textContent = "Mulai untuk merekam jejak GPS. Ketuk peta untuk menambah titik manual.";
  } else if (nextPhase === "active") {
    el.sessionTitle.textContent = "Perjalanan berlangsung";
    el.help.textContent = "Jejak GPS aktif. Garis rute mengikuti posisi selama halaman terbuka.";
  } else {
    el.sessionTitle.textContent = "Sedang istirahat";
    el.help.textContent = "Jejak GPS dijeda. Pin tidur sudah ditambahkan di lokasi istirahat.";
  }

  updateLiveStats();
}

function getOneShotPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Browser ini tidak menyediakan GPS. Pilih titik manual di peta."));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, (error) => {
      const messages: Record<number, string> = {
        1: "Izin lokasi ditolak.",
        2: "Lokasi belum dapat ditemukan.",
        3: "GPS terlalu lama merespons."
      };
      reject(new Error(messages[error.code] ?? "Lokasi tidak dapat dibaca."));
    }, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15000
    });
  });
}

function consumeSelectedPoint(): Coordinate | null {
  const point = selectedPoint;
  selectedPoint = null;
  return point;
}

function createManualRoutePoint(coordinate: Coordinate, label: RoutePoint["label"]): RoutePoint {
  const point: RoutePoint = { ...coordinate, at: Date.now(), label, source: "manual" };
  mapHandle?.setSelected(null);
  el.selectedLabel.textContent = "Checkpoint manual tersimpan";
  el.selectedCoordinate.textContent = `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`;
  el.mapHint.hidden = true;
  return point;
}

async function capturePoint(label: RoutePoint["label"]): Promise<RoutePoint> {
  // A map tap is an explicit manual choice and takes priority over GPS.
  const manualSelection = consumeSelectedPoint();
  if (manualSelection) return createManualRoutePoint(manualSelection, label);

  try {
    const position = await getOneShotPosition();

    // Read the selection through a helper because a map tap may happen while GPS is pending.
    const pendingManualSelection = consumeSelectedPoint();
    if (pendingManualSelection) return createManualRoutePoint(pendingManualSelection, label);

    const point: RoutePoint = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      at: position.timestamp || Date.now(),
      label,
      source: "gps"
    };
    el.selectedLabel.textContent = "Lokasi GPS terakhir";
    el.selectedCoordinate.textContent = `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}${Number.isFinite(position.coords.accuracy) ? ` · akurasi ±${Math.round(position.coords.accuracy)} m` : ""}`;
    el.mapHint.hidden = true;
    mapHandle?.setCurrentLocation(point);
    mapHandle?.flyTo(point);
    return point;
  } catch (error) {
    // A manual tap should still win even if the pending GPS request fails.
    const pendingManualSelection = consumeSelectedPoint();
    if (pendingManualSelection) return createManualRoutePoint(pendingManualSelection, label);

    const lastPoint = currentTrip?.points[currentTrip.points.length - 1];
    if (lastPoint) {
      notify("GPS tidak tersedia. Checkpoint terakhir digunakan sebagai perkiraan.", true);
      return { ...lastPoint, at: Date.now(), label, source: "manual" };
    }
    throw error instanceof Error ? error : new Error("Tidak dapat mengambil lokasi.");
  }
}

function addPoint(point: RoutePoint): void {
  if (!currentTrip) return;
  const previous = currentTrip.points[currentTrip.points.length - 1];
  const separation = previous ? calculateDistance([previous, point]) : 0;

  // Ignore tiny jitter only between ordinary trail samples. Keep rest/start/end pins.
  if (previous && previous.label === "Jejak" && point.label === "Jejak" && separation < 4) {
    return;
  }

  currentTrip.points.push(point);
  mapHandle?.setRoute(currentTrip.points);
  updateLiveStats();
}

async function persist(): Promise<void> {
  appData.activeTrip = currentTrip;
  await saveAppData(appData);
}

function stopLocationTrail(): void {
  if (locationWatchId !== null && "geolocation" in navigator) {
    navigator.geolocation.clearWatch(locationWatchId);
  }
  locationWatchId = null;
}

function appendGpsTrailPoint(position: GeolocationPosition, persistImmediately = true): boolean {
  if (phase !== "active" || !currentTrip || document.hidden) return false;

  const accuracy = position.coords.accuracy;
  const coordinate: Coordinate = {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude
  };

  mapHandle?.setCurrentLocation(coordinate);

  // Avoid drawing noisy segments when the browser reports a weak GPS fix.
  if (Number.isFinite(accuracy) && accuracy > 100) {
    el.mapState.textContent = "Menunggu sinyal GPS lebih akurat";
    return false;
  }

  const previous = currentTrip.points[currentTrip.points.length - 1];
  const point: RoutePoint = {
    ...coordinate,
    at: position.timestamp || Date.now(),
    label: "Jejak",
    source: "gps"
  };

  if (previous) {
    const distance = calculateDistance([previous, point]);
    const elapsedSeconds = Math.max(1, (point.at - previous.at) / 1000);
    // Drop implausible jumps instead of inflating route distance.
    if (distance / elapsedSeconds > 15) {
      el.mapState.textContent = "Menyaring lonjakan GPS";
      return false;
    }
    if (distance < 4) return false;
  }

  addPoint(point);
  el.mapState.textContent = "Jejak GPS aktif";
  if (persistImmediately) {
    void persist().catch(() => notify("Penyimpanan checkpoint GPS gagal.", true));
  }
  return true;
}

function startLocationTrail(): void {
  if (locationWatchId !== null || phase !== "active") return;
  if (!("geolocation" in navigator)) {
    el.mapState.textContent = "GPS tidak tersedia";
    notify("GPS tidak tersedia. Kamu masih bisa menambahkan titik manual di peta.", true);
    return;
  }

  lastLocationWatchError = null;
  el.mapState.textContent = "Mengaktifkan jejak GPS...";
  locationWatchId = navigator.geolocation.watchPosition(
    (position) => {
      lastLocationWatchError = null;
      if (appendGpsTrailPoint(position)) {
        el.mapState.textContent = "Jejak GPS aktif";
      }
    },
    (error) => {
      const isNewError = lastLocationWatchError !== error.code;
      lastLocationWatchError = error.code;
      if (error.code === 1) {
        stopLocationTrail();
        el.mapState.textContent = "Izin GPS ditolak";
        if (isNewError) notify("Izin GPS ditolak. Gunakan Perbarui lokasi atau checkpoint manual.", true);
      } else {
        el.mapState.textContent = "Menunggu sinyal GPS";
        if (isNewError) notify("Sinyal GPS belum stabil. Jejak akan dilanjutkan saat lokasi tersedia.", true);
      }
    },
    {
      enableHighAccuracy: true,
      maximumAge: 2500,
      timeout: 20000
    }
  );
}

async function refreshCurrentLocation(): Promise<void> {
  el.mapState.textContent = "Memperbarui lokasi...";
  const position = await getOneShotPosition();
  const coordinate: Coordinate = {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude
  };

  mapHandle?.setFollow(true);
  mapHandle?.setCurrentLocation(coordinate);
  mapHandle?.flyTo(coordinate);
  el.selectedLabel.textContent = "Lokasi saat ini";
  el.selectedCoordinate.textContent = `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)} · akurasi ±${Math.round(position.coords.accuracy)} m`;
  el.mapHint.hidden = true;

  if (phase === "active" && currentTrip) {
    selectedPoint = null;
    const accepted = appendGpsTrailPoint(position, false);
    if (accepted) {
      await persist();
      notify("Lokasi terbaru ditambahkan ke jejak perjalanan.");
    } else if (position.coords.accuracy > 100) {
      notify("Lokasi ditemukan, tetapi akurasinya terlalu rendah untuk ditambahkan ke jejak.", true);
    } else {
      notify("Posisi diperbarui, tetapi tidak ditambahkan karena terlalu dekat atau lonjakan GPS tidak wajar.");
    }
  } else {
    selectedPoint = coordinate;
    notify("Lokasi diperbarui. Titik ini siap dipakai sebagai checkpoint berikutnya.");
  }

  if (phase !== "active") el.mapState.textContent = "Lokasi diperbarui";
}

async function startJourney(): Promise<void> {
  if (phase !== "idle") return;
  const point = await capturePoint("Mulai");
  const now = Date.now();
  currentTrip = {
    id: crypto.randomUUID(),
    startedAt: now,
    lastResumedAt: now,
    activeMs: 0,
    points: [point]
  };
  await persist();
  mapHandle?.setRoute(currentTrip.points);
  setPhase("active");
  mapHandle?.setFollow(true);
  startLocationTrail();
  notify(point.source === "gps" ? "Perjalanan dimulai. Jejak GPS aktif selama perjalanan berjalan." : "Perjalanan dimulai dari titik manual. Jejak GPS aktif.");
}

async function pauseJourney(): Promise<void> {
  if (!currentTrip || phase !== "active") return;
  const point = await capturePoint("Istirahat");
  stopLocationTrail();
  const now = Date.now();
  currentTrip.activeMs += Math.max(0, now - currentTrip.lastResumedAt);
  currentTrip.pausedAt = now;
  addPoint(point);
  await persist();
  setPhase("paused");
  notify("Checkpoint istirahat disimpan. Timer aktif dijeda.");
}

async function resumeJourney(): Promise<void> {
  if (!currentTrip || phase !== "paused") return;
  const point = await capturePoint("Lanjut");
  const now = Date.now();
  addPoint(point);
  currentTrip.lastResumedAt = now;
  delete currentTrip.pausedAt;
  await persist();
  setPhase("active");
  mapHandle?.setFollow(true);
  startLocationTrail();
  notify("Perjalanan dilanjutkan. Jejak GPS aktif kembali.");
}

function localDayKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function calculateStreak(trips: SavedTrip[]): number {
  const days = new Set(trips.map((trip) => localDayKey(trip.startedAt)));
  if (days.size === 0) return 0;

  const cursor = new Date();
  if (!days.has(localDayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1);

  let streak = 0;
  while (days.has(localDayKey(cursor.getTime()))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function getBadgeUnlocks(trips: SavedTrip[], existing: string[]): typeof BADGES[number][] {
  const totalDistanceKm = trips.reduce((sum, trip) => sum + trip.distanceMeters, 0) / 1000;
  const streak = calculateStreak(trips);
  const earned = new Set(existing);

  return BADGES.filter((badge) => {
    if (earned.has(badge.id)) return false;
    switch (badge.id) {
      case "first-trip": return trips.length >= 1;
      case "first-km": return totalDistanceKm >= 1;
      case "five-km": return totalDistanceKm >= 5;
      case "five-trips": return trips.length >= 5;
      case "ten-km": return totalDistanceKm >= 10;
      case "three-days": return streak >= 3;
      default: return false;
    }
  });
}

function completeTrip(point?: RoutePoint): void {
  if (!currentTrip) return;
  const now = Date.now();
  if (point) addPoint(point);

  const activeMs = getActiveTime(now);
  const durationMs = Math.max(0, now - currentTrip.startedAt);
  const distanceMeters = calculateDistance(currentTrip.points);
  const distanceKm = distanceMeters / 1000;
  const averageSpeedKmh = activeMs > 0 ? distanceKm / (activeMs / 3600000) : 0;
  const averagePaceSecondsPerKm = distanceKm >= 0.03 && activeMs > 0
    ? activeMs / 1000 / distanceKm
    : null;

  const baseXp = 20 + Math.round(distanceKm * 18) + Math.floor(activeMs / 300000) * 2;
  const trip: SavedTrip = {
    id: currentTrip.id,
    startedAt: currentTrip.startedAt,
    endedAt: now,
    durationMs,
    activeMs,
    restMs: Math.max(0, durationMs - activeMs),
    distanceMeters,
    averageSpeedKmh,
    averagePaceSecondsPerKm,
    checkpointCount: currentTrip.points.length,
    points: [...currentTrip.points],
    xpEarned: baseXp
  };

  const nextTrips = [trip, ...appData.trips];
  const newBadges = getBadgeUnlocks(nextTrips, appData.unlockedBadges);
  const badgeXp = newBadges.reduce((sum, badge) => sum + badge.reward, 0);
  trip.xpEarned += badgeXp;

  appData = {
    ...appData,
    trips: nextTrips,
    xp: appData.xp + trip.xpEarned,
    unlockedBadges: [...appData.unlockedBadges, ...newBadges.map((badge) => badge.id)],
    activeTrip: null
  };
  currentTrip = null;
  setPhase("idle");
  mapHandle?.setRoute(trip.points);
  void saveAppData(appData).catch(() => notify("Perjalanan selesai, tetapi penyimpanan browser gagal.", true));
  renderAll();
  showResult(trip, newBadges);
}

async function finishJourney(): Promise<void> {
  if (!currentTrip || phase === "idle") return;
  stopLocationTrail();
  let point: RoutePoint | undefined;
  try {
    point = await capturePoint("Selesai");
  } catch (error) {
    if (currentTrip.points.length === 0) throw error;
    notify("Lokasi akhir tidak didapat. Perjalanan diselesaikan pada checkpoint terakhir.", true);
  }

  // completeTrip reads the active timer once; do not add this interval beforehand.
  completeTrip(point);
}

async function runAction(action: () => Promise<void>): Promise<void> {
  if (busy) return;
  busy = true;
  [el.start, el.rest, el.resume, el.finish, el.finishPaused, el.refreshLocation].forEach((button) => {
    (button as HTMLButtonElement).disabled = true;
  });
  try {
    await action();
  } catch (error) {
    notify(error instanceof Error ? error.message : "Aksi gagal dilakukan.", true);
  } finally {
    busy = false;
    [el.start, el.rest, el.resume, el.finish, el.finishPaused, el.refreshLocation].forEach((button) => {
      (button as HTMLButtonElement).disabled = false;
    });
    setPhase(phase);
  }
}

function showResult(trip: SavedTrip, unlocked: typeof BADGES[number][]): void {
  const km = trip.distanceMeters / 1000;
  el.resultSubtitle.textContent = new Intl.DateTimeFormat("id-ID", {
    dateStyle: "full",
    timeStyle: "short"
  }).format(trip.endedAt);
  el.resultDistance.textContent = `${km.toFixed(2)} km`;
  el.resultXp.textContent = `+${trip.xpEarned} XP`;
  el.resultTotal.textContent = formatCompactDuration(trip.durationMs);
  el.resultActive.textContent = formatCompactDuration(trip.activeMs);
  el.resultRest.textContent = formatCompactDuration(trip.restMs);
  el.resultPace.textContent = formatPace(trip.averagePaceSecondsPerKm);
  el.resultSpeed.textContent = `${trip.averageSpeedKmh.toFixed(1)} km/j`;
  el.resultStops.textContent = String(trip.checkpointCount);

  el.earnedBadges.replaceChildren();
  if (unlocked.length > 0) {
    const title = document.createElement("strong");
    title.textContent = "Lencana baru terbuka";
    const list = document.createElement("div");
    list.className = "earned-badge-list";
    for (const badge of unlocked) {
      const item = document.createElement("span");
      item.className = "earned-badge";
      item.textContent = `${badge.title} · +${badge.reward} XP`;
      list.append(item);
    }
    el.earnedBadges.append(title, list);
    el.earnedBadges.hidden = false;
  } else {
    el.earnedBadges.hidden = true;
  }

  el.result.hidden = false;
  openStatsDrawer();
  requestAnimationFrame(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.result.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  });
}

function renderProgress(): void {
  const level = Math.floor(appData.xp / 100) + 1;
  const currentLevelXp = appData.xp % 100;
  const names = ["Pemula", "Penjelajah", "Pengelana", "Petualang", "Penakluk Jalur", "Legenda"];
  const title = names[Math.min(level - 1, names.length - 1)] ?? "Legenda";
  el.levelNumber.textContent = String(level);
  el.levelName.textContent = `Level ${level} · ${title}`;
  el.drawerLevelLabel.textContent = `Level ${level} · ${title}`;
  el.xpLabel.textContent = `${currentLevelXp} / 100 XP`;
  (el.xpProgress as HTMLElement).style.width = `${currentLevelXp}%`;
  el.xpNext.textContent = `${100 - currentLevelXp} XP menuju level berikutnya`;
  el.streak.textContent = String(calculateStreak(appData.trips));
}

function renderBadges(): void {
  const unlocked = new Set(appData.unlockedBadges);
  el.badgeCount.textContent = `${unlocked.size} / ${BADGES.length}`;
  el.badgeGrid.innerHTML = BADGES.map((badge) => {
    const isUnlocked = unlocked.has(badge.id);
    return `<article class="badge-item ${isUnlocked ? "is-unlocked" : "is-locked"}">
      <span class="badge-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m12 2.8 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8L3.6 8.9l5.8-.8L12 2.8Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg></span>
      <span class="badge-copy"><strong>${badge.title}</strong><small>${isUnlocked ? `Terbuka · +${badge.reward} XP` : badge.requirement}</small></span>
    </article>`;
  }).join("");
}

function renderHistory(): void {
  el.tripCount.textContent = `${appData.trips.length} perjalanan`;
  if (appData.trips.length === 0) {
    el.history.innerHTML = `<div class="empty-history"><span class="empty-history-icon"><svg viewBox="0 0 24 24" fill="none"><path d="M4 6.5h16M6 3v3.5M18 3v3.5M5 10h14v10H5V10Z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="m9 15 2 2 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span><strong>Belum ada perjalanan</strong><span>Perjalanan pertamamu akan muncul di sini.</span></div>`;
    return;
  }

  el.history.innerHTML = appData.trips.slice(0, 8).map((trip) => {
    const date = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(trip.startedAt);
    return `<article class="history-item">
      <span class="history-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M5 18 10 7l3 6 2-4 4 9H5Z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
      <div class="history-main"><strong>${(trip.distanceMeters / 1000).toFixed(2)} km</strong><span>${date} · ${formatCompactDuration(trip.durationMs)} · ${trip.checkpointCount} checkpoint</span></div>
      <span class="history-xp">+${trip.xpEarned} XP</span>
    </article>`;
  }).join("");
}

function renderAll(): void {
  renderProgress();
  renderBadges();
  renderHistory();
  updateLiveStats();
}

function exportHistory(): void {
  const backup = {
    application: "Joging",
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    note: "Data perjalanan dan checkpoint disimpan secara lokal.",
    trips: appData.trips,
    xp: appData.xp,
    unlockedBadges: appData.unlockedBadges
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `joging-backup-${localDayKey(Date.now())}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  notify("Cadangan riwayat berhasil dibuat.");
}

async function initialize(): Promise<void> {
  try {
    appData = await loadAppData();
    currentTrip = appData.activeTrip;
    if (currentTrip) {
      phase = currentTrip.pausedAt ? "paused" : "active";
      mapHandle?.setRoute(currentTrip.points);
      const last = currentTrip.points[currentTrip.points.length - 1];
      if (last) mapHandle?.flyTo(last, 15);
      notify("Perjalanan sebelumnya dipulihkan dari penyimpanan lokal.");
    }
    setPhase(phase);
    if (phase === "active") startLocationTrail();
    renderAll();
  } catch {
    notify("Penyimpanan lokal tidak dapat dibaca. Riwayat mungkin tidak tersedia.", true);
  }
}

el.start.addEventListener("click", () => void runAction(startJourney));
el.rest.addEventListener("click", () => void runAction(pauseJourney));
el.resume.addEventListener("click", () => void runAction(resumeJourney));
el.finish.addEventListener("click", () => void runAction(finishJourney));
el.finishPaused.addEventListener("click", () => void runAction(finishJourney));
el.refreshLocation.addEventListener("click", () => void runAction(refreshCurrentLocation));
el.followToggle.addEventListener("click", () => {
  const enabled = el.followToggle.getAttribute("aria-pressed") !== "true";
  mapHandle?.setFollow(enabled);
});
el.clearSelection.addEventListener("click", () => {
  selectedPoint = null;
  mapHandle?.setSelected(null);
  el.selectedLabel.textContent = "Belum ada titik manual";
  el.selectedCoordinate.textContent = "GPS akan digunakan saat kamu memulai";
});
el.closeResult.addEventListener("click", () => { el.result.hidden = true; });
el.drawerTrigger.addEventListener("click", openStatsDrawer);
el.drawerClose.addEventListener("click", closeStatsDrawer);
el.detailsDrawer.addEventListener("close", syncStatsDrawerState);

// Native dialog handles Escape and focus restoration. Close only when the actual backdrop is clicked.
el.detailsDrawer.addEventListener("click", (event: MouseEvent) => {
  if (event.target !== el.detailsDrawer) return;
  const rect = el.detailsDrawer.getBoundingClientRect();
  const clickedOutside = event.clientX < rect.left || event.clientX > rect.right
    || event.clientY < rect.top || event.clientY > rect.bottom;
  if (clickedOutside) closeStatsDrawer();
});

// The grab handle supports a short downward swipe without stealing scroll gestures from the drawer body.
let drawerPointer: { id: number; startY: number; startedAt: number } | null = null;
function resetDrawerDrag(): void {
  drawerPointer = null;
  el.detailsDrawer.classList.remove("is-dragging");
  el.detailsDrawer.style.removeProperty("translate");
}
el.drawerDragHandle.addEventListener("pointerdown", (event: PointerEvent) => {
  if (!el.detailsDrawer.open || (event.pointerType === "mouse" && event.button !== 0)) return;
  drawerPointer = { id: event.pointerId, startY: event.clientY, startedAt: performance.now() };
  el.detailsDrawer.classList.add("is-dragging");
  el.drawerDragHandle.setPointerCapture(event.pointerId);
});
el.drawerDragHandle.addEventListener("pointermove", (event: PointerEvent) => {
  if (!drawerPointer || drawerPointer.id !== event.pointerId) return;
  const offset = Math.max(0, Math.min(window.innerHeight, event.clientY - drawerPointer.startY));
  el.detailsDrawer.style.setProperty("translate", `0 ${offset}px`);
});
el.drawerDragHandle.addEventListener("pointerup", (event: PointerEvent) => {
  if (!drawerPointer || drawerPointer.id !== event.pointerId) return;
  const distance = event.clientY - drawerPointer.startY;
  const elapsed = Math.max(1, performance.now() - drawerPointer.startedAt);
  const shouldClose = distance > 110 || (distance > 32 && distance / elapsed > 0.65);
  resetDrawerDrag();
  if (shouldClose) closeStatsDrawer();
});
el.drawerDragHandle.addEventListener("pointercancel", resetDrawerDrag);
el.drawerDragHandle.addEventListener("lostpointercapture", () => {
  if (drawerPointer) resetDrawerDrag();
});
el.export.addEventListener("click", exportHistory);

document.addEventListener("visibilitychange", () => {
  if (document.hidden && phase === "active") {
    stopLocationTrail();
    el.mapState.textContent = "Jejak GPS dijeda saat aplikasi tersembunyi";
  } else if (!document.hidden && phase === "active") {
    startLocationTrail();
  }
});

window.addEventListener("pagehide", stopLocationTrail);

const updateSW = registerSW({
  onNeedRefresh() { el.updateBanner.hidden = false; },
  onOfflineReady() { notify("Aplikasi siap dibuka offline. Peta dasar tetap memerlukan internet."); }
});
el.update.addEventListener("click", () => { void updateSW(true); });

void initialize();
window.setInterval(updateLiveStats, 1000);
