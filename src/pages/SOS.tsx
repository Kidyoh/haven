import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Compass, Copy, LogOut, Settings, Share2 } from "lucide-react";
import SOSButton from "@/components/SOSButton";
import CountdownOverlay from "@/components/CountdownOverlay";
import AlertActive from "@/components/AlertActive";
import PinPad from "@/components/PinPad";
import ReadinessCard from "@/components/ReadinessCard";
import SafetySettings from "@/components/SafetySettings";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import { Container, IconTile, PageHeader, Screen } from "@/components/haven/Screen";
import { COUNTDOWN_SECONDS, sosEngine, useSOS } from "@/lib/sos";
import { cacheContacts, cachedContacts, type CachedContact } from "@/lib/sos/contacts";
import { checkPin, hasPins } from "@/lib/sos/pin";

type Panel = "share" | "settings" | null;

const SOS = () => {
  const sos = useSOS();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<{ full_name: string } | null>(null);
  const [contacts, setContacts] = useState<CachedContact[]>(() => cachedContacts(user?.id));
  const [contactCount, setContactCount] = useState<number | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [askPin, setAskPin] = useState(false);

  // Resume an alert that was running before a reload, and send anything still queued.
  useEffect(() => {
    if (user) sosEngine.restore(user.id);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setContacts(cachedContacts(user.id));

    supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data) setProfile(data);
      });

    supabase
      .from("emergency_contacts")
      .select("name, phone")
      .eq("user_id", user.id)
      .order("is_primary", { ascending: false })
      .then(({ data, error }) => {
        if (error || !data) return; // offline: keep the cached list
        cacheContacts(user.id, data);
        setContacts(data);
        setContactCount(data.length);
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

  // A PIN prompt left open must not survive the alert ending some other way.
  useEffect(() => {
    if (sos.phase !== "active") setAskPin(false);
  }, [sos.phase]);

  const firstName = profile?.full_name.split(" ")[0] || null;

  const handleSafe = () => {
    if (user && hasPins(user.id).safe) setAskPin(true);
    else void sosEngine.markSafe();
  };

  const handlePin = async (pin: string) => {
    if (!user) return false;
    const result = await checkPin(user.id, pin);
    if (result === "wrong") return false;
    setAskPin(false);
    if (result === "duress") sosEngine.enterDuress();
    else void sosEngine.markSafe();
    return true;
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

  if (sos.phase === "countdown") {
    return (
      <CountdownOverlay
        seconds={COUNTDOWN_SECONDS}
        onComplete={() => sosEngine.activate()}
        onCancel={() => void sosEngine.cancel()}
      />
    );
  }

  if (sos.phase === "active") {
    return (
      <>
        <AlertActive
          sos={sos}
          onSafe={handleSafe}
          onResumeAudio={() => void sosEngine.resumeAudio()}
          contacts={contacts}
          firstName={firstName}
        />
        {askPin && <PinPad onSubmit={handlePin} onClose={() => setAskPin(false)} />}
      </>
    );
  }

  // Idle — or a duress stand-down, which must look exactly like idle.
  const togglePanel = (p: Exclude<Panel, null>) => setPanel((current) => (current === p ? null : p));

  return (
    <Screen>
      <PageHeader
        brand
        subtitle={firstName ? `Hi, ${firstName}` : "Your safety network"}
        actions={
          <>
            <Button
              variant="subtle"
              size="icon"
              onClick={() => togglePanel("share")}
              aria-label="Share a tracking link"
              aria-expanded={panel === "share"}
            >
              <Share2 />
            </Button>
            <Button
              variant="subtle"
              size="icon"
              onClick={() => togglePanel("settings")}
              aria-label="Safety settings"
              aria-expanded={panel === "settings"}
            >
              <Settings />
            </Button>
            <Button variant="subtle" size="icon" onClick={handleSignOut} aria-label="Sign out">
              <LogOut />
            </Button>
          </>
        }
      />

      {panel === "share" && (
        <Container className="pt-4">
          <div className="animate-rise rounded-2xl border border-border bg-card p-4">
            <p className="text-sm font-semibold text-foreground">Share with next of kin</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              A tracking link your family can open to see whether you are safe and, during an alert, where you are. No
              login needed on their side. Your contacts also get it by text when you send an alert.
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

      {panel === "settings" && user && (
        <Container className="pt-4">
          <SafetySettings userId={user.id} />
        </Container>
      )}

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-10">
        <SOSButton onActivate={() => user && sosEngine.startCountdown(user.id)} disabled={!user} />
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

        <ReadinessCard
          online={sos.online}
          contactCount={contactCount ?? (contacts.length > 0 ? contacts.length : null)}
          pending={sos.pending}
          discreet={sos.phase === "duress"}
        />
      </Container>

      <PWAInstallPrompt />
    </Screen>
  );
};

export default SOS;
