import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface RoutePoint extends Coordinate {
  at: number;
  label: "Mulai" | "Istirahat" | "Lanjut" | "Selesai" | "Jejak";
  source: "gps" | "manual";
}

export interface TripMapHandle {
  map: maplibregl.Map;
  setRoute: (points: RoutePoint[], checkpointsChanged?: boolean) => void;
  setSelected: (coordinate: Coordinate | null) => void;
  setCurrentLocation: (coordinate: Coordinate | null) => void;
  setFollow: (enabled: boolean) => void;
  flyTo: (coordinate: Coordinate, zoom?: number) => void;
  destroy: () => void;
}

function createSleepMarker(): HTMLElement {
  const element = document.createElement("div");
  element.className = "rest-map-marker";
  element.setAttribute("role", "img");
  element.setAttribute("aria-label", "Checkpoint istirahat");
  element.innerHTML = `<span class="rest-map-marker-body">
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M19.2 14.7A8.2 8.2 0 0 1 9.3 4.8a8.5 8.5 0 1 0 9.9 9.9Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
      <path d="M14.9 5.3h4l-4 3.7h4M12.2 10.4h3.2l-3.2 3h3.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </span>`;
  return element;
}

function createCurrentLocationMarker(): HTMLElement {
  const element = document.createElement("div");
  element.className = "current-location-marker";
  element.setAttribute("role", "img");
  element.setAttribute("aria-label", "Lokasi saat ini");
  element.innerHTML = '<span></span>';
  return element;
}

