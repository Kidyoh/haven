import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle, Download, Share, Shield, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandMark, Screen } from "@/components/haven/Screen";
import { Callout } from "@/components/haven/Feedback";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
const Install = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    // Check if iOS
    const ua = navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua) && !("MSStream" in window));

    // Listen for install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // Listen for successful install
    window.addEventListener("appinstalled", () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    });

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  return (
    <Screen center>
      <div className="w-full max-w-sm animate-rise">
        <BrandMark stacked icon={<Shield />} subtitle="Keep SOS one tap away, on your home screen" />

        <div className="mt-8">
          {isInstalled ? (
            <div className="space-y-3">
              <Callout tone="safe" icon={<CheckCircle />} title="HAVEN is installed">
                Open it from your home screen — it launches instantly, even on a weak connection.
              </Callout>
              <Button variant="sos" size="lg" className="w-full" onClick={() => navigate("/")}>
                Open HAVEN
              </Button>
            </div>
          ) : deferredPrompt ? (
            <div className="space-y-3">
              <Button variant="sos" size="xl" className="w-full" onClick={handleInstall}>
                <Download />
                Install HAVEN
              </Button>
              <p className="text-center text-xs text-muted-foreground">Installs instantly. No app store needed.</p>
            </div>
          ) : isIOS ? (
            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Smartphone className="h-4 w-4 text-haven-gold" />
                Install on iPhone or iPad
              </p>
              <ol className="mt-4 space-y-3">
                <Step n={1}>
                  Tap the <Share className="inline h-4 w-4 text-foreground" />{" "}
                  <strong className="text-foreground">Share</strong> button in Safari
                </Step>
                <Step n={2}>
                  Scroll down and tap <strong className="text-foreground">Add to Home Screen</strong>
                </Step>
                <Step n={3}>
                  Tap <strong className="text-foreground">Add</strong> to confirm
                </Step>
              </ol>
            </div>
          ) : (
            <Callout tone="info" icon={<Smartphone />}>
              Open this page in <strong className="text-foreground">Chrome</strong> or{" "}
              <strong className="text-foreground">Samsung Internet</strong> on your phone to install HAVEN.
            </Callout>
          )}
        </div>

        <Button variant="ghost" size="lg" className="mt-6 w-full" onClick={() => navigate("/")}>
          Continue in the browser
          <ArrowRight />
        </Button>
      </div>
    </Screen>
  );
};

const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <li className="flex items-start gap-3">
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-haven-gold/10 text-xs font-bold text-haven-gold">
      {n}
    </span>
    <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>
  </li>
);

export default Install;
