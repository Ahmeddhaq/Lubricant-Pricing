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

    doc.save(`quotation_${Date.now()}.pdf`);
  };

  return (
    <div style={{ fontFamily: "Arial, sans-serif", padding: "20px", maxWidth: "1000px", margin: "0 auto", backgroundColor: "white", minHeight: "100vh" }}>
      <h1>Pricing Dashboard</h1>

      {/* Company & Customer Details Form */}
      <div style={{ border: "1px solid #ddd", padding: "20px", marginBottom: "20px", backgroundColor: "#f9f9f9" }}>
        <h2>Quote Information</h2>
        
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px", marginBottom: "15px" }}>
          <div>
            <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>Your Company Name *</label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g., GulfStar Lubricants LLC"
              style={{
                width: "100%",
                padding: "8px",
                border: "1px solid #ccc",
                fontSize: "14px",
                boxSizing: "border-box"
              }}
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>Your Email</label>
            <input
              type="email"
              value={companyEmail}
              onChange={(e) => setCompanyEmail(e.target.value)}
              placeholder="sales@company.com"
              style={{
                width: "100%",
                padding: "8px",
                border: "1px solid #ccc",
                fontSize: "14px",
                boxSizing: "border-box"
              }}
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>Customer Name *</label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="e.g., Al Noor Trading Co."
              style={{
                width: "100%",
                padding: "8px",
                border: "1px solid #ccc",
                fontSize: "14px",
                boxSizing: "border-box"
              }}
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>Customer Country</label>
            <input
              type="text"
              value={customerCountry}
              onChange={(e) => setCustomerCountry(e.target.value)}
              placeholder="e.g., Kenya"
              style={{
                width: "100%",
                padding: "8px",
                border: "1px solid #ccc",
                fontSize: "14px",
                boxSizing: "border-box"
              }}
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>Payment Terms</label>
            <input
              type="text"
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              placeholder="30% Advance, 70% Against BL"
              style={{
                width: "100%",
                padding: "8px",
                border: "1px solid #ccc",
                fontSize: "14px",
                boxSizing: "border-box"
              }}
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>Delivery Days</label>
            <input
              type="number"
              value={deliveryDays}
              onChange={(e) => setDeliveryDays(e.target.value)}
              placeholder="15"
              style={{
                width: "100%",
                padding: "8px",
                border: "1px solid #ccc",
                fontSize: "14px",
                boxSizing: "border-box"
              }}
            />
          </div>
        </div>
      </div>

      {!uploadedFile ? (
        <div style={{ border: "1px solid #ddd", padding: "20px", marginBottom: "20px" }}>
          <h2>Upload Excel File</h2>
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
              padding: "10px 20px",
              backgroundColor: "#007bff",
              color: "white",
              border: "none",
              cursor: "pointer",
              fontSize: "14px"
            }}
          >
            {loading ? "Uploading..." : "Choose File"}
          </button>
        </div>
      ) : (
        <>
          <div style={{ border: "1px solid #ddd", padding: "15px", marginBottom: "20px" }}>
            <p>
              <strong>File:</strong> {uploadedFile.file_name} ({columns.length} columns)
            </p>
            <button
              onClick={() => {
                setUploadedFile(null);
                setColumns([]);
                setFileData([]);
                setInputValues({});
              }}
              style={{
                padding: "8px 16px",
                backgroundColor: "#f0f0f0",
                border: "1px solid #ccc",
                cursor: "pointer",
                fontSize: "14px"
              }}
            >
              Upload Different
            </button>
          </div>

          <div style={{ marginBottom: "20px" }}>
            <h2>Parameters</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "15px" }}>
              {columns
                .filter(col => col.type === "number")
                .map(col => (
                  <div key={col.name} style={{ border: "1px solid #ddd", padding: "10px" }}>
                    <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>
                      {col.name}
                    </label>
                    <input
                      type="number"
                      value={inputValues[col.name] || ""}
                      onChange={(e) => handleInputChange(col.name, e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px",
                        border: "1px solid #ccc",
                        fontSize: "14px",
                        boxSizing: "border-box"
                      }}
                      placeholder="Enter value"
                    />
                  </div>
                ))}
            </div>
          </div>

          <div style={{ marginBottom: "20px" }}>
            <h2>Results</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "15px" }}>
              {Object.entries(calculations).map(([key, calc]) => (
                <div key={key} style={{ border: "1px solid #ddd", padding: "10px" }}>
                  <p style={{ margin: "0 0 5px 0", fontSize: "12px", color: "#666" }}>{key}</p>
                  <p style={{ margin: "0", fontSize: "24px", fontWeight: "bold", color: "#333" }}>
                    {typeof calc.value === "number" ? calc.value.toFixed(2) : calc.value}
                  </p>
                  {calc.type === "calculated" && (
                    <p style={{ margin: "5px 0 0 0", fontSize: "11px", color: "#999" }}>Calculated</p>
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
              backgroundColor: "#007bff",
              color: "white",
              border: "none",
              cursor: "pointer",
              fontSize: "16px",
              fontWeight: "bold"
            }}
          >
            Download PDF Quote
          </button>
        </>
      )}
    </div>
  );
}

