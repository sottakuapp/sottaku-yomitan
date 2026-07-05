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

import {russianTransforms} from '../../ext/js/language/ru/russian-transforms.js';
import {LanguageTransformer} from '../../ext/js/language/language-transformer.js';
import {testLanguageTransformer} from '../fixtures/language-transformer-test.js';

const tests = [
    {
        category: 'nouns',
        valid: true,
        tests: [
            {term: 'стол', source: 'столы', rule: 'ns', reasons: ['noun case or plural']},
            {term: 'книга', source: 'книги', rule: 'ns', reasons: ['noun case or plural']},
            {term: 'книга', source: 'книгу', rule: 'n', reasons: ['noun case or plural']},
            {term: 'стол', source: 'столом', rule: 'n', reasons: ['noun case or plural']},
            {term: 'учитель', source: 'учителя', rule: 'n', reasons: ['noun case or plural']},
        ],
    },
    {
        category: 'adjectives',
        valid: true,
        tests: [
            {term: 'новый', source: 'новая', rule: 'adj', reasons: ['adjective agreement']},
            {term: 'новый', source: 'нового', rule: 'adj', reasons: ['adjective agreement']},
            {term: 'синий', source: 'синяя', rule: 'adj', reasons: ['adjective agreement']},
        ],
    },
    {
        category: 'verbs',
        valid: true,
        tests: [
            {term: 'читать', source: 'читаю', rule: 'v', reasons: ['present indicative']},
            {term: 'читать', source: 'читают', rule: 'v', reasons: ['present indicative']},
            {term: 'говорить', source: 'говорят', rule: 'v', reasons: ['present indicative']},
            {term: 'читать', source: 'читала', rule: 'v', reasons: ['past tense']},
            {term: 'говорить', source: 'говорили', rule: 'v', reasons: ['past tense']},
            {term: 'быть', source: 'есть', rule: 'v', reasons: ['present indicative']},
            {term: 'быть', source: 'были', rule: 'v', reasons: ['past tense']},
        ],
    },
    {
        category: 'pronouns',
        valid: true,
        tests: [
            {term: 'я', source: 'меня', rule: 'pron', reasons: ['accusative pronoun']},
            {term: 'я', source: 'мне', rule: 'pron', reasons: ['dative pronoun']},
            {term: 'он', source: 'его', rule: 'pron', reasons: ['accusative pronoun']},
            {term: 'мой', source: 'моего', rule: 'pron', reasons: ['genitive pronoun']},
            {term: 'мой', source: 'моему', rule: 'pron', reasons: ['dative pronoun']},
            {term: 'этот', source: 'эту', rule: 'pron', reasons: ['accusative pronoun']},
        ],
    },
];

const languageTransformer = new LanguageTransformer();
languageTransformer.addDescriptor(russianTransforms);
testLanguageTransformer(languageTransformer, tests);
