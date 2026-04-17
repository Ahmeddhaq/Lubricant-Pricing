import React, { useState, useEffect } from "react";
import { skusService, recipesService, costingEngine } from "../services/supabaseService";

export default function SKUManagement() {
  const [skus, setSkus] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("list");
  const [selectedSku, setSelectedSku] = useState(null);

  const [formData, setFormData] = useState({
    name: "",
    recipe_id: "",
    pack_size_liters: "",
    pack_description: "",
    packaging_cost_per_unit: "",
  });

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
      alert("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSku = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.recipe_id || !formData.pack_size_liters) {
      alert("Please fill all required fields");
      return;
    }

    try {
      await skusService.create({
        name: formData.name,
        recipe_id: formData.recipe_id,
        pack_size_liters: parseFloat(formData.pack_size_liters),
        pack_description: formData.pack_description,
        packaging_cost_per_unit: parseFloat(formData.packaging_cost_per_unit) || 0,
      });

      setFormData({ name: "", recipe_id: "", pack_size_liters: "", pack_description: "", packaging_cost_per_unit: "" });
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

  const calculateCosts = (sku) => {
    if (!sku || !sku.recipes) return null;
    return costingEngine.calculateTotalCostPerUnit(sku.recipes, sku);
  };

  if (loading) return <div className="p-6 text-center">Loading...</div>;

  return (
    <div>
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab("list")}
          className={`btn ${activeTab === "list" ? "btn-primary" : "btn-secondary"}`}
        >
          SKUs List
        </button>
        <button
          onClick={() => {
            setActiveTab("create");
            setFormData({ name: "", recipe_id: "", pack_size_liters: "", pack_description: "", packaging_cost_per_unit: "" });
          }}
          className={`btn ${activeTab === "create" ? "btn-primary" : "btn-secondary"}`}
        >
          Create SKU
        </button>
      </div>

      {/* LIST TAB */}
      {activeTab === "list" && (
        <div>
          {skus.length === 0 ? (
            <div className="table-container">
              <div className="px-6 py-12 text-center">
                <p className="text-gray-500">No SKUs found. Create one to get started.</p>
              </div>
            </div>
          ) : (
            <div className="table-container overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>SKU Name</th>
                    <th>Recipe</th>
                    <th>Pack Size</th>
                    <th>Cost/Unit</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {skus.map((sku) => {
                    const costs = calculateCosts(sku);
                    return (
                      <tr key={sku.id}>
                        <td className="font-semibold">{sku.name}</td>
                        <td>{sku.recipes?.name}</td>
                        <td>{sku.pack_size_liters}L</td>
                        <td className="font-semibold">
                          ${costs?.totalCost.toFixed(2)}
                        </td>
                        <td>
                          <button
                            onClick={() => handleSelectSku(sku)}
                            className="btn btn-primary text-sm"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* DETAIL TAB */}
      {activeTab === "detail" && selectedSku && (
        <div>
          <button
            onClick={() => setActiveTab("list")}
            className="btn btn-secondary mb-6"
          >
            ← Back to List
          </button>
          <div className="table-container">
            <div className="px-6 py-6">
              <h2 className="text-2xl font-semibold mb-6 text-gray-900">{selectedSku.name}</h2>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8 border-b border-gray-200 pb-8">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Recipe</p>
                  <p className="font-semibold text-gray-900">{selectedSku.recipes?.name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Pack Size</p>
                  <p className="font-semibold text-gray-900">{selectedSku.pack_size_liters}L</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Pack Description</p>
                  <p className="font-semibold text-gray-900">{selectedSku.pack_description || "-"}</p>
                </div>
              </div>

              <h3 className="font-semibold text-gray-900 mb-4">Cost Breakdown</h3>
              {(() => {
                const costs = calculateCosts(selectedSku);
                if (!costs) return <p>Unable to calculate costs</p>;
                return (
                  <table className="w-full">
                    <tbody>
                      <tr>
                        <td className="py-3 text-gray-700">Material Cost</td>
                        <td className="py-3 text-right font-semibold">${costs.materialCost.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td className="py-3 text-gray-700">Blending Cost</td>
                        <td className="py-3 text-right font-semibold">${costs.blendingCost.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td className="py-3 text-gray-700">Packaging Cost</td>
                        <td className="py-3 text-right font-semibold">${costs.packagingCost.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td className="py-3 text-gray-700">Overhead (5%)</td>
                        <td className="py-3 text-right font-semibold">${costs.overheadCost.toFixed(2)}</td>
                      </tr>
                      <tr className="border-t-2 border-gray-300 font-semibold text-lg">
                        <td className="py-3 text-gray-900">Total Cost per Unit</td>
                        <td className="py-3 text-right text-green-700">${costs.totalCost.toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* CREATE TAB */}
      {activeTab === "create" && (
        <form onSubmit={handleCreateSku} className="table-container max-w-2xl">
          <div className="px-6 py-6">
            <h2 className="text-xl font-semibold mb-6 text-gray-900">Create New SKU</h2>

            <div className="form-group">
              <label>SKU Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., SAE 40 1L Bottle"
                required
              />
            </div>

            <div className="form-group">
              <label>Recipe *</label>
              <select
                value={formData.recipe_id}
                onChange={(e) => setFormData({ ...formData, recipe_id: e.target.value })}
                required
              >
                <option value="">Select Recipe</option>
                {recipes.map((recipe) => (
                  <option key={recipe.id} value={recipe.id}>
                    {recipe.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="form-group mb-0">
                <label>Pack Size (Liters) *</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.pack_size_liters}
                  onChange={(e) => setFormData({ ...formData, pack_size_liters: e.target.value })}
                  placeholder="1"
                  required
                />
              </div>

              <div className="form-group mb-0">
                <label>Packaging Cost per Unit</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.packaging_cost_per_unit}
                  onChange={(e) =>
                    setFormData({ ...formData, packaging_cost_per_unit: e.target.value })
                  }
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Pack Description</label>
              <input
                type="text"
                value={formData.pack_description}
                onChange={(e) =>
                  setFormData({ ...formData, pack_description: e.target.value })
                }
                placeholder="e.g., 1L Plastic Bottle"
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary w-full py-2"
            >
              Create SKU
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
