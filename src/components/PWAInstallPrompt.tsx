import { useState, useEffect } from "react";
import { Download, X, Share, Smartphone } from "lucide-react";

const PWAInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Don't show if already installed or dismissed this session
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    if (sessionStorage.getItem("pwa-dismissed")) return;

    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    setIsIOS(ios);

    // Show iOS prompt after 3 seconds
    if (ios) {
      const timer = setTimeout(() => setShowPrompt(true), 3000);
      return () => clearTimeout(timer);
    }

    // Android/Chrome: listen for beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
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
    <div className="fixed bottom-4 left-4 right-4 z-50 animate-in slide-in-from-bottom-4 duration-300">
      <div className="max-w-sm mx-auto p-4 rounded-2xl bg-card border border-border shadow-lg">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-sos/10 flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5 text-sos" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Install HAVEN</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isIOS
                ? "Add to your home screen for instant SOS access"
                : "Install for instant emergency access — no app store needed"}
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="shrink-0 w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isIOS ? (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Share className="w-3.5 h-3.5" />
            <span>
              Tap <strong className="text-foreground">Share</strong> → <strong className="text-foreground">Add to Home Screen</strong>
            </span>
          </div>
        ) : deferredPrompt ? (
          <button
            onClick={handleInstall}
            className="mt-3 w-full py-2.5 rounded-xl bg-sos text-destructive-foreground font-display font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          >
            <Download className="w-4 h-4" />
            Install Now
          </button>
        ) : null}
      </div>
    </div>
  );
};

export default PWAInstallPrompt;
