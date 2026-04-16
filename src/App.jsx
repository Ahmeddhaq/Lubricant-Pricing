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
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900">
      {/* Navigation Bar */}
      <div className="border-b border-slate-800 bg-slate-950/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">P</span>
            </div>
            <span className="text-white font-bold text-xl">Pricing</span>
          </div>
          <div className="text-slate-400 text-sm">Production Ready</div>
        </div>
      </div>

      {/* Main Content */}
      <div className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Header Section */}
          <div className="mb-16 text-center">
            <h1 className="text-6xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-blue-300 to-cyan-300 mb-4">
              Pricing Dashboard
            </h1>
            <p className="text-xl text-slate-300 max-w-2xl mx-auto">
              Upload your data, auto-generate insights, and create professional quotes
            </p>
          </div>

        {/* Upload Section */}
        {!uploadedFile && (
          <div className="max-w-2xl mx-auto mb-12">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-2xl blur-xl opacity-30"></div>
              <div className="relative bg-slate-900 rounded-2xl border border-slate-700 p-16 shadow-2xl">
                <div className="text-center">
                  <div className="inline-block p-4 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-lg mb-6 border border-blue-500/30">
                    <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3v-6" />
                    </svg>
                  </div>
                  <h2 className="text-3xl font-bold text-white mb-2">Upload Excel File</h2>
                  <p className="text-slate-400 mb-10">Drag and drop or select .xlsx and .xls files</p>
                  
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
                      className="relative inline-block px-8 py-4 font-semibold text-white rounded-xl transition-all duration-300 cursor-pointer group disabled:opacity-50"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-xl blur-lg group-hover:blur-xl transition duration-300 opacity-100"></div>
                      <div className="relative px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-xl flex items-center gap-2">
                        {loading ? (
                          <>
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            Uploading...
                          </>
                        ) : (
                          <>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Select File
                          </>
                        )}
                      </div>
                    </button>
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Dashboard Section */}
        {uploadedFile && (
          <>
            {/* File Info Card */}
            <div className="mb-8">
              <div className="bg-slate-900 rounded-xl border border-slate-700 p-8 shadow-xl">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                      <p className="text-slate-400 text-sm">Active File</p>
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-1">{uploadedFile.file_name}</h2>
                    <p className="text-slate-400">{columns.length} columns detected</p>
                  </div>
                  <button
                    onClick={() => {
                      setUploadedFile(null);
                      setColumns([]);
                      setFileData([]);
                      setInputValues({});
                    }}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition text-sm font-medium border border-slate-600"
                  >
                    Change File
                  </button>
                </div>
              </div>
            </div>

            {/* Input Section */}
            <div className="mb-12">
              <div className="mb-6">
                <h3 className="text-2xl font-bold text-white">Input Parameters</h3>
                <p className="text-slate-400 text-sm mt-1">Modify values to recalculate results</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {columns
                  .filter(col => col.type === "number")
                  .map(col => (
                    <div
                      key={col.name}
                      className="group bg-slate-900 rounded-xl border border-slate-700 p-6 hover:border-blue-500/50 transition-all duration-300 shadow-lg"
                    >
                      <label className="block text-sm font-semibold text-slate-300 mb-3 group-hover:text-blue-400 transition">
                        {col.name}
                      </label>
                      <div className="relative">
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-cyan-600/20 rounded-lg opacity-0 group-hover:opacity-100 transition duration-300 blur"></div>
                        <input
                          type="number"
                          value={inputValues[col.name] || ""}
                          onChange={(e) => handleInputChange(col.name, e.target.value)}
                          className="relative w-full bg-slate-800 border border-slate-600 hover:border-blue-500/50 focus:border-blue-500 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Results Section */}
            <div className="mb-12">
              <div className="mb-6">
                <h3 className="text-2xl font-bold text-white">Results & Metrics</h3>
                <p className="text-slate-400 text-sm mt-1">Auto-calculated from your inputs</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Object.entries(calculations).map(([key, calc], idx) => (
                  <div
                    key={key}
                    className="relative group"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-cyan-600/20 rounded-xl blur-xl opacity-0 group-hover:opacity-100 transition duration-300"></div>
                    <div className="relative bg-slate-900 rounded-xl border border-slate-700 p-8 shadow-xl hover:shadow-2xl transition-all duration-300 group-hover:border-blue-500/30">
                      <div className="flex justify-between items-start mb-4">
                        <p className="text-slate-400 text-sm font-medium">{key}</p>
                        {calc.type === "calculated" && (
                          <span className="px-2.5 py-1 bg-blue-500/20 border border-blue-500/30 rounded text-xs text-blue-300 font-medium">
                            Auto
                          </span>
                        )}
                      </div>
                      <h4 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
                        {typeof calc.value === "number"
                          ? calc.value.toFixed(2)
                          : calc.value}
                      </h4>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Action Button */}
            <div className="mb-12">
              <button
                onClick={generatePDF}
                className="w-full relative group"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-green-600 to-emerald-600 rounded-xl blur-lg group-hover:blur-xl transition duration-300 opacity-100 group-hover:opacity-110"></div>
                <div className="relative w-full px-8 py-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 rounded-xl font-semibold text-white text-lg transition-all duration-300 flex items-center justify-center gap-2 shadow-xl">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download PDF Quote
                </div>
              </button>
            </div>

            {/* Saved Quotes */}
            {savedQuotes.length > 0 && (
              <div className="bg-slate-900 rounded-xl border border-slate-700 p-8 shadow-xl">
                <h3 className="text-2xl font-bold text-white mb-2">Quote History</h3>
                <p className="text-slate-400 text-sm mb-6">Your generated quotes</p>
                <div className="space-y-3">
                  {savedQuotes.map((quote, idx) => (
                    <div
                      key={quote.id}
                      className="flex justify-between items-center p-4 bg-slate-800/50 rounded-lg border border-slate-700 hover:bg-slate-800 hover:border-blue-500/30 transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <div>
                          <p className="text-slate-200 font-medium text-sm">
                            Quote {savedQuotes.length - idx}
                          </p>
                          <p className="text-slate-500 text-xs">
                            {new Date(quote.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <span className="text-slate-400 text-xs font-mono">{quote.quote_name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
    </div>
  );
}

