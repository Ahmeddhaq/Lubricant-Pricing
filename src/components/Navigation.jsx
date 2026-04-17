import React from "react";

export default function Navigation({ activeTab, setActiveTab }) {
  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: "📊" },
    { id: "formulation", label: "Formulation", icon: "⚗️" },
    { id: "skus", label: "SKUs", icon: "📦" },
    { id: "quotes", label: "Quotes", icon: "📄" },
  ];

  return (
    <nav className="bg-gradient-to-r from-blue-600 to-blue-800 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🛢️</span>
            <h1 className="text-xl font-bold">Lubricant Pricing SaaS</h1>
          </div>

          <div className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-lg font-semibold flex items-center gap-2 transition ${
                  activeTab === tab.id
                    ? "bg-white text-blue-600"
                    : "hover:bg-blue-500"
                }`}
              >
                <span>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}
