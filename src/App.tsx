import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import Roadmap from "./pages/Roadmap";
import Metrics from "./pages/Metrics";
import DataRoom from "./pages/DataRoom";
import Settings from "./pages/Settings";
import Account from "./pages/Account";
import Admin from "./pages/Admin";
import AdminStartup from "./pages/AdminStartup";
import AdminOrganizations from "./pages/AdminOrganizations";
import AdminCompanies from "./pages/AdminCompanies";
import AdminUsers from "./pages/AdminUsers";
import AdminFunds from "./pages/AdminFunds";
import PortfolioStartup from "./pages/PortfolioStartup";
import InvestorPortfolio from "./pages/InvestorPortfolio";
import InvestorCompany from "./pages/InvestorCompany";
import Connections from "./pages/Connections";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/roadmap" element={<Roadmap />} />
            <Route path="/metrics" element={<Metrics />} />
            <Route path="/data-room" element={<DataRoom />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/account" element={<Account />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/admin/startup/:id" element={<AdminStartup />} />
            <Route path="/admin/organizations" element={<AdminOrganizations />} />
            <Route path="/admin/companies" element={<AdminCompanies />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/funds" element={<AdminFunds />} />
            <Route path="/portfolio" element={<InvestorPortfolio />} />
            <Route path="/portfolio/:company_id" element={<InvestorCompany />} />
            <Route path="/portfolio/:orgId/:startupId" element={<PortfolioStartup />} />
            <Route path="/conexiones" element={<Connections />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
