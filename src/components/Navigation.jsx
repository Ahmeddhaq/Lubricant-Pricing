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
        <div className="mb-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-left text-sm text-slate-200">
          <div className="text-xs uppercase tracking-[0.25em] text-slate-400">Signed in</div>
          <div className="mt-1 font-semibold text-white">{user?.email}</div>
          <button type="button" onClick={onSignOut} className="mt-3 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold text-white">
            Sign out
          </button>
        </div>
        <div className="sidebar-version">v1.0.0</div>
      </div>
    </nav>
  );
}

