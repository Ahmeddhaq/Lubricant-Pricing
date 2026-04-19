import React, { useEffect, useState } from "react";
import Navigation from "./components/Navigation";
import Dashboard from "./components/Dashboard";
import FormulationEngine from "./components/FormulationEngine";
import SKUManagement from "./components/SKUManagement";
import QuoteBuilder from "./components/QuoteBuilder";
import ExcelIntelligence from "./components/ExcelIntelligence";
import SetupRequired from "./components/SetupRequired";
import AuthScreen from "./components/AuthScreen";
import LandingPage from "./components/LandingPage";
import HistoryPanel from "./components/HistoryPanel";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { checkSupabaseConnection, isSupabaseConfigured } from "./services/supabaseService";
import "./App.css";

function AppShell() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [pendingImport, setPendingImport] = useState(null);
  const [supabaseStatus, setSupabaseStatus] = useState({ state: "checking" });
  const [authView, setAuthView] = useState("landing");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { session, loading: authLoading, user, signOut } = useAuth();
  const supabaseConfigured = isSupabaseConfigured();

  useEffect(() => {
    let cancelled = false;

    const verifySupabase = async () => {
      const result = await checkSupabaseConnection();

      if (!cancelled) {
        setSupabaseStatus(result.ok ? { state: "ready" } : { state: "error", ...result });
      }
    };

    verifySupabase();

    return () => {
      cancelled = true;
    };
  }, []);

  const handlePrepareImport = (payload, targetTab) => {
    setPendingImport({ ...payload, targetTab });
    setActiveTab(targetTab);
    setSidebarOpen(false);
  };

  const clearPendingImport = () => {
    setPendingImport(null);
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSidebarOpen(false);
  };

  if (!supabaseConfigured) {
    return <SetupRequired />;
  }

  if (authLoading) {
    return <div className="flex min-h-screen items-center justify-center text-sm font-semibold text-slate-500">Loading workspace...</div>;
  }

  if (!session) {
    if (authView === "landing") {
      return (
        <div key="landing" className="page-transition">
          <LandingPage onSignIn={() => setAuthView("signin")} onCreateAccount={() => setAuthView("signup")} />
        </div>
      );
    }

    return (
      <div key={authView} className="page-transition">
        <AuthScreen initialMode={authView} onBackToLanding={() => setAuthView("landing")} />
      </div>
    );
  }

  return (
    <div className="app-container flex min-h-screen bg-white">
      <Navigation
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        user={user}
        onSignOut={signOut}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />
      
      <main className="main-content">
        <button
          type="button"
          className="sidebar-toggle-button"
          aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
          aria-expanded={sidebarOpen}
          onClick={() => setSidebarOpen((value) => !value)}
        >
          <span />
          <span />
          <span />
        </button>

        {supabaseStatus.state === "error" && (
          <div className="setup-warning-banner">
            <div>
              <h2>Supabase is not available to the frontend</h2>
              <p>
                {supabaseStatus.reason === "missing-config"
                  ? "The frontend build cannot see VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. Restart Vite after setting them in .env.local."
                  : `The app can read the env vars, but the Supabase probe failed: ${supabaseStatus.message}. Check the table schema, RLS policies, and project URL.`}
              </p>
            </div>
            <button type="button" onClick={() => setActiveTab("excel")} className="btn btn-primary">
              Try Excel Intelligence
            </button>
          </div>
        )}

        {activeTab === "dashboard" && <HistoryPanel />}

        <div className="page-header">
          {activeTab === "dashboard" && <h1>Dashboard</h1>}
          {activeTab === "excel" && <h1>Excel Intelligence</h1>}
          {activeTab === "formulation" && <h1>Formulation Engine</h1>}
          {activeTab === "skus" && <h1>SKU Management</h1>}
          {activeTab === "quotes" && <h1>Quote Builder</h1>}
        </div>
        <div className="page-frame">
          <div className={activeTab === "dashboard" ? "page-transition" : ""} hidden={activeTab !== "dashboard"}>
            <Dashboard />
          </div>
          <div className={activeTab === "excel" ? "page-transition" : ""} hidden={activeTab !== "excel"}>
            <ExcelIntelligence onPrepareImport={handlePrepareImport} />
          </div>
          <div className={activeTab === "formulation" ? "page-transition" : ""} hidden={activeTab !== "formulation"}>
            <FormulationEngine pendingImport={pendingImport} clearPendingImport={clearPendingImport} />
          </div>
          <div className={activeTab === "skus" ? "page-transition" : ""} hidden={activeTab !== "skus"}>
            <SKUManagement
              pendingImport={pendingImport}
              clearPendingImport={clearPendingImport}
              onOpenFormulation={() => handleTabChange("formulation")}
            />
          </div>
          <div className={activeTab === "quotes" ? "page-transition" : ""} hidden={activeTab !== "quotes"}>
            <QuoteBuilder />
          </div>
        </div>
      </main>
    </div>
  );
}

export default function PricingApp() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
