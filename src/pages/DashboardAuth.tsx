import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowLeft, LogIn, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { BrandMark, Screen } from "@/components/haven/Screen";
import { Callout, Spinner } from "@/components/haven/Feedback";
import { TextField } from "@/components/haven/Field";

const DashboardAuth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: signInError } = await signIn(email, password);
    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    // Check if user has a responder/org_admin/admin role
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("Authentication failed");
      setLoading(false);
      return;
    }

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    if (!roles || roles.length === 0) {
      setError("You don't have access to the response dashboard. Contact your administrator.");
      await supabase.auth.signOut();
      setLoading(false);
      return;
    }

    navigate("/dashboard");
  };

  return (
    <Screen center>
      <div className="w-full max-w-sm animate-rise">
        <BrandMark
          stacked
          tone="gold"
          icon={<ShieldCheck />}
          subtitle="Response dashboard"
          note="For police, NGOs and authorised responders"
        />

        <form onSubmit={handleLogin} className="mt-8 space-y-4">
          {error && (
            <Callout tone="danger" icon={<AlertTriangle />}>
              {error}
            </Callout>
          )}

          <TextField
            label="Email"
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="responder@police.gov.et"
            autoComplete="email"
          />

          <TextField
            label="Password"
            required
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
          />

          <Button type="submit" variant="gold" size="lg" className="w-full" disabled={loading}>
            {loading ? (
              <Spinner size="sm" tone="current" label="Signing in" />
            ) : (
              <>
                <LogIn />
                Sign in
              </>
            )}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
          Only authorised responders can open this dashboard.
          <br />
          Contact your organisation admin for access.
        </p>

        <Button variant="ghost" size="sm" className="mt-4 w-full" onClick={() => navigate("/")}>
          <ArrowLeft />
          Back to HAVEN
        </Button>
      </div>
    </Screen>
  );
};

export default DashboardAuth;
