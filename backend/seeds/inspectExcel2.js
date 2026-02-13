const XLSX = require('xlsx');
const path = require('path');

// Read the Excel file
const filePath = path.join(__dirname, '..', '..', 'KRA Monitoring Sheet.xlsx');
const workbook = XLSX.readFile(filePath);

const sheet = workbook.Sheets['Form Responses 1'];
const data = XLSX.utils.sheet_to_json(sheet);

// Show all column names/keys
console.log('=== All Column Keys ===');
if (data.length > 0) {
  const keys = Object.keys(data[0]);
  keys.forEach((key, index) => {
    console.log(`${index}: "${key}"`);
  });
}

// Show sample data with all values
console.log('\n=== Sample Row 1 ===');
if (data.length > 0) {
  for (const [key, value] of Object.entries(data[0])) {
    if (value !== undefined && value !== null && value !== '') {
      console.log(`  "${key}": ${JSON.stringify(value)}`);
    }
  }
}

console.log('\n=== Sample Row 10 ===');
if (data.length > 9) {
  for (const [key, value] of Object.entries(data[9])) {
    if (value !== undefined && value !== null && value !== '') {
      console.log(`  "${key}": ${JSON.stringify(value)}`);
    }
  }
}

console.log('\n=== Sample Row 100 ===');
if (data.length > 99) {
  for (const [key, value] of Object.entries(data[99])) {
    if (value !== undefined && value !== null && value !== '') {
      console.log(`  "${key}": ${JSON.stringify(value)}`);
    }
  }
}
