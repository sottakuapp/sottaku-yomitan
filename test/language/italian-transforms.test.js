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

import {italianTransforms} from '../../ext/js/language/it/italian-transforms.js';
import {LanguageTransformer} from '../../ext/js/language/language-transformer.js';
import {testLanguageTransformer} from '../fixtures/language-transformer-test.js';

const tests = [
    {
        category: 'nouns',
        valid: true,
        tests: [
            {term: 'gatto', source: 'gatti', rule: 'ns', reasons: ['plural']},
            {term: 'casa', source: 'case', rule: 'ns', reasons: ['plural']},
            {term: 'banco', source: 'banchi', rule: 'ns', reasons: ['plural']},
            {term: 'amica', source: 'amiche', rule: 'ns', reasons: ['plural']},
        ],
    },
    {
        category: 'adjectives',
        valid: true,
        tests: [
            {term: 'rosso', source: 'rossa', rule: 'adj', reasons: ['feminine adjective']},
        ],
    },
    {
        category: 'verbs',
        valid: true,
        tests: [
            {term: 'parlare', source: 'parlo', rule: 'v', reasons: ['present indicative']},
            {term: 'parlare', source: 'parlando', rule: 'v', reasons: ['gerund']},
            {term: 'parlare', source: 'parlato', rule: 'v', reasons: ['past participle']},
            {term: 'leggere', source: 'leggete', rule: 'v', reasons: ['present indicative']},
            {term: 'dormire', source: 'dormono', rule: 'v', reasons: ['present indicative']},
            {term: 'essere', source: 'è', rule: 'v', reasons: ['present indicative']},
            {term: 'avere', source: 'hanno', rule: 'v', reasons: ['present indicative']},
        ],
    },
];

const languageTransformer = new LanguageTransformer();
languageTransformer.addDescriptor(italianTransforms);
testLanguageTransformer(languageTransformer, tests);
