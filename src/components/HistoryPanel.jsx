import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { historyService } from "../services/historyService";

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function formatFileSize(bytes) {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) return "-";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "-";
  return `$${amount.toFixed(2)}`;
}

function formatPercent(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "-";
  return `${amount.toFixed(1)}%`;
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readValue(record, keys, fallback = null) {
  if (!record) return fallback;

  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return fallback;
}

function parseObject(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return {};
}

function getCreatedAt(record) {
  return readValue(record, ["created_at", "createdAt", "uploaded_at", "uploadedAt", "timestamp"], null);
}

function getSourceUploadId(record) {
  return readValue(record, ["sourceUploadId", "source_upload_id", "uploadId", "upload_id"], null);
}

function getUploadId(record) {
  return readValue(record, ["id", "upload_id", "uploadId"], null);
}

function getRecordTitle(record) {
  return readValue(
    record,
    ["original_filename", "originalFilename", "config_name", "configName", "run_label", "runLabel", "name", "title"],
    "Workbook session"
  );
}

function getRecordType(record) {
  return String(readValue(record, ["configType", "config_type", "runType", "run_type", "type"], "") || "").toLowerCase();
}

function getRecordData(record) {
  return parseObject(readValue(record, ["configData", "config_data", "runData", "run_data", "summaryData", "summary_data"], {}));
}

function normalizeUploadForReuse(upload) {
  return {
    ...upload,
    original_filename: readValue(upload, ["original_filename", "originalFilename"], ""),
    storage_bucket: readValue(upload, ["storage_bucket", "storageBucket"], ""),
    storage_path: readValue(upload, ["storage_path", "storagePath"], ""),
    file_size_bytes: readValue(upload, ["file_size_bytes", "fileSizeBytes"], 0),
    sheet_count: readValue(upload, ["sheet_count", "sheetCount"], 0),
    row_count: readValue(upload, ["row_count", "rowCount"], 0),
  };
}

function calculateFormulationCost(configData) {
  const components = Array.isArray(configData?.components)
    ? configData.components
    : Array.isArray(configData?.draft?.components)
      ? configData.draft.components
      : [];

  return components.reduce((sum, component) => {
    const percentage = toNumber(component.percentage ?? component.share ?? 0);
    const unitCost = toNumber(component.unitCost ?? component.cost ?? 0);
    return sum + (unitCost * percentage) / 100;
  }, 0);
}

function calculateSkuCost(configData) {
  return toNumber(
    configData?.skuForm?.baseCostPerLiter ??
      configData?.baseCostPerLiter ??
      configData?.draft?.estimatedCostPerLiter ??
      configData?.estimatedCostPerLiter ??
      configData?.costPerUnit ??
      0
  );
}

function calculateSkuPrice(configData) {
  return toNumber(
    configData?.skuForm?.currentSellingPrice ??
      configData?.currentSellingPrice ??
      configData?.draft?.currentSellingPrice ??
      configData?.averagePrice ??
      0
  );
}

function summarizeRecord(record) {
  if (!record) return null;

  const data = getRecordData(record);
  const type = getRecordType(record);
  const title = getRecordTitle(record);
  const notes = readValue(record, ["notes", "note"], "");

  const hasFormulationShape = Boolean(
    type.includes("formulation") ||
      data?.components?.length ||
      data?.draft?.components?.length
  );
  const hasSkuShape = Boolean(
    type.includes("sku") ||
      data?.skuForm ||
      data?.packConfigs ||
      data?.pricingMatrix ||
      data?.costBreakup
  );

  const cost = hasFormulationShape && !hasSkuShape
    ? calculateFormulationCost(data)
    : calculateSkuCost(data) || calculateFormulationCost(data);

  const price = calculateSkuPrice(data);
  const profit = price > 0 ? price - cost : 0;
  const margin = price > 0 ? (profit / price) * 100 : 0;

  return {
    title,
    type: type || (hasFormulationShape ? "formulation" : hasSkuShape ? "sku" : "config"),
    notes,
    cost,
    price,
    profit,
    margin,
    componentCount: Array.isArray(data?.components) ? data.components.length : Array.isArray(data?.draft?.components) ? data.draft.components.length : 0,
    packCount: data?.packConfigs ? Object.keys(data.packConfigs).length : 0,
    data,
  };
}

function summarizeRun(record) {
  if (!record) return null;

  const data = getRecordData(record);
  const cost = toNumber(
    data?.averageCostPerUnit ??
      data?.averageCostPerLiter ??
      data?.sessionCost ??
    data?.estimatedPortfolioCost ??
      data?.overallCost ??
      data?.totalCost ??
      data?.cost ??
      data?.costPerUnit ??
      0
  );
  const price = toNumber(
    data?.averageSellingPrice ??
      data?.averagePrice ??
      data?.sessionPrice ??
    data?.estimatedPortfolioRevenue ??
      data?.totalRevenue ??
      data?.sellingPrice ??
      data?.price ??
      data?.currentSellingPrice ??
      0
  );
  const profit = toNumber(
    data?.averageProfitPerUnit ??
      data?.sessionProfit ??
    data?.estimatedPortfolioProfit ??
      data?.grossProfit ??
      data?.profit ??
      data?.overallProfit ??
      0
  ) || (price > 0 ? price - cost : 0);
  const margin = toNumber(
    data?.averageMarginPercent ??
      data?.averageMargin ??
      data?.sessionMargin ??
    data?.estimatedPortfolioMargin ??
      data?.profitMargin ??
      data?.margin ??
      0
  ) || (price > 0 ? (profit / price) * 100 : 0);

  return {
    title: getRecordTitle(record),
    cost,
    price,
    profit,
    margin,
    data,
  };
}

function buildSessions(history) {
  const sessions = new Map();

  const addRecord = (kind, record) => {
    if (!record) return;

    const sourceUploadId = getSourceUploadId(record);
    const uploadId = kind === "upload" ? getUploadId(record) : null;
    const key = sourceUploadId ? `upload:${sourceUploadId}` : uploadId ? `upload:${uploadId}` : `${kind}:${getUploadId(record) || getRecordTitle(record)}`;

    if (!sessions.has(key)) {
      sessions.set(key, {
        key,
        upload: null,
        configs: [],
        runs: [],
        lastActivityAt: null,
      });
    }

    const session = sessions.get(key);

    if (kind === "upload") session.upload = record;
    if (kind === "config") session.configs.push(record);
    if (kind === "run") session.runs.push(record);

    const createdAt = getCreatedAt(record);
    if (!session.lastActivityAt || new Date(createdAt || 0) > new Date(session.lastActivityAt || 0)) {
      session.lastActivityAt = createdAt;
    }
  };

  (history.uploads || []).forEach((record) => addRecord("upload", record));
  (history.configs || []).forEach((record) => addRecord("config", record));
  (history.runs || []).forEach((record) => addRecord("run", record));

  return Array.from(sessions.values())
    .map((session) => {
      const configs = [...session.configs].sort((left, right) => new Date(getCreatedAt(right) || 0) - new Date(getCreatedAt(left) || 0));
      const runs = [...session.runs].sort((left, right) => new Date(getCreatedAt(right) || 0) - new Date(getCreatedAt(left) || 0));
      const latestRun = runs[0] || null;

      const formulationConfigs = configs.filter((record) => {
        const data = getRecordData(record);
        const type = getRecordType(record);
        return type.includes("formulation") || Boolean(data?.components?.length || data?.draft?.components?.length);
      });

      const skuConfigs = configs.filter((record) => {
        const data = getRecordData(record);
        const type = getRecordType(record);
        return type.includes("sku") || Boolean(data?.skuForm || data?.packConfigs || data?.pricingMatrix || data?.costBreakup);
      });

      const latestFormulationConfig = formulationConfigs[0] || configs[0] || null;
      const latestSkuConfig = skuConfigs[0] || configs[0] || null;
      const formulationSummary = summarizeRecord(latestFormulationConfig);
      const skuSummary = summarizeRecord(latestSkuConfig);
      const runSummary = summarizeRun(latestRun);

      const sessionCost = runSummary?.cost || skuSummary?.cost || formulationSummary?.cost || 0;
      const sessionPrice = runSummary?.price || skuSummary?.price || formulationSummary?.price || 0;
      const sessionProfit = runSummary?.profit || (sessionPrice > 0 ? sessionPrice - sessionCost : 0);
      const sessionMargin = runSummary?.margin || (sessionPrice > 0 ? (sessionProfit / sessionPrice) * 100 : 0);

      return {
        ...session,
        configs,
        runs,
        latestRun,
        latestFormulationConfig,
        latestSkuConfig,
        formulationSummary,
        skuSummary,
        runSummary,
        title: getRecordTitle(session.upload || latestSkuConfig || latestFormulationConfig || latestRun),
        uploadedAt: getCreatedAt(session.upload) || session.lastActivityAt,
        sheetCount: toNumber(readValue(session.upload, ["sheet_count", "sheetCount"], 0)),
        rowCount: toNumber(readValue(session.upload, ["row_count", "rowCount"], 0)),
        fileSizeBytes: readValue(session.upload, ["file_size_bytes", "fileSizeBytes"], 0),
        configCount: configs.length,
        runCount: runs.length,
        sessionCost,
        sessionPrice,
        sessionProfit,
        sessionMargin,
      };
    })
    .sort((left, right) => new Date(right.uploadedAt || right.lastActivityAt || 0) - new Date(left.uploadedAt || left.lastActivityAt || 0));
}

export default function HistoryPanel({ onReuseUpload }) {
  const { session: authSession } = useAuth();
  const [history, setHistory] = useState({ uploads: [], configs: [], runs: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reopeningUploadId, setReopeningUploadId] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      setLoading(true);
      setError("");

      try {
        if (!authSession) {
          if (!cancelled) {
            setHistory({ uploads: [], configs: [], runs: [] });
          }
          return;
        }

        const data = await historyService.fetchHistory();
        if (!cancelled) {
          setHistory({
            uploads: Array.isArray(data?.uploads) ? data.uploads : [],
            configs: Array.isArray(data?.configs) ? data.configs : [],
            runs: Array.isArray(data?.runs) ? data.runs : [],
          });
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError?.message || "Failed to load history.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, [authSession]);

  const sessions = useMemo(() => buildSessions(history), [history]);

  const totals = useMemo(
    () => ({
      sessions: sessions.length,
      uploads: history.uploads.length,
      configs: history.configs.length,
      runs: history.runs.length,
    }),
    [history, sessions]
  );

  const handleReuseUpload = async (upload) => {
    if (!onReuseUpload) return;

    setReopeningUploadId(upload?.id || null);
    try {
      await onReuseUpload(normalizeUploadForReuse(upload));
    } finally {
      setReopeningUploadId(null);
    }
  };

  return (
    <section className="page-section history-panel">
      <div className="content-card border-slate-200 bg-slate-50/80">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="section-title">History</h2>
            <p className="section-subtitle">Workbook sessions with saved formulations, SKU configs, and pricing outcomes.</p>
          </div>
          <div className="text-sm text-slate-500">{authSession?.user?.email}</div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm md:col-span-1 xl:col-span-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Sessions</p>
            <div className="mt-2 flex items-end justify-between gap-4">
              <p className="text-3xl font-semibold text-slate-900">{totals.sessions}</p>
              <p className="text-sm text-slate-500">Workbook uploads grouped by source upload.</p>
            </div>
          </div>
        </div>

        {loading ? (
          <p className="mt-6 text-sm text-slate-500">Loading history...</p>
        ) : error ? (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : sessions.length === 0 ? (
          <p className="mt-6 text-sm text-slate-500">No workbook sessions yet.</p>
        ) : (
          <div className="mt-6 space-y-6">
            {sessions.map((session) => {
              const upload = session.upload ? normalizeUploadForReuse(session.upload) : null;

              return (
                <div key={session.key} className="history-card p-6 md:p-7">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <div className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">Workbook Session</div>
                      <h3 className="text-lg font-semibold text-slate-900">{session.title}</h3>
                      <p className="text-sm text-slate-500">
                        Uploaded {formatDate(session.uploadedAt)} · {session.sheetCount || 0} sheet(s) · {session.rowCount || 0} row(s) · {formatFileSize(session.fileSizeBytes)}
                      </p>
                      <div className="flex flex-wrap gap-3 text-xs font-semibold text-slate-700">
                        <span className="rounded-full bg-slate-100 px-3 py-1.5">{session.configCount} config(s)</span>
                        <span className="rounded-full bg-slate-100 px-3 py-1.5">{session.runCount} run(s)</span>
                        {session.upload && (
                          <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-emerald-800">Workbook linked</span>
                        )}
                      </div>
                    </div>

                    {upload && onReuseUpload && (
                      <button
                        type="button"
                        onClick={() => handleReuseUpload(upload)}
                        disabled={reopeningUploadId === upload.id}
                        className="btn btn-primary text-sm"
                      >
                        {reopeningUploadId === upload.id ? "Opening..." : "Reuse workbook"}
                      </button>
                    )}
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-4">
                    {[
                      { label: "Overall Cost", value: formatMoney(session.sessionCost) },
                      { label: "Price", value: formatMoney(session.sessionPrice) },
                      { label: "Profit", value: formatMoney(session.sessionProfit) },
                      { label: "Margin", value: formatPercent(session.sessionMargin) },
                    ].map((metric) => (
                      <div key={metric.label} className="rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{metric.label}</p>
                        <p className="mt-2 text-lg font-semibold text-slate-900">{metric.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 grid gap-5 xl:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-5">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-sm font-bold uppercase tracking-[0.16em] text-slate-500">Saved Configs</h4>
                        <span className="text-xs text-slate-500">{session.configCount} record(s)</span>
                      </div>

                      <div className="mt-4 space-y-4">
                        {session.configs.length ? session.configs.map((config) => {
                          const summary = summarizeRecord(config);
                          const typeLabel = summary?.type?.includes("formulation") || summary?.componentCount > 0
                            ? "Formulation"
                            : summary?.type?.includes("sku") || summary?.packCount > 0
                              ? "SKU"
                              : "Config";

                          return (
                            <div key={config.id} className="history-card-item">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="font-semibold text-slate-900">
                                  {typeLabel}: {summary?.title || getRecordTitle(config)}
                                </div>
                                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                                  {formatDate(getCreatedAt(config))}
                                </span>
                              </div>
                              <div className="mt-2 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                                <div>Cost: {formatMoney(summary?.cost)}</div>
                                <div>Price: {formatMoney(summary?.price)}</div>
                                <div>Profit: {formatMoney(summary?.profit)}</div>
                                <div>Margin: {formatPercent(summary?.margin)}</div>
                              </div>
                              {summary?.notes && <div className="mt-2 text-xs text-slate-500">{summary.notes}</div>}
                            </div>
                          );
                        }) : <p className="history-card-empty">No configs linked to this session yet.</p>}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-5">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-sm font-bold uppercase tracking-[0.16em] text-slate-500">Session Details</h4>
                        <span className="text-xs text-slate-500">Latest activity {formatDate(session.lastActivityAt)}</span>
                      </div>

                      <div className="mt-4 space-y-4">
                        <div className="history-card-item">
                          <div className="font-semibold text-slate-900">Latest dashboard snapshot</div>
                          <div className="mt-3 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
                            <div>Cost: {formatMoney(session.sessionCost)}</div>
                            <div>Price: {formatMoney(session.sessionPrice)}</div>
                            <div>Profit: {formatMoney(session.sessionProfit)}</div>
                            <div>Margin: {formatPercent(session.sessionMargin)}</div>
                          </div>
                          {session.runSummary?.data && (
                            <div className="mt-3 text-xs text-slate-500">
                              Dashboard stats: {session.runSummary.data.totalSkus || 0} SKU(s) · {session.runSummary.data.totalFormulations || 0} formulation(s) · {session.runSummary.data.totalSnapshots || 0} snapshot(s)
                            </div>
                          )}
                        </div>

                        {session.latestRun ? (
                          <div className="history-card-item">
                            <div className="font-semibold text-slate-900">Latest run</div>
                            <div className="mt-1 text-sm text-slate-600">{summarizeRun(session.latestRun)?.title || getRecordTitle(session.latestRun)}</div>
                            <div className="mt-2 text-xs text-slate-500">{formatDate(getCreatedAt(session.latestRun))}</div>
                          </div>
                        ) : (
                          <p className="history-card-empty">No usage runs recorded yet for this workbook.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}