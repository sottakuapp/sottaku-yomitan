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

import {describe, expect, test} from 'vitest';
import {
    removeBidiControlCharacters,
} from '../../ext/js/language/ar/arabic-text-preprocessors.js';
import {
    normalizeDevanagariUnicode,
    removeIndicFormatControlCharacters,
} from '../../ext/js/language/hi/hindi-text-preprocessors.js';
import {languageDescriptorMap} from '../../ext/js/language/language-descriptors.js';

describe('Arabic and Devanagari lookup preprocessing', () => {
    test('strips bidi controls without changing Arabic orthographic text', () => {
        expect(removeBidiControlCharacters.process('\u2067المدرسة\u2069')).toStrictEqual([
            '\u2067المدرسة\u2069',
            'المدرسة',
        ]);
    });

    test('canonically normalizes Devanagari nukta letters', () => {
        expect(normalizeDevanagariUnicode.process('क़िताब')).toStrictEqual([
            'क़िताब',
            'क़िताब',
        ]);
    });

    test('offers a joiner-free Hindi lookup variant while preserving the source variant', () => {
        expect(removeIndicFormatControlCharacters.process('र्\u200dय')).toStrictEqual([
            'र्\u200dय',
            'र्य',
        ]);
    });

    test('keeps the existing Arabic transformer and enables Hindi preprocessors', () => {
        expect(languageDescriptorMap.get('ar')?.languageTransforms?.language).toBe('ar');
        expect(languageDescriptorMap.get('hi')?.textPreprocessors).toMatchObject({
            normalizeDevanagariUnicode,
            removeIndicFormatControlCharacters,
        });
    });
});
