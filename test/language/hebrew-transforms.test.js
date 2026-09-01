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
        category: 'reviewed media inflections',
        valid: true,
        tests: [
            {term: 'אח', source: 'אחים', rule: 'noun', reasons: ['Hebrew plural']},
            {term: 'מלאך', source: 'למלאכים', rule: 'noun', reasons: ['Hebrew plural', 'Hebrew prefix lamed']},
            {term: 'מתכת', source: 'מתכות', rule: 'noun', reasons: ['Hebrew plural']},
            {term: 'עיקרון', source: 'עקרונות', rule: 'noun', reasons: ['Hebrew plural']},
            {term: 'פריט', source: 'פריטים', rule: 'noun', reasons: ['Hebrew plural']},
            {term: 'יום', source: 'כימי', rule: 'noun', reasons: ['Hebrew plural', 'Hebrew prefix kaf']},
            {term: 'משכן', source: 'למשכנותיו', rule: 'noun', reasons: ['Hebrew plural', 'Hebrew possessive suffix', 'Hebrew prefix lamed']},
            {term: 'גדול', source: 'גדולה', rule: 'adjective', reasons: ['Hebrew adjective agreement']},
            {term: 'קטן', source: 'קטנה', rule: 'adjective', reasons: ['Hebrew adjective agreement']},
            {term: 'הוא', source: 'היא', rule: 'pronoun', reasons: ['Hebrew pronoun agreement']},
            {term: 'בכור', source: 'בכוריהם', rule: 'noun', reasons: ['Hebrew plural', 'Hebrew possessive suffix']},
            {term: 'אם', source: 'אמי', rule: 'noun', reasons: ['Hebrew possessive suffix']},
            {term: 'בתוך', source: 'בתוכו', rule: 'preposition', reasons: ['Hebrew pronominal suffix']},
            {term: 'די', source: 'דיינו', rule: 'adverb', reasons: ['Hebrew pronominal suffix']},
            {term: 'הוציא', source: 'הוציאנו', rule: 'verb', reasons: ['Hebrew object pronoun suffix']},
            {term: 'עבר', source: 'עברני', rule: 'verb', reasons: ['Hebrew object pronoun suffix']},
            {term: 'הוביל', source: 'יובילני', rule: 'verb', reasons: ['Hebrew future', 'Hebrew object pronoun suffix']},
            {term: 'חלם', source: 'חלמתי', rule: 'verb', reasons: ['Hebrew past']},
            {term: 'קיבל', source: 'קיבלה', rule: 'verb', reasons: ['Hebrew past']},
            {term: 'הריע', source: 'נריע', rule: 'verb', reasons: ['Hebrew future']},
            {term: 'שמע', source: 'וישמע', rule: 'verb', reasons: ['Hebrew future', 'Hebrew prefix conjunction']},
            {term: 'צפה', source: 'צופיה', rule: 'verb', reasons: ['Hebrew present participle']},
            {term: 'עזר', source: 'עוזרת', rule: 'verb', reasons: ['Hebrew present participle']},
            {term: 'גל', source: 'נגילה', rule: 'verb', reasons: ['Hebrew cohortative']},
            {term: 'רינן', source: 'נרננה', rule: 'verb', reasons: ['Hebrew cohortative']},
            {term: 'שמח', source: 'ונשמחה', rule: 'verb', reasons: ['Hebrew cohortative', 'Hebrew prefix conjunction']},
            {term: 'ער', source: 'עורו', rule: 'verb', reasons: ['Hebrew imperative']},
            {term: 'ישב', source: 'שבת', rule: 'verb', reasons: ['Hebrew infinitive construct']},
            {term: 'ריחף', source: 'רחוף', rule: 'verb', reasons: ['Hebrew infinitive absolute']},
            {term: 'מן', source: 'מ', rule: 'preposition', reasons: ['Hebrew contracted min prefix']},
            {term: 'סיפק', source: 'ספק', rule: 'verb', reasons: ['Hebrew defective spelling']},
            {term: 'שיקע', source: 'שקע', rule: 'verb', reasons: ['Hebrew defective spelling']},
            {term: 'קלאופטרה', source: 'קליאופטרה', rule: 'proper noun', reasons: ['Hebrew defective spelling']},
            {term: 'אלוהים', source: 'באלהיהם', rule: 'noun', reasons: ['Hebrew possessive suffix', 'Hebrew prefix bet']},
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
