"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import "leaflet/dist/leaflet.css";
import { MapPin, Navigation, User, Loader2, WifiOff } from "lucide-react";
import { relativeAgeLabel, freshnessOf, type Freshness } from "@/lib/geo/location-freshness";

/**
 * Work-order map (Phase 12, ADR-0018): property pin + assigned technician's
 * last-known pin, with an always-visible freshness label. Vanilla Leaflet +
 * OpenStreetMap tiles (no API key/billing), loaded dynamically client-side to
 * avoid SSR. Uses divIcon markers so there are no broken image-asset paths and
 * no external image loads beyond the map tiles.
 */

interface MapContext {
  property: { latitude: number; longitude: number; address: string; customer_name: string } | null;
  technician: { technician_id: string; name: string | null; latitude: number; longitude: number; accuracy_m: number | null; recorded_at: string } | null;
  location_enabled: boolean;
}

const FRESH_COLOR: Record<Freshness, string> = { live: "#10b981", recent: "#f59e0b", stale: "#94a3b8" };

export function WorkOrderMap({ workOrderId }: { workOrderId: string }) {
  const [ctx, setCtx] = useState<MapContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null); // Leaflet map instance
  const [nowMs, setNowMs] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/work-orders/${workOrderId}/map-context`, { cache: "no-store" });
      if (!res.ok) { setFailed(true); return; }
      const j = (await res.json()) as { data?: MapContext };
      setCtx(j.data ?? null);
    } catch { setFailed(true); } finally { setLoading(false); }
  }, [workOrderId]);

  useEffect(() => { void load(); }, [load]);

  // Re-render freshness labels each minute without refetching.
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Draw the map once we have a property to center on.
  useEffect(() => {
    if (!ctx?.property || !containerRef.current) return;
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      const prop = ctx.property!;
      // Guard against double-init (React strict mode / re-run).
      if (mapRef.current) { (mapRef.current as { remove: () => void }).remove(); mapRef.current = null; }

      const map = L.map(containerRef.current, { scrollWheelZoom: false, attributionControl: true })
        .setView([prop.latitude, prop.longitude], 14);
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);

      const pin = (color: string, glyph: string) =>
        L.divIcon({
          className: "",
          html: `<div style="background:${color};width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center"><span style="transform:rotate(45deg);color:#fff;font-size:12px;font-weight:700">${glyph}</span></div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 26],
        });

      L.marker([prop.latitude, prop.longitude], { icon: pin("#0891b2", "P") })
        .addTo(map)
        .bindPopup(`<strong>${escapeHtml(prop.customer_name)}</strong><br>${escapeHtml(prop.address)}`);

      const bounds: [number, number][] = [[prop.latitude, prop.longitude]];

      if (ctx.technician) {
        const t = ctx.technician;
        const fresh = freshnessOf(t.recorded_at);
        L.marker([t.latitude, t.longitude], { icon: pin(FRESH_COLOR[fresh], "T") })
          .addTo(map)
          .bindPopup(`<strong>${escapeHtml(t.name ?? "Technician")}</strong><br>Last known · ${escapeHtml(relativeAgeLabel(t.recorded_at))}`);
        bounds.push([t.latitude, t.longitude]);
      }

      if (bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
      // Leaflet needs a size recalculation when mounted in a just-shown container.
      setTimeout(() => map.invalidateSize(), 60);
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) { (mapRef.current as { remove: () => void }).remove(); mapRef.current = null; }
    };
  }, [ctx]);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }
  if (failed || !ctx || !ctx.property) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
        <MapPin className="mx-auto mb-2 h-6 w-6 text-slate-300" />
        <p className="text-sm text-slate-500">
          {ctx && !ctx.property ? "No map — this property's address couldn't be located." : "Map unavailable."}
        </p>
      </div>
    );
  }

  const tech = ctx.technician;
  const fresh = tech ? freshnessOf(tech.recorded_at, nowMs) : null;
  const mapsLink = `https://www.google.com/maps/search/?api=1&query=${ctx.property.latitude},${ctx.property.longitude}`;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <h3 className="text-sm font-bold text-slate-900">Location</h3>
        <a href={mapsLink} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
          <Navigation className="h-3.5 w-3.5" /> Directions
        </a>
      </div>

      <div ref={containerRef} className="h-64 w-full bg-slate-100" style={{ zIndex: 0 }} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-xs">
        <span className="inline-flex items-center gap-1.5 text-slate-600">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#0891b2" }} /> Property
        </span>
        {tech && fresh ? (
          <span className="inline-flex items-center gap-1.5 text-slate-600">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: FRESH_COLOR[fresh] }} />
            <User className="h-3 w-3 text-slate-400" />
            {tech.name ?? "Technician"} — last known {relativeAgeLabel(tech.recorded_at, nowMs)}
            {fresh === "stale" && <span className="ml-1 font-semibold text-slate-500">(stale)</span>}
          </span>
        ) : ctx.location_enabled ? (
          <span className="inline-flex items-center gap-1.5 text-slate-400">
            <WifiOff className="h-3 w-3" /> No recent technician location
          </span>
        ) : null}
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
