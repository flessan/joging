import * as maplibregl from "maplibre-gl";
import {
  FileSource,
  PMTiles,
  Protocol,
  TileType,
  type Header
} from "pmtiles";

import "maplibre-gl/dist/maplibre-gl.css";

export interface SelectedCoordinate {
  latitude: number;
  longitude: number;
}

export interface OfflineMapCallbacks {
  onCoordinateChange?: (coordinate: SelectedCoordinate) => void;
  onMapReady?: () => void;
  onMapError?: (message: string) => void;
}

export interface OfflineMapHandle {
  map: maplibregl.Map;
  destroy: () => void;
}

const protocol = new Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

const LOCAL_ARCHIVE_NAME = "joging-offline-map.pmtiles";
const LOCAL_ARCHIVE_URL = `pmtiles://${LOCAL_ARCHIVE_NAME}`;

function getAttribution(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") return "";

  const attribution = (metadata as { attribution?: unknown }).attribution;
  return typeof attribution === "string" ? attribution : "";
}

function createVectorStyle(attribution: string): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      basemap: {
        type: "vector",
        url: LOCAL_ARCHIVE_URL,
        ...(attribution ? { attribution } : {})
      }
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": "#edf2f3" }
      },
      {
        id: "landuse",
        type: "fill",
        source: "basemap",
        "source-layer": "landuse",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: {
          "fill-color": "#e1e9df",
          "fill-opacity": 0.88
        }
      },
      {
        id: "water",
        type: "fill",
        source: "basemap",
        "source-layer": "water",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: {
          "fill-color": "#bfd9e5",
          "fill-opacity": 0.96
        }
      },
      {
        id: "buildings",
        type: "fill",
        source: "basemap",
        "source-layer": "buildings",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: {
          "fill-color": "#d5d9d7",
          "fill-outline-color": "#c2cbc9"
        }
      },
      {
        id: "roads",
        type: "line",
        source: "basemap",
        "source-layer": "roads",
        filter: ["==", ["geometry-type"], "LineString"],
        paint: {
          "line-color": "#fffdf8",
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5, 0.45,
            11, 1.2,
            16, 4.5
          ],
          "line-opacity": 0.98
        }
      }
    ]
  };
}

function createRasterStyle(attribution: string): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      basemap: {
        type: "raster",
        url: LOCAL_ARCHIVE_URL,
        tileSize: 256,
        ...(attribution ? { attribution } : {})
      }
    },
    layers: [
      {
        id: "offline-raster",
        type: "raster",
        source: "basemap",
        paint: {
          "raster-fade-duration": 0
        }
      }
    ]
  };
}

function isRasterTileType(tileType: TileType): boolean {
  return [
    TileType.Png,
    TileType.Jpeg,
    TileType.Webp,
    TileType.Avif
  ].includes(tileType);
}

export async function inspectOfflineMap(file: File): Promise<Header> {
  if (!file.name.toLowerCase().endsWith(".pmtiles")) {
    throw new Error("Pilih berkas dengan ekstensi .pmtiles.");
  }

  if (file.size < 127) {
    throw new Error("Berkas terlalu kecil untuk menjadi arsip PMTiles yang valid.");
  }

  const archive = new PMTiles(new FileSource(file));
  const header = await archive.getHeader();

  if (header.tileType !== TileType.Mvt && !isRasterTileType(header.tileType)) {
    throw new Error("Jenis tile ini belum didukung. Gunakan PMTiles raster atau vector MVT.");
  }

  return header;
}

export async function mountOfflineMap(
  container: HTMLElement,
  file: File,
  callbacks: OfflineMapCallbacks = {}
): Promise<OfflineMapHandle> {
  const localFile = new File([file], LOCAL_ARCHIVE_NAME, {
    type: "application/vnd.pmtiles",
    lastModified: file.lastModified
  });
  const archive = new PMTiles(new FileSource(localFile));
  const header = await archive.getHeader();

  if (header.tileType !== TileType.Mvt && !isRasterTileType(header.tileType)) {
    throw new Error("Jenis tile ini belum didukung. Gunakan PMTiles raster atau vector MVT.");
  }

  const metadata = await archive.getMetadata().catch(() => ({}));
  const attribution = getAttribution(metadata);

  // The archive is registered by its local FileSource key, never by a remote URL.
  protocol.add(archive);

  const style = header.tileType === TileType.Mvt
    ? createVectorStyle(attribution)
    : createRasterStyle(attribution);

  const map = new maplibregl.Map({
    container,
    style,
    center: [header.centerLon, header.centerLat],
    zoom: Math.min(Math.max(header.centerZoom, 2), header.maxZoom),
    minZoom: Math.max(0, header.minZoom),
    maxZoom: header.maxZoom,
    attributionControl: false,
    renderWorldCopies: false
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

  if (attribution) {
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right"
    );
  }

  let marker: maplibregl.Marker | undefined;

  const publishCoordinate = (): void => {
    if (!marker) return;
    const point = marker.getLngLat();
    callbacks.onCoordinateChange?.({
      latitude: point.lat,
      longitude: point.lng
    });
  };

  map.on("click", (event) => {
    if (!marker) {
      marker = new maplibregl.Marker({
        color: "#2f6e87",
        draggable: true
      })
        .setLngLat(event.lngLat)
        .addTo(map);

      marker.on("dragend", publishCoordinate);
    } else {
      marker.setLngLat(event.lngLat);
    }

    publishCoordinate();
  });

  map.once("load", () => callbacks.onMapReady?.());
  map.on("error", (event) => {
    const message = event.error instanceof Error
      ? event.error.message
      : "Peta gagal memuat salah satu bagian.";
    callbacks.onMapError?.(message);
  });

  return {
    map,
    destroy: () => {
      marker?.remove();
      map.remove();
    }
  };
}
