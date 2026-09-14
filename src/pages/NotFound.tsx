import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Compass, MapPinOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Screen } from "@/components/haven/Screen";
import { EmptyState } from "@/components/haven/Feedback";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <Screen center>
      <div className="w-full max-w-sm animate-rise">
        <EmptyState
          icon={<MapPinOff />}
          tone="muted"
          title="This page doesn't exist"
          description="The link may be out of date. Everything else still works."
          action={
            <div className="flex w-full flex-col gap-2">
              <Button variant="sos" size="lg" className="w-full" onClick={() => navigate("/")}>
                Go to HAVEN
              </Button>
              <Button variant="ghost" size="lg" className="w-full" onClick={() => navigate("/pathways")}>
                <Compass />
                Find help near you
              </Button>
            </div>
          }
        />
        <p className="mt-2 text-center font-mono text-xs text-muted-foreground">{location.pathname}</p>
      </div>
    </Screen>
  );
};

export default NotFound;
