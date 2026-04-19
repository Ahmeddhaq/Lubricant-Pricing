import React from "react";

export default function Navigation({ activeTab, setActiveTab, user, onSignOut }) {
  const tabs = [
    { id: "dashboard", label: "Dashboard" },
    { id: "excel", label: "Excel Intelligence" },
    { id: "formulation", label: "Formulation" },
    { id: "skus", label: "SKUs" },
    { id: "quotes", label: "Quotes" },
  ];

  return (
    <nav className="sidebar-container">
      <div className="sidebar-brand">
        <h1>Lubricant Pricing</h1>
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
        <div className="sidebar-user-card">
          <div className="sidebar-user-label">Signed in</div>
          <div className="sidebar-user-email">{user?.email}</div>
          <button type="button" onClick={onSignOut} className="sidebar-user-button">
            Sign out
          </button>
        </div>
        <div className="sidebar-version">v1.0.0</div>
      </div>
    </nav>
  );
}

