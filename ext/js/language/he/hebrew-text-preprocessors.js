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

const hebrewCantillationRegex = /[\u0591-\u05af\u05bd\u05c4\u05c5]/gu;
const hebrewPointRegex = /[\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7]/gu;
const bidiControlRegex = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu;

/** @type {import('language').TextProcessor} */
export const normalizeHebrewUnicode = {
    name: 'Normalize Hebrew Unicode',
    description: 'Normalize canonically equivalent Hebrew mark order for lookup',
    process: (text) => [text, text.normalize('NFC')],
};

/** @type {import('language').TextProcessor} */
export const removeHebrewBidiControlCharacters = {
    name: 'Remove Hebrew bidirectional controls',
    description: 'Ignore invisible display controls during lookup',
    process: (text) => [text, text.replace(bidiControlRegex, '')],
};

/** @type {import('language').TextProcessor} */
export const removeHebrewCantillation = {
    name: 'Remove Hebrew cantillation',
    description: 'שָׁל֑וֹם → שָׁלוֹם',
    process: (text) => [text, text.replace(hebrewCantillationRegex, '')],
};

/** @type {import('language').TextProcessor} */
export const removeHebrewPoints = {
    name: 'Remove Hebrew points',
    description: 'שָׁלוֹם → שלום',
    process: (text) => [text, text.replace(hebrewPointRegex, '')],
};
