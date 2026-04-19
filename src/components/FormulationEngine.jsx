import React, { useState, useEffect } from "react";
import { baseOilsService, additivesService, recipesService, recipeIngredientsService, costingEngine } from "../services/supabaseService";
import { historyService } from "../services/historyService";

function normalizeName(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

export default function FormulationEngine({ pendingImport, clearPendingImport, currentSessionUploadId, onFormulationSaved }) {
  const [recipes, setRecipes] = useState([]);
  const [baseOils, setBaseOils] = useState([]);
  const [additives, setAdditives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("list");
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [selectedBaseOilId, setSelectedBaseOilId] = useState("");
  const [savingRecipe, setSavingRecipe] = useState(false);

  // SKU Selector / Creator states
  const [skuForm, setSkuForm] = useState({
    name: "",
    category: "",
    specification: "",
    version: "1.0",
  });

  // Component Table states
  const [components, setComponents] = useState([]);
  const [selectedComponent, setSelectedComponent] = useState("");
  const [componentPercentage, setComponentPercentage] = useState("");
  const [componentSupplier, setComponentSupplier] = useState("");

  // Cost Summary states
  const [batchSize, setBatchSize] = useState("");
  
  // Version Control states
  const [changeHistory, setChangeHistory] = useState([]);
  
  // Raw Material states
  const [materialPriceUpdates, setMaterialPriceUpdates] = useState({});

  const importedFormulationDraft = pendingImport?.kind === "formulation" ? pendingImport.draft : null;
  const linkedSkuDrafts = pendingImport?.linkedSkuDrafts || (pendingImport?.linkedSkuDraft ? [pendingImport.linkedSkuDraft] : []);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!selectedBaseOilId && baseOils.length > 0) {
      setSelectedBaseOilId(baseOils[0].id);
    }
  }, [baseOils, selectedBaseOilId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [recipesData, baseOilsData, additivesData] = await Promise.all([
        recipesService.getAll(),
        baseOilsService.getAll(),
        additivesService.getAll(),
      ]);
      setRecipes(recipesData);
      setBaseOils(baseOilsData);
      setAdditives(additivesData);
    } catch (err) {
      console.error("Error loading data:", err);
      alert("Failed to load formulation data. Check that Supabase is configured and that base_oils, additives, and recipes tables exist.");
    } finally {
      setLoading(false);
    }
  };

  // Cost calculations
  const calculateCostContribution = (component) => {
    if (!component.unitCost || !component.percentage) return 0;
    return (parseFloat(component.unitCost) * parseFloat(component.percentage)) / 100;
  };

  const calculateTotalBlendCost = () => {
    return components.reduce((sum, comp) => sum + calculateCostContribution(comp), 0);
  };

  const calculateCostPerBatch = () => {
    if (!batchSize || batchSize === "") return 0;
    return calculateTotalBlendCost() * parseFloat(batchSize);
  };

  const getCostBreakdownByType = () => {
    const breakdown = {
      "Base Oil": 0,
      "Additive": 0,
      "VI Improver": 0,
    };
    components.forEach((comp) => {
      const type = comp.type || "Additive";
      breakdown[type] = (breakdown[type] || 0) + calculateCostContribution(comp);
    });
    return breakdown;
  };

  const handleAddComponent = () => {
    if (!selectedComponent || !componentPercentage || !componentSupplier) {
      alert("Please fill all component fields");
      return;
    }

    const additive = additives.find((a) => a.id === selectedComponent);
    const newComponent = {
      id: selectedComponent,
      name: additive?.name,
      type: "Additive",
      supplier: componentSupplier,
      percentage: parseFloat(componentPercentage),
      unitCost: parseFloat(additive?.cost_per_unit) || 0,
      lastUpdated: new Date().toLocaleDateString(),
    };

    // Record change
    setChangeHistory([
      ...changeHistory,
      {
        timestamp: new Date().toLocaleString(),
        change: `Added component: ${newComponent.name} at ${componentPercentage}%`,
        user: "Current User",
      },
    ]);

    setComponents([...components, newComponent]);
    setSelectedComponent("");
    setComponentPercentage("");
    setComponentSupplier("");
  };

  const handleRemoveComponent = (index) => {
    const removed = components[index];
    setChangeHistory([
      ...changeHistory,
      {
        timestamp: new Date().toLocaleString(),
        change: `Removed component: ${removed.name}`,
        user: "Current User",
      },
    ]);
    setComponents(components.filter((_, i) => i !== index));
  };

  const handleUpdateMaterialPrice = (componentId, newPrice) => {
    const oldComponent = components.find((c) => c.id === componentId);
    const oldPrice = oldComponent?.unitCost || 0;

    setMaterialPriceUpdates({
      ...materialPriceUpdates,
      [componentId]: {
        oldPrice,
        newPrice,
        oldCost: calculateTotalBlendCost(),
      },
    });

    // Update component
    setComponents(
      components.map((c) =>
        c.id === componentId ? { ...c, unitCost: parseFloat(newPrice), lastUpdated: new Date().toLocaleDateString() } : c
      )
    );

    setChangeHistory([
      ...changeHistory,
      {
        timestamp: new Date().toLocaleString(),
        change: `Updated ${oldComponent?.name} price: $${oldPrice.toFixed(2)} → $${parseFloat(newPrice).toFixed(2)}`,
        user: "Current User",
      },
    ]);
  };

  const resolveBaseOilId = (draft) => {
    const candidates = [draft?.baseOilName, draft?.baseOil, draft?.baseOilCandidate, draft?.baseOilType].filter(Boolean).map(normalizeName);
    const matchedBaseOil = baseOils.find((entry) => {
      const baseOilName = normalizeName(entry.name);
      return candidates.some((candidate) => baseOilName === candidate || baseOilName.includes(candidate) || candidate.includes(baseOilName));
    });
    return matchedBaseOil?.id || selectedBaseOilId || baseOils[0]?.id || "";
  };

  const findRecipeByName = (recipeName) => {
    const normalizedRecipeName = normalizeName(recipeName);
    return recipes.find((recipe) => normalizeName(recipe.name) === normalizedRecipeName) || null;
  };

  const normalizeComponentForSave = (component, index) => ({
    id: component.id || `${component.name || component.component || "component"}-${index}`,
    name: component.name || component.component || "Component",
    type: component.type || "Additive",
    supplier: component.supplier || "Imported from Excel",
    percentage: Number(component.percentage || component.share || 0),
    unitCost: Number(component.unitCost || component.cost || 0),
  });

  const buildFormulationSnapshot = (sourceDraft = null) => {
    const draft = sourceDraft || importedFormulationDraft || {};
    const sourceComponents = components.length > 0 ? components : (draft.components || []);

    return {
      skuForm: {
        name: skuForm.name || draft.skuName || draft.name || "",
        category: skuForm.category || draft.category || "",
        specification: skuForm.specification || draft.pricingLogicType || "",
        version: skuForm.version || "1.0",
      },
      components: sourceComponents.map((component, index) => normalizeComponentForSave(component, index)),
      batchSize: batchSize || draft.batchSize || "100",
      sourceUploadId: draft.sourceUploadId || null,
      selectedBaseOilId: resolveBaseOilId(draft),
      draft,
    };
  };

  const saveFormulationSnapshot = async (snapshot, { linkedSkuDrafts = [] } = {}) => {
    if (!snapshot.skuForm.name) {
      alert("Please enter a formulation name.");
      return false;
    }

    if (!snapshot.selectedBaseOilId) {
      alert("Add at least one base oil before saving a formulation.");
      return false;
    }

    setSavingRecipe(true);
    try {
      const existingRecipe = findRecipeByName(snapshot.skuForm.name);
      const recipePayload = {
        name: snapshot.skuForm.name,
        description: snapshot.skuForm.specification || snapshot.draft?.pricingLogicType || "",
        status: "active",
        base_oil_id: snapshot.selectedBaseOilId,
        blending_cost_per_liter: 0,
      };

      const createdRecipe = existingRecipe
        ? await recipesService.update(existingRecipe.id, recipePayload)
        : await recipesService.create(recipePayload);

      const baseOilName = normalizeName(baseOils.find((entry) => entry.id === snapshot.selectedBaseOilId)?.name);
      if (!existingRecipe?.recipe_ingredients?.length) {
        for (const component of snapshot.components) {
          if (/base oil/i.test(component.type) || (baseOilName && normalizeName(component.name) === baseOilName)) {
            continue;
          }

          const matchedAdditive = additives.find((entry) => {
            const additiveName = normalizeName(entry.name);
            const componentName = normalizeName(component.name);
            return additiveName === componentName || additiveName.includes(componentName) || componentName.includes(additiveName);
          });

          if (!matchedAdditive) continue;

          const quantityPerLiter = Number(component.percentage || 0) / 100;
          if (quantityPerLiter <= 0) continue;

          await recipeIngredientsService.addIngredient(createdRecipe.id, matchedAdditive.id, quantityPerLiter);
        }
      }

      setChangeHistory((current) => [
        ...current,
        {
          timestamp: new Date().toLocaleString(),
          change: `Saved formulation: ${createdRecipe.name}`,
          user: "Current User",
        },
      ]);

      await loadData();
      setSelectedRecipe(createdRecipe);
      setEditingRecipe(createdRecipe);
      setActiveTab("list");

      if (onFormulationSaved) {
        onFormulationSaved({
          recipe: createdRecipe,
          linkedSkuDrafts,
          sourceUploadId: snapshot.sourceUploadId || currentSessionUploadId || null,
          snapshot,
        });
      }

      try {
        await historyService.recordConfigVersion({
          configName: `${createdRecipe.name} formulation`,
          configType: "formulation",
          configVersion: 1,
          configData: snapshot,
          sourceUploadId: snapshot.sourceUploadId || currentSessionUploadId || null,
          notes: snapshot.draft?.workbookName || "Imported formulation",
        });
      } catch (historyError) {
        console.error("Failed to save formulation history:", historyError);
      }

      return true;
    } catch (saveError) {
      console.error("Failed to save formulation:", saveError);
      alert(saveError?.message || "Failed to save formulation.");
      return false;
    } finally {
      setSavingRecipe(false);
    }
  };

  const handleSaveCurrentFormulation = async () => {
    const snapshot = buildFormulationSnapshot();
    await saveFormulationSnapshot(snapshot);
  };

  const handleCreateImportedFormulation = async () => {
    if (!importedFormulationDraft) return;
    const snapshot = buildFormulationSnapshot(importedFormulationDraft);
    setSkuForm(snapshot.skuForm);
    setComponents(snapshot.components.map((component) => ({
      ...component,
      lastUpdated: new Date().toLocaleDateString(),
    })));
    setBatchSize(snapshot.batchSize);
    setSelectedBaseOilId(snapshot.selectedBaseOilId);
    const saved = await saveFormulationSnapshot(snapshot, { linkedSkuDrafts });
    if (saved && clearPendingImport) {
      clearPendingImport();
    }
  };

  const applyImportedDraft = async () => {
    if (!importedFormulationDraft) return;

    const configSnapshot = buildFormulationSnapshot(importedFormulationDraft);

    setSkuForm(configSnapshot.skuForm);
    setComponents(configSnapshot.components.map((component) => ({
      ...component,
      lastUpdated: new Date().toLocaleDateString(),
    })));
    setBatchSize(configSnapshot.batchSize);
    setSelectedBaseOilId(configSnapshot.selectedBaseOilId);
    setChangeHistory([
      {
        timestamp: new Date().toLocaleString(),
        change: `Imported formulation draft from ${importedFormulationDraft.workbookName || "Excel"}`,
        user: "Current User",
      },
    ]);

    try {
      await historyService.recordConfigVersion({
        configName: `${configSnapshot.skuForm.name || "Formulation"} formulation`,
        configType: "formulation",
        configVersion: 1,
        configData: configSnapshot,
        sourceUploadId: configSnapshot.sourceUploadId || currentSessionUploadId || null,
        notes: importedFormulationDraft.workbookName || "Imported formulation",
      });
    } catch (historyError) {
      console.error("Failed to save formulation history:", historyError);
    }

    if (clearPendingImport) {
      clearPendingImport();
    }
  };

  if (loading) return <div className="p-6 text-center">Loading...</div>;

  const costBreakdown = getCostBreakdownByType();

  return (
    <div className="page-stack">
      {importedFormulationDraft && (
        <section className="page-section">
          <div className="content-card border-emerald-300 bg-emerald-50/70">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="section-title">Imported Formulation Draft</h2>
                <p className="section-subtitle">
                  Excel detected a formulation-style cost breakdown for {importedFormulationDraft.skuName || importedFormulationDraft.name}. The draft is not applied yet.
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-emerald-900">
                  <span className="rounded-full bg-emerald-100 px-3 py-1">Cost / L: ${Number(importedFormulationDraft.estimatedCostPerLiter || 0).toFixed(2)}</span>
                  <span className="rounded-full bg-emerald-100 px-3 py-1">Excel margin: {Number(importedFormulationDraft.marginPercent || 0).toFixed(1)}%</span>
                  <span className="rounded-full bg-emerald-100 px-3 py-1">Rows: {(importedFormulationDraft.components || []).length}</span>
                </div>
                {linkedSkuDrafts.length > 0 && (
                  <p className="mt-2 text-sm font-semibold text-emerald-900">
                    {linkedSkuDrafts.length} SKU draft{linkedSkuDrafts.length === 1 ? "" : "s"} are linked to this workbook.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={applyImportedDraft} className="btn btn-primary">
                  Load into Workspace
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

      {/* ====== SECTION 1: SKU SELECTOR / CREATOR ====== */}
      <section className="page-section">
        <h2 className="section-title">Product Definition</h2>
        <div className="table-container">
          <div className="content-card">
            <div className="form-grid form-grid-5">
              <div className="form-group">
                <label className="text-sm font-semibold text-gray-900">Base Oil *</label>
                <select
                  value={selectedBaseOilId}
                  onChange={(e) => setSelectedBaseOilId(e.target.value)}
                  className="mt-1"
                >
                  <option value="">Select Base Oil</option>
                  {baseOils.map((baseOil) => (
                    <option key={baseOil.id} value={baseOil.id}>
                      {baseOil.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="text-sm font-semibold text-gray-900">SKU Name *</label>
                <input
                  type="text"
                  value={skuForm.name}
                  onChange={(e) => setSkuForm({ ...skuForm, name: e.target.value })}
                  placeholder="e.g., 5W30 SN Premium"
                  className="mt-1"
                />
              </div>

              <div className="form-group">
                <label className="text-sm font-semibold text-gray-900">Category *</label>
                <select
                  value={skuForm.category}
                  onChange={(e) => setSkuForm({ ...skuForm, category: e.target.value })}
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
                <label className="text-sm font-semibold text-gray-900">Specification</label>
                <input
                  type="text"
                  value={skuForm.specification}
                  onChange={(e) => setSkuForm({ ...skuForm, specification: e.target.value })}
                  placeholder="e.g., API SN, ACEA A3/B4"
                  className="mt-1"
                />
              </div>

              <div className="form-group">
                <label className="text-sm font-semibold text-gray-900">Version</label>
                <input
                  type="text"
                  value={skuForm.version}
                  onChange={(e) => setSkuForm({ ...skuForm, version: e.target.value })}
                  placeholder="e.g., 1.0"
                  className="mt-1"
                  disabled
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={handleSaveCurrentFormulation} disabled={savingRecipe} className="btn btn-primary">
                {savingRecipe ? "Saving..." : "Save formulation"}
              </button>
              {importedFormulationDraft && (
                <button type="button" onClick={handleCreateImportedFormulation} disabled={savingRecipe} className="btn btn-secondary">
                  {savingRecipe ? "Creating..." : "Create formulation from workbook"}
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ====== SECTION 2: COMPONENT TABLE ====== */}
      <section className="page-section">
        <h2 className="section-title">Component Composition</h2>
        
        {/* Add Component Form */}
        <div className="content-card">
          <div className="content-row-stack">
            <h3 className="text-lg font-semibold text-gray-900">Add Component</h3>
            <div className="form-grid form-grid-5">
              <div className="form-group mb-0">
                <label className="text-sm font-semibold text-gray-900">Component *</label>
                <select
                  value={selectedComponent}
                  onChange={(e) => setSelectedComponent(e.target.value)}
                  className="mt-1"
                >
                  <option value="">Select Component</option>
                  {additives.map((additive) => (
                    <option key={additive.id} value={additive.id}>
                      {additive.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group mb-0">
                <label className="text-sm font-semibold text-gray-900">Composition % *</label>
                <input
                  type="number"
                  step="0.01"
                  value={componentPercentage}
                  onChange={(e) => setComponentPercentage(e.target.value)}
                  placeholder="0.00"
                  className="mt-1"
                />
              </div>

              <div className="form-group mb-0">
                <label className="text-sm font-semibold text-gray-900">Supplier *</label>
                <input
                  type="text"
                  value={componentSupplier}
                  onChange={(e) => setComponentSupplier(e.target.value)}
                  placeholder="Supplier name"
                  className="mt-1"
                />
              </div>

              <div className="form-group mb-0">
                <span className="invisible block text-sm font-semibold text-gray-900">Action</span>
                <button
                  type="button"
                  onClick={handleAddComponent}
                  className="btn btn-primary w-full"
                >
                  Add Component
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Components Table */}
        {components.length > 0 && (
          <div className="table-container">
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Component Name</th>
                    <th>Type</th>
                    <th>Supplier</th>
                    <th>% Composition</th>
                    <th>Unit Cost</th>
                    <th>Cost Contribution</th>
                    <th>Last Updated</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {components.map((comp, idx) => (
                    <tr key={idx}>
                      <td className="font-semibold">{comp.name}</td>
                      <td>{comp.type}</td>
                      <td>{comp.supplier}</td>
                      <td className="text-right">{comp.percentage.toFixed(2)}%</td>
                      <td className="text-right">${comp.unitCost.toFixed(2)}</td>
                      <td className="text-right font-semibold">${calculateCostContribution(comp).toFixed(2)}</td>
                      <td className="text-sm text-gray-600">{comp.lastUpdated}</td>
                      <td>
                        <button
                          onClick={() => handleRemoveComponent(idx)}
                          className="text-red-600 text-sm font-semibold hover:text-red-800"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ====== SECTION 4: COST SUMMARY ====== */}
      <section className="page-section">
        <h2 className="section-title">Cost Summary</h2>
        <div className="section-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
          {/* Total Blend Cost */}
          <div className="content-card">
            <div className="content-row-stack">
              <h3 className="text-lg font-semibold text-gray-900">Blend Cost Metrics</h3>
              <div className="space-y-4">
                <div className="compact-item">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Total Blend Cost/Liter</span>
                    <span className="text-2xl font-semibold text-gray-900">${calculateTotalBlendCost().toFixed(2)}</span>
                  </div>
                </div>

                <div className="compact-item">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-600">Batch Size (Liters)</span>
                    <input
                      type="number"
                      step="0.01"
                      value={batchSize}
                      onChange={(e) => setBatchSize(e.target.value)}
                      placeholder="Optional"
                      className="w-32 px-2 py-1 border border-gray-300 rounded text-right"
                    />
                  </div>
                </div>

                {batchSize && (
                  <div className="compact-item">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Cost per Batch</span>
                      <span className="text-2xl font-semibold text-gray-900">${calculateCostPerBatch().toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Cost Breakdown by Type */}
          <div className="content-card">
            <div className="content-row-stack">
              <h3 className="text-lg font-semibold text-gray-900">Cost Breakdown by Type</h3>
              <div className="space-y-3">
                {Object.entries(costBreakdown).map(([type, cost], idx) => (
                  cost > 0 && (
                    <div key={idx} className="compact-item">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-semibold text-gray-900">{type}</span>
                        <span className="text-lg font-semibold text-gray-900">${cost.toFixed(2)}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-gray-400 h-full"
                          style={{
                            width: `${(cost / calculateTotalBlendCost()) * 100 || 0}%`,
                          }}
                        ></div>
                      </div>
                      <p className="text-xs text-gray-600 mt-1">
                        {calculateTotalBlendCost() > 0 ? ((cost / calculateTotalBlendCost()) * 100).toFixed(1) : 0}% of total
                      </p>
                    </div>
                  )
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ====== SECTION 5: VERSION CONTROL ====== */}
      <section className="page-section">
        <h2 className="section-title">Version Control & Change History</h2>
        <div className="content-card">
          <div className="content-row-stack">
            <div className="mb-6">
              <p className="text-sm text-gray-600 mb-2">Current Version</p>
              <p className="metric-value">{skuForm.version}</p>
            </div>

            {changeHistory.length === 0 ? (
              <p className="text-gray-500">No changes recorded yet</p>
            ) : (
              <div className="space-y-3">
                {changeHistory.slice().reverse().map((entry, idx) => (
                  <div key={idx} className="compact-item">
                    <div className="flex justify-between items-start mb-2">
                      <p className="font-semibold text-gray-900">{entry.change}</p>
                      <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded">{entry.user}</span>
                    </div>
                    <p className="text-sm text-gray-600">{entry.timestamp}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ====== SECTION 6: RAW MATERIAL REFERENCE ====== */}
      <section className="page-section">
        <h2 className="section-title">Raw Material Reference & Pricing</h2>
        <div className="content-card">
          <div className="content-row-stack">
            <h3 className="text-lg font-semibold text-gray-900">Material Database</h3>
            {components.length === 0 ? (
              <p className="text-gray-500">No materials added yet</p>
            ) : (
              <div className="space-y-4">
                {components.map((comp, idx) => (
                  <div key={idx} className="content-card-compact">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="font-semibold text-gray-900">{comp.name}</p>
                        <p className="text-sm text-gray-600">Supplier: {comp.supplier}</p>
                      </div>
                      <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded">{comp.type}</span>
                    </div>

                    <div className="bg-gray-50 p-3 rounded mb-3">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm text-gray-600">Current Unit Cost</span>
                        <span className="font-semibold text-gray-900">${comp.unitCost.toFixed(2)}</span>
                      </div>
                      {materialPriceUpdates[comp.id] && (
                        <div className="text-xs text-gray-600 p-2 border-t border-gray-200 mt-2 pt-2">
                          <p>Previous: ${materialPriceUpdates[comp.id].oldPrice.toFixed(2)}</p>
                          <p>New Cost Impact: ${(calculateTotalBlendCost() - materialPriceUpdates[comp.id].oldCost).toFixed(2)}</p>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Update price"
                        onBlur={(e) => {
                          if (e.target.value) {
                            handleUpdateMaterialPrice(comp.id, e.target.value);
                            e.target.value = "";
                          }
                        }}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm"
                      />
                      <button className="btn btn-secondary text-sm px-4">Update Price</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
