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

import {suffixInflection, wholeWordInflection} from '../language-transforms.js';

/** @typedef {keyof typeof conditions} Condition */

const conditions = {
    n: {
        name: 'Noun',
        isDictionaryForm: true,
        subConditions: ['ns', 'np'],
    },
    np: {
        name: 'Noun plural',
        isDictionaryForm: false,
    },
    ns: {
        name: 'Noun singular',
        isDictionaryForm: false,
    },
    v: {
        name: 'Verb',
        isDictionaryForm: true,
    },
    adj: {
        name: 'Adjective',
        isDictionaryForm: true,
    },
    adv: {
        name: 'Adverb',
        isDictionaryForm: true,
    },
};

/** @type {import('language-transformer').LanguageTransformDescriptor<Condition>} */
export const italianTransforms = {
    language: 'it',
    conditions,
    transforms: {
        'plural': {
            name: 'plural',
            description: 'Plural form of a noun',
            rules: [
                suffixInflection('chi', 'co', ['np'], ['ns']),
                suffixInflection('ghi', 'go', ['np'], ['ns']),
                suffixInflection('che', 'ca', ['np'], ['ns']),
                suffixInflection('ghe', 'ga', ['np'], ['ns']),
                suffixInflection('i', 'o', ['np'], ['ns']),
                suffixInflection('e', 'a', ['np'], ['ns']),
            ],
        },
        'feminine adjective': {
            name: 'feminine adjective',
            description: 'Feminine form of an adjective',
            rules: [
                suffixInflection('a', 'o', ['adj'], ['adj']),
            ],
        },
        'present indicative': {
            name: 'present indicative',
            description: 'Present indicative form of a verb',
            rules: [
                suffixInflection('iamo', 'are', [], ['v']),
                suffixInflection('ate', 'are', [], ['v']),
                suffixInflection('ano', 'are', [], ['v']),
                suffixInflection('o', 'are', [], ['v']),
                suffixInflection('i', 'are', [], ['v']),
                suffixInflection('a', 'are', [], ['v']),

                suffixInflection('iamo', 'ere', [], ['v']),
                suffixInflection('ete', 'ere', [], ['v']),
                suffixInflection('ono', 'ere', [], ['v']),
                suffixInflection('o', 'ere', [], ['v']),
                suffixInflection('i', 'ere', [], ['v']),
                suffixInflection('e', 'ere', [], ['v']),

                suffixInflection('iamo', 'ire', [], ['v']),
                suffixInflection('ite', 'ire', [], ['v']),
                suffixInflection('ono', 'ire', [], ['v']),
                suffixInflection('o', 'ire', [], ['v']),
                suffixInflection('i', 'ire', [], ['v']),
                suffixInflection('e', 'ire', [], ['v']),

                wholeWordInflection('sono', 'essere', [], ['v']),
                wholeWordInflection('sei', 'essere', [], ['v']),
                wholeWordInflection('è', 'essere', [], ['v']),
                wholeWordInflection('siamo', 'essere', [], ['v']),
                wholeWordInflection('siete', 'essere', [], ['v']),

                wholeWordInflection('ho', 'avere', [], ['v']),
                wholeWordInflection('hai', 'avere', [], ['v']),
                wholeWordInflection('ha', 'avere', [], ['v']),
                wholeWordInflection('abbiamo', 'avere', [], ['v']),
                wholeWordInflection('avete', 'avere', [], ['v']),
                wholeWordInflection('hanno', 'avere', [], ['v']),
            ],
        },
        'gerund': {
            name: 'gerund',
            description: 'Gerund form of a verb',
            rules: [
                suffixInflection('ando', 'are', [], ['v']),
                suffixInflection('endo', 'ere', [], ['v']),
                suffixInflection('endo', 'ire', [], ['v']),
            ],
        },
        'past participle': {
            name: 'past participle',
            description: 'Past participle form of a verb',
            rules: [
                suffixInflection('ato', 'are', [], ['v']),
                suffixInflection('uto', 'ere', [], ['v']),
                suffixInflection('ito', 'ire', [], ['v']),
            ],
        },
    },
};
