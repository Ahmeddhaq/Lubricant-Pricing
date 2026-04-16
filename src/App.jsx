import React, { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";

// Supabase setup
const SUPABASE_URL = "https://jsevfgasppuywoaxhejg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpzZXZmZ2FzcHB1eXdvYXhoZWpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzkxNzQzNjcsImV4cCI6MjA1NDc1MDM2N30.dKj3D6z9iiMDtpUqa66gJA_s_hbv2zJ";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Generate session ID
const getSessionId = () => {
  let sessionId = localStorage.getItem("pricing_session_id");
  if (!sessionId) {
    sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem("pricing_session_id", sessionId);
  }
  return sessionId;
};

export default function PricingApp() {
  const [sessionId] = useState(getSessionId());
  const [uploadedFile, setUploadedFile] = useState(null);
  const [columns, setColumns] = useState([]);
  const [fileData, setFileData] = useState([]);
  const [inputValues, setInputValues] = useState({});
  const [calculations, setCalculations] = useState({});
  const [savedQuotes, setSavedQuotes] = useState([]);
  const [loading, setLoading] = useState(false);

  // Load session data on mount
  useEffect(() => {
    loadSessionData();
  }, []);

  const loadSessionData = async () => {
    const { data, error } = await supabase
      .from("uploaded_files")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      const file = data[0];
      setUploadedFile(file);
      setColumns(file.columns);
      setFileData(file.data);
      initializeInputValues(file.data, file.columns);
    }

    // Load saved quotes
    const { data: quotesData } = await supabase
      .from("quotes")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false });

    setSavedQuotes(quotesData || []);
  };

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

      // Save to Supabase
      const { data: insertedFile, error } = await supabase
        .from("uploaded_files")
        .insert([
          {
            session_id: sessionId,
            file_name: file.name,
            columns: detectedColumns,
            data: data
          }
        ])
        .select()
        .single();

      if (error) throw error;

      setUploadedFile(insertedFile);
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

  const calculateValues = async (values) => {
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

    // Save calculation to Supabase
    if (uploadedFile) {
      await supabase.from("calculations").insert([
        {
          session_id: sessionId,
          file_id: uploadedFile.id,
          input_values: values,
          results
        }
      ]);
    }
  };

  const handleInputChange = (column, value) => {
    const newValues = { ...inputValues, [column]: parseFloat(value) || 0 };
    setInputValues(newValues);
    calculateValues(newValues);
  };

  const generatePDF = async () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 10;
    let yPos = margin;

    // Title
    doc.setFontSize(18);
    doc.text("QUOTATION REPORT", pageWidth / 2, yPos, { align: "center" });
    yPos += 12;

    // Date & Session
    doc.setFontSize(10);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, margin, yPos);
    yPos += 5;
    doc.text(`Reference: ${sessionId.substr(0, 15)}...`, margin, yPos);
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

    // Save quote to Supabase
    if (uploadedFile) {
      await supabase.from("quotes").insert([
        {
          session_id: sessionId,
          file_id: uploadedFile.id,
          quote_name: `Quote_${Date.now()}`
        }
      ]);
    }

    doc.save(`quotation_${Date.now()}.pdf`);
    loadSessionData();
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Pricing Dashboard</h1>
          <p className="text-gray-600">Upload Excel files, auto-generate dashboards, and create quotes</p>
          <p className="text-sm text-gray-400 mt-4">Session: {sessionId.substr(0, 20)}...</p>
        </div>

        {/* Upload Section */}
        {!uploadedFile && (
          <div className="bg-white rounded-lg shadow p-8 mb-8 border-2 border-dashed border-blue-300">
            <div className="text-center">
              <div className="text-5xl mb-4">📊</div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Upload Excel File</h2>
              <p className="text-gray-600 mb-6">Supports .xlsx and .xls files</p>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
                id="file-upload"
                disabled={loading}
              />
              <label htmlFor="file-upload">
                <button
                  onClick={() => document.getElementById("file-upload").click()}
                  disabled={loading}
                  className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 transition cursor-pointer font-semibold"
                >
                  {loading ? "Uploading..." : "Choose File"}
                </button>
              </label>
            </div>
          </div>
        )}

        {/* Dashboard Section */}
        {uploadedFile && (
          <>
            {/* File Info */}
            <div className="bg-white rounded-lg shadow p-6 mb-8">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{uploadedFile.file_name}</h2>
                  <p className="text-sm text-gray-600 mt-1">{columns.length} columns detected</p>
                </div>
                <button
                  onClick={() => {
                    setUploadedFile(null);
                    setColumns([]);
                    setFileData([]);
                    setInputValues({});
                  }}
                  className="bg-gray-300 text-gray-800 px-4 py-2 rounded hover:bg-gray-400 transition"
                >
                  Upload Different File
                </button>
              </div>
            </div>

            {/* Input Fields */}
            <div className="bg-white rounded-lg shadow p-8 mb-8">
              <h3 className="text-2xl font-bold text-gray-900 mb-6">Input Parameters</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {columns
                  .filter(col => col.type === "number")
                  .map(col => (
                    <div key={col.name}>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        {col.name}
                      </label>
                      <input
                        type="number"
                        value={inputValues[col.name] || ""}
                        onChange={(e) => handleInputChange(col.name, e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Enter value"
                      />
                    </div>
                  ))}
              </div>
            </div>

            {/* Results */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {Object.entries(calculations).map(([key, calc]) => (
                <div
                  key={key}
                  className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500"
                >
                  <p className="text-gray-600 text-sm font-medium mb-2">{key}</p>
                  <h3 className="text-3xl font-bold text-blue-600">
                    {typeof calc.value === "number"
                      ? calc.value.toFixed(2)
                      : calc.value}
                  </h3>
                  {calc.type === "calculated" && (
                    <p className="text-xs text-gray-400 mt-2">Calculated</p>
                  )}
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-4 mb-8">
              <button
                onClick={generatePDF}
                className="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition font-semibold text-lg"
              >
                📥 Download PDF Quote
              </button>
            </div>

            {/* Saved Quotes */}
            {savedQuotes.length > 0 && (
              <div className="bg-white rounded-lg shadow p-8">
                <h3 className="text-xl font-bold text-gray-900 mb-4">
                  Saved Quotes ({savedQuotes.length})
                </h3>
                <div className="space-y-2">
                  {savedQuotes.map(quote => (
                    <div
                      key={quote.id}
                      className="flex justify-between items-center p-3 bg-gray-50 rounded border border-gray-200"
                    >
                      <span className="text-gray-700">
                        {new Date(quote.created_at).toLocaleString()}
                      </span>
                      <span className="text-sm text-gray-500">{quote.quote_name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

