// Central KRA master data (source of truth for backend)
// Weightage is backend-controlled.

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

module.exports = {
  KRA_WEIGHTS,
  MASTER_KRAS,
  getKraName,
  getAllKras,
};
