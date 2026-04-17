import React, { useState, useEffect } from "react";
import { quotesService, skusService, costSnapshotsService, costingEngine } from "../services/supabaseService";

export default function Dashboard() {
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
    priceChanges: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [quotesData, skusData] = await Promise.all([
        quotesService.getAll(),
        skusService.getAll(),
      ]);

      setQuotes(quotesData);
      setSkus(skusData);

      // Calculate statistics
      calculateStats(quotesData, skusData);
    } catch (err) {
      console.error("Error loading data:", err);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (quotesData, skusData) => {
    let totalRevenue = 0;
    let totalCost = 0;
    const skuProfits = {};
    const marketProfits = {};
    const dealStages = { open: 0, negotiation: 0, won: 0, lost: 0 };
    let pipelineValue = 0;
    let containersShipped = { teu20: 0, teu40: 0 };

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

      if (quote.quote_items && Array.isArray(quote.quote_items)) {
        quote.quote_items.forEach((item) => {
          totalRevenue += item.line_total || 0;

          // Calculate cost
          const sku = skusData.find((s) => s.id === item.sku_id);
          if (sku) {
            const costData = costingEngine.calculateTotalCostPerUnit(sku.recipes, sku);
            const itemCost = costData.totalCost * item.quantity;
            totalCost += itemCost;

            // Track by SKU
            const skuId = item.sku_id;
            if (!skuProfits[skuId]) {
              skuProfits[skuId] = { profit: 0, revenue: 0, cost: 0, count: 0, name: sku.name, margin: 0 };
            }
            skuProfits[skuId].revenue += item.line_total || 0;
            skuProfits[skuId].cost += itemCost;
            skuProfits[skuId].profit = skuProfits[skuId].revenue - skuProfits[skuId].cost;
            skuProfits[skuId].count += item.quantity;
            skuProfits[skuId].margin = (skuProfits[skuId].profit / skuProfits[skuId].revenue) * 100 || 0;

            // Track by market
            const market = quote.market || "Unknown";
            if (!marketProfits[market]) {
              marketProfits[market] = { revenue: 0, cost: 0, profit: 0 };
            }
            marketProfits[market].revenue += item.line_total || 0;
            marketProfits[market].cost += itemCost;
            marketProfits[market].profit = marketProfits[market].revenue - marketProfits[market].cost;
          }
        });
      }
    });

    const grossProfit = totalRevenue - totalCost;
    const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    // Get top and bottom SKUs
    const sortedSkus = Object.values(skuProfits).sort((a, b) => b.profit - a.profit);
    const topSkus = sortedSkus.slice(0, 5);
    const bottomSkus = sortedSkus.slice(-5).reverse();

    // Identify low margin SKUs (< 15%)
    const lowMarginSkus = Object.values(skuProfits).filter((s) => s.margin < 15);

    // Identify losing quotes
    const losingQuotes = quotesData
      .filter((q) => q.quote_items && q.quote_items.length > 0)
      .map((q) => {
        let qRevenue = 0;
        let qCost = 0;
        q.quote_items.forEach((item) => {
          qRevenue += item.line_total || 0;
          const sku = skusData.find((s) => s.id === item.sku_id);
          if (sku) {
            const costData = costingEngine.calculateTotalCostPerUnit(sku.recipes, sku);
            qCost += costData.totalCost * item.quantity;
          }
        });
        return { ...q, qProfit: qRevenue - qCost };
      })
      .filter((q) => q.qProfit < 0)
      .slice(0, 5);

    // Average profit per container (approximate)
    const avgProfitPerContainer = containersShipped.teu20 + containersShipped.teu40 > 0
      ? grossProfit / (containersShipped.teu20 + containersShipped.teu40)
      : 0;

    setStats({
      // KPI Summary
      totalRevenue: parseFloat(totalRevenue.toFixed(2)),
      totalCost: parseFloat(totalCost.toFixed(2)),
      grossProfit: parseFloat(grossProfit.toFixed(2)),
      profitMargin: parseFloat(profitMargin.toFixed(2)),
      activeDeals: dealStages.open + dealStages.negotiation,
      containersShipped,

      // Profitability Overview
      topSkus,
      bottomSkus,
      profitByMarket: marketProfits,
      avgProfitPerContainer: parseFloat(avgProfitPerContainer.toFixed(2)),

      // Cost Drivers (placeholder - would need detailed costing data)
      baseOilCosts: [],
      additiveCostPercentage: 0,
      packagingCost: 0,
      logisticsCost: 0,

      // Alerts & Warnings
      lowMarginSkus,
      losingQuotes,
      costAlerts: [],
      expiringQuotes: [],

      // Deal Pipeline
      openDeals: dealStages.open,
      negotiationDeals: dealStages.negotiation,
      wonDeals: dealStages.won,
      lostDeals: dealStages.lost,
      pipelineValue: parseFloat(pipelineValue.toFixed(2)),

      // Recent Activity
      recentQuotes: quotesData.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5),
      recentFormulations: [],
      priceChanges: [],
    });
  };

  if (loading) return <div className="p-6 text-center">Loading...</div>;

  return (
    <div className="space-y-8 pb-8">
      {/* ====== SECTION 1: KPI SUMMARY ====== */}
      <section>
        <h1 className="text-2xl font-semibold text-gray-900 mb-6">KPI Summary</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Total Revenue */}
          <div className="table-container">
            <div className="px-6 py-6">
              <p className="text-sm text-gray-600 mb-2">Total Revenue</p>
              <p className="text-3xl font-semibold text-gray-900">${stats.totalRevenue.toLocaleString()}</p>
            </div>
          </div>

          {/* Total Cost */}
          <div className="table-container">
            <div className="px-6 py-6">
              <p className="text-sm text-gray-600 mb-2">Total Cost</p>
              <p className="text-3xl font-semibold text-gray-900">${stats.totalCost.toLocaleString()}</p>
            </div>
          </div>

          {/* Gross Profit */}
          <div className="table-container">
            <div className="px-6 py-6">
              <p className="text-sm text-gray-600 mb-2">Gross Profit</p>
              <p className="text-3xl font-semibold text-gray-900">${stats.grossProfit.toLocaleString()}</p>
            </div>
          </div>

          {/* Profit Margin */}
          <div className="table-container">
            <div className="px-6 py-6">
              <p className="text-sm text-gray-600 mb-2">Profit Margin %</p>
              <p className="text-3xl font-semibold text-gray-900">{stats.profitMargin.toFixed(1)}%</p>
            </div>
          </div>

          {/* Active Deals */}
          <div className="table-container">
            <div className="px-6 py-6">
              <p className="text-sm text-gray-600 mb-2">Active Deals</p>
              <p className="text-3xl font-semibold text-gray-900">{stats.activeDeals}</p>
            </div>
          </div>

          {/* Containers - 20FT */}
          <div className="table-container">
            <div className="px-6 py-6">
              <p className="text-sm text-gray-600 mb-2">Containers Shipped (20FT)</p>
              <p className="text-3xl font-semibold text-gray-900">{stats.containersShipped.teu20}</p>
            </div>
          </div>

          {/* Containers - 40FT */}
          <div className="table-container">
            <div className="px-6 py-6">
              <p className="text-sm text-gray-600 mb-2">Containers Shipped (40FT)</p>
              <p className="text-3xl font-semibold text-gray-900">{stats.containersShipped.teu40}</p>
            </div>
          </div>

          {/* Avg Profit per Container */}
          <div className="table-container">
            <div className="px-6 py-6">
              <p className="text-sm text-gray-600 mb-2">Avg Profit/Container</p>
              <p className="text-3xl font-semibold text-gray-900">${stats.avgProfitPerContainer.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ====== SECTION 2: PROFITABILITY OVERVIEW ====== */}
      <section>
        <h2 className="text-2xl font-semibold text-gray-900 mb-6">Profitability Overview</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Top 5 SKUs */}
          <div className="table-container">
            <div className="px-6 py-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Top 5 SKUs by Profit</h3>
              {stats.topSkus.length === 0 ? (
                <p className="text-gray-500">No data available</p>
              ) : (
                <div className="space-y-3">
                  {stats.topSkus.map((sku, idx) => (
                    <div key={idx} className="p-3 border border-gray-200 rounded">
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

          {/* Bottom 5 SKUs */}
          <div className="table-container">
            <div className="px-6 py-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Bottom 5 SKUs by Profit</h3>
              {stats.bottomSkus.length === 0 ? (
                <p className="text-gray-500">No data available</p>
              ) : (
                <div className="space-y-3">
                  {stats.bottomSkus.map((sku, idx) => (
                    <div key={idx} className="p-3 border border-gray-200 rounded">
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
          <div className="table-container">
            <div className="px-6 py-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Profit by Market</h3>
              {Object.keys(stats.profitByMarket).length === 0 ? (
                <p className="text-gray-500">No data available</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(stats.profitByMarket).map(([market, data], idx) => (
                    <div key={idx} className="p-3 border border-gray-200 rounded">
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
      <section>
        <h2 className="text-2xl font-semibold text-gray-900 mb-6">Cost Drivers</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="table-container">
            <div className="px-6 py-6">
              <p className="text-sm text-gray-600 mb-2">Base Oil Cost Trend</p>
              <p className="text-2xl font-semibold text-gray-900">—</p>
              <p className="text-xs text-gray-500 mt-2">Data pending</p>
            </div>
          </div>

          <div className="table-container">
            <div className="px-6 py-6">
              <p className="text-sm text-gray-600 mb-2">Additive Cost %</p>
              <p className="text-2xl font-semibold text-gray-900">—</p>
              <p className="text-xs text-gray-500 mt-2">Data pending</p>
            </div>
          </div>

          <div className="table-container">
            <div className="px-6 py-6">
              <p className="text-sm text-gray-600 mb-2">Packaging Cost</p>
              <p className="text-2xl font-semibold text-gray-900">—</p>
              <p className="text-xs text-gray-500 mt-2">Data pending</p>
            </div>
          </div>

          <div className="table-container">
            <div className="px-6 py-6">
              <p className="text-sm text-gray-600 mb-2">Logistics Cost</p>
              <p className="text-2xl font-semibold text-gray-900">—</p>
              <p className="text-xs text-gray-500 mt-2">Data pending</p>
            </div>
          </div>
        </div>
      </section>

      {/* ====== SECTION 4: ALERTS & WARNINGS ====== */}
      <section>
        <h2 className="text-2xl font-semibold text-gray-900 mb-6">Alerts & Warnings</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Low Margin SKUs */}
          <div className="table-container">
            <div className="px-6 py-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Low Margin SKUs (&lt; 15%)</h3>
              {stats.lowMarginSkus.length === 0 ? (
                <p className="text-gray-500">No low margin SKUs</p>
              ) : (
                <div className="space-y-3">
                  {stats.lowMarginSkus.map((sku, idx) => (
                    <div key={idx} className="p-3 border border-gray-200 rounded">
                      <div className="flex justify-between items-center mb-2">
                        <p className="font-semibold text-gray-900">{sku.name}</p>
                        <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded">{sku.margin.toFixed(1)}%</span>
                      </div>
                      <p className="text-sm text-gray-600">Revenue: ${sku.revenue.toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Loss-Making Quotes */}
          <div className="table-container">
            <div className="px-6 py-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Loss-Making Quotes</h3>
              {stats.losingQuotes.length === 0 ? (
                <p className="text-gray-500">No loss-making quotes</p>
              ) : (
                <div className="space-y-3">
                  {stats.losingQuotes.map((quote, idx) => (
                    <div key={idx} className="p-3 border border-gray-200 rounded">
                      <div className="flex justify-between items-center mb-2">
                        <p className="font-semibold text-gray-900">{quote.quote_number}</p>
                        <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded">${quote.qProfit.toFixed(2)}</span>
                      </div>
                      <p className="text-sm text-gray-600">Customer: {quote.customers?.name || "Unknown"}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ====== SECTION 5: DEAL PIPELINE SNAPSHOT ====== */}
      <section>
        <h2 className="text-2xl font-semibold text-gray-900 mb-6">Deal Pipeline Snapshot</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          <div className="table-container">
            <div className="px-6 py-6">
              <p className="text-sm text-gray-600 mb-2">Open Deals</p>
              <p className="text-3xl font-semibold text-gray-900">{stats.openDeals}</p>
            </div>
          </div>

          <div className="table-container">
            <div className="px-6 py-6">
              <p className="text-sm text-gray-600 mb-2">In Negotiation</p>
              <p className="text-3xl font-semibold text-gray-900">{stats.negotiationDeals}</p>
            </div>
          </div>

          <div className="table-container">
            <div className="px-6 py-6">
              <p className="text-sm text-gray-600 mb-2">Won Deals</p>
              <p className="text-3xl font-semibold text-gray-900">{stats.wonDeals}</p>
            </div>
          </div>

          <div className="table-container">
            <div className="px-6 py-6">
              <p className="text-sm text-gray-600 mb-2">Lost Deals</p>
              <p className="text-3xl font-semibold text-gray-900">{stats.lostDeals}</p>
            </div>
          </div>

          <div className="table-container">
            <div className="px-6 py-6">
              <p className="text-sm text-gray-600 mb-2">Pipeline Value</p>
              <p className="text-3xl font-semibold text-gray-900">${stats.pipelineValue.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ====== SECTION 6: RECENT ACTIVITY ====== */}
      <section>
        <h2 className="text-2xl font-semibold text-gray-900 mb-6">Recent Activity</h2>
        <div className="table-container">
          <div className="px-6 py-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Recently Created Quotes</h3>
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
      </section>
    </div>
  );
}
