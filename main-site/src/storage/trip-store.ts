import { createStore, get, set } from "idb-keyval";
import type { RoutePoint } from "../map/trip-map";

const store = createStore("joging-private-data", "journeys");
const APP_DATA_KEY = "app-data";

export interface ActiveTrip {
  id: string;
  startedAt: number;
  lastResumedAt: number;
  activeMs: number;
  points: RoutePoint[];
  pausedAt?: number;
}

export interface SavedTrip {
  id: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  activeMs: number;
  restMs: number;
  distanceMeters: number;
  averageSpeedKmh: number;
  averagePaceSecondsPerKm: number | null;
  checkpointCount: number;
  points: RoutePoint[];
  xpEarned: number;
}

export interface AppData {
  trips: SavedTrip[];
  xp: number;
  unlockedBadges: string[];
  activeTrip: ActiveTrip | null;
}

export const DEFAULT_APP_DATA: AppData = {
  trips: [],
  xp: 0,
  unlockedBadges: [],
  activeTrip: null
};

export async function loadAppData(): Promise<AppData> {
  const saved = await get<Partial<AppData>>(APP_DATA_KEY, store);
  return {
    ...DEFAULT_APP_DATA,
    ...saved,
    trips: Array.isArray(saved?.trips) ? saved.trips : [],
    unlockedBadges: Array.isArray(saved?.unlockedBadges) ? saved.unlockedBadges : [],
    activeTrip: saved?.activeTrip ?? null
  };
}

export async function saveAppData(data: AppData): Promise<void> {
  await set(APP_DATA_KEY, data, store);
}
