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
  };

  const clearPendingImport = () => {
    setPendingImport(null);
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
      <Navigation activeTab={activeTab} setActiveTab={setActiveTab} user={user} onSignOut={signOut} />
      
      <main className="main-content">
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
        <div key={activeTab} className="page-frame page-transition">
          {activeTab === "dashboard" && <Dashboard />}
          {activeTab === "excel" && <ExcelIntelligence onPrepareImport={handlePrepareImport} />}
          {activeTab === "formulation" && (
            <FormulationEngine pendingImport={pendingImport} clearPendingImport={clearPendingImport} />
          )}
          {activeTab === "skus" && (
            <SKUManagement pendingImport={pendingImport} clearPendingImport={clearPendingImport} />
          )}
          {activeTab === "quotes" && <QuoteBuilder />}
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
