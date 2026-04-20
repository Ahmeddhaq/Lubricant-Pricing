import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { costingEngine, recipesService, skusService, supabase } from "../services/supabaseService";
import { historyService } from "../services/historyService";
import { useAuth } from "../context/AuthContext";

const CATEGORY_HINTS = [
  { test: /5w|10w|15w|20w|30|40|engine/i, value: "Engine Oil" },
  { test: /hydraulic|aw/i, value: "Hydraulic Oil" },
  { test: /gear/i, value: "Gear Oil" },
  { test: /transmission|atf/i, value: "Transmission Oil" },
];

const COST_KEYWORDS = ["sku", "component", "%", "percent", "percentage", "cost", "contribution", "blend"];
const PRICING_KEYWORDS = ["market", "sku", "price", "currency", "margin", "markup", "sell"];
const FORMULATION_KEYWORDS = ["base oil", "additive", "ingredient", "recipe", "formulation", "component", "blend"];

const UPLOAD_CHECKLIST = [
  {
    title: "SKU import",
    text: "Use one row per SKU with a product name, category, and at least a selling price or margin column. If the workbook does not include recipe data, the app can create a provisional formulation for you to confirm later.",
  },
  {
    title: "Formulation import",
    text: "Include a formulation or recipe name plus base oil, component/additive, percentage, and unit cost columns for the best match. Sparse sheets still fall back to a placeholder formulation.",
  },
  {
    title: "Paired workbook",
    text: "If SKU rows and formulation rows are in the same workbook, keep them on separate sheets or clearly named sections.",
  },
  {
    title: "Avoid for best results",
    text: "Merged headers, blank title rows, or several unrelated tables on the same sheet make auto-detection less reliable.",
  },
];

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const cleaned = String(value).replace(/[^0-9.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function mean(values) {
  const safeValues = values.filter((value) => Number.isFinite(value));
  if (!safeValues.length) return null;
  return safeValues.reduce((sum, value) => sum + value, 0) / safeValues.length;
}

function findHeaderIndex(headers, terms) {
  const normalizedHeaders = headers.map((header) => normalize(header));
  return normalizedHeaders.findIndex((header) => terms.some((term) => header.includes(normalize(term))));
}

function extractSheetFormulas(sheet) {
  return Object.entries(sheet)
    .filter(([cell]) => !cell.startsWith("!"))
    .map(([, value]) => value?.f)
    .filter(Boolean);
}

function scoreSheet(headers, sheetName) {
  const searchText = normalize([sheetName, ...headers].join(" "));
  const score = (keywords) => keywords.reduce((total, keyword) => total + (searchText.includes(normalize(keyword)) ? 1 : 0), 0);
  return {
    costing: score(COST_KEYWORDS),
    pricing: score(PRICING_KEYWORDS),
    formulation: score(FORMULATION_KEYWORDS),
  };
}

function detectSheetRole(headers, sheetName) {
  const scores = scoreSheet(headers, sheetName);
  const entries = Object.entries(scores).sort((left, right) => right[1] - left[1]);
  const [role, topScore] = entries[0];
  if (topScore <= 0) return "other";
  return role;
}

function detectPricingLogic({ pricingHeaders, formulas, costPerLiter, priceValues }) {
  const combined = normalize([...(pricingHeaders || []), ...(formulas || [])].join(" "));

  if (combined.includes("1 -") || combined.includes("1-")) {
    return { type: "Margin-based pricing", detail: "Formula references cost divided by 1 minus margin." };
  }

  if (combined.includes("1 +") || combined.includes("1+")) {
    return { type: "Markup-based pricing", detail: "Formula references cost multiplied by 1 plus margin." };
  }

  if (pricingHeaders.some((header) => /margin|markup/i.test(header))) {
    return { type: "Margin-based pricing", detail: "Margin column is present in the pricing structure." };
  }

  if (pricingHeaders.some((header) => /market/i.test(header)) && pricingHeaders.some((header) => /price/i.test(header))) {
    return {
      type: "Market-based pricing",
      detail: "Price is stored as a market matrix rather than a single formula.",
    };
  }

  const impliedMargins = priceValues
    .map((price) => (price > 0 && Number.isFinite(costPerLiter) ? ((price - costPerLiter) / price) * 100 : null))
    .filter((value) => Number.isFinite(value));

  const averageMargin = mean(impliedMargins);
  if (Number.isFinite(averageMargin)) {
    return {
      type: "Margin-based pricing",
      detail: "Margin is inferred from the cost-to-price relationship.",
    };
  }

  return { type: "Cost-plus pricing", detail: "No explicit formula was found, so pricing is inferred from cost and price values." };
}

function inferCategory(skuName) {
  for (const hint of CATEGORY_HINTS) {
    if (hint.test.test(skuName)) return hint.value;
  }
  return "Lubricants";
}

function buildGenericSkuInsights(sheetReport, systemBenchmarkMargin) {
  const headers = sheetReport.headers || [];
  const fallbackBenchmark = Number.isFinite(systemBenchmarkMargin) ? systemBenchmarkMargin : 25;

  const skuIndex = findHeaderIndex(headers, ["sku name", "product name", "item name", "sku", "product", "item", "name"]);
  const formulationIndex = findHeaderIndex(headers, ["linked formulation", "formulation", "recipe name", "recipe", "blend", "formula"]);
  const categoryIndex = findHeaderIndex(headers, ["category", "product category", "type", "group"]);
  const costIndex = findHeaderIndex(headers, ["cost per liter", "base cost", "cost/l", "cost per unit", "unit cost", "blend cost", "cost"]);
  const priceIndex = findHeaderIndex(headers, ["selling price", "sale price", "unit price", "list price", "price"]);
  const marginIndex = findHeaderIndex(headers, ["margin %", "gross margin", "margin"]);

  const marketColumnIndexes = headers
    .map((header, index) => ({ header, index, normalized: normalize(header) }))
    .filter(({ index, normalized }) => {
      if ([skuIndex, formulationIndex, categoryIndex, costIndex, priceIndex, marginIndex].includes(index)) return false;
      return /(gcc|africa|asia|europe|america|middle east|uae|ksa|gulf|domestic|export|market|region|channel|customer|distributor|bulk|retail)/i.test(normalized);
    })
    .map(({ index }) => index);

  if (skuIndex < 0 && formulationIndex < 0) return [];

  return sheetReport.rows.slice(1).map((row, rowIndex) => {
    const rawSku = skuIndex >= 0 ? row[skuIndex] : "";
    const rawFormulation = formulationIndex >= 0 ? row[formulationIndex] : "";
    const rawCategory = categoryIndex >= 0 ? row[categoryIndex] : "";
    const costPerLiter = costIndex >= 0 ? toNumber(row[costIndex]) : null;
    const directPrice = priceIndex >= 0 ? toNumber(row[priceIndex]) : null;
    const directMargin = marginIndex >= 0 ? toNumber(row[marginIndex]) : null;

    const marketPrices = [];
    if (directPrice !== null) {
      marketPrices.push({ market: headers[priceIndex] || "Selling Price", price: directPrice });
    }

    marketColumnIndexes.forEach((index) => {
      const marketPrice = toNumber(row[index]);
      if (marketPrice !== null) {
        marketPrices.push({ market: headers[index] || `Column ${index + 1}`, price: marketPrice });
      }
    });

    const rowHasSignal = Boolean(
      String(rawSku || rawFormulation || rawCategory || "").trim()
      || costPerLiter !== null
      || directPrice !== null
      || directMargin !== null
      || marketPrices.length > 0,
    );

    if (!rowHasSignal) {
      return null;
    }

    const displayName = String(rawSku || rawFormulation || rawCategory || `SKU ${rowIndex + 2}`).trim();

    const derivedAveragePrice = marketPrices.length
      ? mean(marketPrices.map((entry) => entry.price))
      : directPrice;
    const priceForMargin = derivedAveragePrice ?? (costPerLiter !== null && directMargin !== null && directMargin < 100
      ? costPerLiter / (1 - directMargin / 100)
      : 0);
    const derivedAverageMargin = directMargin !== null
      ? directMargin
      : costPerLiter !== null && priceForMargin > 0
        ? ((priceForMargin - costPerLiter) / priceForMargin) * 100
        : 0;
    const recipeNameCandidates = Array.from(new Set([
      rawFormulation,
      displayName,
      `${displayName} Formulation`,
      `${displayName} Blend`,
      sheetReport.sheetName,
    ].filter(Boolean)));
    const pricingLogicType = marketPrices.length > 1
      ? "Market-based pricing"
      : directMargin !== null
        ? "Margin-based pricing"
        : "Cost-plus pricing";
    const pricingLogicDetail = marketPrices.length > 1
      ? "Workbook stores price across market or customer columns."
      : directMargin !== null
        ? "Workbook provides an explicit margin column."
        : "Workbook provides cost and price inputs only.";

    return {
      sku: normalize(displayName) || `row-${sheetReport.sheetName}-${rowIndex + 2}`,
      displayName,
      category: rawCategory || inferCategory(displayName),
      costPerLiter: Number((costPerLiter ?? 0).toFixed(2)),
      averagePrice: Number(((derivedAveragePrice ?? 0)).toFixed(2)),
      averageMargin: Number((derivedAverageMargin ?? 0).toFixed(2)),
      profitPerUnit: Number((((derivedAveragePrice ?? 0) - (costPerLiter ?? 0))).toFixed(2)),
      pricingLogicType,
      pricingLogicDetail,
      marketPrices,
      components: [],
      missingCostComponents: costPerLiter === null ? [`${displayName}: missing cost`] : [],
      systemBenchmarkMargin: fallbackBenchmark,
      systemBenchmarkPrice: Number(costingEngine.calculateSellingPrice(costPerLiter ?? 0, fallbackBenchmark).toFixed(2)),
      marginDelta: Number(((derivedAverageMargin ?? 0) - fallbackBenchmark).toFixed(2)),
      recipeName: rawFormulation ? String(rawFormulation).trim() : "",
      recipeNameCandidates,
    };
  }).filter(Boolean);
}

function mergeSkuInsight(primary, secondary) {
  const pickText = (...values) => values.find((value) => String(value ?? "").trim()) || "";
  const pickNumber = (...values) => values.find((value) => Number.isFinite(value));
  const pickArray = (primaryValues, secondaryValues) => (primaryValues?.length ? primaryValues : secondaryValues || []);

  return {
    ...secondary,
    ...primary,
    sku: primary.sku || secondary.sku,
    displayName: pickText(primary.displayName, secondary.displayName),
    category: pickText(primary.category, secondary.category),
    costPerLiter: pickNumber(primary.costPerLiter, secondary.costPerLiter) ?? 0,
    averagePrice: pickNumber(primary.averagePrice, secondary.averagePrice) ?? 0,
    averageMargin: pickNumber(primary.averageMargin, secondary.averageMargin) ?? 0,
    profitPerUnit: pickNumber(primary.profitPerUnit, secondary.profitPerUnit) ?? 0,
    pricingLogicType: pickText(primary.pricingLogicType, secondary.pricingLogicType),
    pricingLogicDetail: pickText(primary.pricingLogicDetail, secondary.pricingLogicDetail),
    marketPrices: pickArray(primary.marketPrices, secondary.marketPrices),
    components: pickArray(primary.components, secondary.components),
    missingCostComponents: Array.from(new Set([...(primary.missingCostComponents || []), ...(secondary.missingCostComponents || [])])),
    systemBenchmarkMargin: pickNumber(primary.systemBenchmarkMargin, secondary.systemBenchmarkMargin) ?? 25,
    systemBenchmarkPrice: pickNumber(primary.systemBenchmarkPrice, secondary.systemBenchmarkPrice) ?? 0,
    marginDelta: pickNumber(primary.marginDelta, secondary.marginDelta) ?? 0,
    recipeName: pickText(primary.recipeName, secondary.recipeName),
    recipeNameCandidates: Array.from(new Set([...(primary.recipeNameCandidates || []), ...(secondary.recipeNameCandidates || [])])),
  };
}

function inferFormulationComponentType(componentName, explicitType = "") {
  const explicitValue = String(explicitType ?? "").trim();
  if (explicitValue) return explicitValue;

  const normalized = normalize(componentName);
  if (/base oil/i.test(normalized)) return "Base Oil";
  if (/vi improver|modifier/i.test(normalized)) return "Modifier";
  if (/additive/i.test(normalized)) return "Additive";
  return "Additive";
}

function buildFormulationSheetInsights(sheetReport, systemBenchmarkMargin) {
  const headers = sheetReport.headers || [];
  const skuIndex = findHeaderIndex(headers, ["sku", "product", "name"]);
  const componentIndex = findHeaderIndex(headers, ["component", "ingredient", "material"]);
  const typeIndex = findHeaderIndex(headers, ["type", "component type", "ingredient type"]);
  const percentIndex = findHeaderIndex(headers, ["percentage", "%", "percent"]);
  const unitCostIndex = findHeaderIndex(headers, ["unit cost", "cost/l", "cost per liter", "cost per unit"]);
  const contributionIndex = findHeaderIndex(headers, ["cost contribution", "contribution"]);
  const fallbackBenchmark = Number.isFinite(systemBenchmarkMargin) ? systemBenchmarkMargin : 25;
  const groupedInsights = new Map();

  sheetReport.rows.slice(1).forEach((row, rowIndex) => {
    const rawSku = skuIndex >= 0 ? row[skuIndex] : "";
    const sku = normalize(rawSku);
    if (!sku) return;

    const displayName = String(rawSku || `SKU ${rowIndex + 2}`).trim();
    const rawComponent = componentIndex >= 0 ? row[componentIndex] : "";
    const rawType = typeIndex >= 0 ? row[typeIndex] : "";
    const percentage = percentIndex >= 0 ? toNumber(row[percentIndex]) : null;
    const unitCost = unitCostIndex >= 0 ? toNumber(row[unitCostIndex]) : null;
    const contributionValue = contributionIndex >= 0 ? toNumber(row[contributionIndex]) : null;
    const contribution = contributionValue ?? (percentage !== null && unitCost !== null ? (percentage * unitCost) / 100 : null);

    if (!groupedInsights.has(sku)) {
      groupedInsights.set(sku, {
        sku,
        displayName,
        components: [],
        totalCostPerLiter: 0,
        missingComponents: [],
      });
    }

    const group = groupedInsights.get(sku);
    if (!group.displayName) {
      group.displayName = displayName;
    }

    group.components.push({
      component: String(rawComponent || `Row ${rowIndex + 2}`),
      type: inferFormulationComponentType(rawComponent, rawType),
      percentage,
      unitCost,
      contribution,
    });

    if (contribution !== null) {
      group.totalCostPerLiter += contribution;
    }

    if (!rawComponent || percentage === null || unitCost === null || contribution === null) {
      group.missingComponents.push(`${displayName.toUpperCase()}: ${rawComponent || `Row ${rowIndex + 2}`}`);
    }
  });

  return Array.from(groupedInsights.values()).map((group) => {
    const formulationCostPerLiter = Number(group.totalCostPerLiter.toFixed(2));

    return {
      sku: group.sku,
      displayName: group.displayName,
      category: inferCategory(group.displayName),
      costPerLiter: formulationCostPerLiter,
      formulationCostPerLiter,
      formulationComponents: group.components,
      formulationPricingLogicType: "Formulation sheet",
      formulationPricingLogicDetail: `${sheetReport.sheetName} parsed into ${group.components.length} component${group.components.length === 1 ? "" : "s"}.`,
      formulationSheetName: sheetReport.sheetName,
      missingCostComponents: group.missingComponents,
      systemBenchmarkMargin: fallbackBenchmark,
      systemBenchmarkPrice: Number(costingEngine.calculateSellingPrice(formulationCostPerLiter, fallbackBenchmark).toFixed(2)),
      recipeNameCandidates: Array.from(new Set([
        group.displayName,
        `${group.displayName} Formulation`,
        sheetReport.sheetName,
      ])),
    };
  });
}

function buildAnalysis(workbook, systemBenchmarkMargin) {
  const sheetReports = workbook.SheetNames.map((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "", blankrows: false });
    const headers = rows[0] || [];
    const role = detectSheetRole(headers, sheetName);
    const formulas = extractSheetFormulas(worksheet);

    return {
      sheetName,
      headers,
      rows,
      role,
      formulas,
    };
  });

  const costSheet = sheetReports.find((sheet) => sheet.role === "costing" || /cost/i.test(sheet.sheetName)) || null;
  const pricingSheet = sheetReports.find((sheet) => sheet.role === "pricing" || /price/i.test(sheet.sheetName)) || null;
  const formulationSheets = sheetReports.filter((sheet) => sheet.role === "formulation" || /formulation|recipe|blend/i.test(sheet.sheetName));
  const formulationSheet = formulationSheets[0] || null;

  const costBySku = new Map();
  const pricingBySku = new Map();
  const missingCostComponents = [];

  if (costSheet) {
    const skuIndex = findHeaderIndex(costSheet.headers, ["sku"]);
    const componentIndex = findHeaderIndex(costSheet.headers, ["component", "ingredient", "material"]);
    const percentIndex = findHeaderIndex(costSheet.headers, ["%", "percent", "percentage"]);
    const costIndex = findHeaderIndex(costSheet.headers, ["cost", "unit cost"]);
    const contributionIndex = findHeaderIndex(costSheet.headers, ["contribution", "impact"]);

    costSheet.rows.slice(1).forEach((row, index) => {
      const sku = normalize(row[skuIndex]);
      const component = row[componentIndex] || `Row ${index + 2}`;
      const percentage = toNumber(row[percentIndex]);
      const unitCost = toNumber(row[costIndex]);
      const contributionValue = toNumber(row[contributionIndex]);
      const contribution = contributionValue ?? (percentage !== null && unitCost !== null ? (percentage * unitCost) / 100 : null);

      if (!sku) return;

      if (!costBySku.has(sku)) {
        costBySku.set(sku, {
          sku,
          components: [],
          totalCostPerLiter: 0,
          missingComponents: [],
        });
      }

      const skuEntry = costBySku.get(sku);
      skuEntry.components.push({
        component: String(component),
        percentage,
        unitCost,
        contribution,
      });

      if (contribution !== null) {
        skuEntry.totalCostPerLiter += contribution;
      }

      if (!component || percentage === null || unitCost === null || contribution === null) {
        const missingLabel = `${sku.toUpperCase()}: ${component}`;
        skuEntry.missingComponents.push(missingLabel);
        missingCostComponents.push(missingLabel);
      }
    });
  }

  if (pricingSheet) {
    const marketIndex = findHeaderIndex(pricingSheet.headers, ["market", "region", "channel"]);
    const skuIndex = findHeaderIndex(pricingSheet.headers, ["sku"]);
    const priceIndex = findHeaderIndex(pricingSheet.headers, ["price", "selling price", "unit price"]);

    pricingSheet.rows.slice(1).forEach((row, index) => {
      const sku = normalize(row[skuIndex]);
      const market = row[marketIndex] || `Row ${index + 2}`;
      const price = toNumber(row[priceIndex]);

      if (!sku || price === null) return;

      if (!pricingBySku.has(sku)) {
        pricingBySku.set(sku, {
          sku,
          marketPrices: [],
        });
      }

      pricingBySku.get(sku).marketPrices.push({
        market: String(market),
        price,
      });
    });
  }

  const detectedSkus = Array.from(new Set([...costBySku.keys(), ...pricingBySku.keys()]));
  const fallbackBenchmark = Number.isFinite(systemBenchmarkMargin) ? systemBenchmarkMargin : 25;

  const structuredSkuInsights = detectedSkus.map((sku) => {
    const costEntry = costBySku.get(sku) || { components: [], totalCostPerLiter: 0, missingComponents: [] };
    const pricingEntry = pricingBySku.get(sku) || { marketPrices: [] };
    const priceValues = pricingEntry.marketPrices.map((entry) => entry.price);
    const averagePrice = mean(priceValues) || 0;
    const impliedMargins = priceValues
      .map((price) => (price > 0 ? ((price - costEntry.totalCostPerLiter) / price) * 100 : null))
      .filter((value) => Number.isFinite(value));
    const averageMargin = mean(impliedMargins) ?? 0;
    const logic = detectPricingLogic({
      pricingHeaders: pricingSheet ? pricingSheet.headers : [],
      formulas: [...(pricingSheet?.formulas || []), ...(costSheet?.formulas || [])],
      costPerLiter: costEntry.totalCostPerLiter,
      priceValues,
    });
    const systemBenchmarkPrice = costingEngine.calculateSellingPrice(costEntry.totalCostPerLiter, fallbackBenchmark);
    const profitPerUnit = averagePrice - costEntry.totalCostPerLiter;

    return {
      sku,
      displayName: sku.toUpperCase(),
      category: inferCategory(sku),
      costPerLiter: Number(costEntry.totalCostPerLiter.toFixed(2)),
      averagePrice: Number(averagePrice.toFixed(2)),
      averageMargin: Number(averageMargin.toFixed(2)),
      profitPerUnit: Number(profitPerUnit.toFixed(2)),
      pricingLogicType: logic.type,
      pricingLogicDetail: logic.detail,
      marketPrices: pricingEntry.marketPrices,
      components: costEntry.components,
      missingCostComponents: costEntry.missingComponents,
      systemBenchmarkMargin: fallbackBenchmark,
      systemBenchmarkPrice: Number(systemBenchmarkPrice.toFixed(2)),
      marginDelta: Number((averageMargin - fallbackBenchmark).toFixed(2)),
    };
  });

  const genericSkuInsights = sheetReports.flatMap((sheet) => buildGenericSkuInsights(sheet, fallbackBenchmark));
  const formulationSheetInsights = formulationSheets.flatMap((sheet) => buildFormulationSheetInsights(sheet, fallbackBenchmark));
  const skuInsightMap = new Map();

  structuredSkuInsights.forEach((insight) => {
    const key = normalize(insight.sku || insight.displayName);
    if (key) {
      skuInsightMap.set(key, insight);
    }
  });

  genericSkuInsights.forEach((insight) => {
    const key = normalize(insight.sku || insight.displayName);
    if (!key) return;

    if (skuInsightMap.has(key)) {
      skuInsightMap.set(key, mergeSkuInsight(skuInsightMap.get(key), insight));
      return;
    }

    skuInsightMap.set(key, insight);
  });

  formulationSheetInsights.forEach((insight) => {
    const key = normalize(insight.sku || insight.displayName);
    if (!key) return;

    if (skuInsightMap.has(key)) {
      const current = skuInsightMap.get(key);
      skuInsightMap.set(key, {
        ...current,
        costPerLiter: insight.formulationCostPerLiter ?? current.costPerLiter,
        formulationCostPerLiter: insight.formulationCostPerLiter,
        formulationComponents: insight.formulationComponents,
        formulationPricingLogicType: insight.formulationPricingLogicType,
        formulationPricingLogicDetail: insight.formulationPricingLogicDetail,
        formulationSheetName: insight.formulationSheetName,
        formulationRecipeNameCandidates: insight.recipeNameCandidates,
        missingCostComponents: Array.from(new Set([...(current.missingCostComponents || []), ...(insight.missingCostComponents || [])])),
        recipeNameCandidates: Array.from(new Set([...(current.recipeNameCandidates || []), ...(insight.recipeNameCandidates || [])])),
      });
      return;
    }

    skuInsightMap.set(key, insight);
  });

  const skuInsights = Array.from(skuInsightMap.values());

  return {
    workbookName: workbook.Props?.Title || workbook.SheetNames[0] || "Uploaded workbook",
    sheetReports,
    costSheet,
    pricingSheet,
    formulationSheet,
    formulationInsights: formulationSheetInsights,
    skuInsights,
    missingCostComponents: Array.from(new Set(missingCostComponents)),
  };
}

