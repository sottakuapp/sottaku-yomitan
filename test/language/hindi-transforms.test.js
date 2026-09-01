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
import {hindiTransforms} from '../../ext/js/language/hi/hindi-transforms.js';
import {languageDescriptorMap} from '../../ext/js/language/language-descriptors.js';
import {LanguageTransformer} from '../../ext/js/language/language-transformer.js';
import {testLanguageTransformer} from '../fixtures/language-transformer-test.js';

const tests = [
    {
        category: 'productive and irregular corpus forms',
        valid: true,
        tests: [
            {term: 'करना', source: 'करते', rule: 'v', reasons: ['habitual masculine plural']},
            {term: 'करना', source: 'करोगे', rule: 'v', reasons: ['future']},
            {term: 'जाना', source: 'गईं', rule: 'v', reasons: ['past feminine plural']},
            {term: 'फैलना', source: 'फैल', rule: 'v', reasons: ['verb stem']},
            {term: 'कर्मचारी', source: 'कर्मचारियों', rule: 'n', reasons: ['oblique plural']},
            {term: 'देना', source: 'दो', rule: 'v', reasons: ['imperative']},
            {term: 'गाना', source: 'गाए', rule: 'v', reasons: ['past masculine plural']},
            {term: 'बनाना', source: 'बनाएँ', rule: 'v', reasons: ['subjunctive']},
            {term: 'भाई', source: 'भाइयों', rule: 'n', reasons: ['oblique plural']},
            {term: 'हम', source: 'हमने', rule: 'pron', reasons: ['oblique pronoun']},
            {term: 'वचन देना', source: 'दिया', rule: 'v', reasons: ['perfective masculine singular']},
            {term: 'लेना', source: 'लिए', rule: 'v', reasons: ['past masculine plural']},
        ],
    },
];

const languageTransformer = new LanguageTransformer();
languageTransformer.addDescriptor(hindiTransforms);
testLanguageTransformer(languageTransformer, tests);

describe('descriptor registration', () => {
    test('registers Hindi transforms', () => {
        expect(languageDescriptorMap.get('hi')?.languageTransforms).toBe(hindiTransforms);
    });
});
