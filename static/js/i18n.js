/**
 * Internationalization (i18n) Module
 * Supports multiple languages with fallback to English
 */

// Available languages
const SUPPORTED_LANGUAGES = {
  "en-US": "English",
  "zh-CN": "简体中文",
};

// Current language, default to English
let currentLanguage = "en-US";

// Translations cache
let translations = {};

/**
 * Initialize i18n system
 * @param {string} lang - Language code (e.g., 'zh-CN', 'en-US')
 * @returns {Promise<void>}
 */
async function initI18n(lang = null) {
  // Try to get language from localStorage or URL parameter
  if (!lang) {
    lang =
      localStorage.getItem("preferredLanguage") ||
      getBrowserLanguage() ||
      "en-US";
  }

  // Validate language is supported
  if (!SUPPORTED_LANGUAGES[lang]) {
    lang = "en-US";
  }

  currentLanguage = lang;

  // Load translations
  try {
    const response = fetch(`/static/locales/${currentLanguage}.json`);
    const enResponse = fetch("/static/locales/en-US.json");

    const [dataResponse, enResponseData] = await Promise.all([response, enResponse]);

    // Load current language translations
    if (dataResponse.ok) {
      translations[currentLanguage] = await dataResponse.json();
      console.log(`[i18n] Loaded translations for: ${currentLanguage}`);
    } else {
      console.warn(`[i18n] Translation file not found for ${currentLanguage}, falling back to English`);
      translations[currentLanguage] = {};
    }

    // Always load English as fallback
    if (enResponseData.ok) {
      translations["en-US"] = await enResponseData.json();
    } else {
      console.error("[i18n] Failed to load English translations");
      translations["en-US"] = {};
    }

    // Apply translations to the page
    applyTranslations();

    // Update language selector if exists
    updateLanguageSelector();

    console.log(`[i18n] Initialized with language: ${currentLanguage}`);
  } catch (error) {
    console.error("[i18n] Error loading translations:", error);
  }
}

/**
 * Get browser's preferred language
 * @returns {string} Browser language code
 */
function getBrowserLanguage() {
  const browserLang = navigator.language || navigator.userLanguage;
  if (browserLang && SUPPORTED_LANGUAGES[browserLang]) {
    return browserLang;
  }
  // Try to match just the language part (e.g., 'zh' from 'zh-CN')
  const langPart = browserLang.split("-")[0];
  for (const supportedLang of Object.keys(SUPPORTED_LANGUAGES)) {
    if (supportedLang.startsWith(langPart)) {
      return supportedLang;
    }
  }
  return null;
}

/**
 * Translate a key
 * @param {string} key - Translation key (dot notation supported, e.g., 'nav.home')
 * @param {Object} params - Optional parameters for string interpolation
 * @returns {string} Translated text or fallback to English or key itself
 */
function t(key, params = {}) {
  let translation = "";

  // Try current language first
  if (translations[currentLanguage] && translations[currentLanguage][key]) {
    translation = translations[currentLanguage][key];
  }
  // Fallback to English
  else if (translations["en-US"] && translations["en-US"][key]) {
    translation = translations["en-US"][key];
  }
  // Last resort: return the key itself
  else {
    translation = key;
  }

  // Apply parameter substitution
  if (params && typeof params === "object") {
    for (const [paramKey, paramValue] of Object.entries(params)) {
      translation = translation.replace(
        new RegExp(`{{${paramKey}}}`, "g"),
        paramValue,
      );
    }
  }

  return translation;
}

/**
 * Apply translations to all elements with data-i18n attribute
 */
function applyTranslations() {
  // Translate elements with data-i18n attribute
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const key = element.getAttribute("data-i18n");
    const translation = t(key);

    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
      element.placeholder = translation;
    } else if (element.tagName === "IMG") {
      element.alt = translation;
    } else {
      // Use innerHTML to preserve HTML entities and emoji in translations
      element.innerHTML = translation;
    }
  });

  // Translate elements with data-i18n-title attribute
  document.querySelectorAll("[data-i18n-title]").forEach((element) => {
    const key = element.getAttribute("data-i18n-title");
    element.title = t(key);
  });

  // Translate elements with data-i18n-html attribute (allows HTML)
  document.querySelectorAll("[data-i18n-html]").forEach((element) => {
    const key = element.getAttribute("data-i18n-html");
    element.innerHTML = t(key);
  });

  // Set document language
  document.documentElement.lang = currentLanguage;

  // Save preference
  localStorage.setItem("preferredLanguage", currentLanguage);
}

/**
 * Change the current language
 * @param {string} lang - New language code
 */
async function setLanguage(lang) {
  if (!SUPPORTED_LANGUAGES[lang]) {
    console.warn(`[i18n] Unsupported language: ${lang}`);
    return;
  }

  await initI18n(lang);

  // Dispatch event for custom handling
  window.dispatchEvent(
    new CustomEvent("languageChanged", {
      detail: { language: lang },
    }),
  );

  // Re-render statistics if home view is shown
  const intro = document.getElementById("intro");
  if (intro && intro.style.display !== "none") {
    displayFileStats();
  }
}

/**
 * Get current language
 * @returns {string} Current language code
 */
function getCurrentLanguage() {
  return currentLanguage;
}

/**
 * Get all supported languages
 * @returns {Object} Supported languages map
 */
function getSupportedLanguages() {
  return SUPPORTED_LANGUAGES;
}

/**
 * Update language selector UI if it exists
 */
function updateLanguageSelector() {
  const selector = document.getElementById("languageSelector");
  if (!selector) return;

  selector.value = currentLanguage;
}

/**
 * Create a language selector dropdown
 * @param {string} containerId - ID of container element
 * @returns {HTMLElement} The created select element
 */
function createLanguageSelector(containerId) {
  const container = document.getElementById(containerId);
  if (!container) {
    console.warn('[i18n] Language selector container not found:', containerId);
    return null;
  }
  
  // Clear container first
  container.innerHTML = '';
  
  const select = document.createElement("select");
  select.id = "languageSelector";
  select.className = "language-selector";
  select.title = t('language.selector') || 'Select Language';

  for (const [code, name] of Object.entries(SUPPORTED_LANGUAGES)) {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = name;
    if (code === currentLanguage) {
      option.selected = true;
    }
    select.appendChild(option);
  }

  select.addEventListener("change", async (e) => {
    console.log('[i18n] Language changed to:', e.target.value);
    await setLanguage(e.target.value);
    // Re-render statistics if home view is shown
    if (document.getElementById("intro").style.display !== "none") {
      displayFileStats();
    }
  });

  container.appendChild(select);
  console.log('[i18n] Language selector created, current language:', currentLanguage);
  return select;
}

// Export t() function globally for use in other modules
window.t = t;

// Export i18n namespace
window.i18n = {
  init: initI18n,
  t: t,
  setLanguage: setLanguage,
  getCurrentLanguage: getCurrentLanguage,
  getSupportedLanguages: getSupportedLanguages,
  createLanguageSelector: createLanguageSelector
};
