import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { costingEngine, recipesService, skusService, supabase } from "../services/supabaseService";
import { historyService } from "../services/historyService";
import { useAuth } from "../context/AuthContext";

const CATEGORY_HINTS = [
  { test: /5w|10w|15w|20w|30|40|engine/i, value: "Engine Oil" },
  { test: /hydraulic|aw/i, value: "Hydraulic Oil" },
  { test: /gear/i, value: "Gear Oil" },
  { test: /transmission|atf/i, value: "Transmission Oil" },
];

const COST_KEYWORDS = ["sku", "component", "%", "percent", "percentage", "cost", "contribution", "blend"];
const PRICING_KEYWORDS = ["market", "sku", "price", "currency", "margin", "markup", "sell"];
const FORMULATION_KEYWORDS = ["base oil", "additive", "ingredient", "recipe", "formulation", "component", "blend"];

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const cleaned = String(value).replace(/[^0-9.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function mean(values) {
  const safeValues = values.filter((value) => Number.isFinite(value));
  if (!safeValues.length) return null;
  return safeValues.reduce((sum, value) => sum + value, 0) / safeValues.length;
}

function findHeaderIndex(headers, terms) {
  const normalizedHeaders = headers.map((header) => normalize(header));
  return normalizedHeaders.findIndex((header) => terms.some((term) => header.includes(normalize(term))));
}

function extractSheetFormulas(sheet) {
  return Object.entries(sheet)
    .filter(([cell]) => !cell.startsWith("!"))
    .map(([, value]) => value?.f)
    .filter(Boolean);
}

function scoreSheet(headers, sheetName) {
  const searchText = normalize([sheetName, ...headers].join(" "));
  const score = (keywords) => keywords.reduce((total, keyword) => total + (searchText.includes(normalize(keyword)) ? 1 : 0), 0);
  return {
    costing: score(COST_KEYWORDS),
    pricing: score(PRICING_KEYWORDS),
    formulation: score(FORMULATION_KEYWORDS),
  };
}

function detectSheetRole(headers, sheetName) {
  const scores = scoreSheet(headers, sheetName);
  const entries = Object.entries(scores).sort((left, right) => right[1] - left[1]);
  const [role, topScore] = entries[0];
  if (topScore <= 0) return "other";
  return role;
}

function detectPricingLogic({ pricingHeaders, formulas, costPerLiter, priceValues }) {
  const combined = normalize([...(pricingHeaders || []), ...(formulas || [])].join(" "));

  if (combined.includes("1 -") || combined.includes("1-")) {
    return { type: "Margin-based pricing", detail: "Formula references cost divided by 1 minus margin." };
  }

  if (combined.includes("1 +") || combined.includes("1+")) {
    return { type: "Markup-based pricing", detail: "Formula references cost multiplied by 1 plus margin." };
  }

  if (pricingHeaders.some((header) => /margin|markup/i.test(header))) {
    return { type: "Margin-based pricing", detail: "Margin column is present in the pricing structure." };
  }

  if (pricingHeaders.some((header) => /market/i.test(header)) && pricingHeaders.some((header) => /price/i.test(header))) {
    return {
      type: "Market-based pricing",
      detail: "Price is stored as a market matrix rather than a single formula.",
    };
  }

  const impliedMargins = priceValues
    .map((price) => (price > 0 && Number.isFinite(costPerLiter) ? ((price - costPerLiter) / price) * 100 : null))
    .filter((value) => Number.isFinite(value));

  const averageMargin = mean(impliedMargins);
  if (Number.isFinite(averageMargin)) {
    return {
      type: "Margin-based pricing",
      detail: "Margin is inferred from the cost-to-price relationship.",
    };
  }

  return { type: "Cost-plus pricing", detail: "No explicit formula was found, so pricing is inferred from cost and price values." };
}

function inferCategory(skuName) {
  for (const hint of CATEGORY_HINTS) {
    if (hint.test.test(skuName)) return hint.value;
  }
  return "Lubricants";
}

function buildAnalysis(workbook, systemBenchmarkMargin) {
  const sheetReports = workbook.SheetNames.map((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "", blankrows: false });
    const headers = rows[0] || [];
    const role = detectSheetRole(headers, sheetName);
    const formulas = extractSheetFormulas(worksheet);

    return {
      sheetName,
      headers,
      rows,
      role,
      formulas,
    };
  });

  const costSheet = sheetReports.find((sheet) => sheet.role === "costing" || /cost/i.test(sheet.sheetName)) || null;
  const pricingSheet = sheetReports.find((sheet) => sheet.role === "pricing" || /price/i.test(sheet.sheetName)) || null;
  const formulationSheet = sheetReports.find((sheet) => sheet.role === "formulation" || /formulation|recipe|blend/i.test(sheet.sheetName)) || null;

  const costBySku = new Map();
  const pricingBySku = new Map();
  const missingCostComponents = [];

  if (costSheet) {
    const skuIndex = findHeaderIndex(costSheet.headers, ["sku"]);
    const componentIndex = findHeaderIndex(costSheet.headers, ["component", "ingredient", "material"]);
    const percentIndex = findHeaderIndex(costSheet.headers, ["%", "percent", "percentage"]);
    const costIndex = findHeaderIndex(costSheet.headers, ["cost", "unit cost"]);
    const contributionIndex = findHeaderIndex(costSheet.headers, ["contribution", "impact"]);

    costSheet.rows.slice(1).forEach((row, index) => {
      const sku = normalize(row[skuIndex]);
      const component = row[componentIndex] || `Row ${index + 2}`;
      const percentage = toNumber(row[percentIndex]);
      const unitCost = toNumber(row[costIndex]);
      const contributionValue = toNumber(row[contributionIndex]);
      const contribution = contributionValue ?? (percentage !== null && unitCost !== null ? (percentage * unitCost) / 100 : null);

      if (!sku) return;

      if (!costBySku.has(sku)) {
        costBySku.set(sku, {
          sku,
          components: [],
          totalCostPerLiter: 0,
          missingComponents: [],
        });
      }

      const skuEntry = costBySku.get(sku);
      skuEntry.components.push({
        component: String(component),
        percentage,
        unitCost,
        contribution,
      });

      if (contribution !== null) {
        skuEntry.totalCostPerLiter += contribution;
      }

      if (!component || percentage === null || unitCost === null || contribution === null) {
        const missingLabel = `${sku.toUpperCase()}: ${component}`;
        skuEntry.missingComponents.push(missingLabel);
        missingCostComponents.push(missingLabel);
      }
    });
  }

  if (pricingSheet) {
    const marketIndex = findHeaderIndex(pricingSheet.headers, ["market", "region", "channel"]);
    const skuIndex = findHeaderIndex(pricingSheet.headers, ["sku"]);
    const priceIndex = findHeaderIndex(pricingSheet.headers, ["price", "selling price", "unit price"]);

    pricingSheet.rows.slice(1).forEach((row, index) => {
      const sku = normalize(row[skuIndex]);
      const market = row[marketIndex] || `Row ${index + 2}`;
      const price = toNumber(row[priceIndex]);

      if (!sku || price === null) return;

      if (!pricingBySku.has(sku)) {
        pricingBySku.set(sku, {
          sku,
          marketPrices: [],
        });
      }

      pricingBySku.get(sku).marketPrices.push({
        market: String(market),
        price,
      });
    });
  }

  const detectedSkus = Array.from(new Set([...costBySku.keys(), ...pricingBySku.keys()]));
  const fallbackBenchmark = Number.isFinite(systemBenchmarkMargin) ? systemBenchmarkMargin : 25;

  const skuInsights = detectedSkus.map((sku) => {
    const costEntry = costBySku.get(sku) || { components: [], totalCostPerLiter: 0, missingComponents: [] };
    const pricingEntry = pricingBySku.get(sku) || { marketPrices: [] };
    const priceValues = pricingEntry.marketPrices.map((entry) => entry.price);
    const averagePrice = mean(priceValues) || 0;
    const impliedMargins = priceValues
      .map((price) => (price > 0 ? ((price - costEntry.totalCostPerLiter) / price) * 100 : null))
      .filter((value) => Number.isFinite(value));
    const averageMargin = mean(impliedMargins) ?? 0;
    const logic = detectPricingLogic({
      pricingHeaders: pricingSheet ? pricingSheet.headers : [],
      formulas: [...(pricingSheet?.formulas || []), ...(costSheet?.formulas || [])],
      costPerLiter: costEntry.totalCostPerLiter,
      priceValues,
    });
    const systemBenchmarkPrice = costingEngine.calculateSellingPrice(costEntry.totalCostPerLiter, fallbackBenchmark);
    const profitPerUnit = averagePrice - costEntry.totalCostPerLiter;

    return {
      sku,
      displayName: sku.toUpperCase(),
      category: inferCategory(sku),
      costPerLiter: Number(costEntry.totalCostPerLiter.toFixed(2)),
      averagePrice: Number(averagePrice.toFixed(2)),
      averageMargin: Number(averageMargin.toFixed(2)),
      profitPerUnit: Number(profitPerUnit.toFixed(2)),
      pricingLogicType: logic.type,
      pricingLogicDetail: logic.detail,
      marketPrices: pricingEntry.marketPrices,
      components: costEntry.components,
      missingCostComponents: costEntry.missingComponents,
      systemBenchmarkMargin: fallbackBenchmark,
      systemBenchmarkPrice: Number(systemBenchmarkPrice.toFixed(2)),
      marginDelta: Number((averageMargin - fallbackBenchmark).toFixed(2)),
    };
  });

  return {
    workbookName: workbook.Props?.Title || workbook.SheetNames[0] || "Uploaded workbook",
    sheetReports,
    costSheet,
    pricingSheet,
    formulationSheet,
    skuInsights,
    missingCostComponents: Array.from(new Set(missingCostComponents)),
  };
}

