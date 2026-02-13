// Google Form is the ONLY source of truth for Corporation/Region/Circle display values.
// Values here must match the Google Form EXACTLY (spacing, punctuation, commas).

const GOOGLE_FORM_HIERARCHY = Object.freeze({
  'MKVDC, Pune': {
    regions: {
      'CE WRD, Pune': Object.freeze([
        'SIC, Sangli',
        'PIC, Pune',
        'SIC, Satara',
        'KIC, Kolhapur',
        'PIPC,Pune'
      ]),
      'CE SP, Pune': Object.freeze([
        'CADA, Solapur',
        'KIC, Pune',
        'OIC, Osmanabad',
        'SIPC, Satara',
        'BCC, Solapur'
      ])
    }
  },

  'VIDC, Nagpur': {
    regions: {
      'CE WRD, Amaravati': Object.freeze([
        'YIC, Yavatmal',
        'YIPC, Yavatmal',
        'UWIC, Amravati',
        'JPIC, Shegaon'
      ]),
      'CE SP, WRD, Amravati': Object.freeze([
        'AIPC, Amravati',
        'AIC, Akola',
        'BIPC, Buldhana'
      ]),
      'CE WRD, Nagpur': Object.freeze([
        'CADA, Nagpur',
        'BIC, Bhandara',
        'CIPC, Chandrapur',
        'IPIC,Nagpur'
      ]),
      'CE Gosikhurd, Nagpur': Object.freeze([
        'NIC, Nagpur',
        'GLIC Ambadi',
        'GPC, Nagpur'
      ])
    }
  },

  'KIDC, Thane': {
    regions: {
      'CE WRD, Kokan Region, Mumbai': Object.freeze([
        'RIC, Kuwarbav, Ratnagiri',
        'TIC, Thane',
        'SKIPC, Oras',
        'NKIPC, Thane'
      ])
    }
  },

  'TIDC, Jalgaon': {
    regions: {
      'CE TIDC, Jalgaon': Object.freeze([
        'DIPC, Dhule',
        'CADA, Jalgaon',
        'JIPC,Jalgaon'
      ])
    }
  },

  'GMIDC, Ch. Sambhaji Nagar': {
    regions: {
      'CE CADA, Chh Sambhajinagar': Object.freeze([
        'CADA, Chh Sambhajinagar',
        'CADA, Latur',
        'CADA, Bid',
        'UPPC Nanded'
      ]),
      'CE NMR, Nashik': Object.freeze([
        'CADA, Nashik',
        'CADA, Ahilyanagar'
      ]),
      'CE WRD, Chh Sambhajinagar': Object.freeze([
        'DIC, Dharashiv',
        'NIC, Nanded',
        'CIC, Chh Sambhajinagar',
        'BIPC, Parli'
      ])
    }
  }
});

function safeStr(value) {
  return String(value ?? '').trim();
}

function getAllowedCorporationNames() {
  return Object.keys(GOOGLE_FORM_HIERARCHY);
}

function getAllowedRegionNames(corporationName) {
  const corp = GOOGLE_FORM_HIERARCHY[safeStr(corporationName)];
  if (!corp?.regions) return [];
  return Object.keys(corp.regions);
}

function getAllowedCircleNames(corporationName, regionName) {
  const corp = GOOGLE_FORM_HIERARCHY[safeStr(corporationName)];
  const circles = corp?.regions?.[safeStr(regionName)];
  return Array.isArray(circles) ? circles : [];
}

function isAllowedCorporationName(corporationName) {
  return Boolean(GOOGLE_FORM_HIERARCHY[safeStr(corporationName)]);
}

function isAllowedRegionName(corporationName, regionName) {
  return getAllowedRegionNames(corporationName).includes(safeStr(regionName));
}

function isAllowedCircleName(corporationName, regionName, circleName) {
  return getAllowedCircleNames(corporationName, regionName).includes(safeStr(circleName));
}

module.exports = {
  GOOGLE_FORM_HIERARCHY,
  getAllowedCorporationNames,
  getAllowedRegionNames,
  getAllowedCircleNames,
  isAllowedCorporationName,
  isAllowedRegionName,
  isAllowedCircleName
};
