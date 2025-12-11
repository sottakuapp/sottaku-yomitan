import {languageDescriptorMap} from './language-descriptors.js';

export const SOTTAKU_SUPPORTED_LANGUAGES = ['ja', 'ko'];

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
 * @returns {string[]}
 */
export function normalizeSottakuLanguages(preferredLanguages, defaultLanguage) {
    /** @type {string[]} */
    const normalized = [];
    const seen = new Set();

    /**
     * @param {unknown} value
     */
    const addLanguage = (value) => {
        if (typeof value !== 'string') { return; }
        const iso = value.trim();
        if (iso.length === 0 || seen.has(iso) || !SOTTAKU_SUPPORTED_LANGUAGES.includes(iso)) { return; }
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
        for (const language of SOTTAKU_SUPPORTED_LANGUAGES) {
            addLanguage(language);
        }
    }

    return normalized;
}
