import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";

const styles = {
  screen: {
    minHeight: "100vh",
    padding: "24px",
    background:
      "radial-gradient(circle at top left, rgba(34, 197, 94, 0.2), transparent 26%), radial-gradient(circle at bottom right, rgba(59, 130, 246, 0.2), transparent 24%), linear-gradient(135deg, #020617 0%, #0f172a 48%, #08111f 100%)",
    color: "#e5e7eb",
  },
  shell: {
    maxWidth: "1280px",
    minHeight: "calc(100vh - 48px)",
    margin: "0 auto",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
    borderRadius: "32px",
    border: "1px solid rgba(255,255,255,0.09)",
    background: "rgba(15, 23, 42, 0.68)",
    boxShadow: "0 30px 80px rgba(2, 6, 23, 0.52)",
    overflow: "hidden",
    position: "relative",
  },
  grid: {
    position: "relative",
    zIndex: 1,
    width: "100%",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.08fr) minmax(0, 0.92fr)",
    alignItems: "start",
    gap: "24px",
  },
  story: {
    alignSelf: "start",
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
    border: "1px solid rgba(110,231,183,0.26)",
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
    maxWidth: "36rem",
    color: "#f8fafc",
    fontSize: "clamp(2rem, 3.2vw, 3.3rem)",
    lineHeight: 1.02,
    fontWeight: 900,
    letterSpacing: "-0.05em",
  },
  copy: {
    marginTop: "14px",
    maxWidth: "36rem",
    color: "#cbd5e1",
    fontSize: "0.98rem",
    lineHeight: 1.55,
  },
  pills: {
    display: "grid",
    gap: "10px",
    marginTop: "22px",
  },
  pill: {
    padding: "12px 14px",
    borderRadius: "14px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.05)",
    color: "#e2e8f0",
    fontSize: "0.92rem",
    fontWeight: 600,
  },
  form: {
    alignSelf: "start",
    padding: "28px",
    borderRadius: "28px",
    border: "1px solid rgba(148,163,184,0.26)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.99), rgba(248,250,252,0.98))",
    color: "#0f172a",
    boxShadow: "0 20px 45px rgba(15, 23, 42, 0.16)",
  },
  toggle: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "8px",
    padding: "6px",
    borderRadius: "16px",
    background: "#e2e8f0",
  },
  toggleButton: {
    minHeight: "46px",
    border: 0,
    borderRadius: "12px",
    background: "transparent",
    color: "#475569",
    fontSize: "0.95rem",
    fontWeight: 800,
    cursor: "pointer",
  },
  toggleButtonActive: {
    background: "#0f172a",
    color: "#ffffff",
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.22)",
  },
  formTitle: {
    margin: "22px 0 0",
    color: "#0f172a",
    fontSize: "1.75rem",
    fontWeight: 900,
    letterSpacing: "-0.04em",
  },
  formCopy: {
    marginTop: "8px",
    color: "#64748b",
    fontSize: "0.95rem",
    lineHeight: 1.6,
  },
  fields: {
    display: "grid",
    gap: "16px",
    marginTop: "22px",
  },
  field: {
    display: "grid",
    gap: "8px",
  },
  label: {
    color: "#334155",
    fontSize: "0.78rem",
    fontWeight: 900,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  },
  input: {
    width: "100%",
    minHeight: "50px",
    padding: "14px 16px",
    border: "1px solid #cbd5e1",
    borderRadius: "16px",
    background: "#ffffff",
    color: "#0f172a",
    fontSize: "0.98rem",
    outline: "none",
    boxShadow: "inset 0 1px 2px rgba(15,23,42,0.04)",
  },
  alert: {
    marginTop: "16px",
    padding: "14px 16px",
    borderRadius: "16px",
    border: "1px solid rgba(245,158,11,0.38)",
    background: "linear-gradient(180deg, rgba(255,251,235,1), rgba(255,247,237,0.95))",
    color: "#92400e",
    fontSize: "0.92rem",
    lineHeight: 1.5,
  },
  submit: {
    width: "100%",
    minHeight: "52px",
    marginTop: "20px",
    border: "1px solid #0f172a",
    borderRadius: "16px",
    background: "linear-gradient(180deg, #0f172a, #111827)",
    color: "#ffffff",
    fontSize: "0.98rem",
    fontWeight: 900,
    letterSpacing: "-0.01em",
    cursor: "pointer",
    boxShadow: "0 14px 30px rgba(15, 23, 42, 0.22)",
  },
};

export default function AuthScreen() {
  const { signIn, signUp, error } = useAuth();
  const [mode, setMode] = useState("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      if (mode === "signin") {
        await signIn({ email, password });
      } else {
        await signUp({ email, password, fullName });
        setMessage("Account created. Check your email if confirmation is enabled.");
      }
    } catch (submitError) {
      setMessage(submitError?.message || "Authentication failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={styles.screen}>
      <div style={styles.shell}>
        <div style={styles.grid}>
          <section style={styles.story}>
            <div style={styles.eyebrow}>Multi-user pricing workspace</div>
            <h1 style={styles.title}>
              Centralized control for formulation, pricing, and generating quotes
            </h1>
            <p style={styles.copy}>
              Per-user activity tracking
            </p>
            <div style={styles.pills}>
              <div style={styles.pill}>• Per-user activity tracking</div>
              <div style={styles.pill}>• Version history for formulations and SKUs</div>
              <div style={styles.pill}>• Full audit trail across teams</div>
            </div>
          </section>

          <form onSubmit={handleSubmit} style={styles.form}>
            <div style={styles.toggle}>
              <button
                type="button"
                onClick={() => setMode("signin")}
                style={mode === "signin" ? { ...styles.toggleButton, ...styles.toggleButtonActive } : styles.toggleButton}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => setMode("signup")}
                style={mode === "signup" ? { ...styles.toggleButton, ...styles.toggleButtonActive } : styles.toggleButton}
              >
                Create account
              </button>
            </div>

            <h2 style={styles.formTitle}>Access your workspace</h2>
            <p style={styles.formCopy}>Use the same email for all devices if you want shared history.</p>

            <div style={styles.fields}>
              {mode === "signup" && (
                <label style={styles.field}>
                  <span style={styles.label}>Full name</span>
                  <input
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    style={styles.input}
                    placeholder="Jane Operator"
                    autoComplete="name"
                  />
                </label>
              )}

              <label style={styles.field}>
                <span style={styles.label}>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  style={styles.input}
                  placeholder="you@company.com"
                  autoComplete="email"
                  required
                />
              </label>

              <label style={styles.field}>
                <span style={styles.label}>Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  style={styles.input}
                  placeholder="••••••••"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  required
                />
              </label>
            </div>

            {(message || error) && (
              <div style={styles.alert}>
                {message || error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              style={styles.submit}
            >
              {busy ? "Working..." : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}