import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { LoadingState } from "@/components/LoadingState";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding";
import Invitations from "./pages/Invitations";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";
import Account from "./pages/Account";
import Connections from "./pages/Connections";
import NotFound from "./pages/NotFound";

// Role-gated route groups — lazy-loaded so an admin never downloads the
// founder/investor chunks (recharts included) and vice versa.
const Roadmap = lazy(() => import("./pages/Roadmap"));
const Metrics = lazy(() => import("./pages/Metrics"));
const GrowthTrackerSheets = lazy(() => import("./pages/GrowthTrackerSheets"));
const Reporting = lazy(() => import("./pages/Reporting"));
const ReportEditor = lazy(() => import("./pages/ReportEditor"));
const DataRoom = lazy(() => import("./pages/DataRoom"));

const Admin = lazy(() => import("./pages/Admin"));
const AdminStartup = lazy(() => import("./pages/AdminStartup"));
const AdminOrganizations = lazy(() => import("./pages/AdminOrganizations"));
const AdminCompanies = lazy(() => import("./pages/AdminCompanies"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const AdminFunds = lazy(() => import("./pages/AdminFunds"));
const AdminFinancialData = lazy(() => import("./pages/AdminFinancialData"));
const AdminRoadmap = lazy(() => import("./pages/AdminRoadmap"));

const InvestorPortfolio = lazy(() => import("./pages/InvestorPortfolio"));
const InvestorCompany = lazy(() => import("./pages/InvestorCompany"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <Analytics />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<LoadingState variant="fullScreen" />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/invitations" element={<Invitations />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/roadmap" element={<Roadmap />} />
            <Route path="/metrics" element={<Metrics />} />
            <Route path="/metrics/:metricId" element={<Metrics />} />
            <Route path="/growth-tracker/sheets" element={<GrowthTrackerSheets />} />
            <Route path="/reporting" element={<Reporting />} />
            <Route path="/reporting/:reportId" element={<ReportEditor />} />
            <Route path="/data-room" element={<DataRoom />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/account" element={<Account />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/admin/startup/:id" element={<AdminStartup />} />
            <Route path="/admin/organizations" element={<AdminOrganizations />} />
            <Route path="/admin/companies" element={<AdminCompanies />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/funds" element={<AdminFunds />} />
            <Route path="/admin/financial-data" element={<AdminFinancialData />} />
            <Route path="/admin/roadmap" element={<AdminRoadmap />} />
            <Route path="/portfolio" element={<InvestorPortfolio />} />
            <Route path="/portfolio/:company_id" element={<InvestorCompany />} />
            <Route path="/conexiones" element={<Connections />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
