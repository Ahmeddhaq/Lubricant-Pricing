import React, { useState } from "react";
import Navigation from "./components/Navigation";
import Dashboard from "./components/Dashboard";
import FormulationEngine from "./components/FormulationEngine";
import SKUManagement from "./components/SKUManagement";
import QuoteBuilder from "./components/QuoteBuilder";
import "./App.css";

export default function PricingApp() {
  const [activeTab, setActiveTab] = useState("dashboard");

  return (
    <div className="app-container flex min-h-screen bg-white">
      <Navigation activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <main className="main-content">
        <div className="page-header">
          {activeTab === "dashboard" && <h1>Dashboard</h1>}
          {activeTab === "formulation" && <h1>Formulation Engine</h1>}
          {activeTab === "skus" && <h1>SKU Management</h1>}
          {activeTab === "quotes" && <h1>Quote Builder</h1>}
        </div>
        <div className="page-frame">
          {activeTab === "dashboard" && <Dashboard />}
          {activeTab === "formulation" && <FormulationEngine />}
          {activeTab === "skus" && <SKUManagement />}
          {activeTab === "quotes" && <QuoteBuilder />}
        </div>
      </main>
    </div>
  );
}
