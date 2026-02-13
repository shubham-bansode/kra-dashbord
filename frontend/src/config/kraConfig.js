/**
 * KRA Configuration File
 * =====================
 * This file contains all the master KRA data and corporation/region-specific configurations.
 * 
 * Key Rules:
 * 1. Each corporation/region can have a different set of KRAs
 * 2. The sum of weights for any configuration must equal 100%
 * 3. KRA ID 3 is year-dependent (name changes based on selected financial year)
 * 
 * To update configurations:
 * 1. Modify MASTER_KRAS to add/remove base KRA types
 * 2. Modify CORPORATION_CONFIG to change corporation-level KRA assignments
 * 3. Modify REGION_CONFIG to override corporation settings for specific regions
 */

// ============================================================================
// MASTER KRA DEFINITIONS
// These are the 7 base KRAs used across the system
// ============================================================================
export const MASTER_KRAS = [
  {
    id: 1,
    name: "प्रकल्पाचे लाभक्षेत्रात प्रत्यक्ष सिंचन करणे (लक्ष हेक्टर)",
    shortName: "प्रत्यक्ष सिंचन",
    unit: "लक्ष हेक्टर",
    description: "Actual irrigation in project benefit area",
  },
  {
    id: 2,
    name: "सिंचन व बिगर सिंचन पाणीपट्टी वसुली करणे (रुपये लक्ष)",
    shortName: "पाणीपट्टी वसुली",
    unit: "रुपये लक्ष",
    description: "Collection of irrigation and non-irrigation water cess",
  },
  {
    id: 3,
    // This KRA's name is dynamic based on the selected year
    // The actual name will be: "सन {year} मध्ये पूर्ण करावयाचे प्रकल्प (संख्या)"
    name: "सन {year} मध्ये पूर्ण करावयाचे प्रकल्प (संख्या)",
    baseName: "मध्ये पूर्ण करावयाचे प्रकल्प (संख्या)",
    shortName: "प्रकल्प पूर्ण",
    unit: "संख्या",
    isYearDependent: true,
    description: "Projects to be completed in the selected financial year",
  },
  {
    id: 4,
    name: "सिंचन निर्मिती (हेक्टर)",
    shortName: "सिंचन निर्मिती",
    unit: "हेक्टर",
    description: "Irrigation creation capacity",
  },
  {
    id: 5,
    name: "पाणीसाठा निर्मिती (दलघमी)",
    shortName: "पाणीसाठा निर्मिती",
    unit: "दलघमी",
    description: "Water storage creation capacity",
  },
  {
    id: 6,
    name: "पाणी वापर संस्थांना लाभक्षेत्र हस्तांतरण करणे (हेक्टर)",
    shortName: "लाभक्षेत्र हस्तांतरण",
    unit: "हेक्टर",
    description: "Transfer of benefit area to Water User Organizations",
  },
  {
    id: 7,
    name: "अवशिष्ट मधील प्रकल्प पूर्ण करणे (संख्या)",
    shortName: "अवशिष्ट प्रकल्प",
    unit: "संख्या",
    description: "Completion of residual projects",
  },
];

// ============================================================================
// DEFAULT WEIGHTS (as per KRA Monitoring Sheet)
// These are the standard weights when a corporation uses all 7 KRAs
// ============================================================================
export const DEFAULT_WEIGHTS = {
  1: 15, // प्रत्यक्ष सिंचन
  2: 15, // पाणीपट्टी वसुली
  3: 20, // प्रकल्प पूर्ण (Year-dependent)
  4: 15, // सिंचन निर्मिती
  5: 20, // पाणीसाठा निर्मिती
  6: 10, // लाभक्षेत्र हस्तांतरण
  7: 5,  // अवशिष्ट प्रकल्प
  // Total: 100%
};

