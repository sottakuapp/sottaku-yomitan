/*
 * Copyright (C) 2023-2026  Yomitan Authors
 * Copyright (C) 2020-2022  Yomichan Authors
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

import {latinTransforms} from '../../ext/js/language/la/latin-transforms.js';
import {LanguageTransformer} from '../../ext/js/language/language-transformer.js';
import {testLanguageTransformer} from '../fixtures/language-transformer-test.js';

/* eslint-disable @stylistic/no-multi-spaces */
const tests = [
    {
        category: 'plural',
        valid: true,
        tests: [
            {term: 'fluvius',   source: 'fluvii',    rule: 'n',   reasons: ['plural']},
            {term: 'magnus',    source: 'magni',     rule: 'adj', reasons: ['plural']},
            {term: 'insula',    source: 'insulae',   rule: 'n',   reasons: ['plural']},
        ],
    },
    {
        category: 'adjective',
        valid: true,
        tests: [
            {term: 'magnus',    source: 'magna',    rule: 'adj',  reasons: ['feminine']},
            {term: 'Graecus',   source: 'Graecum',  rule: 'adj',  reasons: ['neuter']},
            {term: 'primus',    source: 'prima',    rule: 'adj',  reasons: ['feminine']},
        ],
    },
    {
        category: 'ablative',
        valid: true,
        tests: [
            {term: 'vocabulum', source: 'vocabulo', rule: 'n',    reasons: ['ablative singular']},
        ],
    },
    {
        category: 'sum',
        valid: true,
        tests: [
            {term: 'sum', source: 'est', rule: 'v', reasons: ['present indicative']},
            {term: 'sum', source: 'sunt', rule: 'v', reasons: ['present indicative']},
            {term: 'sum', source: 'erat', rule: 'v', reasons: ['imperfect']},
            {term: 'sum', source: 'erant', rule: 'v', reasons: ['imperfect']},
            {term: 'sum', source: 'fuit', rule: 'v', reasons: ['perfect']},
            {term: 'sum', source: 'fuerant', rule: 'v', reasons: ['pluperfect']},
        ],
    },
    {
        category: 'regular verbs',
        valid: true,
        tests: [
            {term: 'amo',     source: 'amant',      rule: 'v', reasons: ['present indicative']},
            {term: 'maneo',   source: 'manet',      rule: 'v', reasons: ['present indicative']},
            {term: 'cerno',   source: 'cernunt',    rule: 'v', reasons: ['present indicative']},
            {term: 'audio',   source: 'audiunt',    rule: 'v', reasons: ['present indicative']},
            {term: 'cerno',   source: 'cernitur',   rule: 'v', reasons: ['present passive indicative']},
            {term: 'cerno',   source: 'cernere',    rule: 'v', reasons: ['present infinitive']},
            {term: 'amo',     source: 'amaverunt',  rule: 'v', reasons: ['perfect']},
        ],
    },
    {
        category: 'corpus regressions',
        valid: true,
        tests: [
            {term: 'cetus',   source: 'cetos',      rule: 'n',    reasons: ['accusative plural']},
            {term: 'iudex',   source: 'iudicem',    rule: 'n',    reasons: ['accusative singular']},
            {term: 'pulcher', source: 'pulchra',    rule: 'adj',  reasons: ['feminine']},
            {term: 'asper',   source: 'aspera',     rule: 'adj',  reasons: ['feminine']},
            {term: 'asper',   source: 'asperum',    rule: 'adj',  reasons: ['neuter']},
            {term: 'ego',     source: 'me',         rule: 'pron', reasons: ['accusative singular']},
            {term: 'adsum',   source: 'adest',      rule: 'v',    reasons: ['present indicative']},
            {term: 'alter',   source: 'alterum',    rule: 'pron', reasons: ['accusative singular']},
            {term: 'alius',   source: 'aliud',      rule: 'adj',  reasons: ['neuter']},
            {term: 'semen',   source: 'semine',     rule: 'n',    reasons: ['ablative singular']},
            {term: 'conor',   source: 'conatus',    rule: 'v',    reasons: ['perfect participle']},
            {term: 'vulnero', source: 'vulneratus', rule: 'v',    reasons: ['perfect participle']},
            {term: 'magnus',  source: 'maius',      rule: 'adj',  reasons: ['comparative']},
        ],
    },
];
/* eslint-enable @stylistic/no-multi-spaces */

const languageTransformer = new LanguageTransformer();
languageTransformer.addDescriptor(latinTransforms);

testLanguageTransformer(languageTransformer, tests);
