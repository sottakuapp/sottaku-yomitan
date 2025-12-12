import {languageDescriptorMap} from './language-descriptors.js';

export const SOTTAKU_SUPPORTED_LANGUAGES = ['ja', 'ko'];

/**
 * @param {unknown} supportedLanguages
 * @returns {string[]}
 */
function normalizeSupportedLanguagesList(supportedLanguages) {
    const normalized = [];
    const seen = new Set();
    const source = Array.isArray(supportedLanguages) ? supportedLanguages : SOTTAKU_SUPPORTED_LANGUAGES;
    for (const language of source) {
        if (typeof language !== 'string') { continue; }
        const trimmed = language.trim();
        if (!trimmed || seen.has(trimmed)) { continue; }
        seen.add(trimmed);
        normalized.push(trimmed);
    }
    return normalized.length > 0 ? normalized : [...SOTTAKU_SUPPORTED_LANGUAGES];
}

/**
 * @param {string} language
 * @returns {string}
 */
export function getSottakuLanguageFlag(language) {
    switch (language) {
        case 'ja': return '\uD83C\uDDEF\uD83C\uDDF5'; // JP flag
        case 'ko': return '\uD83C\uDDF0\uD83C\uDDF7'; // KR flag
        default: return '\uD83C\uDF10'; // Globe
    }
}

/**
 * @param {string} language
 * @returns {string}
 */
export function getSottakuLanguageName(language) {
    const descriptor = languageDescriptorMap.get(language);
    if (descriptor && typeof descriptor.name === 'string') {
        return descriptor.name;
    }
    return language;
}

/**
 * @param {unknown} preferredLanguages
 * @param {string} defaultLanguage
 * @param {unknown} [supportedLanguages]
 * @returns {string[]}
 */
export function normalizeSottakuLanguages(preferredLanguages, defaultLanguage, supportedLanguages = SOTTAKU_SUPPORTED_LANGUAGES) {
    /** @type {string[]} */
    const normalized = [];
    const seen = new Set();
    const normalizedSupported = normalizeSupportedLanguagesList(supportedLanguages);

    /**
     * @param {unknown} value
     */
    const addLanguage = (value) => {
        if (typeof value !== 'string') { return; }
        const iso = value.trim();
        if (iso.length === 0 || seen.has(iso) || !normalizedSupported.includes(iso)) { return; }
        seen.add(iso);
        normalized.push(iso);
    };

    if (Array.isArray(preferredLanguages)) {
        for (const language of preferredLanguages) {
            addLanguage(language);
        }
    }

    if (normalized.length === 0) {
        addLanguage(defaultLanguage);
    }

    if (normalized.length === 0) {
        for (const language of normalizedSupported) {
            addLanguage(language);
        }
    }

    return normalized;
}
