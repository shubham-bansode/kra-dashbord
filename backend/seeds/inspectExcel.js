const XLSX = require('xlsx');
const path = require('path');

// Read the Excel file
const filePath = path.join(__dirname, '..', '..', 'KRA Monitoring Sheet.xlsx');
const workbook = XLSX.readFile(filePath);

console.log('=== Excel File Structure ===\n');
console.log('Sheet Names:', workbook.SheetNames);

// Inspect each sheet
workbook.SheetNames.forEach(sheetName => {
  console.log(`\n=== Sheet: ${sheetName} ===`);
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  
  // Show first 10 rows
  console.log('Headers (Row 1):', data[0]);
  console.log('\nFirst 5 data rows:');
  for (let i = 1; i <= Math.min(5, data.length - 1); i++) {
    console.log(`Row ${i + 1}:`, data[i]);
  }
  console.log(`\nTotal rows: ${data.length}`);
});
