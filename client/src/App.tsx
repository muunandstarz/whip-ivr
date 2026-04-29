import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Dashboard from "./pages/Dashboard";
import IntakeRecords from "./pages/IntakeRecords";
import IntakeDetail from "./pages/IntakeDetail";
import Analytics from "./pages/Analytics";
import NewIntake from "./pages/NewIntake";
import IVRSetup from "./pages/IVRSetup";
import HandlerQueue from "./pages/HandlerQueue";
import CallTracking from "./pages/CallTracking";
import WeeklyQA from "./pages/WeeklyQA";
import HandlerProfile from "./pages/HandlerProfile";
import Softphone from "./pages/Softphone";
import HandlerDashboard from "./pages/HandlerDashboard";
import UserManagement from "./pages/UserManagement";
import Settings from "./pages/Settings";
import { ImpersonationProvider } from "./contexts/ImpersonationContext";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/intake" component={IntakeRecords} />
      <Route path="/intake/new" component={NewIntake} />
      <Route path="/intake/:id" component={IntakeDetail} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/handler-queue" component={HandlerQueue} />
      <Route path="/call-tracking" component={CallTracking} />
      <Route path="/qa" component={WeeklyQA} />
      <Route path="/handlers/:id" component={HandlerProfile} />
      <Route path="/softphone" component={Softphone} />
      <Route path="/ivr-setup" component={IVRSetup} />
      <Route path="/my-dashboard" component={HandlerDashboard} />
      <Route path="/users" component={UserManagement} />
      <Route path="/settings" component={Settings} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ImpersonationProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </ImpersonationProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
