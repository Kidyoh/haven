import { useNavigate } from "react-router-dom";
import {
  Camera, ChevronRight, Compass, MapPin, Mic, Radio, Shield, ShieldCheck, Users, WifiOff, Zap,
} from "lucide-react";
import heroImage from "@/assets/hero-shield.jpg";
import { Button } from "@/components/ui/button";
import { Container, IconTile, Screen } from "@/components/haven/Screen";

const Landing = () => {
  const navigate = useNavigate();

  return (
    <Screen className="overflow-hidden">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative flex min-h-screen flex-col">
        <div className="absolute inset-0">
          <img src={heroImage} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/85 to-background" />
        </div>

        <Container as="header" width="content" className="relative z-10 flex items-center justify-between py-5">
          <span className="brand-wordmark text-base text-foreground">HAVEN</span>
          <Button variant="ghost" size="sm" onClick={() => navigate("/auth")}>
            Sign in
          </Button>
        </Container>

        <Container width="content" className="relative z-10 flex flex-1 flex-col items-center justify-end pb-14 text-center">
          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-sos/20 bg-sos/10 px-3 py-1.5">
            <span className="h-1.5 w-1.5 animate-alert-pulse rounded-full bg-sos" />
            <span className="text-xs font-medium text-sos">Women's safety platform</span>
          </span>

          <h1 className="max-w-lg font-display text-4xl font-bold leading-tight text-foreground sm:text-5xl">
            Every woman deserves a <span className="text-haven-gold">safe place</span> to run to
          </h1>

          <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
            One button sends police, family and friends your location, audio and photo. And when the danger has
            passed, a verified directory of the places that can help.
          </p>

          <div className="mt-8 flex w-full max-w-sm flex-col gap-2.5">
            <Button variant="sos" size="xl" className="w-full" onClick={() => navigate("/auth")}>
              Get started
              <ChevronRight />
            </Button>
            <Button variant="subtle" size="lg" className="w-full" onClick={() => navigate("/pathways")}>
              <Compass className="text-haven-gold" />
              Find help near you
            </Button>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            Free · Works on any phone · No app store · No sign-in for the directory
          </p>
        </Container>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <Container as="section" width="content" className="py-20">
        <SectionLabel>How it works</SectionLabel>
        <h2 className="mt-3 font-display text-2xl font-bold text-foreground">
          Three seconds between danger and help
        </h2>

        <div className="mt-9 space-y-3">
          <Step
            number="01"
            icon={<Zap />}
            title="Hold the SOS button"
            desc="Press and hold for two seconds. A ten-second countdown gives you time to cancel if it was an accident."
          />
          <Step
            number="02"
            icon={<Camera />}
            title="Evidence captured instantly"
            desc="Audio starts recording, the camera takes a photo, and your GPS position is pinned."
          />
          <Step
            number="03"
            icon={<Radio />}
            title="Alerts reach everyone"
            desc="Police, family and friends get SMS, email and WhatsApp with your location, audio and photo."
          />
        </div>
      </Container>

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <section className="border-y border-border bg-card/40 py-16">
        <Container width="content">
          <SectionLabel>Features</SectionLabel>
          <h2 className="mt-3 font-display text-2xl font-bold text-foreground">Built for real danger</h2>

          <div className="mt-7 grid grid-cols-2 gap-3">
            <Feature icon={<MapPin />} title="Live tracking" desc="Location updates every 5 minutes" />
            <Feature icon={<Mic />} title="Audio evidence" desc="30-second automatic recording" />
            <Feature icon={<Shield />} title="Stealth mode" desc="Looks closed while it alerts" />
            <Feature icon={<Users />} title="Six contacts" desc="Family, friends and NGOs" />
            <Feature icon={<WifiOff />} title="Offline ready" desc="Queues alerts until signal returns" />
            <Feature icon={<Radio />} title="Multi-channel" desc="SMS, email and WhatsApp" />
          </div>
        </Container>
      </section>

      {/* ── Pathways ─────────────────────────────────────────────────────── */}
      <Container as="section" width="content" className="py-20">
        <SectionLabel tone="gold">After the alert</SectionLabel>
        <h2 className="mt-3 font-display text-2xl font-bold text-foreground">
          Knowing where to go is its own emergency
        </h2>
        <p className="mt-3 max-w-md leading-relaxed text-muted-foreground">
          Pathways is a directory of one-stop centres, shelters, legal aid and hotlines. Every entry shows what it
          provides, what to bring, and the date its details were last confirmed.
        </p>

        <button
          onClick={() => navigate("/pathways")}
          className="mt-7 w-full rounded-2xl border border-border bg-card p-5 text-left transition-colors hover:border-haven-gold/50"
        >
          <IconTile tone="gold">
            <Compass />
          </IconTile>
          <p className="mt-4 font-display text-lg font-bold text-foreground">Open Pathways</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Amharic and English. Works with no connection. No account, and nothing you search for leaves your phone.
          </p>
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-haven-gold">
            Browse the directory
            <ChevronRight className="h-4 w-4" />
          </span>
        </button>
      </Container>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <Container as="section" width="content" className="py-20 text-center">
        <IconTile tone="sos" size="lg" className="mx-auto">
          <Shield />
        </IconTile>
        <h2 className="mt-6 font-display text-2xl font-bold text-foreground">Your safety shouldn't wait</h2>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
          Set up your emergency contacts in under a minute. HAVEN works even on 2G.
        </p>
        <Button variant="sos" size="xl" className="mt-8" onClick={() => navigate("/auth")}>
          Create your account
        </Button>
      </Container>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-border py-8">
        <Container width="content" className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="brand-wordmark text-sm text-muted-foreground">HAVEN</span>
            <span className="text-xs text-muted-foreground">Protecting women in Ethiopia</span>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
            <FooterLink onClick={() => navigate("/pathways")}>Find help</FooterLink>
            <FooterLink onClick={() => navigate("/install")}>Install the app</FooterLink>
            <FooterLink onClick={() => navigate("/respond")}>Responder sign-in</FooterLink>
          </div>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-safe" />
            In an immediate emergency in Ethiopia, call 991 for police or 907 for an ambulance.
          </p>
        </Container>
      </footer>

    </Screen>
  );
};

const SectionLabel = ({ children, tone = "sos" }: { children: React.ReactNode; tone?: "sos" | "gold" }) => (
  <p
    className={`text-xs font-semibold uppercase tracking-[0.2em] ${tone === "gold" ? "text-haven-gold" : "text-sos"}`}
  >
    {children}
  </p>
);

const Step = ({
  number,
  title,
  desc,
  icon,
}: {
  number: string;
  title: string;
  desc: string;
  icon: React.ReactNode;
}) => (
  <div className="flex gap-4 rounded-2xl border border-border bg-card p-5">
    <IconTile tone="sos">{icon}</IconTile>
    <div className="min-w-0">
      <span className="text-[10px] font-bold tracking-widest text-muted-foreground">{number}</span>
      <h3 className="mt-0.5 font-display font-bold text-foreground">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{desc}</p>
    </div>
  </div>
);

const Feature = ({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) => (
  <div className="rounded-2xl border border-border bg-card p-4">
    <IconTile tone="sos" size="sm">
      {icon}
    </IconTile>
    <p className="mt-3 text-sm font-semibold text-foreground">{title}</p>
    <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
  </div>
);

const FooterLink = ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => (
  <button onClick={onClick} className="rounded text-muted-foreground transition-colors hover:text-haven-gold">
    {children}
  </button>
);

export default Landing;
