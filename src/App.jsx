import React, { useState } from "react";

export default function PricingApp() {
  const [cost, setCost] = useState(5);
  const [margin, setMargin] = useState(0.25);
  const [freight, setFreight] = useState(2500);
  const [volume, setVolume] = useState(24000);

  const price = cost / (1 - margin);
  const revenue = price * volume;
  const totalCost = cost * volume + freight;
  const profit = revenue - totalCost;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Lubricant Pricing Dashboard</h1>
        <p className="text-gray-600 mb-8">Calculate pricing and profitability analysis</p>

        {/* Input Section */}
        <div className="bg-white rounded-lg shadow-md p-8 mb-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-6">Input Parameters</h2>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Cost per Liter</label>
              <input
                type="number"
                value={cost}
                onChange={(e) => setCost(parseFloat(e.target.value))}
                placeholder="e.g., 5"
                className="border border-gray-300 rounded-lg px-4 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Margin (0-1)</label>
              <input
                type="number"
                value={margin}
                onChange={(e) => setMargin(parseFloat(e.target.value))}
                placeholder="e.g., 0.25"
                className="border border-gray-300 rounded-lg px-4 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Freight Cost</label>
              <input
                type="number"
                value={freight}
                onChange={(e) => setFreight(parseFloat(e.target.value))}
                placeholder="e.g., 2500"
                className="border border-gray-300 rounded-lg px-4 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Volume (Liters)</label>
              <input
                type="number"
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                placeholder="e.g., 24000"
                className="border border-gray-300 rounded-lg px-4 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Results Section */}
        <div className="grid grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-blue-500">
            <p className="text-gray-600 text-sm font-medium mb-2">Price / Liter</p>
            <h2 className="text-3xl font-bold text-blue-600">₹{price.toFixed(2)}</h2>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-green-500">
            <p className="text-gray-600 text-sm font-medium mb-2">Total Revenue</p>
            <h2 className="text-3xl font-bold text-green-600">₹{revenue.toFixed(0)}</h2>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-purple-500">
            <p className="text-gray-600 text-sm font-medium mb-2">Total Profit</p>
            <h2 className="text-3xl font-bold text-purple-600">₹{profit.toFixed(0)}</h2>
          </div>
        </div>

        {/* Action Button */}
        <button 
          onClick={() => alert("Export quote coming next version")} 
          className="w-full bg-blue-600 text-white font-semibold px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors duration-200 shadow-md"
        >
          Generate Quote
        </button>
      </div>
    </div>
  );
}

