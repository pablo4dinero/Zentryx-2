import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuthStore } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";

import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import ProjectsList from "@/pages/projects";
import ProjectDetail from "@/pages/projects/[id]";
import Analytics from "@/pages/analytics";
import Team from "@/pages/team";
import Notifications from "@/pages/notifications";
import ActivityFeed from "@/pages/activity";
import BusinessDev from "@/pages/business-dev";
import ChatRoom from "@/pages/chat";
import Events from "@/pages/events";
import ProfilePage from "@/pages/profile";
import WeeklyActivities from "@/pages/weekly-activities";
import SalesForce from "@/pages/sales-force";
import AccountDetail from "@/pages/sales-force/[id]";
import Procurement from "@/pages/procurement";
import NotFound from "@/pages/not-found";

import { AppLayout } from "@/components/layout/AppLayout";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { token } = useAuthStore();
  const [location, setLocation] = useLocation();
  if (!token) { setLocation("/login"); return null; }
  return <AppLayout><Component /></AppLayout>;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/projects" component={() => <ProtectedRoute component={ProjectsList} />} />
      <Route path="/projects/:id" component={() => <ProtectedRoute component={ProjectDetail} />} />
      <Route path="/analytics" component={() => <ProtectedRoute component={Analytics} />} />
      <Route path="/team" component={() => <ProtectedRoute component={Team} />} />
      <Route path="/notifications" component={() => <ProtectedRoute component={Notifications} />} />
      <Route path="/activity" component={() => <ProtectedRoute component={ActivityFeed} />} />
      <Route path="/business-dev" component={() => <ProtectedRoute component={BusinessDev} />} />
      <Route path="/chat" component={() => <ProtectedRoute component={ChatRoom} />} />
      <Route path="/events" component={() => <ProtectedRoute component={Events} />} />
      <Route path="/profile" component={() => <ProtectedRoute component={ProfilePage} />} />
      <Route path="/weekly-activities" component={() => <ProtectedRoute component={WeeklyActivities} />} />
      <Route path="/sales-force" component={() => <ProtectedRoute component={SalesForce} />} />
      <Route path="/sales-force/:id" component={() => <ProtectedRoute component={AccountDetail} />} />
      <Route path="/procurement" component={() => <ProtectedRoute component={Procurement} />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
