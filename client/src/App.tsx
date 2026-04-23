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

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/intake" component={IntakeRecords} />
      <Route path="/intake/new" component={NewIntake} />
      <Route path="/intake/:id" component={IntakeDetail} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/ivr-setup" component={IVRSetup} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
