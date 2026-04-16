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
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 10;
    let yPos = margin;

    // Title
    doc.setFontSize(18);
    doc.text("QUOTATION REPORT", pageWidth / 2, yPos, { align: "center" });
    yPos += 12;

    // Date
    doc.setFontSize(10);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, margin, yPos);
    yPos += 10;

    // File Info
    if (uploadedFile) {
      doc.setFontSize(12);
      doc.text("File Information", margin, yPos);
      yPos += 7;
      doc.setFontSize(10);
      doc.text(`Source: ${uploadedFile.file_name}`, margin + 5, yPos);
      yPos += 12;
    }

    // Input Values
    doc.setFontSize(12);
    doc.text("Input Parameters", margin, yPos);
    yPos += 7;

    doc.setFontSize(10);
    Object.entries(inputValues).forEach(([key, value]) => {
      doc.text(`${key}: ${value}`, margin + 5, yPos);
      yPos += 5;
    });

    yPos += 5;

    // Calculations
    doc.setFontSize(12);
    doc.text("Calculated Results", margin, yPos);
    yPos += 7;

    doc.setFontSize(10);
    Object.entries(calculations).forEach(([key, calc]) => {
      const type = calc.type === "calculated" ? " (Calculated)" : "";
      doc.text(`${key}: ${calc.value.toFixed(2)}${type}`, margin + 5, yPos);
      yPos += 5;
    });

    doc.save(`quotation_${Date.now()}.pdf`);
  };

  return (
    <div style={{ fontFamily: "Arial, sans-serif", padding: "20px", maxWidth: "1000px", margin: "0 auto" }}>
      <h1>Pricing Dashboard</h1>

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

