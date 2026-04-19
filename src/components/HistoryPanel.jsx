import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { historyService } from "../services/historyService";

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export default function HistoryPanel() {
  const { session } = useAuth();
  const [history, setHistory] = useState({ uploads: [], configs: [], runs: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      setLoading(true);
      setError("");

      try {
        const data = await historyService.fetchHistory();
        if (!cancelled) {
          setHistory(data);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Failed to load history.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    if (session) {
      loadHistory();
    }

    return () => {
      cancelled = true;
    };
  }, [session]);

  return (
    <section className="page-section history-panel">
      <div className="content-card border-slate-200 bg-slate-50/80">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="section-title">History</h2>
            <p className="section-subtitle">Uploads, saved configs, and usage runs for the current account.</p>
          </div>
          <div className="text-sm text-slate-500">{session?.user?.email}</div>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Loading history...</p>
        ) : error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Recent Uploads</h3>
              <div className="mt-3 space-y-3 text-sm">
                {history.uploads.length ? history.uploads.slice(0, 4).map((item) => (
                  <div key={item.id} className="rounded-xl bg-slate-50 px-3 py-2">
                    <div className="font-semibold text-slate-900">{item.original_filename}</div>
                    <div className="text-slate-500">{formatDate(item.uploaded_at)}</div>
                  </div>
                )) : <p className="text-slate-500">No uploads yet.</p>}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Saved Configs</h3>
              <div className="mt-3 space-y-3 text-sm">
                {history.configs.length ? history.configs.slice(0, 4).map((item) => (
                  <div key={item.id} className="rounded-xl bg-slate-50 px-3 py-2">
                    <div className="font-semibold text-slate-900">{item.config_name}</div>
                    <div className="text-slate-500">v{item.config_version} • {formatDate(item.created_at)}</div>
                  </div>
                )) : <p className="text-slate-500">No configs saved yet.</p>}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Usage Runs</h3>
              <div className="mt-3 space-y-3 text-sm">
                {history.runs.length ? history.runs.slice(0, 4).map((item) => (
                  <div key={item.id} className="rounded-xl bg-slate-50 px-3 py-2">
                    <div className="font-semibold text-slate-900">{item.run_label || "Config run"}</div>
                    <div className="text-slate-500">{formatDate(item.created_at)}</div>
                  </div>
                )) : <p className="text-slate-500">No usage runs yet.</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}