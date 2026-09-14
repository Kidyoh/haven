import { useState, useEffect } from "react";
import { Download, Share, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconTile } from "@/components/haven/Screen";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
const PWAInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Don't show if already installed or dismissed this session
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    if (sessionStorage.getItem("pwa-dismissed")) return;

    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) && !("MSStream" in window);
    setIsIOS(ios);

    // Show iOS prompt after 3 seconds
    if (ios) {
      const timer = setTimeout(() => setShowPrompt(true), 3000);
      return () => clearTimeout(timer);
    }

    // Android/Chrome: listen for beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => {
      setShowPrompt(false);
      setDeferredPrompt(null);
    });

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setShowPrompt(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setDismissed(true);
    setShowPrompt(false);
    sessionStorage.setItem("pwa-dismissed", "1");
  };

  if (!showPrompt || dismissed) return null;

  return (
    <div className="fixed inset-x-4 bottom-4 z-40 animate-rise">
      <div className="mx-auto max-w-sm rounded-2xl border border-border bg-card p-4 shadow-2xl shadow-black/40">
        <div className="flex items-start gap-3">
          <IconTile tone="gold" size="sm">
            <Smartphone />
          </IconTile>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">Install HAVEN</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {isIOS
                ? "Add it to your home screen so SOS is one tap away."
                : "Keep SOS one tap away — no app store needed."}
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={handleDismiss} aria-label="Dismiss" className="-mr-1 -mt-1">
            <X />
          </Button>
        </div>

        {isIOS ? (
          <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Share className="h-3.5 w-3.5 shrink-0" />
            <span>
              Tap <strong className="text-foreground">Share</strong> →{" "}
              <strong className="text-foreground">Add to Home Screen</strong>
            </span>
          </p>
        ) : deferredPrompt ? (
          <Button variant="gold" className="mt-3 w-full" onClick={handleInstall}>
            <Download />
            Install now
          </Button>
        ) : null}
      </div>
    </div>
  );
};

export default PWAInstallPrompt;
