/*
 * Copyright (C) 2025  Sottaku Inc
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import {languageDescriptorMap} from './language-descriptors.js';

export const SOTTAKU_SUPPORTED_LANGUAGES = ['ja', 'ko', 'zh', 'en', 'es', 'de', 'fr', 'it'];

/**
 * @param {unknown} supportedLanguages
 * @returns {string[]}
 */
export function normalizeSottakuSupportedLanguages(supportedLanguages) {
    const normalized = [];
    const seen = new Set();
    /** @type {string[]} */
    const source = [];
    if (Array.isArray(supportedLanguages)) {
        for (const language of supportedLanguages) {
            if (typeof language === 'string') {
                source.push(language);
            }
        }
    }
    source.push(...SOTTAKU_SUPPORTED_LANGUAGES);
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
        case 'zh': return '\uD83C\uDDE8\uD83C\uDDF3'; // CN flag
        case 'en': return '\uD83C\uDDFA\uD83C\uDDF8'; // US flag
        case 'es': return '\uD83C\uDDEA\uD83C\uDDF8'; // ES flag
        case 'de': return '\uD83C\uDDE9\uD83C\uDDEA'; // DE flag
        case 'fr': return '\uD83C\uDDEB\uD83C\uDDF7'; // FR flag
        case 'it': return '\uD83C\uDDEE\uD83C\uDDF9'; // IT flag
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
    const normalizedSupported = normalizeSottakuSupportedLanguages(supportedLanguages);

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
