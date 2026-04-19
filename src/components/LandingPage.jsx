import React from "react";

const capabilities = [
  {
    title: "Formulation engine",
    text: "Build and review blends, ingredients, base oils, and additives with versioned control.",
  },
  {
    title: "Pricing engine",
    text: "Convert cost inputs into controlled pricing with margins, auditability, and repeatable logic.",
  },
  {
    title: "Export and container logic",
    text: "Handle pack sizes, container rules, and export-ready outputs without losing consistency.",
  },
  {
    title: "Quote system",
    text: "Turn approved SKUs into quotes quickly while keeping the source data traceable.",
  },
  {
    title: "Dashboard",
    text: "See uploads, saved configurations, and recent activity in one operational view.",
  },
];

const trustPoints = ["Audit trail", "Multi-user system", "Data control", "Consistency"];

const flowSteps = ["Formulation", "SKU", "Pricing", "Quotes", "Profit"];

const styles = {
  screen: {
    minHeight: "100vh",
    padding: "24px",
    background:
      "radial-gradient(circle at top left, rgba(34, 197, 94, 0.18), transparent 24%), radial-gradient(circle at top right, rgba(56, 189, 248, 0.14), transparent 20%), linear-gradient(135deg, #020617 0%, #0f172a 48%, #08111f 100%)",
    color: "#e5e7eb",
  },
  shell: {
    maxWidth: "1280px",
    minHeight: "calc(100vh - 48px)",
    margin: "0 auto",
    padding: "28px",
    borderRadius: "32px",
    border: "1px solid rgba(255,255,255,0.09)",
    background: "rgba(15, 23, 42, 0.72)",
    boxShadow: "0 30px 80px rgba(2, 6, 23, 0.52)",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "16px",
    marginBottom: "32px",
  },
  brand: {
    display: "grid",
    gap: "6px",
  },
  brandLabel: {
    color: "#86efac",
    fontSize: "11px",
    fontWeight: 800,
    letterSpacing: "0.22em",
    textTransform: "uppercase",
  },
  brandName: {
    margin: 0,
    color: "#f8fafc",
    fontSize: "1.15rem",
    fontWeight: 900,
    letterSpacing: "-0.03em",
  },
  headerActions: {
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
  },
  primaryButton: {
    minHeight: "46px",
    padding: "0 18px",
    borderRadius: "14px",
    border: "1px solid #0f172a",
    background: "linear-gradient(180deg, #f8fafc, #dbeafe)",
    color: "#0f172a",
    fontSize: "0.95rem",
    fontWeight: 900,
    cursor: "pointer",
  },
  secondaryButton: {
    minHeight: "46px",
    padding: "0 18px",
    borderRadius: "14px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.05)",
    color: "#e2e8f0",
    fontSize: "0.95rem",
    fontWeight: 800,
    cursor: "pointer",
  },
  hero: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.2fr) minmax(320px, 0.8fr)",
    gap: "24px",
    alignItems: "stretch",
  },
  heroPanel: {
    padding: "32px",
    borderRadius: "28px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "linear-gradient(135deg, rgba(15,23,42,0.96), rgba(3,7,18,0.98))",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
  },
  eyebrow: {
    display: "inline-flex",
    alignItems: "center",
    padding: "8px 12px",
    borderRadius: "999px",
    border: "1px solid rgba(110,231,183,0.24)",
    background: "rgba(16,185,129,0.08)",
    color: "#86efac",
    fontSize: "11px",
    fontWeight: 800,
    letterSpacing: "0.22em",
    textTransform: "uppercase",
    marginBottom: "18px",
  },
  title: {
    margin: 0,
    maxWidth: "14ch",
    color: "#f8fafc",
    fontSize: "clamp(2.35rem, 4.2vw, 4.6rem)",
    lineHeight: 0.98,
    fontWeight: 900,
    letterSpacing: "-0.06em",
  },
  summary: {
    maxWidth: "46rem",
    marginTop: "16px",
    color: "#cbd5e1",
    fontSize: "1rem",
    lineHeight: 1.7,
  },
  chips: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    marginTop: "22px",
  },
  chip: {
    padding: "10px 14px",
    borderRadius: "999px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.05)",
    color: "#e2e8f0",
    fontSize: "0.9rem",
    fontWeight: 700,
  },
  sidePanel: {
    padding: "28px",
    borderRadius: "28px",
    border: "1px solid rgba(148,163,184,0.26)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,250,252,0.98))",
    color: "#0f172a",
    boxShadow: "0 20px 45px rgba(15, 23, 42, 0.16)",
  },
  sideTitle: {
    margin: 0,
    color: "#0f172a",
    fontSize: "1.4rem",
    fontWeight: 900,
    letterSpacing: "-0.04em",
  },
  sideCopy: {
    marginTop: "10px",
    color: "#475569",
    fontSize: "0.95rem",
    lineHeight: 1.65,
  },
  flow: {
    display: "grid",
    gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
    gap: "12px",
    marginTop: "22px",
  },
  flowStep: {
    padding: "14px 12px",
    borderRadius: "16px",
    border: "1px solid rgba(15,23,42,0.08)",
    background: "#eef2ff",
    color: "#0f172a",
    fontSize: "0.9rem",
    fontWeight: 800,
    textAlign: "center",
  },
  section: {
    marginTop: "24px",
    padding: "24px",
    borderRadius: "24px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
  },
  sectionHeader: {
    color: "#f8fafc",
    fontSize: "1.1rem",
    fontWeight: 900,
    letterSpacing: "-0.03em",
    margin: 0,
  },
  sectionText: {
    marginTop: "8px",
    color: "#cbd5e1",
    fontSize: "0.95rem",
    lineHeight: 1.65,
  },
  capabilityGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "14px",
    marginTop: "18px",
  },
  capabilityCard: {
    padding: "16px",
    borderRadius: "18px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(15,23,42,0.55)",
  },
  capabilityTitle: {
    margin: 0,
    color: "#f8fafc",
    fontSize: "0.98rem",
    fontWeight: 900,
  },
  capabilityText: {
    marginTop: "8px",
    color: "#cbd5e1",
    fontSize: "0.92rem",
    lineHeight: 1.6,
  },
  trustRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    marginTop: "16px",
  },
  trustChip: {
    padding: "10px 14px",
    borderRadius: "999px",
    border: "1px solid rgba(110,231,183,0.18)",
    background: "rgba(16,185,129,0.08)",
    color: "#d1fae5",
    fontSize: "0.9rem",
    fontWeight: 700,
  },
  footerCta: {
    marginTop: "24px",
    padding: "24px",
    borderRadius: "24px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "linear-gradient(135deg, rgba(15,23,42,0.95), rgba(17,24,39,0.98))",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "16px",
    flexWrap: "wrap",
  },
  footerCopy: {
    maxWidth: "48rem",
  },
  footerTitle: {
    margin: 0,
    color: "#f8fafc",
    fontSize: "1.25rem",
    fontWeight: 900,
    letterSpacing: "-0.03em",
  },
  footerText: {
    marginTop: "8px",
    color: "#cbd5e1",
    fontSize: "0.95rem",
    lineHeight: 1.65,
  },
};

