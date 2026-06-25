import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClientInstance } from "@/lib/query-client";
import { BrowserRouter as Router, Route, Routes, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { I18nProvider } from "@/lib/i18n";
import AppLayout from "@/components/layout/AppLayout";
import AppPINGate from "@/components/AppPINGate";
import PaymentGate from "@/pages/PaymentGate";

// Auth pages
import OwnerLogin    from "@/pages/auth/OwnerLogin";
import OwnerSignup   from "@/pages/auth/OwnerSignup";
import EmployeeLogin from "@/pages/auth/EmployeeLogin";

// App pages
import Dashboard             from "@/pages/Dashboard";
import POSTerminal           from "@/pages/POSTerminal";
import Orders                from "@/pages/Orders";
import Invoices              from "@/pages/Invoices";
import Products              from "@/pages/Products";
import Categories            from "@/pages/Categories";
import Inventory             from "@/pages/Inventory";
import Tables                from "@/pages/Tables";
import Customers             from "@/pages/Customers";
import Suppliers             from "@/pages/Suppliers";
import Expenses              from "@/pages/Expenses";
import Analytics             from "@/pages/Analytics";
import Employees             from "@/pages/Employees";
import Settings              from "@/pages/Settings";
import AIAssistant           from "@/pages/AIAssistant";
import EStore                from "@/pages/EStore";
import LoyaltySettings       from "@/pages/LoyaltySettings";
import PublicMenu            from "@/pages/PublicMenu";
import KitchenDisplay        from "@/pages/KitchenDisplay";
import KioskIntegration      from "@/pages/KioskIntegration";
import CarOrders             from "@/pages/CarOrders";
import LoyaltyCard           from "@/pages/LoyaltyCard";
import LoyaltyCardDesigner   from "@/pages/LoyaltyCardDesigner";
import LoyaltyQR             from "@/pages/LoyaltyQR";
import BranchAddressSettings from "@/pages/BranchAddressSettings";
import Support               from "@/pages/Support";
import AdminSupport          from "@/pages/AdminSupport";
import DomainManagement      from "@/pages/DomainManagement";
import SubscriptionManagement from "@/pages/SubscriptionManagement";
import BillingSubscribe       from "@/pages/BillingSubscribe";
import LandingPage           from "@/pages/LandingPage";
import PrivacyPolicy         from "@/pages/PrivacyPolicy";
import TermsConditions       from "@/pages/TermsConditions";
import AboutUs                from "@/pages/AboutUs";
import ThemeEditor           from "@/pages/ThemeEditor";
import SuperAdmin            from "@/pages/SuperAdmin";
import ZATCADashboard        from "@/pages/ZATCADashboard";
import Accounting            from "@/pages/accounting";
import ZATCASettings         from "@/pages/ZATCASettings";
import PageNotFound          from "@/lib/PageNotFound";

function RequireAuth({ children }) {
  const { session, loading, authChecked, isMissingEnv } = useAuth();
  const [sessionChecked, setSessionChecked] = React.useState(false);
  const [pinUnlocked, setPinUnlocked]       = React.useState(false);

  React.useEffect(() => {
    import('@/lib/security/session').then(({ loadSession }) =>
      loadSession().then(sess => {
        setPinUnlocked(!!(sess && sess.unlocked));
        setSessionChecked(true);
      })
    );
  }, []);

  if (loading || !authChecked || !sessionChecked) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  if (isMissingEnv) return children;

  if (!session && !pinUnlocked) return <Navigate to="/auth/login" replace />;
  return children;
}

function RequireOwner({ children }) {
  const owner = sessionStorage.getItem('owner_authenticated') === '1';
  return owner ? children : <Navigate to="/owner" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/home"          element={<LandingPage />} />
      <Route path="/owner"         element={<SuperAdmin />} />
      <Route path="/super-admin"    element={<SuperAdmin />} />
      <Route path="/privacy"       element={<PrivacyPolicy />} />
      <Route path="/terms"         element={<TermsConditions />} />
      <Route path="/about"         element={<AboutUs />} />
      <Route path="/menu"          element={<PublicMenu />} />
      <Route path="/store"         element={<PublicMenu />} />
      <Route path="/kitchen-display" element={<KitchenDisplay />} />
      <Route path="/loyalty/:id"   element={<LoyaltyCard />} />
      <Route path="/wallet/:token" element={<LoyaltyQR />} />
      <Route path="/auth/login"    element={<OwnerLogin />} />
      <Route path="/auth/signup"   element={<OwnerSignup />} />
      <Route path="/auth/employee" element={<EmployeeLogin />} />

      <Route path="*" element={
        <RequireAuth>
          <AppPINGate>
            <PaymentGate>
              <Routes>
                <Route element={<AppLayout />}>
                  <Route path="/"                   element={<Dashboard />} />
                  <Route path="/pos"                element={<POSTerminal />} />
                  <Route path="/orders"             element={<Orders />} />
                  <Route path="/invoices"           element={<Invoices />} />
                  <Route path="/products"           element={<Products />} />
                  <Route path="/categories"         element={<Categories />} />
                  <Route path="/inventory"          element={<Inventory />} />
                  <Route path="/tables"             element={<Tables />} />
                  <Route path="/kitchen"            element={<KitchenDisplay />} />
                  <Route path="/kiosk"              element={<KioskIntegration />} />
                  <Route path="/customers"          element={<Customers />} />
                  <Route path="/suppliers"          element={<Suppliers />} />
                  <Route path="/expenses"           element={<Expenses />} />
                  <Route path="/analytics"          element={<Analytics />} />
                  <Route path="/employees"          element={<Employees />} />
                  <Route path="/settings"           element={<Settings />} />
                  <Route path="/ai"                 element={<AIAssistant />} />
                  <Route path="/estore"             element={<EStore />} />
                  <Route path="/car-orders"         element={<CarOrders />} />
                  <Route path="/loyalty"            element={<LoyaltySettings />} />
                  <Route path="/loyalty-card-design" element={<LoyaltyCardDesigner />} />
                  <Route path="/branch-addresses"    element={<BranchAddressSettings />} />
                  <Route path="/support"            element={<Support />} />
                  <Route path="/admin-support"      element={<AdminSupport />} />
                  <Route path="/domain"             element={<DomainManagement />} />
                  <Route path="/theme"              element={<ThemeEditor />} />
                  <Route path="/subscriptions"      element={<SubscriptionManagement />} />
                  <Route path="/billing-subscribe"  element={<BillingSubscribe />} />
                  <Route path="/zatca-admin"        element={<ZATCADashboard />} />
                  <Route path="/zatca-settings"    element={<ZATCASettings />} />
                  <Route path="/accounting"          element={<Accounting />} />
                  <Route path="*"                   element={<PageNotFound />} />
                </Route>
              </Routes>
            </PaymentGate>
          </AppPINGate>
        </RequireAuth>
      } />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <I18nProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner position="top-center" dir="rtl" />
            <Router>
              <AppRoutes />
            </Router>
          </TooltipProvider>
        </I18nProvider>
      </QueryClientProvider>
    </AuthProvider>
  );
}