function buildDraftBundle(report, selectedInsight) {
  if (!selectedInsight) return null;

  const recipeNameCandidates = [
    selectedInsight.recipeName,
    selectedInsight.formulationName,
    selectedInsight.displayName,
    `${selectedInsight.displayName} Formulation`,
    `${selectedInsight.displayName} Blend`,
    ...(selectedInsight.recipeNameCandidates || []),
    ...(selectedInsight.formulationRecipeNameCandidates || []),
    report.formulationSheet?.sheetName,
    selectedInsight.formulationSheetName,
  ].filter(Boolean);

  const sourceComponents = selectedInsight.formulationComponents || selectedInsight.components || [];
  const componentDrafts = sourceComponents.map((component, index) => ({
    id: `${selectedInsight.sku}-${index}`,
    name: component.component,
    type: component.type || (/base oil/i.test(component.component) ? "Base Oil" : "Additive"),
    supplier: "Imported from Excel",
    percentage: component.percentage ?? 0,
    unitCost: component.unitCost ?? 0,
  }));

  const formulationDraft = {
    sourceUploadId: report.sourceUploadId || null,
    workbookName: report.workbookName,
    skuName: selectedInsight.displayName,
    category: selectedInsight.category,
    pricingLogicType: selectedInsight.formulationPricingLogicType || selectedInsight.pricingLogicType,
    estimatedCostPerLiter: selectedInsight.formulationCostPerLiter ?? selectedInsight.costPerLiter,
    marginPercent: selectedInsight.averageMargin,
    batchSize: 100,
    components: componentDrafts,
    recipeNameCandidates,
  };

  const skuDraft = {
    sourceUploadId: report.sourceUploadId || null,
    workbookName: report.workbookName,
    name: selectedInsight.displayName,
    category: selectedInsight.category,
    recipeName: recipeNameCandidates[0],
    recipeNameCandidates,
    recipeId: "",
    baseCostPerLiter: selectedInsight.costPerLiter,
    currentSellingPrice: selectedInsight.averagePrice,
    marginPercent: selectedInsight.averageMargin,
    recommendedMarginPercent: selectedInsight.systemBenchmarkMargin,
    pricingLogicType: selectedInsight.pricingLogicType,
    marketPrices: selectedInsight.marketPrices,
    missingCostComponents: selectedInsight.missingCostComponents,
  };

  return { formulationDraft, skuDraft };
}

