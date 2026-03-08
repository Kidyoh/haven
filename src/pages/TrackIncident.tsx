import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Shield, MapPin, Clock, AlertTriangle, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-sos border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-sos/10 flex items-center justify-center mb-6">
          <AlertTriangle className="w-8 h-8 text-sos" />
        </div>
        <h1 className="font-display font-bold text-xl text-foreground mb-2">Link Not Found</h1>
        <p className="text-muted-foreground text-sm">{error}</p>
      </div>
    );
  }

  const activeIncidents = incidents.filter((i) => i.status === "active");
  const resolvedIncidents = incidents.filter((i) => i.status !== "active");

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="px-6 pt-6 pb-4 border-b border-border">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sos/10 flex items-center justify-center">
            <Shield className="w-5 h-5 text-sos" />
          </div>
          <div>
            <h1 className="font-display font-bold text-lg tracking-[0.2em] text-foreground">HAVEN</h1>
            <p className="text-xs text-muted-foreground">{share?.label} Tracking Portal</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        {/* Active Alert Banner */}
        {activeIncidents.length > 0 && (
          <div className="mb-8 p-5 rounded-2xl bg-sos/10 border border-sos/20">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-3 h-3 rounded-full bg-sos animate-alert-pulse" />
              <span className="font-display font-bold text-sos text-lg">
                {activeIncidents.length} ACTIVE ALERT{activeIncidents.length > 1 ? "S" : ""}
              </span>
            </div>
            {activeIncidents.map((incident) => (
              <div key={incident.id} className="mt-3 p-4 rounded-xl bg-card">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono text-muted-foreground">
                    REF: {incident.reference_number}
                  </span>
                  <span className="text-xs text-sos font-semibold">ACTIVE</span>
                </div>
                <p className="text-sm text-foreground">
                  Triggered {new Date(incident.created_at).toLocaleString()}
                </p>
                {incident.latitude && incident.longitude && (
                  <a
                    href={`https://maps.google.com/?q=${incident.latitude},${incident.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 mt-2 text-xs text-sos hover:underline"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    View Location on Map
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {/* No active alerts */}
        {activeIncidents.length === 0 && (
          <div className="mb-8 p-5 rounded-2xl bg-safe/10 border border-safe/20 text-center">
            <CheckCircle className="w-8 h-8 text-safe mx-auto mb-2" />
            <p className="font-display font-bold text-safe">All Clear</p>
            <p className="text-xs text-muted-foreground mt-1">No active alerts right now</p>
          </div>
        )}

        {/* Incident History */}
        <div>
          <h2 className="font-display font-bold text-lg text-foreground mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-muted-foreground" />
            Incident History
          </h2>

          {incidents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No incidents recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {incidents.map((incident) => (
                <div key={incident.id} className="p-4 rounded-xl bg-card border border-border">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono text-muted-foreground">
                      {incident.reference_number}
                    </span>
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        incident.status === "active"
                          ? "bg-sos/10 text-sos"
                          : "bg-safe/10 text-safe"
                      }`}
                    >
                      {incident.status === "active" ? "Active" : "Resolved"}
                    </span>
                  </div>
                  <p className="text-sm text-foreground">
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
                    <p className="text-xs text-muted-foreground mt-1">
                      Resolved: {new Date(incident.resolved_at).toLocaleString()}
                    </p>
                  )}
                  {incident.latitude && incident.longitude && (
                    <a
                      href={`https://maps.google.com/?q=${incident.latitude},${incident.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 mt-2 text-xs text-sos hover:underline"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      View Location
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <footer className="px-6 py-8 border-t border-border">
        <div className="max-w-2xl mx-auto text-center">
          <span className="text-xs text-muted-foreground">
            HAVEN · Women's Safety Platform · This page updates in real-time
          </span>
        </div>
      </footer>
    </div>
  );
};

export default TrackIncident;