// ============================================================================
// CORPORATION CONFIGURATIONS
// Key: Corporation name as stored in database
// Value: Object with displayName and kras array
// ============================================================================
export const CORPORATION_CONFIG = {
  // GMIDC - Godavari Marathwada Irrigation Development Corporation
  "GMIDC, Ch. Sambhaji Nagar": {
    displayName: "GMIDC",
    fullName: "Godavari Marathwada Irrigation Development Corporation",
    location: "Ch. Sambhaji Nagar",
    kras: [
      { kraId: 1, weight: 15 },
      { kraId: 2, weight: 15 },
      { kraId: 3, weight: 20 },
      { kraId: 4, weight: 15 },
      { kraId: 5, weight: 20 },
      { kraId: 6, weight: 10 },
      { kraId: 7, weight: 5 },
    ],
  },

  // TIDC - Tapi Irrigation Development Corporation
  "TIDC, Jalgaon": {
    displayName: "TIDC",
    fullName: "Tapi Irrigation Development Corporation",
    location: "Jalgaon",
    kras: [
      { kraId: 1, weight: 15 },
      { kraId: 2, weight: 15 },
      { kraId: 3, weight: 20 },
      { kraId: 4, weight: 15 },
      { kraId: 5, weight: 20 },
      { kraId: 6, weight: 10 },
      { kraId: 7, weight: 5 },
    ],
  },

  // VIDC - Vidarbha Irrigation Development Corporation
  "VIDC, Nagpur": {
    displayName: "VIDC",
    fullName: "Vidarbha Irrigation Development Corporation",
    location: "Nagpur",
    kras: [
      { kraId: 1, weight: 15 },
      { kraId: 2, weight: 15 },
      { kraId: 3, weight: 20 },
      { kraId: 4, weight: 15 },
      { kraId: 5, weight: 20 },
      { kraId: 6, weight: 10 },
      { kraId: 7, weight: 5 },
    ],
  },

  // MKVDC - Maharashtra Krishna Valley Development Corporation
  "MKVDC, Pune": {
    displayName: "MKVDC",
    fullName: "Maharashtra Krishna Valley Development Corporation",
    location: "Pune",
    hasRegions: true, // This corporation has regions with different KRA configs
    kras: [
      { kraId: 1, weight: 15 },
      { kraId: 2, weight: 15 },
      { kraId: 3, weight: 20 },
      { kraId: 4, weight: 15 },
      { kraId: 5, weight: 20 },
      { kraId: 6, weight: 10 },
      { kraId: 7, weight: 5 },
    ],
  },

  // KIDC - Konkan Irrigation Development Corporation
  "KIDC, Thane": {
    displayName: "KIDC",
    fullName: "Konkan Irrigation Development Corporation",
    location: "Thane",
    kras: [
      { kraId: 1, weight: 15 },
      { kraId: 2, weight: 15 },
      { kraId: 3, weight: 20 },
      { kraId: 4, weight: 15 },
      { kraId: 5, weight: 20 },
      { kraId: 6, weight: 10 },
      { kraId: 7, weight: 5 },
    ],
  },
};

