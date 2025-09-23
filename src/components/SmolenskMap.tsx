"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Polyline,
  Polygon,
  Pane,
  useMap,
  LayerGroup,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { motion, AnimatePresence } from "framer-motion";
import { Switch } from "@/components/ui/switch";

// Coordinates for Smolensk center
const SMOLENSK_CENTER: [number, number] = [54.7818, 32.0401];

// Design colors
const COLORS = {
  background: "#0D0D0F",
  buildings: "#17181A",
  roads: "#202022",
  point: "#EF2D41",
};

// Helper to invalidate size when layout changes
function InvalidateOnToggle({ open }: { open: boolean }) {
  const map = useMap();
  useEffect(() => {
    // small delay to allow layout transition to settle
    const t = setTimeout(() => {
      map.invalidateSize();
    }, 350);
    return () => clearTimeout(t);
  }, [open, map]);
  return null;
}

// Types for Overpass response (subset)
interface OverpassElement {
  type: "way" | "node" | "relation";
  id: number;
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

function useOverpassData(bbox: { south: number; west: number; north: number; east: number }) {
  const [roads, setRoads] = useState<Array<Array<[number, number]>>>([]);
  const [buildings, setBuildings] = useState<Array<Array<[number, number]>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const query = `[
          out:json
        ][timeout:25];
        (
          way["highway"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
          way["building"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
        );
        out geom;`;
        const url = "https://overpass-api.de/api/interpreter";
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
          body: new URLSearchParams({ data: query }).toString(),
        });
        if (!res.ok) throw new Error(`Overpass error: ${res.status}`);
        const json: OverpassResponse = await res.json();
        if (cancelled) return;
        const _roads: Array<Array<[number, number]>> = [];
        const _buildings: Array<Array<[number, number]>> = [];
        for (const el of json.elements) {
          if (el.type !== "way" || !el.geometry || !el.tags) continue;
          if (el.tags["highway"]) {
            _roads.push(el.geometry.map((p) => [p.lat, p.lon]));
          } else if (el.tags["building"]) {
            // Ensure polygon is closed
            const poly = el.geometry.map((p) => [p.lat, p.lon]) as Array<[number, number]>;
            if (poly.length > 2) {
              const first = poly[0];
              const last = poly[poly.length - 1];
              if (first[0] !== last[0] || first[1] !== last[1]) poly.push(first);
              _buildings.push(poly);
            }
          }
        }
        // Light pruning for performance
        setRoads(_roads);
        setBuildings(_buildings.slice(0, 4000));
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load map data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [bbox.east, bbox.north, bbox.south, bbox.west]);

  return { roads, buildings, loading, error };
}

