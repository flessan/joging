import { createStore, del, get, set } from "idb-keyval";

const store = createStore("joging-private-data", "offline-assets");
const OFFLINE_MAP_KEY = "offline-map";

export interface StoredOfflineMap {
  name: string;
  blob: Blob;
  size: number;
  importedAt: number;
}

export async function getStoredOfflineMap(): Promise<StoredOfflineMap | undefined> {
  return get<StoredOfflineMap>(OFFLINE_MAP_KEY, store);
}

export async function saveOfflineMap(file: File): Promise<void> {
  const storedMap: StoredOfflineMap = {
    name: file.name,
    blob: file.slice(0, file.size, "application/vnd.pmtiles"),
    size: file.size,
    importedAt: Date.now()
  };

  await set(OFFLINE_MAP_KEY, storedMap, store);
}

export async function removeStoredOfflineMap(): Promise<void> {
  await del(OFFLINE_MAP_KEY, store);
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "Ukuran tidak diketahui";
  if (bytes < 1024) return `${bytes} B`;

  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}
