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
        sottakuExport: {
            rule_type: 'custom',
            custom_kind: 'regex_substitution',
            custom_data: {
                match_pattern: isInflected.source,
                replace_pattern: prefixPattern.source,
                replacement: '',
            },
        },
    };
}

/**
 * Build an exact reviewed mapping for a Hebrew surface whose spelling cannot
 * be recovered safely with a productive suffix rule. Inflection rules also
 * accept the `lemma` state so one attached prefix can be removed first.
 * @param {string} inflected
 * @param {string} deinflected
 * @returns {import('language-transformer').Rule<Condition>}
 */
function wholeWordInflection(inflected, deinflected) {
    const escapedInflected = inflected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return {
        type: 'wholeWord',
        isInflected: new RegExp(`^${escapedInflected}$`, 'u'),
        deinflect: () => deinflected,
        conditionsIn: ['surface', 'lemma'],
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
    name: {name: 'Proper noun', isDictionaryForm: true, subConditions: ['lemma']},
    propn: {name: 'Proper noun', isDictionaryForm: true, subConditions: ['lemma']},
    proper_noun: {name: 'Proper noun', isDictionaryForm: true, subConditions: ['lemma']},
    ['proper noun']: {name: 'Proper noun', isDictionaryForm: true, subConditions: ['lemma']},
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
        'Hebrew plural': {
            name: 'Plural',
            description: 'Recover a singular Hebrew noun from a reviewed plural surface',
            rules: [
                wholeWordInflection('אחים', 'אח'),
                wholeWordInflection('בכורים', 'בכור'),
                wholeWordInflection('חושים', 'חוש'),
                wholeWordInflection('קסמים', 'קסם'),
                wholeWordInflection('ימים', 'יום'),
                wholeWordInflection('מלאכים', 'מלאך'),
                wholeWordInflection('נשים', 'אישה'),
                wholeWordInflection('דמעות', 'דמעה'),
                wholeWordInflection('מילים', 'מילה'),
                wholeWordInflection('יונים', 'יונה'),
                wholeWordInflection('רננים', 'רנן'),
                wholeWordInflection('פאתי', 'פאה'),
                wholeWordInflection('שנות', 'שנה'),
                wholeWordInflection('אלפיים', 'אלף'),
                wholeWordInflection('ימי', 'יום'),
                wholeWordInflection('משכנות', 'משכן'),
                wholeWordInflection('מעונות', 'מעון'),
            ],
        },
        'Hebrew adjective agreement': {
            name: 'Adjective agreement',
            description: 'Recover a Hebrew adjective lemma from a reviewed gender or number form',
            rules: [
                wholeWordInflection('גדולה', 'גדול'),
                wholeWordInflection('קשים', 'קשה'),
            ],
        },
        'Hebrew possessive suffix': {
            name: 'Possessive suffix',
            description: 'Remove a reviewed Hebrew possessive suffix and restore its lemma spelling',
            rules: [
                wholeWordInflection('אלהיהם', 'אלוהים'),
                wholeWordInflection('בכוריהם', 'בכורים'),
                wholeWordInflection('ממונם', 'ממון'),
                wholeWordInflection('אמי', 'אם'),
                wholeWordInflection('נפשי', 'נפש'),
                wholeWordInflection('תקוותנו', 'תקווה'),
                wholeWordInflection('ארצנו', 'ארץ'),
                wholeWordInflection('משכנותיו', 'משכנות'),
                wholeWordInflection('מעוניו', 'מעונות'),
                wholeWordInflection('פניו', 'פנים'),
                wholeWordInflection('שוועתי', 'שוועה'),
                wholeWordInflection('קולי', 'קול'),
                wholeWordInflection('צרכנו', 'צורך'),
                wholeWordInflection('צרנו', 'צר'),
            ],
        },
        'Hebrew pronominal suffix': {
            name: 'Pronominal suffix',
            description: 'Remove a reviewed pronoun suffix from a Hebrew function word',
            rules: [
                wholeWordInflection('בתוכו', 'בתוך'),
                wholeWordInflection('דיינו', 'די'),
            ],
        },
        'Hebrew object pronoun suffix': {
            name: 'Object pronoun suffix',
            description: 'Remove a contextually reviewed Hebrew object-pronoun suffix',
            rules: [
                wholeWordInflection('האכילנו', 'האכיל'),
                wholeWordInflection('הוציאנו', 'הוציא'),
                wholeWordInflection('הכניסנו', 'הכניס'),
                wholeWordInflection('העבירנו', 'העביר'),
                wholeWordInflection('קרבנו', 'קירב'),
                wholeWordInflection('עברני', 'עבר'),
                wholeWordInflection('יובילני', 'יוביל'),
            ],
        },
        'Hebrew past': {
            name: 'Past',
            description: 'Recover a Hebrew verb lemma from a reviewed past-tense surface',
            rules: [
                wholeWordInflection('חלמתי', 'חלם'),
                wholeWordInflection('קלותי', 'קל'),
                wholeWordInflection('ריחפתי', 'ריחף'),
                wholeWordInflection('אבדה', 'אבד'),
            ],
        },
        'Hebrew future': {
            name: 'Future',
            description: 'Recover a Hebrew verb lemma from a reviewed future-tense surface',
            rules: [
                wholeWordInflection('נריע', 'הריע'),
                wholeWordInflection('ישאו', 'נשא'),
                wholeWordInflection('אקדם', 'קידם'),
                wholeWordInflection('אבוא', 'בא'),
                wholeWordInflection('תעל', 'עלה'),
                wholeWordInflection('יוביל', 'הוביל'),
                wholeWordInflection('ישמע', 'שמע'),
                wholeWordInflection('יסלח', 'סלח'),
                wholeWordInflection('יעזור', 'עזר'),
            ],
        },
        'Hebrew present participle': {
            name: 'Present participle',
            description: 'Recover a Hebrew verb lemma from a reviewed present-participle surface',
            rules: [wholeWordInflection('צופיה', 'צפה')],
        },
        'Hebrew cohortative': {
            name: 'Cohortative',
            description: 'Recover a Hebrew verb lemma from a reviewed cohortative surface',
            rules: [
                wholeWordInflection('נגילה', 'גל'),
                wholeWordInflection('נרננה', 'רינן'),
                wholeWordInflection('נשמחה', 'שמח'),
            ],
        },
        'Hebrew imperative': {
            name: 'Imperative',
            description: 'Recover a Hebrew verb lemma from a reviewed imperative surface',
            rules: [wholeWordInflection('עורו', 'ער')],
        },
        'Hebrew infinitive construct': {
            name: 'Infinitive construct',
            description: 'Recover a Hebrew verb lemma from a reviewed infinitive-construct surface',
            rules: [wholeWordInflection('שבת', 'ישב')],
        },
        'Hebrew infinitive absolute': {
            name: 'Infinitive absolute',
            description: 'Recover a Hebrew verb lemma from a reviewed infinitive-absolute surface',
            rules: [wholeWordInflection('רחוף', 'ריחף')],
        },
        'Hebrew contracted min prefix': {
            name: 'Contracted preposition',
            description: 'Restore מן from its attached מ־ form',
            rules: [wholeWordInflection('מ', 'מן')],
        },
        'Hebrew defective spelling': {
            name: 'Defective spelling',
            description: 'Restore the reviewed full Modern Hebrew spelling of a media surface',
            rules: [
                wholeWordInflection('ספק', 'סיפק'),
                wholeWordInflection('שקע', 'שיקע'),
                wholeWordInflection('קליאופטרה', 'קלאופטרה'),
            ],
        },
    },
};
