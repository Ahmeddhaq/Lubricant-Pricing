import React, { useState, useEffect } from "react";
import {
  quotesService,
  quoteItemsService,
  skusService,
  customersService,
  costingEngine,
  costSnapshotsService,
} from "../services/supabaseService";

export default function QuoteBuilder() {
  const [quotes, setQuotes] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [skus, setSkus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("list");
  const [selectedQuote, setSelectedQuote] = useState(null);

  // Quote Form State
  const [quoteForm, setQuoteForm] = useState({
    customer_id: "",
    payment_terms: "30% Advance, 70% Against BL",
    delivery_days: 15,
    notes: "",
  });

  // Quote Items
  const [quoteItems, setQuoteItems] = useState([]);
  const [selectedSku, setSelectedSku] = useState("");
  const [itemQuantity, setItemQuantity] = useState("");
  const [itemMargin, setItemMargin] = useState(25);

  // New Customer Form
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: "",
    email: "",
    phone: "",
    country: "",
    contact_person: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [quotesData, customersData, skusData] = await Promise.all([
        quotesService.getAll(),
        customersService.getAll(),
        skusService.getAll(),
      ]);
      setQuotes(quotesData);
      setCustomers(customersData);
      setSkus(skusData);
    } catch (err) {
      console.error("Error loading data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCustomer = async (e) => {
    e.preventDefault();
    try {
      const created = await customersService.create(newCustomer);
      setCustomers([...customers, created]);
      setQuoteForm({ ...quoteForm, customer_id: created.id });
      setNewCustomer({ name: "", email: "", phone: "", country: "", contact_person: "" });
      setShowNewCustomer(false);
      alert("Customer added!");
    } catch (err) {
      console.error("Error adding customer:", err);
      alert("Failed to add customer");
    }
  };

  const handleAddQuoteItem = async () => {
    if (!selectedSku || !itemQuantity) {
      alert("Please select SKU and enter quantity");
      return;
    }

    const sku = skus.find((s) => s.id === selectedSku);
    if (!sku) return;

    const costs = costingEngine.calculateTotalCostPerUnit(sku.recipes, sku);
    const unitPrice = costingEngine.calculateSellingPrice(costs.totalCost, itemMargin);

    setQuoteItems([
      ...quoteItems,
      {
        sku_id: selectedSku,
        sku_name: sku.name,
        quantity: parseInt(itemQuantity),
        unit_price: unitPrice,
        margin_percent: itemMargin,
        cost_per_unit: costs.totalCost,
        line_total: unitPrice * parseInt(itemQuantity),
      },
    ]);

    setSelectedSku("");
    setItemQuantity("");
    setItemMargin(25);
  };

  const handleRemoveQuoteItem = (index) => {
    setQuoteItems(quoteItems.filter((_, i) => i !== index));
  };

  const handleCreateQuote = async (e) => {
    e.preventDefault();
    if (!quoteForm.customer_id || quoteItems.length === 0) {
      alert("Please select customer and add items");
      return;
    }

    try {
      const quoteNumber = await quotesService.generateQuoteNumber();
      const totalAmount = quoteItems.reduce((sum, item) => sum + item.line_total, 0);

      const createdQuote = await quotesService.create({
        quote_number: quoteNumber,
        customer_id: quoteForm.customer_id,
        status: "draft",
        total_amount: totalAmount,
        payment_terms: quoteForm.payment_terms,
        delivery_days: parseInt(quoteForm.delivery_days),
        notes: quoteForm.notes,
        valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });

      // Add quote items and create cost snapshots
      for (const item of quoteItems) {
        const sku = skus.find((s) => s.id === item.sku_id);
        const costs = costingEngine.calculateTotalCostPerUnit(sku.recipes, sku);

        await quoteItemsService.addItem(
          createdQuote.id,
          item.sku_id,
          item.quantity,
          item.unit_price,
          item.margin_percent
        );

        // Create cost snapshot
        await costSnapshotsService.createSnapshot(item.sku_id, {
          ...costs,
        });
      }

      setQuoteForm({ customer_id: "", payment_terms: "30% Advance, 70% Against BL", delivery_days: 15, notes: "" });
      setQuoteItems([]);
      setActiveTab("list");
      await loadData();
      alert("Quote created successfully!");
    } catch (err) {
      console.error("Error creating quote:", err);
      alert("Failed to create quote");
    }
  };

  const handleSelectQuote = async (quote) => {
    setSelectedQuote(quote);
    setActiveTab("detail");
  };

  const calculateQuoteProfit = (quote) => {
    if (!quote || !quote.quote_items) return { totalCost: 0, totalProfit: 0, profitMargin: 0 };

    const totalCost = quote.quote_items.reduce(
      (sum, item) => sum + (item.quantity * (item.unit_price / (1 + (item.margin_percent || 0) / 100))),
      0
    );
    const totalProfit = quote.total_amount - totalCost;
    const profitMargin = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;

    return {
      totalCost: parseFloat(totalCost.toFixed(2)),
      totalProfit: parseFloat(totalProfit.toFixed(2)),
      profitMargin: parseFloat(profitMargin.toFixed(2)),
    };
  };

  if (loading) return <div className="p-6 text-center">Loading...</div>;

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h1 className="text-3xl font-bold mb-6">Quote Builder</h1>

      <div className="flex gap-4 mb-6">
        <button
          onClick={() => setActiveTab("list")}
          className={`px-4 py-2 rounded ${activeTab === "list" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
        >
          Quotes List
        </button>
        <button
          onClick={() => {
            setActiveTab("create");
            setQuoteForm({ customer_id: "", payment_terms: "30% Advance, 70% Against BL", delivery_days: 15, notes: "" });
            setQuoteItems([]);
          }}
          className={`px-4 py-2 rounded ${activeTab === "create" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
        >
          New Quote
        </button>
      </div>

      {/* LIST TAB */}
      {activeTab === "list" && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Recent Quotes</h2>
          {quotes.length === 0 ? (
            <p className="text-gray-500">No quotes found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-gray-100 border-b-2">
                  <tr>
                    <th className="p-3 text-left">Quote #</th>
                    <th className="p-3 text-left">Customer</th>
                    <th className="p-3 text-right">Amount</th>
                    <th className="p-3 text-left">Status</th>
                    <th className="p-3 text-left">Created</th>
                    <th className="p-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((quote) => (
                    <tr key={quote.id} className="border-b hover:bg-gray-50">
                      <td className="p-3 font-semibold">{quote.quote_number}</td>
                      <td className="p-3">{quote.customers?.name}</td>
                      <td className="p-3 text-right">${quote.total_amount?.toFixed(2)}</td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${quote.status === "draft" ? "bg-yellow-100 text-yellow-800" : "bg-green-100 text-green-800"}`}>
                          {quote.status}
                        </span>
                      </td>
                      <td className="p-3 text-sm text-gray-600">
                        {new Date(quote.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-3">
                        <button
                          onClick={() => handleSelectQuote(quote)}
                          className="bg-blue-500 text-white px-3 py-1 rounded text-sm"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* DETAIL TAB */}
      {activeTab === "detail" && selectedQuote && (
        <div>
          <button
            onClick={() => setActiveTab("list")}
            className="mb-4 px-4 py-2 bg-gray-200 rounded"
          >
            ← Back to Quotes
          </button>
          <div className="bg-gray-50 p-6 rounded-lg">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-2xl font-bold">{selectedQuote.quote_number}</h2>
                <p className="text-gray-600">{selectedQuote.customers?.name}</p>
              </div>
              <span
                className={`px-4 py-2 rounded font-semibold ${
                  selectedQuote.status === "draft"
                    ? "bg-yellow-100 text-yellow-800"
                    : "bg-green-100 text-green-800"
                }`}
              >
                {selectedQuote.status}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white p-4 rounded">
                <p className="text-sm text-gray-600">Total Amount</p>
                <p className="font-bold text-lg">${selectedQuote.total_amount?.toFixed(2)}</p>
              </div>
              <div className="bg-white p-4 rounded">
                <p className="text-sm text-gray-600">Items</p>
                <p className="font-bold text-lg">{selectedQuote.quote_items?.length}</p>
              </div>
              <div className="bg-white p-4 rounded">
                <p className="text-sm text-gray-600">Payment Terms</p>
                <p className="font-semibold text-sm">{selectedQuote.payment_terms}</p>
              </div>
              <div className="bg-white p-4 rounded">
                <p className="text-sm text-gray-600">Profit</p>
                <p className="font-bold text-lg text-green-600">
                  ${calculateQuoteProfit(selectedQuote).totalProfit.toFixed(2)}
                </p>
              </div>
            </div>

            <h3 className="text-lg font-bold mb-4">Quote Items</h3>
            {selectedQuote.quote_items?.length > 0 ? (
              <div className="bg-white p-4 rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b-2 bg-gray-50">
                    <tr>
                      <th className="p-2 text-left">Item</th>
                      <th className="p-2 text-right">Qty</th>
                      <th className="p-2 text-right">Unit Price</th>
                      <th className="p-2 text-right">Margin</th>
                      <th className="p-2 text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedQuote.quote_items.map((item, idx) => (
                      <tr key={idx} className="border-b">
                        <td className="p-2">{item.skus?.name}</td>
                        <td className="p-2 text-right">{item.quantity}</td>
                        <td className="p-2 text-right">${item.unit_price?.toFixed(2)}</td>
                        <td className="p-2 text-right">{item.margin_percent}%</td>
                        <td className="p-2 text-right font-semibold">
                          ${item.line_total?.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-500">No items in this quote</p>
            )}
          </div>
        </div>
      )}

      {/* CREATE TAB */}
      {activeTab === "create" && (
        <form onSubmit={handleCreateQuote} className="bg-gray-50 p-6 rounded-lg">
          <h2 className="text-xl font-bold mb-6">Create New Quote</h2>

          {/* Customer Section */}
          <div className="bg-white p-4 rounded-lg mb-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold">Customer</h3>
              <button
                type="button"
                onClick={() => setShowNewCustomer(!showNewCustomer)}
                className="text-blue-600 text-sm font-semibold"
              >
                {showNewCustomer ? "Use Existing" : "Add New"}
              </button>
            </div>

            {showNewCustomer ? (
              <form onSubmit={handleAddCustomer} className="space-y-3">
                <input
                  type="text"
                  placeholder="Company Name"
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  required
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="email"
                    placeholder="Email"
                    value={newCustomer.email}
                    onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                    className="border rounded px-3 py-2"
                  />
                  <input
                    type="text"
                    placeholder="Phone"
                    value={newCustomer.phone}
                    onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                    className="border rounded px-3 py-2"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Country"
                    value={newCustomer.country}
                    onChange={(e) => setNewCustomer({ ...newCustomer, country: e.target.value })}
                    className="border rounded px-3 py-2"
                  />
                  <input
                    type="text"
                    placeholder="Contact Person"
                    value={newCustomer.contact_person}
                    onChange={(e) =>
                      setNewCustomer({ ...newCustomer, contact_person: e.target.value })
                    }
                    className="border rounded px-3 py-2"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-green-600 text-white py-2 rounded"
                >
                  Add Customer & Continue
                </button>
              </form>
            ) : (
              <select
                value={quoteForm.customer_id}
                onChange={(e) => setQuoteForm({ ...quoteForm, customer_id: e.target.value })}
                className="w-full border rounded px-3 py-2"
                required
              >
                <option value="">Select Customer</option>
                {customers.map((cust) => (
                  <option key={cust.id} value={cust.id}>
                    {cust.name} ({cust.country})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Quote Details */}
          <div className="bg-white p-4 rounded-lg mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Payment Terms</label>
              <input
                type="text"
                value={quoteForm.payment_terms}
                onChange={(e) => setQuoteForm({ ...quoteForm, payment_terms: e.target.value })}
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Delivery Days</label>
              <input
                type="number"
                value={quoteForm.delivery_days}
                onChange={(e) => setQuoteForm({ ...quoteForm, delivery_days: e.target.value })}
                className="w-full border rounded px-3 py-2"
              />
            </div>
          </div>

          {/* Add Items Section */}
          <div className="bg-white p-4 rounded-lg mb-6">
            <h3 className="font-bold mb-4">Add Items to Quote</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
              <div>
                <label className="block text-sm font-semibold mb-2">SKU</label>
                <select
                  value={selectedSku}
                  onChange={(e) => setSelectedSku(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="">Select SKU</option>
                  {skus.map((sku) => (
                    <option key={sku.id} value={sku.id}>
                      {sku.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Qty</label>
                <input
                  type="number"
                  value={itemQuantity}
                  onChange={(e) => setItemQuantity(e.target.value)}
                  placeholder="0"
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Margin %</label>
                <input
                  type="number"
                  step="0.1"
                  value={itemMargin}
                  onChange={(e) => setItemMargin(parseFloat(e.target.value))}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleAddQuoteItem}
                  className="w-full bg-green-600 text-white rounded px-4 py-2"
                >
                  Add Item
                </button>
              </div>
            </div>

            {quoteItems.length > 0 && (
              <div className="mt-6 pt-6 border-t">
                <h4 className="font-semibold mb-3">Items in Quote:</h4>
                <div className="space-y-2">
                  {quoteItems.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center bg-gray-50 p-3 rounded">
                      <div>
                        <p className="font-semibold">{item.sku_name}</p>
                        <p className="text-sm text-gray-600">
                          {item.quantity} × ${item.unit_price.toFixed(2)} ({item.margin_percent}% margin)
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">${item.line_total.toFixed(2)}</p>
                        <button
                          type="button"
                          onClick={() => handleRemoveQuoteItem(idx)}
                          className="text-red-600 text-xs font-semibold"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 pt-4 border-t-2 flex justify-between text-lg font-bold">
                  <span>Total:</span>
                  <span className="text-green-600">
                    ${quoteItems.reduce((sum, item) => sum + item.line_total, 0).toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="mb-6">
            <label className="block text-sm font-semibold mb-2">Notes</label>
            <textarea
              value={quoteForm.notes}
              onChange={(e) => setQuoteForm({ ...quoteForm, notes: e.target.value })}
              placeholder="Any additional notes"
              rows="3"
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold"
          >
            Create Quote
          </button>
        </form>
      )}
    </div>
  );
}
