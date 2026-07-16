/*
 * Copyright (C) 2026  Yomitan Authors
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
import {CJK_IDEOGRAPH_RANGES, CJK_UNIFIED_IDEOGRAPH_RANGES, isCodePointInRanges} from '../../ext/js/language/CJK-util.js';

describe('Unicode 17 CJK unified ideographs', () => {
    test('includes assigned Extension J through U+33479', () => {
        expect(isCodePointInRanges(0x323b0, CJK_UNIFIED_IDEOGRAPH_RANGES)).toStrictEqual(true);
        expect(isCodePointInRanges(0x33479, CJK_UNIFIED_IDEOGRAPH_RANGES)).toStrictEqual(true);
    });

    test('excludes the reserved tail after Extension J', () => {
        expect(isCodePointInRanges(0x3347a, CJK_UNIFIED_IDEOGRAPH_RANGES)).toStrictEqual(false);
    });

    test('includes only compatibility characters with Unified_Ideograph', () => {
        expect(isCodePointInRanges(0xfa0e, CJK_UNIFIED_IDEOGRAPH_RANGES)).toStrictEqual(true);
        expect(isCodePointInRanges(0xfa29, CJK_UNIFIED_IDEOGRAPH_RANGES)).toStrictEqual(true);
        expect(isCodePointInRanges(0xfa10, CJK_UNIFIED_IDEOGRAPH_RANGES)).toStrictEqual(false);
    });

    test('keeps legacy compatibility ideographs in generic CJK detection', () => {
        expect(isCodePointInRanges(0xf904, CJK_IDEOGRAPH_RANGES)).toStrictEqual(true);
        expect(isCodePointInRanges(0xf92d, CJK_IDEOGRAPH_RANGES)).toStrictEqual(true);
    });
});
