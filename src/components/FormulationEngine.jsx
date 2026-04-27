import React, { useState, useEffect, useRef } from "react";
import { baseOilsService, additivesService, recipesService, recipeIngredientsService, costingEngine } from "../services/supabaseService";
import { historyService } from "../services/historyService";

function normalizeName(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

export default function FormulationEngine({ pendingImport, clearPendingImport, currentSessionUploadId, onFormulationSaved }) {
  const [recipes, setRecipes] = useState([]);
  const [baseOils, setBaseOils] = useState([]);
  const [additives, setAdditives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("list");
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [selectedBaseOilId, setSelectedBaseOilId] = useState("");
  const [savingRecipe, setSavingRecipe] = useState(false);
  const [baseOilName, setBaseOilName] = useState("");

  // SKU Selector / Creator states
  const [skuForm, setSkuForm] = useState({
    name: "",
    category: "",
    specification: "",
    version: "1.0",
  });

  const [definitionAdditives, setDefinitionAdditives] = useState(["", "", "", ""]);
  const [packagingCost, setPackagingCost] = useState("");

  // Component Table states
  const [components, setComponents] = useState([]);
  const [selectedComponent, setSelectedComponent] = useState("");
  const [componentPercentage, setComponentPercentage] = useState("");
  const [componentSupplier, setComponentSupplier] = useState("");

  // Cost Summary states
  const [batchSize, setBatchSize] = useState("");
  const [labourCostPerLiter, setLabourCostPerLiter] = useState("");
  const [plantOverheadCostPerLiter, setPlantOverheadCostPerLiter] = useState("");
  const [freightCostPerLiter, setFreightCostPerLiter] = useState("");
  const [targetMarginPercent, setTargetMarginPercent] = useState("");
  
  // Version Control states
  const [changeHistory, setChangeHistory] = useState([]);
  
  // Raw Material states
  const [materialPriceUpdates, setMaterialPriceUpdates] = useState({});

  const importInProgressRef = useRef(false);
  const autoImportTriggeredRef = useRef("");
  const autoCreatedBaseOilIdsRef = useRef(new Map());

  const importedFormulationDrafts = pendingImport?.kind === "formulation-batch"
    ? (pendingImport.drafts || []).map((draft) => draft?.formulationDraft || draft).filter(Boolean)
    : pendingImport?.kind === "formulation"
      ? [pendingImport.draft].filter(Boolean)
      : [];
  const importedFormulationDraft = importedFormulationDrafts[0] || null;
  const linkedSkuDrafts = pendingImport?.linkedSkuDrafts || (pendingImport?.linkedSkuDraft ? [pendingImport.linkedSkuDraft] : []);
  const pendingImportSignature = importedFormulationDrafts.length
    ? [
        pendingImport?.kind || "pending",
        importedFormulationDrafts
          .map((draft) => draft?.name || draft?.skuName || draft?.recipeName || "")
          .join("||"),
        linkedSkuDrafts
          .map((draft) => draft?.name || draft?.skuName || draft?.recipeName || "")
          .join("||"),
      ].join("::")
    : "";
  const isBatchImport = importedFormulationDrafts.length > 1;

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!pendingImportSignature) {
      autoImportTriggeredRef.current = "";
    }
  }, [pendingImportSignature]);

  const loadData = async () => {
    setLoading(true);
    try {
      const recipesResult = await recipesService.getAll();
      const baseOilsResult = await baseOilsService.getAll();
      const additivesResult = await additivesService.getAll();

      setRecipes(recipesResult);
      setBaseOils(baseOilsResult);
      setAdditives(additivesResult);
    } catch (err) {
      console.error("Error loading data:", err);
      const message = err?.message || err?.details || err?.hint || "Unknown Supabase error";
      alert(`Failed to load formulation data: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  // Cost calculations
  const calculateCostContribution = (component) => {
    if (!component.unitCost || !component.percentage) return 0;
    return (parseFloat(component.unitCost) * parseFloat(component.percentage)) / 100;
  };

  const calculateTotalBlendCost = () => {
    return components.reduce((sum, comp) => sum + calculateCostContribution(comp), 0);
  };

  const calculateBlendCostFromComponents = (componentList = []) => {
    return componentList.reduce((sum, comp) => sum + calculateCostContribution(comp), 0);
  };

  const calculateOperatingCostPerLiter = () => {
    return [labourCostPerLiter, plantOverheadCostPerLiter, freightCostPerLiter]
      .reduce((sum, value) => sum + (Number.parseFloat(value) || 0), 0);
  };

  const calculateAllInCostPerLiter = () => calculateTotalBlendCost() + calculateOperatingCostPerLiter();

  const calculateTargetSellingPricePerLiter = () => {
    const allInCost = calculateAllInCostPerLiter();
    const margin = Number.parseFloat(targetMarginPercent) || 0;
    return allInCost * (1 + margin / 100);
  };

  const calculateCostPerBatch = () => {
    if (!batchSize || batchSize === "") return 0;
    return calculateAllInCostPerLiter() * parseFloat(batchSize);
  };

  const getCostBreakdownByType = () => {
    const breakdown = {
      "Base Oil": 0,
      "Additive": 0,
      "VI Improver": 0,
    };
    components.forEach((comp) => {
      const type = comp.type || "Additive";
      breakdown[type] = (breakdown[type] || 0) + calculateCostContribution(comp);
    });
    return breakdown;
  };

  const handleAddComponent = () => {
    if (!selectedComponent || !componentPercentage || !componentSupplier) {
      alert("Please fill all component fields");
      return;
    }

    const additive = additives.find((a) => a.id === selectedComponent);
    const newComponent = {
      id: selectedComponent,
      name: additive?.name,
      type: "Additive",
      supplier: componentSupplier,
      percentage: parseFloat(componentPercentage),
      unitCost: parseFloat(additive?.cost_per_unit) || 0,
      lastUpdated: new Date().toLocaleDateString(),
    };

    // Record change
    setChangeHistory([
      ...changeHistory,
      {
        timestamp: new Date().toLocaleString(),
        change: `Added component: ${newComponent.name} at ${componentPercentage}%`,
        user: "Current User",
      },
    ]);

    setComponents([...components, newComponent]);
    setSelectedComponent("");
    setComponentPercentage("");
    setComponentSupplier("");
  };

  const handleRemoveComponent = (index) => {
    const removed = components[index];
    setChangeHistory([
      ...changeHistory,
      {
        timestamp: new Date().toLocaleString(),
        change: `Removed component: ${removed.name}`,
        user: "Current User",
      },
    ]);
    setComponents(components.filter((_, i) => i !== index));
  };

  const handleUpdateMaterialPrice = (componentId, newPrice) => {
    const oldComponent = components.find((c) => c.id === componentId);
    const oldPrice = oldComponent?.unitCost || 0;

    setMaterialPriceUpdates({
      ...materialPriceUpdates,
      [componentId]: {
        oldPrice,
        newPrice,
        oldCost: calculateTotalBlendCost(),
      },
    });

    // Update component
    setComponents(
      components.map((c) =>
        c.id === componentId ? { ...c, unitCost: parseFloat(newPrice), lastUpdated: new Date().toLocaleDateString() } : c
      )
    );

    setChangeHistory([
      ...changeHistory,
      {
        timestamp: new Date().toLocaleString(),
        change: `Updated ${oldComponent?.name} price: $${oldPrice.toFixed(2)} → $${parseFloat(newPrice).toFixed(2)}`,
        user: "Current User",
      },
    ]);
  };

  const findBaseOilByName = (name) => {
    const normalizedName = normalizeName(name);
    if (!normalizedName) return null;

    return baseOils.find((entry) => {
      const baseOilName = normalizeName(entry.name);
      return baseOilName === normalizedName || baseOilName.includes(normalizedName) || normalizedName.includes(baseOilName);
    }) || null;
  };

  const findAdditiveByName = (name) => {
    const normalizedName = normalizeName(name);
    if (!normalizedName) return null;

    return additives.find((entry) => {
      const additiveName = normalizeName(entry.name);
      return additiveName === normalizedName || additiveName.includes(normalizedName) || normalizedName.includes(additiveName);
    }) || null;
  };

  const resolveBaseOilId = (draft) => {
    const candidates = [
      draft?.baseOilName,
      draft?.baseOil,
      draft?.baseOilCandidate,
      draft?.baseOilType,
      draft?.components?.find((component) => /base oil/i.test(String(component?.type || "")))?.name,
      draft?.components?.find((component) => /base oil/i.test(String(component?.type || "")))?.component,
      baseOilName,
    ].filter(Boolean).map(normalizeName);

    const matchedBaseOil = baseOils.find((entry) => {
      const baseOilEntryName = normalizeName(entry.name);
      return candidates.some((candidate) => baseOilEntryName === candidate || baseOilEntryName.includes(candidate) || candidate.includes(baseOilEntryName));
    });

    return matchedBaseOil?.id || draft?.selectedBaseOilId || selectedBaseOilId || "";
  };

  const findRecipeByName = (recipeName) => {
    const normalizedRecipeName = normalizeName(recipeName);
    return recipes.find((recipe) => normalizeName(recipe.name) === normalizedRecipeName) || null;
  };

  const getBaseOilNameById = (baseOilId) => baseOils.find((entry) => entry.id === baseOilId)?.name || "";

  const deriveProductName = (draft = null, additiveNames = definitionAdditives) => {
    const selectedBaseOil = draft?.baseOilName || baseOilName || getBaseOilNameById(resolveBaseOilId(draft));
    const selectedAdditives = (draft?.selectedAdditiveNames || additiveNames)
      .map((additiveName) => String(additiveName || "").trim())
      .filter(Boolean);

    return [selectedBaseOil, ...selectedAdditives].filter(Boolean).join(" + ");
  };

  const deriveBaseOilNameFromComponents = (sourceComponents = []) => {
    const baseOilComponent = sourceComponents.find((component) => {
      const componentText = String(component?.name || component?.component || "");
      return /base oil/i.test(String(component?.type || "")) || /base oil/i.test(componentText);
    });
    return baseOilComponent?.name || baseOilComponent?.component || "";
  };

  const deriveBaseOilCostFromComponents = (sourceComponents = []) => {
    const baseOilComponent = sourceComponents.find((component) => {
      const componentText = String(component?.name || component?.component || "");
      return /base oil/i.test(String(component?.type || "")) || /base oil/i.test(componentText);
    });

    return Number(baseOilComponent?.unitCost ?? 0) || 0;
  };

  const deriveAdditiveNamesFromComponents = (sourceComponents = []) => {
    return [0, 1, 2, 3].map((slotIndex) => {
      const component = sourceComponents[slotIndex];
      return component?.name || component?.component || "";
    });
  };

  const normalizeComponentForSave = (component, index) => ({
    id: component.id || `${component.name || component.component || "component"}-${index}`,
    name: component.name || component.component || "Component",
    type: component.type || "Additive",
    supplier: component.supplier || "Imported from Excel",
    percentage: Number(component.percentage || component.share || 0),
    unitCost: Number(component.unitCost || component.cost || 0),
  });

  const buildFormulationSnapshot = (sourceDraft = null) => {
    const draft = sourceDraft || importedFormulationDraft || {};
    const sourceComponents = components.length > 0 ? components : (draft.components || []);
    const selectedAdditiveNames = (draft.selectedAdditiveNames || definitionAdditives)
      .map((additiveName) => String(additiveName || "").trim())
      .filter(Boolean);
    const derivedAdditiveNames = selectedAdditiveNames.length > 0 ? selectedAdditiveNames : deriveAdditiveNamesFromComponents(sourceComponents);
    const packagingCostValue = Number(draft.packagingCost ?? packagingCost ?? 0) || 0;
    const baseOilCostPerLiter = Number(draft.baseOilCostPerLiter ?? deriveBaseOilCostFromComponents(sourceComponents) ?? draft.estimatedCostPerLiter ?? 0) || 0;
    const labourCostValue = Number(draft.labourCostPerLiter ?? labourCostPerLiter ?? 0) || 0;
    const plantOverheadCostValue = Number(draft.plantOverheadCostPerLiter ?? plantOverheadCostPerLiter ?? 0) || 0;
    const freightCostValue = Number(draft.freightCostPerLiter ?? freightCostPerLiter ?? 0) || 0;
    const targetMarginValue = Number(draft.targetMarginPercent ?? targetMarginPercent ?? 0) || 0;
    const resolvedBaseOilId = resolveBaseOilId(draft);
    const resolvedBaseOilName = draft.baseOilName || baseOilName || deriveBaseOilNameFromComponents(sourceComponents) || getBaseOilNameById(resolvedBaseOilId) || "";
    const blendCostPerLiter = calculateBlendCostFromComponents(sourceComponents);
    const operatingCostPerLiter = labourCostValue + plantOverheadCostValue + freightCostValue;
    const allInCostPerLiter = blendCostPerLiter + operatingCostPerLiter;
    const targetSellingPricePerLiter = allInCostPerLiter * (1 + targetMarginValue / 100);

    return {
      skuForm: {
        name: skuForm.name || draft.skuName || draft.name || deriveProductName(draft, derivedAdditiveNames) || "",
        category: skuForm.category || draft.category || "Custom Blend",
        specification: skuForm.specification || draft.pricingLogicType || "",
        version: skuForm.version || "1.0",
        packagingCost: packagingCostValue,
        baseOilName: resolvedBaseOilName,
        additiveNames: derivedAdditiveNames,
      },
      components: sourceComponents.map((component, index) => normalizeComponentForSave(component, index)),
      batchSize: batchSize || draft.batchSize || "100",
      sourceUploadId: draft.sourceUploadId || null,
      selectedBaseOilId: resolvedBaseOilId,
      baseOilName: resolvedBaseOilName,
      baseOilCostPerLiter,
      selectedAdditiveNames: derivedAdditiveNames,
      packagingCost: packagingCostValue,
      labourCostPerLiter: labourCostValue,
      plantOverheadCostPerLiter: plantOverheadCostValue,
      freightCostPerLiter: freightCostValue,
      targetMarginPercent: targetMarginValue,
      blendCostPerLiter,
      operatingCostPerLiter,
      allInCostPerLiter,
      targetSellingPricePerLiter,
      draft,
    };
  };

  const saveFormulationSnapshot = async (snapshot, { linkedSkuDrafts = [], notifyParent = true, refreshAfterSave = true } = {}) => {
    if (!snapshot.skuForm.name) {
      alert("Please enter a formulation name.");
      return false;
    }

    const rawBaseOilName = String(snapshot.baseOilName || snapshot.draft?.baseOilName || deriveBaseOilNameFromComponents(snapshot.components) || "").trim();
    let resolvedBaseOilId = snapshot.selectedBaseOilId || resolveBaseOilId(snapshot.draft);

    if (!resolvedBaseOilId && rawBaseOilName) {
      const normalizedBaseOilName = normalizeName(rawBaseOilName);
      if (autoCreatedBaseOilIdsRef.current.has(normalizedBaseOilName)) {
        resolvedBaseOilId = autoCreatedBaseOilIdsRef.current.get(normalizedBaseOilName);
      } else {
        const existingBaseOil = findBaseOilByName(rawBaseOilName);
        if (existingBaseOil) {
          resolvedBaseOilId = existingBaseOil.id;
          autoCreatedBaseOilIdsRef.current.set(normalizedBaseOilName, existingBaseOil.id);
        } else {
          const baseOilCostPerLiter = Number(snapshot.baseOilCostPerLiter ?? snapshot.draft?.baseOilCostPerLiter ?? snapshot.draft?.estimatedCostPerLiter ?? deriveBaseOilCostFromComponents(snapshot.components) ?? 0) || 0;
          try {
            const createdBaseOil = await baseOilsService.create({
              name: rawBaseOilName,
              cost_per_liter: baseOilCostPerLiter,
              unit: "Liter",
              description: snapshot.draft?.workbookName || "Imported from Excel",
            });
            resolvedBaseOilId = createdBaseOil?.id || "";
            if (resolvedBaseOilId) {
              autoCreatedBaseOilIdsRef.current.set(normalizedBaseOilName, resolvedBaseOilId);
            }
          } catch (createError) {
            console.error("Failed to auto-create base oil:", createError);
            const retryBaseOil = findBaseOilByName(rawBaseOilName);
            if (retryBaseOil) {
              resolvedBaseOilId = retryBaseOil.id;
              autoCreatedBaseOilIdsRef.current.set(normalizedBaseOilName, retryBaseOil.id);
            }
          }
        }
      }
    }

    if (!resolvedBaseOilId) {
      alert(rawBaseOilName ? `Could not create base oil "${rawBaseOilName}" from the workbook.` : "Could not auto-detect a base oil name from the workbook.");
      return false;
    }

    setSavingRecipe(true);
    try {
      const existingRecipe = findRecipeByName(snapshot.skuForm.name);
      const recipePayload = {
        name: snapshot.skuForm.name,
        description: snapshot.skuForm.specification || snapshot.draft?.pricingLogicType || "",
        status: "active",
        base_oil_id: resolvedBaseOilId,
        blending_cost_per_liter: 0,
      };

      const createdRecipe = existingRecipe
        ? await recipesService.update(existingRecipe.id, recipePayload)
        : await recipesService.create(recipePayload);

      const baseOilName = normalizeName(
        baseOils.find((entry) => entry.id === resolvedBaseOilId)?.name || rawBaseOilName,
      );
      if (!existingRecipe?.recipe_ingredients?.length) {
        for (const component of snapshot.components) {
          if (/base oil/i.test(component.type) || (baseOilName && normalizeName(component.name) === baseOilName)) {
            continue;
          }

          const matchedAdditive = additives.find((entry) => {
            const additiveName = normalizeName(entry.name);
            const componentName = normalizeName(component.name);
            return additiveName === componentName || additiveName.includes(componentName) || componentName.includes(additiveName);
          });

          if (!matchedAdditive) continue;

          const quantityPerLiter = Number(component.percentage || 0) / 100;
          if (quantityPerLiter <= 0) continue;

          await recipeIngredientsService.addIngredient(createdRecipe.id, matchedAdditive.id, quantityPerLiter);
        }
      }

      setChangeHistory((current) => [
        ...current,
        {
          timestamp: new Date().toLocaleString(),
          change: `Saved formulation: ${createdRecipe.name}`,
          user: "Current User",
        },
      ]);

      if (refreshAfterSave) {
        await loadData();
      }
      setSelectedRecipe(createdRecipe);
      setEditingRecipe(createdRecipe);
      setActiveTab("list");

      if (onFormulationSaved && notifyParent) {
        onFormulationSaved({
          recipe: createdRecipe,
          linkedSkuDrafts,
          sourceUploadId: snapshot.sourceUploadId || currentSessionUploadId || null,
          snapshot,
        });
      }

      try {
        await historyService.recordConfigVersion({
          configName: `${createdRecipe.name} formulation`,
          configType: "formulation",
          configVersion: 1,
          configData: snapshot,
          sourceUploadId: snapshot.sourceUploadId || currentSessionUploadId || null,
          notes: snapshot.draft?.workbookName || "Imported formulation",
        });
      } catch (historyError) {
        console.error("Failed to save formulation history:", historyError);
      }

      return createdRecipe;
    } catch (saveError) {
      console.error("Failed to save formulation:", saveError);
      alert(saveError?.message || "Failed to save formulation.");
      return false;
    } finally {
      setSavingRecipe(false);
    }
  };

  const handleSaveCurrentFormulation = async () => {
    const snapshot = buildFormulationSnapshot();
    await saveFormulationSnapshot(snapshot);
  };

  const handleCreateImportedFormulation = async () => {
    if (!importedFormulationDraft) return;
    const snapshot = buildFormulationSnapshot(importedFormulationDraft);
    setSkuForm(snapshot.skuForm);
    setBaseOilName(snapshot.baseOilName || deriveBaseOilNameFromComponents(snapshot.components) || getBaseOilNameById(snapshot.selectedBaseOilId) || "");
    setDefinitionAdditives(deriveAdditiveNamesFromComponents(snapshot.components));
    setPackagingCost(String(snapshot.packagingCost || ""));
    setLabourCostPerLiter(String(snapshot.labourCostPerLiter || ""));
    setPlantOverheadCostPerLiter(String(snapshot.plantOverheadCostPerLiter || ""));
    setFreightCostPerLiter(String(snapshot.freightCostPerLiter || ""));
    setTargetMarginPercent(String(snapshot.targetMarginPercent || ""));
    setComponents(snapshot.components.map((component) => ({
      ...component,
      lastUpdated: new Date().toLocaleDateString(),
    })));
    setBatchSize(snapshot.batchSize);
    setSelectedBaseOilId(snapshot.selectedBaseOilId);
    const saved = await saveFormulationSnapshot(snapshot, { linkedSkuDrafts });
    if (saved && clearPendingImport) {
      clearPendingImport("formulation");
    }
  };

  const handleImportDrafts = async () => {
    if (importInProgressRef.current) return;
    if (!importedFormulationDrafts.length) return;
    if (!baseOils.length) {
      alert("Add at least one base oil before importing formulations.");
      return;
    }

    importInProgressRef.current = true;
    setSavingRecipe(true);

    try {
      const createdRecipes = [];

      for (const [index, draft] of importedFormulationDrafts.entries()) {
        const linkedDraft = linkedSkuDrafts[index] || linkedSkuDrafts[0] || null;
        const snapshot = buildFormulationSnapshot(draft);

        if (!snapshot.sourceUploadId && linkedDraft?.sourceUploadId) {
          snapshot.sourceUploadId = linkedDraft.sourceUploadId;
        }

        const createdRecipe = await saveFormulationSnapshot(snapshot, {
          linkedSkuDrafts: linkedDraft ? [linkedDraft] : [],
          notifyParent: false,
          refreshAfterSave: false,
        });

        if (createdRecipe) {
          createdRecipes.push(createdRecipe);
        }
      }

      if (createdRecipes.length > 0) {
        await loadData();
        setSelectedRecipe(createdRecipes[0]);
        setEditingRecipe(createdRecipes[0]);
        setActiveTab("list");

        if (onFormulationSaved) {
          onFormulationSaved({
            recipe: createdRecipes[0],
            linkedSkuDrafts,
            sourceUploadId: importedFormulationDrafts[0]?.sourceUploadId || currentSessionUploadId || null,
            snapshot: buildFormulationSnapshot(importedFormulationDrafts[0]),
            isBatchImport: true,
            importedCount: createdRecipes.length,
          });
        }

        if (clearPendingImport) {
          clearPendingImport("formulation");
        }
      }
    } catch (error) {
      console.error("Failed to import formulation batch:", error);
      alert(error?.message || "Failed to import formulation batch.");
    } finally {
      setSavingRecipe(false);
      importInProgressRef.current = false;
    }
  };

  const handlePrimaryImportedAction = () => {
    if (isBatchImport) {
      handleImportDrafts();
      return;
    }

    handleCreateImportedFormulation();
  };

  useEffect(() => {
    if (!pendingImportSignature) return;
    if (loading || savingRecipe || importInProgressRef.current) return;

    if (autoImportTriggeredRef.current === pendingImportSignature) {
      return;
    }

    autoImportTriggeredRef.current = pendingImportSignature;
    const timer = window.setTimeout(() => {
      handlePrimaryImportedAction();
    }, 500);

    return () => window.clearTimeout(timer);
  }, [pendingImportSignature, loading, savingRecipe, importedFormulationDrafts.length]);

  const applyImportedDraft = async () => {
    if (!importedFormulationDraft) return;

    const configSnapshot = buildFormulationSnapshot(importedFormulationDraft);

    setSkuForm(configSnapshot.skuForm);
    setComponents(configSnapshot.components.map((component) => ({
      ...component,
      lastUpdated: new Date().toLocaleDateString(),
    })));
    setBatchSize(configSnapshot.batchSize);
    setSelectedBaseOilId(configSnapshot.selectedBaseOilId);
    setChangeHistory([
      {
        timestamp: new Date().toLocaleString(),
        change: `Imported formulation draft from ${importedFormulationDraft.workbookName || "Excel"}`,
        user: "Current User",
      },
    ]);

    try {
      await historyService.recordConfigVersion({
        configName: `${configSnapshot.skuForm.name || "Formulation"} formulation`,
        configType: "formulation",
        configVersion: 1,
        configData: configSnapshot,
        sourceUploadId: configSnapshot.sourceUploadId || currentSessionUploadId || null,
        notes: importedFormulationDraft.workbookName || "Imported formulation",
      });
    } catch (historyError) {
      console.error("Failed to save formulation history:", historyError);
    }

    if (clearPendingImport) {
      clearPendingImport("formulation");
    }
  };

  if (loading) return <div className="p-6 text-center">Loading...</div>;

  const costBreakdown = getCostBreakdownByType();

  return (
    <div className="page-stack">
      {importedFormulationDraft && (
        <section className="page-section">
          <div className="content-card border-emerald-300 bg-emerald-50/70">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="section-title">{isBatchImport ? "Imported Formulation Drafts" : "Imported Formulation Draft"}</h2>
                <p className="section-subtitle">
                  Excel detected {importedFormulationDrafts.length} formulation-style draft{importedFormulationDrafts.length === 1 ? "" : "s"} for this workbook. The import will create them in the Formulation page.
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-emerald-900">
                  <span className="rounded-full bg-emerald-100 px-3 py-1">Drafts: {importedFormulationDrafts.length}</span>
                  <span className="rounded-full bg-emerald-100 px-3 py-1">Linked SKUs: {linkedSkuDrafts.length}</span>
                  <span className="rounded-full bg-emerald-100 px-3 py-1">Cost / L: ${Number(importedFormulationDraft.estimatedCostPerLiter || 0).toFixed(2)}</span>
                  <span className="rounded-full bg-emerald-100 px-3 py-1">Excel margin: {Number(importedFormulationDraft.marginPercent || 0).toFixed(1)}%</span>
                </div>
                {linkedSkuDrafts.length > 0 && (
                  <p className="mt-2 text-sm font-semibold text-emerald-900">
                    {linkedSkuDrafts.length} SKU draft{linkedSkuDrafts.length === 1 ? "" : "s"} are linked to this workbook.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <div className="rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold text-emerald-900 shadow-sm">
                  {savingRecipe ? "Creating formulations automatically..." : "Workbook formulations are being created automatically."}
                </div>
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

      {/* ====== SECTION 1: SKU SELECTOR / CREATOR ====== */}
      <section className="page-section">
        <h2 className="section-title">Product Definition</h2>
        <div className="table-container">
          <div className="content-card">
            <div className="space-y-4">
              <div className="form-grid form-grid-2">
                <div className="form-group">
                  <label className="text-sm font-semibold text-gray-900">Base Oil Name *</label>
                  <input
                    type="text"
                    value={baseOilName}
                    onChange={(e) => setBaseOilName(e.target.value)}
                    placeholder="Enter base oil name"
                    className="mt-1"
                  />
                </div>

                <div className="form-group">
                  <label className="text-sm font-semibold text-gray-900">Packaging Cost / Unit</label>
                  <input
                    type="number"
                    step="0.01"
                    value={packagingCost}
                    onChange={(e) => setPackagingCost(e.target.value)}
                    placeholder="e.g., 0.50"
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="form-grid form-grid-4">
                {[0, 1, 2, 3].map((slotIndex) => (
                  <div className="form-group" key={`definition-additive-${slotIndex}`}>
                    <label className="text-sm font-semibold text-gray-900">Additive {slotIndex + 1}</label>
                    <input
                      type="text"
                      value={definitionAdditives[slotIndex]}
                      onChange={(e) => {
                        const nextAdditives = [...definitionAdditives];
                        nextAdditives[slotIndex] = e.target.value;
                        setDefinitionAdditives(nextAdditives);
                      }}
                      placeholder="Enter additive name"
                      className="mt-1"
                    />
                  </div>
                ))}
              </div>

              <div className="form-grid form-grid-2">
                <div className="form-group">
                  <label className="text-sm font-semibold text-gray-900">Specification</label>
                  <input
                    type="text"
                    value={skuForm.specification}
                    onChange={(e) => setSkuForm({ ...skuForm, specification: e.target.value })}
                    placeholder="e.g., API SN, ACEA A3/B4"
                    className="mt-1"
                  />
                </div>

                <div className="form-group">
                  <label className="text-sm font-semibold text-gray-900">Version</label>
                  <input
                    type="text"
                    value={skuForm.version}
                    onChange={(e) => setSkuForm({ ...skuForm, version: e.target.value })}
                    placeholder="e.g., 1.0"
                    className="mt-1"
                    disabled
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={handleSaveCurrentFormulation} disabled={savingRecipe} className="btn btn-primary">
                {savingRecipe ? "Saving..." : "Save formulation"}
              </button>
              {importedFormulationDraft && (
                <button type="button" onClick={handleCreateImportedFormulation} disabled={savingRecipe} className="btn btn-secondary">
                  {savingRecipe ? "Creating..." : "Create formulation from workbook"}
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ====== SECTION 2: COMPONENT TABLE ====== */}
      <section className="page-section">
        <h2 className="section-title">Component Composition</h2>
        
        {/* Add Component Form */}
        <div className="content-card">
          <div className="content-row-stack">
            <h3 className="text-lg font-semibold text-gray-900">Add Component</h3>
            <div className="form-grid form-grid-5">
              <div className="form-group mb-0">
                <label className="text-sm font-semibold text-gray-900">Component *</label>
                <select
                  value={selectedComponent}
                  onChange={(e) => setSelectedComponent(e.target.value)}
                  className="mt-1"
                >
                  <option value="">Select Component</option>
                  {additives.map((additive) => (
                    <option key={additive.id} value={additive.id}>
                      {additive.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group mb-0">
                <label className="text-sm font-semibold text-gray-900">Composition % *</label>
                <input
                  type="number"
                  step="0.01"
                  value={componentPercentage}
                  onChange={(e) => setComponentPercentage(e.target.value)}
                  placeholder="0.00"
                  className="mt-1"
                />
              </div>

              <div className="form-group mb-0">
                <label className="text-sm font-semibold text-gray-900">Supplier *</label>
                <input
                  type="text"
                  value={componentSupplier}
                  onChange={(e) => setComponentSupplier(e.target.value)}
                  placeholder="Supplier name"
                  className="mt-1"
                />
              </div>

              <div className="form-group mb-0">
                <span className="invisible block text-sm font-semibold text-gray-900">Action</span>
                <button
                  type="button"
                  onClick={handleAddComponent}
                  className="btn btn-primary w-full"
                >
                  Add Component
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Components Table */}
        {components.length > 0 && (
          <div className="table-container">
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Component Name</th>
                    <th>Type</th>
                    <th>Supplier</th>
                    <th>% Composition</th>
                    <th>Unit Cost</th>
                    <th>Cost Contribution</th>
                    <th>Last Updated</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {components.map((comp, idx) => (
                    <tr key={idx}>
                      <td className="font-semibold">{comp.name}</td>
                      <td>{comp.type}</td>
                      <td>{comp.supplier}</td>
                      <td className="text-right">{comp.percentage.toFixed(2)}%</td>
                      <td className="text-right">${comp.unitCost.toFixed(2)}</td>
                      <td className="text-right font-semibold">${calculateCostContribution(comp).toFixed(2)}</td>
                      <td className="text-sm text-gray-600">{comp.lastUpdated}</td>
                      <td>
                        <button
                          onClick={() => handleRemoveComponent(idx)}
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
      </section>

      {/* ====== SECTION 4: COST SUMMARY ====== */}
      <section className="page-section">
        <h2 className="section-title">Cost Summary</h2>
        <div className="section-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
          {/* Total Blend Cost */}
          <div className="content-card">
            <div className="content-row-stack">
              <h3 className="text-lg font-semibold text-gray-900">Blend Cost Metrics</h3>
              <div className="space-y-4">
                <div className="compact-item">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Total Blend Cost/Liter</span>
                    <span className="text-2xl font-semibold text-gray-900">${calculateTotalBlendCost().toFixed(2)}</span>
                  </div>
                </div>

                <div className="compact-item">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-600">Batch Size (Liters)</span>
                    <input
                      type="number"
                      step="0.01"
                      value={batchSize}
                      onChange={(e) => setBatchSize(e.target.value)}
                      placeholder="Optional"
                      className="w-32 px-2 py-1 border border-gray-300 rounded text-right"
                    />
                  </div>
                </div>

                {batchSize && (
                  <div className="compact-item">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Cost per Batch</span>
                      <span className="text-2xl font-semibold text-gray-900">${calculateCostPerBatch().toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Cost Breakdown by Type */}
          <div className="content-card">
            <div className="content-row-stack">
              <h3 className="text-lg font-semibold text-gray-900">Operating Costs & Margin</h3>
              <div className="form-grid form-grid-2">
                <div className="form-group mb-0">
                  <label className="text-sm font-semibold text-gray-900">Labour Cost / L</label>
                  <input
                    type="number"
                    step="0.01"
                    value={labourCostPerLiter}
                    onChange={(e) => setLabourCostPerLiter(e.target.value)}
                    placeholder="e.g., 0.12"
                    className="mt-1"
                  />
                </div>

                <div className="form-group mb-0">
                  <label className="text-sm font-semibold text-gray-900">Plant Overhead / L</label>
                  <input
                    type="number"
                    step="0.01"
                    value={plantOverheadCostPerLiter}
                    onChange={(e) => setPlantOverheadCostPerLiter(e.target.value)}
                    placeholder="e.g., 0.10"
                    className="mt-1"
                  />
                </div>

                <div className="form-group mb-0">
                  <label className="text-sm font-semibold text-gray-900">Freight / Logistics / L</label>
                  <input
                    type="number"
                    step="0.01"
                    value={freightCostPerLiter}
                    onChange={(e) => setFreightCostPerLiter(e.target.value)}
                    placeholder="e.g., 0.08"
                    className="mt-1"
                  />
                </div>

                <div className="form-group mb-0">
                  <label className="text-sm font-semibold text-gray-900">Target Margin %</label>
                  <input
                    type="number"
                    step="0.1"
                    value={targetMarginPercent}
                    onChange={(e) => setTargetMarginPercent(e.target.value)}
                    placeholder="e.g., 20"
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="compact-item">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Operating Cost/Liter</span>
                    <span className="text-2xl font-semibold text-gray-900">${calculateOperatingCostPerLiter().toFixed(2)}</span>
                  </div>
                </div>

                <div className="compact-item">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">All-in Cost/Liter</span>
                    <span className="text-2xl font-semibold text-gray-900">${calculateAllInCostPerLiter().toFixed(2)}</span>
                  </div>
                </div>

                <div className="compact-item">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Target Selling Price/Liter</span>
                    <span className="text-2xl font-semibold text-gray-900">${calculateTargetSellingPricePerLiter().toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="mt-3 border-t border-gray-200 pt-4">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">Cost Breakdown by Type</h4>
                <div className="space-y-3">
                  {Object.entries(costBreakdown).map(([type, cost], idx) => (
                    cost > 0 && (
                      <div key={idx} className="compact-item">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-semibold text-gray-900">{type}</span>
                          <span className="text-lg font-semibold text-gray-900">${cost.toFixed(2)}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-gray-400 h-full"
                            style={{
                              width: `${(cost / calculateTotalBlendCost()) * 100 || 0}%`,
                            }}
                          ></div>
                        </div>
                        <p className="text-xs text-gray-600 mt-1">
                          {calculateTotalBlendCost() > 0 ? ((cost / calculateTotalBlendCost()) * 100).toFixed(1) : 0}% of total
                        </p>
                      </div>
                    )
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ====== SECTION 5: VERSION CONTROL ====== */}
      <section className="page-section">
        <h2 className="section-title">Version Control & Change History</h2>
        <div className="content-card">
          <div className="content-row-stack">
            <div className="mb-6">
              <p className="text-sm text-gray-600 mb-2">Current Version</p>
              <p className="metric-value">{skuForm.version}</p>
            </div>

            {changeHistory.length === 0 ? (
              <p className="text-gray-500">No changes recorded yet</p>
            ) : (
              <div className="space-y-3">
                {changeHistory.slice().reverse().map((entry, idx) => (
                  <div key={idx} className="compact-item">
                    <div className="flex justify-between items-start mb-2">
                      <p className="font-semibold text-gray-900">{entry.change}</p>
                      <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded">{entry.user}</span>
                    </div>
                    <p className="text-sm text-gray-600">{entry.timestamp}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ====== SECTION 6: RAW MATERIAL REFERENCE ====== */}
      <section className="page-section">
        <h2 className="section-title">Raw Material Reference & Pricing</h2>
        <div className="content-card">
          <div className="content-row-stack">
            <h3 className="text-lg font-semibold text-gray-900">Material Database</h3>
            {components.length === 0 ? (
              <p className="text-gray-500">No materials added yet</p>
            ) : (
              <div className="space-y-4">
                {components.map((comp, idx) => (
                  <div key={idx} className="content-card-compact">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="font-semibold text-gray-900">{comp.name}</p>
                        <p className="text-sm text-gray-600">Supplier: {comp.supplier}</p>
                      </div>
                      <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded">{comp.type}</span>
                    </div>

                    <div className="bg-gray-50 p-3 rounded mb-3">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm text-gray-600">Current Unit Cost</span>
                        <span className="font-semibold text-gray-900">${comp.unitCost.toFixed(2)}</span>
                      </div>
                      {materialPriceUpdates[comp.id] && (
                        <div className="text-xs text-gray-600 p-2 border-t border-gray-200 mt-2 pt-2">
                          <p>Previous: ${materialPriceUpdates[comp.id].oldPrice.toFixed(2)}</p>
                          <p>New Cost Impact: ${(calculateTotalBlendCost() - materialPriceUpdates[comp.id].oldCost).toFixed(2)}</p>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Update price"
                        onBlur={(e) => {
                          if (e.target.value) {
                            handleUpdateMaterialPrice(comp.id, e.target.value);
                            e.target.value = "";
                          }
                        }}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm"
                      />
                      <button className="btn btn-secondary text-sm px-4">Update Price</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
