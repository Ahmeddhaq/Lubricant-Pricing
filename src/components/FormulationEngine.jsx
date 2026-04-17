import React, { useState, useEffect } from "react";
import { baseOilsService, additivesService, recipesService, recipeIngredientsService, costingEngine } from "../../services/supabaseService";

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
    <div className="bg-white rounded-lg shadow-md p-6">
      <h1 className="text-3xl font-bold mb-6">Formulation Engine</h1>

      <div className="flex gap-4 mb-6">
        <button
          onClick={() => setActiveTab("list")}
          className={`px-4 py-2 rounded ${
            activeTab === "list" ? "bg-blue-600 text-white" : "bg-gray-200"
          }`}
        >
          Recipes List
        </button>
        <button
          onClick={() => {
            setActiveTab("create");
            setFormData({ name: "", description: "", base_oil_id: "", blending_cost_per_liter: 0 });
            setIngredients([]);
          }}
          className={`px-4 py-2 rounded ${
            activeTab === "create" ? "bg-blue-600 text-white" : "bg-gray-200"
          }`}
        >
          Create Recipe
        </button>
      </div>

      {/* LIST TAB */}
      {activeTab === "list" && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Available Recipes</h2>
          {recipes.length === 0 ? (
            <p className="text-gray-500">No recipes found. Create one to get started.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recipes.map((recipe) => (
                <div
                  key={recipe.id}
                  className="border p-4 rounded-lg hover:shadow-lg cursor-pointer"
                  onClick={() => handleSelectRecipe(recipe)}
                >
                  <h3 className="font-bold text-lg">{recipe.name}</h3>
                  <p className="text-sm text-gray-600">{recipe.description}</p>
                  <div className="mt-3 text-sm">
                    <p>
                      <strong>Base Oil:</strong> {recipe.base_oils?.name}
                    </p>
                    <p>
                      <strong>Cost/Liter:</strong> ${calculateRecipeCost(recipe).toFixed(2)}
                    </p>
                    <p>
                      <strong>Ingredients:</strong> {recipe.recipe_ingredients?.length || 0}
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
            className="mb-4 px-4 py-2 bg-gray-200 rounded"
          >
            ← Back to List
          </button>
          <div className="bg-gray-50 p-6 rounded-lg">
            <h2 className="text-2xl font-bold mb-4">{selectedRecipe.name}</h2>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <p className="text-sm text-gray-600">Base Oil</p>
                <p className="font-semibold">{selectedRecipe.base_oils?.name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Cost per Liter</p>
                <p className="font-semibold">${selectedRecipe.base_oils?.cost_per_liter.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Blending Cost per Liter</p>
                <p className="font-semibold">${selectedRecipe.blending_cost_per_liter?.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Material Cost/Liter</p>
                <p className="font-semibold text-green-600">${calculateRecipeCost(selectedRecipe).toFixed(2)}</p>
              </div>
            </div>

            <h3 className="text-lg font-bold mb-4">Additives</h3>
            {selectedRecipe.recipe_ingredients?.length > 0 ? (
              <div className="bg-white rounded p-4">
                {selectedRecipe.recipe_ingredients.map((ingredient, idx) => (
                  <div key={idx} className="flex justify-between py-2 border-b last:border-b-0">
                    <span>{ingredient.additives.name}</span>
                    <span className="font-semibold">
                      {ingredient.quantity_per_liter} {ingredient.additives.unit} ({ingredient.additives.cost_per_unit} per {ingredient.additives.unit})
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">No additives added</p>
            )}
          </div>
        </div>
      )}

      {/* CREATE TAB */}
      {activeTab === "create" && (
        <form onSubmit={handleCreateRecipe} className="bg-gray-50 p-6 rounded-lg">
          <h2 className="text-xl font-bold mb-6">Create New Recipe</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-semibold mb-2">Recipe Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Premium SAE 40"
                className="w-full border rounded px-3 py-2"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">Base Oil *</label>
              <select
                value={formData.base_oil_id}
                onChange={(e) => setFormData({ ...formData, base_oil_id: e.target.value })}
                className="w-full border rounded px-3 py-2"
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

            <div>
              <label className="block text-sm font-semibold mb-2">Blending Cost per Liter</label>
              <input
                type="number"
                step="0.01"
                value={formData.blending_cost_per_liter}
                onChange={(e) =>
                  setFormData({ ...formData, blending_cost_per_liter: e.target.value })
                }
                placeholder="0.00"
                className="w-full border rounded px-3 py-2"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">Description</label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description"
                className="w-full border rounded px-3 py-2"
              />
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg mb-6">
            <h3 className="font-bold mb-4">Add Additives</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Additive</label>
                <select
                  value={selectedAdditive}
                  onChange={(e) => setSelectedAdditive(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="">Select Additive</option>
                  {additives.map((additive) => (
                    <option key={additive.id} value={additive.id}>
                      {additive.name} (${additive.cost_per_unit}/{additive.unit})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Qty per Liter</label>
                <input
                  type="number"
                  step="0.0001"
                  value={quantityPerLiter}
                  onChange={(e) => setQuantityPerLiter(e.target.value)}
                  placeholder="0.0000"
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleAddIngredient}
                  className="w-full bg-green-600 text-white rounded px-4 py-2"
                >
                  Add
                </button>
              </div>
            </div>

            {ingredients.length > 0 && (
              <div className="bg-gray-50 p-4 rounded">
                {ingredients.map((ing, idx) => (
                  <div key={idx} className="flex justify-between items-center py-2 border-b last:border-b-0">
                    <span>{ing.additive_name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold">{ing.quantity_per_liter}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveIngredient(idx)}
                        className="text-red-600 text-sm font-semibold"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold"
          >
            Create Recipe
          </button>
        </form>
      )}
    </div>
  );
}