function buildDrafts(report, selectedInsight) {
  if (!selectedInsight) return null;

  const componentDrafts = selectedInsight.components.map((component, index) => ({
    id: `${selectedInsight.sku}-${index}`,
    name: component.component,
    type: /base oil/i.test(component.component) ? "Base Oil" : "Additive",
    supplier: "Imported from Excel",
    percentage: component.percentage ?? 0,
    unitCost: component.unitCost ?? 0,
  }));

  const formulationDraft = {
    sourceUploadId: report.sourceUploadId || null,
    workbookName: report.workbookName,
    skuName: selectedInsight.displayName,
    category: selectedInsight.category,
    pricingLogicType: selectedInsight.pricingLogicType,
    estimatedCostPerLiter: selectedInsight.costPerLiter,
    marginPercent: selectedInsight.averageMargin,
    batchSize: 100,
    components: componentDrafts,
  };

  const skuDraft = {
    sourceUploadId: report.sourceUploadId || null,
    workbookName: report.workbookName,
    name: selectedInsight.displayName,
    category: selectedInsight.category,
    recipeName: `${selectedInsight.displayName} Formulation`,
    recipeId: "",
    baseCostPerLiter: selectedInsight.costPerLiter,
    currentSellingPrice: selectedInsight.averagePrice,
    marginPercent: selectedInsight.averageMargin,
    recommendedMarginPercent: selectedInsight.systemBenchmarkMargin,
    pricingLogicType: selectedInsight.pricingLogicType,
    marketPrices: selectedInsight.marketPrices,
    missingCostComponents: selectedInsight.missingCostComponents,
  };

  return { formulationDraft, skuDraft };
}

