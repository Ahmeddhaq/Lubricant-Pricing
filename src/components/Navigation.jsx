import React, { useState } from "react";

export default function Navigation({ activeTab, setActiveTab, user, onSignOut }) {
  const [openInfoTab, setOpenInfoTab] = useState(null);

  const tabs = [
    { id: "dashboard", label: "Dashboard" },
    {
      id: "excel",
      label: "Excel Intelligence",
      summary: "Upload an Excel workbook so the app can detect pricing rows, cost rows, and formulation structure.",
      whatItDoes: "Reads the workbook, detects sheets and formulas, extracts cost and pricing patterns, and prepares a draft without changing your system data.",
      whatYouDo: "Choose the workbook you want to analyze, review the detected sheets, then convert the result to a SKU draft or a formulation draft only if the extraction looks correct.",
    },
    {
      id: "formulation",
      label: "Formulation",
      summary: "Build or review a formulation from ingredients, base oils, and additives.",
      whatItDoes: "Lets you create the blend structure, calculate cost contribution, and track changes to your formulation setup.",
      whatYouDo: "Check each component, confirm the percentages add to 100%, verify unit costs, and only then save the formulation.",
    },
    {
      id: "skus",
      label: "SKUs",
      summary: "Create and manage sellable SKU records from a formulation or imported draft.",
      whatItDoes: "Stores the finished product record, pack sizes, pricing fields, and margin checks for items you plan to sell.",
      whatYouDo: "Review the imported draft or create a new SKU, set the pack sizes and selling prices, then confirm the margin is acceptable.",
    },
    { id: "quotes", label: "Quotes" },
  ];

  return (
    <>
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
              {tab.summary && (
                <button
                  type="button"
                  className="sidebar-info-button"
                  aria-label={`Open help for ${tab.label}`}
                  aria-expanded={openInfoTab === tab.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    setOpenInfoTab(openInfoTab === tab.id ? null : tab.id);
                  }}
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

      {tabs.map((tab) =>
        tab.summary && openInfoTab === tab.id ? (
          <div key={`${tab.id}-modal`} className="sidebar-help-backdrop" onClick={() => setOpenInfoTab(null)}>
            <div
              className="sidebar-help-modal"
              role="dialog"
              aria-modal="true"
              aria-label={`${tab.label} help`}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="sidebar-help-modal-header">
                <div>
                  <div className="sidebar-help-title">{tab.label}</div>
                  <div className="sidebar-help-summary">{tab.summary}</div>
                </div>
                <button type="button" className="sidebar-help-close" onClick={() => setOpenInfoTab(null)}>
                  Close
                </button>
              </div>

              <div className="sidebar-help-section">
                <span>What it does</span>
                <p>{tab.whatItDoes}</p>
              </div>
              <div className="sidebar-help-section">
                <span>What you need to do</span>
                <p>{tab.whatYouDo}</p>
              </div>
            </div>
          </div>
        ) : null
      )}
    </>
  );
}

