const mongoose = require('mongoose');
const path = require('path');
const XLSX = require('xlsx');
require('dotenv').config();

const KraMonthlyEntry = require('../models/KraMonthlyEntry');
const Corporation = require('../models/Corporation');
const Region = require('../models/Region');
const Circle = require('../models/Circle');
const Division = require('../models/Division');
const { getAllKrasAsync } = require('../config/kraMaster');

const EXCEL_PATH = path.join(__dirname, '..', '..', 'KRA Monitoring Sheet.xlsx');
const SHEET_NAME = 'Form Responses 1';

const DEVANAGARI_DIGITS = {
  '\u0966': '0',
  '\u0967': '1',
  '\u0968': '2',
  '\u0969': '3',
  '\u096A': '4',
  '\u096B': '5',
  '\u096C': '6',
  '\u096D': '7',
  '\u096E': '8',
  '\u096F': '9'
};

const MONTH_MAP = {
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
  'डिसेंबर': 12
};

const DIVISION_COLUMNS = [
  'विभाग (Division Name)',
  'विभाग (Division Name) ',
  'विभाग (Division Name) _1',
  'विभाग (Division Name) _2',
  'विभाग (Division Name) _3'
];

const REGION_FALLBACK_COLUMNS = [
  'Region_1',
  'Region',
  'MKVDC विभाग (Region Name) ',
  'VIDC विभाग (Region Name)',
  'KIDC मंडळाचे नाव (Region_Name) ',
  'TIDC मंडळाचे नाव (Region_Name)',
  'GMIDC मंडळाचे नाव (Region_Name)'
];

const CIRCLE_FALLBACK_COLUMNS = [
  'Circle',
  'मंडळाचे नाव (Circle_Name)',
  'मंडळाचे नाव (Circle_Name)_1',
  'मंडळाचे नाव (Circle_Name)_2',
  'मंडळाचे नाव (Circle_Name)_3',
  'TIDC विभाग (Circle_Name) CE TIDC, Jalgaon',
  'KIDC मंडळाचे नाव (Circle_Name) CE WRD, Kokan Region, Mumbai',
  'GMIDC मंडळाचे नाव (Circle Name) CE CADA, Chh Sambhajinagar',
  'GMIDC मंडळाचे नाव (Circle Name) CE NMR, Nashik',
  'GMIDC मंडळाचे नाव (Circle Name)  CE WRD, Chh Sambhajinagar'
];

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeKey(value) {
  return normalizeText(value)
    .replace(/\s*,\s*/g, ', ')
    .replace(/\./g, '')
    .toUpperCase();
}

function devanagariToAscii(input) {
  return String(input || '').replace(/[\u0966-\u096F]/g, (d) => DEVANAGARI_DIGITS[d] || d);
}

function parseMonthYear(raw) {
  const src = devanagariToAscii(raw);
  const text = normalizeText(src);

  let month = null;
  for (const [name, num] of Object.entries(MONTH_MAP)) {
    if (text.includes(name)) {
      month = num;
      break;
    }
  }

  const yearMatch = text.match(/(19|20)\d{2}/);
  const year = yearMatch ? Number(yearMatch[0]) : null;

  return { month, year };
}

function parseExcelDate(value) {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'number') {
    const utcDays = Math.floor(value - 25569);
    const utcValue = utcDays * 86400;
    return new Date(utcValue * 1000);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function getFirstNonEmpty(row, columns) {
  for (const col of columns) {
    const v = normalizeText(row[col]);
    if (v) return v;
  }
  return '';
}

function parseContactNumber(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (/^[6-9]\d{9}$/.test(digits)) return digits;
  return '9999999999';
}

function parseNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n;
}

function kraIdFromName(name) {
  const s = normalizeText(name);
  if (!s) return null;

  if (s.includes('प्रकल्पाचे लाभक्षेत्रात') || s.includes('प्रत्यक्ष सिंचन')) return 1;
  if (s.includes('पाणीपट्टी वसुली') || s.includes('बिगर सिंचन')) return 2;
  if (s.includes('पूर्ण करावयाचे प्रकल्प') && s.includes('सन')) return 3;
  if (s.includes('सिंचन निर्मिती')) return 4;
  if (s.includes('पाणीसाठा निर्मिती')) return 5;
  if (s.includes('लाभक्षेत्र हस्तांतरण') || s.includes('पाणी वापर संस्थांना')) return 6;
  if (s.includes('अवशिष्ट मधील') || s.includes('अवशिष्ट')) return 7;

  return null;
}

