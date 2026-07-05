/*
 * Copyright (C) 2024-2026  Yomitan Authors
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

/** @type {import('language').TextProcessor} */
export const removeRussianDiacritics = {
    name: 'Remove diacritics',
    description: 'A\u0301 → A, a\u0301 → a',
    process: (str) => [str, str.replace(/\u0301/g, '')],
};

const MAX_YO_VARIANTS = 64;
/** @type {Map<string, string>} */
const yoAlternates = new Map([
    ['е', 'ё'],
    ['ё', 'е'],
    ['Е', 'Ё'],
    ['Ё', 'Е'],
]);

/**
 * @param {string} str
 * @returns {string[]}
 */
function getYoVariants(str) {
    /** @type {string[]} */
    const variants = [];
    /** @type {Set<string>} */
    const seen = new Set();

    /**
     * @param {string} variant
     */
    const add = (variant) => {
        if (variant.length === 0 || seen.has(variant) || variants.length >= MAX_YO_VARIANTS) {
            return;
        }
        seen.add(variant);
        variants.push(variant);
    };

    add(str);
    const sourceChars = [...str];
    for (let index = 0; index < sourceChars.length && variants.length < MAX_YO_VARIANTS; ++index) {
        if (!yoAlternates.has(sourceChars[index])) { continue; }
        const variantCount = variants.length;
        for (let variantIndex = 0; variantIndex < variantCount; ++variantIndex) {
            if (variants.length >= MAX_YO_VARIANTS) { break; }
            const existing = variants[variantIndex];
            const chars = [...existing];
            const replacement = yoAlternates.get(chars[index]);
            if (typeof replacement !== 'string') { continue; }
            chars[index] = replacement;
            add(chars.join(''));
        }
    }

    return variants;
}

/** @type {import('language').TextProcessor} */
export const yoToE = {
    name: 'Convert "ё" to "е"',
    description: 'ё → е, Ё → Е and vice versa',
    process: getYoVariants,
};
