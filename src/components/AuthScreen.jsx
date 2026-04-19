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
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-slate-50">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center justify-center rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
        <div className="grid w-full gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[1.5rem] border border-white/10 bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950 p-8">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.3em] text-emerald-300">Multi-user pricing workspace</p>
            <h1 className="max-w-xl text-4xl font-black tracking-tight text-white md:text-5xl">
              Sign in to track Excel uploads, config history, and pricing changes per user.
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-slate-300">
              Each upload and each saved configuration can be tied back to the account that used it. That gives you a real audit trail across teams and devices.
            </p>
            <div className="mt-8 grid gap-3 text-sm text-slate-200">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">Per-user upload history</div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">Saved formulation and SKU snapshots</div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">Vercel + Supabase Auth ready</div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="rounded-[1.5rem] border border-slate-200 bg-white p-8 text-slate-900 shadow-xl">
            <div className="mb-6 flex rounded-2xl bg-slate-100 p-1 text-sm font-semibold">
              <button
                type="button"
                onClick={() => setMode("signin")}
                className={`flex-1 rounded-xl px-4 py-2 transition ${mode === "signin" ? "bg-slate-950 text-white" : "text-slate-600"}`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => setMode("signup")}
                className={`flex-1 rounded-xl px-4 py-2 transition ${mode === "signup" ? "bg-slate-950 text-white" : "text-slate-600"}`}
              >
                Create account
              </button>
            </div>

            <h2 className="text-2xl font-bold tracking-tight">Access your workspace</h2>
            <p className="mt-2 text-sm text-slate-500">Use the same email for all devices if you want shared history.</p>

            <div className="mt-6 space-y-4">
              {mode === "signup" && (
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">Full name</span>
                  <input
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none ring-0 focus:border-slate-950"
                    placeholder="Jane Operator"
                    autoComplete="name"
                  />
                </label>
              )}

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none ring-0 focus:border-slate-950"
                  placeholder="you@company.com"
                  autoComplete="email"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none ring-0 focus:border-slate-950"
                  placeholder="••••••••"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  required
                />
              </label>
            </div>

            {(message || error) && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {message || error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Working..." : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}