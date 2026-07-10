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
            {term: 'стол', source: 'столы', rule: 'ns', reasons: ['plural']},
            {term: 'книга', source: 'книги', rule: 'ns', reasons: ['plural']},
            {term: 'книга', source: 'книгу', rule: 'n', reasons: ['accusative singular']},
            {term: 'стол', source: 'столом', rule: 'n', reasons: ['instrumental singular']},
            {term: 'учитель', source: 'учителя', rule: 'n', reasons: ['plural']},
            {term: 'народ', source: 'народов', rule: 'n', reasons: ['genitive plural']},
            {term: 'идея', source: 'идей', rule: 'n', reasons: ['genitive plural']},
            {term: 'слеза', source: 'слез', rule: 'n', reasons: ['genitive plural']},
            {term: 'республика', source: 'республик', rule: 'n', reasons: ['genitive plural']},
            {term: 'знамя', source: 'знамени', rule: 'n', reasons: ['genitive singular']},
            {term: 'торжество', source: 'торжеству', rule: 'n', reasons: ['dative or prepositional singular']},
            {term: 'любовь', source: 'любви', rule: 'n', reasons: ['genitive singular']},
        ],
    },
    {
        category: 'adjectives',
        valid: true,
        tests: [
            {term: 'новый', source: 'новая', rule: 'adj', reasons: ['adjective agreement']},
            {term: 'новый', source: 'нового', rule: 'adj', reasons: ['adjective agreement']},
            {term: 'синий', source: 'синяя', rule: 'adj', reasons: ['adjective agreement']},
            {term: 'живой', source: 'жива', rule: 'adj', reasons: ['adjective agreement']},
            {term: 'виноватый', source: 'виноват', rule: 'adj', reasons: ['adjective agreement']},
            {term: 'верный', source: 'верны', rule: 'adj', reasons: ['adjective agreement']},
            {term: 'тяжкий', source: 'тяжек', rule: 'adj', reasons: ['adjective agreement']},
            {term: 'обиженный', source: 'обижен', rule: 'adj', reasons: ['adjective agreement']},
        ],
    },
    {
        category: 'verbs',
        valid: true,
        tests: [
            {term: 'читать', source: 'читаю', rule: 'v', reasons: ['present indicative']},
            {term: 'читать', source: 'читают', rule: 'v', reasons: ['present indicative']},
            {term: 'говорить', source: 'говорят', rule: 'v', reasons: ['present indicative']},
            {term: 'видеть', source: 'видим', rule: 'v', reasons: ['present indicative']},
            {term: 'вести', source: 'ведёт', rule: 'v', reasons: ['present indicative']},
            {term: 'мочь', source: 'могу', rule: 'v', reasons: ['present indicative']},
            {term: 'читать', source: 'читала', rule: 'v', reasons: ['past tense']},
            {term: 'говорить', source: 'говорили', rule: 'v', reasons: ['past tense']},
            {term: 'помочь', source: 'помог', rule: 'v', reasons: ['past tense']},
            {term: 'смочь', source: 'смог', rule: 'v', reasons: ['past tense']},
            {term: 'прийти', source: 'пришёл', rule: 'v', reasons: ['past tense']},
            {term: 'быть', source: 'есть', rule: 'v', reasons: ['present indicative']},
            {term: 'быть', source: 'были', rule: 'v', reasons: ['past tense']},
            {term: 'быть', source: 'будем', rule: 'v', reasons: ['future indicative']},
            {term: 'простить', source: 'прости', rule: 'v', reasons: ['imperative']},
            {term: 'полюбоваться', source: 'полюбуйтесь', rule: 'v', reasons: ['imperative']},
            {term: 'славиться', source: 'славься', rule: 'v', reasons: ['imperative']},
            {term: 'печалиться', source: 'печалься', rule: 'v', reasons: ['imperative']},
        ],
    },
    {
        category: 'pronouns',
        valid: true,
        tests: [
            {term: 'я', source: 'меня', rule: 'pron', reasons: ['accusative pronoun']},
            {term: 'я', source: 'мне', rule: 'pron', reasons: ['dative pronoun']},
            {term: 'я', source: 'мной', rule: 'pron', reasons: ['instrumental singular']},
            {term: 'он', source: 'его', rule: 'pron', reasons: ['accusative pronoun']},
            {term: 'что', source: 'чем', rule: 'pron', reasons: ['instrumental singular']},
            {term: 'себя', source: 'собой', rule: 'pron', reasons: ['instrumental singular']},
            {term: 'ты', source: 'тобой', rule: 'pron', reasons: ['instrumental singular']},
            {term: 'всё', source: 'всех', rule: 'pron', reasons: ['genitive pronoun']},
            {term: 'всё', source: 'всем', rule: 'pron', reasons: ['dative pronoun']},
            {term: 'всё', source: 'всём', rule: 'pron', reasons: ['dative or prepositional singular']},
            {term: 'тот', source: 'того', rule: 'pron', reasons: ['genitive pronoun']},
            {term: 'наш', source: 'нашей', rule: 'pron', reasons: ['adjective agreement']},
            {term: 'мой', source: 'моего', rule: 'pron', reasons: ['genitive pronoun']},
            {term: 'мой', source: 'моему', rule: 'pron', reasons: ['dative pronoun']},
            {term: 'этот', source: 'эту', rule: 'pron', reasons: ['accusative pronoun']},
        ],
    },
    {
        category: 'numbers and prepositions',
        valid: true,
        tests: [
            {term: 'один', source: 'одна', rule: 'num', reasons: ['adjective agreement']},
            {term: 'над', source: 'надо', rule: 'prep', reasons: ['phonological variant']},
        ],
    },
];

const languageTransformer = new LanguageTransformer();
languageTransformer.addDescriptor(russianTransforms);
testLanguageTransformer(languageTransformer, tests);
