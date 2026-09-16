import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { sosEngine } from "@/lib/sos";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import Setup from "./pages/Setup";
import SOS from "./pages/SOS";
import TrackIncident from "./pages/TrackIncident";
import DashboardAuth from "./pages/DashboardAuth";
import Dashboard from "./pages/Dashboard";
import Organizations from "./pages/Organizations";
import Install from "./pages/Install";
import NotFound from "./pages/NotFound";

// Pathways is public, offline-first and lazy-loaded so the SOS bundle does not grow.
const Pathways = lazy(() => import("./pages/Pathways"));

const queryClient = new QueryClient();

/**
 * Picks a running SOS alert back up after a reload on whatever page the user
 * was on (the alert screen links to Pathways), and sends anything still queued.
 */
const SOSResume = () => {
  const { session } = useAuth();
  useEffect(() => {
    if (session?.user) sosEngine.restore(session.user.id);
  }, [session?.user]);
  return null;
};

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-sos border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!session) return <Navigate to="/auth" replace />;
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <SOSResume />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/setup" element={<ProtectedRoute><Setup /></ProtectedRoute>} />
          <Route path="/sos" element={<ProtectedRoute><SOS /></ProtectedRoute>} />
          <Route path="/track/:token" element={<TrackIncident />} />
          <Route path="/respond" element={<DashboardAuth />} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/organizations" element={<ProtectedRoute><Organizations /></ProtectedRoute>} />
          <Route path="/install" element={<Install />} />
          <Route path="/pathways/*" element={<Suspense fallback={null}><Pathways /></Suspense>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
