import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ErrorBoundary } from "@/components/error-boundary";
import { useAuth } from "@/hooks/use-auth";
import Landing from "@/pages/landing";
import AuthPage from "@/pages/auth";
import Dashboard from "@/pages/dashboard";
import Onboarding from "@/pages/onboarding";
import NewPermit from "@/pages/new-permit";
import PermitsPage from "@/pages/permits";
import PermitDetailPage from "@/pages/permit-detail";
import BadgesPage from "@/pages/badges";
import ProfilePage from "@/pages/profile";
import Discover from "@/pages/discover";
import Spots from "@/pages/spots";
import Admin from "@/pages/admin";
import AdminTestParsing from "@/pages/admin-test-parsing";
import NotFound from "@/pages/not-found";
import "leaflet/dist/leaflet.css";

function AppRouter() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/" component={isAuthenticated ? Dashboard : Discover} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/discover" component={Discover} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/onboarding" component={Onboarding} />
      <Route path="/new-permit" component={NewPermit} />
      <Route path="/permits" component={PermitsPage} />
      <Route path="/permits/:id" component={PermitDetailPage} />
      <Route path="/badges" component={BadgesPage} />
      <Route path="/spots" component={Spots} />
      <Route path="/profile" component={ProfilePage} />
      <Route path="/profile/:id" component={ProfilePage} />
      <Route path="/profile/:id/edit" component={ProfilePage} />
      <Route path="/admin" component={Admin} />
      <Route path="/admin/test-parsing" component={AdminTestParsing} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme="dark">
          <TooltipProvider>
            <Toaster />
            <AppRouter />
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
