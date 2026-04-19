import React, { useEffect, useRef, useState } from "react";
import { skusService, recipesService, recipeIngredientsService, baseOilsService, additivesService, costingEngine } from "../services/supabaseService";
import { historyService } from "../services/historyService";

function normalizeName(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function getSkuIdentity(sku) {
  return [
    normalizeName(sku?.name),
    normalizeName(sku?.category),
    String(sku?.recipe_id || ""),
    String(Number(sku?.pack_size_liters || 0)),
    normalizeName(sku?.pack_description),
  ].join("|");
}

function dedupeLatestSkus(records) {
  return [...records]
    .sort((left, right) => new Date(right.updated_at || right.created_at || 0) - new Date(left.updated_at || left.created_at || 0))
    .filter((record, index, array) => array.findIndex((candidate) => getSkuIdentity(candidate) === getSkuIdentity(record)) === index);
}

function average(values) {
  const numericValues = values.map((value) => Number(value)).filter((value) => Number.isFinite(value));
  if (!numericValues.length) return 0;
  return numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
}

function getRecipeNameById(recipes, recipeId) {
  return recipes.find((recipe) => recipe.id === recipeId)?.name || "";
}

const DEFAULT_MARGIN_THRESHOLD = 15;
const DEFAULT_SKU_FLAGS = {
  isActive: true,
  priceOverride: false,
};

export default function SKUManagement({ pendingImport, clearPendingImport, onOpenFormulation, dataRefreshToken, onImportComplete }) {
  const [skus, setSkus] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [baseOils, setBaseOils] = useState([]);
  const [additives, setAdditives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("list");
  const [selectedSku, setSelectedSku] = useState(null);

  // SKU Form Data
  const [skuForm, setSkuForm] = useState({
    name: "",
    category: "",
    recipe_id: "",
    baseCostPerLiter: 0,
    currentSellingPrice: 0,
  });

  // Pack Configuration
  const [packConfigs, setPackConfigs] = useState({
    "1L": { size: 1, unitsPerCarton: 12, packagingCost: 0.5, sellingPrice: 0 },
    "4L": { size: 4, unitsPerCarton: 4, packagingCost: 1.0, sellingPrice: 0 },
    "20L": { size: 20, unitsPerCarton: 1, packagingCost: 3.0, sellingPrice: 0 },
    "200L": { size: 200, unitsPerCarton: 1, packagingCost: 15.0, sellingPrice: 0 },
  });

  // Pricing Matrix
  const [pricingMatrix, setPricingMatrix] = useState({
    byMarket: { GCC: 0, Africa: 0, Asia: 0 },
    byCustomer: { Distributor: 0, Bulk: 0, Retail: 0 },
  });

  // Cost Build-Up
  const [costBreakup, setCostBreakup] = useState({
    blendCost: 0,
    packagingCost: 0,
    logisticsCost: 0,
    overheadAllocation: 0,
  });

  const marginThreshold = DEFAULT_MARGIN_THRESHOLD;

  const importedSkuDrafts = pendingImport?.kind === "sku-batch"
    ? (pendingImport.drafts || []).map((draft) => draft?.skuDraft || draft).filter(Boolean)
    : pendingImport?.kind === "sku"
      ? [pendingImport.draft]
      : [];
  const importedSkuDraft = importedSkuDrafts[0] || null;
  const linkedFormulationDrafts = pendingImport?.linkedFormulationDrafts || (pendingImport?.linkedFormulationDraft ? [pendingImport.linkedFormulationDraft] : []);
  const hasAccessibleBaseOils = baseOils.length > 0;
  const pendingImportSignature = importedSkuDrafts.length
    ? [
        pendingImport?.kind || "pending",
        importedSkuDrafts
          .map((draft) => draft?.name || draft?.recipeName || draft?.formulationName || draft?.skuName || "")
          .join("||"),
        linkedFormulationDrafts
          .map((draft) => draft?.name || draft?.recipeName || draft?.skuName || "")
          .join("||"),
      ].join("::")
    : "";
  const [importingBatch, setImportingBatch] = useState(false);
  const [linkedMatchConfirmed, setLinkedMatchConfirmed] = useState(false);
  const [creatingLinkedRecipe, setCreatingLinkedRecipe] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState("success"); // success, info, error
  const importInProgressRef = useRef(false);
  const autoImportTriggeredRef = useRef("");

  useEffect(() => {
    loadData();
  }, [dataRefreshToken]);

  useEffect(() => {
    if (!importedSkuDraft || !recipes.length || !hasAccessibleBaseOils) return;

    if (!skuForm.recipe_id) {
      const matchedRecipe = findMatchingRecipe(importedSkuDraft, linkedFormulationDrafts[0]);
      if (matchedRecipe) {
        setSkuForm((current) => ({ ...current, recipe_id: matchedRecipe.id }));
        setLinkedMatchConfirmed(false);
        return;
      }

      if (creatingLinkedRecipe) {
        return;
      }

      let cancelled = false;
      const autoCreateRecipe = async () => {
        try {
          setCreatingLinkedRecipe(true);
          const createdRecipe = await createRecipeFromDraft(importedSkuDraft, linkedFormulationDrafts[0]);
          if (!cancelled && createdRecipe) {
            setSkuForm((current) => ({ ...current, recipe_id: createdRecipe.id }));
            setLinkedMatchConfirmed(false);
          }
        } catch (err) {
          console.error("Failed to auto-create formulation from workbook:", err);
        } finally {
          if (!cancelled) {
            setCreatingLinkedRecipe(false);
          }
        }
      };

      autoCreateRecipe();

      return () => {
        cancelled = true;
      };
    }
  }, [importedSkuDraft, linkedFormulationDrafts, recipes, skuForm.recipe_id, creatingLinkedRecipe]);

  useEffect(() => {
    setLinkedMatchConfirmed(false);
  }, [importedSkuDraft?.name, importedSkuDraft?.recipeName, skuForm.recipe_id]);

  useEffect(() => {
    if (!pendingImportSignature) {
      autoImportTriggeredRef.current = "";
    }
  }, [pendingImportSignature]);

  // Auto-import when all recipes are ready for batch imports
  useEffect(() => {
    if (
      !pendingImportSignature ||
      !hasAccessibleBaseOils ||
      creatingLinkedRecipe ||
      importingBatch ||
      importedSkuDrafts.length === 1 // Only auto-import batch (2+)
    ) {
      return;
    }

    if (autoImportTriggeredRef.current === pendingImportSignature) {
      return;
    }

    autoImportTriggeredRef.current = pendingImportSignature;

    console.log("🔍 Checking if auto-import should trigger...");
    console.log("importedSkuDrafts:", importedSkuDrafts.length);
    console.log("recipes:", recipes.length);
    console.log("creatingLinkedRecipe:", creatingLinkedRecipe);

    // Show summary in console
    const skuSummary = importedSkuDrafts
      .map((d) => `• ${d.name} (${Number(d.baseCostPerLiter || 0).toFixed(2)} AED/L)`)
      .join("\n");
    console.log("📊 Ready to auto-import SKUs:\n" + skuSummary);
    
    // Auto-trigger import with a small delay to ensure state is settled
    const timer = window.setTimeout(() => {
      console.log("🚀 Triggering auto-import...");
      handleImportDrafts();
    }, 500);

    return () => window.clearTimeout(timer);
  }, [pendingImportSignature, hasAccessibleBaseOils, creatingLinkedRecipe, importingBatch, importedSkuDrafts.length, recipes.length]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [skusData, recipesData, baseOilsData, additivesData] = await Promise.all([
        skusService.getAll(),
        recipesService.getAll(),
        baseOilsService.getAll(),
        additivesService.getAll(),
      ]);
      setSkus(dedupeLatestSkus(skusData));
      setRecipes(recipesData);
      setBaseOils(baseOilsData);
      setAdditives(additivesData);
    } catch (err) {
      console.error("Error loading data:", err);
      alert("Failed to load SKU data. Check that Supabase is configured and that skus and recipes tables exist.");
    } finally {
      setLoading(false);
    }
  };

  // Calculate metrics
  const calculateMargin = (cost, price) => {
    if (price === 0) return 0;
    return ((price - cost) / price) * 100;
  };

  const calculateTotalCostPerPack = (packSize) => {
    const config = packConfigs[packSize];
    if (!config) return 0;
    const blendCostForPack = costBreakup.blendCost * config.size;
    const packagingCostPerUnit = config.packagingCost / config.unitsPerCarton;
    const logisticsCostPerUnit = costBreakup.logisticsCost / config.unitsPerCarton;
    const overheadPerUnit = costBreakup.overheadAllocation / config.unitsPerCarton;
    return blendCostForPack + packagingCostPerUnit + logisticsCostPerUnit + overheadPerUnit;
  };

  const calculatePackMargin = (packSize) => {
    const totalCost = calculateTotalCostPerPack(packSize);
    const config = packConfigs[packSize];
    return calculateMargin(totalCost, config.sellingPrice || 0);
  };

  const getDefaultPackConfig = () => {
    const [packName, config] = Object.entries(packConfigs)[0] || ["1L", { size: 1, packagingCost: 0 }];
    return {
      packName,
      config: config || { size: 1, packagingCost: 0 },
    };
  };

  const buildSkuCreatePayload = ({ draft = {}, recipeId = "" } = {}) => {
    const { packName, config } = getDefaultPackConfig();
    const packSizeLiters = Number(config.size || 1) || 1;

    return {
      name: draft.name || skuForm.name || "Imported SKU",
      category: draft.category || skuForm.category || "",
      recipe_id: recipeId || skuForm.recipe_id || draft.recipeId || "",
      pack_size_liters: packSizeLiters,
      pack_description: draft.packDescription || `${packName} pack`,
      packaging_cost_per_unit: Number(config.packagingCost || 0),
      base_cost_per_liter: parseFloat(draft.baseCostPerLiter ?? skuForm.baseCostPerLiter) || 0,
      current_selling_price: parseFloat(draft.currentSellingPrice ?? skuForm.currentSellingPrice) || 0,
      margin_threshold: marginThreshold,
      is_active: DEFAULT_SKU_FLAGS.isActive,
      price_override: DEFAULT_SKU_FLAGS.priceOverride,
    };
  };

  const buildRecipeCandidateNames = (draft, linkedDraft) => [
    draft?.recipeName,
    draft?.formulationName,
    draft?.linkedFormulation,
    draft?.name,
    ...(draft?.recipeNameCandidates || []),
    linkedDraft?.skuName,
    linkedDraft?.name,
    ...(linkedDraft?.recipeNameCandidates || []),
  ].filter(Boolean).map(normalizeName);

  const findMatchingRecipe = (draft, linkedDraft) => {
    const candidateNames = buildRecipeCandidateNames(draft, linkedDraft);
    return recipes.find((recipe) => {
      const recipeName = normalizeName(recipe.name);
      return candidateNames.some((candidate) => recipeName === candidate || recipeName.includes(candidate) || candidate.includes(recipeName));
    }) || null;
  };

  const pickBaseOilId = (linkedDraft) => {
    if (baseOils.length === 0) return "";

    const candidateNames = [
      linkedDraft?.baseOilName,
      linkedDraft?.baseOil,
      linkedDraft?.baseOilCandidate,
      linkedDraft?.baseOilType,
    ].filter(Boolean).map(normalizeName);

    const matchedBaseOil = baseOils.find((entry) => {
      const baseOilName = normalizeName(entry.name);
      return candidateNames.some((candidate) => baseOilName === candidate || baseOilName.includes(candidate) || candidate.includes(baseOilName));
    });

    return matchedBaseOil?.id || baseOils[0]?.id || "";
  };

  const ensureBaseOilId = async (linkedDraft) => {
    const pickedBaseOilId = pickBaseOilId(linkedDraft);
    return pickedBaseOilId || "";
  };

  const createRecipeFromDraft = async (draft, linkedDraft) => {
    const existingRecipe = findMatchingRecipe(draft, linkedDraft);
    if (existingRecipe) return existingRecipe;

    const recipeName = [
      draft?.recipeName,
      draft?.formulationName,
      draft?.name,
      linkedDraft?.skuName,
      linkedDraft?.name,
      ...(draft?.recipeNameCandidates || []),
      ...(linkedDraft?.recipeNameCandidates || []),
    ].filter(Boolean)[0] || `Imported ${draft?.name || linkedDraft?.skuName || linkedDraft?.name || "Formulation"}`;

    const baseOilId = await ensureBaseOilId(linkedDraft);

    if (!baseOilId) return null;

    const createdRecipe = await recipesService.create({
      name: recipeName,
      description: linkedDraft?.pricingLogicType || draft?.pricingLogicType || "Imported from Excel",
      status: "active",
      base_oil_id: baseOilId,
      blending_cost_per_liter: Number(linkedDraft?.estimatedCostPerLiter || draft?.baseCostPerLiter || 0) || 0,
    });

    const sourceComponents = (linkedDraft?.components && linkedDraft.components.length > 0) ? linkedDraft.components : (draft?.components || []);
    for (const component of sourceComponents) {
      const componentName = normalizeName(component.name || component.component || "");
      if (!componentName || /base oil/i.test(component.type || "") || /base oil/i.test(componentName)) {
        continue;
      }

      const matchedAdditive = additives.find((entry) => {
        const additiveName = normalizeName(entry.name);
        return additiveName === componentName || additiveName.includes(componentName) || componentName.includes(additiveName);
      });

      const quantityPerLiter = Number(component.percentage ?? component.share ?? 0) / 100;
      if (!matchedAdditive || quantityPerLiter <= 0) continue;

      await recipeIngredientsService.addIngredient(createdRecipe.id, matchedAdditive.id, quantityPerLiter);
    }

    await loadData();
    return createdRecipe;
  };

  const resolveRecipeIdForDraft = (draft) => {
    const candidateNames = [
      draft?.recipeName,
      draft?.formulationName,
      draft?.linkedFormulation,
      ...(draft?.recipeNameCandidates || []),
      ...linkedFormulationDrafts.flatMap((item) => [item?.skuName, item?.name]),
    ].filter(Boolean).map(normalizeName);
    const matchedRecipe = recipes.find((recipe) => {
      const recipeName = normalizeName(recipe.name);
      return candidateNames.some((candidate) => recipeName === candidate || recipeName.includes(candidate) || candidate.includes(recipeName));
    });
    return matchedRecipe?.id || "";
  };

  const useFormSummary = Boolean(importedSkuDraft) ? false : activeTab === "create" || !selectedSku;
  const totalCostPerLiter = costBreakup.blendCost + costBreakup.packagingCost + costBreakup.logisticsCost + costBreakup.overheadAllocation;
  const packEntries = Object.entries(packConfigs);
  const marketEntries = Object.entries(pricingMatrix.byMarket);
  const customerEntries = Object.entries(pricingMatrix.byCustomer);
  const livePackPrices = packEntries.map(([, config]) => Number(config.sellingPrice || 0)).filter((price) => price > 0);

  const summaryName = importedSkuDraft?.name || (useFormSummary ? skuForm.name : selectedSku?.name) || "New SKU";
  const summaryCategory = importedSkuDraft?.category || (useFormSummary ? skuForm.category : selectedSku?.category) || "-";
  const summaryBaseCost = Number(
    importedSkuDraft?.baseCostPerLiter ?? (useFormSummary ? skuForm.baseCostPerLiter : selectedSku?.base_cost_per_liter) ?? 0,
  );

  const summarySellingPrice = importedSkuDraft
      ? Number(importedSkuDraft.currentSellingPrice ?? 0)
      : useFormSummary
        ? Number(skuForm.currentSellingPrice || (livePackPrices.length ? average(livePackPrices) : 0) || 0)
        : Number(selectedSku?.current_selling_price ?? 0);

  const pricedPackMargins = packEntries
    .filter(([, config]) => Number(config.sellingPrice || 0) > 0)
    .map(([packName]) => calculatePackMargin(packName));
  const summaryAveragePrice = summarySellingPrice || (livePackPrices.length ? average(livePackPrices) : 0);
  const summaryAverageMargin = importedSkuDraft
      ? Number(importedSkuDraft.marginPercent ?? 0)
      : useFormSummary
        ? (pricedPackMargins.length
          ? average(pricedPackMargins.filter((margin) => Number.isFinite(margin)))
          : calculateMargin(summaryBaseCost, summaryAveragePrice))
        : calculateMargin(summaryBaseCost, summarySellingPrice);

  const summaryRecipeId = importedSkuDraft
    ? resolveRecipeIdForDraft(importedSkuDraft)
    : useFormSummary
      ? skuForm.recipe_id
      : selectedSku?.recipe_id || "";
  const summaryLinkedFormulationName = importedSkuDraft
    ? getRecipeNameById(recipes, resolveRecipeIdForDraft(importedSkuDraft)) || importedSkuDraft.recipeName || importedSkuDraft.recipeNameCandidates?.[0] || ""
    : useFormSummary
      ? getRecipeNameById(recipes, skuForm.recipe_id)
      : selectedSku
        ? selectedSku.recipes?.name || getRecipeNameById(recipes, selectedSku.recipe_id)
        : "";

  const workbookFormulationName = linkedFormulationDrafts[0]?.skuName || linkedFormulationDrafts[0]?.name || "";

  const lowMarginPacks = packEntries
    .filter(([packName, config]) => Number(config.sellingPrice || 0) > 0 && calculatePackMargin(packName) < marginThreshold)
    .map(([packName]) => packName);
  const packWarningMessage = lowMarginPacks.length > 0 ? `Margin below ${marginThreshold}% on ${lowMarginPacks.join(", ")}` : "";
  const costWarningItems = [
    !costBreakup.blendCost ? "Blend cost missing" : null,
    !costBreakup.packagingCost ? "Packaging cost missing" : null,
    !costBreakup.logisticsCost ? "Logistics cost missing" : null,
    !costBreakup.overheadAllocation ? "Overhead missing" : null,
  ].filter(Boolean);

  const handleImportDrafts = async () => {
    if (importInProgressRef.current) return;
    if (!importedSkuDrafts.length) return;
    if (!hasAccessibleBaseOils) {
      setToastMessage("No base oils available yet. Add at least one base_oils row to Supabase before importing.");
      setToastType("error");
      setShowToast(true);
      setTimeout(() => setShowToast(false), 5000);
      return;
    }

    importInProgressRef.current = true;
    const draftsToImport = [...importedSkuDrafts];
    const linkedDraftsToUse = [...linkedFormulationDrafts];
    const existingSkuKeys = new Set(
      skus.map((sku) => [
        getSkuIdentity(sku),
        Number(sku.packaging_cost_per_unit || 0),
      ].join("|")),
    );
    const resolvedDrafts = [];
    const unresolvedDrafts = [];

    setImportingBatch(true);

    try {
      for (const [index, draft] of draftsToImport.entries()) {
        const linkedDraft = linkedDraftsToUse[index] || linkedDraftsToUse[0] || null;
        let recipeId = resolveRecipeIdForDraft(draft);

        if (!recipeId) {
          const createdRecipe = await createRecipeFromDraft(draft, linkedDraft);
          recipeId = createdRecipe?.id || "";
        }

        if (recipeId) {
          resolvedDrafts.push({ draft, recipeId });
        } else {
          unresolvedDrafts.push(draft);
        }
      }

      if (resolvedDrafts.length === 0) {
        const unresolvedNames = unresolvedDrafts
          .map((draft) => draft.name || draft.recipeName || draft.formulationName || draft.recipeNameCandidates?.[0] || "Unnamed SKU")
          .join(", ");
        setToastMessage(`Could not create formulations for: ${unresolvedNames}`);
        setToastType("error");
        setShowToast(true);
        setTimeout(() => setShowToast(false), 5000);
        return;
      }

      let insertedCount = 0;
      for (const { draft, recipeId } of resolvedDrafts) {
        const payload = buildSkuCreatePayload({ draft, recipeId });
        const payloadKey = [
          getSkuIdentity(payload),
          Number(payload.packaging_cost_per_unit || 0),
        ].join("|");

        if (existingSkuKeys.has(payloadKey)) {
          console.warn(`Skipping duplicate SKU import: ${payload.name}`);
          continue;
        }

        existingSkuKeys.add(payloadKey);
        await skusService.create(payload);
        insertedCount += 1;
      }

      if (insertedCount === 0) {
        setToastMessage("All imported SKUs already exist. No new records were created.");
        setToastType("info");
        setShowToast(true);
        setTimeout(() => setShowToast(false), 5000);
        if (onImportComplete) onImportComplete({ importedCount: 0, skippedCount: resolvedDrafts.length });
        if (clearPendingImport) clearPendingImport();
        return;
      }

      await loadData();

      if (clearPendingImport) clearPendingImport();

      const message = `✓ Dashboard Ready for Analysis! ${resolvedDrafts.length} SKU${resolvedDrafts.length === 1 ? "" : "s"} imported.`;
      setToastMessage(message);
      setToastType("success");
      setShowToast(true);
      setTimeout(() => setShowToast(false), 5000);

      if (unresolvedDrafts.length > 0) {
        const unresolvedNames = unresolvedDrafts
          .map((draft) => draft.name || draft.recipeName || draft.formulationName || draft.recipeNameCandidates?.[0] || "Unnamed SKU")
          .join(", ");
        console.warn(`These still need a formulation match: ${unresolvedNames}`);
      }

      if (onImportComplete) onImportComplete({ importedCount: insertedCount, skippedCount: resolvedDrafts.length - insertedCount });
    } catch (err) {
      console.error("Error bulk importing SKUs:", err);
      setToastMessage(`Import failed: ${err?.message || "Unknown error"}`);
      setToastType("error");
      setShowToast(true);
      setTimeout(() => setShowToast(false), 5000);
    } finally {
      setImportingBatch(false);
      importInProgressRef.current = false;
    }
  };

  const handleCreateSku = async (e) => {
    e.preventDefault();
    if (!skuForm.name || !skuForm.recipe_id || !skuForm.category) {
      alert("Please fill all required fields");
      return;
    }

    if (importedSkuDraft && !linkedMatchConfirmed) {
      alert("Confirm the formulation match before creating the SKU.");
      return;
    }

    try {
      await skusService.create(buildSkuCreatePayload({
        draft: {
          name: skuForm.name,
          category: skuForm.category,
          baseCostPerLiter: skuForm.baseCostPerLiter,
          currentSellingPrice: skuForm.currentSellingPrice,
        },
        recipeId: skuForm.recipe_id,
      }));

      setSkuForm({ name: "", category: "", recipe_id: "", baseCostPerLiter: 0, currentSellingPrice: 0 });
      setActiveTab("list");
      await loadData();
      alert("SKU created successfully!");
    } catch (err) {
      console.error("Error creating SKU:", err);
      alert("Failed to create SKU");
    }
  };

  const handleConfirmLinkedMatch = () => {
    if (!skuForm.recipe_id) {
      alert("Choose a formulation first.");
      return;
    }

    setLinkedMatchConfirmed(true);
  };

  const handleSelectSku = (sku) => {
    setSelectedSku(sku);
    setActiveTab("list");
  };

  const applyImportedDraft = async () => {
    if (!importedSkuDraft) return;

    const configSnapshot = {
      skuForm: {
        name: importedSkuDraft.name || "",
        category: importedSkuDraft.category || "",
        recipe_id: resolveRecipeIdForDraft(importedSkuDraft) || importedSkuDraft.recipeId || "",
        baseCostPerLiter: importedSkuDraft.baseCostPerLiter || 0,
        currentSellingPrice: importedSkuDraft.currentSellingPrice || 0,
      },
      packConfigs,
      pricingMatrix,
      costBreakup,
      marginThreshold,
      sourceUploadId: importedSkuDraft.sourceUploadId || null,
    };

    setSkuForm(configSnapshot.skuForm);
    setActiveTab("create");

    try {
      await historyService.recordConfigVersion({
        configName: `${configSnapshot.skuForm.name || "SKU"} configuration`,
        configType: "sku",
        configVersion: 1,
        configData: configSnapshot,
        sourceUploadId: configSnapshot.sourceUploadId,
        notes: importedSkuDraft.workbookName || "Imported SKU draft",
      });
    } catch (historyError) {
      console.error("Failed to save SKU history:", historyError);
    }

    if (clearPendingImport) {
      clearPendingImport();
    }
  };

  if (loading) return <div className="p-6 text-center">Loading...</div>;

  return (
    <div className="page-stack">
      {/* Toast Notification */}
      {showToast && (
        <div
          className={`fixed top-4 right-4 z-50 rounded-lg px-6 py-4 shadow-lg transition-all duration-300 ${
            toastType === "success"
              ? "bg-green-50 border border-green-200"
              : toastType === "error"
              ? "bg-red-50 border border-red-200"
              : "bg-blue-50 border border-blue-200"
          }`}
        >
          <p
            className={`text-sm font-semibold ${
              toastType === "success"
                ? "text-green-900"
                : toastType === "error"
                ? "text-red-900"
                : "text-blue-900"
            }`}
          >
            {toastMessage}
          </p>
        </div>
      )}

      <section className="page-section">
        <div className="content-card border-slate-200 bg-slate-50/80">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="section-title">SKU Summary</h2>
              <p className="section-subtitle">
                Compact context for the product you are configuring.
              </p>
            </div>

            <button
              type="button"
              onClick={() => onOpenFormulation && summaryRecipeId && onOpenFormulation()}
              disabled={!summaryRecipeId || !onOpenFormulation}
              className="btn btn-secondary"
            >
              View formulation
            </button>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            {[
              { label: "SKU Name", value: summaryName },
              { label: "Category", value: summaryCategory },
              { label: "Linked Formulation", value: summaryLinkedFormulationName || "Not selected" },
              { label: "Base Cost/L", value: `$${summaryBaseCost.toFixed(2)}` },
              { label: "Avg Selling Price", value: `$${summaryAveragePrice.toFixed(2)}` },
              { label: "Avg Margin", value: `${summaryAverageMargin.toFixed(1)}%` },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                <p className="mt-2 text-base font-semibold text-slate-900">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {importedSkuDraft && (
        <section className="page-section">
          <div className="content-card border-amber-300 bg-amber-50/70">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="section-title">Imported SKU Draft</h2>
                <p className="section-subtitle">
                  Excel detected a sellable SKU draft for {importedSkuDraft.name}. Nothing has been saved yet.
                </p>
                {!summaryLinkedFormulationName && workbookFormulationName && (
                  <p className="mt-2 text-sm font-semibold text-amber-900">
                    Workbook formulation draft detected: {workbookFormulationName}. Save that formulation first, then return here to confirm the SKU link.
                  </p>
                )}
                {importedSkuDrafts.length > 1 && (
                  <p className="mt-2 text-sm font-semibold text-amber-900">
                    {importedSkuDrafts.length} SKUs detected in this workbook.
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-amber-900">
                  <span className="rounded-full bg-amber-100 px-3 py-1">Cost / L: ${Number(importedSkuDraft.baseCostPerLiter || 0).toFixed(2)}</span>
                  <span className="rounded-full bg-amber-100 px-3 py-1">Excel margin: {Number(importedSkuDraft.marginPercent || 0).toFixed(1)}%</span>
                  <span className="rounded-full bg-amber-100 px-3 py-1">Logic: {importedSkuDraft.pricingLogicType}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {!hasAccessibleBaseOils && (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <p className="text-sm font-semibold text-amber-900">
                      No base oils are accessible yet. Import is blocked until base_oils rows exist in Supabase.
                    </p>
                    <button
                      type="button"
                      onClick={loadData}
                      className="btn btn-secondary whitespace-nowrap"
                    >
                      🔄 Refresh Data
                    </button>
                  </div>
                )}
                {importedSkuDrafts.length > 1 ? (
                  <button type="button" onClick={handleImportDrafts} disabled={importingBatch || !hasAccessibleBaseOils} className="btn btn-primary">
                    {importingBatch ? "Importing..." : `Import All ${importedSkuDrafts.length} SKUs`}
                  </button>
                ) : (
                  <button type="button" onClick={applyImportedDraft} disabled={!hasAccessibleBaseOils} className="btn btn-primary">
                    Load into Create Form
                  </button>
                )}
                {onOpenFormulation && !summaryRecipeId && workbookFormulationName && (
                  <button type="button" onClick={onOpenFormulation} className="btn btn-secondary">
                    Open formulation first
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => clearPendingImport && clearPendingImport()}
                  className="btn btn-secondary"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="page-section">
        <h2 className="section-title">Pack Configuration</h2>
        {packWarningMessage && (
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
              {packWarningMessage}
            </span>
          </div>
        )}
        <div className="content-card overflow-x-auto">
          <table className="min-w-full sku-compact-table sku-pack-table">
            <thead>
              <tr>
                <th>Pack</th>
                <th>Units / Carton</th>
                <th>Packaging Cost</th>
                <th>Final Cost / Pack</th>
                <th>Selling Price</th>
                <th>Margin</th>
              </tr>
            </thead>
            <tbody>
              {packEntries.map(([packName, config]) => {
                const totalCost = calculateTotalCostPerPack(packName);
                const margin = calculatePackMargin(packName);
                const hasSellingPrice = Number(config.sellingPrice || 0) > 0;
                const marginHealthy = hasSellingPrice && margin >= marginThreshold;
                const marginLabel = hasSellingPrice ? `${margin.toFixed(1)}%` : "—";

                return (
                  <tr key={packName} className={!marginHealthy && hasSellingPrice ? "bg-red-50" : ""}>
                    <td>
                      <div className="flex flex-col">
                        <span className="font-semibold text-gray-900">{packName}</span>
                        <span className="text-xs text-gray-500">{config.size}L pack</span>
                      </div>
                    </td>
                    <td>
                      <input
                        type="number"
                        step="1"
                        value={config.unitsPerCarton}
                        onChange={(e) => setPackConfigs({
                          ...packConfigs,
                          [packName]: { ...config, unitsPerCarton: parseFloat(e.target.value) || 0 },
                        })}
                        className="w-24 px-2 py-1 border border-gray-300 rounded text-right font-semibold"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        value={config.packagingCost}
                        onChange={(e) => setPackConfigs({
                          ...packConfigs,
                          [packName]: { ...config, packagingCost: parseFloat(e.target.value) || 0 },
                        })}
                        className="w-28 px-2 py-1 border border-gray-300 rounded text-right font-semibold"
                      />
                    </td>
                    <td className="font-semibold text-gray-900">${totalCost.toFixed(2)}</td>
                    <td>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="number"
                          step="0.01"
                          value={config.sellingPrice}
                          onChange={(e) => setPackConfigs({
                            ...packConfigs,
                            [packName]: { ...config, sellingPrice: parseFloat(e.target.value) || 0 },
                          })}
                          className="w-32 px-2 py-1 border border-gray-300 rounded text-right font-semibold"
                        />
                        <span className={`rounded-full px-2 py-1 text-xs font-bold ${marginHealthy ? "bg-emerald-100 text-emerald-700" : hasSellingPrice ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500"}`}>
                          {marginLabel}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${marginHealthy ? "bg-emerald-50 text-emerald-700" : hasSellingPrice ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500"}`}>
                        {hasSellingPrice ? (marginHealthy ? "Healthy" : "Below target") : "No price"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="page-section">
        <h2 className="section-title">Pricing Matrix</h2>
        <div className="section-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
          <div className="content-card">
            <div className="content-row-stack">
              <h3 className="text-lg font-semibold text-gray-900">Price per Market</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full sku-compact-table sku-pricing-table">
                  <thead>
                    <tr>
                      <th>Market</th>
                      <th>Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marketEntries.map(([market, price]) => {
                      const margin = calculateMargin(totalCostPerLiter, price);
                      const healthy = Number(price || 0) > 0 && margin >= marginThreshold;
                      return (
                        <tr key={market} className={!healthy && Number(price || 0) > 0 ? "bg-red-50" : ""}>
                          <td className="font-semibold text-gray-900">{market}</td>
                          <td>
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                type="number"
                                step="0.01"
                                value={price}
                                onChange={(e) => setPricingMatrix({
                                  ...pricingMatrix,
                                  byMarket: { ...pricingMatrix.byMarket, [market]: parseFloat(e.target.value) || 0 },
                                })}
                                className="w-32 px-2 py-1 border border-gray-300 rounded text-right font-semibold"
                              />
                              <span className={`rounded-full px-2 py-1 text-xs font-bold ${healthy ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                                {margin.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="content-card">
            <div className="content-row-stack">
              <h3 className="text-lg font-semibold text-gray-900">Price per Customer Type</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full sku-compact-table sku-pricing-table">
                  <thead>
                    <tr>
                      <th>Customer Type</th>
                      <th>Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerEntries.map(([type, price]) => {
                      const margin = calculateMargin(totalCostPerLiter, price);
                      const healthy = Number(price || 0) > 0 && margin >= marginThreshold;
                      return (
                        <tr key={type} className={!healthy && Number(price || 0) > 0 ? "bg-red-50" : ""}>
                          <td className="font-semibold text-gray-900">{type}</td>
                          <td>
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                type="number"
                                step="0.01"
                                value={price}
                                onChange={(e) => setPricingMatrix({
                                  ...pricingMatrix,
                                  byCustomer: { ...pricingMatrix.byCustomer, [type]: parseFloat(e.target.value) || 0 },
                                })}
                                className="w-32 px-2 py-1 border border-gray-300 rounded text-right font-semibold"
                              />
                              <span className={`rounded-full px-2 py-1 text-xs font-bold ${healthy ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                                {margin.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="page-section">
        <h2 className="section-title">Cost Build-Up</h2>
        <div className="content-card">
          <div className="content-row-stack">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-stretch">
              <div className="content-card-compact xl:flex-1">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Blend Cost</span>
                  <input
                    type="number"
                    step="0.01"
                    value={costBreakup.blendCost}
                    onChange={(e) => setCostBreakup({ ...costBreakup, blendCost: parseFloat(e.target.value) || 0 })}
                    className="w-28 px-2 py-1 border border-gray-300 rounded text-right font-semibold"
                  />
                </div>
              </div>

              <div className="content-card-compact xl:flex-1">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Packaging Cost</span>
                  <input
                    type="number"
                    step="0.01"
                    value={costBreakup.packagingCost}
                    onChange={(e) => setCostBreakup({ ...costBreakup, packagingCost: parseFloat(e.target.value) || 0 })}
                    className="w-28 px-2 py-1 border border-gray-300 rounded text-right font-semibold"
                  />
                </div>
              </div>

              <div className="content-card-compact xl:flex-1">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Logistics Cost</span>
                  <input
                    type="number"
                    step="0.01"
                    value={costBreakup.logisticsCost}
                    onChange={(e) => setCostBreakup({ ...costBreakup, logisticsCost: parseFloat(e.target.value) || 0 })}
                    className="w-28 px-2 py-1 border border-gray-300 rounded text-right font-semibold"
                  />
                </div>
              </div>

              <div className="content-card-compact xl:flex-1">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Overhead %</span>
                  <input
                    type="number"
                    step="0.01"
                    value={costBreakup.overheadAllocation}
                    onChange={(e) => setCostBreakup({ ...costBreakup, overheadAllocation: parseFloat(e.target.value) || 0 })}
                    className="w-28 px-2 py-1 border border-gray-300 rounded text-right font-semibold"
                  />
                </div>
              </div>

              <div className="content-card-compact xl:w-56 xl:shrink-0">
                <div className="flex h-full flex-col justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Total Cost/L</span>
                  <span className="text-2xl font-semibold text-gray-900">
                    ${totalCostPerLiter.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {costWarningItems.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {costWarningItems.map((warning) => (
                  <span key={warning} className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
                    {warning}
                  </span>
                ))}
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {[
                { label: "Blend", value: costBreakup.blendCost },
                { label: "Packaging", value: costBreakup.packagingCost },
                { label: "Logistics", value: costBreakup.logisticsCost },
                { label: "Overhead", value: costBreakup.overheadAllocation },
              ].map((item) => {
                const percentage = totalCostPerLiter > 0 ? (item.value / totalCostPerLiter) * 100 : 0;

                return (
                  <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                        <p className="mt-1 text-sm text-slate-600">${item.value.toFixed(2)}</p>
                      </div>
                      <p className="text-sm font-semibold text-slate-700">{percentage.toFixed(1)}%</p>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-slate-500" style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-semibold text-gray-900">SKU Catalog</h2>
          <button
            onClick={() => setActiveTab("create")}
            className="btn btn-primary sku-add-button"
          >
            + Add New SKU
          </button>
        </div>

        {skus.length === 0 ? (
          <div className="table-container">
            <div className="px-6 py-12 text-center">
              <p className="text-gray-500">
                {importedSkuDraft
                  ? "No saved SKUs yet. Use the draft above to create the first one."
                  : recipes.length > 0
                    ? "No saved SKUs yet. A formulation is already available, so click Add New SKU to create the first one."
                  : "No saved SKUs yet. Save a formulation first, then create its SKU."}
              </p>
            </div>
          </div>
        ) : (
          <div className="table-container">
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Product Name</th>
                    <th>Pack Size</th>
                    <th>Category</th>
                    <th>Linked Formulation</th>
                    <th>Base Cost/L</th>
                    <th>Current Selling Price</th>
                    <th>Margin %</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {skus.map((sku) => {
                    const margin = calculateMargin(sku.base_cost_per_liter || 0, sku.current_selling_price || 0);
                    return (
                      <tr key={sku.id}>
                        <td className="font-semibold">{sku.name}</td>
                        <td>{sku.pack_size_liters ? `${sku.pack_size_liters}L` : "-"}</td>
                        <td>{sku.category || "-"}</td>
                        <td>{sku.recipes?.name || "-"}</td>
                        <td className="text-right">${(sku.base_cost_per_liter || 0).toFixed(2)}</td>
                        <td className="text-right font-semibold">${(sku.current_selling_price || 0).toFixed(2)}</td>
                        <td className={`text-right font-semibold ${margin < marginThreshold ? "text-red-600" : "text-gray-900"}`}>
                          {margin.toFixed(1)}%
                        </td>
                        <td>
                          <button
                            onClick={() => handleSelectSku(sku)}
                            className="btn btn-primary text-sm"
                          >
                            View Details
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ====== CREATE SKU FORM ====== */}
      {activeTab === "create" && (
        <section className="page-section">
          <h2 className="section-title">Create New SKU</h2>
          <form onSubmit={handleCreateSku} className="table-container max-w-2xl">
            <div className="content-card">
              <div className="form-grid form-grid-2 mb-6">
                <div className="form-group">
                  <label className="text-sm font-semibold text-gray-900">SKU Name *</label>
                  <input
                    type="text"
                    value={skuForm.name}
                    onChange={(e) => setSkuForm({ ...skuForm, name: e.target.value })}
                    placeholder="e.g., 5W30 Synthetic"
                    required
                    className="mt-1"
                  />
                </div>

                <div className="form-group">
                  <label className="text-sm font-semibold text-gray-900">Category *</label>
                  <select
                    value={skuForm.category}
                    onChange={(e) => setSkuForm({ ...skuForm, category: e.target.value })}
                    required
                    className="mt-1"
                  >
                    <option value="">Select Category</option>
                    <option value="Engine Oil">Engine Oil</option>
                    <option value="Hydraulic Oil">Hydraulic Oil</option>
                    <option value="Gear Oil">Gear Oil</option>
                    <option value="Transmission Oil">Transmission Oil</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="text-sm font-semibold text-gray-900">Linked Formulation *</label>
                  <select
                    value={skuForm.recipe_id}
                    onChange={(e) => setSkuForm({ ...skuForm, recipe_id: e.target.value })}
                    required
                    className="mt-1"
                  >
                    <option value="">Select Formulation</option>
                    {recipes.map((recipe) => (
                      <option key={recipe.id} value={recipe.id}>
                        {recipe.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="text-sm font-semibold text-gray-900">Base Cost per Liter</label>
                  <input
                    type="number"
                    step="0.01"
                    value={skuForm.baseCostPerLiter}
                    onChange={(e) => setSkuForm({ ...skuForm, baseCostPerLiter: e.target.value })}
                    placeholder="0.00"
                    className="mt-1"
                  />
                </div>

                <div className="form-group">
                  <label className="text-sm font-semibold text-gray-900">Current Selling Price</label>
                  <input
                    type="number"
                    step="0.01"
                    value={skuForm.currentSellingPrice}
                    onChange={(e) => setSkuForm({ ...skuForm, currentSellingPrice: e.target.value })}
                    placeholder="0.00"
                    className="mt-1"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary w-full py-2"
              >
                Create SKU
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
