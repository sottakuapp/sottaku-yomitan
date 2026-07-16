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

// eslint-disable-next-line no-misleading-character-class
const indicFormatControlRegex = /[\u200c\u200d\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu;

/** @type {import('language').TextProcessor} */
export const normalizeDevanagariUnicode = {
    name: 'Normalize Devanagari Unicode',
    description: 'क़िताब → क़िताब',
    process: (text) => [text, text.normalize('NFC')],
};

/** @type {import('language').TextProcessor} */
export const removeIndicFormatControlCharacters = {
    name: 'Remove Indic format control characters',
    description: 'Ignore optional joiners and invisible display controls during lookup',
    process: (text) => [text, text.replace(indicFormatControlRegex, '')],
};