function financialYearFromDate(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const start = m >= 4 ? y : y - 1;
  const end = start + 1;
  return `${start}-${end}`;
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required in backend/.env');
  }

  if (!require('fs').existsSync(EXCEL_PATH)) {
    throw new Error(`Excel file not found at: ${EXCEL_PATH}`);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const [corporations, regions, circles, divisions] = await Promise.all([
    Corporation.find({ isActive: true }).select('_id name').lean(),
    Region.find({ isActive: true }).select('_id name corporation').lean(),
    Circle.find({ isActive: true }).select('_id name corporation region').lean(),
    Division.find({ isActive: true }).select('_id name corporation region circle').lean()
  ]);

  const corpByKey = new Map();
  corporations.forEach((c) => corpByKey.set(normalizeKey(c.name), c));

  const regionsByCorpAndName = new Map();
  for (const r of regions) {
    const k = `${String(r.corporation)}|${normalizeKey(r.name)}`;
    regionsByCorpAndName.set(k, r);
  }

  const circlesByCorpRegionName = new Map();
  for (const c of circles) {
    const k = `${String(c.corporation)}|${String(c.region)}|${normalizeKey(c.name)}`;
    circlesByCorpRegionName.set(k, c);
  }

  const divisionsByCorpRegionCircleName = new Map();
  for (const d of divisions) {
    const k = `${String(d.corporation)}|${String(d.region)}|${String(d.circle)}|${normalizeKey(d.name)}`;
    divisionsByCorpRegionCircleName.set(k, d);
  }

  const workbook = XLSX.readFile(EXCEL_PATH);
  const sheet = workbook.Sheets[SHEET_NAME];
  if (!sheet) {
    throw new Error(`Sheet '${SHEET_NAME}' not found in Excel file`);
  }

  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  console.log(`Excel rows found: ${rows.length}`);

  const grouped = new Map();
  const skipped = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 2;

    const corporationName = normalizeText(row['महामंडळ (Corporation)']);
    const regionName = getFirstNonEmpty(row, REGION_FALLBACK_COLUMNS);
    const circleName = getFirstNonEmpty(row, CIRCLE_FALLBACK_COLUMNS);
    const divisionName = getFirstNonEmpty(row, DIVISION_COLUMNS);

    const corp = corpByKey.get(normalizeKey(corporationName));
    if (!corp) {
      skipped.push({ row: rowNumber, reason: `Corporation not found: ${corporationName}` });
      continue;
    }

    let region = null;
    if (regionName) {
      region = regionsByCorpAndName.get(`${String(corp._id)}|${normalizeKey(regionName)}`) || null;
      if (!region) {
        skipped.push({ row: rowNumber, reason: `Region not found for corporation: ${regionName}` });
        continue;
      }
    }

    let circle = null;
    if (circleName) {
      if (!region) {
        skipped.push({ row: rowNumber, reason: `Circle present but region missing: ${circleName}` });
        continue;
      }
      circle = circlesByCorpRegionName.get(`${String(corp._id)}|${String(region._id)}|${normalizeKey(circleName)}`) || null;
      if (!circle) {
        skipped.push({ row: rowNumber, reason: `Circle not found for region: ${circleName}` });
        continue;
      }
    }

    let division = null;
    if (divisionName) {
      if (!region || !circle) {
        skipped.push({ row: rowNumber, reason: `Division present but region/circle missing: ${divisionName}` });
        continue;
      }
      division =
        divisionsByCorpRegionCircleName.get(
          `${String(corp._id)}|${String(region._id)}|${String(circle._id)}|${normalizeKey(divisionName)}`
        ) || null;
      if (!division) {
        skipped.push({ row: rowNumber, reason: `Division not found under selected hierarchy: ${divisionName}` });
        continue;
      }
    }

    const kraId = kraIdFromName(row['फलनिष्पत्तीची  क्षेत्रे KRA']);
    if (!kraId) {
      skipped.push({ row: rowNumber, reason: 'Unable to map KRA name to kraId' });
      continue;
    }

    const monthYear = parseMonthYear(row['KRA महिना']);
    let achievementMonth = monthYear.month;
    let achievementYear = monthYear.year;

    let achievementDate = parseExcelDate(row['महिन्याचे साध्य KRA ( तारीख)']);
    if (!achievementDate && achievementMonth && achievementYear) {
      achievementDate = new Date(Date.UTC(achievementYear, achievementMonth - 1, 1));
    }
    if (!achievementDate) {
      skipped.push({ row: rowNumber, reason: 'Missing/invalid achievement date and month-year' });
      continue;
    }

    if (!achievementMonth || !achievementYear) {
      achievementMonth = achievementDate.getMonth() + 1;
      achievementYear = achievementDate.getFullYear();
    }

    const rawKraYear = normalizeText(row['फलनिष्पत्तीची  क्षेत्रे (KRA) वर्ष']);
    const kraYear = rawKraYear || financialYearFromDate(achievementDate);

    const groupKey = [
      String(corp._id),
      region ? String(region._id) : 'null',
      circle ? String(circle._id) : 'null',
      division ? String(division._id) : 'null',
      achievementMonth,
      achievementYear
    ].join('|');

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        corporation: corp._id,
        corporationName: corp.name,
        region: region ? region._id : null,
        regionName: region ? region.name : '',
        circle: circle ? circle._id : null,
        circleName: circle ? circle.name : '',
        division: division ? division._id : null,
        divisionName: division ? division.name : '',
        kraYear,
        achievementDate,
        achievementMonth,
        achievementYear,
        remarks: normalizeText(row['शेरा / अडचणी'] || row['शेरा / अडचणी ']),
        contactNumber: parseContactNumber(row['Contact Number ( Assistant SE )']),
        kraValues: new Map()
      });
    }

    const g = grouped.get(groupKey);
    g.kraValues.set(kraId, {
      annualTarget: parseNumber(row['KRA वार्षिक उद्दिष्ट']),
      kraAchievement: parseNumber(row['KRA साध्य'])
    });

    const remarks = normalizeText(row['शेरा / अडचणी'] || row['शेरा / अडचणी ']);
    if (remarks) g.remarks = remarks;

    const contact = parseContactNumber(row['Contact Number ( Assistant SE )']);
    if (contact !== '9999999999') g.contactNumber = contact;
  }

  console.log(`Prepared groups: ${grouped.size}`);
  console.log(`Skipped rows: ${skipped.length}`);

  const docsToInsert = [];
  for (const group of grouped.values()) {
    const baseKras = await getAllKrasAsync(group.kraYear);

    const kras = baseKras.map((k) => {
      const provided = group.kraValues.get(k.kraId);
      return {
        kraId: k.kraId,
        kraName: k.kraName,
        weight: k.weight,
        annualTarget: provided ? provided.annualTarget : 0,
        kraAchievement: provided ? provided.kraAchievement : 0
      };
    });

    const selectedKraIds = kras
      .filter((k) => (k.annualTarget || 0) > 0 || (k.kraAchievement || 0) > 0)
      .map((k) => k.kraId);

    docsToInsert.push({
      corporation: group.corporation,
      region: group.region,
      circle: group.circle,
      division: group.division,
      corporationName: group.corporationName,
      regionName: group.regionName,
      circleName: group.circleName,
      divisionName: group.divisionName,
      kraYear: group.kraYear,
      achievementDate: group.achievementDate,
      achievementMonth: group.achievementMonth,
      achievementYear: group.achievementYear,
      kras,
      selectedKraIds,
      remarks: group.remarks || '',
      contactNumber: group.contactNumber,
      submittedBy: 'Excel Import',
      submittedAt: new Date()
    });
  }

  // User requested deleting only monthly entries, then importing fresh data.
  const deleteResult = await KraMonthlyEntry.deleteMany({});
  console.log(`Deleted existing monthly entries: ${deleteResult.deletedCount}`);

  if (docsToInsert.length > 0) {
    await KraMonthlyEntry.insertMany(docsToInsert, { ordered: false });
  }

  console.log(`Inserted monthly entries: ${docsToInsert.length}`);
  const finalCount = await KraMonthlyEntry.countDocuments();
  console.log(`Final kramonthlyentries count: ${finalCount}`);

  if (skipped.length > 0) {
    console.log('First skipped rows (up to 20):');
    skipped.slice(0, 20).forEach((s) => {
      console.log(`- Row ${s.row}: ${s.reason}`);
    });
  }

  await mongoose.disconnect();
  console.log('Import completed successfully.');
}

main().catch(async (err) => {
  console.error('Import failed:', err.message);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
