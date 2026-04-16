import React, { useState, useEffect } from "react";
import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";

export default function PricingApp() {
  const [uploadedFile, setUploadedFile] = useState(null);
  const [columns, setColumns] = useState([]);
  const [fileData, setFileData] = useState([]);
  const [inputValues, setInputValues] = useState({});
  const [calculations, setCalculations] = useState({});
  const [loading, setLoading] = useState(false);

  // Company & Quote Details
  const [companyName, setCompanyName] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerCountry, setCustomerCountry] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("30% Advance, 70% Against BL");
  const [deliveryDays, setDeliveryDays] = useState("15");

  // Original Calculator Fields
  const [costPerLiter, setCostPerLiter] = useState("");
  const [marginPercent, setMarginPercent] = useState("");
  const [volume, setVolume] = useState("");
  const [quantity, setQuantity] = useState("");

  // History State
  const [history, setHistory] = useState([]);
  const [selectedHistory, setSelectedHistory] = useState(null);

  // Original Calculator Results
  const calculateQuickMetrics = () => {
    const cost = parseFloat(costPerLiter) || 0;
    const margin = parseFloat(marginPercent) || 0;
    const vol = parseFloat(volume) || 0;
    const qty = parseFloat(quantity) || 0;

    const pricePerLiter = margin > 0 ? cost * (1 + margin / 100) : 0;
    const revenue = pricePerLiter * vol * qty;
    const profit = (pricePerLiter - cost) * vol * qty;

    return { pricePerLiter, revenue, profit };
  };

  const metrics = calculateQuickMetrics();

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(sheet);

      if (data.length === 0) {
        alert("Excel file is empty");
        setLoading(false);
        return;
      }

      // Detect column types
      const detectedColumns = Object.keys(data[0]).map(key => ({
        name: key,
        type: detectType(data.map(row => row[key])),
        formula: null
      }));

      setUploadedFile({ file_name: file.name });
      setColumns(detectedColumns);
      setFileData(data);
      initializeInputValues(data, detectedColumns);
    } catch (error) {
      console.error("Upload error:", error);
      alert("Error uploading file: " + error.message);
    }
    setLoading(false);
  };

  const detectType = (values) => {
    const nonEmpty = values.filter(v => v !== null && v !== "");
    if (nonEmpty.length === 0) return "text";
    if (nonEmpty.every(v => !isNaN(v))) return "number";
    if (nonEmpty.every(v => v === "true" || v === "false")) return "boolean";
    return "text";
  };

  const initializeInputValues = (data, cols) => {
    const values = {};
    cols.forEach(col => {
      if (col.type === "number" && data.length > 0) {
        values[col.name] = data[0][col.name] || 0;
      }
    });
    setInputValues(values);
    calculateValues(values);
  };

  const calculateValues = (values) => {
    const numericColumns = columns.filter(c => c.type === "number");
    const results = {};

    numericColumns.forEach(col => {
      const value = values[col.name] || 0;
      results[col.name] = {
        value,
        type: "input"
      };
    });

    // Example: Auto-calculate profit if we have revenue and totalCost
    if (values.revenue && values.totalCost) {
      results.profit = {
        value: values.revenue - values.totalCost,
        type: "calculated"
      };
    }

    setCalculations(results);
  };

  const handleInputChange = (column, value) => {
    const newValues = { ...inputValues, [column]: parseFloat(value) || 0 };
    setInputValues(newValues);
    calculateValues(newValues);
  };

  const generatePDF = () => {
    if (!companyName || !customerName) {
      alert("Please fill in Company Name and Customer Name before generating quote");
      return;
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    let yPos = margin;

    // Header
    doc.setFontSize(20);
    doc.setTextColor(0, 51, 102);
    doc.text("LUBRICANT QUOTATION", pageWidth / 2, yPos, { align: "center" });
    yPos += 10;

    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Quote No: QT-${Date.now()}`, margin, yPos);
    yPos += 5;
    doc.text(`Date: ${new Date().toLocaleDateString()}`, margin, yPos);
    yPos += 8;

    // Company Info
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text("FROM", margin, yPos);
    yPos += 5;
    doc.setFontSize(10);
    doc.text(companyName, margin + 2, yPos);
    yPos += 4;
    if (companyEmail) {
      doc.text("Email: " + companyEmail, margin + 2, yPos);
      yPos += 4;
    }
    yPos += 4;

    // Customer Info
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text("TO", margin, yPos);
    yPos += 5;
    doc.setFontSize(10);
    doc.text(customerName, margin + 2, yPos);
    yPos += 4;
    if (customerCountry) {
      doc.text("Country: " + customerCountry, margin + 2, yPos);
      yPos += 4;
    }
    yPos += 4;

    // File Info Section
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text("PRODUCT DETAILS", margin, yPos);
    yPos += 6;

    doc.setFontSize(9);
    doc.setTextColor(50, 50, 50);
    doc.text("File: " + uploadedFile.file_name, margin + 2, yPos);
    yPos += 4;
    doc.text("Columns: " + columns.length, margin + 2, yPos);
    yPos += 8;

    // Input Values Table
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text("INPUT PARAMETERS", margin, yPos);
    yPos += 5;

    doc.setFontSize(9);
    let inputCount = 0;
    Object.entries(inputValues).forEach(([key, value]) => {
      if (inputCount % 2 === 0 && inputCount > 0) {
        yPos += 4;
      }
      const xPos = inputCount % 2 === 0 ? margin + 2 : pageWidth / 2;
      doc.text(`${key}: ${value}`, xPos, yPos);
      inputCount++;
    });
    yPos += 10;

    // Results Section
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text("CALCULATIONS & RESULTS", margin, yPos);
    yPos += 5;

    doc.setFontSize(9);
    const calcEntries = Object.entries(calculations);
    const resultColumns = 3;
    let resultIdx = 0;

    calcEntries.forEach(([key, calc], idx) => {
      const col = idx % resultColumns;
      const xPos = margin + 2 + (col * 60);

      if (col === 0 && idx > 0) {
        yPos += 15;
      }

      // Box styling
      doc.setDrawColor(200, 200, 200);
      doc.rect(xPos - 1, yPos - 8, 55, 12);

      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(key, xPos, yPos - 5);

      doc.setFontSize(10);
      doc.setTextColor(0, 51, 102);
      doc.setFont(undefined, "bold");
      const displayValue = typeof calc.value === "number" ? calc.value.toFixed(2) : calc.value;
      doc.text(displayValue, xPos, yPos + 2);

      doc.setFont(undefined, "normal");
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      if (calc.type === "calculated") {
        doc.text("(Calculated)", xPos, yPos + 6);
      }
    });

    yPos += 20;

    // Summary Section
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text("COMMERCIAL TERMS", margin, yPos);
    yPos += 5;

    doc.setDrawColor(0, 51, 102);
    doc.setLineWidth(0.5);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 5;

    doc.setFontSize(9);
    doc.setTextColor(50, 50, 50);
    doc.text("Payment Terms:", margin + 2, yPos);
    doc.text(paymentTerms, pageWidth - margin - 30, yPos);
    yPos += 4;

    doc.text("Delivery:", margin + 2, yPos);
    doc.text(deliveryDays + " Days", pageWidth - margin - 30, yPos);
    yPos += 8;

    // Footer
    doc.setDrawColor(150, 150, 150);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 5;

    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text("This quotation is valid for 7 days from the date above.", margin, yPos);
    yPos += 3;
    doc.text("For more details, please contact our sales team.", margin, yPos);

    const pdfFileName = `quotation_${Date.now()}.pdf`;
    doc.save(pdfFileName);

    // Save to history
    const timestamp = new Date().toLocaleString();
    const historyEntry = {
      id: Date.now(),
      timestamp,
      companyName,
      companyEmail,
      customerName,
      customerCountry,
      paymentTerms,
      deliveryDays,
      costPerLiter,
      marginPercent,
      volume,
      quantity,
      uploadedFile,
      columns,
      fileData,
      inputValues,
      calculations,
      pdfFileName
    };
    setHistory([historyEntry, ...history]);
  };

  const restoreFromHistory = (entry) => {
    setCompanyName(entry.companyName);
    setCompanyEmail(entry.companyEmail);
    setCustomerName(entry.customerName);
    setCustomerCountry(entry.customerCountry);
    setPaymentTerms(entry.paymentTerms);
    setDeliveryDays(entry.deliveryDays);
    setCostPerLiter(entry.costPerLiter);
    setMarginPercent(entry.marginPercent);
    setVolume(entry.volume);
    setQuantity(entry.quantity);
    setUploadedFile(entry.uploadedFile);
    setColumns(entry.columns);
    setFileData(entry.fileData);
    setInputValues(entry.inputValues);
    setCalculations(entry.calculations);
  };

  const deleteHistoryEntry = (id) => {
    setHistory(history.filter(entry => entry.id !== id));
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", backgroundColor: "white", fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif" }}>
      {/* Sidebar */}
      <div style={{ width: "280px", backgroundColor: "#f5f5f5", borderRight: "1px solid #e0e0e0", padding: "20px", overflowY: "auto", maxHeight: "100vh" }}>
        <h3 style={{ margin: "0 0 16px 0", fontSize: "14px", fontWeight: "600", color: "#1a1a1a" }}>History</h3>
        {history.length === 0 ? (
          <p style={{ margin: "0", fontSize: "12px", color: "#999" }}>No history yet</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {history.map(entry => (
              <div
                key={entry.id}
                style={{
                  backgroundColor: "white",
                  border: "1px solid #e0e0e0",
                  borderRadius: "4px",
                  padding: "10px",
                  fontSize: "12px",
                  cursor: "pointer",
                  transition: "all 0.2s"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#f9f9f9";
                  e.currentTarget.style.borderColor = "#2563eb";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "white";
                  e.currentTarget.style.borderColor = "#e0e0e0";
                }}
              >
                <div onClick={() => setSelectedHistory(entry)} style={{ marginBottom: "8px" }}>
                  <p style={{ margin: "0 0 4px 0", fontSize: "11px", color: "#2563eb", fontWeight: "500" }}>
                    {entry.timestamp}
                  </p>
                  <p style={{ margin: "0", fontSize: "11px", color: "#666" }}>
                    {entry.customerName || "—"}
                  </p>
                </div>
                <button
                  onClick={() => deleteHistoryEntry(entry.id)}
                  style={{
                    width: "100%",
                    padding: "4px 8px",
                    backgroundColor: "#fee2e2",
                    color: "#991b1b",
                    border: "1px solid #fecaca",
                    borderRadius: "3px",
                    fontSize: "11px",
                    cursor: "pointer",
                    fontWeight: "500",
                    transition: "background-color 0.2s"
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = "#fca5a5"}
                  onMouseLeave={(e) => e.target.style.backgroundColor = "#fee2e2"}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, padding: "40px 20px", maxWidth: "1200px", margin: "0 auto", width: "100%" }}>
      <div style={{ marginBottom: "40px" }}>
        <h1 style={{ margin: "0 0 10px 0", fontSize: "32px", color: "#1a1a1a", fontWeight: "600" }}>Pricing Dashboard</h1>
      </div>

      {/* Company & Customer Details Form */}
      <div style={{ border: "1px solid #e0e0e0", padding: "24px", marginBottom: "24px", backgroundColor: "#fafafa", borderRadius: "6px" }}>
        <h2 style={{ margin: "0 0 20px 0", fontSize: "16px", fontWeight: "600", color: "#1a1a1a" }}>Quote Information</h2>
        
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "0" }}>
          <div>
            <label style={{ display: "block", marginBottom: "6px", fontWeight: "500", fontSize: "13px", color: "#333" }}>Your Company Name *</label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g., GulfStar Lubricants LLC"
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #d0d0d0",
                fontSize: "14px",
                boxSizing: "border-box",
                borderRadius: "4px",
                fontFamily: "inherit",
                transition: "border-color 0.2s"
              }}
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "6px", fontWeight: "500", fontSize: "13px", color: "#333" }}>Your Email</label>
            <input
              type="email"
              value={companyEmail}
              onChange={(e) => setCompanyEmail(e.target.value)}
              placeholder="sales@company.com"
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #d0d0d0",
                fontSize: "14px",
                boxSizing: "border-box",
                borderRadius: "4px",
                fontFamily: "inherit"
              }}
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "6px", fontWeight: "500", fontSize: "13px", color: "#333" }}>Customer Name *</label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="e.g., Al Noor Trading Co."
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #d0d0d0",
                fontSize: "14px",
                boxSizing: "border-box",
                borderRadius: "4px",
                fontFamily: "inherit"
              }}
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "6px", fontWeight: "500", fontSize: "13px", color: "#333" }}>Customer Country</label>
            <input
              type="text"
              value={customerCountry}
              onChange={(e) => setCustomerCountry(e.target.value)}
              placeholder="e.g., Kenya"
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #d0d0d0",
                fontSize: "14px",
                boxSizing: "border-box",
                borderRadius: "4px",
                fontFamily: "inherit"
              }}
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "6px", fontWeight: "500", fontSize: "13px", color: "#333" }}>Payment Terms</label>
            <input
              type="text"
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              placeholder="30% Advance, 70% Against BL"
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #d0d0d0",
                fontSize: "14px",
                boxSizing: "border-box",
                borderRadius: "4px",
                fontFamily: "inherit"
              }}
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "6px", fontWeight: "500", fontSize: "13px", color: "#333" }}>Delivery Days</label>
            <input
              type="number"
              value={deliveryDays}
              onChange={(e) => setDeliveryDays(e.target.value)}
              placeholder="15"
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #d0d0d0",
                fontSize: "14px",
                boxSizing: "border-box",
                borderRadius: "4px",
                fontFamily: "inherit"
              }}
            />
          </div>
        </div>
      </div>

      {/* Original Quick Calculator */}
      <div style={{ border: "1px solid #e0e0e0", padding: "24px", marginBottom: "24px", backgroundColor: "#fafafa", borderRadius: "6px" }}>
        <h2 style={{ margin: "0 0 20px 0", fontSize: "16px", fontWeight: "600", color: "#1a1a1a" }}>Quick Calculator</h2>
        
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "20px" }}>
          <div>
            <label style={{ display: "block", marginBottom: "6px", fontWeight: "500", fontSize: "13px", color: "#333" }}>Cost per Liter (USD)</label>
            <input
              type="number"
              value={costPerLiter}
              onChange={(e) => setCostPerLiter(e.target.value)}
              placeholder="0.00"
              step="0.01"
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #d0d0d0",
                fontSize: "14px",
                boxSizing: "border-box",
                borderRadius: "4px",
                fontFamily: "inherit"
              }}
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "6px", fontWeight: "500", fontSize: "13px", color: "#333" }}>Margin (%)</label>
            <input
              type="number"
              value={marginPercent}
              onChange={(e) => setMarginPercent(e.target.value)}
              placeholder="0"
              step="0.1"
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #d0d0d0",
                fontSize: "14px",
                boxSizing: "border-box",
                borderRadius: "4px",
                fontFamily: "inherit"
              }}
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "6px", fontWeight: "500", fontSize: "13px", color: "#333" }}>Volume (Liters)</label>
            <input
              type="number"
              value={volume}
              onChange={(e) => setVolume(e.target.value)}
              placeholder="0"
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #d0d0d0",
                fontSize: "14px",
                boxSizing: "border-box",
                borderRadius: "4px",
                fontFamily: "inherit"
              }}
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "6px", fontWeight: "500", fontSize: "13px", color: "#333" }}>Quantity</label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0"
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #d0d0d0",
                fontSize: "14px",
                boxSizing: "border-box",
                borderRadius: "4px",
                fontFamily: "inherit"
              }}
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
          <div style={{ backgroundColor: "white", padding: "12px", borderRadius: "4px", border: "1px solid #e0e0e0" }}>
            <p style={{ margin: "0 0 4px 0", fontSize: "12px", color: "#999", fontWeight: "500" }}>Price / L</p>
            <p style={{ margin: "0", fontSize: "20px", fontWeight: "600", color: "#2563eb" }}>
              ${metrics.pricePerLiter.toFixed(2)}
            </p>
          </div>
          <div style={{ backgroundColor: "white", padding: "12px", borderRadius: "4px", border: "1px solid #e0e0e0" }}>
            <p style={{ margin: "0 0 4px 0", fontSize: "12px", color: "#999", fontWeight: "500" }}>Revenue</p>
            <p style={{ margin: "0", fontSize: "20px", fontWeight: "600", color: "#2563eb" }}>
              ${metrics.revenue.toFixed(2)}
            </p>
          </div>
          <div style={{ backgroundColor: "white", padding: "12px", borderRadius: "4px", border: "1px solid #e0e0e0" }}>
            <p style={{ margin: "0 0 4px 0", fontSize: "12px", color: "#999", fontWeight: "500" }}>Profit</p>
            <p style={{ margin: "0", fontSize: "20px", fontWeight: "600", color: "#2563eb" }}>
              ${metrics.profit.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {!uploadedFile ? (
        <div style={{ border: "1px solid #e0e0e0", padding: "24px", marginBottom: "20px", backgroundColor: "#fafafa", borderRadius: "6px" }}>
          <h2 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: "600", color: "#1a1a1a" }}>Advanced: Upload Excel File</h2>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileUpload}
            id="file-upload"
            disabled={loading}
          />
          <br />
          <br />
          <button
            onClick={() => document.getElementById("file-upload").click()}
            disabled={loading}
            style={{
              padding: "10px 16px",
              backgroundColor: "#2563eb",
              color: "white",
              border: "none",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "500",
              borderRadius: "4px",
              transition: "background-color 0.2s"
            }}
          >
            {loading ? "Uploading..." : "Choose File"}
          </button>
        </div>
      ) : (
        <>
          <div style={{ border: "1px solid #e0e0e0", padding: "16px", marginBottom: "24px", backgroundColor: "#fafafa", borderRadius: "6px" }}>
            <p style={{ margin: "0 0 12px 0", fontSize: "14px", color: "#666" }}>
              <strong style={{ color: "#1a1a1a" }}>File:</strong> {uploadedFile.file_name} ({columns.length} columns)
            </p>
            <button
              onClick={() => {
                setUploadedFile(null);
                setColumns([]);
                setFileData([]);
                setInputValues({});
              }}
              style={{
                padding: "8px 12px",
                backgroundColor: "#e5e7eb",
                border: "1px solid #d1d5db",
                color: "#374151",
                cursor: "pointer",
                fontSize: "13px",
                borderRadius: "4px",
                fontWeight: "500",
                transition: "background-color 0.2s"
              }}
            >
              Upload Different
            </button>
          </div>

          <div style={{ marginBottom: "24px" }}>
            <h2 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: "600", color: "#1a1a1a" }}>Parameters</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "12px" }}>
              {columns
                .filter(col => col.type === "number")
                .map(col => (
                  <div key={col.name} style={{ border: "1px solid #e0e0e0", padding: "12px", borderRadius: "4px", backgroundColor: "#fafafa" }}>
                    <label style={{ display: "block", marginBottom: "6px", fontWeight: "500", fontSize: "13px", color: "#333" }}>
                      {col.name}
                    </label>
                    <input
                      type="number"
                      value={inputValues[col.name] || ""}
                      onChange={(e) => handleInputChange(col.name, e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        border: "1px solid #d0d0d0",
                        fontSize: "14px",
                        boxSizing: "border-box",
                        borderRadius: "4px",
                        fontFamily: "inherit"
                      }}
                      placeholder="Enter value"
                    />
                  </div>
                ))}
            </div>
          </div>

          <div style={{ marginBottom: "24px" }}>
            <h2 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: "600", color: "#1a1a1a" }}>Results</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "12px" }}>
              {Object.entries(calculations).map(([key, calc]) => (
                <div key={key} style={{ border: "1px solid #e0e0e0", padding: "12px", borderRadius: "4px", backgroundColor: "#fafafa" }}>
                  <p style={{ margin: "0 0 6px 0", fontSize: "12px", color: "#999", fontWeight: "500" }}>{key}</p>
                  <p style={{ margin: "0", fontSize: "22px", fontWeight: "600", color: "#2563eb" }}>
                    {typeof calc.value === "number" ? calc.value.toFixed(2) : calc.value}
                  </p>
                  {calc.type === "calculated" && (
                    <p style={{ margin: "4px 0 0 0", fontSize: "11px", color: "#999" }}>Calculated</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={generatePDF}
            style={{
              width: "100%",
              padding: "12px",
              backgroundColor: "#2563eb",
              color: "white",
              border: "none",
              cursor: "pointer",
              fontSize: "15px",
              fontWeight: "600",
              borderRadius: "4px",
              transition: "background-color 0.2s"
            }}
          >
            Download PDF Quote
          </button>
        </>
      )}
      </div>

      {/* Modal for History Entry Details */}
      {selectedHistory && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: "white",
            borderRadius: "8px",
            padding: "32px",
            maxWidth: "600px",
            width: "90%",
            maxHeight: "80vh",
            overflowY: "auto",
            boxShadow: "0 10px 40px rgba(0, 0, 0, 0.2)"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <h2 style={{ margin: "0", fontSize: "20px", fontWeight: "600", color: "#1a1a1a" }}>Quote Details</h2>
              <button
                onClick={() => setSelectedHistory(null)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "24px",
                  cursor: "pointer",
                  color: "#999",
                  padding: "0",
                  width: "32px",
                  height: "32px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                ✕
              </button>
            </div>

            {/* Timestamp */}
            <div style={{ marginBottom: "20px", padding: "12px", backgroundColor: "#f5f5f5", borderRadius: "4px" }}>
              <p style={{ margin: "0", fontSize: "12px", color: "#999", fontWeight: "500", marginBottom: "4px" }}>Created</p>
              <p style={{ margin: "0", fontSize: "14px", color: "#1a1a1a", fontWeight: "500" }}>{selectedHistory.timestamp}</p>
            </div>

            {/* Attachment */}
            {selectedHistory.uploadedFile && (
              <div style={{ marginBottom: "20px", padding: "12px", backgroundColor: "#f5f5f5", borderRadius: "4px", border: "1px solid #e0e0e0" }}>
                <p style={{ margin: "0 0 8px 0", fontSize: "12px", color: "#999", fontWeight: "500" }}>Attachment</p>
                <p style={{ margin: "0", fontSize: "13px", color: "#2563eb", fontWeight: "500" }}>📎 {selectedHistory.uploadedFile.file_name}</p>
              </div>
            )}

            {/* Configuration */}
            <div style={{ marginBottom: "20px" }}>
              <h3 style={{ margin: "0 0 12px 0", fontSize: "13px", fontWeight: "600", color: "#1a1a1a" }}>Configuration</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div style={{ padding: "10px", backgroundColor: "#fafafa", borderRadius: "4px" }}>
                  <p style={{ margin: "0 0 4px 0", fontSize: "11px", color: "#999", fontWeight: "500" }}>Company Name</p>
                  <p style={{ margin: "0", fontSize: "13px", color: "#1a1a1a" }}>{selectedHistory.companyName || "—"}</p>
                </div>
                <div style={{ padding: "10px", backgroundColor: "#fafafa", borderRadius: "4px" }}>
                  <p style={{ margin: "0 0 4px 0", fontSize: "11px", color: "#999", fontWeight: "500" }}>Company Email</p>
                  <p style={{ margin: "0", fontSize: "13px", color: "#1a1a1a" }}>{selectedHistory.companyEmail || "—"}</p>
                </div>
                <div style={{ padding: "10px", backgroundColor: "#fafafa", borderRadius: "4px" }}>
                  <p style={{ margin: "0 0 4px 0", fontSize: "11px", color: "#999", fontWeight: "500" }}>Customer Name</p>
                  <p style={{ margin: "0", fontSize: "13px", color: "#1a1a1a" }}>{selectedHistory.customerName || "—"}</p>
                </div>
                <div style={{ padding: "10px", backgroundColor: "#fafafa", borderRadius: "4px" }}>
                  <p style={{ margin: "0 0 4px 0", fontSize: "11px", color: "#999", fontWeight: "500" }}>Customer Country</p>
                  <p style={{ margin: "0", fontSize: "13px", color: "#1a1a1a" }}>{selectedHistory.customerCountry || "—"}</p>
                </div>
                <div style={{ padding: "10px", backgroundColor: "#fafafa", borderRadius: "4px" }}>
                  <p style={{ margin: "0 0 4px 0", fontSize: "11px", color: "#999", fontWeight: "500" }}>Payment Terms</p>
                  <p style={{ margin: "0", fontSize: "13px", color: "#1a1a1a" }}>{selectedHistory.paymentTerms || "—"}</p>
                </div>
                <div style={{ padding: "10px", backgroundColor: "#fafafa", borderRadius: "4px" }}>
                  <p style={{ margin: "0 0 4px 0", fontSize: "11px", color: "#999", fontWeight: "500" }}>Delivery Days</p>
                  <p style={{ margin: "0", fontSize: "13px", color: "#1a1a1a" }}>{selectedHistory.deliveryDays || "—"}</p>
                </div>
              </div>
            </div>

            {/* Quick Calculator Values */}
            <div style={{ marginBottom: "24px" }}>
              <h3 style={{ margin: "0 0 12px 0", fontSize: "13px", fontWeight: "600", color: "#1a1a1a" }}>Quick Calculator</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div style={{ padding: "10px", backgroundColor: "#fafafa", borderRadius: "4px" }}>
                  <p style={{ margin: "0 0 4px 0", fontSize: "11px", color: "#999", fontWeight: "500" }}>Cost / L (USD)</p>
                  <p style={{ margin: "0", fontSize: "13px", color: "#1a1a1a" }}>${parseFloat(selectedHistory.costPerLiter || 0).toFixed(2)}</p>
                </div>
                <div style={{ padding: "10px", backgroundColor: "#fafafa", borderRadius: "4px" }}>
                  <p style={{ margin: "0 0 4px 0", fontSize: "11px", color: "#999", fontWeight: "500" }}>Margin (%)</p>
                  <p style={{ margin: "0", fontSize: "13px", color: "#1a1a1a" }}>{parseFloat(selectedHistory.marginPercent || 0).toFixed(1)}%</p>
                </div>
                <div style={{ padding: "10px", backgroundColor: "#fafafa", borderRadius: "4px" }}>
                  <p style={{ margin: "0 0 4px 0", fontSize: "11px", color: "#999", fontWeight: "500" }}>Volume (L)</p>
                  <p style={{ margin: "0", fontSize: "13px", color: "#1a1a1a" }}>{parseFloat(selectedHistory.volume || 0).toFixed(2)}</p>
                </div>
                <div style={{ padding: "10px", backgroundColor: "#fafafa", borderRadius: "4px" }}>
                  <p style={{ margin: "0 0 4px 0", fontSize: "11px", color: "#999", fontWeight: "500" }}>Quantity</p>
                  <p style={{ margin: "0", fontSize: "13px", color: "#1a1a1a" }}>{parseFloat(selectedHistory.quantity || 0).toFixed(0)}</p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={() => {
                  restoreFromHistory(selectedHistory);
                  setSelectedHistory(null);
                }}
                style={{
                  flex: 1,
                  padding: "12px",
                  backgroundColor: "#2563eb",
                  color: "white",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: "600",
                  borderRadius: "4px",
                  transition: "background-color 0.2s"
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = "#1e40af"}
                onMouseLeave={(e) => e.target.style.backgroundColor = "#2563eb"}
              >
                Restore
              </button>
              <button
                onClick={() => {
                  deleteHistoryEntry(selectedHistory.id);
                  setSelectedHistory(null);
                }}
                style={{
                  flex: 1,
                  padding: "12px",
                  backgroundColor: "#fee2e2",
                  color: "#991b1b",
                  border: "1px solid #fecaca",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: "600",
                  borderRadius: "4px",
                  transition: "background-color 0.2s"
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = "#fca5a5"}
                onMouseLeave={(e) => e.target.style.backgroundColor = "#fee2e2"}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

