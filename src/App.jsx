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
    <div className="min-h-screen bg-gray-100">
      <Navigation activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <main className="max-w-7xl mx-auto py-8 px-4">
        {activeTab === "dashboard" && <Dashboard />}
        {activeTab === "formulation" && <FormulationEngine />}
        {activeTab === "skus" && <SKUManagement />}
        {activeTab === "quotes" && <QuoteBuilder />}
      </main>
    </div>
  );
}
