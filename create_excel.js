import xlsx from 'xlsx';

// Create workbook
const workbook = xlsx.utils.book_new();

// Costing Sheet
const costingData = [
  { SKU: "5W30", Component: "Base Oil", "%": 0.75, Cost: 2, Contribution: 1.5 },
  { SKU: "5W30", Component: "Additives", "%": 0.2, Cost: 6, Contribution: 1.2 },
  { SKU: "5W30", Component: "VI Improver", "%": 0.05, Cost: 8, Contribution: 0.4 },
];

// Pricing Matrix Sheet (sample)
const pricingData = [
  { Market: "GCC", SKU: "5W30", Price: 15, Currency: "USD" },
  { Market: "Africa", SKU: "5W30", Price: 12, Currency: "USD" },
  { Market: "Local", SKU: "5W30", Price: 10, Currency: "USD" },
];

const costingSheet = xlsx.utils.json_to_sheet(costingData);
const pricingSheet = xlsx.utils.json_to_sheet(pricingData);

xlsx.utils.book_append_sheet(workbook, costingSheet, "Costing");
xlsx.utils.book_append_sheet(workbook, pricingSheet, "Pricing Matrix");

xlsx.writeFile(workbook, "lubricant_enterprise_system.xlsx");
console.log("Excel file created: lubricant_enterprise_system.xlsx");
