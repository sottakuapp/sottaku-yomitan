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
    test('retains built-in language support when server languages omit it', () => {
        expect(normalizeSottakuSupportedLanguages(['ja', 'ko', 'zh'])).toStrictEqual(['ja', 'ko', 'zh', 'en', 'es', 'de', 'fr', 'it', 'ru']);
    });

    test('includes European and Russian study languages in the built-in language list', () => {
        expect(normalizeSottakuSupportedLanguages([])).toStrictEqual(['ja', 'ko', 'zh', 'en', 'es', 'de', 'fr', 'it', 'ru']);
    });

    test('keeps English as a valid preferred language even when the server list is partial', () => {
        expect(normalizeSottakuLanguages(['en'], 'ja', ['ja', 'ko', 'zh'])).toStrictEqual(['en']);
    });

    test('uses the English flag for English', () => {
        expect(getSottakuLanguageFlag('en')).toBe('\uD83C\uDDFA\uD83C\uDDF8');
    });

    test('uses country flags for European and Russian study languages', () => {
        expect(getSottakuLanguageFlag('es')).toBe('\uD83C\uDDEA\uD83C\uDDF8');
        expect(getSottakuLanguageFlag('de')).toBe('\uD83C\uDDE9\uD83C\uDDEA');
        expect(getSottakuLanguageFlag('fr')).toBe('\uD83C\uDDEB\uD83C\uDDF7');
        expect(getSottakuLanguageFlag('it')).toBe('\uD83C\uDDEE\uD83C\uDDF9');
        expect(getSottakuLanguageFlag('ru')).toBe('\uD83C\uDDF7\uD83C\uDDFA');
    });
});
