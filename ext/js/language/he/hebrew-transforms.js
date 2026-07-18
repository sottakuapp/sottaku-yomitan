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

const hebrewLetter = '[\u05d0-\u05ea]';
const hebrewMark = '[\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7]';
const hebrewPunctuation = "[\u05be\u05f3\u05f4'\u2019-]";
const hebrewNonLetter = `(?:${hebrewMark}|${hebrewPunctuation})`;
const hebrewOrthographicCharacter = `(?:${hebrewLetter}|${hebrewNonLetter})`;

// A single-letter prefix is highly ambiguous in unpointed Hebrew. Requiring
// three stem letters deliberately misses short lemmas in exchange for
// suppressing the broadest one- and two-letter false candidates.
const minimumStemLetterCount = 3;

/**
 * Build a one-step attached-prefix rule. Prefix niqqud is removed with the
 * prefix, while every code point in the stem is otherwise preserved.
 * @param {string} prefix
 * @returns {import('language-transformer').Rule<Condition>}
 */
function attachedPrefixInflection(prefix) {
    const attachedPrefix = `${prefix}${hebrewMark}*`;
    const minimumLetters = `(?=(?:${hebrewNonLetter}*${hebrewLetter}){${minimumStemLetterCount}})`;
    const isInflected = new RegExp(`^${attachedPrefix}${minimumLetters}${hebrewOrthographicCharacter}+$`, 'u');
    const prefixPattern = new RegExp(`^${attachedPrefix}`, 'u');
    return {
        type: 'prefix',
        isInflected,
        deinflect: (text) => text.replace(prefixPattern, ''),
        conditionsIn: ['surface'],
        conditionsOut: ['lemma'],
    };
}

/** @typedef {keyof typeof conditions} Condition */
const conditions = {
    surface: {
        name: 'Surface form with an attached prefix',
        isDictionaryForm: false,
    },
    lemma: {
        name: 'Dictionary lemma',
        isDictionaryForm: false,
    },

    // WTY uses compact Wiktionary tags while the revision-pinned Wikidata
    // adapter uses full POS names. Both families map to the same lemma flag.
    n: {name: 'Noun', isDictionaryForm: true, subConditions: ['lemma']},
    noun: {name: 'Noun', isDictionaryForm: true, subConditions: ['lemma']},
    v: {name: 'Verb', isDictionaryForm: true, subConditions: ['lemma']},
    verb: {name: 'Verb', isDictionaryForm: true, subConditions: ['lemma']},
    adj: {name: 'Adjective', isDictionaryForm: true, subConditions: ['lemma']},
    adj_noun: {name: 'Adjectival noun', isDictionaryForm: true, subConditions: ['lemma']},
    adn: {name: 'Adnominal adjective', isDictionaryForm: true, subConditions: ['lemma']},
    adjective: {name: 'Adjective', isDictionaryForm: true, subConditions: ['lemma']},
    adv: {name: 'Adverb', isDictionaryForm: true, subConditions: ['lemma']},
    adverb: {name: 'Adverb', isDictionaryForm: true, subConditions: ['lemma']},
    pron: {name: 'Pronoun', isDictionaryForm: true, subConditions: ['lemma']},
    pronoun: {name: 'Pronoun', isDictionaryForm: true, subConditions: ['lemma']},
    prep: {name: 'Preposition', isDictionaryForm: true, subConditions: ['lemma']},
    postp: {name: 'Postposition', isDictionaryForm: true, subConditions: ['lemma']},
    preposition: {name: 'Preposition', isDictionaryForm: true, subConditions: ['lemma']},
    conj: {name: 'Conjunction', isDictionaryForm: true, subConditions: ['lemma']},
    conjunction: {name: 'Conjunction', isDictionaryForm: true, subConditions: ['lemma']},
    interj: {name: 'Interjection', isDictionaryForm: true, subConditions: ['lemma']},
    interjection: {name: 'Interjection', isDictionaryForm: true, subConditions: ['lemma']},
    num: {name: 'Number', isDictionaryForm: true, subConditions: ['lemma']},
    number: {name: 'Number', isDictionaryForm: true, subConditions: ['lemma']},
    counter: {name: 'Counter', isDictionaryForm: true, subConditions: ['lemma']},
    det: {name: 'Determiner', isDictionaryForm: true, subConditions: ['lemma']},
    artic: {name: 'Article', isDictionaryForm: true, subConditions: ['lemma']},
    determiner: {name: 'Determiner', isDictionaryForm: true, subConditions: ['lemma']},
    article: {name: 'Article', isDictionaryForm: true, subConditions: ['lemma']},
    ptcl: {name: 'Particle', isDictionaryForm: true, subConditions: ['lemma']},
    particle: {name: 'Particle', isDictionaryForm: true, subConditions: ['lemma']},
    pref: {name: 'Prefix', isDictionaryForm: true, subConditions: ['lemma']},
    prefix: {name: 'Prefix', isDictionaryForm: true, subConditions: ['lemma']},
    suf: {name: 'Suffix', isDictionaryForm: true, subConditions: ['lemma']},
    suffix: {name: 'Suffix', isDictionaryForm: true, subConditions: ['lemma']},
    ['prep-phrase']: {name: 'Prepositional phrase', isDictionaryForm: true, subConditions: ['lemma']},
    phrase: {name: 'Phrase', isDictionaryForm: true, subConditions: ['lemma']},
    prov: {name: 'Expression', isDictionaryForm: true, subConditions: ['lemma']},
    expression: {name: 'Expression', isDictionaryForm: true, subConditions: ['lemma']},
    ptcpl: {name: 'Participle', isDictionaryForm: true, subConditions: ['lemma']},
    vdt: {name: 'Ditransitive verb', isDictionaryForm: true, subConditions: ['lemma']},
    vi: {name: 'Intransitive verb', isDictionaryForm: true, subConditions: ['lemma']},
    vr: {name: 'Reflexive verb', isDictionaryForm: true, subConditions: ['lemma']},
    vt: {name: 'Transitive verb', isDictionaryForm: true, subConditions: ['lemma']},
};

/** @type {import('language-transformer').LanguageTransformDescriptor<Condition>} */
export const hebrewTransforms = {
    language: 'he',
    conditions,
    transforms: {
        'Hebrew prefix definite article': {
            name: 'Attached definite article',
            description: 'Remove the Modern Hebrew definite article ה־',
            rules: [attachedPrefixInflection('ה')],
        },
        'Hebrew prefix conjunction': {
            name: 'Attached conjunction',
            description: 'Remove the attached conjunction ו־',
            rules: [attachedPrefixInflection('ו')],
        },
        'Hebrew prefix bet': {
            name: 'Attached preposition ב־',
            description: 'Remove the attached preposition ב־ (in, at, or with)',
            rules: [attachedPrefixInflection('ב')],
        },
        'Hebrew prefix kaf': {
            name: 'Attached preposition כ־',
            description: 'Remove the attached preposition כ־ (like or as)',
            rules: [attachedPrefixInflection('כ')],
        },
        'Hebrew prefix lamed': {
            name: 'Attached preposition ל־',
            description: 'Remove the attached preposition ל־ (to or for)',
            rules: [attachedPrefixInflection('ל')],
        },
        'Hebrew prefix mem': {
            name: 'Attached preposition מ־',
            description: 'Remove the attached preposition מ־ (from)',
            rules: [attachedPrefixInflection('מ')],
        },
        'Hebrew prefix shin': {
            name: 'Attached relativizer',
            description: 'Remove the attached relativizer or complementizer ש־',
            rules: [attachedPrefixInflection('ש')],
        },
    },
};
