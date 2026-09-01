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
import {languageDescriptorMap} from '../../ext/js/language/language-descriptors.js';
import {LanguageTransformer} from '../../ext/js/language/language-transformer.js';
import {portugueseTransforms} from '../../ext/js/language/pt/portuguese-transforms.js';
import {testLanguageTransformer} from '../fixtures/language-transformer-test.js';

const tests = [
    {
        category: 'productive and irregular corpus forms',
        valid: true,
        tests: [
            {term: 'receber', source: 'recebem', rule: 'v', reasons: ['present indicative']},
            {term: 'aceitar', source: 'aceitaria', rule: 'v', reasons: ['conditional']},
            {term: 'acontecer', source: 'acontecesse', rule: 'v', reasons: ['past subjunctive']},
            {term: 'descrever', source: 'descrita', rule: 'v', reasons: ['past participle']},
            {term: 'chegar', source: 'chegaremos', rule: 'v', reasons: ['future indicative']},
            {term: 'contribuir', source: 'contribuíram', rule: 'v', reasons: ['past']},
            {term: 'novo', source: 'novas', rule: 'adj', reasons: ['feminine plural adjective']},
            {term: 'muito', source: 'muitas', rule: 'det', reasons: ['feminine plural adjective']},
            {term: 'fazer', source: 'fizesse', rule: 'v', reasons: ['past subjunctive']},
            {term: 'poder', source: 'poderão', rule: 'v', reasons: ['future indicative']},
            {term: 'estar', source: 'estiver', rule: 'v', reasons: ['future subjunctive']},
            {term: 'aquele', source: 'naquela', rule: 'det', reasons: ['contraction']},
            {term: 'expor', source: 'expôs', rule: 'v', reasons: ['past']},
        ],
    },
];

const languageTransformer = new LanguageTransformer();
languageTransformer.addDescriptor(portugueseTransforms);
testLanguageTransformer(languageTransformer, tests);

describe('descriptor registration', () => {
    test('registers Portuguese transforms', () => {
        expect(languageDescriptorMap.get('pt')?.languageTransforms).toBe(portugueseTransforms);
    });
});
