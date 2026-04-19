import React, { useEffect, useState } from "react";
import Navigation from "./components/Navigation";
import Dashboard from "./components/Dashboard";
import FormulationEngine from "./components/FormulationEngine";
import SKUManagement from "./components/SKUManagement";
import QuoteBuilder from "./components/QuoteBuilder";
import ExcelIntelligence from "./components/ExcelIntelligence";
import { checkSupabaseConnection } from "./services/supabaseService";
import "./App.css";

export default function PricingApp() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [pendingImport, setPendingImport] = useState(null);
  const [supabaseStatus, setSupabaseStatus] = useState({ state: "checking" });

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

  return (
    <div className="app-container flex min-h-screen bg-white">
      <Navigation activeTab={activeTab} setActiveTab={setActiveTab} />
      
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

        <div className="page-header">
          {activeTab === "dashboard" && <h1>Dashboard</h1>}
          {activeTab === "excel" && <h1>Excel Intelligence</h1>}
          {activeTab === "formulation" && <h1>Formulation Engine</h1>}
          {activeTab === "skus" && <h1>SKU Management</h1>}
          {activeTab === "quotes" && <h1>Quote Builder</h1>}
        </div>
        <div className="page-frame">
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