export default function ExcelIntelligence({ onPrepareImport }) {
  const { user } = useAuth();
  const [analysis, setAnalysis] = useState(null);
  const [loadingWorkbook, setLoadingWorkbook] = useState(false);
  const [error, setError] = useState("");
  const [selectedSku, setSelectedSku] = useState("");
  const [systemSummary, setSystemSummary] = useState({
    loaded: false,
    averageMargin: null,
    benchmarkMargin: 25,
  });

  useEffect(() => {
    let cancelled = false;

    const loadSystemSummary = async () => {
      try {
        const [skus, recipes] = await Promise.all([skusService.getAll(), recipesService.getAll()]);
        const margins = skus
          .map((sku) => {
            const recipe = recipes.find((entry) => entry.id === sku.recipe_id) || sku.recipes;
            const sellingPrice = toNumber(sku.current_selling_price ?? sku.selling_price ?? 0);
            if (!recipe || !sellingPrice) return null;
            const cost = costingEngine.calculateTotalCostPerUnit(recipe, sku).totalCost;
            return sellingPrice > 0 ? ((sellingPrice - cost) / sellingPrice) * 100 : null;
          })
          .filter((value) => Number.isFinite(value));

        const averageMargin = mean(margins);
        if (!cancelled) {
          setSystemSummary({
            loaded: true,
            averageMargin: averageMargin !== null ? Number(averageMargin.toFixed(2)) : null,
            benchmarkMargin: 25,
          });
        }
      } catch (loadError) {
        if (!cancelled) {
          setSystemSummary({
            loaded: false,
            averageMargin: null,
            benchmarkMargin: 25,
          });
        }
      }
    };

    loadSystemSummary();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedInsight = useMemo(() => {
    if (!analysis?.skuInsights?.length) return null;
    return analysis.skuInsights.find((entry) => entry.sku === selectedSku) || analysis.skuInsights[0];
  }, [analysis, selectedSku]);

  useEffect(() => {
    if (!analysis?.skuInsights?.length) {
      setSelectedSku("");
      return;
    }

    if (!selectedSku || !analysis.skuInsights.some((entry) => entry.sku === selectedSku)) {
      setSelectedSku(analysis.skuInsights[0].sku);
    }
  }, [analysis, selectedSku]);

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!user?.id) {
      setError("You must be signed in to upload workbooks.");
      event.target.value = "";
      return;
    }

    setLoadingWorkbook(true);
    setError("");

    try {
      const workbook = XLSX.read(await file.arrayBuffer(), {
        type: "array",
        cellFormula: true,
        cellDates: true,
      });

      const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
      const storagePath = `${user.id}/${Date.now()}-${safeFilename}`;
      const { error: storageError } = await supabase.storage
        .from("excel-uploads")
        .upload(storagePath, file, {
          contentType: file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          upsert: false,
        });

      if (storageError) {
        throw storageError;
      }

      const report = buildAnalysis(workbook, systemSummary.benchmarkMargin);
      const rowCount = report.sheetReports.reduce((total, sheet) => total + Math.max((sheet.rows || []).length - 1, 0), 0);
      const uploadRecord = await historyService.recordUpload({
        originalFilename: file.name,
        storageBucket: "excel-uploads",
        storagePath,
        fileSizeBytes: file.size,
        sheetCount: report.sheetReports.length,
        rowCount,
        sourceAppVersion: "1.0.0",
        notes: report.workbookName,
      });

      setAnalysis({ ...report, sourceUploadId: uploadRecord.id });
      setSelectedSku(report.skuInsights[0]?.sku || "");
    } catch (readError) {
      setAnalysis(null);
      setError(readError?.message || "Unable to read workbook");
    } finally {
      setLoadingWorkbook(false);
      event.target.value = "";
    }
  };

  const selectedDrafts = analysis && selectedInsight ? buildDrafts(analysis, selectedInsight) : null;

  const compareMargin = selectedInsight
    ? (selectedInsight.averageMargin - (systemSummary.averageMargin ?? selectedInsight.systemBenchmarkMargin)).toFixed(2)
    : "0.00";

  const comparisonBaseline = systemSummary.averageMargin ?? selectedInsight?.systemBenchmarkMargin ?? 25;
  const expectedBaselinePrice = selectedInsight
    ? costingEngine.calculateSellingPrice(selectedInsight.costPerLiter, comparisonBaseline)
    : 0;

  const hasWorkbook = Boolean(analysis);
  const pricingGap = selectedInsight ? Number((selectedInsight.averagePrice - expectedBaselinePrice).toFixed(2)) : 0;
  const statusLabel = selectedInsight
    ? selectedInsight.averageMargin < comparisonBaseline
      ? "Underpricing"
      : selectedInsight.averageMargin > comparisonBaseline
        ? "Above benchmark"
        : "Aligned"
    : "No data";

  const handlePrepare = (targetTab) => {
    if (!selectedDrafts || !onPrepareImport) return;
    const draft = targetTab === "formulation" ? selectedDrafts.formulationDraft : selectedDrafts.skuDraft;
    onPrepareImport(
      {
        kind: targetTab === "formulation" ? "formulation" : "sku",
        draft,
      },
      targetTab,
    );
  };

  return (
    <div className="page-stack">
      <section className="page-section">
        <div className="content-card border-dashed border-slate-300 bg-slate-50/70">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="section-title">Upload Excel Workbook</h2>
              <p className="section-subtitle">
                Detect cost columns, pricing columns, margin logic, and formulation structure before you decide whether to convert anything into the system.
              </p>
            </div>

            <label className="choose-file-button">
              <span>{loadingWorkbook ? "Analyzing workbook..." : "Choose Excel file"}</span>
              <input type="file" accept=".xlsx,.xls" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>

          {error && <p className="mt-4 text-sm font-semibold text-red-700">{error}</p>}
          {!analysis && !error && <p className="mt-4 text-sm text-slate-600">The app will not auto-fill your system. It only reads the workbook and prepares a draft when you explicitly ask for it.</p>}
        </div>
      </section>

      {hasWorkbook && (
        <>
          <section className="page-section">
            <h2 className="section-title">Structure Detection</h2>
            <div className="metric-grid metric-grid-3">
              <div className="metric-card">
                <p className="metric-label">Workbook</p>
                <p className="metric-value text-2xl">{analysis.workbookName}</p>
                <p className="metric-caption">{analysis.sheetReports.length} sheet(s) detected</p>
              </div>
              <div className="metric-card">
                <p className="metric-label">Cost Sheets</p>
                <p className="metric-value text-2xl">{analysis.costSheet ? 1 : 0}</p>
                <p className="metric-caption">Cost columns and contributions were found</p>
              </div>
              <div className="metric-card">
                <p className="metric-label">Pricing Sheets</p>
                <p className="metric-value text-2xl">{analysis.pricingSheet ? 1 : 0}</p>
                <p className="metric-caption">Pricing matrix and market rows were found</p>
              </div>
            </div>
          </section>

          <section className="page-section">
            <h2 className="section-title">Detected Sheets</h2>
            <div className="grid gap-4 xl:grid-cols-3">
              {analysis.sheetReports.map((sheet) => (
                <div key={sheet.sheetName} className="content-card hover-lift">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">{sheet.sheetName}</h3>
                      <p className="text-sm text-slate-600">{sheet.rows.length - 1} data row(s)</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-700">
                      {sheet.role}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-slate-700">
                    {sheet.headers.map((header) => (
                      <span key={header} className="rounded-full bg-slate-100 px-3 py-1">
                        {header || "(blank)"}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="page-section">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="section-title">Extracted Insights</h2>
                <p className="section-subtitle">
                  Select a SKU to review its cost per liter, margin, pricing logic, and pricing gap against the current system benchmark.
                </p>
              </div>

              {analysis.skuInsights.length > 1 && (
                <select
                  value={selectedSku}
                  onChange={(event) => setSelectedSku(event.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900"
                >
                  {analysis.skuInsights.map((entry) => (
                    <option key={entry.sku} value={entry.sku}>
                      {entry.displayName}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {selectedInsight && (
              <div className="metric-grid metric-grid-6">
                <div className="metric-card">
                  <p className="metric-label">Cost per liter</p>
                  <p className="metric-value">${selectedInsight.costPerLiter.toFixed(2)}</p>
                </div>
                <div className="metric-card">
                  <p className="metric-label">Margin used</p>
                  <p className="metric-value">{selectedInsight.averageMargin.toFixed(1)}%</p>
                </div>
                <div className="metric-card">
                  <p className="metric-label">Pricing logic</p>
                  <p className="metric-value text-2xl">{selectedInsight.pricingLogicType}</p>
                  <p className="metric-caption">{selectedInsight.pricingLogicDetail}</p>
                </div>
                <div className="metric-card">
                  <p className="metric-label">Profit per unit</p>
                  <p className="metric-value">${selectedInsight.profitPerUnit.toFixed(2)}</p>
                </div>
                <div className="metric-card">
                  <p className="metric-label">System benchmark</p>
                  <p className="metric-value">{comparisonBaseline.toFixed(1)}%</p>
                  <p className="metric-caption">
                    {systemSummary.loaded && systemSummary.averageMargin !== null
                      ? "Derived from current system SKUs"
                      : "Fallback benchmark used because the system has no margin history yet"}
                  </p>
                </div>
                <div className={`metric-card ${statusLabel === "Underpricing" ? "border-red-300" : ""}`}>
                  <p className="metric-label">Pricing status</p>
                  <p className={`metric-value ${statusLabel === "Underpricing" ? "text-red-600" : ""}`}>{statusLabel}</p>
                  <p className="metric-caption">Gap vs benchmark: {compareMargin}%</p>
                </div>
              </div>
            )}
          </section>

          {selectedInsight && (
            <section className="page-section">
              <h2 className="section-title">Missing Cost Components</h2>
              <div className="content-card">
                {selectedInsight.missingCostComponents.length > 0 ? (
                  <div className="flex flex-wrap gap-2 text-sm font-semibold text-amber-900">
                    {selectedInsight.missingCostComponents.map((component) => (
                      <span key={component} className="rounded-full bg-amber-100 px-3 py-1">
                        {component}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-600">No missing cost components were detected in the imported sheet.</p>
                )}
              </div>
            </section>
          )}

          {selectedInsight && selectedDrafts && (
            <section className="page-section">
              <h2 className="section-title">Compare With System</h2>
              <div className="metric-grid metric-grid-3">
                <div className="metric-card">
                  <p className="metric-label">Excel margin</p>
                  <p className="metric-value">{selectedInsight.averageMargin.toFixed(1)}%</p>
                </div>
                <div className="metric-card">
                  <p className="metric-label">System average margin</p>
                  <p className="metric-value">
                    {systemSummary.averageMargin !== null ? `${systemSummary.averageMargin.toFixed(1)}%` : "Not available"}
                  </p>
                </div>
                <div className="metric-card">
                  <p className="metric-label">Gap vs system benchmark price</p>
                  <p className={`metric-value ${pricingGap < 0 ? "text-red-600" : ""}`}>${pricingGap.toFixed(2)}</p>
                  <p className="metric-caption">
                    Expected at {comparisonBaseline.toFixed(1)}% margin: ${expectedBaselinePrice.toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="content-card border-slate-200 bg-slate-50/80">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Optional Conversion</h3>
                    <p className="text-sm text-slate-600">
                      Prepare a draft for the system without overwriting pricing rules. You choose whether to open SKU or formulation review.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => handlePrepare("skus")} className="btn btn-primary">
                      Convert to SKU draft
                    </button>
                    <button type="button" onClick={() => handlePrepare("formulation")} className="btn btn-secondary">
                      Convert to formulation draft
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 text-sm text-slate-700 md:grid-cols-2">
                  <div className="rounded-xl bg-white p-3 border border-slate-200">
                    <p className="font-semibold text-slate-900">SKU draft</p>
                    <p>Name: {selectedDrafts.skuDraft.name}</p>
                    <p>Category: {selectedDrafts.skuDraft.category}</p>
                    <p>Base cost/l: ${selectedDrafts.skuDraft.baseCostPerLiter.toFixed(2)}</p>
                  </div>
                  <div className="rounded-xl bg-white p-3 border border-slate-200">
                    <p className="font-semibold text-slate-900">Formulation draft</p>
                    <p>Components: {selectedDrafts.formulationDraft.components.length}</p>
                    <p>Detected margin: {selectedDrafts.formulationDraft.marginPercent.toFixed(1)}%</p>
                    <p>Workbook: {selectedDrafts.formulationDraft.workbookName}</p>
                  </div>
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}