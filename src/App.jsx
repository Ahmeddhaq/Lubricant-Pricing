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
    <div className="p-6 grid gap-6">
      <h1 className="text-2xl font-bold">Lubricant Pricing Dashboard</h1>

      <div className="border rounded-lg p-4">
        <div className="grid grid-cols-2 gap-4">
          <input
            type="number"
            value={cost}
            onChange={(e) => setCost(parseFloat(e.target.value))}
            placeholder="Cost per Liter"
            className="border rounded px-3 py-2"
          />
          <input
            type="number"
            value={margin}
            onChange={(e) => setMargin(parseFloat(e.target.value))}
            placeholder="Margin"
            className="border rounded px-3 py-2"
          />
          <input
            type="number"
            value={freight}
            onChange={(e) => setFreight(parseFloat(e.target.value))}
            placeholder="Freight"
            className="border rounded px-3 py-2"
          />
          <input
            type="number"
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            placeholder="Volume"
            className="border rounded px-3 py-2"
          />

      <div className="grid grid-cols-3 gap-4">
        <div className="border rounded-lg p-4">
          <p>Price / L</p>
          <h2 className="text-xl font-bold">{price.toFixed(2)}</h2>
        </div>

        <div className="border rounded-lg p-4">
          <p>Revenue</p>
          <h2 className="text-xl font-bold">{revenue.toFixed(0)}</h2>
        </div>

        <div className="border rounded-lg p-4">
          <p>Profit</p>
          <h2 className="text-xl font-bold">{profit.toFixed(0)}</h2>
        </div>
      </div>

      <button onClick={() => alert("Export quote coming next version")} className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">Generate Quote</button>
    </div>
  );
}

