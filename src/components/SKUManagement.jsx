import React, { useState, useEffect } from "react";
import { skusService, recipesService, costingEngine } from "../services/supabaseService";
import { historyService } from "../services/historyService";

function normalizeName(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function average(values) {
  const numericValues = values.map((value) => Number(value)).filter((value) => Number.isFinite(value));
  if (!numericValues.length) return 0;
  return numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
}

function getRecipeNameById(recipes, recipeId) {
  return recipes.find((recipe) => recipe.id === recipeId)?.name || "";
}

const DEFAULT_MARGIN_THRESHOLD = 15;
const DEFAULT_SKU_FLAGS = {
  isActive: true,
  priceOverride: false,
};

export default function SKUManagement({ pendingImport, clearPendingImport, onOpenFormulation }) {
  const [skus, setSkus] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("list");
  const [selectedSku, setSelectedSku] = useState(null);

  // SKU Form Data
  const [skuForm, setSkuForm] = useState({
    name: "",
    category: "",
    recipe_id: "",
    baseCostPerLiter: 0,
    currentSellingPrice: 0,
  });

  // Pack Configuration
  const [packConfigs, setPackConfigs] = useState({
    "1L": { size: 1, unitsPerCarton: 12, packagingCost: 0.5, sellingPrice: 0 },
    "4L": { size: 4, unitsPerCarton: 4, packagingCost: 1.0, sellingPrice: 0 },
    "20L": { size: 20, unitsPerCarton: 1, packagingCost: 3.0, sellingPrice: 0 },
    "200L": { size: 200, unitsPerCarton: 1, packagingCost: 15.0, sellingPrice: 0 },
  });

  // Pricing Matrix
  const [pricingMatrix, setPricingMatrix] = useState({
    byMarket: { GCC: 0, Africa: 0, Asia: 0 },
    byCustomer: { Distributor: 0, Bulk: 0, Retail: 0 },
  });

  // Cost Build-Up
  const [costBreakup, setCostBreakup] = useState({
    blendCost: 0,
    packagingCost: 0,
    logisticsCost: 0,
    overheadAllocation: 0,
  });

  const marginThreshold = DEFAULT_MARGIN_THRESHOLD;

  const importedSkuDrafts = pendingImport?.kind === "sku-batch"
    ? (pendingImport.drafts || []).map((draft) => draft?.skuDraft || draft).filter(Boolean)
    : pendingImport?.kind === "sku"
      ? [pendingImport.draft]
      : [];
  const importedSkuDraft = importedSkuDrafts[0] || null;
  const linkedFormulationDrafts = pendingImport?.linkedFormulationDrafts || (pendingImport?.linkedFormulationDraft ? [pendingImport.linkedFormulationDraft] : []);
  const [importingBatch, setImportingBatch] = useState(false);
  const [linkedMatchConfirmed, setLinkedMatchConfirmed] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!importedSkuDraft || !recipes.length) return;

    if (!skuForm.recipe_id) {
      const candidateNames = [
        importedSkuDraft.recipeName,
        ...(importedSkuDraft.recipeNameCandidates || []),
        ...linkedFormulationDrafts.flatMap((draft) => [draft?.skuName, draft?.name]),
      ].filter(Boolean).map(normalizeName);

      const matchedRecipe = recipes.find((recipe) => {
        const recipeName = normalizeName(recipe.name);
        return candidateNames.some((candidate) => recipeName === candidate || recipeName.includes(candidate) || candidate.includes(recipeName));
      });
      if (matchedRecipe) {
        setSkuForm((current) => ({ ...current, recipe_id: matchedRecipe.id }));
        setLinkedMatchConfirmed(false);
      }
    }
  }, [importedSkuDraft, linkedFormulationDrafts, recipes, skuForm.recipe_id]);

  useEffect(() => {
    setLinkedMatchConfirmed(false);
  }, [importedSkuDraft?.name, importedSkuDraft?.recipeName, skuForm.recipe_id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [skusData, recipesData] = await Promise.all([skusService.getAll(), recipesService.getAll()]);
      setSkus(skusData);
      setRecipes(recipesData);
    } catch (err) {
      console.error("Error loading data:", err);
      alert("Failed to load SKU data. Check that Supabase is configured and that skus and recipes tables exist.");
    } finally {
      setLoading(false);
    }
  };

  // Calculate metrics
  const calculateMargin = (cost, price) => {
    if (price === 0) return 0;
    return ((price - cost) / price) * 100;
  };

  const calculateTotalCostPerPack = (packSize) => {
    const config = packConfigs[packSize];
    if (!config) return 0;
    const blendCostForPack = costBreakup.blendCost * config.size;
    const packagingCostPerUnit = config.packagingCost / config.unitsPerCarton;
    const logisticsCostPerUnit = costBreakup.logisticsCost / config.unitsPerCarton;
    const overheadPerUnit = costBreakup.overheadAllocation / config.unitsPerCarton;
    return blendCostForPack + packagingCostPerUnit + logisticsCostPerUnit + overheadPerUnit;
  };

  const calculatePackMargin = (packSize) => {
    const totalCost = calculateTotalCostPerPack(packSize);
    const config = packConfigs[packSize];
    return calculateMargin(totalCost, config.sellingPrice || 0);
  };

  const getSummarySource = () => importedSkuDraft || selectedSku || null;

  const resolveRecipeIdForDraft = (draft) => {
    const candidateNames = [
      draft?.recipeName,
      draft?.formulationName,
      draft?.linkedFormulation,
      ...(draft?.recipeNameCandidates || []),
      ...linkedFormulationDrafts.flatMap((item) => [item?.skuName, item?.name]),
    ].filter(Boolean).map(normalizeName);
    const matchedRecipe = recipes.find((recipe) => {
      const recipeName = normalizeName(recipe.name);
      return candidateNames.some((candidate) => recipeName === candidate || recipeName.includes(candidate) || candidate.includes(recipeName));
    });
    return matchedRecipe?.id || "";
  };

  const summarySource = getSummarySource();
  const useFormSummary = Boolean(importedSkuDraft) ? false : activeTab === "create" || !selectedSku;
  const totalCostPerLiter = costBreakup.blendCost + costBreakup.packagingCost + costBreakup.logisticsCost + costBreakup.overheadAllocation;
  const packEntries = Object.entries(packConfigs);
  const marketEntries = Object.entries(pricingMatrix.byMarket);
  const customerEntries = Object.entries(pricingMatrix.byCustomer);
  const livePackPrices = packEntries.map(([, config]) => Number(config.sellingPrice || 0)).filter((price) => price > 0);

  const summaryName = importedSkuDraft?.name || (useFormSummary ? skuForm.name : selectedSku?.name) || "New SKU";
  const summaryCategory = importedSkuDraft?.category || (useFormSummary ? skuForm.category : selectedSku?.category) || "-";
  const summaryBaseCost = Number(
    importedSkuDraft?.baseCostPerLiter ?? (useFormSummary ? skuForm.baseCostPerLiter : selectedSku?.base_cost_per_liter) ?? 0,
  );

  const summarySellingPrice = importedSkuDraft
      ? Number(importedSkuDraft.currentSellingPrice ?? 0)
      : useFormSummary
        ? Number(skuForm.currentSellingPrice || (livePackPrices.length ? average(livePackPrices) : 0) || 0)
        : Number(selectedSku?.current_selling_price ?? 0);

  const packMargins = packEntries.map(([packName]) => calculatePackMargin(packName));
  const pricedPackMargins = packEntries
    .filter(([, config]) => Number(config.sellingPrice || 0) > 0)
    .map(([packName]) => calculatePackMargin(packName));
  const summaryAveragePrice = summarySellingPrice || (livePackPrices.length ? average(livePackPrices) : 0);
  const summaryAverageMargin = importedSkuDraft
      ? Number(importedSkuDraft.marginPercent ?? 0)
      : useFormSummary
        ? (pricedPackMargins.length
          ? average(pricedPackMargins.filter((margin) => Number.isFinite(margin)))
          : calculateMargin(summaryBaseCost, summaryAveragePrice))
        : calculateMargin(summaryBaseCost, summarySellingPrice);

  const summaryRecipeId = importedSkuDraft
    ? resolveRecipeIdForDraft(importedSkuDraft)
    : useFormSummary
      ? skuForm.recipe_id
      : selectedSku?.recipe_id || "";
  const summaryLinkedFormulationName = importedSkuDraft
    ? getRecipeNameById(recipes, resolveRecipeIdForDraft(importedSkuDraft)) || importedSkuDraft.recipeName || importedSkuDraft.recipeNameCandidates?.[0] || ""
    : useFormSummary
      ? getRecipeNameById(recipes, skuForm.recipe_id)
      : selectedSku
        ? selectedSku.recipes?.name || getRecipeNameById(recipes, selectedSku.recipe_id)
        : "";

  const workbookFormulationName = linkedFormulationDrafts[0]?.skuName || linkedFormulationDrafts[0]?.name || "";

  const summarySourceLabel = summarySource === importedSkuDraft
    ? "Imported workbook"
    : useFormSummary
      ? "Current draft"
      : summarySource === selectedSku
        ? "Selected SKU"
        : "Current draft";

  const warningItems = [];
  const lowMarginPacks = packEntries
    .filter(([packName, config]) => Number(config.sellingPrice || 0) > 0 && calculatePackMargin(packName) < marginThreshold)
    .map(([packName]) => packName);
  if (lowMarginPacks.length > 0) {
    warningItems.push(`Margin below ${marginThreshold}% on ${lowMarginPacks.join(", ")}`);
  }
  if (!costBreakup.logisticsCost) {
    warningItems.push("Missing logistics cost");
  }
  if (!summaryLinkedFormulationName) {
    warningItems.push("Linked formulation not selected");
  }

  const handleImportDrafts = async () => {
    if (!importedSkuDrafts.length) return;

    const resolvedDrafts = [];
    const unresolvedDrafts = [];

    importedSkuDrafts.forEach((draft) => {
      const recipeId = resolveRecipeIdForDraft(draft);
      if (recipeId) {
        resolvedDrafts.push({ draft, recipeId });
      } else {
        unresolvedDrafts.push(draft);
      }
    });

    if (resolvedDrafts.length === 0) {
      const unresolvedNames = unresolvedDrafts
        .map((draft) => draft.name || draft.recipeName || draft.formulationName || draft.recipeNameCandidates?.[0] || "Unnamed SKU")
        .join(", ");
      alert(`I found SKU rows, but none of them matched a saved formulation yet: ${unresolvedNames}`);
      return;
    }

    setImportingBatch(true);
    try {
      for (const { draft, recipeId } of resolvedDrafts) {
        await skusService.create({
          name: draft.name || "Imported SKU",
          category: draft.category || "",
          recipe_id: recipeId,
          base_cost_per_liter: parseFloat(draft.baseCostPerLiter) || 0,
          current_selling_price: parseFloat(draft.currentSellingPrice) || 0,
          margin_threshold: marginThreshold,
          is_active: DEFAULT_SKU_FLAGS.isActive,
          price_override: DEFAULT_SKU_FLAGS.priceOverride,
        });
      }

      await loadData();
      setActiveTab("list");
      if (clearPendingImport) clearPendingImport();
      if (unresolvedDrafts.length > 0) {
        const unresolvedNames = unresolvedDrafts
          .map((draft) => draft.name || draft.recipeName || draft.formulationName || draft.recipeNameCandidates?.[0] || "Unnamed SKU")
          .join(", ");
        alert(`Imported ${resolvedDrafts.length} SKU${resolvedDrafts.length === 1 ? "" : "s"}. These still need a formulation match: ${unresolvedNames}`);
      } else {
        alert(`Imported ${resolvedDrafts.length} SKU${resolvedDrafts.length === 1 ? "" : "s"} successfully!`);
      }
    } catch (err) {
      console.error("Error bulk importing SKUs:", err);
      alert(err?.message || "Failed to import SKUs");
    } finally {
      setImportingBatch(false);
    }
  };

  const handleCreateSku = async (e) => {
    e.preventDefault();
    if (!skuForm.name || !skuForm.recipe_id || !skuForm.category) {
      alert("Please fill all required fields");
      return;
    }

    if (importedSkuDraft && !linkedMatchConfirmed) {
      alert("Confirm the formulation match before creating the SKU.");
      return;
    }

    try {
      await skusService.create({
        name: skuForm.name,
        category: skuForm.category,
        recipe_id: skuForm.recipe_id,
        base_cost_per_liter: parseFloat(skuForm.baseCostPerLiter) || 0,
        current_selling_price: parseFloat(skuForm.currentSellingPrice) || 0,
        margin_threshold: marginThreshold,
        is_active: DEFAULT_SKU_FLAGS.isActive,
        price_override: DEFAULT_SKU_FLAGS.priceOverride,
      });

      setSkuForm({ name: "", category: "", recipe_id: "", baseCostPerLiter: 0, currentSellingPrice: 0 });
      setActiveTab("list");
      await loadData();
      alert("SKU created successfully!");
    } catch (err) {
      console.error("Error creating SKU:", err);
      alert("Failed to create SKU");
    }
  };

  const handleConfirmLinkedMatch = () => {
    if (!skuForm.recipe_id) {
      alert("Choose a formulation first.");
      return;
    }

    setLinkedMatchConfirmed(true);
  };

  const handleSelectSku = (sku) => {
    setSelectedSku(sku);
    setActiveTab("list");
  };

  const applyImportedDraft = async () => {
    if (!importedSkuDraft) return;

    const configSnapshot = {
      skuForm: {
        name: importedSkuDraft.name || "",
        category: importedSkuDraft.category || "",
        recipe_id: resolveRecipeIdForDraft(importedSkuDraft) || importedSkuDraft.recipeId || "",
        baseCostPerLiter: importedSkuDraft.baseCostPerLiter || 0,
        currentSellingPrice: importedSkuDraft.currentSellingPrice || 0,
      },
      packConfigs,
      pricingMatrix,
      costBreakup,
      marginThreshold,
      sourceUploadId: importedSkuDraft.sourceUploadId || null,
    };

    setSkuForm(configSnapshot.skuForm);
    setActiveTab("create");

    try {
      await historyService.recordConfigVersion({
        configName: `${configSnapshot.skuForm.name || "SKU"} configuration`,
        configType: "sku",
        configVersion: 1,
        configData: configSnapshot,
        sourceUploadId: configSnapshot.sourceUploadId,
        notes: importedSkuDraft.workbookName || "Imported SKU draft",
      });
    } catch (historyError) {
      console.error("Failed to save SKU history:", historyError);
    }

    if (clearPendingImport) {
      clearPendingImport();
    }
  };

  if (loading) return <div className="p-6 text-center">Loading...</div>;

  return (
    <div className="page-stack">
      {importedSkuDraft && (
        <section className="page-section">
          <div className="content-card border-amber-300 bg-amber-50/70">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="section-title">Imported SKU Draft</h2>
                <p className="section-subtitle">
                  Excel detected a sellable SKU draft for {importedSkuDraft.name}. Nothing has been saved yet.
                </p>
                {!summaryLinkedFormulationName && workbookFormulationName && (
                  <p className="mt-2 text-sm font-semibold text-amber-900">
                    Workbook formulation draft detected: {workbookFormulationName}. Save that formulation first, then return here to confirm the SKU link.
                  </p>
                )}
                {importedSkuDrafts.length > 1 && (
                  <p className="mt-2 text-sm font-semibold text-amber-900">
                    {importedSkuDrafts.length} SKUs detected in this workbook.
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-amber-900">
                  <span className="rounded-full bg-amber-100 px-3 py-1">Cost / L: ${Number(importedSkuDraft.baseCostPerLiter || 0).toFixed(2)}</span>
                  <span className="rounded-full bg-amber-100 px-3 py-1">Excel margin: {Number(importedSkuDraft.marginPercent || 0).toFixed(1)}%</span>
                  <span className="rounded-full bg-amber-100 px-3 py-1">Logic: {importedSkuDraft.pricingLogicType}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {importedSkuDrafts.length > 1 ? (
                  <button type="button" onClick={handleImportDrafts} disabled={importingBatch} className="btn btn-primary">
                    {importingBatch ? "Importing..." : `Import All ${importedSkuDrafts.length} SKUs`}
                  </button>
                ) : (
                  <button type="button" onClick={applyImportedDraft} className="btn btn-primary">
                    Load into Create Form
                  </button>
                )}
                {onOpenFormulation && !summaryRecipeId && workbookFormulationName && (
                  <button type="button" onClick={onOpenFormulation} className="btn btn-secondary">
                    Open formulation first
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => clearPendingImport && clearPendingImport()}
                  className="btn btn-secondary"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="page-section">
        <div className="content-card border-slate-200 bg-slate-50/80">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="section-title">SKU Header</h2>
              <p className="section-subtitle">
                Configuration summary for the SKU you are building or reviewing.
              </p>
            </div>

            <button
              type="button"
              onClick={() => onOpenFormulation && summaryRecipeId && onOpenFormulation()}
              disabled={!summaryRecipeId || !onOpenFormulation}
              className="btn btn-secondary"
            >
              View formulation
            </button>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {[
              { label: "SKU Name", value: summaryName },
              { label: "Category", value: summaryCategory },
              { label: "Base Cost/L", value: `$${summaryBaseCost.toFixed(2)}` },
              { label: "Avg Selling Price", value: `$${summaryAveragePrice.toFixed(2)}` },
              { label: "Avg Margin", value: `${summaryAverageMargin.toFixed(1)}%` },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">{summarySourceLabel}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
              {summaryLinkedFormulationName ? `Linked formulation: ${summaryLinkedFormulationName}` : "Linked formulation not selected"}
            </span>
          </div>

          {importedSkuDraft && summaryRecipeId && (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-semibold text-emerald-900">Suggested formulation match</p>
                  <p className="text-sm text-emerald-800">{summaryLinkedFormulationName}. Confirm this is the right formulation before creating the SKU.</p>
                </div>
                <button type="button" onClick={handleConfirmLinkedMatch} className="btn btn-primary">
                  {linkedMatchConfirmed ? "Match confirmed" : "Confirm match"}
                </button>
              </div>
            </div>
          )}

          {importedSkuDraft && !summaryRecipeId && workbookFormulationName && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-semibold text-amber-900">This SKU still needs a saved formulation.</p>
              <p className="text-sm text-amber-800">
                Use the formulation draft from this workbook first, save it, then come back here and the SKU will auto-match.
              </p>
            </div>
          )}

          {warningItems.length > 0 && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-semibold text-amber-900">Light warnings</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {warningItems.map((warning) => (
                  <span key={warning} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-amber-900">
                    {warning}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="page-section">
        <h2 className="section-title">Pack Configuration</h2>
        <div className="content-card overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr>
                <th>Pack</th>
                <th>Units / Carton</th>
                <th>Packaging Cost</th>
                <th>Total Cost</th>
                <th>Selling Price</th>
                <th>Margin</th>
              </tr>
            </thead>
            <tbody>
              {packEntries.map(([packName, config]) => {
                const totalCost = calculateTotalCostPerPack(packName);
                const margin = calculatePackMargin(packName);
                const marginHealthy = Number(config.sellingPrice || 0) > 0 && margin >= marginThreshold;

                return (
                  <tr key={packName} className={!marginHealthy && Number(config.sellingPrice || 0) > 0 ? "bg-red-50" : ""}>
                    <td>
                      <div className="flex flex-col">
                        <span className="font-semibold text-gray-900">{packName}</span>
                        <span className="text-xs text-gray-500">{config.size}L pack</span>
                      </div>
                    </td>
                    <td>
                      <input
                        type="number"
                        step="1"
                        value={config.unitsPerCarton}
                        onChange={(e) => setPackConfigs({
                          ...packConfigs,
                          [packName]: { ...config, unitsPerCarton: parseFloat(e.target.value) || 0 },
                        })}
                        className="w-24 px-2 py-1 border border-gray-300 rounded text-right font-semibold"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        value={config.packagingCost}
                        onChange={(e) => setPackConfigs({
                          ...packConfigs,
                          [packName]: { ...config, packagingCost: parseFloat(e.target.value) || 0 },
                        })}
                        className="w-28 px-2 py-1 border border-gray-300 rounded text-right font-semibold"
                      />
                    </td>
                    <td className="font-semibold text-gray-900">${totalCost.toFixed(2)}</td>
                    <td>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="number"
                          step="0.01"
                          value={config.sellingPrice}
                          onChange={(e) => setPackConfigs({
                            ...packConfigs,
                            [packName]: { ...config, sellingPrice: parseFloat(e.target.value) || 0 },
                          })}
                          className="w-32 px-2 py-1 border border-gray-300 rounded text-right font-semibold"
                        />
                        <span className={`rounded-full px-2 py-1 text-xs font-bold ${marginHealthy ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                          {margin.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${marginHealthy ? "bg-emerald-50 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                        {marginHealthy ? "Healthy" : Number(config.sellingPrice || 0) > 0 ? "Below target" : "No price"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="page-section">
        <h2 className="section-title">Pricing Matrix</h2>
        <div className="section-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
          <div className="content-card">
            <div className="content-row-stack">
              <h3 className="text-lg font-semibold text-gray-900">Price per Market</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr>
                      <th>Market</th>
                      <th>Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marketEntries.map(([market, price]) => {
                      const margin = calculateMargin(totalCostPerLiter, price);
                      const healthy = Number(price || 0) > 0 && margin >= marginThreshold;
                      return (
                        <tr key={market} className={!healthy && Number(price || 0) > 0 ? "bg-red-50" : ""}>
                          <td className="font-semibold text-gray-900">{market}</td>
                          <td>
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                type="number"
                                step="0.01"
                                value={price}
                                onChange={(e) => setPricingMatrix({
                                  ...pricingMatrix,
                                  byMarket: { ...pricingMatrix.byMarket, [market]: parseFloat(e.target.value) || 0 },
                                })}
                                className="w-32 px-2 py-1 border border-gray-300 rounded text-right font-semibold"
                              />
                              <span className={`rounded-full px-2 py-1 text-xs font-bold ${healthy ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                                {margin.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="content-card">
            <div className="content-row-stack">
              <h3 className="text-lg font-semibold text-gray-900">Price per Customer Type</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr>
                      <th>Customer Type</th>
                      <th>Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerEntries.map(([type, price]) => {
                      const margin = calculateMargin(totalCostPerLiter, price);
                      const healthy = Number(price || 0) > 0 && margin >= marginThreshold;
                      return (
                        <tr key={type} className={!healthy && Number(price || 0) > 0 ? "bg-red-50" : ""}>
                          <td className="font-semibold text-gray-900">{type}</td>
                          <td>
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                type="number"
                                step="0.01"
                                value={price}
                                onChange={(e) => setPricingMatrix({
                                  ...pricingMatrix,
                                  byCustomer: { ...pricingMatrix.byCustomer, [type]: parseFloat(e.target.value) || 0 },
                                })}
                                className="w-32 px-2 py-1 border border-gray-300 rounded text-right font-semibold"
                              />
                              <span className={`rounded-full px-2 py-1 text-xs font-bold ${healthy ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                                {margin.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="page-section">
        <h2 className="section-title">Cost Build-Up</h2>
        <div className="content-card">
          <div className="content-row-stack">
            <div className="metric-grid metric-grid-5 mb-8">
              <div className="content-card-compact">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Blend Cost</span>
                  <input
                    type="number"
                    step="0.01"
                    value={costBreakup.blendCost}
                    onChange={(e) => setCostBreakup({ ...costBreakup, blendCost: parseFloat(e.target.value) || 0 })}
                    className="w-28 px-2 py-1 border border-gray-300 rounded text-right font-semibold"
                  />
                </div>
              </div>

              <div className="content-card-compact">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Packaging Cost</span>
                  <input
                    type="number"
                    step="0.01"
                    value={costBreakup.packagingCost}
                    onChange={(e) => setCostBreakup({ ...costBreakup, packagingCost: parseFloat(e.target.value) || 0 })}
                    className="w-28 px-2 py-1 border border-gray-300 rounded text-right font-semibold"
                  />
                </div>
              </div>

              <div className="content-card-compact">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Logistics Cost</span>
                  <input
                    type="number"
                    step="0.01"
                    value={costBreakup.logisticsCost}
                    onChange={(e) => setCostBreakup({ ...costBreakup, logisticsCost: parseFloat(e.target.value) || 0 })}
                    className="w-28 px-2 py-1 border border-gray-300 rounded text-right font-semibold"
                  />
                </div>
              </div>

              <div className="content-card-compact">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Overhead %</span>
                  <input
                    type="number"
                    step="0.01"
                    value={costBreakup.overheadAllocation}
                    onChange={(e) => setCostBreakup({ ...costBreakup, overheadAllocation: parseFloat(e.target.value) || 0 })}
                    className="w-28 px-2 py-1 border border-gray-300 rounded text-right font-semibold"
                  />
                </div>
              </div>

              <div className="content-card-compact">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-gray-900">Total Cost/L</span>
                  <span className="text-lg font-semibold text-gray-900">
                    ${totalCostPerLiter.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {[
                { label: "Blend Cost", value: costBreakup.blendCost },
                { label: "Packaging Cost", value: costBreakup.packagingCost },
                { label: "Logistics Cost", value: costBreakup.logisticsCost },
                { label: "Overhead", value: costBreakup.overheadAllocation },
              ].map((item, idx) => {
                const percentage = totalCostPerLiter > 0 ? (item.value / totalCostPerLiter) * 100 : 0;
                return (
                  <div key={idx} className="compact-item">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-semibold text-gray-900">{item.label}</span>
                      <span className="text-sm text-gray-600">${item.value.toFixed(2)} ({percentage.toFixed(1)}%)</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                      <div className="bg-gray-400 h-full" style={{ width: `${percentage}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-semibold text-gray-900">SKU Catalog</h2>
          <button
            onClick={() => setActiveTab("create")}
            className="btn btn-primary sku-add-button"
          >
            + Add New SKU
          </button>
        </div>

        {skus.length === 0 ? (
          <div className="table-container">
            <div className="px-6 py-12 text-center">
              <p className="text-gray-500">No saved SKUs yet. Save a formulation first, then create its SKU.</p>
            </div>
          </div>
        ) : (
          <div className="table-container">
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Product Name</th>
                    <th>Category</th>
                    <th>Linked Formulation</th>
                    <th>Base Cost/L</th>
                    <th>Current Selling Price</th>
                    <th>Margin %</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {skus.map((sku) => {
                    const margin = calculateMargin(sku.base_cost_per_liter || 0, sku.current_selling_price || 0);
                    return (
                      <tr key={sku.id}>
                        <td className="font-semibold">{sku.name}</td>
                        <td>{sku.category || "-"}</td>
                        <td>{sku.recipes?.name || "-"}</td>
                        <td className="text-right">${(sku.base_cost_per_liter || 0).toFixed(2)}</td>
                        <td className="text-right font-semibold">${(sku.current_selling_price || 0).toFixed(2)}</td>
                        <td className={`text-right font-semibold ${margin < marginThreshold ? "text-red-600" : "text-gray-900"}`}>
                          {margin.toFixed(1)}%
                        </td>
                        <td>
                          <button
                            onClick={() => handleSelectSku(sku)}
                            className="btn btn-primary text-sm"
                          >
                            View Details
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ====== CREATE SKU FORM ====== */}
      {activeTab === "create" && (
        <section className="page-section">
          <h2 className="section-title">Create New SKU</h2>
          <form onSubmit={handleCreateSku} className="table-container max-w-2xl">
            <div className="content-card">
              <div className="form-grid form-grid-2 mb-6">
                <div className="form-group">
                  <label className="text-sm font-semibold text-gray-900">SKU Name *</label>
                  <input
                    type="text"
                    value={skuForm.name}
                    onChange={(e) => setSkuForm({ ...skuForm, name: e.target.value })}
                    placeholder="e.g., 5W30 Synthetic"
                    required
                    className="mt-1"
                  />
                </div>

                <div className="form-group">
                  <label className="text-sm font-semibold text-gray-900">Category *</label>
                  <select
                    value={skuForm.category}
                    onChange={(e) => setSkuForm({ ...skuForm, category: e.target.value })}
                    required
                    className="mt-1"
                  >
                    <option value="">Select Category</option>
                    <option value="Engine Oil">Engine Oil</option>
                    <option value="Hydraulic Oil">Hydraulic Oil</option>
                    <option value="Gear Oil">Gear Oil</option>
                    <option value="Transmission Oil">Transmission Oil</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="text-sm font-semibold text-gray-900">Linked Formulation *</label>
                  <select
                    value={skuForm.recipe_id}
                    onChange={(e) => setSkuForm({ ...skuForm, recipe_id: e.target.value })}
                    required
                    className="mt-1"
                  >
                    <option value="">Select Formulation</option>
                    {recipes.map((recipe) => (
                      <option key={recipe.id} value={recipe.id}>
                        {recipe.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="text-sm font-semibold text-gray-900">Base Cost per Liter</label>
                  <input
                    type="number"
                    step="0.01"
                    value={skuForm.baseCostPerLiter}
                    onChange={(e) => setSkuForm({ ...skuForm, baseCostPerLiter: e.target.value })}
                    placeholder="0.00"
                    className="mt-1"
                  />
                </div>

                <div className="form-group">
                  <label className="text-sm font-semibold text-gray-900">Current Selling Price</label>
                  <input
                    type="number"
                    step="0.01"
                    value={skuForm.currentSellingPrice}
                    onChange={(e) => setSkuForm({ ...skuForm, currentSellingPrice: e.target.value })}
                    placeholder="0.00"
                    className="mt-1"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary w-full py-2"
              >
                Create SKU
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
