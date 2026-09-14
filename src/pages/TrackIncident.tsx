import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertTriangle, CheckCircle, Clock, LinkIcon, MapPin, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Container, PageHeader, Screen } from "@/components/haven/Screen";
import { Callout, EmptyState, ScreenLoader, StatusPill } from "@/components/haven/Feedback";

interface Incident {
  id: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
  latitude: number | null;
  longitude: number | null;
  reference_number: string;
}

interface ShareInfo {
  label: string;
  user_id: string;
}

const TrackIncident = () => {
  const { token } = useParams<{ token: string }>();
  const [share, setShare] = useState<ShareInfo | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    const fetchData = async () => {
      // Find the share token
      const { data: shareData, error: shareErr } = await supabase
        .from("incident_shares")
        .select("label, user_id")
        .eq("share_token", token)
        .eq("is_active", true)
        .single();

      if (shareErr || !shareData) {
        setError("This tracking link is invalid or has been deactivated.");
        setLoading(false);
        return;
      }

      setShare(shareData);

      // Fetch incidents for the user
      const { data: incidentData } = await supabase
        .from("incidents")
        .select("id, status, created_at, resolved_at, latitude, longitude, reference_number")
        .eq("user_id", shareData.user_id)
        .order("created_at", { ascending: false });

      setIncidents(incidentData || []);
      setLoading(false);
    };

    fetchData();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`track-${token}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "incidents" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setIncidents((prev) => [payload.new as Incident, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setIncidents((prev) =>
              prev.map((i) => (i.id === (payload.new as Incident).id ? (payload.new as Incident) : i))
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [token]);

  if (loading) return <ScreenLoader />;

  if (error) {
    return (
      <Screen center>
        <div className="w-full max-w-sm">
          <EmptyState icon={<LinkIcon />} tone="sos" title="Link not found" description={error} />
        </div>
      </Screen>
    );
  }

  const activeIncidents = incidents.filter((i) => i.status === "active");

  return (
    <Screen>
      <PageHeader brand subtitle={`${share?.label} · tracking portal`} width="content" sticky />

      <Container as="main" className="flex-1 py-6">
        {/* Current state, stated plainly and first. */}
        {activeIncidents.length > 0 ? (
          <section className="animate-rise rounded-2xl border border-sos/25 bg-sos/10 p-5">
            <p className="flex items-center gap-2.5 font-display text-lg font-bold text-sos">
              <span className="h-3 w-3 animate-alert-pulse rounded-full bg-sos" />
              {activeIncidents.length} active alert{activeIncidents.length > 1 ? "s" : ""}
            </p>
            <div className="mt-3 space-y-3">
              {activeIncidents.map((incident) => (
                <div key={incident.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{incident.reference_number}</span>
                    <StatusPill active />
                  </div>
                  <p className="mt-2 text-sm text-foreground">
                    Triggered {new Date(incident.created_at).toLocaleString()}
                  </p>
                  <MapLink lat={incident.latitude} lng={incident.longitude} label="View location on a map" />
                </div>
              ))}
            </div>
          </section>
        ) : (
          <Callout tone="safe" icon={<CheckCircle />} title="All clear">
            No active alerts right now. This page updates by itself the moment that changes.
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
                <li key={incident.id} className="rounded-2xl border border-border bg-card p-4">
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
                  <MapLink lat={incident.latitude} lng={incident.longitude} label="View location" />
                </li>
              ))}
            </ul>
          )}
        </section>
      </Container>

      <footer className="border-t border-border py-6">
        <Container className="flex flex-col items-center gap-3 text-center">
          <p className="text-xs text-muted-foreground">
            HAVEN · Women's safety platform · This page updates in real time
          </p>
          <a
            href="tel:991"
            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-medium text-foreground transition-colors hover:border-sos/50"
          >
            <Phone className="h-3.5 w-3.5 text-sos" />
            In an emergency in Ethiopia, call 991
          </a>
        </Container>
      </footer>
    </Screen>
  );
};

const MapLink = ({ lat, lng, label }: { lat: number | null; lng: number | null; label: string }) =>
  lat && lng ? (
    <a
      href={`https://maps.google.com/?q=${lat},${lng}`}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-haven-gold hover:underline"
    >
      <MapPin className="h-3.5 w-3.5" />
      {label}
    </a>
  ) : null;

export default TrackIncident;