// ============================================================================
// REGION-SPECIFIC CONFIGURATIONS
// These override the corporation-level config for specific regions
// Used when a region within a corporation has different KRA requirements
// ============================================================================
export const REGION_CONFIG = {
  // Region-level overrides are disabled.
  // All organizations use the standard 7 KRAs with DEFAULT_WEIGHTS.
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get KRA name with year substitution for year-dependent KRAs
 * @param {Object} kra - KRA object from MASTER_KRAS
 * @param {string} selectedYear - Financial year string (e.g., "2024-25")
 * @returns {string} - KRA name with year substituted if applicable
 */
export const getKraNameForYear = (kra, selectedYear) => {
  if (kra.isYearDependent && selectedYear) {
    return `सन ${selectedYear} ${kra.baseName}`;
  }
  return kra.name;
};

/**
 * Get the active KRA configuration based on selected corporation and region
 * Region config overrides corporation config if it exists
 * @param {string} corporationName - Corporation name
 * @param {string} regionName - Region name (optional)
 * @returns {Object} - Configuration object with kras array
 */
export const getActiveKraConfig = (corporationName, regionName = null) => {
  // First check if region has specific config
  if (regionName && REGION_CONFIG[regionName]) {
    return REGION_CONFIG[regionName];
  }

  // Fall back to corporation config
  if (corporationName && CORPORATION_CONFIG[corporationName]) {
    return CORPORATION_CONFIG[corporationName];
  }

  // Default: return all KRAs with default weights
  return {
    displayName: "Default",
    kras: MASTER_KRAS.map((kra) => ({
      kraId: kra.id,
      weight: DEFAULT_WEIGHTS[kra.id] || Math.floor(100 / MASTER_KRAS.length),
    })),
  };
};

/**
 * Get KRAs for a specific configuration with full details
 * @param {Object} config - Configuration object from getActiveKraConfig
 * @param {string} selectedYear - Selected financial year
 * @returns {Array} - Array of KRA objects with full details and weights
 */
export const getKrasForConfig = (config, selectedYear) => {
  return config.kras.map((configKra) => {
    const masterKra = MASTER_KRAS.find((k) => k.id === configKra.kraId);
    return {
      ...masterKra,
      weight: configKra.weight,
      displayName: getKraNameForYear(masterKra, selectedYear),
    };
  });
};

/**
 * Validate that a configuration's weights sum to 100
 * @param {Object} config - Configuration object
 * @returns {boolean} - True if weights sum to 100
 */
export const validateConfigWeights = (config) => {
  const totalWeight = config.kras.reduce((sum, kra) => sum + kra.weight, 0);
  return totalWeight === 100;
};

/**
 * Get all corporations as an array for dropdowns
 * @returns {Array} - Array of corporation objects
 */
export const getCorporationsList = () => {
  return Object.entries(CORPORATION_CONFIG).map(([name, config]) => ({
    name,
    ...config,
  }));
};

/**
 * Get all regions for a specific corporation
 * @param {string} corporationName - Corporation name
 * @returns {Array} - Array of region objects
 */
export const getRegionsForCorporation = (corporationName) => {
  return Object.entries(REGION_CONFIG)
    .filter(([_, config]) => config.parentCorporation === corporationName)
    .map(([name, config]) => ({
      name,
      ...config,
    }));
};

// ============================================================================
// EXPORTS FOR CHART DATA
// ============================================================================

/**
 * Prepare data for Pie Chart (weight distribution)
 * @param {Array} kras - Array of KRA objects from getKrasForConfig
 * @returns {Array} - Recharts compatible pie chart data
 */
export const preparePieChartData = (kras) => {
  return kras.map((kra) => ({
    name: kra.shortName || kra.displayName,
    value: kra.weight,
    fullName: kra.displayName,
  }));
};

/**
 * Prepare data for Bar Chart (target vs achievement)
 * @param {Array} kras - Array of KRA objects
 * @param {Object} tableData - Table data with target and achievement values
 * @returns {Array} - Recharts compatible bar chart data
 */
export const prepareBarChartData = (kras, tableData) => {
  return kras.map((kra) => ({
    name: kra.shortName || kra.displayName,
    target: parseFloat(tableData[kra.id]?.target) || 0,
    achieved: parseFloat(tableData[kra.id]?.achievement) || 0,
    unit: kra.unit,
    weight: kra.weight,
    percentage: tableData[kra.id]?.target
      ? ((parseFloat(tableData[kra.id]?.achievement) || 0) /
          parseFloat(tableData[kra.id]?.target)) *
        100
      : 0,
  }));
};

export default {
  MASTER_KRAS,
  DEFAULT_WEIGHTS,
  CORPORATION_CONFIG,
  REGION_CONFIG,
  getKraNameForYear,
  getActiveKraConfig,
  getKrasForConfig,
  validateConfigWeights,
  getCorporationsList,
  getRegionsForCorporation,
  preparePieChartData,
  prepareBarChartData,
};