export default function ExcelIntelligence({ onPrepareImport, onPrepareFormulationImport, onWorkbookSessionReady, externalWorkbookRequest, onExternalWorkbookHandled }) {
  const { user } = useAuth();
  const [analysis, setAnalysis] = useState(null);
  const [loadingWorkbook, setLoadingWorkbook] = useState(false);
  const [error, setError] = useState("");
  const [selectedSku, setSelectedSku] = useState("");
  const [showUploadHelp, setShowUploadHelp] = useState(false);
  const [systemSummary, setSystemSummary] = useState({
    loaded: false,
    averageMargin: null,
    benchmarkMargin: 25,
  });
  const autoImportTriggeredRef = useRef("");
  const autoFormulationTriggeredRef = useRef("");

  useEffect(() => {
    let cancelled = false;

    const loadSystemSummary = async () => {
      try {
        const [skus, recipes] = await Promise.all([skusService.getAll(), recipesService.getAll()]);
        const margins = skus
          .map((sku) => {
            const recipe = recipes.find((entry) => entry.id === sku.recipe_id) || sku.recipes;
            const sellingPrice = toNumber(sku.current_selling_price ?? sku.selling_price ?? 0);
            if (!recipe || !sellingPrice) return null;
            const cost = costingEngine.calculateTotalCostPerUnit(recipe, sku).totalCost;
            return sellingPrice > 0 ? ((sellingPrice - cost) / sellingPrice) * 100 : null;
          })
          .filter((value) => Number.isFinite(value));

        const averageMargin = mean(margins);
        if (!cancelled) {
          setSystemSummary({
            loaded: true,
            averageMargin: averageMargin !== null ? Number(averageMargin.toFixed(2)) : null,
            benchmarkMargin: 25,
          });
        }
      } catch (loadError) {
        if (!cancelled) {
          setSystemSummary({
            loaded: false,
            averageMargin: null,
            benchmarkMargin: 25,
          });
        }
      }
    };

    loadSystemSummary();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedInsight = useMemo(() => {
    if (!analysis?.skuInsights?.length) return null;
    return analysis.skuInsights.find((entry) => entry.sku === selectedSku) || analysis.skuInsights[0];
  }, [analysis, selectedSku]);

  useEffect(() => {
    if (!analysis?.skuInsights?.length) {
      setSelectedSku("");
      return;
    }

    if (!selectedSku || !analysis.skuInsights.some((entry) => entry.sku === selectedSku)) {
      setSelectedSku(analysis.skuInsights[0].sku);
    }
  }, [analysis, selectedSku]);

  const processWorkbookFile = async (file, { persistUpload = true, sourceUploadId = null } = {}) => {
    const workbook = XLSX.read(await file.arrayBuffer(), {
      type: "array",
      cellFormula: true,
      cellDates: true,
    });

    let uploadSourceId = sourceUploadId;

    if (persistUpload) {
      if (!user?.id) {
        throw new Error("You must be signed in to upload workbooks.");
      }

      const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
      const storagePath = `${user.id}/${Date.now()}-${safeFilename}`;
      const { error: storageError } = await supabase.storage
        .from("excel-uploads")
        .upload(storagePath, file, {
          contentType: file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          upsert: false,
        });

      if (storageError) {
        throw storageError;
      }

      const report = buildAnalysis(workbook, systemSummary.benchmarkMargin);
      const rowCount = report.sheetReports.reduce((total, sheet) => total + Math.max((sheet.rows || []).length - 1, 0), 0);
      const uploadRecord = await historyService.recordUpload({
        originalFilename: file.name,
        storageBucket: "excel-uploads",
        storagePath,
        fileSizeBytes: file.size,
        sheetCount: report.sheetReports.length,
        rowCount,
        sourceAppVersion: "1.0.0",
        notes: report.workbookName,
      });

      uploadSourceId = uploadRecord.id;

      const averageCostPerLiter = mean(report.skuInsights.map((entry) => toNumber(entry.costPerLiter)));
      const averagePrice = mean(report.skuInsights.map((entry) => toNumber(entry.averagePrice ?? entry.currentSellingPrice)));
      const averageMargin = mean(report.skuInsights.map((entry) => toNumber(entry.averageMargin)));
      const workbookSessionSummary = {
        workbookName: report.workbookName,
        sheetCount: report.sheetReports.length,
        formulationCount: report.formulationInsights.length,
        skuCount: report.skuInsights.length,
        averageCostPerLiter: Number.isFinite(averageCostPerLiter) ? Number(averageCostPerLiter.toFixed(2)) : 0,
        averagePrice: Number.isFinite(averagePrice) ? Number(averagePrice.toFixed(2)) : 0,
        averageMargin: Number.isFinite(averageMargin) ? Number(averageMargin.toFixed(2)) : 0,
      };
      workbookSessionSummary.averageProfitPerUnit = Number((workbookSessionSummary.averagePrice - workbookSessionSummary.averageCostPerLiter).toFixed(2));
      workbookSessionSummary.averageCostPerUnit = workbookSessionSummary.averageCostPerLiter;
      workbookSessionSummary.averageSellingPrice = workbookSessionSummary.averagePrice;
      workbookSessionSummary.averageMarginPercent = workbookSessionSummary.averageMargin;
      workbookSessionSummary.sessionCost = workbookSessionSummary.averageCostPerUnit;
      workbookSessionSummary.sessionPrice = workbookSessionSummary.averageSellingPrice;
      workbookSessionSummary.sessionProfit = workbookSessionSummary.averageProfitPerUnit;
      workbookSessionSummary.sessionMargin = workbookSessionSummary.averageMarginPercent;

      try {
        await historyService.recordRun({
          runLabel: `${report.workbookName} session`,
          runType: "workbook-analysis",
          runData: workbookSessionSummary,
          sourceUploadId: uploadSourceId,
          notes: report.workbookName,
        });
      } catch (sessionError) {
        console.error("Failed to save workbook session history:", sessionError);
      }

      if (onWorkbookSessionReady) {
        onWorkbookSessionReady({
          uploadId: uploadSourceId,
          workbookName: report.workbookName,
        });
      }

      setAnalysis({ ...report, sourceUploadId: uploadSourceId });
      setSelectedSku(report.skuInsights[0]?.sku || "");
      return;
    }

    const report = buildAnalysis(workbook, systemSummary.benchmarkMargin);
    setAnalysis({ ...report, sourceUploadId: uploadSourceId });
    setSelectedSku(report.skuInsights[0]?.sku || "");

    if (onWorkbookSessionReady && uploadSourceId) {
      onWorkbookSessionReady({
        uploadId: uploadSourceId,
        workbookName: report.workbookName,
        reopened: true,
      });
    }
  };

  useEffect(() => {
    if (!externalWorkbookRequest?.requestId || !externalWorkbookRequest.file) return;

    let cancelled = false;

    const reopenWorkbook = async () => {
      setLoadingWorkbook(true);
      setError("");

      try {
        await processWorkbookFile(externalWorkbookRequest.file, {
          persistUpload: false,
          sourceUploadId: externalWorkbookRequest.uploadId || null,
        });
      } catch (reopenError) {
        if (!cancelled) {
          setAnalysis(null);
          setError(reopenError?.message || "Unable to reopen workbook");
        }
      } finally {
        if (!cancelled) {
          setLoadingWorkbook(false);
          if (onExternalWorkbookHandled) {
            onExternalWorkbookHandled();
          }
        }
      }
    };

    reopenWorkbook();

    return () => {
      cancelled = true;
    };
  }, [externalWorkbookRequest?.requestId]);

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!user?.id) {
      setError("You must be signed in to upload workbooks.");
      event.target.value = "";
      return;
    }

    setLoadingWorkbook(true);
    setError("");

    try {
      await processWorkbookFile(file, { persistUpload: true });
    } catch (readError) {
      setAnalysis(null);
      setError(readError?.message || "Unable to read workbook");
    } finally {
      setLoadingWorkbook(false);
      event.target.value = "";
    }
  };

  const selectedDrafts = useMemo(
    () => (analysis && selectedInsight ? buildDraftBundle(analysis, selectedInsight) : null),
    [analysis, selectedInsight],
  );
  const allDraftBundles = useMemo(
    () => (analysis?.skuInsights?.length ? analysis.skuInsights.map((entry) => buildDraftBundle(analysis, entry)) : []),
    [analysis],
  );

  const compareMargin = selectedInsight
    ? (selectedInsight.averageMargin - (systemSummary.averageMargin ?? selectedInsight.systemBenchmarkMargin)).toFixed(2)
    : "0.00";

  const comparisonBaseline = systemSummary.averageMargin ?? selectedInsight?.systemBenchmarkMargin ?? 25;
  const expectedBaselinePrice = selectedInsight
    ? costingEngine.calculateSellingPrice(selectedInsight.costPerLiter, comparisonBaseline)
    : 0;

  const hasWorkbook = Boolean(analysis);
  const pricingGap = selectedInsight ? Number((selectedInsight.averagePrice - expectedBaselinePrice).toFixed(2)) : 0;
  const statusLabel = selectedInsight
    ? selectedInsight.averageMargin < comparisonBaseline
      ? "Underpricing"
      : selectedInsight.averageMargin > comparisonBaseline
        ? "Above benchmark"
        : "Aligned"
    : "No data";

  const handlePrepareFormulation = () => {
    if (!selectedDrafts) return;

    const payload = {
      kind: "formulation",
      draft: selectedDrafts.formulationDraft,
      linkedSkuDraft: selectedDrafts.skuDraft,
      linkedSkuDrafts: allDraftBundles.map((bundle) => bundle.skuDraft),
    };

    if (onPrepareFormulationImport) {
      onPrepareFormulationImport(payload);
      return;
    }

    if (onPrepareImport) {
      onPrepareImport(payload, "formulation");
    }
  };

  const handlePrepare = (targetTab) => {
    if (targetTab === "formulation") {
      handlePrepareFormulation();
      return;
    }

    if (!selectedDrafts || !onPrepareImport) return;

    if (allDraftBundles.length > 1) {
      onPrepareImport(
        {
          kind: "sku-batch",
          draft: selectedDrafts.skuDraft,
          drafts: allDraftBundles.map((bundle) => bundle.skuDraft),
          linkedFormulationDraft: selectedDrafts.formulationDraft,
          linkedFormulationDrafts: allDraftBundles.map((bundle) => bundle.formulationDraft),
        },
        targetTab,
      );
      return;
    }

    onPrepareImport(
      {
        kind: "sku",
        draft: selectedDrafts.skuDraft,
        linkedFormulationDraft: selectedDrafts.formulationDraft,
      },
      targetTab,
    );
  };

  const autoImportKey = useMemo(() => {
    if (!analysis || !selectedDrafts || allDraftBundles.length < 2 || !onPrepareImport) {
      return "";
    }

    return [
      analysis.sourceUploadId || analysis.workbookName || "workbook",
      allDraftBundles.length,
      selectedDrafts.skuDraft?.sku || selectedDrafts.skuDraft?.name || selectedDrafts.formulationDraft?.recipeName || "sku",
    ].join("|");
  }, [analysis, selectedDrafts, allDraftBundles.length, onPrepareImport]);

  // Auto-import batch SKUs when analysis is ready
  useEffect(() => {
    if (!autoImportKey) {
      if (!analysis) {
        autoImportTriggeredRef.current = "";
      }
      return;
    }

    if (autoImportTriggeredRef.current === autoImportKey) {
      return;
    }

    autoImportTriggeredRef.current = autoImportKey;
    console.log("🚀 Auto-triggering batch SKU import for", allDraftBundles.length, "SKUs");

    // Small delay to ensure UI state is settled
    const timer = window.setTimeout(() => {
      handlePrepare("skus");
    }, 500);

    return () => window.clearTimeout(timer);
  }, [autoImportKey, allDraftBundles.length, analysis]);

  const autoFormulationKey = useMemo(() => {
    if (!analysis || !selectedDrafts || !selectedDrafts.formulationDraft?.components?.length || !onPrepareFormulationImport) {
      return "";
    }

    return [
      analysis.sourceUploadId || analysis.workbookName || "workbook",
      selectedDrafts.formulationDraft.skuName || selectedDrafts.formulationDraft.name || "formulation",
      selectedDrafts.formulationDraft.components.length,
    ].join("|");
  }, [analysis, selectedDrafts, onPrepareFormulationImport]);

  useEffect(() => {
    if (!autoFormulationKey) {
      if (!analysis) {
        autoFormulationTriggeredRef.current = "";
      }
      return;
    }

    if (autoFormulationTriggeredRef.current === autoFormulationKey) {
      return;
    }

    autoFormulationTriggeredRef.current = autoFormulationKey;
    const timer = window.setTimeout(() => {
      handlePrepareFormulation();
    }, 500);

    return () => window.clearTimeout(timer);
  }, [autoFormulationKey, analysis, selectedDrafts, allDraftBundles.length]);

  return (
    <div className="page-stack">
      <section className="page-section">
        <div className="content-card border-dashed border-slate-300 bg-slate-50/70">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="section-title">Upload Excel Workbook</h2>
              <p className="section-subtitle">
                Detect cost columns, pricing columns, margin logic, and formulation structure before you decide whether to convert anything into the system.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-100"
                aria-label="Check workbook format before uploading"
                aria-expanded={showUploadHelp}
                aria-controls="upload-format-help"
                onClick={() => setShowUploadHelp((value) => !value)}
                title="Check workbook format before uploading"
              >
                i
              </button>

              <label className="choose-file-button">
                <span>{loadingWorkbook ? "Analyzing workbook..." : "Choose Excel file"}</span>
                <input type="file" accept=".xlsx,.xls" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>
          </div>

          {showUploadHelp && (
            <div id="upload-format-help" className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-6">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Check this before uploading</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    The app works with a normal workbook, but it auto-detects better when the file follows one of these patterns.
                  </p>
                </div>
                <button type="button" className="text-sm font-semibold text-slate-500 hover:text-slate-900 md:pt-1" onClick={() => setShowUploadHelp(false)}>
                  Close
                </button>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {UPLOAD_CHECKLIST.map((item) => (
                  <div key={item.title} className="rounded-xl bg-slate-50 p-4 shadow-sm">
                    <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{item.text}</p>
                  </div>
                ))}
              </div>

              <p className="mt-5 text-sm leading-6 text-slate-600">
                If the workbook has only SKU names and prices, the SKU import can still work. The app will create a placeholder formulation when it needs one, then let you confirm or edit it in the SKU page.
              </p>
            </div>
          )}

          {error && <p className="mt-4 text-sm font-semibold text-red-700">{error}</p>}
          {!analysis && !error && <p className="mt-4 text-sm text-slate-600">The app will not auto-fill your system. It only reads the workbook and prepares a draft when you explicitly ask for it.</p>}
        </div>
      </section>

      {hasWorkbook && (
        <>
          <section className="page-section">
            <h2 className="section-title">Structure Detection</h2>
            <div className="metric-grid metric-grid-3">
              <div className="metric-card">
                <p className="metric-label">Workbook</p>
                <p className="metric-value text-2xl">{analysis.workbookName}</p>
                <p className="metric-caption">{analysis.sheetReports.length} sheet(s) detected</p>
              </div>
              <div className="metric-card">
                <p className="metric-label">Cost Sheets</p>
                <p className="metric-value text-2xl">{analysis.costSheet ? 1 : 0}</p>
                <p className="metric-caption">Cost columns and contributions were found</p>
              </div>
              <div className="metric-card">
                <p className="metric-label">Pricing Sheets</p>
                <p className="metric-value text-2xl">{analysis.pricingSheet ? 1 : 0}</p>
                <p className="metric-caption">Pricing matrix and market rows were found</p>
              </div>
            </div>
          </section>

          <section className="page-section">
            <h2 className="section-title">Detected Sheets</h2>
            <div className="grid gap-4 xl:grid-cols-3">
              {analysis.sheetReports.map((sheet) => (
                <div key={sheet.sheetName} className="content-card hover-lift">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">{sheet.sheetName}</h3>
                      <p className="text-sm text-slate-600">{sheet.rows.length - 1} data row(s)</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-700">
                      {sheet.role}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-slate-700">
                    {sheet.headers.map((header) => (
                      <span key={header} className="rounded-full bg-slate-100 px-3 py-1">
                        {header || "(blank)"}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="page-section">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="section-title">Extracted Insights</h2>
                <p className="section-subtitle">
                  Select a SKU to review its cost per liter, margin, pricing logic, and pricing gap against the current system benchmark.
                </p>
              </div>

              {analysis.skuInsights.length > 1 && (
                <select
                  value={selectedSku}
                  onChange={(event) => setSelectedSku(event.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900"
                >
                  {analysis.skuInsights.map((entry) => (
                    <option key={entry.sku} value={entry.sku}>
                      {entry.displayName}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {selectedInsight && (
              <div className="metric-grid metric-grid-6">
                <div className="metric-card">
                  <p className="metric-label">Cost per liter</p>
                  <p className="metric-value">${selectedInsight.costPerLiter.toFixed(2)}</p>
                </div>
                <div className="metric-card">
                  <p className="metric-label">Margin used</p>
                  <p className="metric-value">{selectedInsight.averageMargin.toFixed(1)}%</p>
                </div>
                <div className="metric-card">
                  <p className="metric-label">Pricing logic</p>
                  <p className="metric-value text-2xl">{selectedInsight.pricingLogicType}</p>
                  <p className="metric-caption">{selectedInsight.pricingLogicDetail}</p>
                </div>
                <div className="metric-card">
                  <p className="metric-label">Profit per unit</p>
                  <p className="metric-value">${selectedInsight.profitPerUnit.toFixed(2)}</p>
                </div>
                <div className="metric-card">
                  <p className="metric-label">System benchmark</p>
                  <p className="metric-value">{comparisonBaseline.toFixed(1)}%</p>
                  <p className="metric-caption">
                    {systemSummary.loaded && systemSummary.averageMargin !== null
                      ? "Derived from current system SKUs"
                      : "Fallback benchmark used because the system has no margin history yet"}
                  </p>
                </div>
                <div className={`metric-card ${statusLabel === "Underpricing" ? "border-red-300" : ""}`}>
                  <p className="metric-label">Pricing status</p>
                  <p className={`metric-value ${statusLabel === "Underpricing" ? "text-red-600" : ""}`}>{statusLabel}</p>
                  <p className="metric-caption">Gap vs benchmark: {compareMargin}%</p>
                </div>
              </div>
            )}
          </section>

          {selectedInsight && (
            <section className="page-section">
              <h2 className="section-title">Missing Cost Components</h2>
              <div className="content-card">
                {selectedInsight.missingCostComponents.length > 0 ? (
                  <div className="flex flex-wrap gap-2 text-sm font-semibold text-amber-900">
                    {selectedInsight.missingCostComponents.map((component) => (
                      <span key={component} className="rounded-full bg-amber-100 px-3 py-1">
                        {component}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-600">No missing cost components were detected in the imported sheet.</p>
                )}
              </div>
            </section>
          )}

          {selectedInsight && selectedDrafts && (
            <section className="page-section">
              <h2 className="section-title">Compare With System</h2>
              <div className="metric-grid metric-grid-3">
                <div className="metric-card">
                  <p className="metric-label">Excel margin</p>
                  <p className="metric-value">{selectedInsight.averageMargin.toFixed(1)}%</p>
                </div>
                <div className="metric-card">
                  <p className="metric-label">System average margin</p>
                  <p className="metric-value">
                    {systemSummary.averageMargin !== null ? `${systemSummary.averageMargin.toFixed(1)}%` : "Not available"}
                  </p>
                </div>
                <div className="metric-card">
                  <p className="metric-label">Gap vs system benchmark price</p>
                  <p className={`metric-value ${pricingGap < 0 ? "text-red-600" : ""}`}>${pricingGap.toFixed(2)}</p>
                  <p className="metric-caption">
                    Expected at {comparisonBaseline.toFixed(1)}% margin: ${expectedBaselinePrice.toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="content-card border-slate-200 bg-slate-50/80">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Optional Conversion</h3>
                    <p className="text-sm text-slate-600">
                      Prepare a draft for the system without overwriting pricing rules. You choose whether to open SKU or formulation review.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => handlePrepare("skus")} className="btn btn-primary">
                      {allDraftBundles.length > 1 ? `Convert ${allDraftBundles.length} SKU drafts` : "Convert to SKU draft"}
                    </button>
                    <button type="button" onClick={() => handlePrepare("formulation")} className="btn btn-secondary">
                      Convert to formulation draft
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 text-sm text-slate-700 md:grid-cols-2">
                  <div className="rounded-xl bg-white p-3 border border-slate-200">
                    <p className="font-semibold text-slate-900">SKU draft</p>
                    <p>Name: {selectedDrafts.skuDraft.name}</p>
                    <p>Category: {selectedDrafts.skuDraft.category}</p>
                    <p>Base cost/l: ${selectedDrafts.skuDraft.baseCostPerLiter.toFixed(2)}</p>
                    <p>Recipe hint: {selectedDrafts.skuDraft.recipeName}</p>
                  </div>
                  <div className="rounded-xl bg-white p-3 border border-slate-200">
                    <p className="font-semibold text-slate-900">Formulation draft</p>
                    <p>Components: {selectedDrafts.formulationDraft.components.length}</p>
                    <p>Detected margin: {selectedDrafts.formulationDraft.marginPercent.toFixed(1)}%</p>
                    <p>Workbook: {selectedDrafts.formulationDraft.workbookName}</p>
                  </div>
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}