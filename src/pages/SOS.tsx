import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Compass, Copy, LogOut, Share2, ShieldCheck } from "lucide-react";
import SOSButton from "@/components/SOSButton";
import CountdownOverlay from "@/components/CountdownOverlay";
import AlertActive from "@/components/AlertActive";
import { useAuth } from "@/hooks/useAuth";
import { useSOSPipeline } from "@/hooks/useSOSPipeline";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import { Container, IconTile, PageHeader, Screen } from "@/components/haven/Screen";

type SOSState = "home" | "countdown" | "active";

const SOS = () => {
  const [state, setState] = useState<SOSState>(() => {
    const saved = localStorage.getItem("haven-sos-state");
    return saved === "active" ? "active" : "home";
  });
  const [profile, setProfile] = useState<{ full_name: string } | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [activeIncidentId, setActiveIncidentId] = useState<string | null>(
    () => localStorage.getItem("haven-active-incident")
  );
  const locationTrackingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { triggerSOS, resolveIncident, startLocationTracking } = useSOSPipeline(user?.id);

  // Persist SOS state to localStorage
  useEffect(() => {
    if (state === "active" && activeIncidentId) {
      localStorage.setItem("haven-sos-state", "active");
      localStorage.setItem("haven-active-incident", activeIncidentId);
    } else if (state === "home") {
      localStorage.removeItem("haven-sos-state");
      localStorage.removeItem("haven-active-incident");
    }
  }, [state, activeIncidentId]);

  // On reload, verify the incident is still active in DB
  useEffect(() => {
    if (state === "active" && activeIncidentId && user) {
      supabase
        .from("incidents")
        .select("id, status")
        .eq("id", activeIncidentId)
        .single()
        .then(({ data }) => {
          if (!data || data.status !== "active") {
            setState("home");
            setActiveIncidentId(null);
          } else {
            const intervalId = startLocationTracking(activeIncidentId);
            if (intervalId) locationTrackingRef.current = intervalId;
          }
        });
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;

    supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data) setProfile(data);
      });

    supabase
      .from("incident_shares")
      .select("share_token")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setShareLink(`${window.location.origin}/track/${data[0].share_token}`);
        }
      });
  }, [user]);

  // Cleanup location tracking on unmount
  useEffect(() => {
    return () => {
      if (locationTrackingRef.current) clearInterval(locationTrackingRef.current);
    };
  }, []);

  const handleCountdownComplete = async () => {
    const result = await triggerSOS();
    if (result) {
      setActiveIncidentId(result.incidentId);
      const intervalId = startLocationTracking(result.incidentId);
      if (intervalId) locationTrackingRef.current = intervalId;
    }
    setState("active");
  };

  const handleSafe = async () => {
    if (activeIncidentId) {
      await resolveIncident(activeIncidentId);
      setActiveIncidentId(null);
      if (locationTrackingRef.current) {
        clearInterval(locationTrackingRef.current);
        locationTrackingRef.current = null;
      }
    }
    setState("home");
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const generateShareLink = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("incident_shares")
      .insert({ user_id: user.id, label: "Next of Kin" })
      .select("share_token")
      .single();

    if (data) {
      setShareLink(`${window.location.origin}/track/${data.share_token}`);
    }
  };

  const copyLink = async () => {
    if (!shareLink) return;
    await navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (state === "countdown") {
    return <CountdownOverlay seconds={10} onComplete={handleCountdownComplete} onCancel={() => setState("home")} />;
  }

  if (state === "active") {
    return <AlertActive onSafe={handleSafe} incidentId={activeIncidentId} />;
  }

  return (
    <Screen>
      <PageHeader
        brand
        subtitle={profile ? `Hi, ${profile.full_name.split(" ")[0]}` : "Your safety network"}
        actions={
          <>
            <Button
              variant="subtle"
              size="icon"
              onClick={() => setShowShare(!showShare)}
              aria-label="Share a tracking link"
              aria-expanded={showShare}
            >
              <Share2 />
            </Button>
            <Button variant="subtle" size="icon" onClick={handleSignOut} aria-label="Sign out">
              <LogOut />
            </Button>
          </>
        }
      />

      {showShare && (
        <Container className="pt-4">
          <div className="animate-rise rounded-2xl border border-border bg-card p-4">
            <p className="text-sm font-semibold text-foreground">Share with next of kin</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              A tracking link your family can open to see whether you are safe. No login needed on their side.
            </p>
            {shareLink ? (
              <div className="mt-3 flex items-center gap-2">
                <div className="min-w-0 flex-1 truncate rounded-xl bg-secondary px-3 py-2.5 font-mono text-xs text-foreground">
                  {shareLink}
                </div>
                <Button
                  size="icon"
                  variant="subtle"
                  onClick={copyLink}
                  aria-label={copied ? "Link copied" : "Copy link"}
                >
                  {copied ? <Check className="text-safe" /> : <Copy />}
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="gold" className="mt-3" onClick={generateShareLink}>
                Generate link
              </Button>
            )}
          </div>
        </Container>
      )}

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-10">
        <SOSButton onActivate={() => setState("countdown")} />
        <p className="mt-10 max-w-xs text-center text-sm leading-relaxed text-muted-foreground">
          Press and hold for two seconds to send an emergency alert.
        </p>
      </main>

      <Container as="footer" className="space-y-2 pb-8">
        <button
          onClick={() => navigate("/pathways")}
          className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-haven-gold/50"
        >
          <IconTile tone="gold">
            <Compass />
          </IconTile>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Find help near you</p>
            <p className="text-xs text-muted-foreground">Shelters, clinics and legal aid — works offline</p>
          </div>
        </button>

        <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <IconTile tone="safe" size="sm">
              <ShieldCheck />
            </IconTile>
            <div>
              <p className="text-sm font-medium text-foreground">Status: safe</p>
              <p className="text-xs text-muted-foreground">All systems ready</p>
            </div>
          </div>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-safe" />
            Online
          </span>
        </div>
      </Container>

      <PWAInstallPrompt />
    </Screen>
  );
};

export default SOS;
