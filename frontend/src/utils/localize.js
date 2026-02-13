const splitBilingual = (value) => {
  if (typeof value !== "string") return null;
  const parts = value.split("|");
  if (parts.length < 2) return null;
  const mr = parts[0].trim();
  const en = parts.slice(1).join("|").trim();
  if (!mr && !en) return null;
  return { mr, en };
};

export const localizeString = (value, language = "en") => {
  const parts = splitBilingual(value);
  if (!parts) return value;
  return language === "mr" ? parts.mr : parts.en;
};

export const localizeName = (entity, language = "en") => {
  if (!entity) return "";

  // Common patterns across models / APIs
  const nameMr =
    entity.nameMr || entity.nameMarathi || entity.labelMr || entity.titleMr;
  const nameEn =
    entity.nameEn || entity.nameEnglish || entity.labelEn || entity.titleEn;

  // Fallbacks
  const base = entity.name || entity.label || entity.title || "";

  if (language === "mr") {
    return nameMr || localizeString(base, language) || base;
  }
  return nameEn || localizeString(base, language) || base;
};
