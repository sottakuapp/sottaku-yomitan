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

/**
 * @param {RegExp} pattern
 * @param {string} replacement
 * @param {Condition[]} conditionsIn
 * @param {Condition[]} conditionsOut
 * @returns {import('language-transformer').Rule<Condition>}
 */
function regexInflection(pattern, replacement, conditionsIn, conditionsOut) {
    return {
        type: 'other',
        isInflected: pattern,
        deinflect: (text) => text.replace(pattern, replacement),
        conditionsIn,
        conditionsOut,
    };
}

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
    nInflected: {
        name: 'Inflected noun input',
        isDictionaryForm: false,
    },
    v: {
        name: 'Verb',
        isDictionaryForm: true,
    },
    vInflected: {
        name: 'Inflected verb input',
        isDictionaryForm: false,
    },
    pron: {
        name: 'Pronoun',
        isDictionaryForm: true,
    },
    pronInflected: {
        name: 'Inflected pronoun input',
        isDictionaryForm: false,
    },
    det: {
        name: 'Determiner',
        isDictionaryForm: true,
    },
    detInflected: {
        name: 'Inflected determiner input',
        isDictionaryForm: false,
    },
    num: {
        name: 'Number',
        isDictionaryForm: true,
    },
    numInflected: {
        name: 'Inflected number input',
        isDictionaryForm: false,
    },
    prep: {
        name: 'Preposition',
        isDictionaryForm: true,
    },
    prepInflected: {
        name: 'Inflected preposition input',
        isDictionaryForm: false,
    },
    adj: {
        name: 'Adjective',
        isDictionaryForm: true,
    },
    adjInflected: {
        name: 'Inflected adjective input',
        isDictionaryForm: false,
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
        'genitive singular': {
            name: 'genitive singular',
            description: 'Russian singular noun forms used for possession, absence, and quantity',
            rules: [
                suffixInflection('а', '', ['n'], ['n']),
                suffixInflection('а', 'о', ['n'], ['n']),
                suffixInflection('я', 'ь', ['n'], ['n']),
                suffixInflection('я', 'й', ['n'], ['n']),
                suffixInflection('я', 'е', ['n'], ['n']),
                suffixInflection('ы', 'а', ['n'], ['n']),
                suffixInflection('и', 'а', ['n'], ['n']),
                suffixInflection('и', 'я', ['n'], ['n']),
                suffixInflection('и', 'ь', ['n'], ['n']),
                suffixInflection('и', 'й', ['n'], ['n']),
                suffixInflection('и', 'е', ['n'], ['n']),
                suffixInflection('мени', 'мя', ['n'], ['n']),
                wholeWordInflection('любви', 'любовь', ['n'], ['n']),
            ],
        },
        'genitive plural': {
            name: 'genitive plural',
            description: 'Russian plural noun forms used for absence, possession, and quantity',
            rules: [
                suffixInflection('ов', '', ['n'], ['n']),
                suffixInflection('ёв', 'й', ['n'], ['n']),
                suffixInflection('ев', 'й', ['n'], ['n']),
                suffixInflection('ев', 'ь', ['n'], ['n']),
                suffixInflection('ей', 'ь', ['n'], ['n']),
                suffixInflection('ей', 'й', ['n'], ['n']),
                suffixInflection('ей', 'е', ['n'], ['n']),
                suffixInflection('ей', 'ея', ['n'], ['n']),
                suffixInflection('ей', 'ья', ['n'], ['n']),
                suffixInflection('й', 'я', ['n'], ['n']),
                suffixInflection('ий', 'ия', ['n'], ['n']),
                suffixInflection('ий', 'ие', ['n'], ['n']),
                suffixInflection('мён', 'мя', ['n'], ['n']),
                suffixInflection('мен', 'мя', ['n'], ['n']),
                regexInflection(/^(.+[бвгджзклмнпрстфхцчшщ])$/, '$1а', ['n'], ['n']),
                regexInflection(/^(.+[бвгджзклмнпрстфхцчшщ])$/, '$1я', ['n'], ['n']),
            ],
        },
        'accusative singular': {
            name: 'accusative singular',
            description: 'Common Russian singular direct-object forms',
            rules: [
                suffixInflection('у', 'а', ['n'], ['n']),
                suffixInflection('ю', 'я', ['n'], ['n']),
            ],
        },
        'dative or prepositional singular': {
            name: 'dative or prepositional singular',
            description: 'Common Russian singular dative, prepositional, and locative forms',
            rules: [
                suffixInflection('е', 'а', ['n'], ['n']),
                suffixInflection('е', 'я', ['n'], ['n']),
                suffixInflection('е', 'о', ['n'], ['n']),
                suffixInflection('у', '', ['n'], ['n']),
                suffixInflection('у', 'о', ['n'], ['n']),
                suffixInflection('ю', 'ь', ['n'], ['n']),
                suffixInflection('ю', 'й', ['n'], ['n']),
                suffixInflection('и', 'ь', ['n'], ['n']),
                suffixInflection('и', 'й', ['n'], ['n']),
                suffixInflection('и', 'е', ['n'], ['n']),
                suffixInflection('мени', 'мя', ['n'], ['n']),
                wholeWordInflection('любви', 'любовь', ['n'], ['n']),
                wholeWordInflection('всём', 'всё', ['pron'], ['pron']),
                wholeWordInflection('чём', 'что', ['pron'], ['pron']),
                wholeWordInflection('нём', 'он', ['pron'], ['pron']),
                wholeWordInflection('нем', 'он', ['pron'], ['pron']),
            ],
        },
        'instrumental singular': {
            name: 'instrumental singular',
            description: 'Common Russian singular forms used for means, accompaniment, and roles',
            rules: [
                suffixInflection('ой', 'а', ['n'], ['n']),
                suffixInflection('ою', 'а', ['n'], ['n']),
                suffixInflection('ом', '', ['n'], ['n']),
                suffixInflection('ом', 'о', ['n'], ['n']),
                suffixInflection('ем', 'ь', ['n'], ['n']),
                suffixInflection('ём', 'ь', ['n'], ['n']),
                suffixInflection('ем', 'й', ['n'], ['n']),
                suffixInflection('ём', 'й', ['n'], ['n']),
                suffixInflection('менем', 'мя', ['n'], ['n']),
                wholeWordInflection('мной', 'я', ['pron'], ['pron']),
                wholeWordInflection('мною', 'я', ['pron'], ['pron']),
                wholeWordInflection('тобой', 'ты', ['pron'], ['pron']),
                wholeWordInflection('тобою', 'ты', ['pron'], ['pron']),
                wholeWordInflection('собой', 'себя', ['pron'], ['pron']),
                wholeWordInflection('собою', 'себя', ['pron'], ['pron']),
                wholeWordInflection('чем', 'что', ['pron'], ['pron']),
                wholeWordInflection('всем', 'всё', ['pron'], ['pron']),
            ],
        },
        'plural': {
            name: 'plural',
            description: 'Common Russian nominative and accusative plural forms',
            rules: [
                suffixInflection('ы', '', ['np'], ['ns']),
                suffixInflection('ы', 'а', ['np'], ['ns']),
                suffixInflection('и', '', ['np'], ['ns']),
                suffixInflection('и', 'а', ['np'], ['ns']),
                suffixInflection('и', 'я', ['np'], ['ns']),
                suffixInflection('и', 'ь', ['np'], ['ns']),
                suffixInflection('и', 'й', ['np'], ['ns']),
                suffixInflection('а', '', ['np'], ['ns']),
                suffixInflection('а', 'о', ['np'], ['ns']),
                suffixInflection('я', 'ь', ['np'], ['ns']),
                suffixInflection('я', 'й', ['np'], ['ns']),
                suffixInflection('я', 'е', ['np'], ['ns']),
                suffixInflection('ии', 'ие', ['np'], ['ns']),
                suffixInflection('мена', 'мя', ['np'], ['ns']),
            ],
        },
        'dative plural': {
            name: 'dative plural',
            rules: [
                suffixInflection('ам', '', ['n'], ['n']),
                suffixInflection('ам', 'а', ['n'], ['n']),
                suffixInflection('ам', 'о', ['n'], ['n']),
                suffixInflection('ям', 'я', ['n'], ['n']),
                suffixInflection('ям', 'ь', ['n'], ['n']),
                suffixInflection('ям', 'й', ['n'], ['n']),
                suffixInflection('менам', 'мя', ['n'], ['n']),
            ],
        },
        'instrumental plural': {
            name: 'instrumental plural',
            rules: [
                suffixInflection('ами', '', ['n'], ['n']),
                suffixInflection('ами', 'а', ['n'], ['n']),
                suffixInflection('ами', 'о', ['n'], ['n']),
                suffixInflection('ями', 'я', ['n'], ['n']),
                suffixInflection('ями', 'ь', ['n'], ['n']),
                suffixInflection('ями', 'й', ['n'], ['n']),
                suffixInflection('менами', 'мя', ['n'], ['n']),
            ],
        },
        'prepositional plural': {
            name: 'prepositional plural',
            rules: [
                suffixInflection('ах', '', ['n'], ['n']),
                suffixInflection('ах', 'а', ['n'], ['n']),
                suffixInflection('ах', 'о', ['n'], ['n']),
                suffixInflection('ях', 'я', ['n'], ['n']),
                suffixInflection('ях', 'ь', ['n'], ['n']),
                suffixInflection('ях', 'й', ['n'], ['n']),
                suffixInflection('менах', 'мя', ['n'], ['n']),
            ],
        },
        'adjective agreement': {
            name: 'adjective agreement',
            description: 'Common Russian adjective agreement forms',
            rules: [
                suffixInflection('ая', 'ый', ['adj'], ['adj']),
                suffixInflection('ое', 'ый', ['adj'], ['adj']),
                suffixInflection('ые', 'ый', ['adj'], ['adj']),
                suffixInflection('ых', 'ый', ['adj'], ['adj']),
                suffixInflection('ыми', 'ый', ['adj'], ['adj']),
                suffixInflection('ого', 'ый', ['adj'], ['adj']),
                suffixInflection('ому', 'ый', ['adj'], ['adj']),
                suffixInflection('ым', 'ый', ['adj'], ['adj']),
                suffixInflection('ой', 'ый', ['adj'], ['adj']),
                suffixInflection('ую', 'ый', ['adj'], ['adj']),
                suffixInflection('яя', 'ий', ['adj'], ['adj']),
                suffixInflection('ее', 'ий', ['adj'], ['adj']),
                suffixInflection('ие', 'ий', ['adj'], ['adj']),
                suffixInflection('их', 'ий', ['adj'], ['adj']),
                suffixInflection('ими', 'ий', ['adj'], ['adj']),
                suffixInflection('его', 'ий', ['adj'], ['adj']),
                suffixInflection('ему', 'ий', ['adj'], ['adj']),
                suffixInflection('им', 'ий', ['adj'], ['adj']),
                suffixInflection('юю', 'ий', ['adj'], ['adj']),
                suffixInflection('ая', 'ой', ['adj'], ['adj']),
                suffixInflection('ое', 'ой', ['adj'], ['adj']),
                suffixInflection('ие', 'ой', ['adj'], ['adj']),
                suffixInflection('их', 'ой', ['adj'], ['adj']),
                suffixInflection('ими', 'ой', ['adj'], ['adj']),
                suffixInflection('ого', 'ой', ['adj'], ['adj']),
                suffixInflection('ому', 'ой', ['adj'], ['adj']),
                suffixInflection('им', 'ой', ['adj'], ['adj']),
                suffixInflection('ую', 'ой', ['adj'], ['adj']),
                suffixInflection('а', 'ый', ['adj'], ['adj']),
                suffixInflection('а', 'ий', ['adj'], ['adj']),
                suffixInflection('а', 'ой', ['adj'], ['adj']),
                suffixInflection('о', 'ый', ['adj'], ['adj']),
                suffixInflection('о', 'ий', ['adj'], ['adj']),
                suffixInflection('о', 'ой', ['adj'], ['adj']),
                suffixInflection('ы', 'ый', ['adj'], ['adj']),
                suffixInflection('и', 'ый', ['adj'], ['adj']),
                suffixInflection('и', 'ий', ['adj'], ['adj']),
                suffixInflection('ены', 'енный', ['adj', 'v'], ['adj', 'v']),
                suffixInflection('ена', 'енный', ['adj', 'v'], ['adj', 'v']),
                suffixInflection('ено', 'енный', ['adj', 'v'], ['adj', 'v']),
                suffixInflection('ен', 'енный', ['adj', 'v'], ['adj', 'v']),
                suffixInflection('ёны', 'ённый', ['adj', 'v'], ['adj', 'v']),
                suffixInflection('ёна', 'ённый', ['adj', 'v'], ['adj', 'v']),
                suffixInflection('ёно', 'ённый', ['adj', 'v'], ['adj', 'v']),
                suffixInflection('ён', 'ённый', ['adj', 'v'], ['adj', 'v']),
                suffixInflection('аны', 'анный', ['adj', 'v'], ['adj', 'v']),
                suffixInflection('ана', 'анный', ['adj', 'v'], ['adj', 'v']),
                suffixInflection('ано', 'анный', ['adj', 'v'], ['adj', 'v']),
                suffixInflection('ан', 'анный', ['adj', 'v'], ['adj', 'v']),
                regexInflection(/^(.+[бвгджзклмнпрстфхцчшщ])$/, '$1ый', ['adj'], ['adj']),
                regexInflection(/^(.+[бвгджзклмнпрстфхцчшщ])$/, '$1ий', ['adj'], ['adj']),
                regexInflection(/^(.+[бвгджзклмнпрстфхцчшщ])$/, '$1ой', ['adj'], ['adj']),
                wholeWordInflection('тяжек', 'тяжкий', ['adj'], ['adj']),
                ...['моя', 'моё', 'мое', 'мои', 'моего', 'моей', 'моему', 'моим', 'мою', 'моими', 'моих'].map(
                    (surface) => wholeWordInflection(surface, 'мой', ['pron'], ['pron']),
                ),
                ...['твоя', 'твоё', 'твое', 'твои', 'твоего', 'твоей', 'твоему', 'твоим', 'твою', 'твоими', 'твоих'].map(
                    (surface) => wholeWordInflection(surface, 'твой', ['pron'], ['pron']),
                ),
                ...['своя', 'своё', 'свое', 'свои', 'своего', 'своей', 'своему', 'своим', 'свою', 'своими', 'своих'].map(
                    (surface) => wholeWordInflection(surface, 'свой', ['pron'], ['pron']),
                ),
                ...['наша', 'наше', 'наши', 'нашего', 'нашей', 'нашему', 'нашим', 'нашу', 'нашими', 'наших'].map(
                    (surface) => wholeWordInflection(surface, 'наш', ['pron'], ['pron']),
                ),
                ...['ваша', 'ваше', 'ваши', 'вашего', 'вашей', 'вашему', 'вашим', 'вашу', 'вашими', 'ваших'].map(
                    (surface) => wholeWordInflection(surface, 'ваш', ['pron'], ['pron']),
                ),
                ...['одна', 'одно', 'одни', 'одного', 'одной', 'одному', 'одним', 'одну', 'одними', 'одних'].map(
                    (surface) => wholeWordInflection(surface, 'один', ['num'], ['num']),
                ),
                ...['эта', 'это', 'эти'].map(
                    (surface) => wholeWordInflection(surface, 'этот', ['det'], ['det']),
                ),
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
                suffixInflection('ю', 'еть', ['v'], ['v']),
                suffixInflection('ишь', 'еть', ['v'], ['v']),
                suffixInflection('ит', 'еть', ['v'], ['v']),
                suffixInflection('им', 'еть', ['v'], ['v']),
                suffixInflection('ите', 'еть', ['v'], ['v']),
                suffixInflection('ят', 'еть', ['v'], ['v']),
                suffixInflection('ишь', 'ать', ['v'], ['v']),
                suffixInflection('ит', 'ать', ['v'], ['v']),
                suffixInflection('им', 'ать', ['v'], ['v']),
                suffixInflection('ите', 'ать', ['v'], ['v']),
                suffixInflection('ат', 'ать', ['v'], ['v']),
                suffixInflection('яю', 'ять', ['v'], ['v']),
                suffixInflection('яешь', 'ять', ['v'], ['v']),
                suffixInflection('яет', 'ять', ['v'], ['v']),
                suffixInflection('яем', 'ять', ['v'], ['v']),
                suffixInflection('яете', 'ять', ['v'], ['v']),
                suffixInflection('яют', 'ять', ['v'], ['v']),
                suffixInflection('ею', 'еть', ['v'], ['v']),
                suffixInflection('еешь', 'еть', ['v'], ['v']),
                suffixInflection('еет', 'еть', ['v'], ['v']),
                suffixInflection('еем', 'еть', ['v'], ['v']),
                suffixInflection('еете', 'еть', ['v'], ['v']),
                suffixInflection('еют', 'еть', ['v'], ['v']),
                suffixInflection('ую', 'овать', ['v'], ['v']),
                suffixInflection('уешь', 'овать', ['v'], ['v']),
                suffixInflection('ует', 'овать', ['v'], ['v']),
                suffixInflection('уем', 'овать', ['v'], ['v']),
                suffixInflection('уете', 'овать', ['v'], ['v']),
                suffixInflection('уют', 'овать', ['v'], ['v']),
                suffixInflection('дёт', 'сти', ['v'], ['v']),
                suffixInflection('ду', 'сти', ['v'], ['v']),
                suffixInflection('дёшь', 'сти', ['v'], ['v']),
                suffixInflection('дём', 'сти', ['v'], ['v']),
                suffixInflection('дёте', 'сти', ['v'], ['v']),
                suffixInflection('дут', 'сти', ['v'], ['v']),
                suffixInflection('могу', 'мочь', ['v'], ['v']),
                suffixInflection('можешь', 'мочь', ['v'], ['v']),
                suffixInflection('может', 'мочь', ['v'], ['v']),
                suffixInflection('можем', 'мочь', ['v'], ['v']),
                suffixInflection('можете', 'мочь', ['v'], ['v']),
                suffixInflection('могут', 'мочь', ['v'], ['v']),
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
                suffixInflection('лась', 'ться', ['v'], ['v']),
                suffixInflection('лось', 'ться', ['v'], ['v']),
                suffixInflection('лись', 'ться', ['v'], ['v']),
                suffixInflection('лся', 'ться', ['v'], ['v']),
                suffixInflection('мог', 'мочь', ['v'], ['v']),
                regexInflection(/^(.+)ш[её]л$/, '$1йти', ['v'], ['v']),
                wholeWordInflection('был', 'быть', ['v'], ['v']),
                wholeWordInflection('была', 'быть', ['v'], ['v']),
                wholeWordInflection('было', 'быть', ['v'], ['v']),
                wholeWordInflection('были', 'быть', ['v'], ['v']),
                wholeWordInflection('ошибся', 'ошибиться', ['v'], ['v']),
            ],
        },
        'future indicative': {
            name: 'future indicative',
            description: 'Russian future forms of быть',
            rules: ['буду', 'будешь', 'будет', 'будем', 'будете', 'будут'].map(
                (surface) => wholeWordInflection(surface, 'быть', ['v'], ['v']),
            ),
        },
        'imperative': {
            name: 'imperative',
            description: 'Russian command and request forms',
            rules: [
                suffixInflection('уйтесь', 'оваться', ['v'], ['v']),
                suffixInflection('ься', 'иться', ['v'], ['v']),
                suffixInflection('йся', 'яться', ['v'], ['v']),
                suffixInflection('и', 'ить', ['v'], ['v']),
                suffixInflection('и', 'еть', ['v'], ['v']),
                suffixInflection('и', 'ать', ['v'], ['v']),
                suffixInflection('ай', 'ать', ['v'], ['v']),
                suffixInflection('яй', 'ять', ['v'], ['v']),
                suffixInflection('уй', 'овать', ['v'], ['v']),
                wholeWordInflection('плачь', 'плакать', ['v'], ['v']),
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
                wholeWordInflection('всех', 'всё', ['pron'], ['pron']),
                wholeWordInflection('того', 'тот', ['pron'], ['pron']),
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
                wholeWordInflection('всем', 'всё', ['pron'], ['pron']),
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
                wholeWordInflection('меня', 'я', ['pron'], ['pron']),
                wholeWordInflection('тебя', 'ты', ['pron'], ['pron']),
                wholeWordInflection('его', 'он', ['pron'], ['pron']),
                wholeWordInflection('её', 'она', ['pron'], ['pron']),
                wholeWordInflection('ее', 'она', ['pron'], ['pron']),
                wholeWordInflection('нас', 'мы', ['pron'], ['pron']),
                wholeWordInflection('вас', 'вы', ['pron'], ['pron']),
                wholeWordInflection('их', 'они', ['pron'], ['pron']),
                wholeWordInflection('себя', 'себя', ['pron'], ['pron']),
                wholeWordInflection('всех', 'всё', ['pron'], ['pron']),
                wholeWordInflection('того', 'тот', ['pron'], ['pron']),
                wholeWordInflection('моего', 'мой', ['pron'], ['pron']),
                wholeWordInflection('твоего', 'твой', ['pron'], ['pron']),
                wholeWordInflection('своего', 'свой', ['pron'], ['pron']),
                wholeWordInflection('этого', 'этот', ['pron'], ['pron']),
            ],
        },
        'phonological variant': {
            name: 'phonological variant',
            description: 'A longer Russian function-word form used before difficult consonant clusters',
            rules: [
                wholeWordInflection('надо', 'над', ['prep'], ['prep']),
            ],
        },
    },
};

/** @type {Partial<Record<Condition, Condition>>} */
const inputConditionMap = {
    n: 'nInflected',
    np: 'nInflected',
    ns: 'nInflected',
    v: 'vInflected',
    pron: 'pronInflected',
    det: 'detInflected',
    num: 'numInflected',
    prep: 'prepInflected',
    adj: 'adjInflected',
};

// Russian rules are direct surface-to-dictionary transforms. Terminal input
// conditions prevent one successful case ending from feeding another rule.
for (const transform of Object.values(russianTransforms.transforms)) {
    for (const rule of transform.rules) {
        rule.conditionsIn = rule.conditionsIn.map((condition) => inputConditionMap[condition] ?? condition);
    }
}
