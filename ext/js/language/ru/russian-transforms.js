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
    pron: {
        name: 'Pronoun',
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
export const russianTransforms = {
    language: 'ru',
    conditions,
    transforms: {
        'noun case or plural': {
            name: 'noun case or plural',
            description: 'Common Russian noun case and plural forms',
            rules: [
                suffixInflection('ы', '', ['np'], ['ns']),
                suffixInflection('и', 'а', ['np'], ['ns']),
                suffixInflection('а', '', ['n'], ['n']),
                suffixInflection('я', 'ь', ['n'], ['n']),
                suffixInflection('у', 'а', ['n'], ['n']),
                suffixInflection('е', 'а', ['n'], ['n']),
                suffixInflection('ой', 'а', ['n'], ['n']),
                suffixInflection('ою', 'а', ['n'], ['n']),
                suffixInflection('ом', '', ['n'], ['n']),
            ],
        },
        'adjective agreement': {
            name: 'adjective agreement',
            description: 'Common Russian adjective agreement forms',
            rules: [
                suffixInflection('ая', 'ый', ['adj'], ['adj']),
                suffixInflection('ое', 'ый', ['adj'], ['adj']),
                suffixInflection('ые', 'ый', ['adj'], ['adj']),
                suffixInflection('ого', 'ый', ['adj'], ['adj']),
                suffixInflection('ому', 'ый', ['adj'], ['adj']),
                suffixInflection('ым', 'ый', ['adj'], ['adj']),
                suffixInflection('ой', 'ый', ['adj'], ['adj']),
                suffixInflection('ую', 'ый', ['adj'], ['adj']),
                suffixInflection('яя', 'ий', ['adj'], ['adj']),
                suffixInflection('ее', 'ий', ['adj'], ['adj']),
                suffixInflection('ие', 'ий', ['adj'], ['adj']),
                suffixInflection('его', 'ий', ['adj'], ['adj']),
                suffixInflection('ему', 'ий', ['adj'], ['adj']),
                suffixInflection('им', 'ий', ['adj'], ['adj']),
                suffixInflection('юю', 'ий', ['adj'], ['adj']),
            ],
        },
        'present indicative': {
            name: 'present indicative',
            description: 'Common Russian present-tense verb forms',
            rules: [
                suffixInflection('аю', 'ать', ['v'], ['v']),
                suffixInflection('аешь', 'ать', ['v'], ['v']),
                suffixInflection('ает', 'ать', ['v'], ['v']),
                suffixInflection('аем', 'ать', ['v'], ['v']),
                suffixInflection('аете', 'ать', ['v'], ['v']),
                suffixInflection('ают', 'ать', ['v'], ['v']),
                suffixInflection('ю', 'ить', ['v'], ['v']),
                suffixInflection('ишь', 'ить', ['v'], ['v']),
                suffixInflection('ит', 'ить', ['v'], ['v']),
                suffixInflection('им', 'ить', ['v'], ['v']),
                suffixInflection('ите', 'ить', ['v'], ['v']),
                suffixInflection('ят', 'ить', ['v'], ['v']),
                wholeWordInflection('есть', 'быть', ['v'], ['v']),
            ],
        },
        'past tense': {
            name: 'past tense',
            description: 'Common Russian past-tense verb forms',
            rules: [
                suffixInflection('л', 'ть', ['v'], ['v']),
                suffixInflection('ла', 'ть', ['v'], ['v']),
                suffixInflection('ло', 'ть', ['v'], ['v']),
                suffixInflection('ли', 'ть', ['v'], ['v']),
                wholeWordInflection('был', 'быть', ['v'], ['v']),
                wholeWordInflection('была', 'быть', ['v'], ['v']),
                wholeWordInflection('было', 'быть', ['v'], ['v']),
                wholeWordInflection('были', 'быть', ['v'], ['v']),
            ],
        },
        'accusative pronoun': {
            name: 'accusative pronoun',
            description: 'Common Russian direct-object pronoun forms',
            rules: [
                wholeWordInflection('меня', 'я', ['pron'], ['pron']),
                wholeWordInflection('тебя', 'ты', ['pron'], ['pron']),
                wholeWordInflection('его', 'он', ['pron'], ['pron']),
                wholeWordInflection('её', 'она', ['pron'], ['pron']),
                wholeWordInflection('ее', 'она', ['pron'], ['pron']),
                wholeWordInflection('нас', 'мы', ['pron'], ['pron']),
                wholeWordInflection('вас', 'вы', ['pron'], ['pron']),
                wholeWordInflection('их', 'они', ['pron'], ['pron']),
                wholeWordInflection('себя', 'себя', ['pron'], ['pron']),
                wholeWordInflection('мою', 'мой', ['pron'], ['pron']),
                wholeWordInflection('твою', 'твой', ['pron'], ['pron']),
                wholeWordInflection('свою', 'свой', ['pron'], ['pron']),
                wholeWordInflection('эту', 'этот', ['pron'], ['pron']),
            ],
        },
        'dative pronoun': {
            name: 'dative pronoun',
            description: 'Common Russian indirect-object pronoun forms',
            rules: [
                wholeWordInflection('мне', 'я', ['pron'], ['pron']),
                wholeWordInflection('тебе', 'ты', ['pron'], ['pron']),
                wholeWordInflection('ему', 'он', ['pron'], ['pron']),
                wholeWordInflection('ей', 'она', ['pron'], ['pron']),
                wholeWordInflection('нам', 'мы', ['pron'], ['pron']),
                wholeWordInflection('вам', 'вы', ['pron'], ['pron']),
                wholeWordInflection('им', 'они', ['pron'], ['pron']),
                wholeWordInflection('себе', 'себя', ['pron'], ['pron']),
                wholeWordInflection('моему', 'мой', ['pron'], ['pron']),
                wholeWordInflection('твоему', 'твой', ['pron'], ['pron']),
                wholeWordInflection('своему', 'свой', ['pron'], ['pron']),
                wholeWordInflection('этому', 'этот', ['pron'], ['pron']),
            ],
        },
        'genitive pronoun': {
            name: 'genitive pronoun',
            description: 'Common Russian genitive possessive-pronoun forms',
            rules: [
                wholeWordInflection('моего', 'мой', ['pron'], ['pron']),
                wholeWordInflection('твоего', 'твой', ['pron'], ['pron']),
                wholeWordInflection('своего', 'свой', ['pron'], ['pron']),
                wholeWordInflection('этого', 'этот', ['pron'], ['pron']),
            ],
        },
    },
};
