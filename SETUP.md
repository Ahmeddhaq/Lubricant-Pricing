# Lubricant Pricing Dashboard - Setup Guide

## Features
✅ Excel-connected formulation engine
✅ Multi-SKU support (5W30, 20W50, etc.)
✅ Auto-load formulation costs from Excel
✅ Manual input override capability
✅ 5-second auto-refresh from server
✅ PDF quote generation with auto-download
✅ Market price reference data

## Setup Instructions

### 1. Start the Backend Server (Terminal 1)
```bash
npm run server
```
This will start the Express server on port 3001 and read data from `lubricant_enterprise_system.xlsx`

### 2. Start the React Development Server (Terminal 2)
```bash
npm run dev
```
This will start Vite on port 5173

### 3. Open in Browser
Navigate to: `http://localhost:5173`

## How It Works

### Files Involved
- **server.js** - Express backend that reads Excel file
- **lubricant_enterprise_system.xlsx** - Contains "Costing" and "Pricing Matrix" sheets
- **src/App.jsx** - React frontend with calculations and PDF generation

### Workflow
1. Select SKU from dropdown
2. System auto-loads formulation cost from Excel
3. Override any value manually (cost, margin, freight, volume)
4. See real-time calculations (price, revenue, profit)
5. Click "Generate PDF Quote" to download PDF with all data

### Data Auto-Refresh
The app fetches data from the server every 5 seconds automatically. Edit the Excel file and watch the values update!

## Troubleshooting

### "Cannot find module 'express'"
```bash
npm install express cors
```

### Server won't start
- Check if port 3001 is available
- Verify `lubricant_enterprise_system.xlsx` exists in the project root

### React won't connect to server
- Ensure server is running on port 3001
- Check browser console for CORS errors

## Future Enhancements
- Add more SKUs to Excel
- Customize PDF formatting
- Add database instead of Excel
- Email quote functionality
