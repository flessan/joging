import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface RoutePoint extends Coordinate {
  at: number;
  label: "Mulai" | "Istirahat" | "Lanjut" | "Selesai";
  source: "gps" | "manual";
}

export interface TripMapHandle {
  map: maplibregl.Map;
  setRoute: (points: RoutePoint[]) => void;
  setSelected: (coordinate: Coordinate | null) => void;
  flyTo: (coordinate: Coordinate, zoom?: number) => void;
  destroy: () => void;
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

    if (coordinates.length > 0) {
      features.push({
        type: "Feature",
        properties: { kind: "checkpoints" },
        geometry: { type: "MultiPoint", coordinates }
      });
    }

    return { type: "FeatureCollection", features };
  };

  const updateRoute = (): void => {
    const source = map.getSource("journey-route") as maplibregl.GeoJSONSource | undefined;
    source?.setData(routeData(latestRoute));
  };

  map.on("load", () => {
    map.addSource("journey-route", {
      type: "geojson",
      data: routeData(latestRoute)
    });
    map.addLayer({
      id: "journey-line",
      type: "line",
      source: "journey-route",
      filter: ["==", ["geometry-type"], "LineString"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#287a96", "line-width": 4, "line-opacity": 0.9 }
    });
    map.addLayer({
      id: "journey-points",
      type: "circle",
      source: "journey-route",
      filter: ["==", ["geometry-type"], "MultiPoint"],
      paint: {
        "circle-radius": 5,
        "circle-color": "#ffffff",
        "circle-stroke-color": "#287a96",
        "circle-stroke-width": 3
      }
    });
    onReady();
  });

  map.on("click", (event) => {
    const coordinate = {
      latitude: event.lngLat.lat,
      longitude: event.lngLat.lng
    };

    if (!selectedMarker) {
      selectedMarker = new maplibregl.Marker({ color: "#d77950", draggable: true })
        .setLngLat(event.lngLat)
        .addTo(map);
      selectedMarker.on("dragend", () => {
        if (!selectedMarker) return;
        const point = selectedMarker.getLngLat();
        onManualPoint({ latitude: point.lat, longitude: point.lng });
      });
    } else {
      selectedMarker.setLngLat(event.lngLat);
    }

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
      map.remove();
    }
  };
}
