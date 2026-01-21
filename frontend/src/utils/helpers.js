// Generate KRA Years (Financial Year format)
export const generateKraYears = () => {
  const currentYear = new Date().getFullYear();
  const years = [];
  
  // Generate years from 2024-2025 to current year + 2
  for (let year = 2024; year <= currentYear + 2; year++) {
    years.push(`${year}-${year + 1}`);
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

// Parse financial year to get start and end dates
export const parseFinancialYear = (kraYear) => {
  if (!kraYear) return null;
  
  const yearParts = kraYear.split('-');
  const startYear = parseInt(yearParts[0]);
  const endYear = parseInt(yearParts[1]);
  
  return {
    startYear,
    endYear,
    startDate: new Date(startYear, 3, 1), // April 1st
    endDate: new Date(endYear, 2, 31)      // March 31st
  };
};

// Validate if date falls within financial year
export const isDateInFinancialYear = (date, kraYear) => {
  if (!date || !kraYear) return true;
  
  const fyInfo = parseFinancialYear(kraYear);
  if (!fyInfo) return true;
  
  const checkDate = new Date(date);
  const month = checkDate.getMonth() + 1;
  const year = checkDate.getFullYear();
  
  // Financial year runs from April to March
  return (
    (year === fyInfo.startYear && month >= 4) ||
    (year === fyInfo.endYear && month <= 3)
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
