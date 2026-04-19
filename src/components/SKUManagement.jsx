import React, { useState, useEffect } from "react";
import { skusService, recipesService, costingEngine } from "../services/supabaseService";
import { historyService } from "../services/historyService";

export default function SKUManagement({ pendingImport, clearPendingImport }) {
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

  // Margin Analysis
  const [marginThreshold, setMarginThreshold] = useState(15);

  // Status & Controls
  const [skuStatus, setSkuStatus] = useState({
    isActive: true,
    priceOverride: false,
  });

  const importedSkuDraft = pendingImport?.kind === "sku" ? pendingImport.draft : null;

  useEffect(() => {
    loadData();
  }, []);

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

  const handleCreateSku = async (e) => {
    e.preventDefault();
    if (!skuForm.name || !skuForm.recipe_id || !skuForm.category) {
      alert("Please fill all required fields");
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
        is_active: skuStatus.isActive,
        price_override: skuStatus.priceOverride,
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

  const handleSelectSku = (sku) => {
    setSelectedSku(sku);
    setActiveTab("detail");
  };

  const applyImportedDraft = async () => {
    if (!importedSkuDraft) return;

    const configSnapshot = {
      skuForm: {
        name: importedSkuDraft.name || "",
        category: importedSkuDraft.category || "",
        recipe_id: importedSkuDraft.recipeId || "",
        baseCostPerLiter: importedSkuDraft.baseCostPerLiter || 0,
        currentSellingPrice: importedSkuDraft.currentSellingPrice || 0,
      },
      packConfigs,
      pricingMatrix,
      costBreakup,
      marginThreshold,
      skuStatus,
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
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-amber-900">
                  <span className="rounded-full bg-amber-100 px-3 py-1">Cost / L: ${Number(importedSkuDraft.baseCostPerLiter || 0).toFixed(2)}</span>
                  <span className="rounded-full bg-amber-100 px-3 py-1">Excel margin: {Number(importedSkuDraft.marginPercent || 0).toFixed(1)}%</span>
                  <span className="rounded-full bg-amber-100 px-3 py-1">Logic: {importedSkuDraft.pricingLogicType}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={applyImportedDraft} className="btn btn-primary">
                  Load into Create Form
                </button>
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

      {/* ====== SECTION 1: SKU LIST ====== */}
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
              <p className="text-gray-500">No SKUs found. Create one to get started.</p>
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

      {/* ====== SECTION 2: PACK CONFIGURATION ====== */}
      <section className="page-section">
        <h2 className="section-title">Pack Configuration</h2>
        <div className="section-grid sku-pack-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
          {Object.entries(packConfigs).map(([packName, config], idx) => {
            const totalCost = calculateTotalCostPerPack(packName);
            const margin = calculateMargin(totalCost, config.sellingPrice || 0);
            return (
              <div key={idx} className="content-card sku-pack-card">
                <div className="content-row-stack">
                  <h3 className="text-lg font-semibold text-gray-900">{packName} Configuration</h3>
                  <div className="space-y-5">
                    <div className="compact-item">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Pack Size</span>
                        <span className="font-semibold text-gray-900">{config.size}L</span>
                      </div>
                    </div>

                    <div className="compact-item">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Units per Carton</span>
                        <span className="font-semibold text-gray-900">{config.unitsPerCarton}</span>
                      </div>
                    </div>

                    <div className="compact-item">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Packaging Cost</span>
                        <span className="font-semibold text-gray-900">${config.packagingCost.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="compact-item">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-gray-600">Final Cost per Pack</span>
                        <span className="text-lg font-semibold text-gray-900">${totalCost.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="compact-item">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Selling Price per Pack</span>
                        <input
                          type="number"
                          step="0.01"
                          value={config.sellingPrice}
                          onChange={(e) => setPackConfigs({
                            ...packConfigs,
                            [packName]: { ...config, sellingPrice: parseFloat(e.target.value) || 0 }
                          })}
                          className="w-32 px-2 py-1 border border-gray-300 rounded text-right"
                        />
                      </div>
                    </div>

                    <div className={`compact-item ${margin >= marginThreshold ? "" : "border-red-300 bg-red-50"}`}>
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-gray-900">Pack Margin</span>
                        <span className={`text-lg font-semibold ${margin >= marginThreshold ? "text-gray-900" : "text-red-600"}`}>
                          {margin.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ====== SECTION 3: PRICING MATRIX ====== */}
      <section className="page-section">
        <h2 className="section-title">Pricing Matrix</h2>
        <div className="section-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
          {/* Price by Market */}
          <div className="content-card">
            <div className="content-row-stack">
              <h3 className="text-lg font-semibold text-gray-900">Price per Market</h3>
              <div className="space-y-3">
                {Object.entries(pricingMatrix.byMarket).map(([market, price], idx) => (
                  <div key={idx} className="compact-item">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 font-semibold">{market}</span>
                      <input
                        type="number"
                        step="0.01"
                        value={price}
                        onChange={(e) => setPricingMatrix({
                          ...pricingMatrix,
                          byMarket: { ...pricingMatrix.byMarket, [market]: parseFloat(e.target.value) || 0 }
                        })}
                        className="w-32 px-2 py-1 border border-gray-300 rounded text-right font-semibold"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Price by Customer Type */}
          <div className="content-card">
            <div className="content-row-stack">
              <h3 className="text-lg font-semibold text-gray-900">Price per Customer Type</h3>
              <div className="space-y-3">
                {Object.entries(pricingMatrix.byCustomer).map(([type, price], idx) => (
                  <div key={idx} className="compact-item">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 font-semibold">{type}</span>
                      <input
                        type="number"
                        step="0.01"
                        value={price}
                        onChange={(e) => setPricingMatrix({
                          ...pricingMatrix,
                          byCustomer: { ...pricingMatrix.byCustomer, [type]: parseFloat(e.target.value) || 0 }
                        })}
                        className="w-32 px-2 py-1 border border-gray-300 rounded text-right font-semibold"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ====== SECTION 4: COST BUILD-UP VIEW ====== */}
      <section className="page-section">
        <h2 className="section-title">Cost Build-Up View</h2>
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
                    ${(costBreakup.blendCost + costBreakup.packagingCost + costBreakup.logisticsCost + costBreakup.overheadAllocation).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Cost Breakdown Visualization */}
            <div className="space-y-3">
              {[
                { label: "Blend Cost", value: costBreakup.blendCost },
                { label: "Packaging Cost", value: costBreakup.packagingCost },
                { label: "Logistics Cost", value: costBreakup.logisticsCost },
                { label: "Overhead", value: costBreakup.overheadAllocation },
              ].map((item, idx) => {
                const total = costBreakup.blendCost + costBreakup.packagingCost + costBreakup.logisticsCost + costBreakup.overheadAllocation;
                const percentage = total > 0 ? (item.value / total) * 100 : 0;
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

      {/* ====== SECTION 5: MARGIN ANALYSIS ====== */}
      <section className="page-section">
        <h2 className="section-title">Margin Analysis</h2>
        <div className="metric-grid metric-grid-3">
          {/* Margin per Pack */}
          <div className="content-card">
            <div className="content-row-stack">
              <h3 className="text-lg font-semibold text-gray-900">Margin per Pack</h3>
              <div className="space-y-3">
                {Object.keys(packConfigs).map((packName, idx) => {
                  const margin = calculatePackMargin(packName);
                  return (
                    <div key={idx} className={`compact-item ${margin >= marginThreshold ? "" : "border-red-300 bg-red-50"}`}>
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-gray-900">{packName}</span>
                        <span className={`text-lg font-semibold ${margin >= marginThreshold ? "text-gray-900" : "text-red-600"}`}>
                          {margin.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Margin per Market */}
          <div className="content-card">
            <div className="content-row-stack">
              <h3 className="text-lg font-semibold text-gray-900">Margin per Market</h3>
              <div className="space-y-3">
                {Object.entries(pricingMatrix.byMarket).map(([market, price], idx) => {
                  const totalCost = costBreakup.blendCost + costBreakup.packagingCost + costBreakup.logisticsCost + costBreakup.overheadAllocation;
                  const margin = calculateMargin(totalCost, price);
                  return (
                    <div key={idx} className={`compact-item ${margin >= marginThreshold ? "" : "border-red-300 bg-red-50"}`}>
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-gray-900">{market}</span>
                        <span className={`text-lg font-semibold ${margin >= marginThreshold ? "text-gray-900" : "text-red-600"}`}>
                          {margin.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Margin per Customer Type */}
          <div className="content-card">
            <div className="content-row-stack">
              <h3 className="text-lg font-semibold text-gray-900">Margin per Customer</h3>
              <div className="space-y-3">
                {Object.entries(pricingMatrix.byCustomer).map(([type, price], idx) => {
                  const totalCost = costBreakup.blendCost + costBreakup.packagingCost + costBreakup.logisticsCost + costBreakup.overheadAllocation;
                  const margin = calculateMargin(totalCost, price);
                  return (
                    <div key={idx} className={`compact-item ${margin >= marginThreshold ? "" : "border-red-300 bg-red-50"}`}>
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-gray-900">{type}</span>
                        <span className={`text-lg font-semibold ${margin >= marginThreshold ? "text-gray-900" : "text-red-600"}`}>
                          {margin.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ====== SECTION 6: STATUS & CONTROLS ====== */}
      <section className="page-section">
        <h2 className="section-title">Status & Controls</h2>
        <div className="metric-grid metric-grid-3">
          {/* SKU Status */}
          <div className="content-card">
            <div className="content-row-stack">
              <h3 className="text-lg font-semibold text-gray-900">SKU Status</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600 font-semibold">Active / Inactive</span>
                  <button
                    onClick={() => setSkuStatus({ ...skuStatus, isActive: !skuStatus.isActive })}
                    className={`px-4 py-2 rounded font-semibold text-white ${skuStatus.isActive ? "bg-gray-900" : "bg-gray-400"}`}
                  >
                    {skuStatus.isActive ? "Active" : "Inactive"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Minimum Margin Threshold */}
          <div className="content-card">
            <div className="content-row-stack">
              <h3 className="text-lg font-semibold text-gray-900">Margin Threshold</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-gray-600 font-semibold block mb-2">Minimum Margin %</label>
                  <input
                    type="number"
                    step="1"
                    value={marginThreshold}
                    onChange={(e) => setMarginThreshold(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-center text-lg font-semibold"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Price Override */}
          <div className="content-card">
            <div className="content-row-stack">
              <h3 className="text-lg font-semibold text-gray-900">Price Control</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600 font-semibold">Allow Price Override</span>
                  <button
                    onClick={() => setSkuStatus({ ...skuStatus, priceOverride: !skuStatus.priceOverride })}
                    className={`px-4 py-2 rounded font-semibold text-white ${skuStatus.priceOverride ? "bg-gray-900" : "bg-gray-400"}`}
                  >
                    {skuStatus.priceOverride ? "Enabled" : "Disabled"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
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
