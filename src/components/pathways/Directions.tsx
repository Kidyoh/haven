import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Crosshair, ExternalLink, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/pathways/i18n";
import { bearingDegrees, compassPoint, distanceMeters, formatDistance, walkingMinutes, type Point } from "@/lib/pathways/geo";
import type { Locale } from "@/lib/pathways/types";

/**
 * Map, with a line from where the user is to the place.
 *
 * Privacy, in order of what leaves the phone:
 *  - Position is read only after the user taps "Show my location", and the
 *    watch stops when this view closes (including quick exit).
 *  - The line, distance and direction are computed here. No routing service
 *    is called: that would send both the user's position and a GBV service's
 *    address to a third party.
 *  - Map pictures come from OpenStreetMap, which sees the area being viewed.
 *    Without a connection the map is blank and distance and direction still work.
 *  - "Open in Google Maps" is an explicit choice to leave, and only passes the
 *    destination.
 *
 * Lazy-loaded, so Leaflet is only downloaded by someone who opens directions.
 */

type Status = "idle" | "locating" | "ok" | "denied" | "unavailable";

const GOLD = "hsl(42 80% 60%)";
const BLUE = "#3987e5";

export default function Directions({ destination, name, locale }: { destination: Point; name: string; locale: Locale }) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<{ here?: L.CircleMarker; accuracy?: L.Circle; line?: L.Polyline }>({});
  const watchId = useRef<number | null>(null);
  const fitted = useRef(false);
  const [status, setStatus] = useState<Status>("idle");
  const [here, setHere] = useState<(Point & { accuracy: number }) | null>(null);
  const [tilesFailed, setTilesFailed] = useState(false);

  // Map with the destination only.
  useEffect(() => {
    if (!mapEl.current || map.current) return;
    const m = L.map(mapEl.current, { zoomControl: true, attributionControl: true }).setView([destination.lat, destination.lng], 15);
    m.attributionControl.setPrefix("<a href=\"https://leafletjs.com\">Leaflet</a>");
    const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    });
    tiles.on("tileerror", () => setTilesFailed(true));
    tiles.on("tileload", () => setTilesFailed(false));
    tiles.addTo(m);
    L.circleMarker([destination.lat, destination.lng], {
      radius: 9,
      color: "#15181e",
      weight: 3,
      fillColor: GOLD,
      fillOpacity: 1,
    })
      .bindTooltip(name, { direction: "top", offset: [0, -8] })
      .addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      layers.current = {};
    };
  }, [destination.lat, destination.lng, name]);

  // Stop following the user when this view goes away.
  useEffect(
    () => () => {
      if (watchId.current !== null) navigator.geolocation?.clearWatch(watchId.current);
      watchId.current = null;
    },
    [],
  );

  // Draw the user's position and the line whenever it moves.
  useEffect(() => {
    const m = map.current;
    if (!m || !here) return;
    const dest: L.LatLngExpression = [destination.lat, destination.lng];
    const pos: L.LatLngExpression = [here.lat, here.lng];
    const l = layers.current;

    if (!l.line) {
      l.line = L.polyline([pos, dest], { color: GOLD, weight: 4, opacity: 0.9, lineCap: "round" }).addTo(m);
      l.accuracy = L.circle(pos, { radius: here.accuracy, color: BLUE, weight: 1, fillColor: BLUE, fillOpacity: 0.12 }).addTo(m);
      l.here = L.circleMarker(pos, { radius: 8, color: "#ffffff", weight: 3, fillColor: BLUE, fillOpacity: 1 }).addTo(m);
    } else {
      l.line.setLatLngs([pos, dest]);
      l.accuracy!.setLatLng(pos).setRadius(here.accuracy);
      l.here!.setLatLng(pos);
    }
    if (!fitted.current) {
      m.fitBounds(L.latLngBounds([pos, dest]), { padding: [36, 36], maxZoom: 17 });
      fitted.current = true;
    }
  }, [here, destination.lat, destination.lng]);

  const locate = () => {
    if (!navigator.geolocation) return setStatus("unavailable");
    if (watchId.current !== null) {
      // Already following: just re-centre on both points.
      if (here && map.current) map.current.fitBounds(L.latLngBounds([[here.lat, here.lng], [destination.lat, destination.lng]]), { padding: [36, 36], maxZoom: 17 });
      return;
    }
    setStatus("locating");
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        setStatus("ok");
        setHere({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
      },
      (err) => {
        if (err.code === 1) {
          setStatus("denied");
          if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
          watchId.current = null;
        } else if (!here) {
          setStatus("unavailable");
        }
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
  };

  const meters = here ? distanceMeters(here, destination) : null;
  const point = here ? compassPoint(bearingDegrees(here, destination)) : null;
  const googleHref = `https://www.google.com/maps/dir/?api=1&destination=${destination.lat},${destination.lng}`;

  return (
    <div className="mt-2">
      <div
        ref={mapEl}
        className="pathways-map h-64 w-full overflow-hidden rounded-2xl border border-border bg-secondary"
        role="region"
        aria-label={t(locale, "directions.map_label", { name })}
      />
      {tilesFailed && <p className="mt-2 text-[0.86em] text-muted-foreground">{t(locale, "directions.tiles_offline")}</p>}

      {meters !== null && point && (
        <div className="mt-3 flex items-center gap-3 rounded-2xl bg-secondary px-4 py-3" aria-live="polite">
          <Navigation className="h-6 w-6 shrink-0 text-haven-gold" style={{ transform: `rotate(${bearingDegrees(here!, destination) - 45}deg)` }} />
          <div>
            <p className="font-semibold">
              {t(locale, "directions.distance", { distance: formatDistance(meters), direction: t(locale, `directions.compass.${point}`) })}
            </p>
            <p className="text-[0.86em] text-muted-foreground">
              {t(locale, "directions.straight_line", { minutes: walkingMinutes(meters) })}
              {here && here.accuracy > 100 && ` ${t(locale, "directions.low_accuracy", { meters: Math.round(here.accuracy) })}`}
            </p>
          </div>
        </div>
      )}

      {status === "denied" && <p className="mt-2 text-[0.9em] text-warning">{t(locale, "directions.denied")}</p>}
      {status === "unavailable" && <p className="mt-2 text-[0.9em] text-warning">{t(locale, "directions.unavailable")}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="gold" onClick={locate} disabled={status === "locating"}>
          <Crosshair />
          {status === "locating"
            ? t(locale, "directions.locating")
            : status === "ok"
              ? t(locale, "directions.recenter")
              : t(locale, "directions.show_me")}
        </Button>
        <Button asChild variant="subtle">
          <a href={googleHref} target="_blank" rel="noopener noreferrer">
            <ExternalLink />
            {t(locale, "directions.open_google")}
          </a>
        </Button>
      </div>
      <p className="mt-2 text-[0.82em] leading-relaxed text-muted-foreground">{t(locale, "directions.privacy")}</p>
    </div>
  );
}
