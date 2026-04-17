import React, { useState, useEffect } from "react";
import { quotesService, skusService, costSnapshotsService, costingEngine } from "../services/supabaseService";

export default function Dashboard() {
  const [quotes, setQuotes] = useState([]);
  const [skus, setSkus] = useState([]);
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalProfit: 0,
    totalCost: 0,
    profitMargin: 0,
    avgMargin: 0,
    topSkus: [],
    recentQuotes: [],
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
    const skuCounts = {};

    quotesData.forEach((quote) => {
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
              skuProfits[skuId] = { profit: 0, revenue: 0, cost: 0, count: 0, name: sku.name };
              skuCounts[skuId] = 0;
            }
            skuProfits[skuId].revenue += item.line_total || 0;
            skuProfits[skuId].cost += itemCost;
            skuProfits[skuId].profit = skuProfits[skuId].revenue - skuProfits[skuId].cost;
            skuProfits[skuId].count += item.quantity;
            skuCounts[skuId]++;
          }
        });
      }
    });

    const totalProfit = totalRevenue - totalCost;
    const profitMargin = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;

    // Get top SKUs
    const topSkus = Object.values(skuProfits)
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 5);

    const avgMargin = topSkus.length > 0
      ? topSkus.reduce((sum, s) => sum + ((s.profit / s.cost) * 100 || 0), 0) / topSkus.length
      : 0;

    setStats({
      totalRevenue: parseFloat(totalRevenue.toFixed(2)),
      totalProfit: parseFloat(totalProfit.toFixed(2)),
      totalCost: parseFloat(totalCost.toFixed(2)),
      profitMargin: parseFloat(profitMargin.toFixed(2)),
      avgMargin: parseFloat(avgMargin.toFixed(2)),
      topSkus: topSkus,
      recentQuotes: quotesData.slice(0, 10),
    });
  };

  if (loading) return <div className="p-6 text-center">Loading...</div>;

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h1 className="text-3xl font-bold mb-6">Dashboard</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-6 rounded-lg">
          <p className="text-sm opacity-90">Total Revenue</p>
          <p className="text-3xl font-bold">${stats.totalRevenue.toLocaleString()}</p>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 text-white p-6 rounded-lg">
          <p className="text-sm opacity-90">Total Profit</p>
          <p className="text-3xl font-bold">${stats.totalProfit.toLocaleString()}</p>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white p-6 rounded-lg">
          <p className="text-sm opacity-90">Profit Margin</p>
          <p className="text-3xl font-bold">{stats.profitMargin.toFixed(1)}%</p>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white p-6 rounded-lg">
          <p className="text-sm opacity-90">Avg Margin</p>
          <p className="text-3xl font-bold">{stats.avgMargin.toFixed(1)}%</p>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Top SKUs */}
        <div className="bg-gray-50 p-6 rounded-lg">
          <h2 className="text-xl font-bold mb-4">Top Performing SKUs</h2>
          {stats.topSkus.length === 0 ? (
            <p className="text-gray-500">No data available</p>
          ) : (
            <div className="space-y-3">
              {stats.topSkus.map((sku, idx) => (
                <div key={idx} className="bg-white p-4 rounded-lg border-l-4 border-green-500">
                  <div className="flex justify-between items-start mb-2">
                    <p className="font-semibold">{sku.name}</p>
                    <span className="text-sm bg-green-100 text-green-800 px-2 py-1 rounded">
                      #{idx + 1}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-gray-600">Revenue</p>
                      <p className="font-bold">${sku.revenue.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Profit</p>
                      <p className="font-bold text-green-600">${sku.profit.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Units</p>
                      <p className="font-bold">{sku.count}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cost Breakdown */}
        <div className="bg-gray-50 p-6 rounded-lg">
          <h2 className="text-xl font-bold mb-4">Financial Summary</h2>
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-lg">
              <div className="flex justify-between mb-2">
                <span className="text-gray-700">Total Revenue</span>
                <span className="font-bold">${stats.totalRevenue.toFixed(2)}</span>
              </div>
              <div className="w-full bg-gray-200 rounded h-2"></div>
            </div>

            <div className="bg-white p-4 rounded-lg">
              <div className="flex justify-between mb-2">
                <span className="text-gray-700">Total Cost</span>
                <span className="font-bold">${stats.totalCost.toFixed(2)}</span>
              </div>
              <div className="flex">
                <div
                  className="bg-red-500 h-2 rounded-l"
                  style={{
                    width: `${stats.totalCost > 0 ? (stats.totalCost / stats.totalRevenue) * 100 : 0}%`,
                  }}
                ></div>
              </div>
            </div>

            <div className="bg-green-50 p-4 rounded-lg border-2 border-green-500">
              <div className="flex justify-between">
                <span className="text-gray-700 font-semibold">Gross Profit</span>
                <span className="font-bold text-green-600 text-lg">${stats.totalProfit.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Quotes Table */}
      <div className="bg-gray-50 p-6 rounded-lg">
        <h2 className="text-xl font-bold mb-4">Recent Quotes</h2>
        {stats.recentQuotes.length === 0 ? (
          <p className="text-gray-500">No quotes available</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white border-b-2">
                <tr>
                  <th className="p-3 text-left">Quote #</th>
                  <th className="p-3 text-left">Customer</th>
                  <th className="p-3 text-right">Amount</th>
                  <th className="p-3 text-left">Status</th>
                  <th className="p-3 text-left">Date</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentQuotes.map((quote) => (
                  <tr key={quote.id} className="bg-white border-b hover:bg-gray-50">
                    <td className="p-3 font-semibold">{quote.quote_number}</td>
                    <td className="p-3">{quote.customers?.name || "-"}</td>
                    <td className="p-3 text-right font-semibold">
                      ${quote.total_amount?.toFixed(2) || "0.00"}
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-1 rounded text-xs font-semibold ${
                          quote.status === "draft"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-green-100 text-green-800"
                        }`}
                      >
                        {quote.status}
                      </span>
                    </td>
                    <td className="p-3 text-gray-600">
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
  );
}
