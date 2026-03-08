import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, LogIn, AlertTriangle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-sos/10 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-sos" />
          </div>
          <h1 className="font-display font-bold text-2xl tracking-[0.2em] text-foreground">HAVEN</h1>
          <p className="text-sm text-muted-foreground mt-1">Response Dashboard Login</p>
          <p className="text-xs text-muted-foreground mt-1">For Police, NGOs & Authorized Responders</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-sos/10 border border-sos/20 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-sos mt-0.5 shrink-0" />
              <p className="text-xs text-sos">{error}</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="responder@police.gov.et"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <Button type="submit" className="w-full bg-sos hover:bg-sos/90 text-destructive-foreground" disabled={loading}>
            {loading ? (
              <div className="w-4 h-4 border-2 border-destructive-foreground border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <LogIn className="w-4 h-4 mr-2" />
                Sign In
              </>
            )}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Only authorized responders can access this dashboard.
          <br />
          Contact your organization admin for access.
        </p>
      </div>
    </div>
  );
};

export default DashboardAuth;
