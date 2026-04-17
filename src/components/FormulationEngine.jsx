import React, { useState, useEffect } from "react";
import { baseOilsService, additivesService, recipesService, recipeIngredientsService, costingEngine } from "../services/supabaseService";

export default function FormulationEngine() {
  const [recipes, setRecipes] = useState([]);
  const [baseOils, setBaseOils] = useState([]);
  const [additives, setAdditives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("list");
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [editingRecipe, setEditingRecipe] = useState(null);

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

  useEffect(() => {
    loadData();
  }, []);

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
      alert("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  // Validation logic
  const getTotalComposition = () => {
    return components.reduce((sum, comp) => sum + (parseFloat(comp.percentage) || 0), 0);
  };

  const getValidationStatus = () => {
    const total = getTotalComposition();
    const missingCosts = components.some((c) => !c.unitCost || parseFloat(c.unitCost) === 0);
    return {
      isValid: Math.abs(total - 100) < 0.01,
      total,
      missingCosts,
      warnings: [
        ...(Math.abs(total - 100) > 0.01 ? [`Composition total is ${total.toFixed(2)}%, must be 100%`] : []),
        ...(missingCosts ? ["Some components missing unit costs"] : []),
      ],
    };
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

  if (loading) return <div className="p-6 text-center">Loading...</div>;

  const validation = getValidationStatus();
  const costBreakdown = getCostBreakdownByType();

  return (
    <div className="space-y-8 pb-8">
      {/* ====== SECTION 1: SKU SELECTOR / CREATOR ====== */}
      <section>
        <h2 className="text-2xl font-semibold text-gray-900 mb-6">Product Definition</h2>
        <div className="table-container">
          <div className="px-6 py-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
          </div>
        </div>
      </section>

      {/* ====== SECTION 2: COMPONENT TABLE ====== */}
      <section>
        <h2 className="text-2xl font-semibold text-gray-900 mb-6">Component Composition</h2>
        
        {/* Add Component Form */}
        <div className="table-container mb-6">
          <div className="px-6 py-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Component</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
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

              <div className="flex items-end">
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

      {/* ====== SECTION 3: VALIDATION LOGIC ====== */}
      <section>
        <h2 className="text-2xl font-semibold text-gray-900 mb-6">Validation Status</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="table-container">
            <div className="px-6 py-6">
              <p className="text-sm text-gray-600 mb-2">Total Composition</p>
              <p className={`text-3xl font-semibold ${validation.isValid ? "text-gray-900" : "text-red-600"}`}>
                {validation.total.toFixed(2)}%
              </p>
              <p className="text-xs text-gray-500 mt-2">Must equal 100%</p>
            </div>
          </div>

          <div className="table-container">
            <div className="px-6 py-6">
              <p className="text-sm text-gray-600 mb-2">Components</p>
              <p className="text-3xl font-semibold text-gray-900">{components.length}</p>
              <p className="text-xs text-gray-500 mt-2">Total components added</p>
            </div>
          </div>

          <div className="table-container">
            <div className="px-6 py-6">
              <p className="text-sm text-gray-600 mb-2">Status</p>
              {validation.warnings.length === 0 ? (
                <p className="text-lg font-semibold text-gray-900">✓ Valid</p>
              ) : (
                <div className="space-y-2">
                  {validation.warnings.map((warning, idx) => (
                    <p key={idx} className="text-sm text-red-600">⚠ {warning}</p>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ====== SECTION 4: COST SUMMARY ====== */}
      <section>
        <h2 className="text-2xl font-semibold text-gray-900 mb-6">Cost Summary</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Total Blend Cost */}
          <div className="table-container">
            <div className="px-6 py-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Blend Cost Metrics</h3>
              <div className="space-y-4">
                <div className="p-3 border border-gray-200 rounded">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Total Blend Cost/Liter</span>
                    <span className="text-2xl font-semibold text-gray-900">${calculateTotalBlendCost().toFixed(2)}</span>
                  </div>
                </div>

                <div className="p-3 border border-gray-200 rounded">
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
                  <div className="p-3 border border-gray-200 rounded">
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
          <div className="table-container">
            <div className="px-6 py-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Cost Breakdown by Type</h3>
              <div className="space-y-3">
                {Object.entries(costBreakdown).map(([type, cost], idx) => (
                  cost > 0 && (
                    <div key={idx} className="p-3 border border-gray-200 rounded">
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
      <section>
        <h2 className="text-2xl font-semibold text-gray-900 mb-6">Version Control & Change History</h2>
        <div className="table-container">
          <div className="px-6 py-6">
            <div className="mb-6">
              <p className="text-sm text-gray-600 mb-2">Current Version</p>
              <p className="text-2xl font-semibold text-gray-900">{skuForm.version}</p>
            </div>

            {changeHistory.length === 0 ? (
              <p className="text-gray-500">No changes recorded yet</p>
            ) : (
              <div className="space-y-3">
                {changeHistory.slice().reverse().map((entry, idx) => (
                  <div key={idx} className="p-3 border border-gray-200 rounded">
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
      <section>
        <h2 className="text-2xl font-semibold text-gray-900 mb-6">Raw Material Reference & Pricing</h2>
        <div className="table-container">
          <div className="px-6 py-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Material Database</h3>
            {components.length === 0 ? (
              <p className="text-gray-500">No materials added yet</p>
            ) : (
              <div className="space-y-4">
                {components.map((comp, idx) => (
                  <div key={idx} className="p-4 border border-gray-200 rounded">
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
