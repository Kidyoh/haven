import { useState } from "react";
import { Mic, RotateCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/haven/Feedback";
import { cn } from "@/lib/utils";

/**
 * Audio for one incident, for responders. The evidence bucket is private, so
 * clips are listed on demand and played through signed URLs that expire.
 * Incidents from before the clip pipeline carry a single audio_url instead.
 */

const SIGNED_URL_TTL_S = 60 * 60;

interface Clip {
  key: string;
  label: string;
  url: string;
}

function storagePathFromPublicUrl(url: string): string | null {
  const marker = "/object/public/evidence/";
  const i = url.indexOf(marker);
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
}

const EvidenceClips = ({
  incidentId,
  legacyAudioUrl,
  className,
}: {
  incidentId: string;
  legacyAudioUrl?: string | null;
  className?: string;
}) => {
  const [clips, setClips] = useState<Clip[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: rows, error: rowsError } = await supabase
        .from("incident_evidence")
        .select("seq, storage_path, started_at, duration_ms")
        .eq("incident_id", incidentId)
        .order("seq", { ascending: true });
      if (rowsError) throw rowsError;

      const items = (rows ?? []).map((r) => ({
        key: `${r.seq}`,
        path: r.storage_path,
        label: `${new Date(r.started_at).toLocaleTimeString()}${r.duration_ms ? ` · ${Math.round(r.duration_ms / 1000)}s` : ""}`,
      }));
      const legacyPath = legacyAudioUrl ? storagePathFromPublicUrl(legacyAudioUrl) : null;
      if (items.length === 0 && legacyPath) items.push({ key: "legacy", path: legacyPath, label: "Recording" });

      if (items.length === 0) {
        setClips([]);
        return;
      }
      const { data: signed, error: signError } = await supabase.storage
        .from("evidence")
        .createSignedUrls(
          items.map((i) => i.path),
          SIGNED_URL_TTL_S,
        );
      if (signError) throw signError;

      setClips(
        items.flatMap((item, idx) => {
          const url = signed?.[idx]?.signedUrl;
          return url ? [{ key: item.key, label: item.label, url }] : [];
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load audio");
    } finally {
      setLoading(false);
    }
  };

  if (clips === null) {
    return (
      <div className={className}>
        <Button size="sm" variant="subtle" onClick={load} disabled={loading}>
          {loading ? <Spinner size="sm" tone="current" label="Loading audio" /> : <Mic />}
          Audio
        </Button>
        {error && <p className="mt-1 text-xs text-sos">{error}</p>}
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2">
        <p className="text-xs text-muted-foreground">
          {clips.length === 0 ? "No audio uploaded yet" : `${clips.length} clip${clips.length === 1 ? "" : "s"}`}
        </p>
        <Button size="icon-sm" variant="ghost" onClick={load} aria-label="Refresh audio" disabled={loading}>
          <RotateCw />
        </Button>
      </div>
      {clips.map((clip) => (
        <div key={clip.key} className="flex flex-col gap-1">
          <span className="font-mono text-[11px] text-muted-foreground">{clip.label}</span>
          <audio controls src={clip.url} preload="none" className="h-9 w-full min-w-[220px]" />
        </div>
      ))}
    </div>
  );
};

export default EvidenceClips;
