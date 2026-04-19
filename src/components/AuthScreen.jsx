import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";

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
    <div className="auth-screen">
      <div className="auth-shell">
        <div className="auth-grid">
          <section className="auth-story">
            <div className="auth-eyebrow">Multi-user pricing workspace</div>
            <h1 className="auth-title">
              Sign in to track Excel uploads, config history, and pricing changes per user.
            </h1>
            <p className="auth-copy">
              Each upload and each saved configuration can be tied back to the account that used it. That gives you a real audit trail across teams and devices.
            </p>
            <div className="auth-pills">
              <div className="auth-pill">Per-user upload history</div>
              <div className="auth-pill">Saved formulation and SKU snapshots</div>
              <div className="auth-pill">Vercel + Supabase Auth ready</div>
            </div>
          </section>

          <form onSubmit={handleSubmit} className="auth-form-card">
            <div className="auth-toggle">
              <button
                type="button"
                onClick={() => setMode("signin")}
                className={mode === "signin" ? "auth-toggle-button active" : "auth-toggle-button"}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => setMode("signup")}
                className={mode === "signup" ? "auth-toggle-button active" : "auth-toggle-button"}
              >
                Create account
              </button>
            </div>

            <h2 className="auth-form-title">Access your workspace</h2>
            <p className="auth-form-copy">Use the same email for all devices if you want shared history.</p>

            <div className="auth-fields">
              {mode === "signup" && (
                <label className="auth-field">
                  <span className="auth-label">Full name</span>
                  <input
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    className="auth-input"
                    placeholder="Jane Operator"
                    autoComplete="name"
                  />
                </label>
              )}

              <label className="auth-field">
                <span className="auth-label">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="auth-input"
                  placeholder="you@company.com"
                  autoComplete="email"
                  required
                />
              </label>

              <label className="auth-field">
                <span className="auth-label">Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="auth-input"
                  placeholder="••••••••"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  required
                />
              </label>
            </div>

            {(message || error) && (
              <div className="auth-alert">
                {message || error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="auth-submit"
            >
              {busy ? "Working..." : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}