import React, { useState, useEffect } from "react";
import { jsPDF } from "jspdf";

export default function PricingApp() {
  const [selectedSKU, setSelectedSKU] = useState("5W30");
  const [cost, setCost] = useState(5);
  const [margin, setMargin] = useState(0.25);
  const [freight, setFreight] = useState(2500);
  const [volume, setVolume] = useState(24000);
  const [formulations, setFormulations] = useState([]);
  const [pricingData, setPricingData] = useState([]);
  const [skuList, setSkuList] = useState([]);

  // Fetch data from server every 5 seconds
  useEffect(() => {
    const fetchData = () => {
      fetch("http://localhost:3001/api/data")
        .then(res => res.json())
        .then(data => {
          setFormulations(data.cost);
          setPricingData(data.pricing);
          
          // Extract unique SKUs
          const skus = [...new Set(data.cost.map(item => item.SKU))];
          setSkuList(skus);

          // Auto-load cost for selected SKU
          const skuData = data.cost.filter(item => item.SKU === selectedSKU);
          if (skuData.length > 0) {
            const totalFormulationCost = skuData.reduce((sum, item) => sum + (item.Contribution || 0), 0);
            setCost(totalFormulationCost);
          }
        })
        .catch(err => console.error("Error fetching data:", err));
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [selectedSKU]);

  const price = cost / (1 - margin);
  const revenue = price * volume;
  const totalCost = cost * volume + freight;
  const profit = revenue - totalCost;

  // Generate PDF Quote
  const generateQuote = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageMargin = 10;
    let yPos = pageMargin;

    // Title
    doc.setFontSize(16);
    doc.text("LUBRICANT QUOTATION", pageWidth / 2, yPos, { align: "center" });
    yPos += 15;

    // Date
    doc.setFontSize(10);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, pageMargin, yPos);
    yPos += 10;

    // Product Details
    doc.setFontSize(12);
    doc.text("Product Details", pageMargin, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.text(`SKU: ${selectedSKU}`, pageMargin + 5, yPos);
    yPos += 7;

    // Formulation Breakdown
    const skuFormulation = formulations.filter(item => item.SKU === selectedSKU);
    if (skuFormulation.length > 0) {
      doc.text("Formulation Components:", pageMargin + 5, yPos);
      yPos += 6;
      skuFormulation.forEach(item => {
        doc.setFontSize(9);
        doc.text(`  • ${item.Component}: ${(item["%"] * 100).toFixed(1)}% - Cost: ${item.Cost} - Contribution: ${item.Contribution}`, pageMargin + 10, yPos);
        yPos += 5;
      });
      yPos += 3;
    }

    // Pricing Details
    doc.setFontSize(12);
    doc.text("Pricing & Calculation", pageMargin, yPos);
    yPos += 8;

    const details = [
      [`Cost per Liter: `, `${cost.toFixed(2)}`],
      [`Margin: `, `${(margin * 100).toFixed(1)}%`],
      [`Selling Price / L: `, `${price.toFixed(2)}`],
      [`Volume (Liters): `, `${volume.toLocaleString()}`],
      [`Freight Cost: `, `${freight.toFixed(2)}`],
      [`Total Cost: `, `${totalCost.toFixed(2)}`],
      [`Revenue: `, `${revenue.toFixed(2)}`],
      [`Profit: `, `${profit.toFixed(2)}`],
    ];

    doc.setFontSize(10);
    details.forEach(([label, value]) => {
      doc.text(label, pageMargin + 5, yPos);
      doc.text(value, pageWidth - pageMargin - 20, yPos, { align: "right" });
      yPos += 7;
    });

    yPos += 5;

    // Market Prices
    const skuMarkets = pricingData.filter(item => item.SKU === selectedSKU);
    if (skuMarkets.length > 0) {
      doc.setFontSize(12);
      doc.text("Market Reference Prices", pageMargin, yPos);
      yPos += 8;

      doc.setFontSize(10);
      skuMarkets.forEach(market => {
        doc.text(`${market.Market}: ${market.Price} ${market.Currency}`, pageMargin + 5, yPos);
        yPos += 6;
      });
    }

    yPos += 5;

    // Footer
    doc.setFontSize(9);
    doc.text("Generated from Lubricant Pricing Dashboard", pageMargin, doc.internal.pageSize.getHeight() - 10);

    // Download
    doc.save(`quotation_${selectedSKU}_${Date.now()}.pdf`);
  };

  return (
    <div className="p-6 grid gap-6">
      <h1 className="text-2xl font-bold">Lubricant Pricing Dashboard</h1>

      <div className="border rounded-lg p-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-semibold mb-2 block">Select SKU</label>
            <select
              value={selectedSKU}
              onChange={(e) => setSelectedSKU(e.target.value)}
              className="border rounded px-3 py-2 w-full"
            >
              {skuList.map(sku => (
                <option key={sku} value={sku}>{sku}</option>
              ))}
            </select>
          </div>
          <div></div>
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
        </div>
      </div>

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

      <button onClick={generateQuote} className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">Generate PDF Quote</button>
    </div>
  );
}

