import React, { useState } from "react";
import Navigation from "./components/Navigation";
import Dashboard from "./components/Dashboard";
import FormulationEngine from "./components/FormulationEngine";
import SKUManagement from "./components/SKUManagement";
import QuoteBuilder from "./components/QuoteBuilder";
import ExcelIntelligence from "./components/ExcelIntelligence";
import { isSupabaseConfigured } from "./services/supabaseService";
import "./App.css";

export default function PricingApp() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [pendingImport, setPendingImport] = useState(null);
  const supabaseConfigured = isSupabaseConfigured();

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
        {!supabaseConfigured && (
          <div className="setup-warning-banner">
            <div>
              <h2>Frontend is loaded, but Supabase is not configured</h2>
              <p>
                The app shell is visible now. Add the Supabase env vars and schema to enable Formulation and SKU data loading.
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