export default function SmolenskMap() {
  const [panelOpen, setPanelOpen] = useState(false);
  const [activePoint, setActivePoint] = useState<number | null>(null);
  const [showLabels, setShowLabels] = useState(false);

  const panelWidth = 360; // px

  // Define a small bbox around Smolensk to keep Overpass load reasonable
  const bbox = useMemo(() => {
    const dLat = 0.12; // ~13km
    const dLon = 0.18; // ~13-15km
    return {
      south: SMOLENSK_CENTER[0] - dLat,
      north: SMOLENSK_CENTER[0] + dLat,
      west: SMOLENSK_CENTER[1] - dLon,
      east: SMOLENSK_CENTER[1] + dLon,
    };
  }, []);

  const { roads, buildings, loading, error } = useOverpassData(bbox);

  const points = useMemo(
    () => [
      { id: 1, name: "Smolensk Center", coords: [54.7818, 32.0401] as [number, number] },
      { id: 2, name: "Lopatinsky Garden", coords: [54.7769, 32.0496] as [number, number] },
      { id: 3, name: "Smolensk Fortress Wall", coords: [54.7838, 32.0436] as [number, number] },
    ],
    []
  );

  const handlePointClick = useCallback((id: number) => {
    setActivePoint(id);
    setPanelOpen(true);
  }, []);

  const mapWidth = panelOpen ? `calc(100% - ${panelWidth}px)` : "100%";

  return (
    <div className="w-full h-dvh" style={{ background: COLORS.background }}>
      <div className="flex h-full overflow-hidden">
        <motion.div
          key="map"
          animate={{ width: mapWidth }}
          initial={false}
          transition={{ type: "spring", stiffness: 140, damping: 22 }}
          className="h-full relative"
        >
          <MapContainer
            center={SMOLENSK_CENTER}
            zoom={13}
            zoomControl={false}
            className="h-full w-full"
            style={{ background: COLORS.background }}
          >
            <InvalidateOnToggle open={panelOpen} />

            {/* Solid background via data-url tile to ensure consistent color */}
            <TileLayer
              url={`data:image/svg+xml;utf8,${encodeURIComponent(
                `<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'><rect width='100%' height='100%' fill='${COLORS.background}'/></svg>`
              )}`}
              tileSize={256}
              attribution='&copy; OpenStreetMap contributors'
            />

            {/* Buildings */}
            <Pane name="buildings" style={{ zIndex: 400 }}>
              <LayerGroup>
                {buildings.map((poly, idx) => (
                  <Polygon
                    key={`b-${idx}`}
                    positions={poly}
                    pathOptions={{
                      color: COLORS.buildings,
                      weight: 0,
                      fillColor: COLORS.buildings,
                      fillOpacity: 1,
                    }}
                  />
                ))}
              </LayerGroup>
            </Pane>

            {/* Roads */}
            <Pane name="roads" style={{ zIndex: 450 }}>
              <LayerGroup>
                {roads.map((line, idx) => (
                  <Polyline
                    key={`r-${idx}`}
                    positions={line}
                    pathOptions={{ color: COLORS.roads, weight: 2, opacity: 1 }}
                  />
                ))}
              </LayerGroup>
            </Pane>

            {/* Optional labels-only overlay (Carto) */}
            {showLabels && (
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png"
                subdomains={['a', 'b', 'c', 'd']}
                opacity={0.6}
              />
            )}

            {/* Points */}
            <Pane name="points" style={{ zIndex: 500 }}>
              {points.map((p) => (
                <InteractivePoint
                  key={p.id}
                  id={p.id}
                  position={p.coords}
                  active={activePoint === p.id}
                  onClick={() => handlePointClick(p.id)}
                />
              ))}
            </Pane>

            {/* Simple HUD controls */}
            <div className="absolute left-4 top-4 z-[1000] flex items-center gap-2 rounded-md border px-3 py-2 text-xs" style={{ background: "#121214", borderColor: "#232326" }}>
              <span className="opacity-80">Street names</span>
              <Switch checked={showLabels} onCheckedChange={setShowLabels} />
            </div>

            {(loading || error) && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] text-xs rounded-md px-3 py-2" style={{ background: "#121214", border: "1px solid #232326" }}>
                {loading ? "Loading OSM data…" : `Error: ${error}`}
              </div>
            )}
          </MapContainer>
        </motion.div>

        <AnimatePresence initial={false}>
          {panelOpen && activePoint != null && (
            <motion.aside
              key="panel"
              initial={{ x: panelWidth, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: panelWidth, opacity: 0 }}
              transition={{ type: "spring", stiffness: 140, damping: 22 }}
              className="h-full border-l" 
              style={{ width: panelWidth, background: "#121214", borderColor: "#232326" }}
            >
              <div className="h-full flex flex-col">
                <div className="p-4 border-b" style={{ borderColor: "#232326" }}>
                  <h2 className="text-base font-semibold">Point details</h2>
                </div>
                <div className="p-4 space-y-3 overflow-y-auto">
                  <PanelContent point={points.find((p) => p.id === activePoint)!} />
                </div>
                <div className="mt-auto p-4 border-t" style={{ borderColor: "#232326" }}>
                  <button
                    onClick={() => setPanelOpen(false)}
                    className="w-full rounded-md px-3 py-2 text-sm font-medium"
                    style={{ background: COLORS.point, color: "white" }}
                  >
                    Close
                  </button>
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function InteractivePoint({
  id,
  position,
  active,
  onClick,
}: {
  id: number;
  position: [number, number];
  active: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  const borderOpacity = hover ? 0.25 : 0; // 25% on hover
  return (
    <CircleMarker
      center={position}
      radius={6}
      eventHandlers={{
        mouseover: () => setHover(true),
        mouseout: () => setHover(false),
        click: onClick,
      }}
      pathOptions={{
        color: COLORS.point,
        weight: 3,
        opacity: borderOpacity,
        fillColor: COLORS.point,
        fillOpacity: 1,
      }}
    />
  );
}

function PanelContent({ point }: { point: { id: number; name: string; coords: [number, number] } }) {
  return (
    <div className="space-y-3">
      <div className="aspect-video w-full overflow-hidden rounded-md border" style={{ borderColor: "#232326" }}>
        <img
          alt={point.name}
          src={`https://images.unsplash.com/photo-1558980664-10e7170b0cc0?q=80&w=1200&auto=format&fit=crop`}
          className="h-full w-full object-cover"
        />
      </div>
      <div>
        <h3 className="text-sm font-semibold">{point.name}</h3>
        <p className="text-xs opacity-80 mt-1">Lat: {point.coords[0].toFixed(5)}, Lng: {point.coords[1].toFixed(5)}</p>
      </div>
      <p className="text-xs opacity-80">
        This is one of the three points in Smolensk. Click other points to view details. The map shows only roads and buildings on a custom dark canvas; toggle street names as needed.
      </p>
    </div>
  );
}