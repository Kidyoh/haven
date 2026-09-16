import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertTriangle, CheckCircle, Clock, LinkIcon, MapPin, Phone, WifiOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Container, PageHeader, Screen } from "@/components/haven/Screen";
import { Callout, EmptyState, ScreenLoader, StatusPill } from "@/components/haven/Feedback";

/**
 * The family link. No login: the token in the URL is the only key, checked on
 * the server by get_tracking(), which returns this one person's alerts and
 * nothing else. Polls instead of subscribing, because a realtime subscription
 * cannot be scoped to a token for an anonymous viewer.
 */

interface TrailPoint {
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  at: string;
}

interface Incident {
  status: string;
  created_at: string;
  resolved_at: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy_meters: number | null;
  last_location_at: string | null;
  reference_number: string;
  trail: TrailPoint[];
}

interface Tracking {
  label: string;
  first_name: string | null;
  incidents: Incident[];
}

const POLL_ACTIVE_MS = 15_000;
const POLL_IDLE_MS = 60_000;

const TrackIncident = () => {
  const { token } = useParams<{ token: string }>();
  const [tracking, setTracking] = useState<Tracking | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [stale, setStale] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!token) return;
    const { data, error } = await supabase.rpc("get_tracking", { p_token: token });
    if (error) {
      setStale(true); // keep showing the last good data
    } else if (!data) {
      setNotFound(true);
    } else {
      setTracking(data as unknown as Tracking);
      setStale(false);
    }
    setLoading(false);
    setNow(Date.now());
  }, [token]);

  const hasActive = tracking?.incidents.some((i) => i.status === "active") ?? false;

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), hasActive ? POLL_ACTIVE_MS : POLL_IDLE_MS);
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, hasActive]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  if (loading) return <ScreenLoader />;

  if (notFound || !tracking) {
    return (
      <Screen center>
        <div className="w-full max-w-sm">
          <EmptyState
            icon={<LinkIcon />}
            tone="sos"
            title="Link not found"
            description="This tracking link is invalid or has been deactivated."
          />
        </div>
      </Screen>
    );
  }

  const who = tracking.first_name ?? "They";
  const incidents = tracking.incidents;
  const activeIncidents = incidents.filter((i) => i.status === "active");

  return (
    <Screen>
      <PageHeader brand subtitle={`${tracking.label} · tracking portal`} width="content" sticky />

      <Container as="main" className="flex-1 py-6">
        {stale && (
          <Callout tone="warning" icon={<WifiOff />} className="mb-4">
            Could not refresh. Showing what was last received; retrying automatically.
          </Callout>
        )}

        {/* Current state, stated plainly and first. */}
        {activeIncidents.length > 0 ? (
          <section className="animate-rise rounded-2xl border border-sos/25 bg-sos/10 p-5">
            <p className="flex items-center gap-2.5 font-display text-lg font-bold text-sos">
              <span className="h-3 w-3 animate-alert-pulse rounded-full bg-sos" />
              {who} sent an SOS alert
            </p>
            <div className="mt-3 space-y-3">
              {activeIncidents.map((incident) => (
                <ActiveIncident key={incident.reference_number} incident={incident} now={now} />
              ))}
            </div>
            <a
              href="tel:991"
              className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-sos px-4 text-sm font-semibold text-destructive-foreground"
            >
              <Phone className="h-4 w-4" />
              Call police on 991
            </a>
          </section>
        ) : (
          <Callout tone="safe" icon={<CheckCircle />} title="All clear">
            No active alerts right now. This page checks again by itself.
          </Callout>
        )}

        {/* History */}
        <section className="mt-8">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-foreground">
            <Clock className="h-5 w-5 text-muted-foreground" />
            Incident history
          </h2>

          {incidents.length === 0 ? (
            <EmptyState
              icon={<AlertTriangle />}
              title="No incidents recorded"
              description="Nothing has been triggered on this account yet."
            />
          ) : (
            <ul className="mt-4 space-y-3">
              {incidents.map((incident) => (
                <li key={incident.reference_number} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{incident.reference_number}</span>
                    <StatusPill active={incident.status === "active"} />
                  </div>
                  <p className="mt-2 text-sm text-foreground">
                    {new Date(incident.created_at).toLocaleDateString(undefined, {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  {incident.resolved_at && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Resolved {new Date(incident.resolved_at).toLocaleString()}
                    </p>
                  )}
                  <MapLink lat={incident.latitude} lng={incident.longitude} label="Last known location" />
                </li>
              ))}
            </ul>
          )}
        </section>
      </Container>

      <footer className="border-t border-border py-6">
        <Container className="flex flex-col items-center gap-3 text-center">
          <p className="text-xs text-muted-foreground">
            HAVEN · Women's safety platform · Updates every {POLL_ACTIVE_MS / 1000}s during an alert
          </p>
        </Container>
      </footer>
    </Screen>
  );
};

const ActiveIncident = ({ incident, now }: { incident: Incident; now: number }) => {
  const lastAt = incident.last_location_at ? new Date(incident.last_location_at).getTime() : null;
  const minutesOld = lastAt ? (now - lastAt) / 60_000 : null;
  const earlier = incident.trail.slice(1, 6);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-muted-foreground">{incident.reference_number}</span>
        <StatusPill active />
      </div>
      <p className="mt-2 text-sm text-foreground">Sent {new Date(incident.created_at).toLocaleString()}</p>

      {incident.latitude != null && incident.longitude != null ? (
        <>
          <a
            href={mapUrl(incident.latitude, incident.longitude)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-haven-gold px-4 text-sm font-semibold text-ink"
          >
            <MapPin className="h-4 w-4" />
            Open current location
          </a>
          <p className={`mt-2 text-xs ${minutesOld !== null && minutesOld > 3 ? "text-warning" : "text-muted-foreground"}`}>
            {lastAt ? `Updated ${formatAgo(now - lastAt)}` : "Location time unknown"}
            {incident.accuracy_meters != null && ` · accurate to about ${Math.round(incident.accuracy_meters)} m`}
            {minutesOld !== null && minutesOld > 3 && ". Their phone may have lost signal."}
          </p>
        </>
      ) : (
        <p className="mt-2 text-xs text-warning">No location received yet. Their phone may be looking for GPS.</p>
      )}

      {earlier.length > 0 && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-muted-foreground">Earlier positions</summary>
          <ul className="mt-2 space-y-1.5">
            {earlier.map((p) => (
              <li key={p.at}>
                <a
                  href={mapUrl(p.latitude, p.longitude)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-haven-gold hover:underline"
                >
                  {new Date(p.at).toLocaleTimeString()}
                </a>
                {p.accuracy_meters != null && <span className="text-muted-foreground"> · ±{Math.round(p.accuracy_meters)} m</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
};

const mapUrl = (lat: number, lng: number) => `https://maps.google.com/?q=${lat},${lng}`;

function formatAgo(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ago`;
}

const MapLink = ({ lat, lng, label }: { lat: number | null; lng: number | null; label: string }) =>
  lat != null && lng != null ? (
    <a
      href={mapUrl(lat, lng)}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-haven-gold hover:underline"
    >
      <MapPin className="h-3.5 w-3.5" />
      {label}
    </a>
  ) : null;

export default TrackIncident;
