import { useNavigate } from "react-router-dom";
import { Shield, MapPin, Mic, Camera, Radio, Users, ChevronRight, Zap } from "lucide-react";
import heroImage from "@/assets/hero-shield.jpg";

const Landing = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Hero Section */}
      <section className="relative min-h-screen flex flex-col">
        {/* Background image with overlay */}
        <div className="absolute inset-0">
          <img src={heroImage} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/80 to-background" />
        </div>

        {/* Nav */}
        <nav className="relative z-10 flex items-center justify-between px-6 py-6">
          <h1 className="font-display font-bold text-lg tracking-[0.35em] text-foreground">HAVEN</h1>
          <button
            onClick={() => navigate("/auth")}
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign In
          </button>
        </nav>

        {/* Hero content */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-end pb-16 px-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-sos/10 border border-sos/20 mb-6">
            <div className="w-1.5 h-1.5 rounded-full bg-sos animate-alert-pulse" />
            <span className="text-xs font-medium text-sos">Women's Safety Platform</span>
          </div>

          <h2 className="font-display font-bold text-4xl sm:text-5xl text-foreground leading-tight mb-4 max-w-lg">
            Every woman deserves a{" "}
            <span className="text-haven-gold">safe place</span>{" "}
            to run to
          </h2>

          <p className="text-muted-foreground text-base max-w-md mb-8 leading-relaxed">
            One button. Instant alerts to police, family, and friends — with audio, photo, and GPS evidence. No app download required.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
            <button
              onClick={() => navigate("/auth")}
              className="flex-1 py-4 rounded-2xl bg-sos text-destructive-foreground font-display font-bold text-lg flex items-center justify-center gap-2 transition-all active:scale-[0.98] hover:shadow-[0_0_30px_hsl(var(--sos-red)/0.4)]"
            >
              Get Started
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <p className="text-xs text-muted-foreground mt-4">Free to use · Works on any phone · No app store needed</p>
        </div>
      </section>

      {/* How It Works */}
      <section className="px-6 py-20">
        <div className="max-w-lg mx-auto">
          <p className="text-xs font-semibold tracking-[0.2em] text-sos uppercase mb-3">How It Works</p>
          <h3 className="font-display font-bold text-2xl text-foreground mb-10">
            Three seconds between danger and help
          </h3>

          <div className="space-y-6">
            <StepCard
              number="01"
              title="Hold the SOS button"
              desc="Press and hold for 2 seconds. A 10-second countdown gives you time to cancel if triggered accidentally."
              icon={<Zap className="w-5 h-5" />}
            />
            <StepCard
              number="02"
              title="Evidence captured instantly"
              desc="Audio starts recording, camera captures a photo, and your GPS coordinates are pinpointed."
              icon={<Camera className="w-5 h-5" />}
            />
            <StepCard
              number="03"
              title="Alerts reach everyone"
              desc="Police, family, and friends receive SMS, email, and WhatsApp with your location, audio, and photo."
              icon={<Radio className="w-5 h-5" />}
            />
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section className="px-6 py-16 bg-card/50">
        <div className="max-w-lg mx-auto">
          <p className="text-xs font-semibold tracking-[0.2em] text-sos uppercase mb-3">Features</p>
          <h3 className="font-display font-bold text-2xl text-foreground mb-8">
            Built for real danger
          </h3>

          <div className="grid grid-cols-2 gap-3">
            <FeatureCard icon={<MapPin className="w-5 h-5" />} title="Live Tracking" desc="Location updates every 5 minutes" />
            <FeatureCard icon={<Mic className="w-5 h-5" />} title="Audio Evidence" desc="90-second auto recording" />
            <FeatureCard icon={<Shield className="w-5 h-5" />} title="Stealth Mode" desc="App appears closed while alerting" />
            <FeatureCard icon={<Users className="w-5 h-5" />} title="6 Contacts" desc="Family, friends & NGOs" />
            <FeatureCard icon={<Zap className="w-5 h-5" />} title="Offline Ready" desc="Queues alerts for when signal returns" />
            <FeatureCard icon={<Radio className="w-5 h-5" />} title="Multi-Channel" desc="SMS, Email & WhatsApp" />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-20">
        <div className="max-w-lg mx-auto text-center">
          <div className="w-16 h-16 rounded-2xl bg-sos/10 flex items-center justify-center mx-auto mb-6">
            <Shield className="w-8 h-8 text-sos" />
          </div>
          <h3 className="font-display font-bold text-2xl text-foreground mb-3">
            Your safety shouldn't wait
          </h3>
          <p className="text-muted-foreground text-sm mb-8 max-w-sm mx-auto">
            Set up your emergency contacts in under a minute. HAVEN works even on 2G networks.
          </p>
          <button
            onClick={() => navigate("/auth")}
            className="px-10 py-4 rounded-2xl bg-sos text-destructive-foreground font-display font-bold text-lg transition-all active:scale-[0.98] hover:shadow-[0_0_30px_hsl(var(--sos-red)/0.4)]"
          >
            Create Your Account
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-8 border-t border-border">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <span className="font-display font-bold text-sm tracking-[0.3em] text-muted-foreground">HAVEN</span>
          <span className="text-xs text-muted-foreground">Protecting women in Ethiopia</span>
        </div>
      </footer>
    </div>
  );
};

const StepCard = ({ number, title, desc, icon }: { number: string; title: string; desc: string; icon: React.ReactNode }) => (
  <div className="flex gap-4 p-5 rounded-2xl bg-card border border-border">
    <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-sos/10 flex items-center justify-center text-sos">
      {icon}
    </div>
    <div>
      <span className="text-[10px] font-bold tracking-widest text-muted-foreground">{number}</span>
      <h4 className="font-display font-bold text-foreground mt-0.5">{title}</h4>
      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{desc}</p>
    </div>
  </div>
);

const FeatureCard = ({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) => (
  <div className="p-4 rounded-xl bg-card border border-border">
    <div className="w-8 h-8 rounded-lg bg-sos/10 flex items-center justify-center text-sos mb-3">
      {icon}
    </div>
    <p className="text-sm font-semibold text-foreground">{title}</p>
    <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
  </div>
);

export default Landing;
