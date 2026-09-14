import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, ArrowLeft, Eye, EyeOff, MailCheck, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandMark, Container, IconTile, Screen } from "@/components/haven/Screen";
import { Callout, Spinner } from "@/components/haven/Feedback";
import { Field, TextField } from "@/components/haven/Field";

const Auth = () => {
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);
  const navigate = useNavigate();
  const { signUp, signIn } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (mode === "signup") {
      const { error } = await signUp(email, password, fullName, phone);
      if (error) setError(error.message);
      else setSignupSuccess(true);
    } else {
      const { error } = await signIn(email, password);
      if (error) setError(error.message);
      else {
        // Check if setup is already complete
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (currentUser) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("setup_complete")
            .eq("user_id", currentUser.id)
            .single();
          if (profile?.setup_complete) {
            navigate("/sos");
          } else {
            navigate("/setup");
          }
        } else {
          navigate("/setup");
        }
      }
    }
    setLoading(false);
  };

  if (signupSuccess) {
    return (
      <Screen center>
        <div className="w-full max-w-sm animate-rise text-center">
          <BrandMark stacked tone="safe" icon={<MailCheck />} />
          <h1 className="mt-6 font-display text-2xl font-bold text-foreground">Check your email</h1>
          <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
            We sent a confirmation link to <span className="font-medium text-foreground">{email}</span>. Open it to
            activate your account.
          </p>
          <Button
            variant="ghost"
            size="lg"
            className="mt-8 w-full"
            onClick={() => {
              setSignupSuccess(false);
              setMode("login");
            }}
          >
            <ArrowLeft />
            Back to sign in
          </Button>
        </div>
      </Screen>
    );
  }

  const isSignup = mode === "signup";

  return (
    <Screen>
      <Container width="form" as="main" className="flex flex-1 flex-col py-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="-ml-3 mb-6 self-start">
          <ArrowLeft />
          Back
        </Button>

        <div className="mb-7">
          <IconTile tone="sos" className="mb-4">
            <Shield />
          </IconTile>
          <h1 className="font-display text-3xl font-bold leading-tight text-foreground">
            {isSignup ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isSignup ? "Join HAVEN — your personal safety network" : "Sign in to reach your safety network"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
          <div className="flex-1 space-y-4">
            {isSignup && (
              <>
                <TextField
                  label="Full name"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Tigist Alemu"
                  autoComplete="name"
                />
                <TextField
                  label="Phone number"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+251 9XX XXX XXX"
                  type="tel"
                  autoComplete="tel"
                  hint="Responders use this to reach you during an alert."
                />
              </>
            )}

            <TextField
              label="Email"
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              autoComplete="email"
            />

            <Field label="Password" required>
              {(a11y) => (
                <div className="relative">
                  <Input
                    {...a11y}
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    required
                    minLength={6}
                    autoComplete={isSignup ? "new-password" : "current-password"}
                    className="pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              )}
            </Field>

            {error && (
              <Callout tone="danger" icon={<AlertTriangle />}>
                {error}
              </Callout>
            )}
          </div>

          <Button type="submit" variant="sos" size="xl" disabled={loading} className="mt-7 w-full">
            {loading ? <Spinner size="sm" tone="current" label="Signing in" /> : isSignup ? "Create account" : "Sign in"}
          </Button>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            {isSignup ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              type="button"
              onClick={() => {
                setMode(isSignup ? "login" : "signup");
                setError("");
              }}
              className="rounded font-semibold text-haven-gold hover:underline"
            >
              {isSignup ? "Sign in" : "Sign up"}
            </button>
          </p>
        </form>
      </Container>
    </Screen>
  );
};

export default Auth;
