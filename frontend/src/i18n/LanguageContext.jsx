import { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "kra.language";

const safeStorageGet = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeStorageSet = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
};

const normalizeLanguage = (value) => {
  if (value === "mr") return "mr";
  return "en";
};

const splitBilingual = (value) => {
  if (typeof value !== "string") return null;
  const parts = value.split("|");
  if (parts.length < 2) return null;
  const mr = parts[0].trim();
  const en = parts.slice(1).join("|").trim();
  if (!mr && !en) return null;
  return { mr, en };
};

const LanguageContext = createContext(null);

export const LanguageProvider = ({ children, defaultLanguage = "en" }) => {
  const [language, setLanguageState] = useState(() => {
    const stored = safeStorageGet(STORAGE_KEY);
    return normalizeLanguage(stored || defaultLanguage);
  });

  const setLanguage = (next) => {
    const normalized = normalizeLanguage(next);
    setLanguageState(normalized);
    safeStorageSet(STORAGE_KEY, normalized);
  };

  useEffect(() => {
    // Keep <html lang> aligned for accessibility.
    try {
      document.documentElement.lang = language === "mr" ? "mr" : "en";
    } catch {
      // ignore
    }
  }, [language]);

  const value = useMemo(() => {
    const t = (mrText, enText) => (language === "mr" ? mrText : enText);

    // Convenience: if you already have a "मराठी | English" string.
    const tp = (mixedText) => {
      const parts = splitBilingual(mixedText);
      if (!parts) return mixedText;
      return language === "mr" ? parts.mr : parts.en;
    };

    return {
      language,
      setLanguage,
      t,
      tp,
    };
  }, [language]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return ctx;
};