export function createTripMap(
  container: HTMLElement,
  onManualPoint: (coordinate: Coordinate) => void,
  onReady: () => void,
  onError: (message: string) => void,
  onFollowChange: (enabled: boolean) => void
): TripMapHandle {
  const style: maplibregl.StyleSpecification = {
    version: 8,
    sources: {
      openstreetmap: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "© <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap contributors</a>"
      }
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#edf3f4" } },
      {
        id: "openstreetmap-raster",
        type: "raster",
        source: "openstreetmap",
        paint: { "raster-fade-duration": 0 }
      }
    ]
  };

  const map = new maplibregl.Map({
    container,
    style,
    center: [118, -2],
    zoom: 4.25,
    minZoom: 2,
    maxZoom: 19,
    attributionControl: false,
    renderWorldCopies: false,
    cooperativeGestures: true
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

  let selectedMarker: maplibregl.Marker | undefined;
  let currentLocationMarker: maplibregl.Marker | undefined;
  let restMarkers = new Map<string, maplibregl.Marker>();
  let latestRoute: RoutePoint[] = [];
  let followLocation = true;
  let lastFollowAnimationAt = 0;

  const routeData = (points: RoutePoint[]): GeoJSON.FeatureCollection<GeoJSON.Geometry> => {
    const coordinates = points.map((point) => [point.longitude, point.latitude] as [number, number]);
    const features: GeoJSON.Feature<GeoJSON.Geometry>[] = [];

    if (coordinates.length > 1) {
      features.push({
        type: "Feature",
        id: "journey-line",
        properties: { kind: "route" },
        geometry: { type: "LineString", coordinates }
      });
    }

    return { type: "FeatureCollection", features };
  };

  const checkpointData = (points: RoutePoint[]): GeoJSON.FeatureCollection<GeoJSON.Geometry> => ({
    type: "FeatureCollection",
    features: points
      .filter((point) => point.label !== "Jejak")
      .map((point) => ({
        type: "Feature" as const,
        id: `checkpoint-${point.at}`,
        properties: { kind: "checkpoint", label: point.label, source: point.source },
        geometry: {
          type: "Point" as const,
          coordinates: [point.longitude, point.latitude]
        }
      }))
  });

  const restMarkerKey = (point: RoutePoint): string =>
    `${point.at}:${point.latitude.toFixed(6)}:${point.longitude.toFixed(6)}`;

  const refreshRestMarkers = (): void => {
    if (!map.isStyleLoaded()) return;

    const desired = new Map(
      latestRoute
        .filter((point) => point.label === "Istirahat")
        .map((point) => [restMarkerKey(point), point] as const)
    );

    for (const [key, marker] of restMarkers) {
      if (!desired.has(key)) {
        marker.remove();
        restMarkers.delete(key);
      }
    }

    for (const [key, point] of desired) {
      if (restMarkers.has(key)) continue;
      const marker = new maplibregl.Marker({
        element: createSleepMarker(),
        anchor: "bottom"
      })
        .setLngLat([point.longitude, point.latitude])
        .addTo(map);
      restMarkers.set(key, marker);
    }
  };

  let routeUpdateFrame = 0;
  const updateCheckpoints = (): void => {
    const source = map.getSource("journey-checkpoints") as maplibregl.GeoJSONSource | undefined;
    source?.setData(checkpointData(latestRoute));
    refreshRestMarkers();
  };

  const updateRoute = (): void => {
    if (routeUpdateFrame) cancelAnimationFrame(routeUpdateFrame);
    routeUpdateFrame = requestAnimationFrame(() => {
      routeUpdateFrame = 0;
      const source = map.getSource("journey-route") as maplibregl.GeoJSONSource | undefined;
      source?.setData(routeData(latestRoute));
    });
  };

  map.on("style.load", () => {
    map.addSource("journey-route", { type: "geojson", data: routeData(latestRoute) });
    map.addSource("journey-checkpoints", { type: "geojson", data: checkpointData(latestRoute) });
    // A bright casing keeps the route readable on both light and dark map tiles.
    map.addLayer({
      id: "journey-line-casing",
      type: "line",
      source: "journey-route",
      filter: ["==", ["geometry-type"], "LineString"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#ffffff",
        "line-width": ["interpolate", ["linear"], ["zoom"], 4, 8, 16, 13],
        "line-opacity": 0.98,
        "line-blur": 0.35
      }
    });
    map.addLayer({
      id: "journey-line",
      type: "line",
      source: "journey-route",
      filter: ["==", ["geometry-type"], "LineString"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#087fa6",
        "line-width": ["interpolate", ["linear"], ["zoom"], 4, 4, 16, 7],
        "line-opacity": 1
      }
    });
    map.addLayer({
      id: "journey-points-halo",
      type: "circle",
      source: "journey-checkpoints",
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 5, 16, 8],
        "circle-color": "#ffffff",
        "circle-opacity": 0.98
      }
    });
    map.addLayer({
      id: "journey-points",
      type: "circle",
      source: "journey-checkpoints",
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 2.8, 16, 5],
        "circle-color": "#087fa6",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1
      }
    });
    refreshRestMarkers();
    onReady();
  });

  const moveSelectedMarker = (coordinate: Coordinate): void => {
    const lngLat: [number, number] = [coordinate.longitude, coordinate.latitude];
    if (!selectedMarker) {
      selectedMarker = new maplibregl.Marker({ color: "#d77950", draggable: true })
        .setLngLat(lngLat)
        .addTo(map);
      selectedMarker.on("dragend", () => {
        if (!selectedMarker) return;
        const point = selectedMarker.getLngLat();
        onManualPoint({ latitude: point.lat, longitude: point.lng });
      });
    } else {
      selectedMarker.setLngLat(lngLat);
    }
  };

  map.on("dragstart", () => {
    if (!followLocation) return;
    followLocation = false;
    onFollowChange(false);
  });

  map.on("click", (event) => {
    const coordinate = { latitude: event.lngLat.lat, longitude: event.lngLat.lng };
    moveSelectedMarker(coordinate);
    if (followLocation) {
      followLocation = false;
      onFollowChange(false);
    }
    onManualPoint(coordinate);
  });

  map.on("error", (event) => {
    if (event.error) onError(event.error.message || "Sebagian tile peta gagal dimuat.");
  });

  return {
    map,
    setRoute: (points, checkpointsChanged = true) => {
      latestRoute = points;
      updateRoute();
      if (checkpointsChanged) updateCheckpoints();
    },
    setSelected: (coordinate) => {
      if (!coordinate) {
        selectedMarker?.remove();
        selectedMarker = undefined;
        return;
      }
      moveSelectedMarker(coordinate);
    },
    setCurrentLocation: (coordinate) => {
      if (!coordinate) {
        currentLocationMarker?.remove();
        currentLocationMarker = undefined;
        return;
      }

      const lngLat: [number, number] = [coordinate.longitude, coordinate.latitude];
      if (!currentLocationMarker) {
        currentLocationMarker = new maplibregl.Marker({
          element: createCurrentLocationMarker(),
          anchor: "center"
        }).setLngLat(lngLat).addTo(map);
      } else {
        currentLocationMarker.setLngLat(lngLat);
      }

      const now = performance.now();
      if (followLocation && map.loaded() && now - lastFollowAnimationAt > 1100) {
        lastFollowAnimationAt = now;
        map.easeTo({ center: lngLat, duration: 250, essential: true });
      }
    },
    setFollow: (enabled) => {
      followLocation = enabled;
      onFollowChange(enabled);
    },
    flyTo: (coordinate, zoom = 16) => {
      map.flyTo({
        center: [coordinate.longitude, coordinate.latitude],
        zoom,
        duration: 900,
        essential: true
      });
    },
    destroy: () => {
      selectedMarker?.remove();
      currentLocationMarker?.remove();
      restMarkers.forEach((marker) => marker.remove());
      restMarkers.clear();
      if (routeUpdateFrame) cancelAnimationFrame(routeUpdateFrame);
      map.remove();
    }
  };
}
