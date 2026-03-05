// Central KRA master data (source of truth for backend)
// Weightage is backend-controlled.

const Kra = require('../models/Kra');

const KRA_WEIGHTS = {
  1: 15,
  2: 15,
  3: 20,
  4: 15,
  5: 20,
  6: 10,
  7: 5,
};

const MASTER_KRAS = [
  {
    kraId: 1,
    name: "प्रकल्पाचे लाभक्षेत्रात प्रत्यक्ष सिंचन करणे (हेक्टर)",
    unit: "हेक्टर",
  },
  {
    kraId: 2,
    name: "सिंचन व बिगर सिंचन पाणीपट्टी वसुली करणे (रुपये लक्ष)",
    unit: "रुपये लक्ष",
  },
  {
    kraId: 3,
    // year-dependent
    nameTemplate: "सन {year} मध्ये पूर्ण करावयाचे प्रकल्प (संख्या)",
    unit: "संख्या",
  },
  {
    kraId: 4,
    name: "सिंचन निर्मिती (हेक्टर)",
    unit: "हेक्टर",
  },
  {
    kraId: 5,
    name: "पाणीसाठा निर्मिती (दलघमी)",
    unit: "दलघमी",
  },
  {
    kraId: 6,
    name: "पाणी वापर संस्थांना लाभक्षेत्र हस्तांतरण करणे (हेक्टर)",
    unit: "हेक्टर",
  },
  {
    kraId: 7,
    name: "अवशिष्ट मधील प्रकल्प पूर्ण करणे (संख्या)",
    unit: "संख्या",
  },
];

function getKraName(kraId, kraYear) {
  const master = MASTER_KRAS.find((k) => k.kraId === kraId);
  if (!master) return "";
  if (kraId === 3) {
    const year = String(kraYear || "").trim();
    return (master.nameTemplate || "").replace("{year}", year);
  }
  return master.name;
}

function getAllKras(kraYear) {
  return [1, 2, 3, 4, 5, 6, 7].map((kraId) => ({
    kraId,
    kraName: getKraName(kraId, kraYear),
    weight: KRA_WEIGHTS[kraId] || 0,
  }));
}

function applyYearTemplate(value, kraYear) {
  const str = String(value || '').trim();
  if (!str) return '';
  if (!kraYear) return str;
  if (str.includes('{year}')) return str.replaceAll('{year}', String(kraYear).trim());
  return str;
}

/**
 * Async version that prefers DB-defined KRAs (admin-editable) and falls back
 * to the static master KRAs in this file.
 *
 * Rules:
 * - Always returns an array of length 7 with kraId 1..7
 * - Uses DB KRA name if available for kraNumber (or sortOrder) 1..7
 * - Supports {year} placeholder in DB names (used for year-dependent KRA 3)
 */
async function getAllKrasAsync(kraYear) {
  try {
    const docs = await Kra.find({ isActive: true })
      .select('kraNumber sortOrder name')
      .sort({ kraNumber: 1, sortOrder: 1, name: 1 })
      .lean();

    const byNumber = new Map();
    for (const doc of docs) {
      const candidate = Number(doc?.kraNumber ?? doc?.sortOrder);
      if (!Number.isFinite(candidate)) continue;
      if (candidate < 1 || candidate > 7) continue;
      if (byNumber.has(candidate)) continue;
      if (!doc?.name) continue;
      byNumber.set(candidate, doc);
    }

    return [1, 2, 3, 4, 5, 6, 7].map((kraId) => {
      const doc = byNumber.get(kraId);
      const dbName = applyYearTemplate(doc?.name, kraYear);

      return {
        kraId,
        kraName: dbName || getKraName(kraId, kraYear),
        weight: KRA_WEIGHTS[kraId] || 0,
      };
    });
  } catch (e) {
    // If DB is unavailable or query fails, fall back to static.
    return getAllKras(kraYear);
  }
}

module.exports = {
  KRA_WEIGHTS,
  MASTER_KRAS,
  getKraName,
  getAllKras,
  getAllKrasAsync,
};
