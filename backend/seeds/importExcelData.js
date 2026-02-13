/**
 * Excel Data Import Script - Fixed Version
 * =========================================
 * This script:
 * 1. Deletes all existing data from the database
 * 2. Drops problematic indexes
 * 3. Imports data from the KRA Monitoring Sheet.xlsx
 */

const mongoose = require('mongoose');
const XLSX = require('xlsx');
const path = require('path');
require('dotenv').config();

// Import models
const Corporation = require('../models/Corporation');
const Region = require('../models/Region');
const Circle = require('../models/Circle');
const KraMonthlyEntry = require('../models/KraMonthlyEntry');

// KRA Name to ID mapping
const KRA_NAME_TO_ID = {
  'प्रकल्पाचे लाभक्षेत्रात प्रत्यक्ष सिंचन करणे (लक्ष हेक्टर)': 1,
  'सिंचन व बिगर सिंचन पाणीपट्टी वसुली करणे (रुपये लक्ष)': 2,
  'सन २०२४-२५ मध्ये पूर्ण करावयाचे प्रकल्प (संख्या)': 3,
  'सन २०२५-२६ मध्ये पूर्ण करावयाचे प्रकल्प (संख्या)': 3,
  'सिंचन निर्मिती (हेक्टर)': 4,
  'पाणीसाठा निर्मिती (दलघमी)': 5,
  'पाणी वापर संस्थांना लाभक्षेत्र हस्तांतरण करणे (हेक्टर)': 6,
  'अवशिष्ट मधील प्रकल्प पूर्ण करणे (संख्या)': 7,
};

// Month name mapping (Marathi to number)
const MONTH_NAME_TO_NUMBER = {
  'जानेवारी': 1,
  'फेब्रुवारी': 2,
  'मार्च': 3,
  'एप्रिल': 4,
  'मे': 5,
  'जून': 6,
  'जुलै': 7,
  'ऑगस्ट': 8,
  'सप्टेंबर': 9,
  'ऑक्टोबर': 10,
  'नोव्हेंबर': 11,
  'डिसेंबर': 12,
};

// Helper function to generate code from name
function generateCode(name) {
  if (!name) return 'UNK';
  const words = name.replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 0);
  if (words.length === 1) {
    return words[0].substring(0, 5).toUpperCase();
  }
  return words.map(w => w[0]).join('').toUpperCase().substring(0, 10);
}

// Helper to convert Excel date serial to JS Date
function excelDateToJSDate(excelDate) {
  if (!excelDate) return new Date();
  if (typeof excelDate === 'number') {
    const date = new Date((excelDate - 25569) * 86400 * 1000);
    return date;
  }
  return new Date(excelDate);
}

// Parse month from various formats
function parseMonth(monthStr) {
  if (!monthStr) return { month: 1, year: 2025 };
  
  const str = String(monthStr).trim();
  
  for (const [marathiMonth, monthNum] of Object.entries(MONTH_NAME_TO_NUMBER)) {
    if (str.includes(marathiMonth)) {
      const yearMatch = str.match(/\d{4}/);
      const year = yearMatch ? parseInt(yearMatch[0]) : 2025;
      return { month: monthNum, year };
    }
  }
  
  return { month: 1, year: 2025 };
}

// Normalize KRA name for matching
function normalizeKraName(name) {
  if (!name) return '';
  return name.replace(/\s+/g, ' ').trim();
}

// Find KRA ID from name
function getKraId(kraName) {
  if (!kraName) return 1;
  const normalized = normalizeKraName(kraName);
  
  for (const [name, id] of Object.entries(KRA_NAME_TO_ID)) {
    if (normalized.includes(name.substring(0, 20)) || name.includes(normalized.substring(0, 20))) {
      return id;
    }
  }
  
  // Try partial matching
  if (normalized.includes('प्रकल्पाचे लाभक्षेत्रात') || normalized.includes('प्रत्यक्ष सिंचन')) return 1;
  if (normalized.includes('पाणीपट्टी वसुली')) return 2;
  if (normalized.includes('पूर्ण करावयाचे प्रकल्प')) return 3;
  if (normalized.includes('सिंचन निर्मिती')) return 4;
  if (normalized.includes('पाणीसाठा निर्मिती')) return 5;
  if (normalized.includes('लाभक्षेत्र हस्तांतरण')) return 6;
  if (normalized.includes('अवशिष्ट')) return 7;
  
  return 1;
}

