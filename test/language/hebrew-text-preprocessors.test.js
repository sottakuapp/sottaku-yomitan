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

import {describe, expect, test} from 'vitest';
import {
    normalizeHebrewUnicode,
    removeHebrewBidiControlCharacters,
    removeHebrewCantillation,
    removeHebrewPoints,
} from '../../ext/js/language/he/hebrew-text-preprocessors.js';

/**
 * @param {import('language').TextProcessor} processor
 * @param {string} value
 * @returns {string}
 */
const transformed = (processor, value) => processor.process(value)[1];

describe('Hebrew text preprocessors', () => {
    test('normalizes canonically equivalent mark order', () => {
        expect(transformed(normalizeHebrewUnicode, 'שָׁלוֹם')).toBe('שָׁלוֹם');
    });

    test('removes bidi controls without changing visible letters', () => {
        expect(transformed(removeHebrewBidiControlCharacters, '\u200fשלום')).toBe('שלום');
    });

    test('can remove cantillation without removing Modern Hebrew niqqud', () => {
        expect(transformed(removeHebrewCantillation, 'שָׁל֑וֹם')).toBe('שָׁלוֹם');
    });

    test('offers an unpointed lookup variant without weakening quiz grading', () => {
        expect(transformed(removeHebrewPoints, 'שָׁלוֹם')).toBe('שלום');
    });
});
