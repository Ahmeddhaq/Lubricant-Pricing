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
    <div>
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab("list")}
          className={`btn ${activeTab === "list" ? "btn-primary" : "btn-secondary"}`}
        >
          Quotes List
        </button>
        <button
          onClick={() => {
            setActiveTab("create");
            setQuoteForm({ customer_id: "", payment_terms: "30% Advance, 70% Against BL", delivery_days: 15, notes: "" });
            setQuoteItems([]);
          }}
          className={`btn ${activeTab === "create" ? "btn-primary" : "btn-secondary"}`}
        >
          New Quote
        </button>
      </div>

      {/* LIST TAB */}
      {activeTab === "list" && (
        <div>
          {quotes.length === 0 ? (
            <div className="table-container">
              <div className="px-6 py-12 text-center">
                <p className="text-gray-500">No quotes found.</p>
              </div>
            </div>
          ) : (
            <div className="table-container overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Quote #</th>
                    <th>Customer</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((quote) => (
                    <tr key={quote.id}>
                      <td className="font-semibold">{quote.quote_number}</td>
                      <td>{quote.customers?.name}</td>
                      <td className="font-semibold">${quote.total_amount?.toFixed(2)}</td>
                      <td>
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${quote.status === "draft" ? "bg-yellow-100 text-yellow-800" : "bg-green-100 text-green-800"}`}>
                          {quote.status}
                        </span>
                      </td>
                      <td className="text-gray-600">
                        {new Date(quote.created_at).toLocaleDateString()}
                      </td>
                      <td>
                        <button
                          onClick={() => handleSelectQuote(quote)}
                          className="btn btn-primary text-sm"
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
            className="btn btn-secondary mb-6"
          >
            ← Back to Quotes
          </button>
          <div className="table-container">
            <div className="px-6 py-6">
              <div className="flex justify-between items-start mb-6 pb-6 border-b border-gray-200">
                <div>
                  <h2 className="text-2xl font-semibold text-gray-900">{selectedQuote.quote_number}</h2>
                  <p className="text-gray-600 mt-1">{selectedQuote.customers?.name}</p>
                </div>
                <span
                  className={`px-4 py-2 rounded font-semibold text-sm ${
                    selectedQuote.status === "draft"
                      ? "bg-yellow-100 text-yellow-800"
                      : "bg-green-100 text-green-800"
                  }`}
                >
                  {selectedQuote.status}
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8 pb-8 border-b border-gray-200">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Total Amount</p>
                  <p className="text-2xl font-semibold text-gray-900">${selectedQuote.total_amount?.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Items</p>
                  <p className="text-2xl font-semibold text-gray-900">{selectedQuote.quote_items?.length}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Payment Terms</p>
                  <p className="font-semibold text-gray-900">{selectedQuote.payment_terms}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Profit</p>
                  <p className="text-2xl font-semibold text-green-700">
                    ${calculateQuoteProfit(selectedQuote).totalProfit.toFixed(2)}
                  </p>
                </div>
              </div>

              <h3 className="font-semibold text-gray-900 mb-4">Quote Items</h3>
              {selectedQuote.quote_items?.length > 0 ? (
                <table className="w-full">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Qty</th>
                      <th>Unit Price</th>
                      <th>Margin</th>
                      <th>Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedQuote.quote_items.map((item, idx) => (
                      <tr key={idx}>
                        <td>{item.skus?.name}</td>
                        <td>{item.quantity}</td>
                        <td>${item.unit_price?.toFixed(2)}</td>
                        <td>{item.margin_percent}%</td>
                        <td className="font-semibold">${item.line_total?.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-gray-500 py-4">No items in this quote</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CREATE TAB */}
      {activeTab === "create" && (
        <form onSubmit={handleCreateQuote} className="table-container">
          <div className="px-6 py-6">
            <h2 className="text-xl font-semibold mb-6 text-gray-900">Create New Quote</h2>

            {/* Customer Section */}
            <div className="border-b border-gray-200 mb-6 pb-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-gray-900">Customer</h3>
                <button
                  type="button"
                  onClick={() => setShowNewCustomer(!showNewCustomer)}
                  className="text-blue-600 text-sm font-semibold hover:text-blue-800"
                >
                  {showNewCustomer ? "Use Existing" : "Add New"}
                </button>
              </div>

              {showNewCustomer ? (
                <div className="space-y-4">
                  <div className="form-group mb-0">
                    <label>Company Name *</label>
                    <input
                      type="text"
                      placeholder="Company Name"
                      value={newCustomer.name}
                      onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="form-group mb-0">
                      <label>Email</label>
                      <input
                        type="email"
                        placeholder="Email"
                        value={newCustomer.email}
                        onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                      />
                    </div>
                    <div className="form-group mb-0">
                      <label>Phone</label>
                      <input
                        type="text"
                        placeholder="Phone"
                        value={newCustomer.phone}
                        onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="form-group mb-0">
                      <label>Country</label>
                      <input
                        type="text"
                        placeholder="Country"
                        value={newCustomer.country}
                        onChange={(e) => setNewCustomer({ ...newCustomer, country: e.target.value })}
                      />
                    </div>
                    <div className="form-group mb-0">
                      <label>Contact Person</label>
                      <input
                        type="text"
                        placeholder="Contact Person"
                        value={newCustomer.contact_person}
                        onChange={(e) =>
                          setNewCustomer({ ...newCustomer, contact_person: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddCustomer}
                    className="btn btn-primary w-full"
                  >
                    Add Customer & Continue
                  </button>
                </div>
              ) : (
                <div className="form-group mb-0">
                  <label>Select Customer *</label>
                  <select
                    value={quoteForm.customer_id}
                    onChange={(e) => setQuoteForm({ ...quoteForm, customer_id: e.target.value })}
                    required
                  >
                    <option value="">Select Customer</option>
                    {customers.map((cust) => (
                      <option key={cust.id} value={cust.id}>
                        {cust.name} ({cust.country})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Quote Details */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 pb-6 border-b border-gray-200">
              <div className="form-group mb-0">
                <label>Payment Terms</label>
                <input
                  type="text"
                  value={quoteForm.payment_terms}
                  onChange={(e) => setQuoteForm({ ...quoteForm, payment_terms: e.target.value })}
                />
              </div>
              <div className="form-group mb-0">
                <label>Delivery Days</label>
                <input
                  type="number"
                  value={quoteForm.delivery_days}
                  onChange={(e) => setQuoteForm({ ...quoteForm, delivery_days: e.target.value })}
                />
              </div>
            </div>

            {/* Add Items Section */}
            <div className="mb-6 pb-6 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-4">Add Items to Quote</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <div className="form-group mb-0">
                  <label>SKU</label>
                  <select
                    value={selectedSku}
                    onChange={(e) => setSelectedSku(e.target.value)}
                  >
                    <option value="">Select SKU</option>
                    {skus.map((sku) => (
                      <option key={sku.id} value={sku.id}>
                        {sku.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group mb-0">
                  <label>Qty</label>
                  <input
                    type="number"
                    value={itemQuantity}
                    onChange={(e) => setItemQuantity(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="form-group mb-0">
                  <label>Margin %</label>
                  <input
                    type="number"
                    step="0.1"
                    value={itemMargin}
                    onChange={(e) => setItemMargin(parseFloat(e.target.value))}
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={handleAddQuoteItem}
                    className="btn btn-primary w-full"
                  >
                    Add Item
                  </button>
                </div>
              </div>

              {quoteItems.length > 0 && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h4 className="font-semibold text-gray-900 mb-4">Items in Quote:</h4>
                  <div className="space-y-2 mb-4">
                    {quoteItems.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-gray-50 p-3 rounded border border-gray-200">
                        <div>
                          <p className="font-semibold text-gray-900">{item.sku_name}</p>
                          <p className="text-sm text-gray-600">
                            {item.quantity} × ${item.unit_price.toFixed(2)} ({item.margin_percent}% margin)
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-gray-900">${item.line_total.toFixed(2)}</p>
                          <button
                            type="button"
                            onClick={() => handleRemoveQuoteItem(idx)}
                            className="text-red-600 text-xs font-semibold hover:text-red-800"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-between text-lg font-semibold text-gray-900 py-3 border-t-2 border-gray-300">
                    <span>Total:</span>
                    <span className="text-green-700">
                      ${quoteItems.reduce((sum, item) => sum + item.line_total, 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="form-group mb-6">
              <label>Notes</label>
              <textarea
                value={quoteForm.notes}
                onChange={(e) => setQuoteForm({ ...quoteForm, notes: e.target.value })}
                placeholder="Any additional notes"
                rows="3"
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary w-full py-2"
            >
              Create Quote
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
