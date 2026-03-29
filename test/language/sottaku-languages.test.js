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

import {describe, expect, test} from 'vitest';
import {
    getSottakuLanguageFlag,
    normalizeSottakuLanguages,
    normalizeSottakuSupportedLanguages,
} from '../../ext/js/language/sottaku-languages.js';

describe('sottaku-languages', () => {
    test('retains built-in English support when server languages omit it', () => {
        expect(normalizeSottakuSupportedLanguages(['ja', 'ko', 'zh'])).toStrictEqual(['ja', 'ko', 'zh', 'en']);
    });

    test('keeps English as a valid preferred language even when the server list is partial', () => {
        expect(normalizeSottakuLanguages(['en'], 'ja', ['ja', 'ko', 'zh'])).toStrictEqual(['en']);
    });

    test('uses the English flag for English', () => {
        expect(getSottakuLanguageFlag('en')).toBe('\uD83C\uDDFA\uD83C\uDDF8');
    });
});