async function importData() {
  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Step 1: Delete all existing data
    console.log('\n🗑️  Deleting all existing data...');
    
    // Drop the problematic index first
    try {
      await mongoose.connection.collection('kramonthlyentries').dropIndexes();
      console.log('   ✓ Dropped all indexes from KraMonthlyEntry');
    } catch (err) {
      console.log('   ⚠️ Could not drop indexes (may not exist)');
    }
    
    await KraMonthlyEntry.deleteMany({});
    console.log('   ✓ Deleted all KRA Monthly Entries');
    await Circle.deleteMany({});
    console.log('   ✓ Deleted all Circles');
    await Region.deleteMany({});
    console.log('   ✓ Deleted all Regions');
    await Corporation.deleteMany({});
    console.log('   ✓ Deleted all Corporations');
    
    // Step 2: Read Excel file
    console.log('\n📖 Reading Excel file...');
    const filePath = path.join(__dirname, '..', '..', 'KRA Monitoring Sheet.xlsx');
    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets['Form Responses 1'];
    const rawData = XLSX.utils.sheet_to_json(sheet);
    console.log(`   Found ${rawData.length} rows in Excel`);

    // Step 3: Extract unique corporations, regions, and circles
    console.log('\n📊 Processing organizational hierarchy...');
    
    const corporationsMap = new Map();
    const regionsMap = new Map();
    const circlesMap = new Map();

    // Column mappings based on inspection:
    // Corporation: 'महामंडळ (Corporation)'
    // Region: 'Region_1'
    // Circle: 'Circle'
    // KRA Name: 'फलनिष्पत्तीची  क्षेत्रे KRA'
    // KRA Date: 'महिन्याचे साध्य KRA ( तारीख)'
    // Annual Target: 'KRA वार्षिक उद्दिष्ट'
    // Achievement: 'KRA साध्य'
    // KRA Year: 'फलनिष्पत्तीची  क्षेत्रे (KRA) वर्ष'
    // Weightage: 'Weightage'
    // Contact: 'Contact Number ( Assistant SE )'
    // Month: 'KRA महिना'

    for (const row of rawData) {
      const corpName = row['महामंडळ (Corporation)'];
      const regionName = row['Region_1'];
      const circleName = row['Circle'];

      if (corpName && !corporationsMap.has(corpName)) {
        corporationsMap.set(corpName, {
          name: corpName,
          code: generateCode(corpName),
          hasRegions: true,
          isActive: true
        });
      }

      if (regionName && corpName) {
        const regionKey = `${corpName}||${regionName}`;
        if (!regionsMap.has(regionKey)) {
          regionsMap.set(regionKey, {
            name: regionName,
            code: generateCode(regionName),
            corporationName: corpName,
            isActive: true
          });
        }
      }

      if (circleName && regionName && corpName) {
        const circleKey = `${corpName}||${regionName}||${circleName}`;
        if (!circlesMap.has(circleKey)) {
          circlesMap.set(circleKey, {
            name: circleName,
            code: generateCode(circleName),
            regionName: regionName,
            corporationName: corpName,
            isActive: true
          });
        }
      }
    }

    // Step 4: Insert Corporations
    console.log(`\n🏢 Creating ${corporationsMap.size} Corporations...`);
    const corporationDocs = {};
    for (const [name, data] of corporationsMap) {
      try {
        const corp = await Corporation.create(data);
        corporationDocs[name] = corp;
        console.log(`   ✓ Created Corporation: ${name}`);
      } catch (err) {
        console.log(`   ⚠️ Error creating corporation ${name}: ${err.message}`);
      }
    }

    // Step 5: Insert Regions
    console.log(`\n🗺️  Creating ${regionsMap.size} Regions...`);
    const regionDocs = {};
    for (const [key, data] of regionsMap) {
      const corp = corporationDocs[data.corporationName];
      if (corp) {
        try {
          const region = await Region.create({
            name: data.name,
            code: data.code,
            corporation: corp._id,
            isActive: true
          });
          regionDocs[key] = region;
          console.log(`   ✓ Created Region: ${data.name}`);
        } catch (err) {
          console.log(`   ⚠️ Error creating region ${data.name}: ${err.message}`);
        }
      }
    }

    // Step 6: Insert Circles
    console.log(`\n⭕ Creating ${circlesMap.size} Circles...`);
    const circleDocs = {};
    for (const [key, data] of circlesMap) {
      const corp = corporationDocs[data.corporationName];
      const regionKey = `${data.corporationName}||${data.regionName}`;
      const region = regionDocs[regionKey];
      
      if (corp && region) {
        try {
          const circle = await Circle.create({
            name: data.name,
            code: data.code,
            region: region._id,
            corporation: corp._id,
            isActive: true
          });
          circleDocs[key] = circle;
          console.log(`   ✓ Created Circle: ${data.name}`);
        } catch (err) {
          console.log(`   ⚠️ Error creating circle ${data.name}: ${err.message}`);
        }
      }
    }

    // Step 7: Insert KRA Monthly Entries (using bulk insert for efficiency)
    console.log('\n📝 Creating KRA Monthly Entries...');
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    const errors = [];
    
    // Track unique entries to avoid duplicates within the same import
    const processedEntries = new Set();

    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      
      try {
        const corpName = row['महामंडळ (Corporation)'];
        const regionName = row['Region_1'];
        const circleName = row['Circle'];
        const kraName = row['फलनिष्पत्तीची  क्षेत्रे KRA'];
        const kraYear = row['फलनिष्पत्तीची  क्षेत्रे (KRA) वर्ष'] || '2024-2025';
        const annualTarget = parseFloat(row['KRA वार्षिक उद्दिष्ट']) || 0;
        const achievement = parseFloat(row['KRA साध्य']) || 0;
        const weight = parseFloat(row['Weightage']) || 0;
        const remarks = row['शेरा / अडचणी'] || row['शेरा / अडचणी '] || '';
        const contactNumber = row['Contact Number ( Assistant SE )'] || '9999999999';
        const kraMonthStr = row['KRA महिना'];
        const achievementDateRaw = row['महिन्याचे साध्य KRA ( तारीख)'];

        // Skip rows without essential data
        if (!corpName || !kraName) {
          skippedCount++;
          continue;
        }

        const corp = corporationDocs[corpName];
        const regionKey = `${corpName}||${regionName}`;
        const circleKey = `${corpName}||${regionName}||${circleName}`;
        const region = regionDocs[regionKey];
        const circle = circleDocs[circleKey];

        if (!corp) {
          skippedCount++;
          continue;
        }

        // Get KRA ID
        const kraId = getKraId(kraName);

        // Parse date and month
        const achievementDate = excelDateToJSDate(achievementDateRaw);
        const { month, year } = parseMonth(kraMonthStr);

        // Clean contact number
        let cleanContact = String(contactNumber).replace(/\D/g, '');
        if (cleanContact.length !== 10 || !cleanContact.match(/^[6-9]/)) {
          cleanContact = '9999999999';
        }

        // Create unique key to check for duplicates within this import
        const uniqueKey = `${corp._id}|${region ? region._id : 'null'}|${circle ? circle._id : 'null'}|${kraId}|${month}|${year}`;
        
        if (processedEntries.has(uniqueKey)) {
          skippedCount++;
          continue;
        }
        processedEntries.add(uniqueKey);

        const entry = {
          corporation: corp._id,
          region: region ? region._id : null,
          circle: circle ? circle._id : null,
          kraYear: kraYear,
          kraId: kraId,
          kraName: normalizeKraName(kraName),
          weight: weight,
          annualTarget: annualTarget,
          achievementDate: achievementDate,
          achievementMonth: month,
          achievementYear: year,
          kraAchievement: achievement,
          remarks: String(remarks || ''),
          contactNumber: cleanContact,
          submittedBy: 'Excel Import',
          submittedAt: new Date()
        };

        await KraMonthlyEntry.create(entry);
        successCount++;

        if (successCount % 100 === 0) {
          console.log(`   Processed ${successCount} entries...`);
        }
      } catch (err) {
        errorCount++;
        if (errors.length < 5) {
          errors.push({ row: i + 2, error: err.message });
        }
      }
    }

    console.log(`\n✅ Import Complete!`);
    console.log(`   Successful entries: ${successCount}`);
    console.log(`   Skipped (duplicates/missing data): ${skippedCount}`);
    console.log(`   Failed entries: ${errorCount}`);
    
    if (errors.length > 0) {
      console.log('\n⚠️ First few errors:');
      errors.forEach(e => console.log(`   Row ${e.row}: ${e.error}`));
    }

    // Summary
    console.log('\n📊 Database Summary:');
    const corpCount = await Corporation.countDocuments();
    const regionCount = await Region.countDocuments();
    const circleCount = await Circle.countDocuments();
    const entryCount = await KraMonthlyEntry.countDocuments();
    
    console.log(`   Corporations: ${corpCount}`);
    console.log(`   Regions: ${regionCount}`);
    console.log(`   Circles: ${circleCount}`);
    console.log(`   KRA Monthly Entries: ${entryCount}`);

  } catch (error) {
    console.error('❌ Import failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the import
importData();
