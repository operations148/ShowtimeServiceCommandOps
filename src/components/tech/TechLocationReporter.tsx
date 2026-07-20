"use client";

import { useEffect, useRef } from "react";
import { isTechLocationEnabled } from "@/lib/geo/flags";

/**
 * Foreground technician-location reporter (Phase 12, ADR-0018 §2). Mounted in
 * the tech shell. While the app is open and the technician has granted
 * geolocation permission, it posts a throttled last-known position to
 * /api/tech/location. A PWA cannot capture location in the background — this is
 * foreground-only by design, and the map labels staleness accordingly.
 *
 * Renders nothing. Never prompts aggressively: it uses watchPosition, so the
 * browser's own one-time permission prompt is the only UI.
 */
const MIN_INTERVAL_MS = 60_000; // at most one server ping per minute

export function TechLocationReporter() {
  const lastSentRef = useRef(0);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!isTechLocationEnabled()) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    let watchId: number | null = null;

    async function send(lat: number, lng: number, accuracy: number | null) {
      if (inFlightRef.current) return;
      const now = Date.now();
      if (now - lastSentRef.current < MIN_INTERVAL_MS) return;
      inFlightRef.current = true;
      lastSentRef.current = now;
      try {
        await fetch("/api/tech/location", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            latitude: lat,
            longitude: lng,
            accuracy_m: accuracy ?? undefined,
            recorded_at: new Date().toISOString(),
          }),
          keepalive: true,
        });
      } catch {
        // Best-effort — location is a convenience, never blocks the tech's work.
        lastSentRef.current = 0; // allow a retry on the next position event
      } finally {
        inFlightRef.current = false;
      }
    }

    watchId = navigator.geolocation.watchPosition(
      (pos) => void send(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy ?? null),
      () => { /* permission denied / unavailable — silently do nothing */ },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 30_000 }
    );

    return () => { if (watchId != null) navigator.geolocation.clearWatch(watchId); };
  }, []);

  return null;
}
