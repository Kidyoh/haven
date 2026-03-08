import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, LogOut, Share2, Copy, Check } from "lucide-react";
import SOSButton from "@/components/SOSButton";
import CountdownOverlay from "@/components/CountdownOverlay";
import AlertActive from "@/components/AlertActive";
import { useAuth } from "@/hooks/useAuth";
import { useSOSPipeline } from "@/hooks/useSOSPipeline";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";

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
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center justify-between px-6 pt-6 pb-4">
        <div>
          <h1 className="font-display font-bold text-xl tracking-[0.3em] text-foreground">HAVEN</h1>
          <p className="text-xs text-muted-foreground">
            {profile ? `Hi, ${profile.full_name.split(" ")[0]}` : "Your safety network"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowShare(!showShare)}
            className="w-10 h-10 rounded-xl bg-card flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <Share2 className="w-5 h-5" />
          </button>
          <button
            onClick={handleSignOut}
            className="w-10 h-10 rounded-xl bg-card flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {showShare && (
        <div className="mx-6 mb-4 p-4 rounded-2xl bg-card border border-border">
          <p className="text-sm font-semibold text-foreground mb-2">Share with Next of Kin</p>
          <p className="text-xs text-muted-foreground mb-3">
            Generate a tracking link your family can use to monitor your safety — no login needed.
          </p>
          {shareLink ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 px-3 py-2 rounded-lg bg-secondary text-xs text-foreground font-mono truncate">
                {shareLink}
              </div>
              <Button size="sm" variant="outline" onClick={copyLink} className="shrink-0">
                {copied ? <Check className="w-4 h-4 text-safe" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          ) : (
            <Button size="sm" className="bg-sos hover:bg-sos/90 text-destructive-foreground" onClick={generateShareLink}>
              Generate Link
            </Button>
          )}
        </div>
      )}

      <main className="flex-1 flex flex-col items-center justify-center -mt-12">
        <SOSButton onActivate={() => setState("countdown")} />
        <p className="text-muted-foreground text-sm mt-10 text-center px-12">
          Press and hold the SOS button for 2 seconds to send an emergency alert
        </p>
      </main>

      <footer className="px-6 pb-8">
        <div className="flex items-center justify-between p-4 rounded-2xl bg-card">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-safe/10 flex items-center justify-center">
              <Shield className="w-4 h-4 text-safe" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Status: Safe</p>
              <p className="text-xs text-muted-foreground">All systems ready</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-safe" />
            <span className="text-xs text-muted-foreground">Online</span>
          </div>
        </div>
      </footer>

      <PWAInstallPrompt />
    </div>
  );
};

export default SOS;
