import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ImpersonationProvider } from "./contexts/ImpersonationContext";
import { SoftphoneProvider } from "./contexts/SoftphoneContext";
import FloatingSoftphone from "./components/FloatingSoftphone";
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
import CallbackLog from "./pages/CallbackLog";
import Reports from "./pages/Reports";
import LossIntake from "./pages/LossIntake";
import DocGenerator from "./pages/DocGenerator";
import MailBot from "./pages/MailBot";
import ProRataCalc from "./pages/ProRataCalc";
import LiabilityGuide from "./pages/kb/LiabilityGuide";
import FaultDecisionTool from "./pages/kb/FaultDecisionTool";
import DeniedClaimEscalation from "./pages/kb/DeniedClaimEscalation";
import MarketsAndPolicy from "./pages/kb/MarketsAndPolicy";
import KnowledgeBase from "./pages/kb/KnowledgeBase";
import { useErrorReporter } from "./hooks/useErrorReporter";

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
      <Route path="/callback-log" component={CallbackLog} />
      <Route path="/reports" component={Reports} />
      <Route path="/loss-intake" component={LossIntake} />
      <Route path="/doc-generator" component={DocGenerator} />
      <Route path="/mail-bot" component={MailBot} />
      <Route path="/pro-rata" component={ProRataCalc} />
      <Route path="/kb/liability-guide" component={LiabilityGuide} />
      <Route path="/kb/fault-decision" component={FaultDecisionTool} />
      <Route path="/kb/denied-escalation" component={DeniedClaimEscalation} />
      <Route path="/kb/markets" component={MarketsAndPolicy} />
      <Route path="/kb/knowledge" component={KnowledgeBase} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

/** Inner component so hooks run inside tRPC + auth providers */
function AppInner() {
  useErrorReporter();
  return (
    <>
      <Router />
      {/* Persistent floating softphone — lives outside the router so it
          survives all page navigations. The Aircall SDK iframe is mounted
          once here and never destroyed. */}
      <FloatingSoftphone />
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ImpersonationProvider>
          <SoftphoneProvider>
            <TooltipProvider>
              <Toaster />
              <AppInner />
            </TooltipProvider>
          </SoftphoneProvider>
        </ImpersonationProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
import LouCalculator from "./pages/LouCalculator";
      <Route path="/lou-calculator" component={LouCalculator} />
