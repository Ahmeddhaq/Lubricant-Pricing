import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

// ============= BASE OILS =============
export const baseOilsService = {
  async getAll() {
    const { data, error } = await supabase
      .from("base_oils")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw error;
    return data;
  },

  async create(baseOil) {
    const { data, error } = await supabase
      .from("base_oils")
      .insert([baseOil])
      .select();
    if (error) throw error;
    return data[0];
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from("base_oils")
      .update(updates)
      .eq("id", id)
      .select();
    if (error) throw error;
    return data[0];
  },

  async delete(id) {
    const { error } = await supabase.from("base_oils").delete().eq("id", id);
    if (error) throw error;
  },
};

// ============= ADDITIVES =============
export const additivesService = {
  async getAll() {
    const { data, error } = await supabase
      .from("additives")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw error;
    return data;
  },

  async create(additive) {
    const { data, error } = await supabase
      .from("additives")
      .insert([additive])
      .select();
    if (error) throw error;
    return data[0];
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from("additives")
      .update(updates)
      .eq("id", id)
      .select();
    if (error) throw error;
    return data[0];
  },

  async delete(id) {
    const { error } = await supabase.from("additives").delete().eq("id", id);
    if (error) throw error;
  },
};

// ============= RECIPES =============
export const recipesService = {
  async getAll() {
    const { data, error } = await supabase
      .from("recipes")
      .select(
        `
        *,
        base_oils (name, cost_per_liter),
        recipe_ingredients (
          *,
          additives (name, cost_per_unit, unit)
        )
      `
      )
      .order("name", { ascending: true });
    if (error) throw error;
    return data;
  },

  async getById(id) {
    const { data, error } = await supabase
      .from("recipes")
      .select(
        `
        *,
        base_oils (name, cost_per_liter),
        recipe_ingredients (
          *,
          additives (name, cost_per_unit, unit)
        )
      `
      )
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  },

  async create(recipe) {
    const { data, error } = await supabase
      .from("recipes")
      .insert([recipe])
      .select();
    if (error) throw error;
    return data[0];
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from("recipes")
      .update(updates)
      .eq("id", id)
      .select();
    if (error) throw error;
    return data[0];
  },

  async delete(id) {
    const { error } = await supabase.from("recipes").delete().eq("id", id);
    if (error) throw error;
  },
};

// ============= RECIPE INGREDIENTS =============
export const recipeIngredientsService = {
  async addIngredient(recipeId, additiveId, quantityPerLiter) {
    const { data, error } = await supabase
      .from("recipe_ingredients")
      .insert([
        { recipe_id: recipeId, additive_id: additiveId, quantity_per_liter: quantityPerLiter },
      ])
      .select();
    if (error) throw error;
    return data[0];
  },

  async removeIngredient(ingredientId) {
    const { error } = await supabase
      .from("recipe_ingredients")
      .delete()
      .eq("id", ingredientId);
    if (error) throw error;
  },

  async updateIngredient(ingredientId, quantityPerLiter) {
    const { data, error } = await supabase
      .from("recipe_ingredients")
      .update({ quantity_per_liter: quantityPerLiter })
      .eq("id", ingredientId)
      .select();
    if (error) throw error;
    return data[0];
  },
};

// ============= SKUs =============
export const skusService = {
  async getAll() {
    const { data, error } = await supabase
      .from("skus")
      .select(
        `
        *,
        recipes (
          name,
          base_oils (name, cost_per_liter),
          recipe_ingredients (
            *,
            additives (name, cost_per_unit, unit)
          ),
          blending_cost_per_liter
        )
      `
      )
      .order("name", { ascending: true });
    if (error) throw error;
    return data;
  },

  async getById(id) {
    const { data, error } = await supabase
      .from("skus")
      .select(
        `
        *,
        recipes (
          name,
          base_oils (name, cost_per_liter),
          recipe_ingredients (
            *,
            additives (name, cost_per_unit, unit)
          ),
          blending_cost_per_liter
        )
      `
      )
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  },

  async create(sku) {
    const { data, error } = await supabase
      .from("skus")
      .insert([sku])
      .select();
    if (error) throw error;
    return data[0];
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from("skus")
      .update(updates)
      .eq("id", id)
      .select();
    if (error) throw error;
    return data[0];
  },

  async delete(id) {
    const { error } = await supabase.from("skus").delete().eq("id", id);
    if (error) throw error;
  },
};

