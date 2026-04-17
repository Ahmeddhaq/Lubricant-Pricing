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
              <p className="metric-value">${stats.totalRevenue.toLocaleString()}</p>
            </div>
          </div>

          {/* Total Cost */}
          <div className="metric-card">
            <div className="content-row-stack">
              <p className="metric-label">Total Cost</p>
              <p className="metric-value">${stats.totalCost.toLocaleString()}</p>
            </div>
          </div>

          {/* Gross Profit */}
          <div className="metric-card">
            <div className="content-row-stack">
              <p className="metric-label">Gross Profit</p>
              <p className="metric-value">${stats.grossProfit.toLocaleString()}</p>
            </div>
          </div>

          {/* Profit Margin */}
          <div className="metric-card">
            <div className="content-row-stack">
              <p className="metric-label">Profit Margin %</p>
              <p className="metric-value">{stats.profitMargin.toFixed(1)}%</p>
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
              <p className="metric-label">Containers Shipped (20FT)</p>
              <p className="metric-value">{stats.containersShipped.teu20}</p>
            </div>
          </div>

          {/* Containers - 40FT */}
          <div className="metric-card">
            <div className="content-row-stack">
              <p className="metric-label">Containers Shipped (40FT)</p>
              <p className="metric-value">{stats.containersShipped.teu40}</p>
            </div>
          </div>

          {/* Avg Profit per Container */}
          <div className="metric-card">
            <div className="content-row-stack">
              <p className="metric-label">Avg Profit/Container</p>
              <p className="metric-value">${stats.avgProfitPerContainer.toLocaleString()}</p>
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
              <p className="metric-value content-value-lg">—</p>
              <p className="metric-caption">Data pending</p>
            </div>
          </div>

          <div className="metric-card">
            <div className="content-row-stack">
              <p className="metric-label">Additive Cost %</p>
              <p className="metric-value content-value-lg">—</p>
              <p className="metric-caption">Data pending</p>
            </div>
          </div>

          <div className="metric-card">
            <div className="content-row-stack">
              <p className="metric-label">Packaging Cost</p>
              <p className="metric-value content-value-lg">—</p>
              <p className="metric-caption">Data pending</p>
            </div>
          </div>

          <div className="metric-card">
            <div className="content-row-stack">
              <p className="metric-label">Logistics Cost</p>
              <p className="metric-value content-value-lg">—</p>
              <p className="metric-caption">Data pending</p>
            </div>
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
      </section>
    </div>
  );
}
