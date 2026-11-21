import "./styles.css";

import { registerSW } from "virtual:pwa-register";
import {
  formatFileSize,
  getStoredOfflineMap,
  removeStoredOfflineMap,
  saveOfflineMap
} from "./storage/map-store";
import {
  inspectOfflineMap,
  mountOfflineMap,
  type OfflineMapHandle,
  type SelectedCoordinate
} from "./map/offline-map";

const importButton = document.querySelector<HTMLButtonElement>("#import-map-button");
const emptyImportButton = document.querySelector<HTMLButtonElement>("#empty-import-button");
const fileInput = document.querySelector<HTMLInputElement>("#map-file-input");
const removeButton = document.querySelector<HTMLButtonElement>("#remove-map-button");
const mapContainer = document.querySelector<HTMLDivElement>("#map");
const mapEmpty = document.querySelector<HTMLDivElement>("#map-empty");
const mapLoading = document.querySelector<HTMLDivElement>("#map-loading");
const mapName = document.querySelector<HTMLElement>("#map-file-name");
const mapMeta = document.querySelector<HTMLElement>("#map-file-meta");
const mapFeedback = document.querySelector<HTMLDivElement>("#map-feedback");
const coordinateValue = document.querySelector<HTMLElement>("#coordinate-value");
const updateBanner = document.querySelector<HTMLDivElement>("#update-banner");
const updateButton = document.querySelector<HTMLButtonElement>("#update-button");

if (
  !importButton ||
  !emptyImportButton ||
  !fileInput ||
  !removeButton ||
  !mapContainer ||
  !mapEmpty ||
  !mapLoading ||
  !mapName ||
  !mapMeta ||
  !mapFeedback ||
  !coordinateValue ||
  !updateBanner ||
  !updateButton
) {
  throw new Error("Elemen aplikasi tidak lengkap.");
}

let mapHandle: OfflineMapHandle | undefined;

function setFeedback(message: string, isError = false): void {
  mapFeedback.textContent = message;
  mapFeedback.classList.toggle("is-error", isError);
}

function updateCoordinate(coordinate: SelectedCoordinate): void {
  const latitude = coordinate.latitude.toFixed(6);
  const longitude = coordinate.longitude.toFixed(6);
  coordinateValue.textContent = `${latitude}, ${longitude}`;
}

function setMapDetails(name: string, size: number, importedAt?: number): void {
  mapName.textContent = name;
  const importedLabel = importedAt
    ? new Intl.DateTimeFormat("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric"
      }).format(importedAt)
    : "Baru saja";

  mapMeta.textContent = `${formatFileSize(size)} · Disimpan di perangkat · ${importedLabel}`;
  removeButton.disabled = false;
  document.querySelector("#file-status-dot")?.classList.add("is-ready");
}

function resetMapDetails(): void {
  mapName.textContent = "Belum ada peta tersimpan";
  mapMeta.textContent = "Peta akan disimpan di perangkat ini.";
  removeButton.disabled = true;
  document.querySelector("#file-status-dot")?.classList.remove("is-ready");
  coordinateValue.textContent = "Belum ada titik dipilih";
}

async function activateMap(
  file: File,
  options: { persist: boolean; importedAt?: number }
): Promise<void> {
  mapLoading.hidden = false;
  mapEmpty.hidden = true;
  importButton.disabled = true;
  setFeedback("Memeriksa arsip peta lokal...");

  mapHandle?.destroy();
  mapHandle = undefined;

  try {
    await inspectOfflineMap(file);

    if (options.persist) {
      await saveOfflineMap(file);
      try {
        await navigator.storage?.persist?.();
      } catch {
        // Persistence is best-effort. IndexedDB remains local even if the browser declines it.
      }
    }

    mapHandle = await mountOfflineMap(mapContainer, file, {
      onCoordinateChange: updateCoordinate,
      onMapReady: () => setFeedback("Peta siap. Ketuk lokasi untuk menaruh pin, lalu geser pin untuk mengaturnya."),
      onMapError: (message) => setFeedback(message, true)
    });

    mapEmpty.hidden = true;
    setMapDetails(file.name, file.size, options.importedAt);
    setFeedback("Peta dibuka dari penyimpanan lokal. Tidak ada tile yang diminta dari internet.");
  } catch (error) {
    mapEmpty.hidden = false;
    setFeedback(
      error instanceof Error ? error.message : "Peta tidak dapat dibuka.",
      true
    );
    throw error;
  } finally {
    mapLoading.hidden = true;
    importButton.disabled = false;
  }
}

async function importSelectedMap(file: File): Promise<void> {
  try {
    await activateMap(file, { persist: true });
  } catch {
    // The visible status message already explains why the import failed.
  }
}

async function restoreSavedMap(): Promise<void> {
  try {
    const storedMap = await getStoredOfflineMap();
    if (!storedMap) return;

    const file = new File([storedMap.blob], storedMap.name, {
      type: "application/vnd.pmtiles",
      lastModified: storedMap.importedAt
    });

    await activateMap(file, {
      persist: false,
      importedAt: storedMap.importedAt
    });
  } catch {
    mapEmpty.hidden = false;
    resetMapDetails();
  }
}

async function removeMap(): Promise<void> {
  mapHandle?.destroy();
  mapHandle = undefined;
  await removeStoredOfflineMap();
  mapContainer.replaceChildren();
  mapEmpty.hidden = false;
  resetMapDetails();
  setFeedback("Arsip peta lokal telah dihapus dari penyimpanan browser.");
}

const openFilePicker = (): void => fileInput.click();

importButton.addEventListener("click", openFilePicker);
emptyImportButton.addEventListener("click", openFilePicker);

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  fileInput.value = "";
  if (file) void importSelectedMap(file);
});

removeButton.addEventListener("click", () => {
  void removeMap().catch(() => setFeedback("Peta gagal dihapus dari penyimpanan.", true));
});

const updateSW = registerSW({
  onNeedRefresh() {
    updateBanner.hidden = false;
  },
  onOfflineReady() {
    setFeedback("Aplikasi siap dibuka kembali tanpa koneksi internet.");
  }
});

updateButton.addEventListener("click", () => {
  void updateSW(true);
});

void restoreSavedMap();
