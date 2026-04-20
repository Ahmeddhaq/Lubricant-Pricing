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

  // ====== QUOTE HEADER SECTION ======
  const [quoteHeader, setQuoteHeader] = useState({
    quoteNumber: "", // auto-generated
    date: new Date().toISOString().split('T')[0],
    customerName: "",
    customerId: "",
    country: "",
    market: "",
    salesperson: "",
    currency: "USD",
  });

  // ====== PRODUCT SELECTION SECTION ======
  const [lineItems, setLineItems] = useState([]);
  const [selectedSku, setSelectedSku] = useState("");
  const [packType, setPackType] = useState("1L");
  const [quantity, setQuantity] = useState("");
  const [itemDiscount, setItemDiscount] = useState(0);

  // ====== PRICING LOGIC SECTION ======
  const [pricingOverrides, setPricingOverrides] = useState({
    marketPricing: {},
    customerPricing: {},
    manualDiscounts: {},
  });

  // ====== SHIPMENT DETAILS SECTION ======
  const [shipmentDetails, setShipmentDetails] = useState({
    totalVolume: 0,
    containerType: "20FT",
    freightCost: 0,
    incoterm: "FOB",
  });

  // ====== CREDIT TERMS SECTION ======
  const [creditTerms, setCreditTerms] = useState({
    paymentTerms: "Cash",
    creditDays: 0,
    creditCostPercentage: 0,
  });

  // ====== STATUS MANAGEMENT SECTION ======
  const [quoteStatus, setQuoteStatus] = useState("Draft");

  // ====== AUDIT & HISTORY SECTION ======
  const [auditHistory, setAuditHistory] = useState([
    {
      timestamp: new Date().toLocaleString(),
      action: "Quote created",
      user: "Current User",
      details: "",
    },
  ]);

  // New Customer Form
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [customerError, setCustomerError] = useState("");
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

  // ====== HELPERS ======
  const calculateLineTotal = (item) => {
    const basePrice = item.pricePerUnit || 0;
    const discountAmount = (basePrice * item.discountPercentage) / 100;
    const finalPrice = basePrice - discountAmount;
    return finalPrice * item.quantity;
  };

  const calculateTotalProductValue = () => {
    return lineItems.reduce((sum, item) => sum + calculateLineTotal(item), 0);
  };

  const calculateTotalCost = () => {
    return lineItems.reduce((sum, item) => sum + (item.costPerUnit * item.quantity), 0);
  };

  const calculateTotalInvoiceValue = () => {
    return calculateTotalProductValue() + shipmentDetails.freightCost;
  };

  const calculateCreditCostImpact = () => {
    if (creditTerms.paymentTerms === "Cash") return 0;
    const daysCredit = parseInt(creditTerms.creditDays) || 0;
    const percentage = creditTerms.creditCostPercentage || 0;
    return (calculateTotalInvoiceValue() * percentage * daysCredit) / 36500; // Simple daily interest
  };

  const calculateEstimatedProfit = () => {
    return calculateTotalInvoiceValue() - calculateTotalCost() - calculateCreditCostImpact();
  };

  const calculateProfitPerLiter = () => {
    if (shipmentDetails.totalVolume === 0) return 0;
    return calculateEstimatedProfit() / shipmentDetails.totalVolume;
  };

  const calculateProfitPerContainer = () => {
    if (shipmentDetails.containerType === "20FT") return calculateEstimatedProfit() / 1;
    if (shipmentDetails.containerType === "40FT") return calculateEstimatedProfit() / 1;
    return calculateEstimatedProfit();
  };

  const handleAddLineItem = () => {
    if (!selectedSku || !quantity) {
      alert("Please select SKU and enter quantity");
      return;
    }

    const sku = skus.find((s) => s.id === selectedSku);
    if (!sku) return;

    const costs = costingEngine.calculateTotalCostPerUnit(sku.recipes, sku);
    const newItem = {
      id: `item-${Date.now()}`,
      skuId: selectedSku,
      skuName: sku.name,
      packType: packType,
      quantity: parseFloat(quantity),
      pricePerUnit: sku.current_selling_price || costs.totalCost,
      costPerUnit: costs.totalCost,
      discountPercentage: parseFloat(itemDiscount) || 0,
    };

    setLineItems([...lineItems, newItem]);
    setSelectedSku("");
    setQuantity("");
    setItemDiscount(0);
    setPackType("1L");

    // Add audit entry
    setAuditHistory([
      ...auditHistory,
      {
        timestamp: new Date().toLocaleString(),
        action: "Line item added",
        user: "Current User",
        details: `${newItem.skuName} - ${newItem.quantity} units`,
      },
    ]);
  };

  const handleRemoveLineItem = (itemId) => {
    const item = lineItems.find((i) => i.id === itemId);
    setLineItems(lineItems.filter((i) => i.id !== itemId));
    setAuditHistory([
      ...auditHistory,
      {
        timestamp: new Date().toLocaleString(),
        action: "Line item removed",
        user: "Current User",
        details: item?.skuName || "Unknown SKU",
      },
    ]);
  };

  const handleAddCustomer = async (e) => {
    e.preventDefault();
    try {
      setCustomerError("");

      const customerName = newCustomer.name.trim();
      if (!customerName) {
        setCustomerError("Customer name is required.");
        return;
      }

      const payload = {
        name: customerName,
        email: newCustomer.email.trim(),
        phone: newCustomer.phone.trim(),
        country: newCustomer.country.trim(),
        contact_person: newCustomer.contact_person.trim(),
      };

      const created = await customersService.create(payload);
      setCustomers([...customers, created]);
      setQuoteHeader({ ...quoteHeader, customerId: created.id, customerName: created.name, country: created.country });
      setNewCustomer({ name: "", email: "", phone: "", country: "", contact_person: "" });
      setShowNewCustomer(false);
      alert("Customer added!");
    } catch (err) {
      console.error("Error adding customer:", err);
      if (err?.code === "42501" || /row-level security/i.test(err?.message || "")) {
        setCustomerError("Supabase blocked this save because the customers table needs an authenticated insert policy.");
      } else {
        setCustomerError(err?.message || "Failed to add customer.");
      }
    }
  };

  const handleCreateQuote = async (e) => {
    e.preventDefault();
    if (!quoteHeader.customerId || lineItems.length === 0) {
      alert("Please select customer and add line items");
      return;
    }

    try {
      const quoteNumber = await quotesService.generateQuoteNumber();
      const totalAmount = calculateTotalInvoiceValue();

      const createdQuote = await quotesService.create({
        quote_number: quoteNumber,
        customer_id: quoteHeader.customerId,
        status: quoteStatus.toLowerCase(),
        total_amount: totalAmount,
        payment_terms: creditTerms.paymentTerms,
        delivery_days: 15,
        market: quoteHeader.market,
        salesperson: quoteHeader.salesperson,
        currency: quoteHeader.currency,
        container_type: shipmentDetails.containerType,
        freight_cost: shipmentDetails.freightCost,
        incoterm: shipmentDetails.incoterm,
      });

      // Add line items
      for (const item of lineItems) {
        const sku = skus.find((s) => s.id === item.skuId);
        const costs = costingEngine.calculateTotalCostPerUnit(sku.recipes, sku);

        await quoteItemsService.addItem(
          createdQuote.id,
          item.skuId,
          item.quantity,
          item.pricePerUnit,
          ((item.pricePerUnit - item.costPerUnit) / item.costPerUnit) * 100
        );

        await costSnapshotsService.createSnapshot(item.skuId, costs);
      }

      // Reset form
      setQuoteHeader({
        quoteNumber: "",
        date: new Date().toISOString().split('T')[0],
        customerName: "",
        customerId: "",
        country: "",
        market: "",
        salesperson: "",
        currency: "USD",
      });
      setLineItems([]);
      setShipmentDetails({ totalVolume: 0, containerType: "20FT", freightCost: 0, incoterm: "FOB" });
      setCreditTerms({ paymentTerms: "Cash", creditDays: 0, creditCostPercentage: 0 });
      setQuoteStatus("Draft");
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

  if (loading) return <div className="p-6 text-center">Loading...</div>;

  return (
    <div className="page-stack">
      {/* ====== QUOTE LIST SECTION ====== */}
      <section className="page-section">
        <div className="section-toolbar">
          <h2 className="section-title">Quotations</h2>
          <button
            onClick={() => setActiveTab("create")}
            className="btn btn-primary"
          >
            + Create New Quote
          </button>
        </div>

        {activeTab === "list" && (
          <div>
            {quotes.length === 0 ? (
              <div className="content-card">
                <div className="px-6 py-12 text-center">
                  <p className="text-gray-500">No quotes found. Create one to get started.</p>
                </div>
              </div>
            ) : (
              <div className="table-container">
                <div className="overflow-x-auto">
                  <table>
                    <thead>
                      <tr>
                        <th>Quote #</th>
                        <th>Customer</th>
                        <th>Total Amount</th>
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
                          <td className="text-right font-semibold">${quote.total_amount?.toFixed(2)}</td>
                          <td>
                            <span className={`px-2 py-1 rounded text-xs font-semibold ${
                              quote.status === "draft"
                                ? "bg-gray-100 text-gray-800"
                                : quote.status === "won"
                                ? "bg-gray-100 text-gray-800"
                                : "bg-gray-100 text-gray-800"
                            }`}>
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
              </div>
            )}
          </div>
        )}
      </section>

      {/* ====== DETAIL VIEW SECTIONS ====== */}
      {activeTab === "detail" && selectedQuote && (
        <section className="page-section">
          <button
            onClick={() => setActiveTab("list")}
            className="btn btn-secondary mb-6"
          >
            ← Back to Quotes
          </button>

          {/* ====== SECTION 1: QUOTE HEADER ====== */}
          <div className="content-card">
            <div className="content-row-stack">
              <h2 className="section-title">Quote Header</h2>
              <div className="metric-grid metric-grid-3">
                <div className="content-card-compact">
                  <p className="text-sm text-gray-600 mb-1">Quote Number</p>
                  <p className="text-lg font-semibold text-gray-900">{selectedQuote.quote_number}</p>
                </div>
                <div className="content-card-compact">
                  <p className="text-sm text-gray-600 mb-1">Date</p>
                  <p className="text-lg font-semibold text-gray-900">{new Date(selectedQuote.created_at).toLocaleDateString()}</p>
                </div>
                <div className="content-card-compact">
                  <p className="text-sm text-gray-600 mb-1">Customer Name</p>
                  <p className="text-lg font-semibold text-gray-900">{selectedQuote.customers?.name}</p>
                </div>
                <div className="content-card-compact">
                  <p className="text-sm text-gray-600 mb-1">Country / Market</p>
                  <p className="text-lg font-semibold text-gray-900">{selectedQuote.customers?.country || "—"}</p>
                </div>
                <div className="content-card-compact">
                  <p className="text-sm text-gray-600 mb-1">Salesperson</p>
                  <p className="text-lg font-semibold text-gray-900">{selectedQuote.salesperson || "—"}</p>
                </div>
                <div className="content-card-compact">
                  <p className="text-sm text-gray-600 mb-1">Currency</p>
                  <p className="text-lg font-semibold text-gray-900">USD</p>
                </div>
              </div>
            </div>
          </div>

          {/* ====== SECTION 2: PRODUCT SELECTION (MULTI-SKU) ====== */}
          <div className="content-card">
            <div className="content-row-stack">
              <h2 className="section-title">Product Selection</h2>
              {selectedQuote.quote_items?.length > 0 ? (
                <div className="overflow-x-auto">
                  <table>
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>Pack Type</th>
                        <th>Quantity</th>
                        <th>Price/Unit</th>
                        <th>Discount %</th>
                        <th>Total Line Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedQuote.quote_items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="font-semibold">{item.skus?.name}</td>
                          <td>1L</td>
                          <td className="text-right">{item.quantity}</td>
                          <td className="text-right">${item.unit_price?.toFixed(2)}</td>
                          <td className="text-right">0%</td>
                          <td className="text-right font-semibold">${(item.quantity * (item.unit_price || 0)).toFixed(2)}</td>
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

          {/* ====== SECTION 4: SHIPMENT DETAILS ====== */}
          <div className="content-card">
            <div className="content-row-stack">
              <h2 className="section-title">Shipment Details</h2>
              <div className="metric-grid metric-grid-4">
                <div className="content-card-compact">
                  <p className="text-sm text-gray-600 mb-2">Total Volume (Liters)</p>
                  <p className="text-2xl font-semibold text-gray-900">—</p>
                </div>
                <div className="content-card-compact">
                  <p className="text-sm text-gray-600 mb-2">Container Type</p>
                  <p className="text-lg font-semibold text-gray-900">{selectedQuote.container_type || "20FT"}</p>
                </div>
                <div className="content-card-compact">
                  <p className="text-sm text-gray-600 mb-2">Freight Cost</p>
                  <p className="text-2xl font-semibold text-gray-900">${(selectedQuote.freight_cost || 0).toFixed(2)}</p>
                </div>
                <div className="content-card-compact">
                  <p className="text-sm text-gray-600 mb-2">Incoterm</p>
                  <p className="text-lg font-semibold text-gray-900">{selectedQuote.incoterm || "FOB"}</p>
                </div>
              </div>
            </div>
          </div>

          {/* ====== SECTION 5: FINANCIAL SUMMARY ====== */}
          <div className="content-card">
            <div className="content-row-stack">
              <h2 className="section-title">Financial Summary</h2>
              <div className="metric-grid metric-grid-4">
                <div className="content-card-compact">
                  <p className="text-sm text-gray-600 mb-2">Total Product Value</p>
                  <p className="text-2xl font-semibold text-gray-900">${selectedQuote.total_amount?.toFixed(2)}</p>
                </div>
                <div className="content-card-compact">
                  <p className="text-sm text-gray-600 mb-2">Freight</p>
                  <p className="text-2xl font-semibold text-gray-900">${(selectedQuote.freight_cost || 0).toFixed(2)}</p>
                </div>
                <div className="content-card-compact">
                  <p className="text-sm text-gray-600 mb-2">Total Invoice Value</p>
                  <p className="text-2xl font-semibold text-gray-900">${(selectedQuote.total_amount + (selectedQuote.freight_cost || 0)).toFixed(2)}</p>
                </div>
                <div className="content-card-compact">
                  <p className="text-sm text-gray-600 mb-2">Estimated Profit</p>
                  <p className="text-2xl font-semibold text-gray-900">—</p>
                </div>
              </div>
            </div>
          </div>

          {/* ====== SECTION 6: CREDIT TERMS ====== */}
          <div className="content-card">
            <div className="content-row-stack">
              <h2 className="section-title">Credit Terms</h2>
              <div className="metric-grid metric-grid-3">
                <div className="content-card-compact">
                  <p className="text-sm text-gray-600 mb-2">Payment Terms</p>
                  <p className="text-lg font-semibold text-gray-900">{selectedQuote.payment_terms || "Cash"}</p>
                </div>
                <div className="content-card-compact">
                  <p className="text-sm text-gray-600 mb-2">Credit Cost Impact</p>
                  <p className="text-lg font-semibold text-gray-900">—</p>
                </div>
                <div className="content-card-compact">
                  <p className="text-sm text-gray-600 mb-2">Effect on Profit</p>
                  <p className="text-lg font-semibold text-gray-900">—</p>
                </div>
              </div>
            </div>
          </div>

          {/* ====== SECTION 7: STATUS MANAGEMENT ====== */}
          <div className="content-card">
            <div className="content-row-stack">
              <h2 className="section-title">Status Management</h2>
              <div className="flex gap-2 flex-wrap">
                {["Draft", "Sent", "Negotiation", "Approved", "Won", "Lost"].map((status) => (
                  <button
                    key={status}
                    className={`px-4 py-2 rounded font-semibold text-sm ${
                      selectedQuote.status === status.toLowerCase()
                        ? "bg-gray-900 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ====== SECTION 8: ACTIONS ====== */}
          <div className="content-card">
            <div className="content-row-stack">
              <h2 className="section-title">Quote Actions</h2>
              <div className="section-toolbar-actions">
                <button className="btn btn-primary">Generate PDF</button>
                <button className="btn btn-secondary">Duplicate Quote</button>
                <button className="btn btn-secondary">Edit / Revise</button>
                <button className="btn btn-secondary">Send to Customer</button>
                <button className="btn btn-secondary">Convert to Order</button>
              </div>
            </div>
          </div>

          {/* ====== SECTION 9: AUDIT & HISTORY ====== */}
          <div className="content-card">
            <div className="content-row-stack">
              <h2 className="section-title">Audit & History</h2>
              <div className="space-y-3">
                <div className="compact-item">
                  <p className="text-sm font-semibold text-gray-900">Version History & Price Changes</p>
                  <p className="text-sm text-gray-600 mt-2">Original quote created on {new Date(selectedQuote.created_at).toLocaleDateString()}</p>
                </div>
                <div className="compact-item">
                  <p className="text-sm font-semibold text-gray-900">Who & When</p>
                  <p className="text-sm text-gray-600 mt-2">Created by system on {new Date(selectedQuote.created_at).toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ====== CREATE QUOTE SECTIONS ====== */}
      {activeTab === "create" && (
        <form onSubmit={handleCreateQuote} className="page-stack">
          {/* ====== SECTION 1: QUOTE HEADER CREATION ====== */}
          <section className="page-section">
            <h2 className="section-title">Quote Header</h2>
            <div className="table-container">
              <div className="content-card">
                <div className="form-grid form-grid-3">
                  <div className="form-group">
                    <label className="text-sm font-semibold text-gray-900">Customer *</label>
                    <select
                      value={quoteHeader.customerId}
                      onChange={(e) => {
                        const cust = customers.find((c) => c.id === e.target.value);
                        setQuoteHeader({
                          ...quoteHeader,
                          customerId: e.target.value,
                          customerName: cust?.name || "",
                          country: cust?.country || "",
                        });
                      }}
                      required
                      className="mt-1"
                    >
                      <option value="">Select Customer</option>
                      {customers.map((cust) => (
                        <option key={cust.id} value={cust.id}>
                          {cust.name} ({cust.country})
                        </option>
                      ))}
                    </select>
                    {!quoteHeader.customerId && (
                      <button
                        type="button"
                        onClick={() => setShowNewCustomer(!showNewCustomer)}
                        className="text-blue-600 text-sm font-semibold hover:text-blue-800 mt-2"
                      >
                        {showNewCustomer ? "Use Existing" : "Add New Customer"}
                      </button>
                    )}
                  </div>

                  <div className="form-group">
                    <label className="text-sm font-semibold text-gray-900">Market</label>
                    <select
                      value={quoteHeader.market}
                      onChange={(e) => setQuoteHeader({ ...quoteHeader, market: e.target.value })}
                      className="mt-1"
                    >
                      <option value="">Select Market</option>
                      <option value="GCC">GCC</option>
                      <option value="Africa">Africa</option>
                      <option value="Asia">Asia</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="text-sm font-semibold text-gray-900">Salesperson</label>
                    <input
                      type="text"
                      value={quoteHeader.salesperson}
                      onChange={(e) => setQuoteHeader({ ...quoteHeader, salesperson: e.target.value })}
                      placeholder="Your name"
                      className="mt-1"
                    />
                  </div>

                  <div className="form-group">
                    <label className="text-sm font-semibold text-gray-900">Currency</label>
                    <select
                      value={quoteHeader.currency}
                      onChange={(e) => setQuoteHeader({ ...quoteHeader, currency: e.target.value })}
                      className="mt-1"
                    >
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="AED">AED</option>
                      <option value="INR">INR</option>
                    </select>
                  </div>
                </div>

                {showNewCustomer && (
                  <div className="mt-6 pt-6 border-t border-gray-200">
                    <h3 className="font-semibold text-gray-900 mb-4">Add New Customer</h3>
                    <div className="form-grid form-grid-2 mb-4">
                      <div className="form-group mb-0">
                        <label className="text-sm font-semibold text-gray-900">Company Name *</label>
                        <input
                          type="text"
                          placeholder="Enter company name"
                          value={newCustomer.name}
                          onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                          className="mt-1"
                          required
                        />
                      </div>
                      <div className="form-group mb-0">
                        <label className="text-sm font-semibold text-gray-900">Email</label>
                        <input
                          type="email"
                          placeholder="name@company.com"
                          value={newCustomer.email}
                          onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                          className="mt-1"
                        />
                      </div>
                      <div className="form-group mb-0">
                        <label className="text-sm font-semibold text-gray-900">Phone</label>
                        <input
                          type="text"
                          placeholder="Phone number"
                          value={newCustomer.phone}
                          onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                          className="mt-1"
                        />
                      </div>
                      <div className="form-group mb-0">
                        <label className="text-sm font-semibold text-gray-900">Country</label>
                        <input
                          type="text"
                          placeholder="Country"
                          value={newCustomer.country}
                          onChange={(e) => setNewCustomer({ ...newCustomer, country: e.target.value })}
                          className="mt-1"
                        />
                      </div>
                      <div className="form-group mb-0">
                        <label className="text-sm font-semibold text-gray-900">Contact Person</label>
                        <input
                          type="text"
                          placeholder="Primary contact"
                          value={newCustomer.contact_person}
                          onChange={(e) => setNewCustomer({ ...newCustomer, contact_person: e.target.value })}
                          className="mt-1"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddCustomer}
                      className="btn btn-primary"
                    >
                      Add Customer
                    </button>
                    {customerError && (
                      <p className="mt-3 text-sm font-semibold text-red-600">
                        {customerError}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ====== SECTION 2: PRODUCT SELECTION ====== */}
          <section className="page-section">
            <h2 className="section-title">Product Selection</h2>
            <div className="content-card">
              <div className="content-row-stack">
                <h3 className="text-lg font-semibold text-gray-900">Add Line Items</h3>
                <div className="form-grid form-grid-5 mb-4">
                  <div className="form-group mb-0">
                    <label className="text-sm font-semibold text-gray-900">SKU *</label>
                    <select
                      value={selectedSku}
                      onChange={(e) => setSelectedSku(e.target.value)}
                      className="mt-1"
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
                    <label className="text-sm font-semibold text-gray-900">Pack Type</label>
                    <select
                      value={packType}
                      onChange={(e) => setPackType(e.target.value)}
                      className="mt-1"
                    >
                      <option value="1L">1L</option>
                      <option value="4L">4L</option>
                      <option value="20L">20L</option>
                      <option value="200L">200L Drum</option>
                    </select>
                  </div>

                  <div className="form-group mb-0">
                    <label className="text-sm font-semibold text-gray-900">Quantity *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      placeholder="0"
                      className="mt-1"
                    />
                  </div>

                  <div className="form-group mb-0">
                    <label className="text-sm font-semibold text-gray-900">Discount %</label>
                    <input
                      type="number"
                      step="0.01"
                      value={itemDiscount}
                      onChange={(e) => setItemDiscount(e.target.value)}
                      placeholder="0"
                      className="mt-1"
                    />
                  </div>

                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={handleAddLineItem}
                      className="btn btn-primary w-full"
                    >
                      Add Item
                    </button>
                  </div>
                </div>

                {lineItems.length > 0 && (
                  <div className="mt-6 pt-6 border-t border-gray-200">
                    <div className="overflow-x-auto">
                      <table>
                        <thead>
                          <tr>
                            <th>SKU</th>
                            <th>Pack Type</th>
                            <th>Quantity</th>
                            <th>Price/Unit</th>
                            <th>Discount %</th>
                            <th>Total</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lineItems.map((item) => (
                            <tr key={item.id}>
                              <td className="font-semibold">{item.skuName}</td>
                              <td>{item.packType}</td>
                              <td>{item.quantity}</td>
                              <td>${item.pricePerUnit.toFixed(2)}</td>
                              <td>{item.discountPercentage.toFixed(2)}%</td>
                              <td className="font-semibold">${calculateLineTotal(item).toFixed(2)}</td>
                              <td>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveLineItem(item.id)}
                                  className="text-red-600 text-sm font-semibold hover:text-red-800"
                                >
                                  Remove
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ====== SECTION 4: SHIPMENT DETAILS ====== */}
          <section className="page-section">
            <h2 className="section-title">Shipment Details</h2>
            <div className="table-container">
                <div className="content-card">
                  <div className="form-grid form-grid-4">
                  <div className="form-group">
                    <label className="text-sm font-semibold text-gray-900">Total Volume (Liters)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={shipmentDetails.totalVolume}
                      onChange={(e) => setShipmentDetails({ ...shipmentDetails, totalVolume: parseFloat(e.target.value) || 0 })}
                      className="mt-1"
                    />
                  </div>

                  <div className="form-group">
                    <label className="text-sm font-semibold text-gray-900">Container Type</label>
                    <select
                      value={shipmentDetails.containerType}
                      onChange={(e) => setShipmentDetails({ ...shipmentDetails, containerType: e.target.value })}
                      className="mt-1"
                    >
                      <option value="20FT">20FT</option>
                      <option value="40FT">40FT</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="text-sm font-semibold text-gray-900">Freight Cost</label>
                    <input
                      type="number"
                      step="0.01"
                      value={shipmentDetails.freightCost}
                      onChange={(e) => setShipmentDetails({ ...shipmentDetails, freightCost: parseFloat(e.target.value) || 0 })}
                      className="mt-1"
                    />
                  </div>

                  <div className="form-group">
                    <label className="text-sm font-semibold text-gray-900">Incoterm</label>
                    <select
                      value={shipmentDetails.incoterm}
                      onChange={(e) => setShipmentDetails({ ...shipmentDetails, incoterm: e.target.value })}
                      className="mt-1"
                    >
                      <option value="FOB">FOB</option>
                      <option value="CIF">CIF</option>
                      <option value="CFR">CFR</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ====== SECTION 5: FINANCIAL SUMMARY ====== */}
          <section className="page-section">
            <h2 className="section-title">Financial Summary</h2>
            <div className="table-container">
              <div className="content-card">
                <div className="metric-grid">
                  <div className="p-4 border border-gray-200 rounded">
                    <p className="text-sm text-gray-600 mb-2">Total Product Value</p>
                    <p className="text-2xl font-semibold text-gray-900">${calculateTotalProductValue().toFixed(2)}</p>
                  </div>
                  <div className="p-4 border border-gray-200 rounded">
                    <p className="text-sm text-gray-600 mb-2">Freight</p>
                    <p className="text-2xl font-semibold text-gray-900">${shipmentDetails.freightCost.toFixed(2)}</p>
                  </div>
                  <div className="p-4 border border-gray-200 rounded">
                    <p className="text-sm text-gray-600 mb-2">Total Invoice Value</p>
                    <p className="text-2xl font-semibold text-gray-900">${calculateTotalInvoiceValue().toFixed(2)}</p>
                  </div>
                  <div className="p-4 border border-gray-200 rounded">
                    <p className="text-sm text-gray-600 mb-2">Estimated Cost</p>
                    <p className="text-2xl font-semibold text-gray-900">${calculateTotalCost().toFixed(2)}</p>
                  </div>
                  <div className="p-4 border border-gray-200 rounded">
                    <p className="text-sm text-gray-600 mb-2">Estimated Profit</p>
                    <p className="text-2xl font-semibold text-gray-900">${calculateEstimatedProfit().toFixed(2)}</p>
                  </div>
                  <div className="p-4 border border-gray-200 rounded">
                    <p className="text-sm text-gray-600 mb-2">Profit/Liter</p>
                    <p className="text-2xl font-semibold text-gray-900">${calculateProfitPerLiter().toFixed(2)}</p>
                  </div>
                  <div className="p-4 border border-gray-200 rounded col-span-2">
                    <p className="text-sm text-gray-600 mb-2">Profit/Container</p>
                    <p className="text-2xl font-semibold text-gray-900">${calculateProfitPerContainer().toFixed(2)}</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ====== SECTION 6: CREDIT TERMS ====== */}
          <section className="page-section">
            <h2 className="section-title">Credit Terms</h2>
            <div className="table-container">
              <div className="content-card">
                <div className="metric-grid metric-grid-3">
                  <div className="form-group">
                    <label className="text-sm font-semibold text-gray-900">Payment Terms</label>
                    <select
                      value={creditTerms.paymentTerms}
                      onChange={(e) => setCreditTerms({ ...creditTerms, paymentTerms: e.target.value })}
                      className="mt-1"
                    >
                      <option value="Cash">Cash</option>
                      <option value="30">30 Days</option>
                      <option value="60">60 Days</option>
                      <option value="90">90 Days</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="text-sm font-semibold text-gray-900">Credit Days (if applicable)</label>
                    <input
                      type="number"
                      value={creditTerms.creditDays}
                      onChange={(e) => setCreditTerms({ ...creditTerms, creditDays: e.target.value })}
                      className="mt-1"
                    />
                  </div>

                  <div className="form-group">
                    <label className="text-sm font-semibold text-gray-900">Credit Cost %</label>
                    <input
                      type="number"
                      step="0.01"
                      value={creditTerms.creditCostPercentage}
                      onChange={(e) => setCreditTerms({ ...creditTerms, creditCostPercentage: e.target.value })}
                      placeholder="0"
                      className="mt-1"
                    />
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t border-gray-200">
                  <p className="text-sm text-gray-600">Credit Cost Impact on Profit: <span className="font-semibold text-gray-900">${calculateCreditCostImpact().toFixed(2)}</span></p>
                </div>
              </div>
            </div>
          </section>

          {/* ====== SECTION 7: STATUS MANAGEMENT ====== */}
          <section className="page-section">
            <h2 className="section-title">Quote Status</h2>
            <div className="table-container">
              <div className="px-6 py-6">
                <select
                  value={quoteStatus}
                  onChange={(e) => setQuoteStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded"
                >
                  <option value="Draft">Draft</option>
                  <option value="Sent">Sent</option>
                  <option value="Negotiation">Negotiation</option>
                  <option value="Approved">Approved</option>
                  <option value="Won">Won</option>
                  <option value="Lost">Lost</option>
                </select>
              </div>
            </div>
          </section>

          {/* Submit Button */}
          <button
            type="submit"
            className="btn btn-primary w-full py-3 text-lg font-semibold"
          >
            Create Quote
          </button>
        </form>
      )}
    </div>
  );
}
