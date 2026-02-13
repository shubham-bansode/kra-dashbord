// Generate KRA Years (Financial Year format)
export const generateKraYears = () => {
  const currentYear = new Date().getFullYear();
  const years = [];
  
  // Generate years from 2024-25 to current year + 2
  for (let year = 2024; year <= currentYear + 2; year++) {
    // Use 2-digit format for end year (e.g., 2024-25)
    const endYearShort = String(year + 1).slice(-2);
    years.push(`${year}-${endYearShort}`);
  }
  
  return years; // Chronological order
};

// Get Marathi month names
export const getMarathiMonths = () => {
  return [
    { value: 1, label: 'जानेवारी', labelEn: 'January' },
    { value: 2, label: 'फेब्रुवारी', labelEn: 'February' },
    { value: 3, label: 'मार्च', labelEn: 'March' },
    { value: 4, label: 'एप्रिल', labelEn: 'April' },
    { value: 5, label: 'मे', labelEn: 'May' },
    { value: 6, label: 'जून', labelEn: 'June' },
    { value: 7, label: 'जुलै', labelEn: 'July' },
    { value: 8, label: 'ऑगस्ट', labelEn: 'August' },
    { value: 9, label: 'सप्टेंबर', labelEn: 'September' },
    { value: 10, label: 'ऑक्टोबर', labelEn: 'October' },
    { value: 11, label: 'नोव्हेंबर', labelEn: 'November' },
    { value: 12, label: 'डिसेंबर', labelEn: 'December' }
  ];
};

// Parse education year to get start and end dates (June to May)
export const parseFinancialYear = (kraYear) => {
  if (!kraYear) return null;
  
  const yearParts = kraYear.split('-');
  if (yearParts.length !== 2) return null;
  
  const startYear = parseInt(yearParts[0]);
  // Handle both 2-digit (25) and 4-digit (2025) end year formats
  const endYearPart = parseInt(yearParts[1]);
  const endYear = endYearPart < 100 ? Math.floor(startYear / 100) * 100 + endYearPart : endYearPart;
  
  return {
    startYear,
    endYear,
    // Education year runs from June 1st to May 31st
    startDate: new Date(startYear, 5, 1), // June 1st
    endDate: new Date(endYear, 4, 31), // May 31st
  };
};

// Validate if date falls within education year (June to May)
export const isDateInFinancialYear = (date, kraYear) => {
  if (!date || !kraYear) return true;
  
  const fyInfo = parseFinancialYear(kraYear);
  if (!fyInfo) return true;
  
  const checkDate = new Date(date);
  const month = checkDate.getMonth() + 1;
  const year = checkDate.getFullYear();
  
  // Education year runs from June to May
  return (
    (year === fyInfo.startYear && month >= 6) ||
    (year === fyInfo.endYear && month <= 5)
  );
};

// Validate Indian mobile number
export const isValidMobileNumber = (number) => {
  if (!number) return false;
  const cleanNumber = number.replace(/\s/g, '');
  return /^[6-9]\d{9}$/.test(cleanNumber);
};

// Format date for display
export const formatDate = (date) => {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

// Format date for API
export const formatDateForApi = (date) => {
  if (!date) return '';
  const d = new Date(date);
  return d.toISOString();
};

// Get month name in Marathi
export const getMonthNameMarathi = (month) => {
  const monthNames = [
    'जानेवारी', 'फेब्रुवारी', 'मार्च', 'एप्रिल',
    'मे', 'जून', 'जुलै', 'ऑगस्ट',
    'सप्टेंबर', 'ऑक्टोबर', 'नोव्हेंबर', 'डिसेंबर'
  ];
  return monthNames[month - 1] || '';
};

// Check if value is numeric and non-negative
export const isValidNumber = (value) => {
  const num = parseFloat(value);
  return !isNaN(num) && num >= 0;
};
