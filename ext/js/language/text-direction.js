/*
 * Copyright (C) 2025-2026  Sottaku Inc
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

const RTL_LANGUAGE_CODES = new Set(['aii', 'ar', 'arz', 'fa', 'he', 'ur', 'yi']);

/**
 * Resolve direction from the language carried by the content itself, not the
 * extension UI locale. This matters for mixed-language Sottaku results.
 * @param {string} language
 * @returns {'rtl'|'ltr'}
 */
export function getTextDirection(language) {
    const primary = (language || '').trim().toLowerCase().split(/[-_]/, 1)[0];
    return RTL_LANGUAGE_CODES.has(primary) ? 'rtl' : 'ltr';
}

/**
 * @param {HTMLElement} element
 * @param {string} language
 */
export function setElementLanguageDirection(element, language) {
    element.lang = language;
    element.dir = getTextDirection(language);
}
