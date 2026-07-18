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
import {hebrewTransforms} from '../../ext/js/language/he/hebrew-transforms.js';
import {languageDescriptorMap} from '../../ext/js/language/language-descriptors.js';
import {LanguageTransformer} from '../../ext/js/language/language-transformer.js';
import {testLanguageTransformer} from '../fixtures/language-transformer-test.js';

const tests = [
    {
        category: 'single attached proclitics',
        valid: true,
        tests: [
            {term: 'בית', source: 'הבית', rule: 'noun', reasons: ['Hebrew prefix definite article']},
            {term: 'שלום', source: 'ושלום', rule: 'n', reasons: ['Hebrew prefix conjunction']},
            {term: 'בית', source: 'בבית', rule: 'noun', reasons: ['Hebrew prefix bet']},
            {term: 'כלב', source: 'ככלב', rule: 'noun', reasons: ['Hebrew prefix kaf']},
            {term: 'כלב', source: 'לכלב', rule: 'n', reasons: ['Hebrew prefix lamed']},
            {term: 'כלב', source: 'מכלב', rule: 'noun', reasons: ['Hebrew prefix mem']},
            {term: 'כלב', source: 'שכלב', rule: 'n', reasons: ['Hebrew prefix shin']},
            {term: 'הולך', source: 'והולך', rule: 'verb', reasons: ['Hebrew prefix conjunction']},
            {term: 'כותב', source: 'שכותב', rule: 'ptcpl', reasons: ['Hebrew prefix shin']},
        ],
    },
    {
        category: 'prefix pointing and stem preservation',
        valid: true,
        tests: [
            {term: 'בַּיִת', source: 'הַבַּיִת', rule: 'noun', reasons: ['Hebrew prefix definite article']},
            {term: 'שָׁלוֹם', source: 'וְשָׁלוֹם', rule: 'n', reasons: ['Hebrew prefix conjunction']},
            {term: 'בֵּית־סֵפֶר', source: 'בְּבֵּית־סֵפֶר', rule: 'noun', reasons: ['Hebrew prefix bet']},
        ],
    },
    {
        category: 'minimum stem and script guards',
        valid: false,
        tests: [
            {term: 'אב', source: 'האב', rule: 'noun', reasons: null},
            {term: 'אם', source: 'ואם', rule: 'noun', reasons: null},
            {term: 'house', source: 'הhouse', rule: 'noun', reasons: null},
            {term: 'בית', source: 'ה בית', rule: 'noun', reasons: null},
            {term: 'בית', source: 'הבית!', rule: 'noun', reasons: null},
        ],
    },
    {
        category: 'no recursive prefix stripping',
        valid: false,
        tests: [
            {term: 'בית', source: 'והבית', rule: 'noun', reasons: null},
            {term: 'בית', source: 'שבבית', rule: 'noun', reasons: null},
        ],
    },
    {
        category: 'no speculative suffix handling',
        valid: false,
        tests: [
            {term: 'ספר', source: 'ספרים', rule: 'noun', reasons: null},
            {term: 'ילדה', source: 'ילדות', rule: 'noun', reasons: null},
        ],
    },
];

const languageTransformer = new LanguageTransformer();
languageTransformer.addDescriptor(hebrewTransforms);
testLanguageTransformer(languageTransformer, tests);

describe('candidate safety', () => {
    test('registers the Hebrew transformer on the Modern Hebrew descriptor', () => {
        expect(languageDescriptorMap.get('he')?.languageTransforms).toBe(hebrewTransforms);
    });

    test('keeps the exact source as the first, untraced candidate', () => {
        const source = 'הַבַּיִת';
        const [exact] = languageTransformer.transform(source);
        expect(exact).toStrictEqual({text: source, conditions: 0, trace: []});
    });

    test('removes at most one attached prefix per candidate', () => {
        const results = languageTransformer.transform('והבית');
        expect(results.map(({text}) => text)).toStrictEqual(['והבית', 'הבית']);
        expect(results[1].trace.map(({transform}) => transform)).toStrictEqual([
            'Hebrew prefix conjunction',
        ]);
    });
});
