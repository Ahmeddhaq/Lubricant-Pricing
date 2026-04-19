import React from "react";

export default function Navigation({ activeTab, setActiveTab, user, onSignOut }) {
  const tabs = [
    { id: "dashboard", label: "Dashboard" },
    {
      id: "excel",
      label: "Excel Intelligence",
      info: "Upload an Excel workbook to detect pricing, cost, and formulation structure. The app reads the file and prepares a draft; it does not overwrite your data automatically.",
    },
    {
      id: "formulation",
      label: "Formulation",
      info: "Use this to build or review a formulation from ingredients, base oils, and additives. You should verify component percentages, costs, and batch size before saving.",
    },
    {
      id: "skus",
      label: "SKUs",
      info: "Create and manage sellable SKU records from a formulation or imported draft. Check the pack size, pricing, and margin before you finalize anything.",
    },
    { id: "quotes", label: "Quotes" },
  ];

  return (
    <nav className="sidebar-container">
      <div className="sidebar-brand">
        <h1>Lubricant Pricing</h1>
      </div>
      <div className="sidebar-menu">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            role="button"
            tabIndex={0}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setActiveTab(tab.id);
              }
            }}
            className={`sidebar-menu-item ${
              activeTab === tab.id ? "active" : ""
            }`}
          >
            <span className="sidebar-menu-item-label">{tab.label}</span>
            {tab.info && (
              <button
                type="button"
                className="sidebar-info-button"
                title={tab.info}
                aria-label={`What ${tab.label} does`}
                onClick={(event) => event.stopPropagation()}
              >
                i
              </button>
            )}
          </div>
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

