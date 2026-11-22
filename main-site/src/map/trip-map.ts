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
  setRoute: (points: RoutePoint[]) => void;
  setSelected: (coordinate: Coordinate | null) => void;
  setCurrentLocation: (coordinate: Coordinate | null) => void;
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
  onError: (message: string) => void
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
        paint: { "raster-fade-duration": 180 }
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
  map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

  let selectedMarker: maplibregl.Marker | undefined;
  let currentLocationMarker: maplibregl.Marker | undefined;
  let restMarkers: maplibregl.Marker[] = [];
  let latestRoute: RoutePoint[] = [];

  const routeData = (points: RoutePoint[]): GeoJSON.FeatureCollection<GeoJSON.Geometry> => {
    const features: GeoJSON.Feature<GeoJSON.Geometry>[] = [];
    const coordinates = points.map((point) => [point.longitude, point.latitude] as [number, number]);

    if (coordinates.length > 1) {
      features.push({
        type: "Feature",
        properties: { kind: "route" },
        geometry: { type: "LineString", coordinates }
      });
    }

    for (const point of points) {
      features.push({
        type: "Feature",
        properties: { kind: "checkpoint", label: point.label, source: point.source },
        geometry: {
          type: "Point",
          coordinates: [point.longitude, point.latitude]
        }
      });
    }

    return { type: "FeatureCollection", features };
  };

  const refreshRestMarkers = (): void => {
    restMarkers.forEach((marker) => marker.remove());
    restMarkers = [];

    if (!map.isStyleLoaded()) return;

    for (const point of latestRoute) {
      if (point.label !== "Istirahat") continue;
      const marker = new maplibregl.Marker({
        element: createSleepMarker(),
        anchor: "bottom"
      })
        .setLngLat([point.longitude, point.latitude])
        .addTo(map);
      restMarkers.push(marker);
    }
  };

  const updateRoute = (): void => {
    const source = map.getSource("journey-route") as maplibregl.GeoJSONSource | undefined;
    source?.setData(routeData(latestRoute));
    refreshRestMarkers();
  };

  map.on("load", () => {
    map.addSource("journey-route", { type: "geojson", data: routeData(latestRoute) });
    map.addLayer({
      id: "journey-line",
      type: "line",
      source: "journey-route",
      filter: ["==", ["geometry-type"], "LineString"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#287a96",
        "line-width": ["interpolate", ["linear"], ["zoom"], 4, 2.5, 16, 5],
        "line-opacity": 0.92
      }
    });
    map.addLayer({
      id: "journey-points",
      type: "circle",
      source: "journey-route",
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 3.2, 16, 5],
        "circle-color": "#ffffff",
        "circle-stroke-color": "#287a96",
        "circle-stroke-width": 2.5
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

  map.on("click", (event) => {
    const coordinate = { latitude: event.lngLat.lat, longitude: event.lngLat.lng };
    moveSelectedMarker(coordinate);
    onManualPoint(coordinate);
  });

  map.on("error", (event) => {
    if (event.error) onError(event.error.message || "Sebagian tile peta gagal dimuat.");
  });

  return {
    map,
    setRoute: (points) => {
      latestRoute = [...points];
      updateRoute();
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
      map.remove();
    }
  };
}
