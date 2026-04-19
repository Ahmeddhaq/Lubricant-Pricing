import React, { useState, useEffect } from "react";
import {
  quotesService,
  quoteItemsService,
  skusService,
  recipesService,
  recipeIngredientsService,
  baseOilsService,
  additivesService,
  costSnapshotsService,
  costingEngine,
} from "../services/supabaseService";

function normalizeName(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function getSkuIdentity(sku) {
  return [
    normalizeName(sku?.name),
    normalizeName(sku?.category),
    String(sku?.recipe_id || ""),
    String(Number(sku?.pack_size_liters || 0)),
    normalizeName(sku?.pack_description),
  ].join("|");
}

function dedupeLatestSkus(records) {
  return [...records]
    .sort((left, right) => new Date(right.updated_at || right.created_at || 0) - new Date(left.updated_at || left.created_at || 0))
    .filter((record, index, array) => array.findIndex((candidate) => getSkuIdentity(candidate) === getSkuIdentity(record)) === index);
}

function average(values) {
  const numericValues = values.map((value) => Number(value)).filter((value) => Number.isFinite(value));
  if (!numericValues.length) return 0;
  return numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortByDateDesc(left, right, field = "updated_at") {
  return new Date(right?.[field] || right?.created_at || 0) - new Date(left?.[field] || left?.created_at || 0);
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

export default function Dashboard({ dataRefreshToken = 0 }) {
  const [quotes, setQuotes] = useState([]);
  const [skus, setSkus] = useState([]);
  const [stats, setStats] = useState({
    // KPI Summary
    totalRevenue: 0,
    totalCost: 0,
    grossProfit: 0,
    profitMargin: 0,
    activeDeals: 0,
    containersShipped: { teu20: 0, teu40: 0 },
    totalSkus: 0,
    totalFormulations: 0,
    totalSnapshots: 0,
    averageMaterialCostPerLiter: 0,
    averageFormulaCostPerLiter: 0,
    averageSkuCostPerUnit: 0,
    estimatedPortfolioRevenue: 0,
    estimatedPortfolioCost: 0,
    estimatedPortfolioProfit: 0,
    estimatedPortfolioMargin: 0,
    averagePackagingCost: 0,
    averageOverheadCost: 0,
    averageAdditiveCostPercentage: 0,
    
    // Profitability Overview
    topSkus: [],
    bottomSkus: [],
    profitByMarket: {},
    avgProfitPerContainer: 0,
    
    // Cost Drivers
    baseOilCosts: [],
    additiveCostPercentage: 0,
    packagingCost: 0,
    logisticsCost: 0,
    
    // Alerts & Warnings
    lowMarginSkus: [],
    losingQuotes: [],
    costAlerts: [],
    expiringQuotes: [],
    
    // Deal Pipeline
    openDeals: 0,
    negotiationDeals: 0,
    wonDeals: 0,
    lostDeals: 0,
    pipelineValue: 0,
    
    // Recent Activity
    recentQuotes: [],
    recentFormulations: [],
    recentCostSnapshots: [],
    priceChanges: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [dataRefreshToken]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [
        quotesData,
        quoteItemsData,
        skusData,
        recipesData,
        recipeIngredientsData,
        baseOilsData,
        additivesData,
      ] = await Promise.all([
        quotesService.getAll(),
        quoteItemsService.getAll(),
        skusService.getAll(),
        recipesService.getAll(),
        recipeIngredientsService.getAll(),
        baseOilsService.getAll(),
        additivesService.getAll(),
      ]);

      const uniqueSkus = dedupeLatestSkus(skusData);
      const latestSnapshots = await Promise.all(
        uniqueSkus.map((sku) => costSnapshotsService.getLatestBySku(sku.id).catch((error) => {
          console.error(`Failed to load latest cost snapshot for SKU ${sku.id}:`, error);
          return null;
        }))
      );

      setQuotes(quotesData);
      setSkus(uniqueSkus);

      // Calculate statistics
      calculateStats(
        quotesData,
        quoteItemsData,
        uniqueSkus,
        recipesData,
        recipeIngredientsData,
        baseOilsData,
        additivesData,
        latestSnapshots.filter(Boolean)
      );
    } catch (err) {
      console.error("Error loading data:", err);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (quotesData, quoteItemsData, skusData, recipesData, recipeIngredientsData, baseOilsData, additivesData, latestSnapshots) => {
    let quotedRevenue = 0;
    let quotedCost = 0;
    const skuProfits = {};
    const marketProfits = {};
    const dealStages = { open: 0, negotiation: 0, won: 0, lost: 0 };
    let pipelineValue = 0;
    let containersShipped = { teu20: 0, teu40: 0 };
    const recipeById = new Map((recipesData || []).map((recipe) => [recipe.id, recipe]));
    const skusByRecipeId = new Map();
    const skusById = new Map();
    skusData.forEach((sku) => {
      skusById.set(sku.id, sku);
      if (!sku.recipe_id) return;
      if (!skusByRecipeId.has(sku.recipe_id)) {
        skusByRecipeId.set(sku.recipe_id, []);
      }
      skusByRecipeId.get(sku.recipe_id).push(sku);
    });

    const quoteItemsByQuoteId = new Map();
    (quoteItemsData || []).forEach((item) => {
      if (!quoteItemsByQuoteId.has(item.quote_id)) {
        quoteItemsByQuoteId.set(item.quote_id, []);
      }
      quoteItemsByQuoteId.get(item.quote_id).push(item);
    });

    const baseOilById = new Map((baseOilsData || []).map((baseOil) => [baseOil.id, baseOil]));
    const additiveById = new Map((additivesData || []).map((additive) => [additive.id, additive]));
    const recipeIngredientsByRecipeId = new Map();
    (recipeIngredientsData || []).forEach((ingredient) => {
      if (!recipeIngredientsByRecipeId.has(ingredient.recipe_id)) {
        recipeIngredientsByRecipeId.set(ingredient.recipe_id, []);
      }
      recipeIngredientsByRecipeId.get(ingredient.recipe_id).push(ingredient);
    });

    const normalizeRecipe = (recipe) => {
      const rawBaseOil = baseOilById.get(recipe.base_oil_id) || recipe.base_oils || { name: "-", cost_per_liter: 0 };
      const rawIngredients = recipeIngredientsByRecipeId.get(recipe.id) || recipe.recipe_ingredients || [];

      return {
        ...recipe,
        base_oils: rawBaseOil,
        recipe_ingredients: rawIngredients.map((ingredient) => ({
          ...ingredient,
          additives: additiveById.get(ingredient.additive_id) || ingredient.additives || { name: "-", cost_per_unit: 0, unit: "" },
        })),
      };
    };

    const latestSnapshotBySkuId = new Map((latestSnapshots || []).map((snapshot) => [snapshot.sku_id, snapshot]));
    const skuCostDataById = new Map();
    const calculateSkuCost = (sku) => {
      const snapshot = latestSnapshotBySkuId.get(sku.id);
      if (snapshot) {
        return {
          materialCost: toNumber(snapshot.material_cost),
          blendingCost: toNumber(snapshot.blending_cost),
          packagingCost: toNumber(snapshot.packaging_cost),
          overheadCost: toNumber(snapshot.overhead_cost),
          totalCost: toNumber(snapshot.total_cost || snapshot.cost_per_unit),
          source: "snapshot",
        };
      }

      const recipe = normalizeRecipe(recipeById.get(sku.recipe_id) || sku.recipes || {});
      if (!recipe || !recipe.base_oils) {
        return null;
      }

      return {
        ...costingEngine.calculateTotalCostPerUnit(recipe, sku),
        source: "calculated",
      };
    };

    skusData.forEach((sku) => {
      const costData = calculateSkuCost(sku);
      if (costData) {
        skuCostDataById.set(sku.id, costData);
      }
    });

    quotesData.forEach((quote) => {
      // Track deal pipeline
      const status = quote.status || "draft";
      if (status === "draft" || status === "open") dealStages.open++;
      if (status === "negotiation") dealStages.negotiation++;
      if (status === "won") dealStages.won++;
      if (status === "lost") dealStages.lost++;
      if (status !== "lost" && quote.total_amount) pipelineValue += quote.total_amount;

      // Track containers (if shipment details exist)
      if (quote.shipment_details) {
        if (quote.shipment_details.container_type === "20FT") containersShipped.teu20++;
        if (quote.shipment_details.container_type === "40FT") containersShipped.teu40++;
      }

      const quoteItems = quoteItemsByQuoteId.get(quote.id) || quote.quote_items || [];
      if (quoteItems && Array.isArray(quoteItems) && quoteItems.length > 0) {
        quoteItems.forEach((item) => {
          quotedRevenue += item.line_total || item.quantity * item.unit_price || 0;

          const sku = skusById.get(item.sku_id);
          if (sku) {
            const costData = skuCostDataById.get(sku.id) || calculateSkuCost(sku);
            const itemCost = (costData?.totalCost || 0) * item.quantity;
            quotedCost += itemCost;

            // Track by SKU
            const skuId = item.sku_id;
            if (!skuProfits[skuId]) {
              skuProfits[skuId] = { profit: 0, revenue: 0, cost: 0, count: 0, name: sku.name, margin: 0 };
            }
            skuProfits[skuId].revenue += item.line_total || item.quantity * item.unit_price || 0;
            skuProfits[skuId].cost += itemCost;
            skuProfits[skuId].profit = skuProfits[skuId].revenue - skuProfits[skuId].cost;
            skuProfits[skuId].count += item.quantity;
            skuProfits[skuId].margin = (skuProfits[skuId].profit / skuProfits[skuId].revenue) * 100 || 0;

            // Track by market
            const market = quote.market || "Unknown";
            if (!marketProfits[market]) {
              marketProfits[market] = { revenue: 0, cost: 0, profit: 0 };
            }
            marketProfits[market].revenue += item.line_total || item.quantity * item.unit_price || 0;
            marketProfits[market].cost += itemCost;
            marketProfits[market].profit = marketProfits[market].revenue - marketProfits[market].cost;
          }
        });
      } else if (quote.total_amount) {
        quotedRevenue += Number(quote.total_amount) || 0;
      }
    });

    const recipeMetrics = (recipesData || []).map((recipe) => {
      const normalizedRecipe = normalizeRecipe(recipe);
      const baseOilCost = toNumber(normalizedRecipe.base_oils?.cost_per_liter);
      const additiveCost = (normalizedRecipe.recipe_ingredients || []).reduce(
        (sumValue, ingredient) => sumValue + toNumber(ingredient.quantity_per_liter) * toNumber(ingredient.additives?.cost_per_unit),
        0
      );
      const materialCostPerLiter = costingEngine.calculateMaterialCostPerLiter(normalizedRecipe);
      const blendingCostPerLiter = toNumber(normalizedRecipe.blending_cost_per_liter);
      const totalFormulaCostPerLiter = materialCostPerLiter + blendingCostPerLiter;
      const additiveShare = materialCostPerLiter > 0 ? (additiveCost / materialCostPerLiter) * 100 : 0;
      const linkedSkus = skusByRecipeId.get(recipe.id) || [];
      const latestSnapshot = linkedSkus
        .map((sku) => latestSnapshotBySkuId.get(sku.id))
        .filter(Boolean)
        .sort((left, right) => sortByDateDesc(left, right, "snapshot_date"))[0] || null;

      return {
        id: recipe.id,
        name: recipe.name,
        baseOilName: normalizedRecipe.base_oils?.name || "-",
        baseOilCost,
        additiveCost,
        materialCostPerLiter,
        blendingCostPerLiter,
        totalFormulaCostPerLiter,
        additiveShare,
        ingredientCount: (normalizedRecipe.recipe_ingredients || []).length,
        linkedSkuCount: linkedSkus.length,
        latestSnapshot,
        latestSnapshotCostPerUnit: toNumber(latestSnapshot?.total_cost || latestSnapshot?.cost_per_unit),
        updatedAt: recipe.updated_at || recipe.created_at,
      };
    });

    const totalFormulations = recipeMetrics.length;
    const totalSkus = skusData.length;
    const totalSnapshots = latestSnapshots.length;
    const averageMaterialCostPerLiter = average(recipeMetrics.map((metric) => metric.materialCostPerLiter));
    const averageFormulaCostPerLiter = average(recipeMetrics.map((metric) => metric.totalFormulaCostPerLiter));
    const averageAdditiveCostPercentage = average(recipeMetrics.map((metric) => metric.additiveShare));
    const averagePackagingCost = average(
      latestSnapshots.length > 0
        ? latestSnapshots.map((snapshot) => toNumber(snapshot.packaging_cost))
        : skusData.map((sku) => toNumber(sku.packaging_cost_per_unit))
    );
    const averageOverheadCost = average(
      latestSnapshots.length > 0
        ? latestSnapshots.map((snapshot) => toNumber(snapshot.overhead_cost))
        : skusData.map((sku) => {
            const costData = skuCostDataById.get(sku.id) || calculateSkuCost(sku);
            return costData?.overheadCost || 0;
          })
    );

    const averageSkuCostPerUnit = average(
      skusData.map((sku) => {
        const costData = skuCostDataById.get(sku.id) || calculateSkuCost(sku);
        return costData?.totalCost || 0;
      })
    );

    const estimatedPortfolioRevenue = sum(
      skusData.map((sku) => toNumber(sku.current_selling_price ?? sku.selling_price ?? 0))
    );
    const estimatedPortfolioCost = sum(
      skusData.map((sku) => {
        const costData = skuCostDataById.get(sku.id) || calculateSkuCost(sku);
        return costData?.totalCost || 0;
      })
    );

    const actualRevenue = quotedRevenue > 0 ? quotedRevenue : estimatedPortfolioRevenue;
    const actualCost = quotedCost > 0 ? quotedCost : estimatedPortfolioCost;
    const grossProfit = actualRevenue - actualCost;
    const profitMargin = actualRevenue > 0 ? (grossProfit / actualRevenue) * 100 : 0;

    // Get top and bottom SKUs
    const sortedSkus = Object.values(skuProfits).sort((a, b) => b.profit - a.profit);
    const topSkus = sortedSkus.slice(0, 5);
    const bottomSkus = sortedSkus.slice(-5).reverse();

    // Identify low margin SKUs (< 15%)
    const lowMarginSkus = Object.values(skuProfits).filter((s) => s.margin < 15);

    // Identify losing quotes
    const losingQuotes = quotesData
      .filter((q) => (quoteItemsByQuoteId.get(q.id) || q.quote_items || []).length > 0)
      .map((q) => {
        let qRevenue = 0;
        let qCost = 0;
        const quoteItems = quoteItemsByQuoteId.get(q.id) || q.quote_items || [];
        quoteItems.forEach((item) => {
          qRevenue += item.line_total || item.quantity * item.unit_price || 0;
          const sku = skusById.get(item.sku_id);
          if (sku) {
            const costData = skuCostDataById.get(sku.id) || calculateSkuCost(sku);
            qCost += (costData?.totalCost || 0) * item.quantity;
          }
        });
        return { ...q, qProfit: qRevenue - qCost };
      })
      .filter((q) => q.qProfit < 0)
      .slice(0, 5);

    const baseOilMap = new Map();
    recipeMetrics.forEach((metric) => {
      if (!baseOilMap.has(metric.baseOilName)) {
        baseOilMap.set(metric.baseOilName, { name: metric.baseOilName, count: 0, totalCost: 0 });
      }

      const entry = baseOilMap.get(metric.baseOilName);
      entry.count += 1;
      entry.totalCost += metric.baseOilCost;
    });

    const baseOilCosts = Array.from(baseOilMap.values())
      .map((entry) => ({
        ...entry,
        averageCost: entry.count > 0 ? entry.totalCost / entry.count : 0,
      }))
      .sort((left, right) => right.count - left.count || right.averageCost - left.averageCost)
      .slice(0, 5);

    const recentFormulations = [...recipeMetrics]
      .sort((left, right) => sortByDateDesc(left, right, "updatedAt"))
      .slice(0, 5);

    const recentCostSnapshots = [...(latestSnapshots || [])]
      .sort((left, right) => sortByDateDesc(left, right, "snapshot_date"))
      .slice(0, 5)
      .map((snapshot) => {
        const sku = skusData.find((entry) => entry.id === snapshot.sku_id) || null;
        const recipe = sku ? (recipeById.get(sku.recipe_id) || sku.recipes || null) : null;

        return {
          ...snapshot,
          skuName: sku?.name || "-",
          recipeName: recipe?.name || "-",
          totalCost: toNumber(snapshot.total_cost || snapshot.cost_per_unit),
          materialCost: toNumber(snapshot.material_cost),
          blendingCost: toNumber(snapshot.blending_cost),
          packagingCost: toNumber(snapshot.packaging_cost),
          overheadCost: toNumber(snapshot.overhead_cost),
        };
      });

    const costAlerts = [];
    const missingSnapshotCount = recipeMetrics.filter((metric) => !metric.latestSnapshot).length;
    if (missingSnapshotCount > 0) {
      costAlerts.push(`${missingSnapshotCount} formulation${missingSnapshotCount === 1 ? "" : "s"} do not have a saved cost snapshot yet.`);
    }

    const now = new Date();
    const warningCutoff = new Date(now);
    warningCutoff.setDate(warningCutoff.getDate() + 30);
    const expiringQuotes = quotesData
      .filter((quote) => quote.valid_until && !Number.isNaN(new Date(quote.valid_until).getTime()))
      .filter((quote) => {
        const expiryDate = new Date(quote.valid_until);
        return expiryDate >= now && expiryDate <= warningCutoff;
      })
      .sort((left, right) => new Date(left.valid_until) - new Date(right.valid_until))
      .slice(0, 5)
      .map((quote) => ({
        ...quote,
        daysRemaining: Math.max(0, Math.ceil((new Date(quote.valid_until) - now) / (1000 * 60 * 60 * 24))),
      }));

    // Average profit per container (approximate)
    const avgProfitPerContainer = containersShipped.teu20 + containersShipped.teu40 > 0
      ? grossProfit / (containersShipped.teu20 + containersShipped.teu40)
      : 0;

    setStats({
      // KPI Summary
      totalRevenue: parseFloat(actualRevenue.toFixed(2)),
      totalCost: parseFloat(actualCost.toFixed(2)),
      grossProfit: parseFloat(grossProfit.toFixed(2)),
      profitMargin: parseFloat(profitMargin.toFixed(2)),
      activeDeals: dealStages.open + dealStages.negotiation,
      containersShipped,
      totalSkus,
      totalFormulations,
      totalSnapshots,
      averageMaterialCostPerLiter: parseFloat(averageMaterialCostPerLiter.toFixed(2)),
      averageFormulaCostPerLiter: parseFloat(averageFormulaCostPerLiter.toFixed(2)),
      averageSkuCostPerUnit: parseFloat(averageSkuCostPerUnit.toFixed(2)),
      estimatedPortfolioRevenue: parseFloat(actualRevenue.toFixed(2)),
      estimatedPortfolioCost: parseFloat(actualCost.toFixed(2)),
      estimatedPortfolioProfit: parseFloat(grossProfit.toFixed(2)),
      estimatedPortfolioMargin: parseFloat(profitMargin.toFixed(2)),
      averagePackagingCost: parseFloat(averagePackagingCost.toFixed(2)),
      averageOverheadCost: parseFloat(averageOverheadCost.toFixed(2)),
      averageAdditiveCostPercentage: parseFloat(averageAdditiveCostPercentage.toFixed(2)),

      // Profitability Overview
      topSkus,
      bottomSkus,
      profitByMarket: marketProfits,
      avgProfitPerContainer: parseFloat(avgProfitPerContainer.toFixed(2)),

      // Cost Drivers
      baseOilCosts,
      additiveCostPercentage: parseFloat(averageAdditiveCostPercentage.toFixed(2)),
      packagingCost: parseFloat(averagePackagingCost.toFixed(2)),
      logisticsCost: parseFloat(averageOverheadCost.toFixed(2)),

      // Alerts & Warnings
      lowMarginSkus,
      losingQuotes,
      costAlerts,
      expiringQuotes,

      // Deal Pipeline
      openDeals: dealStages.open,
      negotiationDeals: dealStages.negotiation,
      wonDeals: dealStages.won,
      lostDeals: dealStages.lost,
      pipelineValue: parseFloat(pipelineValue.toFixed(2)),

      // Recent Activity
      recentQuotes: [...quotesData].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5),
      recentFormulations,
      recentCostSnapshots,
      priceChanges: [],
    });
  };

  const profitableTrend = [...stats.topSkus].slice(0, 5).reverse();
  const trendWidth = 320;
  const trendHeight = 150;
  const trendPaddingX = 18;
  const trendPaddingY = 18;
  const trendMaxProfit = Math.max(...profitableTrend.map((sku) => sku.profit), 1);
  const trendPoints = profitableTrend.map((sku, index) => {
    const xStep = profitableTrend.length > 1 ? (trendWidth - trendPaddingX * 2) / (profitableTrend.length - 1) : 0;
    const x = trendPaddingX + index * xStep;
    const yRange = trendHeight - trendPaddingY * 2;
    const y = trendHeight - trendPaddingY - (sku.profit / trendMaxProfit) * yRange;
    return { x, y, name: sku.name, profit: sku.profit };
  });
  const trendPath = trendPoints.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const trendAreaPath = trendPoints.length > 1
    ? `${trendPath} L ${trendPoints[trendPoints.length - 1].x} ${trendHeight - trendPaddingY} L ${trendPoints[0].x} ${trendHeight - trendPaddingY} Z`
    : "";

  if (loading) return <div className="p-6 text-center">Loading...</div>;

  return (
    <div className="page-stack">
      {/* ====== SECTION 1: KPI SUMMARY ====== */}
      <section className="page-section">
        <h2 className="section-title">KPI Summary</h2>
        <div className="metric-grid metric-grid-8">
          {/* Total Revenue */}
          <div className="metric-card">
            <div className="content-row-stack">
              <p className="metric-label">Total Revenue</p>
              <p className="metric-value">${stats.estimatedPortfolioRevenue.toLocaleString()}</p>
              <p className="metric-caption">Quotes total or estimated pricebook value</p>
            </div>
          </div>

          {/* Total Cost */}
          <div className="metric-card">
            <div className="content-row-stack">
              <p className="metric-label">Total Cost</p>
              <p className="metric-value">${stats.estimatedPortfolioCost.toLocaleString()}</p>
              <p className="metric-caption">Latest snapshot or calculated SKU cost</p>
            </div>
          </div>

          {/* Gross Profit */}
          <div className="metric-card">
            <div className="content-row-stack">
              <p className="metric-label">Gross Profit</p>
              <p className="metric-value">${stats.estimatedPortfolioProfit.toLocaleString()}</p>
              <p className="metric-caption">Revenue minus cost</p>
            </div>
          </div>

          {/* Profit Margin */}
          <div className="metric-card">
            <div className="content-row-stack">
              <p className="metric-label">Profit Margin %</p>
              <p className="metric-value">{stats.estimatedPortfolioMargin.toFixed(1)}%</p>
              <p className="metric-caption">Estimated from persisted pricing data</p>
            </div>
          </div>

          {/* Active Deals */}
          <div className="metric-card">
            <div className="content-row-stack">
              <p className="metric-label">Active Deals</p>
              <p className="metric-value">{stats.activeDeals}</p>
            </div>
          </div>

          {/* Containers - 20FT */}
          <div className="metric-card">
            <div className="content-row-stack">
              <p className="metric-label">Formulations</p>
              <p className="metric-value">{stats.totalFormulations}</p>
            </div>
          </div>

          {/* Containers - 40FT */}
          <div className="metric-card">
            <div className="content-row-stack">
              <p className="metric-label">SKUs</p>
              <p className="metric-value">{stats.totalSkus}</p>
            </div>
          </div>

          {/* Avg Profit per Container */}
          <div className="metric-card">
            <div className="content-row-stack">
              <p className="metric-label">Avg Cost / Unit</p>
              <p className="metric-value">${stats.averageSkuCostPerUnit.toLocaleString()}</p>
            </div>
          </div>

          <div className="metric-card">
            <div className="content-row-stack">
              <p className="metric-label">Avg Formula Cost / L</p>
              <p className="metric-value">${stats.averageFormulaCostPerLiter.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ====== SECTION 2: PROFITABILITY OVERVIEW ====== */}
      <section className="page-section">
        <h2 className="section-title">Profitability Overview</h2>
        <div className="section-grid profitability-grid">
          {/* Profit Trend Graph */}
          <div className="content-card chart-card xl:col-span-2">
            <div className="content-row-stack">
              <h3 className="text-lg font-semibold text-gray-900">Profit Trend</h3>
              <p className="section-subtitle">Top profitable SKUs plotted in descending order.</p>
              {trendPoints.length === 0 ? (
                <p className="text-gray-500">No data available</p>
              ) : (
                <div className="chart-grid">
                  <div className="chart-panel">
                    <svg viewBox={`0 0 ${trendWidth} ${trendHeight}`} className="w-full h-40">
                      <line x1="18" y1="18" x2="18" y2="132" className="trend-axis" />
                      <line x1="18" y1="132" x2="302" y2="132" className="trend-axis" />
                      {trendAreaPath && <path d={trendAreaPath} className="trend-area" />}
                      {trendPoints.length > 1 && <path d={trendPath} className="trend-line" />}
                      {trendPoints.map((point, idx) => (
                        <g key={idx}>
                          <circle cx={point.x} cy={point.y} r="4.5" className="trend-point" />
                        </g>
                      ))}
                    </svg>
                  </div>

                  <div className="chart-legend">
                    {trendPoints.map((point, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-900"></span>
                        <span>{point.name}</span>
                        <span className="font-semibold text-gray-900">${point.profit.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom 5 SKUs */}
          <div className="content-card xl:col-span-1">
            <div className="content-row-stack">
              <h3 className="text-lg font-semibold text-gray-900">Bottom 5 SKUs by Profit</h3>
              {stats.bottomSkus.length === 0 ? (
                <p className="text-gray-500">No data available</p>
              ) : (
                <div className="space-y-3">
                  {stats.bottomSkus.map((sku, idx) => (
                    <div key={idx} className="compact-item">
                      <div className="flex justify-between items-start mb-2">
                        <p className="font-semibold text-gray-900">{sku.name}</p>
                        <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded">#{idx + 1}</span>
                      </div>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Profit:</span>
                          <span className="font-semibold text-gray-900">${sku.profit.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Margin:</span>
                          <span className="font-semibold text-gray-900">{sku.margin.toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Profit by Market */}
          <div className="content-card xl:col-span-2">
            <div className="content-row-stack">
              <h3 className="text-lg font-semibold text-gray-900">Profit by Market</h3>
              {Object.keys(stats.profitByMarket).length === 0 ? (
                <p className="text-gray-500">No data available</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Object.entries(stats.profitByMarket).map(([market, data], idx) => (
                    <div key={idx} className="compact-item">
                      <p className="font-semibold text-gray-900 mb-2">{market}</p>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Revenue:</span>
                          <span className="font-semibold text-gray-900">${data.revenue.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Profit:</span>
                          <span className="font-semibold text-gray-900">${data.profit.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ====== SECTION 3: COST DRIVERS ====== */}
      <section className="page-section">
        <h2 className="section-title">Cost Drivers</h2>
        <div className="metric-grid">
          <div className="metric-card">
            <div className="content-row-stack">
              <p className="metric-label">Base Oil Cost Trend</p>
              <p className="metric-value content-value-lg">
                {stats.baseOilCosts[0] ? `$${stats.baseOilCosts[0].averageCost.toFixed(2)}` : "—"}
              </p>
              <p className="metric-caption">
                {stats.baseOilCosts[0]
                  ? `${stats.baseOilCosts[0].name} · ${stats.baseOilCosts[0].count} formulations`
                  : "No formulation data yet"}
              </p>
            </div>
          </div>

          <div className="metric-card">
            <div className="content-row-stack">
              <p className="metric-label">Additive Cost %</p>
              <p className="metric-value content-value-lg">{stats.additiveCostPercentage.toFixed(1)}%</p>
              <p className="metric-caption">Average additive share of formulation material cost</p>
            </div>
          </div>

          <div className="metric-card">
            <div className="content-row-stack">
              <p className="metric-label">Packaging Cost</p>
              <p className="metric-value content-value-lg">${stats.packagingCost.toFixed(2)}</p>
              <p className="metric-caption">Average latest snapshot packaging cost/unit</p>
            </div>
          </div>

          <div className="metric-card">
            <div className="content-row-stack">
              <p className="metric-label">Overhead Cost</p>
              <p className="metric-value content-value-lg">${stats.averageOverheadCost.toFixed(2)}</p>
              <p className="metric-caption">Average latest snapshot overhead cost/unit</p>
            </div>
          </div>
        </div>

        <div className="content-card mt-4">
          <div className="content-row-stack">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Formulation Mix</h3>
              <p className="section-subtitle">
                {stats.totalFormulations} formulations analyzed · Average recipe cost/L ${stats.averageFormulaCostPerLiter.toFixed(2)}
              </p>
            </div>
            {stats.baseOilCosts.length === 0 ? (
              <p className="text-gray-500">No formulation mix data available</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {stats.baseOilCosts.map((entry) => (
                  <span key={entry.name} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {entry.name} · {entry.count} recipe{entry.count === 1 ? "" : "s"} · ${entry.averageCost.toFixed(2)}/L
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ====== SECTION 4: ALERTS & WARNINGS ====== */}
      <section className="page-section">
        <h2 className="section-title">Alerts & Warnings</h2>
        <div className="section-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
          {/* Low Margin SKUs */}
          <div className="content-card">
            <div className="content-row-stack">
              <h3 className="text-lg font-semibold text-gray-900">Low Margin SKUs (&lt; 15%)</h3>
              {stats.lowMarginSkus.length === 0 ? (
                <p className="text-gray-500">No low margin SKUs</p>
              ) : (
                <div className="space-y-3">
                  {stats.lowMarginSkus.map((sku, idx) => (
                    <div key={idx} className="compact-item">
                      <div className="flex justify-between items-center mb-2">
                        <p className="font-semibold text-gray-900">{sku.name}</p>
                        <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded">{sku.margin.toFixed(1)}%</span>
                      </div>
                      <p className="text-sm text-gray-600">Revenue: ${sku.revenue.toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              )}

              {stats.costAlerts.length > 0 && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <p className="font-semibold">Formulation cost alerts</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {stats.costAlerts.map((alert) => (
                      <span key={alert} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-amber-900">
                        {alert}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Loss-Making Quotes */}
          <div className="content-card">
            <div className="content-row-stack">
              <h3 className="text-lg font-semibold text-gray-900">Loss-Making Quotes</h3>
              {stats.losingQuotes.length === 0 ? (
                <p className="text-gray-500">No loss-making quotes</p>
              ) : (
                <div className="space-y-3">
                  {stats.losingQuotes.map((quote, idx) => (
                    <div key={idx} className="compact-item">
                      <div className="flex justify-between items-center mb-2">
                        <p className="font-semibold text-gray-900">{quote.quote_number}</p>
                        <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded">${quote.qProfit.toFixed(2)}</span>
                      </div>
                      <p className="text-sm text-gray-600">Customer: {quote.customers?.name || "Unknown"}</p>
                    </div>
                  ))}
                </div>
              )}

              {stats.expiringQuotes.length > 0 && (
                <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
                  <p className="font-semibold">Quotes expiring soon</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {stats.expiringQuotes.map((quote) => (
                      <span key={quote.id} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-sky-900">
                        {quote.quote_number} · {quote.daysRemaining} day{quote.daysRemaining === 1 ? "" : "s"}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ====== SECTION 5: DEAL PIPELINE SNAPSHOT ====== */}
      <section className="page-section">
        <h2 className="section-title">Deal Pipeline Snapshot</h2>
        <div className="metric-grid metric-grid-5">
          <div className="metric-card">
            <div className="content-row-stack">
              <p className="metric-label">Open Deals</p>
              <p className="metric-value">{stats.openDeals}</p>
            </div>
          </div>

          <div className="metric-card">
            <div className="content-row-stack">
              <p className="metric-label">In Negotiation</p>
              <p className="metric-value">{stats.negotiationDeals}</p>
            </div>
          </div>

          <div className="metric-card">
            <div className="content-row-stack">
              <p className="metric-label">Won Deals</p>
              <p className="metric-value">{stats.wonDeals}</p>
            </div>
          </div>

          <div className="metric-card">
            <div className="content-row-stack">
              <p className="metric-label">Lost Deals</p>
              <p className="metric-value">{stats.lostDeals}</p>
            </div>
          </div>

          <div className="metric-card">
            <div className="content-row-stack">
              <p className="metric-label">Pipeline Value</p>
              <p className="metric-value">${stats.pipelineValue.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ====== SECTION 6: RECENT ACTIVITY ====== */}
      <section className="page-section">
        <h2 className="section-title">Recent Activity</h2>
        <div className="content-card">
          <div className="content-row-stack">
            <h3 className="text-lg font-semibold text-gray-900">Recently Created Quotes</h3>
            {stats.recentQuotes.length === 0 ? (
              <p className="text-gray-500">No recent quotes</p>
            ) : (
              <div className="overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      <th>Quote #</th>
                      <th>Customer</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentQuotes.map((quote) => (
                      <tr key={quote.id}>
                        <td className="font-semibold">{quote.quote_number}</td>
                        <td>{quote.customers?.name || "-"}</td>
                        <td className="text-right font-semibold">
                          ${quote.total_amount?.toFixed(2) || "0.00"}
                        </td>
                        <td>
                          <span
                            className={`px-2 py-1 rounded text-xs font-semibold ${
                              quote.status === "draft"
                                ? "bg-gray-100 text-gray-800"
                                : "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {quote.status}
                          </span>
                        </td>
                        <td className="text-gray-600">
                          {new Date(quote.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="content-card mt-4">
          <div className="content-row-stack">
            <h3 className="text-lg font-semibold text-gray-900">Recently Created Formulations</h3>
            {stats.recentFormulations.length === 0 ? (
              <p className="text-gray-500">No recent formulations</p>
            ) : (
              <div className="overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      <th>Formulation</th>
                      <th>Base Oil</th>
                      <th>Material Cost/L</th>
                      <th>Blend Cost/L</th>
                      <th>Linked SKUs</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentFormulations.map((recipe) => (
                      <tr key={recipe.id}>
                        <td className="font-semibold">{recipe.name}</td>
                        <td>{recipe.baseOilName}</td>
                        <td className="text-right font-semibold">${recipe.materialCostPerLiter.toFixed(2)}</td>
                        <td className="text-right">${recipe.blendingCostPerLiter.toFixed(2)}</td>
                        <td className="text-right">{recipe.linkedSkuCount}</td>
                        <td className="text-gray-600">{new Date(recipe.updatedAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="content-card mt-4">
          <div className="content-row-stack">
            <h3 className="text-lg font-semibold text-gray-900">Latest Cost Snapshots</h3>
            {stats.recentCostSnapshots.length === 0 ? (
              <p className="text-gray-500">No saved cost snapshots yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Formulation</th>
                      <th>Material</th>
                      <th>Packaging</th>
                      <th>Overhead</th>
                      <th>Total Cost</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentCostSnapshots.map((snapshot) => (
                      <tr key={snapshot.id}>
                        <td className="font-semibold">{snapshot.skuName}</td>
                        <td>{snapshot.recipeName}</td>
                        <td className="text-right">${snapshot.materialCost.toFixed(2)}</td>
                        <td className="text-right">${snapshot.packagingCost.toFixed(2)}</td>
                        <td className="text-right">${snapshot.overheadCost.toFixed(2)}</td>
                        <td className="text-right font-semibold">${snapshot.totalCost.toFixed(2)}</td>
                        <td className="text-gray-600">{new Date(snapshot.snapshot_date || snapshot.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