export default function LandingPage({ onSignIn, onRequestAccess }) {
  return (
    <div style={styles.screen}>
      <div style={styles.shell}>
        <div style={styles.header}>
          <div style={styles.brand}>
            <div style={styles.brandLabel}>Enterprise product overview</div>
            <h1 style={styles.brandName}>Lubricant Pricing</h1>
          </div>
          <div style={styles.headerActions}>
            <button type="button" onClick={onSignIn} style={styles.secondaryButton}>
              Sign in
            </button>
            <button type="button" onClick={onRequestAccess} style={styles.primaryButton}>
              Request access
            </button>
          </div>
        </div>

        <div style={styles.hero}>
          <section style={styles.heroPanel}>
            <div style={styles.eyebrow}>Product overview</div>
            <h2 style={styles.title}>One system for formulation, pricing, quotes, and profit control.</h2>
            <p style={styles.summary}>
              Built for enterprise teams that need a controlled workflow from product formulation through SKU management,
              pricing, quoting, and audit-ready history. It keeps the data model consistent across users, devices,
              and teams.
            </p>
            <div style={styles.chips}>
              <div style={styles.chip}>For internal pricing teams</div>
              <div style={styles.chip}>Built for controlled access</div>
              <div style={styles.chip}>Traceable by design</div>
            </div>
          </section>

          <section style={styles.sidePanel}>
            <h3 style={styles.sideTitle}>What it does in 10 seconds</h3>
            <p style={styles.sideCopy}>
              It takes formulation data, turns it into SKUs, applies pricing logic, generates quotes, and keeps a
              clean record of what changed and who changed it.
            </p>
            <div style={styles.flow}>
              {flowSteps.map((step) => (
                <div key={step} style={styles.flowStep}>
                  {step}
                </div>
              ))}
            </div>
          </section>
        </div>

        <section style={styles.section}>
          <h3 style={styles.sectionHeader}>Key capabilities</h3>
          <p style={styles.sectionText}>The product is organized around core modules, not feature clutter.</p>
          <div style={styles.capabilityGrid}>
            {capabilities.map((capability) => (
              <div key={capability.title} style={styles.capabilityCard}>
                <h4 style={styles.capabilityTitle}>{capability.title}</h4>
                <p style={styles.capabilityText}>{capability.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section style={styles.section}>
          <h3 style={styles.sectionHeader}>Enterprise trust</h3>
          <p style={styles.sectionText}>
            This is built for teams that care about auditability, access control, and consistent outputs across users.
          </p>
          <div style={styles.trustRow}>
            {trustPoints.map((point) => (
              <div key={point} style={styles.trustChip}>
                {point}
              </div>
            ))}
          </div>
        </section>

        <section style={styles.footerCta}>
          <div style={styles.footerCopy}>
            <h3 style={styles.footerTitle}>Ready to enter the workspace?</h3>
            <p style={styles.footerText}>
              Existing users can sign in. New users can request access and start from the controlled enterprise
              workflow.
            </p>
          </div>
          <div style={styles.headerActions}>
            <button type="button" onClick={onSignIn} style={styles.secondaryButton}>
              Sign in
            </button>
            <button type="button" onClick={onRequestAccess} style={styles.primaryButton}>
              Request access
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}