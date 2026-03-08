import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Settings, Shield, LogOut } from "lucide-react";
import SOSButton from "@/components/SOSButton";
import CountdownOverlay from "@/components/CountdownOverlay";
import AlertActive from "@/components/AlertActive";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

type SOSState = "home" | "countdown" | "active";

const SOS = () => {
  const [state, setState] = useState<SOSState>("home");
  const [profile, setProfile] = useState<{ full_name: string } | null>(null);
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

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
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  if (state === "countdown") {
    return <CountdownOverlay seconds={10} onComplete={() => setState("active")} onCancel={() => setState("home")} />;
  }

  if (state === "active") {
    return <AlertActive onSafe={() => setState("home")} />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 pt-6 pb-4">
        <div>
          <h1 className="font-display font-bold text-xl tracking-[0.3em] text-foreground">HAVEN</h1>
          <p className="text-xs text-muted-foreground">
            {profile ? `Hi, ${profile.full_name.split(" ")[0]}` : "Your safety network"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSignOut}
            className="w-10 h-10 rounded-xl bg-card flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main SOS area */}
      <main className="flex-1 flex flex-col items-center justify-center -mt-12">
        <SOSButton onActivate={() => setState("countdown")} />
        <p className="text-muted-foreground text-sm mt-10 text-center px-12">
          Press and hold the SOS button for 2 seconds to send an emergency alert
        </p>
      </main>

      {/* Bottom status bar */}
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
    </div>
  );
};

export default SOS;
