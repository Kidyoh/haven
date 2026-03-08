import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Shield, ArrowLeft, Eye, EyeOff } from "lucide-react";

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
      else navigate("/setup");
    }
    setLoading(false);
  };

  if (signupSuccess) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
        <div className="w-16 h-16 rounded-2xl bg-safe/10 flex items-center justify-center mb-6">
          <Shield className="w-8 h-8 text-safe" />
        </div>
        <h2 className="font-display font-bold text-2xl text-foreground mb-3 text-center">Check your email</h2>
        <p className="text-muted-foreground text-center text-sm mb-8 max-w-xs">
          We've sent a confirmation link to <span className="text-foreground font-medium">{email}</span>. Click it to activate your HAVEN account.
        </p>
        <button
          onClick={() => { setSignupSuccess(false); setMode("login"); }}
          className="text-sos font-semibold text-sm"
        >
          Back to login
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col px-6 py-8">
      {/* Back button */}
      <button onClick={() => navigate("/")} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8">
        <ArrowLeft className="w-4 h-4" />
        <span className="text-sm">Back</span>
      </button>

      {/* Header */}
      <div className="mb-8">
        <div className="w-12 h-12 rounded-xl bg-sos/10 flex items-center justify-center mb-4">
          <Shield className="w-6 h-6 text-sos" />
        </div>
        <h1 className="font-display font-bold text-3xl text-foreground mb-2">
          {mode === "signup" ? "Create your account" : "Welcome back"}
        </h1>
        <p className="text-muted-foreground text-sm">
          {mode === "signup" ? "Join HAVEN — your personal safety network" : "Sign in to access your safety network"}
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
        <div className="space-y-4 flex-1">
          {mode === "signup" && (
            <>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Full Name</label>
                <input
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="e.g. Tigist Alemu"
                  required
                  className="w-full px-4 py-3 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-sos/50"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Phone Number</label>
                <input
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+251 9XX XXX XXX"
                  required
                  className="w-full px-4 py-3 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-sos/50"
                />
              </div>
            </>
          )}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="w-full px-4 py-3 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-sos/50"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min 6 characters"
                required
                minLength={6}
                className="w-full px-4 py-3 pr-12 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-sos/50"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-sos bg-sos/10 px-4 py-3 rounded-xl">{error}</p>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-4 rounded-2xl bg-sos text-destructive-foreground font-display font-bold text-lg transition-all active:scale-[0.98] disabled:opacity-50 mt-6"
        >
          {loading ? "Please wait..." : mode === "signup" ? "Create Account" : "Sign In"}
        </button>

        <p className="text-center text-sm text-muted-foreground mt-4">
          {mode === "signup" ? "Already have an account?" : "Don't have an account?"}{" "}
          <button
            type="button"
            onClick={() => { setMode(mode === "signup" ? "login" : "signup"); setError(""); }}
            className="text-sos font-semibold"
          >
            {mode === "signup" ? "Sign in" : "Sign up"}
          </button>
        </p>
      </form>
    </div>
  );
};

export default Auth;
