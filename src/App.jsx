import React, { useEffect, useState } from "react";
import Navigation from "./components/Navigation";
import Dashboard from "./components/Dashboard";
import FormulationEngine from "./components/FormulationEngine";
import SKUManagement from "./components/SKUManagement";
import QuoteBuilder from "./components/QuoteBuilder";
import ExcelIntelligence from "./components/ExcelIntelligence";
import SetupRequired from "./components/SetupRequired";
import AuthScreen from "./components/AuthScreen";
import LandingPage from "./components/LandingPage";
import HistoryPanel from "./components/HistoryPanel";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { checkSupabaseConnection, isSupabaseConfigured, supabase } from "./services/supabaseService";
import "./App.css";

function AppShell() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [pendingImport, setPendingImport] = useState(null);
  const [reopenedWorkbookRequest, setReopenedWorkbookRequest] = useState(null);
  const [readySkuImport, setReadySkuImport] = useState(null);
  const [workspaceNotice, setWorkspaceNotice] = useState(null);
  const [workspaceDataVersion, setWorkspaceDataVersion] = useState(0);
  const [supabaseStatus, setSupabaseStatus] = useState({ state: "checking" });
  const [authView, setAuthView] = useState("landing");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { session, loading: authLoading, user, signOut } = useAuth();
  const supabaseConfigured = isSupabaseConfigured();

  useEffect(() => {
    let cancelled = false;

    const verifySupabase = async () => {
      const result = await checkSupabaseConnection();

      if (!cancelled) {
        setSupabaseStatus(result.ok ? { state: "ready" } : { state: "error", ...result });
      }
    };

    verifySupabase();

    return () => {
      cancelled = true;
    };
  }, []);

  const handlePrepareImport = (payload, targetTab) => {
    setPendingImport({ ...payload, targetTab });
    setSidebarOpen(false);
  };

  const clearPendingImport = () => {
    setPendingImport(null);
  };

  const clearReopenedWorkbookRequest = () => {
    setReopenedWorkbookRequest(null);
  };

  const buildSkuImportFromLinkedDrafts = (recipe, linkedSkuDrafts, sourceUploadId = null, fallbackSnapshot = null) => {
    const recipeName = recipe?.name || recipe || fallbackSnapshot?.skuForm?.name || fallbackSnapshot?.draft?.skuName || fallbackSnapshot?.draft?.name || "";
    const sourceDraft = linkedSkuDrafts[0] || fallbackSnapshot?.draft || fallbackSnapshot?.skuForm || {};

    const linkedFormulationDraft = {
      skuName: recipeName || sourceDraft.recipeName || sourceDraft.name || sourceDraft.skuName || "",
      name: recipeName || sourceDraft.recipeName || sourceDraft.name || sourceDraft.skuName || "",
      recipeName: recipeName || sourceDraft.recipeName || sourceDraft.name || sourceDraft.skuName || "",
      recipeNameCandidates: Array.from(new Set([
        recipeName,
        sourceDraft.recipeName,
        sourceDraft.recipeNameCandidates?.[0],
        sourceDraft.name,
        sourceDraft.skuName,
      ].filter(Boolean))),
      pricingLogicType: sourceDraft.pricingLogicType || fallbackSnapshot?.draft?.pricingLogicType || "",
      sourceUploadId,
      workbookName: sourceDraft.workbookName || fallbackSnapshot?.draft?.workbookName || "Imported workbook",
      baseCostPerLiter: sourceDraft.baseCostPerLiter || fallbackSnapshot?.draft?.estimatedCostPerLiter || 0,
      currentSellingPrice: sourceDraft.currentSellingPrice || 0,
    };

    const normalizedSkuDrafts = linkedSkuDrafts.length > 0
      ? linkedSkuDrafts.map((skuDraft) => ({
        ...skuDraft,
        recipeName: recipeName || skuDraft.recipeName || linkedFormulationDraft.recipeName,
        recipeNameCandidates: Array.from(new Set([
          recipeName,
          skuDraft.recipeName,
          ...(skuDraft.recipeNameCandidates || []),
          linkedFormulationDraft.recipeName,
        ].filter(Boolean))),
      }))
      : [{
        name: sourceDraft.name || recipeName || "Imported SKU",
        category: sourceDraft.category || fallbackSnapshot?.skuForm?.category || "",
        recipeName: linkedFormulationDraft.recipeName,
        recipeNameCandidates: linkedFormulationDraft.recipeNameCandidates,
        recipeId: recipe?.id || sourceDraft.recipeId || "",
        baseCostPerLiter: sourceDraft.baseCostPerLiter || fallbackSnapshot?.draft?.estimatedCostPerLiter || 0,
        currentSellingPrice: sourceDraft.currentSellingPrice || 0,
        marginPercent: sourceDraft.marginPercent || fallbackSnapshot?.draft?.marginPercent || 0,
        pricingLogicType: sourceDraft.pricingLogicType || fallbackSnapshot?.draft?.pricingLogicType || "",
        workbookName: sourceDraft.workbookName || fallbackSnapshot?.draft?.workbookName || "Imported workbook",
        sourceUploadId,
      }];

    if (normalizedSkuDrafts.length > 1) {
      return {
        kind: "sku-batch",
        draft: normalizedSkuDrafts[0],
        drafts: normalizedSkuDrafts.map((skuDraft) => ({ skuDraft })),
        linkedFormulationDraft,
        linkedFormulationDrafts: normalizedSkuDrafts.map(() => linkedFormulationDraft),
      };
    }

    return {
      kind: "sku",
      draft: normalizedSkuDrafts[0],
      linkedFormulationDraft,
    };
  };

  const handleFormulationSaved = ({ recipe, linkedSkuDrafts = [], sourceUploadId = null, snapshot = null }) => {
    setWorkspaceDataVersion((value) => value + 1);
    setWorkspaceNotice({
      title: "Formulation created",
      message: "Ready for SKU creation. Open the SKU page to continue.",
    });

    setReadySkuImport(buildSkuImportFromLinkedDrafts(recipe, linkedSkuDrafts, sourceUploadId, snapshot));
  };

  const handleSkuImportComplete = ({ importedCount = 0 } = {}) => {
    if (importedCount > 0) {
      setWorkspaceDataVersion((value) => value + 1);
    }

    setWorkspaceNotice({
      title: importedCount > 0 ? "Dashboard ready" : "Nothing new imported",
      message:
        importedCount > 0
          ? `${importedCount} SKU${importedCount === 1 ? "" : "s"} imported and ready for analysis.`
          : "All imported SKUs already exist, so no new records were created.",
    });
  };

  const openSkuCreation = () => {
    if (readySkuImport) {
      setPendingImport(readySkuImport);
      setReadySkuImport(null);
    }

    setWorkspaceNotice(null);
    setActiveTab("skus");
    setSidebarOpen(false);
  };

  useEffect(() => {
    if (!workspaceNotice) return undefined;

    const timer = window.setTimeout(() => {
      setWorkspaceNotice(null);
    }, 6000);

    return () => window.clearTimeout(timer);
  }, [workspaceNotice]);

  const handleReuseUpload = async (upload) => {
    if (!upload?.storage_bucket || !upload?.storage_path) {
      alert("This upload does not have a workbook file attached.");
      return;
    }

    try {
      const bucketName = upload.storage_bucket || "excel-uploads";
      const { data, error } = await supabase.storage.from(bucketName).download(upload.storage_path);

      if (error) {
        throw error;
      }

      const fileName = upload.original_filename || upload.storage_path.split("/").pop() || "previous-upload.xlsx";
      const workbookFile = new File([data], fileName, {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      setReopenedWorkbookRequest({
        requestId: `${upload.id}-${Date.now()}`,
        file: workbookFile,
        uploadId: upload.id,
        originalFilename: fileName,
      });
      setActiveTab("excel");
      setSidebarOpen(false);
    } catch (downloadError) {
      console.error("Failed to reopen workbook:", downloadError);
      alert(downloadError?.message || "Failed to reopen this workbook.");
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSidebarOpen(false);
  };

  if (!supabaseConfigured) {
    return <SetupRequired />;
  }

  if (authLoading) {
    return <div className="flex min-h-screen items-center justify-center text-sm font-semibold text-slate-500">Loading workspace...</div>;
  }

  if (!session) {
    if (authView === "landing") {
      return (
        <div key="landing" className="page-transition">
          <LandingPage onSignIn={() => setAuthView("signin")} onCreateAccount={() => setAuthView("signup")} />
        </div>
      );
    }

    return (
      <div key={authView} className="page-transition">
        <AuthScreen initialMode={authView} onBackToLanding={() => setAuthView("landing")} />
      </div>
    );
  }

  return (
    <div className="app-container flex min-h-screen bg-white">
      <Navigation
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        user={user}
        onSignOut={signOut}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />
      
      <main className="main-content">
        <button
          type="button"
          className="sidebar-toggle-button"
          aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
          aria-expanded={sidebarOpen}
          onClick={() => setSidebarOpen((value) => !value)}
        >
          <span />
          <span />
          <span />
        </button>

        {supabaseStatus.state === "error" && (
          <div className="setup-warning-banner">
            <div>
              <h2>Supabase is not available to the frontend</h2>
              <p>
                {supabaseStatus.reason === "missing-config"
                  ? "The frontend build cannot see VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. Restart Vite after setting them in .env.local."
                  : `The app can read the env vars, but the Supabase probe failed: ${supabaseStatus.message}. Check the table schema, RLS policies, and project URL.`}
              </p>
            </div>
            <button type="button" onClick={() => setActiveTab("excel")} className="btn btn-primary">
              Try Excel Intelligence
            </button>
          </div>
        )}

        <div className="page-header">
          {activeTab === "dashboard" && <h1>Dashboard</h1>}
          {activeTab === "history" && <h1>History</h1>}
          {activeTab === "excel" && <h1>Excel Intelligence</h1>}
          {activeTab === "formulation" && <h1>Formulation Engine</h1>}
          {activeTab === "skus" && <h1>SKU Management</h1>}
          {activeTab === "quotes" && <h1>Quote Builder</h1>}
        </div>
        <div className="page-frame">
          <div className={activeTab === "dashboard" ? "page-transition" : ""} hidden={activeTab !== "dashboard"}>
            <Dashboard dataRefreshToken={workspaceDataVersion} />
          </div>
          <div className={activeTab === "history" ? "page-transition" : ""} hidden={activeTab !== "history"}>
            <HistoryPanel onReuseUpload={handleReuseUpload} />
          </div>
          <div className={activeTab === "excel" ? "page-transition" : ""} hidden={activeTab !== "excel"}>
            <ExcelIntelligence
              onPrepareImport={handlePrepareImport}
              externalWorkbookRequest={reopenedWorkbookRequest}
              onExternalWorkbookHandled={clearReopenedWorkbookRequest}
            />
          </div>
          <div className={activeTab === "formulation" ? "page-transition" : ""} hidden={activeTab !== "formulation"}>
            <FormulationEngine
              pendingImport={pendingImport}
              clearPendingImport={clearPendingImport}
              onFormulationSaved={handleFormulationSaved}
            />
          </div>
          <div className={activeTab === "skus" ? "page-transition" : ""} hidden={activeTab !== "skus"}>
            <SKUManagement
              pendingImport={pendingImport}
              clearPendingImport={clearPendingImport}
              onOpenFormulation={() => handleTabChange("formulation")}
              dataRefreshToken={workspaceDataVersion}
              onImportComplete={handleSkuImportComplete}
            />
          </div>
          <div className={activeTab === "quotes" ? "page-transition" : ""} hidden={activeTab !== "quotes"}>
            <QuoteBuilder />
          </div>
        </div>

        {workspaceNotice && (
          <div className="fixed bottom-5 right-5 z-50 w-[calc(100vw-2rem)] max-w-sm rounded-2xl border border-emerald-200 bg-white/95 p-4 shadow-2xl backdrop-blur md:w-full">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">Success</p>
            <h3 className="mt-1 text-base font-semibold text-slate-900">{workspaceNotice.title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{workspaceNotice.message}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={openSkuCreation} className="btn btn-primary btn-sm">
                Open SKU page
              </button>
              <button type="button" onClick={() => setWorkspaceNotice(null)} className="btn btn-secondary btn-sm">
                Dismiss
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function PricingApp() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
