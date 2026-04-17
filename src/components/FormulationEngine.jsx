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

  // Form states
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    base_oil_id: "",
    blending_cost_per_liter: 0,
  });

  const [ingredients, setIngredients] = useState([]);
  const [selectedAdditive, setSelectedAdditive] = useState("");
  const [quantityPerLiter, setQuantityPerLiter] = useState("");

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

  const handleCreateRecipe = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.base_oil_id) {
      alert("Please fill all required fields");
      return;
    }

    try {
      const newRecipe = await recipesService.create({
        name: formData.name,
        description: formData.description,
        base_oil_id: formData.base_oil_id,
        blending_cost_per_liter: parseFloat(formData.blending_cost_per_liter) || 0,
      });

      // Add ingredients
      for (const ingredient of ingredients) {
        await recipeIngredientsService.addIngredient(
          newRecipe.id,
          ingredient.additive_id,
          ingredient.quantity_per_liter
        );
      }

      setFormData({ name: "", description: "", base_oil_id: "", blending_cost_per_liter: 0 });
      setIngredients([]);
      setSelectedAdditive("");
      setQuantityPerLiter("");
      setActiveTab("list");
      await loadData();
      alert("Recipe created successfully!");
    } catch (err) {
      console.error("Error creating recipe:", err);
      alert("Failed to create recipe");
    }
  };

  const handleAddIngredient = () => {
    if (!selectedAdditive || !quantityPerLiter) {
      alert("Please select additive and quantity");
      return;
    }

    const additive = additives.find((a) => a.id === selectedAdditive);
    setIngredients([
      ...ingredients,
      {
        additive_id: selectedAdditive,
        additive_name: additive.name,
        quantity_per_liter: parseFloat(quantityPerLiter),
      },
    ]);

    setSelectedAdditive("");
    setQuantityPerLiter("");
  };

  const handleRemoveIngredient = (index) => {
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  const handleSelectRecipe = async (recipe) => {
    setSelectedRecipe(recipe);
    setActiveTab("detail");
  };

  const calculateRecipeCost = (recipe) => {
    if (!recipe || !recipe.base_oils) return 0;
    return costingEngine.calculateMaterialCostPerLiter(recipe);
  };

  if (loading) return <div className="p-6 text-center">Loading...</div>;

  return (
    <div>
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab("list")}
          className={`btn ${activeTab === "list" ? "btn-primary" : "btn-secondary"}`}
        >
          Recipes List
        </button>
        <button
          onClick={() => {
            setActiveTab("create");
            setFormData({ name: "", description: "", base_oil_id: "", blending_cost_per_liter: 0 });
            setIngredients([]);
          }}
          className={`btn ${activeTab === "create" ? "btn-primary" : "btn-secondary"}`}
        >
          Create Recipe
        </button>
      </div>

      {/* LIST TAB */}
      {activeTab === "list" && (
        <div>
          {recipes.length === 0 ? (
            <div className="table-container">
              <div className="px-6 py-12 text-center">
                <p className="text-gray-500">No recipes found. Create one to get started.</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recipes.map((recipe) => (
                <div
                  key={recipe.id}
                  className="table-container p-4 cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => handleSelectRecipe(recipe)}
                >
                  <h3 className="font-semibold text-lg text-gray-900 mb-1">{recipe.name}</h3>
                  <p className="text-sm text-gray-600 mb-3">{recipe.description}</p>
                  <div className="space-y-1 text-sm">
                    <p className="text-gray-700">
                      <span className="text-gray-600">Base Oil:</span> {recipe.base_oils?.name}
                    </p>
                    <p className="text-gray-700">
                      <span className="text-gray-600">Cost/Liter:</span> ${calculateRecipeCost(recipe).toFixed(2)}
                    </p>
                    <p className="text-gray-700">
                      <span className="text-gray-600">Ingredients:</span> {recipe.recipe_ingredients?.length || 0}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* DETAIL TAB */}
      {activeTab === "detail" && selectedRecipe && (
        <div>
          <button
            onClick={() => setActiveTab("list")}
            className="btn btn-secondary mb-6"
          >
            ← Back to List
          </button>
          <div className="table-container">
            <div className="px-6 py-6">
              <h2 className="text-2xl font-semibold mb-6 text-gray-900">{selectedRecipe.name}</h2>
              <div className="grid grid-cols-2 gap-6 mb-8">
                <div className="border-b border-gray-200 pb-4">
                  <p className="text-sm text-gray-600 mb-1">Base Oil</p>
                  <p className="text-lg font-semibold text-gray-900">{selectedRecipe.base_oils?.name}</p>
                </div>
                <div className="border-b border-gray-200 pb-4">
                  <p className="text-sm text-gray-600 mb-1">Cost per Liter</p>
                  <p className="text-lg font-semibold text-gray-900">${selectedRecipe.base_oils?.cost_per_liter.toFixed(2)}</p>
                </div>
                <div className="border-b border-gray-200 pb-4">
                  <p className="text-sm text-gray-600 mb-1">Blending Cost per Liter</p>
                  <p className="text-lg font-semibold text-gray-900">${selectedRecipe.blending_cost_per_liter?.toFixed(2)}</p>
                </div>
                <div className="border-b border-gray-200 pb-4">
                  <p className="text-sm text-gray-600 mb-1">Total Material Cost/Liter</p>
                  <p className="text-lg font-semibold text-green-700">${calculateRecipeCost(selectedRecipe).toFixed(2)}</p>
                </div>
              </div>

              <h3 className="font-semibold text-gray-900 mb-4">Additives</h3>
              {selectedRecipe.recipe_ingredients?.length > 0 ? (
                <table className="w-full">
                  <thead>
                    <tr>
                      <th>Additive</th>
                      <th>Quantity & Unit</th>
                      <th>Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedRecipe.recipe_ingredients.map((ingredient, idx) => (
                      <tr key={idx}>
                        <td>{ingredient.additives.name}</td>
                        <td>{ingredient.quantity_per_liter} {ingredient.additives.unit}</td>
                        <td>${ingredient.additives.cost_per_unit} per {ingredient.additives.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-gray-500 py-4">No additives added</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CREATE TAB */}
      {activeTab === "create" && (
        <form onSubmit={handleCreateRecipe} className="table-container">
          <div className="px-6 py-6">
            <h2 className="text-xl font-semibold mb-6 text-gray-900">Create New Recipe</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="form-group">
                <label>Recipe Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Premium SAE 40"
                  required
                />
              </div>

              <div className="form-group">
                <label>Base Oil *</label>
                <select
                  value={formData.base_oil_id}
                  onChange={(e) => setFormData({ ...formData, base_oil_id: e.target.value })}
                  required
                >
                  <option value="">Select Base Oil</option>
                  {baseOils.map((oil) => (
                    <option key={oil.id} value={oil.id}>
                      {oil.name} (${oil.cost_per_liter}/L)
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Blending Cost per Liter</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.blending_cost_per_liter}
                  onChange={(e) =>
                    setFormData({ ...formData, blending_cost_per_liter: e.target.value })
                  }
                  placeholder="0.00"
                />
              </div>

              <div className="form-group">
                <label>Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description"
                />
              </div>
            </div>

            <div className="border-t border-gray-200 pt-6 mb-6">
              <h3 className="font-semibold text-gray-900 mb-4">Add Additives</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="form-group mb-0">
                  <label>Additive</label>
                  <select
                    value={selectedAdditive}
                    onChange={(e) => setSelectedAdditive(e.target.value)}
                  >
                    <option value="">Select Additive</option>
                    {additives.map((additive) => (
                      <option key={additive.id} value={additive.id}>
                        {additive.name} (${additive.cost_per_unit}/{additive.unit})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group mb-0">
                  <label>Qty per Liter</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={quantityPerLiter}
                    onChange={(e) => setQuantityPerLiter(e.target.value)}
                    placeholder="0.0000"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={handleAddIngredient}
                    className="btn btn-primary w-full"
                  >
                    Add
                  </button>
                </div>
              </div>

              {ingredients.length > 0 && (
                <table className="w-full">
                  <thead>
                    <tr>
                      <th>Additive</th>
                      <th>Qty/L</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ingredients.map((ing, idx) => (
                      <tr key={idx}>
                        <td>{ing.additive_name}</td>
                        <td>{ing.quantity_per_liter}</td>
                        <td>
                          <button
                            type="button"
                            onClick={() => handleRemoveIngredient(idx)}
                            className="text-red-600 text-sm font-semibold hover:text-red-800"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <button
              type="submit"
              className="btn btn-primary w-full py-2"
            >
              Create Recipe
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
