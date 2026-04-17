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
    <div className="bg-white rounded-lg shadow-md p-6">
      <h1 className="text-3xl font-bold mb-6">SKU Management</h1>

      <div className="flex gap-4 mb-6">
        <button
          onClick={() => setActiveTab("list")}
          className={`px-4 py-2 rounded ${activeTab === "list" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
        >
          SKUs List
        </button>
        <button
          onClick={() => {
            setActiveTab("create");
            setFormData({ name: "", recipe_id: "", pack_size_liters: "", pack_description: "", packaging_cost_per_unit: "" });
          }}
          className={`px-4 py-2 rounded ${activeTab === "create" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
        >
          Create SKU
        </button>
      </div>

      {/* LIST TAB */}
      {activeTab === "list" && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Available SKUs</h2>
          {skus.length === 0 ? (
            <p className="text-gray-500">No SKUs found. Create one to get started.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-gray-100 border-b-2 border-gray-300">
                  <tr>
                    <th className="p-3 text-left">SKU Name</th>
                    <th className="p-3 text-left">Recipe</th>
                    <th className="p-3 text-right">Pack Size</th>
                    <th className="p-3 text-right">Cost/Unit</th>
                    <th className="p-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {skus.map((sku) => {
                    const costs = calculateCosts(sku);
                    return (
                      <tr key={sku.id} className="border-b hover:bg-gray-50">
                        <td className="p-3">{sku.name}</td>
                        <td className="p-3">{sku.recipes?.name}</td>
                        <td className="p-3 text-right">{sku.pack_size_liters}L</td>
                        <td className="p-3 text-right font-semibold">
                          ${costs?.totalCost.toFixed(2)}
                        </td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => handleSelectSku(sku)}
                            className="bg-blue-500 text-white px-3 py-1 rounded text-sm"
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
            className="mb-4 px-4 py-2 bg-gray-200 rounded"
          >
            ← Back to List
          </button>
          <div className="bg-gray-50 p-6 rounded-lg">
            <h2 className="text-2xl font-bold mb-6">{selectedSku.name}</h2>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-white p-4 rounded">
                <p className="text-sm text-gray-600">Recipe</p>
                <p className="font-semibold">{selectedSku.recipes?.name}</p>
              </div>
              <div className="bg-white p-4 rounded">
                <p className="text-sm text-gray-600">Pack Size</p>
                <p className="font-semibold">{selectedSku.pack_size_liters}L</p>
              </div>
              <div className="bg-white p-4 rounded">
                <p className="text-sm text-gray-600">Pack Description</p>
                <p className="font-semibold">{selectedSku.pack_description || "-"}</p>
              </div>
            </div>

            <h3 className="text-lg font-bold mb-4">Cost Breakdown</h3>
            {(() => {
              const costs = calculateCosts(selectedSku);
              if (!costs) return <p>Unable to calculate costs</p>;
              return (
                <div className="bg-white p-4 rounded-lg mb-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex justify-between py-2 border-b">
                      <span>Material Cost</span>
                      <span className="font-semibold">${costs.materialCost.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span>Blending Cost</span>
                      <span className="font-semibold">${costs.blendingCost.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span>Packaging Cost</span>
                      <span className="font-semibold">${costs.packagingCost.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span>Overhead (5%)</span>
                      <span className="font-semibold">${costs.overheadCost.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="flex justify-between py-3 border-t-2 border-gray-300 mt-4 text-lg font-bold">
                    <span>Total Cost per Unit</span>
                    <span className="text-green-600">${costs.totalCost.toFixed(2)}</span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* CREATE TAB */}
      {activeTab === "create" && (
        <form onSubmit={handleCreateSku} className="bg-gray-50 p-6 rounded-lg max-w-2xl">
          <h2 className="text-xl font-bold mb-6">Create New SKU</h2>

          <div className="mb-6">
            <label className="block text-sm font-semibold mb-2">SKU Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., SAE 40 1L Bottle"
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-semibold mb-2">Recipe *</label>
            <select
              value={formData.recipe_id}
              onChange={(e) => setFormData({ ...formData, recipe_id: e.target.value })}
              className="w-full border rounded px-3 py-2"
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
            <div>
              <label className="block text-sm font-semibold mb-2">Pack Size (Liters) *</label>
              <input
                type="number"
                step="0.1"
                value={formData.pack_size_liters}
                onChange={(e) => setFormData({ ...formData, pack_size_liters: e.target.value })}
                placeholder="1"
                className="w-full border rounded px-3 py-2"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">Packaging Cost per Unit</label>
              <input
                type="number"
                step="0.01"
                value={formData.packaging_cost_per_unit}
                onChange={(e) =>
                  setFormData({ ...formData, packaging_cost_per_unit: e.target.value })
                }
                placeholder="0.00"
                className="w-full border rounded px-3 py-2"
              />
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-semibold mb-2">Pack Description</label>
            <input
              type="text"
              value={formData.pack_description}
              onChange={(e) =>
                setFormData({ ...formData, pack_description: e.target.value })
              }
              placeholder="e.g., 1L Plastic Bottle"
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold"
          >
            Create SKU
          </button>
        </form>
      )}
    </div>
  );
}