// ============= COST SNAPSHOTS =============
export const costSnapshotsService = {
  async createSnapshot(skuId, costData) {
    const { data, error } = await supabase
      .from("cost_snapshots")
      .insert([{ sku_id: skuId, ...costData }])
      .select();
    if (error) throw error;
    return data[0];
  },

  async getLatestBySku(skuId) {
    const { data, error } = await supabase
      .from("cost_snapshots")
      .select("*")
      .eq("sku_id", skuId)
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .single();
    if (error && error.code !== "PGRST116") throw error;
    return data || null;
  },

  async getHistoryBySku(skuId, limit = 10) {
    const { data, error } = await supabase
      .from("cost_snapshots")
      .select("*")
      .eq("sku_id", skuId)
      .order("snapshot_date", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  },
};

// ============= CUSTOMERS =============
export const customersService = {
  async getAll() {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw error;
    return data;
  },

  async create(customer) {
    const { data, error } = await supabase
      .from("customers")
      .insert([customer])
      .select();
    if (error) throw error;
    return data[0];
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from("customers")
      .update(updates)
      .eq("id", id)
      .select();
    if (error) throw error;
    return data[0];
  },

  async delete(id) {
    const { error } = await supabase.from("customers").delete().eq("id", id);
    if (error) throw error;
  },
};

// ============= QUOTES =============
export const quotesService = {
  async getAll() {
    const { data, error } = await supabase
      .from("quotes")
      .select(
        `
        *,
        customers (name, email, country),
        quote_items (
          *,
          skus (name, pack_description)
        )
      `
      )
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },

  async getById(id) {
    const { data, error } = await supabase
      .from("quotes")
      .select(
        `
        *,
        customers (name, email, country, contact_person),
        quote_items (
          *,
          skus (name, pack_description)
        )
      `
      )
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  },

  async create(quote) {
    const { data, error } = await supabase
      .from("quotes")
      .insert([quote])
      .select();
    if (error) throw error;
    return data[0];
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from("quotes")
      .update(updates)
      .eq("id", id)
      .select();
    if (error) throw error;
    return data[0];
  },

  async delete(id) {
    const { error } = await supabase.from("quotes").delete().eq("id", id);
    if (error) throw error;
  },

  async generateQuoteNumber() {
    const date = new Date();
    const timestamp = date.getTime();
    return `Q-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}-${timestamp.toString().slice(-6)}`;
  },
};

// ============= QUOTE ITEMS =============
export const quoteItemsService = {
  async addItem(quoteId, skuId, quantity, unitPrice, marginPercent) {
    const lineTotal = quantity * unitPrice;
    const { data, error } = await supabase
      .from("quote_items")
      .insert([
        {
          quote_id: quoteId,
          sku_id: skuId,
          quantity,
          unit_price: unitPrice,
          margin_percent: marginPercent,
          line_total: lineTotal,
        },
      ])
      .select();
    if (error) throw error;
    return data[0];
  },

  async updateItem(itemId, updates) {
    const { data, error } = await supabase
      .from("quote_items")
      .update(updates)
      .eq("id", itemId)
      .select();
    if (error) throw error;
    return data[0];
  },

  async removeItem(itemId) {
    const { error } = await supabase.from("quote_items").delete().eq("id", itemId);
    if (error) throw error;
  },
};

// ============= COSTING ENGINE =============
export const costingEngine = {
  /**
   * Calculate cost per liter for a recipe
   * Includes: base oil + additives
   */
  calculateMaterialCostPerLiter(recipe) {
    let totalCost = recipe.base_oils.cost_per_liter;

    if (recipe.recipe_ingredients && recipe.recipe_ingredients.length > 0) {
      recipe.recipe_ingredients.forEach((ingredient) => {
        totalCost += ingredient.quantity_per_liter * ingredient.additives.cost_per_unit;
      });
    }

    return parseFloat(totalCost.toFixed(2));
  },

  /**
   * Calculate total cost per unit (for a specific pack size)
   * Includes: material + blending + packaging + overhead
   */
  calculateTotalCostPerUnit(recipe, sku, overheadPercent = 5) {
    const materialCostPerLiter = this.calculateMaterialCostPerLiter(recipe);
    const materialCost = materialCostPerLiter * sku.pack_size_liters;
    const blendingCost = (recipe.blending_cost_per_liter || 0) * sku.pack_size_liters;
    const packagingCost = sku.packaging_cost_per_unit || 0;
    const overheadCost = (materialCost + blendingCost + packagingCost) * (overheadPercent / 100);

    const totalCost = materialCost + blendingCost + packagingCost + overheadCost;

    return {
      materialCost: parseFloat(materialCost.toFixed(2)),
      blendingCost: parseFloat(blendingCost.toFixed(2)),
      packagingCost: parseFloat(packagingCost.toFixed(2)),
      overheadCost: parseFloat(overheadCost.toFixed(2)),
      totalCost: parseFloat(totalCost.toFixed(2)),
    };
  },

  /**
   * Calculate selling price based on margin percentage
   */
  calculateSellingPrice(costPerUnit, marginPercent) {
    const sellingPrice = costPerUnit * (1 + marginPercent / 100);
    return parseFloat(sellingPrice.toFixed(2));
  },

  /**
   * Calculate profit
   */
  calculateProfit(sellingPrice, costPerUnit, quantity = 1) {
    const profitPerUnit = sellingPrice - costPerUnit;
    const totalProfit = profitPerUnit * quantity;
    return {
      profitPerUnit: parseFloat(profitPerUnit.toFixed(2)),
      totalProfit: parseFloat(totalProfit.toFixed(2)),
      profitMarginPercent: parseFloat(((profitPerUnit / costPerUnit) * 100).toFixed(2)),
    };
  },
};
