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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-sm border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">P</span>
              </div>
              <div>
                <h1 className="font-bold text-gray-900 text-lg">Pricing Pro</h1>
                <p className="text-xs text-gray-500">Dashboard</p>
              </div>
            </div>
            {uploadedFile && (
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">{uploadedFile.file_name}</p>
                <p className="text-xs text-gray-500">{columns.length} columns</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <main className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          {!uploadedFile ? (
            <>
              {/* Hero */}
              <div className="text-center mb-16">
                <h2 className="text-5xl font-bold text-gray-900 mb-4">Upload & Calculate</h2>
                <p className="text-xl text-gray-600">Drop your Excel file and generate professional quotes in seconds</p>
              </div>

              {/* Upload Box */}
              <div className="max-w-2xl mx-auto">
                <div className="bg-white rounded-2xl border-2 border-dashed border-blue-300 p-16 text-center shadow-sm hover:shadow-lg hover:border-blue-400 transition-all">
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileUpload}
                    id="file-upload"
                    disabled={loading}
                    className="absolute opacity-0 w-0 h-0"
                  />
                  
                  <div className="mb-6">
                    <svg className="w-20 h-20 mx-auto text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3v-6" />
                    </svg>
                  </div>

                  <h3 className="text-2xl font-bold text-gray-900 mb-2">Select Your File</h3>
                  <p className="text-gray-600 mb-8">Supports .xlsx and .xls formats</p>

                  <button
                    onClick={() => document.getElementById("file-upload").click()}
                    disabled={loading}
                    type="button"
                    className="px-8 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 cursor-pointer"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Uploading...
                      </span>
                    ) : (
                      "Choose File"
                    )}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Upload Info Bar */}
              <div className="bg-white rounded-xl p-4 mb-8 flex justify-between items-center border border-slate-200 shadow-sm">
                <div>
                  <p className="text-sm text-gray-600">Loaded file</p>
                  <p className="font-semibold text-gray-900">{uploadedFile.file_name}</p>
                </div>
                <button
                  onClick={() => {
                    setUploadedFile(null);
                    setColumns([]);
                    setFileData([]);
                    setInputValues({});
                  }}
                  className="px-4 py-2 bg-slate-100 text-gray-700 rounded-lg hover:bg-slate-200 transition text-sm font-medium"
                >
                  Change
                </button>
              </div>

              {/* Inputs Grid */}
              <div className="mb-12">
                <h3 className="text-2xl font-bold text-gray-900 mb-6">Parameters</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {columns
                    .filter(col => col.type === "number")
                    .map(col => (
                      <div key={col.name} className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-all">
                        <label className="block text-sm font-semibold text-gray-900 mb-3">
                          {col.name}
                        </label>
                        <input
                          type="number"
                          value={inputValues[col.name] || ""}
                          onChange={(e) => handleInputChange(col.name, e.target.value)}
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-400"
                          placeholder="Enter value"
                        />
                      </div>
                    ))}
                </div>
              </div>

              {/* Results Grid */}
              <div className="mb-12">
                <h3 className="text-2xl font-bold text-gray-900 mb-6">Results</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {Object.entries(calculations).map(([key, calc]) => (
                    <div key={key} className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-all">
                      <p className="text-sm text-gray-600 mb-2">{key}</p>
                      <p className="text-3xl font-bold text-blue-600 mb-2">
                        {typeof calc.value === "number" ? calc.value.toFixed(2) : calc.value}
                      </p>
                      {calc.type === "calculated" && (
                        <span className="inline-block text-xs bg-blue-100 text-blue-700 px-2.5 py-1 rounded font-medium">
                          Calculated
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* CTA Button */}
              <button
                onClick={generatePDF}
                className="w-full py-4 bg-blue-600 text-white font-bold text-lg rounded-xl hover:bg-blue-700 transition-all shadow-lg hover:shadow-xl mb-12"
              >
                ↓ Download PDF Quote
              </button>

              {/* Quote History */}
              {savedQuotes.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm">
                  <h3 className="text-xl font-bold text-gray-900 mb-6">Recent Quotes</h3>
                  <div className="space-y-3">
                    {savedQuotes.slice(0, 5).map((quote, i) => (
                      <div
                        key={quote.id}
                        className="flex items-center justify-between p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition"
                      >
                        <div>
                          <p className="font-medium text-gray-900">Quote #{savedQuotes.length - i}</p>
                          <p className="text-sm text-gray-500">{new Date(quote.created_at).toLocaleString()}</p>
                        </div>
                        <span className="text-xs font-mono text-gray-400">{quote.quote_name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

