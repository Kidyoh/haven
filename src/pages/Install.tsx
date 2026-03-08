import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Download, Share, CheckCircle, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

const Install = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
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
    setIsIOS(/iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream);

    // Listen for install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
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
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
      <div className="max-w-sm w-full text-center">
        <div className="w-20 h-20 rounded-2xl bg-sos/10 flex items-center justify-center mx-auto mb-6">
          <Shield className="w-10 h-10 text-sos" />
        </div>

        <h1 className="font-display font-bold text-3xl tracking-[0.2em] text-foreground mb-2">
          HAVEN
        </h1>
        <p className="text-muted-foreground text-sm mb-8">
          Install HAVEN on your phone for instant access to emergency SOS
        </p>

        {isInstalled ? (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-safe/10 border border-safe/20">
              <CheckCircle className="w-8 h-8 text-safe mx-auto mb-3" />
              <p className="font-semibold text-foreground">HAVEN is installed!</p>
              <p className="text-xs text-muted-foreground mt-1">
                Open it from your home screen for the full experience.
              </p>
            </div>
            <Button
              onClick={() => navigate("/")}
              className="w-full bg-sos hover:bg-sos/90 text-destructive-foreground"
            >
              Open App
            </Button>
          </div>
        ) : deferredPrompt ? (
          <div className="space-y-4">
            <Button
              onClick={handleInstall}
              className="w-full py-6 bg-sos hover:bg-sos/90 text-destructive-foreground font-display font-bold text-lg rounded-2xl"
            >
              <Download className="w-5 h-5 mr-2" />
              Install HAVEN
            </Button>
            <p className="text-xs text-muted-foreground">
              Installs instantly. No app store needed.
            </p>
          </div>
        ) : isIOS ? (
          <div className="space-y-4">
            <div className="p-5 rounded-2xl bg-card border border-border text-left space-y-4">
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-sos" />
                Install on iPhone / iPad
              </p>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-sos/10 text-sos text-xs font-bold flex items-center justify-center shrink-0">1</span>
                  <p className="text-sm text-muted-foreground">
                    Tap the <Share className="inline w-4 h-4 text-foreground" /> <strong className="text-foreground">Share</strong> button in Safari
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-sos/10 text-sos text-xs font-bold flex items-center justify-center shrink-0">2</span>
                  <p className="text-sm text-muted-foreground">
                    Scroll down and tap <strong className="text-foreground">"Add to Home Screen"</strong>
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-sos/10 text-sos text-xs font-bold flex items-center justify-center shrink-0">3</span>
                  <p className="text-sm text-muted-foreground">
                    Tap <strong className="text-foreground">"Add"</strong> to confirm
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-5 rounded-2xl bg-card border border-border text-left">
              <p className="text-sm text-muted-foreground">
                Open this page in <strong className="text-foreground">Chrome</strong> or <strong className="text-foreground">Samsung Internet</strong> on your phone to install HAVEN.
              </p>
            </div>
          </div>
        )}

        <button
          onClick={() => navigate("/")}
          className="mt-8 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Continue to web app →
        </button>
      </div>
    </div>
  );
};

export default Install;
