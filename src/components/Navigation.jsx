import React from "react";

export default function Navigation({ activeTab, setActiveTab }) {
  const tabs = [
    { id: "dashboard", label: "Dashboard" },
    { id: "formulation", label: "Formulation" },
    { id: "skus", label: "SKUs" },
    { id: "quotes", label: "Quotes" },
  ];

  return (
    <nav className="sidebar-container">
      <div className="sidebar-brand">
        <h1>Lubricant Pricing</h1>
        <p>Trading Platform</p>
      </div>
      <div className="sidebar-menu">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`sidebar-menu-item ${
              activeTab === tab.id ? "active" : ""
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="sidebar-footer">
        <div className="sidebar-version">v1.0.0</div>
      </div>
    </nav>
  );
}

