/*
 * Copyright (C) 2024-2026  Yomitan Authors
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

import {
    suffixInflection as createSuffixInflection,
    wholeWordInflection as createWholeWordInflection,
} from '../language-transforms.js';

// TODO: -ne suffix (estne, nonne)?

/**
 * Latin rules resolve a surface directly to either the lemma or one of its
 * source-backed principal forms. A dedicated input-only condition prevents a
 * noun ending from being reinterpreted as a verb ending (and vice versa) on a
 * later transform pass.
 * @param {Condition[]} conditionsIn
 * @returns {Condition[]}
 */
function getSourceConditions(conditionsIn) {
    const condition = conditionsIn[0];
    if (condition.startsWith('v')) { return ['vsrc']; }
    if (condition.startsWith('n')) { return ['nsrc']; }
    if (condition.startsWith('adj')) { return ['adjsrc']; }
    if (condition.startsWith('prep')) { return ['prepsrc']; }
    return conditionsIn;
}

/**
 * @param {Condition[]} conditionsOut
 * @returns {Condition[]}
 */
function getOutputConditions(conditionsOut) {
    if (conditionsOut[0] === 'v') { return ['virr']; }
    if (conditionsOut[0] === 'prep') { return ['prepbase']; }
    return conditionsOut;
}

/**
 * @param {string} inflectedSuffix
 * @param {string} deinflectedSuffix
 * @param {Condition[]} conditionsIn
 * @param {Condition[]} conditionsOut
 * @returns {import('language-transformer').SuffixRule<Condition>}
 */
function suffixInflection(inflectedSuffix, deinflectedSuffix, conditionsIn, conditionsOut) {
    return createSuffixInflection(
        inflectedSuffix,
        deinflectedSuffix,
        getSourceConditions(conditionsIn),
        conditionsOut,
    );
}

/**
 * @param {string} inflectedWord
 * @param {string} deinflectedWord
 * @param {Condition[]} conditionsIn
 * @param {Condition[]} conditionsOut
 * @returns {import('language-transformer').Rule<Condition>}
 */
function wholeWordInflection(inflectedWord, deinflectedWord, conditionsIn, conditionsOut) {
    return createWholeWordInflection(
        inflectedWord,
        deinflectedWord,
        getSourceConditions(conditionsIn),
        getOutputConditions(conditionsOut),
    );
}

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
        conditionsIn: getSourceConditions(conditionsIn),
        conditionsOut,
        sottakuExport: {
            rule_type: 'custom',
            custom_kind: 'regex_substitution',
            custom_data: {
                match_pattern: pattern.source,
                replace_pattern: pattern.source,
                replacement: replacement.replace(/\$(\d+)/g, '\\$1'),
            },
        },
    };
}

/**
 * @param {string[]} inflectedSuffixes
 * @param {string} deinflectedSuffix
 * @param {Condition[]} conditionsIn
 * @param {Condition[]} conditionsOut
 * @returns {import('language-transformer').SuffixRule<Condition>[]}
 */
function suffixInflections(inflectedSuffixes, deinflectedSuffix, conditionsIn, conditionsOut) {
    return inflectedSuffixes.map((suffix) => (
        suffixInflection(suffix, deinflectedSuffix, conditionsIn, conditionsOut)
    ));
}

/** @typedef {keyof typeof conditions} Condition */

const conditions = {
    v: {
        name: 'Verb',
        isDictionaryForm: true,
        subConditions: [
            'v1', 'v2', 'v3', 'v3io', 'v4', 'vdep', 'vinf', 'vperf', 'vsup', 'virr', 'vsrc',
        ],
    },
    v1: {
        name: 'Verb, first conjugation',
        isDictionaryForm: false,
    },
    v2: {
        name: 'Verb, second conjugation',
        isDictionaryForm: false,
    },
    v3: {
        name: 'Verb, third conjugation',
        isDictionaryForm: false,
    },
    v3io: {
        name: 'Verb, third conjugation in -iō',
        isDictionaryForm: false,
    },
    v4: {
        name: 'Verb, fourth conjugation',
        isDictionaryForm: false,
    },
    vdep: {
        name: 'Deponent verb',
        isDictionaryForm: false,
    },
    vinf: {
        name: 'Verb, infinitive principal form',
        isDictionaryForm: false,
    },
    vperf: {
        name: 'Verb, perfect principal form',
        isDictionaryForm: false,
    },
    vsup: {
        name: 'Verb, supine principal form',
        isDictionaryForm: false,
    },
    virr: {
        name: 'Irregular verb',
        isDictionaryForm: false,
    },
    vsrc: {
        name: 'Verb surface',
        isDictionaryForm: false,
    },
    n: {
        name: 'Noun',
        isDictionaryForm: true,
        subConditions: ['ns', 'np', 'nsrc'],
    },
    ns: {
        name: 'Noun singular',
        isDictionaryForm: true,
        subConditions: ['n1s', 'n2s', 'n3s', 'n4s', 'n5s'],
    },
    np: {
        name: 'Noun plural',
        isDictionaryForm: true,
        subConditions: ['n1p', 'n2p', 'n3p', 'n4p', 'n5p'],
    },
    n1: {
        name: 'Noun, 1st declension',
        isDictionaryForm: true,
        subConditions: ['n1s', 'n1p'],
    },
    n1p: {
        name: 'Noun, 1st declension, plural',
        isDictionaryForm: true,
    },
    n1s: {
        name: 'Noun, 1st declension, singular',
        isDictionaryForm: true,
    },
    n2: {
        name: 'Noun, 2nd declension',
        isDictionaryForm: true,
        subConditions: ['n2s', 'n2p'],
    },
    n2p: {
        name: 'Noun, 2nd declension, plural',
        isDictionaryForm: true,
    },
    n2s: {
        name: 'Noun, 2nd declension, singular',
        isDictionaryForm: true,
    },
    n3: {
        name: 'Noun, 3rd declension',
        isDictionaryForm: true,
        subConditions: ['n3s', 'n3p'],
    },
    n3p: {
        name: 'Noun, 3rd declension, plural',
        isDictionaryForm: true,
    },
    n3s: {
        name: 'Noun, 3rd declension, singular',
        isDictionaryForm: true,
    },
    n4: {
        name: 'Noun, 4th declension',
        isDictionaryForm: true,
        subConditions: ['n4s', 'n4p'],
    },
    n4p: {
        name: 'Noun, 4th declension, plural',
        isDictionaryForm: true,
    },
    n4s: {
        name: 'Noun, 4th declension, singular',
        isDictionaryForm: true,
    },
    n5: {
        name: 'Noun, 5th declension',
        isDictionaryForm: true,
        subConditions: ['n5s', 'n5p'],
    },
    n5p: {
        name: 'Noun, 5th declension, plural',
        isDictionaryForm: true,
    },
    n5s: {
        name: 'Noun, 5th declension, singular',
        isDictionaryForm: true,
    },
    nsrc: {
        name: 'Noun surface',
        isDictionaryForm: false,
    },
    adj: {
        name: 'Adjective',
        isDictionaryForm: true,
        subConditions: ['adj3', 'adj12', 'adjsrc'],
    },
    adj12: {
        name: 'Adjective, 1st-2nd declension',
        isDictionaryForm: true,
    },
    adj3: {
        name: 'Adjective, 3rd declension',
        isDictionaryForm: true,
    },
    adjsrc: {
        name: 'Adjective surface',
        isDictionaryForm: false,
    },
    adv: {
        name: 'Adverb',
        isDictionaryForm: true,
    },
    pron: {
        name: 'Pronoun',
        isDictionaryForm: true,
    },
    det: {
        name: 'Determiner',
        isDictionaryForm: true,
    },
    num: {
        name: 'Number',
        isDictionaryForm: true,
    },
    prep: {
        name: 'Preposition',
        isDictionaryForm: true,
        subConditions: ['prepbase', 'prepsrc'],
    },
    prepbase: {
        name: 'Preposition base',
        isDictionaryForm: false,
    },
    prepsrc: {
        name: 'Preposition surface',
        isDictionaryForm: false,
    },
};

/** @type {import('language-transformer').LanguageTransformDescriptor<keyof typeof conditions>} */
export const latinTransforms = {
    language: 'la',
    conditions,
    transforms: {
        'nominative plural': {
            name: 'nominative plural',
            description: 'Nominative plural noun form',
            rules: [
                suffixInflection('ae', 'a', ['n1p'], ['n1s']),
                suffixInflection('i', 'us', ['n2p'], ['n2s']),
                suffixInflection('a', 'um', ['n2p'], ['n2s']),
                suffixInflection('es', 'is', ['n3p'], ['n3s']),
                suffixInflection('a', 'is', ['n3p'], ['n3s']),
                ...suffixInflections(['aces'], 'ax', ['n3p'], ['n3s']),
                ...suffixInflections(['ices'], 'ex', ['n3p'], ['n3s']),
                ...suffixInflections(['ces', 'ges'], 'x', ['n3p'], ['n3s']),
                suffixInflection('ites', 'es', ['n3p'], ['n3s']),
                suffixInflection('ua', 'u', ['n4p'], ['n4s']),
                wholeWordInflection('ii', 'is', ['pron'], ['pron']),
                wholeWordInflection('eae', 'is', ['pron'], ['pron']),
                wholeWordInflection('ea', 'is', ['pron'], ['pron']),
                wholeWordInflection('hi', 'hic', ['det'], ['det']),
                wholeWordInflection('hae', 'hic', ['det'], ['det']),
                wholeWordInflection('haec', 'hic', ['det'], ['det']),
                wholeWordInflection('duae', 'duo', ['num'], ['num']),
                wholeWordInflection('haec', 'hic', ['pron'], ['pron']),
                wholeWordInflection('haec', 'hic', ['adj'], ['adj3']),
                wholeWordInflection('alii', 'alius', ['pron'], ['pron']),
            ],
        },
        'accusative singular': {
            name: 'accusative singular',
            description: 'Accusative singular form',
            rules: [
                suffixInflection('am', 'a', ['n1s'], ['n1s']),
                suffixInflection('um', 'us', ['n2s'], ['n2s']),
                suffixInflection('um', 'i', ['n2s'], ['n2s']),
                suffixInflection('em', 'is', ['n3s'], ['n3s']),
                suffixInflection('acem', 'ax', ['n3s'], ['n3s']),
                suffixInflection('icem', 'ex', ['n3s'], ['n3s']),
                ...suffixInflections(['cem', 'gem'], 'x', ['n3s'], ['n3s']),
                suffixInflection('item', 'es', ['n3s'], ['n3s']),
                suffixInflection('etem', 'es', ['n3s'], ['n3s']),
                suffixInflection('im', 'is', ['n3s'], ['n3s']),
                suffixInflection('onem', 'o', ['n3s'], ['n3s']),
                suffixInflection('um', 'us', ['n4s'], ['n4s']),
                suffixInflection('em', 'es', ['n5s'], ['n5s']),
                suffixInflection('em', 'is', ['adj3'], ['adj3']),
                suffixInflection('entem', 'ens', ['adj3'], ['adj3']),
                suffixInflection('icem', 'ex', ['adj3'], ['adj3']),
                suffixInflection('tatem', 'tas', ['n3s'], ['n3s']),
                wholeWordInflection('vim', 'vis', ['n'], ['n3s']),
                wholeWordInflection('me', 'ego', ['pron'], ['pron']),
                wholeWordInflection('te', 'tu', ['pron'], ['pron']),
                wholeWordInflection('eum', 'is', ['pron'], ['pron']),
                wholeWordInflection('eam', 'is', ['pron'], ['pron']),
                wholeWordInflection('id', 'is', ['pron'], ['pron']),
                wholeWordInflection('hunc', 'hic', ['det'], ['det']),
                wholeWordInflection('hanc', 'hic', ['det'], ['det']),
                wholeWordInflection('hoc', 'hic', ['det'], ['det']),
                wholeWordInflection('quem', 'qui', ['pron'], ['pron']),
                wholeWordInflection('quod', 'qui', ['pron'], ['pron']),
                wholeWordInflection('illum', 'ille', ['pron'], ['pron']),
                wholeWordInflection('illam', 'ille', ['pron'], ['pron']),
                wholeWordInflection('illud', 'ille', ['pron'], ['pron']),
                wholeWordInflection('alterum', 'alter', ['pron'], ['pron']),
                wholeWordInflection('hunc', 'hic', ['pron'], ['pron']),
                wholeWordInflection('hanc', 'hic', ['pron'], ['pron']),
                wholeWordInflection('hoc', 'hic', ['pron'], ['pron']),
                wholeWordInflection('meam', 'meus', ['det'], ['det']),
                wholeWordInflection('suam', 'suus', ['det'], ['det']),
            ],
        },
        'accusative plural': {
            name: 'accusative plural',
            description: 'Accusative plural form',
            rules: [
                suffixInflection('as', 'a', ['n1p'], ['n1s']),
                suffixInflection('as', 'ae', ['n1p'], ['n1p']),
                suffixInflection('os', 'us', ['n2p'], ['n2s']),
                suffixInflection('os', 'i', ['n2p'], ['n2s']),
                suffixInflection('a', 'um', ['n2p'], ['n2s']),
                suffixInflection('es', 'is', ['n3p'], ['n3s']),
                suffixInflection('a', 'is', ['n3p'], ['n3s']),
                ...suffixInflections(['aces'], 'ax', ['n3p'], ['n3s']),
                ...suffixInflections(['ices'], 'ex', ['n3p'], ['n3s']),
                ...suffixInflections(['ces', 'ges'], 'x', ['n3p'], ['n3s']),
                suffixInflection('ites', 'es', ['n3p'], ['n3s']),
                suffixInflection('ua', 'u', ['n4p'], ['n4s']),
                wholeWordInflection('vires', 'vis', ['n'], ['n3s']),
                wholeWordInflection('eos', 'is', ['pron'], ['pron']),
                wholeWordInflection('eas', 'is', ['pron'], ['pron']),
                wholeWordInflection('ea', 'is', ['pron'], ['pron']),
                wholeWordInflection('hos', 'hic', ['det'], ['det']),
                wholeWordInflection('has', 'hic', ['det'], ['det']),
                wholeWordInflection('haec', 'hic', ['det'], ['det']),
                wholeWordInflection('quos', 'qui', ['pron'], ['pron']),
                wholeWordInflection('quas', 'qui', ['pron'], ['pron']),
                wholeWordInflection('illos', 'ille', ['pron'], ['pron']),
                wholeWordInflection('illas', 'ille', ['pron'], ['pron']),
                wholeWordInflection('illa', 'ille', ['pron'], ['pron']),
                wholeWordInflection('duos', 'duo', ['num'], ['num']),
                wholeWordInflection('duas', 'duo', ['num'], ['num']),
                wholeWordInflection('haec', 'hic', ['pron'], ['pron']),
                wholeWordInflection('haec', 'hic', ['adj'], ['adj3']),
                wholeWordInflection('suos', 'suus', ['det'], ['det']),
            ],
        },
        'genitive singular': {
            name: 'genitive singular',
            description: 'Genitive singular form',
            rules: [
                suffixInflection('ae', 'a', ['n1s'], ['n1s']),
                suffixInflection('i', 'us', ['n2s'], ['n2s']),
                suffixInflection('i', 'um', ['n2s'], ['n2s']),
                suffixInflection('ei', 'es', ['n5s'], ['n5s']),
                ...suffixInflections(['cis', 'gis'], 'x', ['n3s'], ['n3s']),
                suffixInflection('icis', 'ex', ['n3s'], ['n3s']),
                suffixInflection('onis', 'o', ['n3s'], ['n3s']),
                suffixInflection('tatis', 'tas', ['n3s'], ['n3s']),
                wholeWordInflection('mei', 'ego', ['pron'], ['pron']),
                wholeWordInflection('tui', 'tu', ['pron'], ['pron']),
                wholeWordInflection('eius', 'is', ['pron'], ['pron']),
                wholeWordInflection('huius', 'hic', ['det'], ['det']),
                wholeWordInflection('cuius', 'qui', ['pron'], ['pron']),
                wholeWordInflection('illius', 'ille', ['pron'], ['pron']),
                wholeWordInflection('illius', 'ille', ['det'], ['det']),
                wholeWordInflection('mei', 'meus', ['det'], ['det']),
            ],
        },
        'genitive plural': {
            name: 'genitive plural',
            description: 'Genitive plural form',
            rules: [
                suffixInflection('arum', 'a', ['n1p'], ['n1s']),
                suffixInflection('orum', 'us', ['n2p'], ['n2s']),
                suffixInflection('orum', 'um', ['n2p'], ['n2s']),
                suffixInflection('ium', 'is', ['n3p'], ['n3s']),
                suffixInflection('um', 'is', ['n3p'], ['n3s']),
                suffixInflection('uum', 'us', ['n4p'], ['n4s']),
                suffixInflection('uum', 'u', ['n4p'], ['n4s']),
                suffixInflection('erum', 'es', ['n5p'], ['n5s']),
                suffixInflection('ium', 'is', ['adj3'], ['adj3']),
                suffixInflection('entium', 'ens', ['adj3'], ['adj3']),
                wholeWordInflection('virium', 'vis', ['n'], ['n3s']),
                wholeWordInflection('eorum', 'is', ['pron'], ['pron']),
                wholeWordInflection('earum', 'is', ['pron'], ['pron']),
                wholeWordInflection('horum', 'hic', ['det'], ['det']),
                wholeWordInflection('harum', 'hic', ['det'], ['det']),
                wholeWordInflection('quorum', 'qui', ['pron'], ['pron']),
                wholeWordInflection('quarum', 'qui', ['pron'], ['pron']),
                wholeWordInflection('illorum', 'ille', ['pron'], ['pron']),
                wholeWordInflection('illarum', 'ille', ['pron'], ['pron']),
                wholeWordInflection('duorum', 'duo', ['num'], ['num']),
                wholeWordInflection('duarum', 'duo', ['num'], ['num']),
            ],
        },
        'dative singular': {
            name: 'dative singular',
            description: 'Dative singular form',
            rules: [
                suffixInflection('ae', 'a', ['n1s'], ['n1s']),
                suffixInflection('o', 'us', ['n2s'], ['n2s']),
                suffixInflection('o', 'um', ['n2s'], ['n2s']),
                suffixInflection('o', 'i', ['n2s'], ['n2s']),
                suffixInflection('i', 'is', ['n3s'], ['n3s']),
                suffixInflection('ui', 'us', ['n4s'], ['n4s']),
                suffixInflection('ui', 'u', ['n4s'], ['n4s']),
                suffixInflection('ei', 'es', ['n5s'], ['n5s']),
                ...suffixInflections(['ci', 'gi'], 'x', ['n3s'], ['n3s']),
                suffixInflection('ici', 'ex', ['n3s'], ['n3s']),
                wholeWordInflection('mihi', 'ego', ['pron'], ['pron']),
                wholeWordInflection('tibi', 'tu', ['pron'], ['pron']),
                wholeWordInflection('ei', 'is', ['pron'], ['pron']),
                wholeWordInflection('huic', 'hic', ['det'], ['det']),
                wholeWordInflection('cui', 'qui', ['pron'], ['pron']),
                wholeWordInflection('illi', 'ille', ['pron'], ['pron']),
            ],
        },
        'dative plural': {
            name: 'dative plural',
            description: 'Dative plural form',
            rules: [
                suffixInflection('is', 'a', ['n1p'], ['n1s']),
                suffixInflection('is', 'ae', ['n1p'], ['n1p']),
                suffixInflection('is', 'us', ['n2p'], ['n2s']),
                suffixInflection('is', 'um', ['n2p'], ['n2s']),
                suffixInflection('is', 'i', ['n2p'], ['n2s']),
                suffixInflection('ibus', 'is', ['n3p'], ['n3s']),
                suffixInflection('ibus', 'us', ['n4p'], ['n4s']),
                suffixInflection('ibus', 'u', ['n4p'], ['n4s']),
                suffixInflection('ebus', 'es', ['n5p'], ['n5s']),
                suffixInflection('ibus', 'is', ['adj3'], ['adj3']),
                suffixInflection('entibus', 'ens', ['adj3'], ['adj3']),
                suffixInflection('itibus', 'es', ['n3p'], ['n3s']),
                wholeWordInflection('viribus', 'vis', ['n'], ['n3s']),
                wholeWordInflection('nobis', 'nos', ['pron'], ['pron']),
                wholeWordInflection('vobis', 'vos', ['pron'], ['pron']),
                wholeWordInflection('eis', 'is', ['pron'], ['pron']),
                wholeWordInflection('his', 'hic', ['det'], ['det']),
                wholeWordInflection('quibus', 'qui', ['pron'], ['pron']),
                wholeWordInflection('illis', 'ille', ['pron'], ['pron']),
                wholeWordInflection('duobus', 'duo', ['num'], ['num']),
                wholeWordInflection('duabus', 'duo', ['num'], ['num']),
                wholeWordInflection('tribus', 'tres', ['num'], ['num']),
                wholeWordInflection('meis', 'meus', ['det'], ['det']),
            ],
        },
        'ablative singular': {
            name: 'ablative singular',
            description: 'Ablative singular form',
            rules: [
                suffixInflection('o', 'us', ['n2s'], ['n2s']),
                suffixInflection('o', 'um', ['n2s'], ['n2s']),
                suffixInflection('o', 'i', ['n2s'], ['n2s']),
                suffixInflection('e', 'is', ['n3s'], ['n3s']),
                suffixInflection('i', 'is', ['n3s'], ['n3s']),
                suffixInflection('ace', 'ax', ['n3s'], ['n3s']),
                suffixInflection('ice', 'ex', ['n3s'], ['n3s']),
                ...suffixInflections(['ce', 'ge'], 'x', ['n3s'], ['n3s']),
                suffixInflection('ite', 'es', ['n3s'], ['n3s']),
                suffixInflection('lle', 'l', ['n3s'], ['n3s']),
                suffixInflection('one', 'o', ['n3s'], ['n3s']),
                suffixInflection('tate', 'tas', ['n3s'], ['n3s']),
                suffixInflection('mine', 'men', ['n3s'], ['n3s']),
                suffixInflection('u', 'us', ['n4s'], ['n4s']),
                suffixInflection('e', 'es', ['n5s'], ['n5s']),
                suffixInflection('i', 'is', ['adj3'], ['adj3']),
                ...suffixInflections(['entis', 'enti', 'ente'], 'ens', ['adj3'], ['adj3']),
                ...suffixInflections(['icis', 'ici', 'ice'], 'ex', ['adj3'], ['adj3']),
                wholeWordInflection('vi', 'vis', ['n'], ['n3s']),
                wholeWordInflection('me', 'ego', ['pron'], ['pron']),
                wholeWordInflection('te', 'tu', ['pron'], ['pron']),
                wholeWordInflection('eo', 'is', ['pron'], ['pron']),
                wholeWordInflection('ea', 'is', ['pron'], ['pron']),
                wholeWordInflection('hoc', 'hic', ['det'], ['det']),
                wholeWordInflection('hac', 'hic', ['det'], ['det']),
                wholeWordInflection('quo', 'qui', ['pron'], ['pron']),
                wholeWordInflection('qua', 'qui', ['pron'], ['pron']),
                wholeWordInflection('illo', 'ille', ['pron'], ['pron']),
                wholeWordInflection('illa', 'ille', ['pron'], ['pron']),
                wholeWordInflection('hoc', 'hic', ['pron'], ['pron']),
                wholeWordInflection('hac', 'hic', ['pron'], ['pron']),
                wholeWordInflection('hoc', 'hic', ['adj'], ['adj3']),
                wholeWordInflection('hac', 'hic', ['adj'], ['adj3']),
                wholeWordInflection('meo', 'meus', ['det'], ['det']),
            ],
        },
        'ablative plural': {
            name: 'ablative plural',
            description: 'Ablative plural form',
            rules: [
                suffixInflection('is', 'a', ['n1p'], ['n1s']),
                suffixInflection('is', 'ae', ['n1p'], ['n1p']),
                suffixInflection('is', 'us', ['n2p'], ['n2s']),
                suffixInflection('is', 'um', ['n2p'], ['n2s']),
                suffixInflection('is', 'i', ['n2p'], ['n2s']),
                suffixInflection('ibus', 'is', ['n3p'], ['n3s']),
                suffixInflection('ibus', 'us', ['n4p'], ['n4s']),
                suffixInflection('ibus', 'u', ['n4p'], ['n4s']),
                suffixInflection('ebus', 'es', ['n5p'], ['n5s']),
                suffixInflection('ibus', 'is', ['adj3'], ['adj3']),
                suffixInflection('entibus', 'ens', ['adj3'], ['adj3']),
                suffixInflection('itibus', 'es', ['n3p'], ['n3s']),
                wholeWordInflection('viribus', 'vis', ['n'], ['n3s']),
                wholeWordInflection('nobis', 'nos', ['pron'], ['pron']),
                wholeWordInflection('vobis', 'vos', ['pron'], ['pron']),
                wholeWordInflection('eis', 'is', ['pron'], ['pron']),
                wholeWordInflection('his', 'hic', ['det'], ['det']),
                wholeWordInflection('quibus', 'qui', ['pron'], ['pron']),
                wholeWordInflection('illis', 'ille', ['pron'], ['pron']),
                wholeWordInflection('duobus', 'duo', ['num'], ['num']),
                wholeWordInflection('duabus', 'duo', ['num'], ['num']),
                wholeWordInflection('tribus', 'tres', ['num'], ['num']),
                wholeWordInflection('meis', 'meus', ['det'], ['det']),
            ],
        },
        'plural': {
            name: 'plural',
            description: 'Plural declension',
            rules: [
                suffixInflection('i', 'us', ['n2p'], ['n2s']),
                suffixInflection('i', 'us', ['adj12'], ['adj12']),
                suffixInflection('e', '', ['n1p'], ['n1s']),
                suffixInflection('ae', 'a', ['adj12'], ['adj12']),
                suffixInflection('a', 'um', ['adj12'], ['adj12']),
                ...suffixInflections(['os', 'as', 'is', 'orum', 'arum'], 'us', ['adj12'], ['adj12']),
                ...suffixInflections(['i', 'ae', 'a', 'os', 'as', 'is', 'orum', 'arum'], 'um', ['adj12'], ['adj12']),
                ...suffixInflections(['es', 'ia', 'ibus', 'ium', 'um'], 'is', ['adj3'], ['adj3']),
                ...suffixInflections(['entes', 'entia', 'entium', 'entibus'], 'ens', ['adj3'], ['adj3']),
                regexInflection(
                    /^(.+[bcdfghjklmnpqstvxz])r(?:i|os|orum|is)$/,
                    '$1er',
                    ['adj12'],
                    ['adj12'],
                ),
                regexInflection(/^(.+er)(?:i|os|orum|is)$/, '$1', ['adj12'], ['adj12']),
            ],
        },
        'feminine': {
            name: 'feminine',
            description: 'Adjective form',
            rules: [
                suffixInflection('a', 'us', ['adj12'], ['adj12']),
                ...suffixInflections(['ae', 'am', 'as', 'arum'], 'us', ['adj12'], ['adj12']),
                ...suffixInflections(['a', 'ae', 'am', 'as', 'arum'], 'um', ['adj12'], ['adj12']),
                regexInflection(
                    /^(.+[bcdfghjklmnpqstvxz])r(?:a|ae|am|as|arum)$/,
                    '$1er',
                    ['adj12'],
                    ['adj12'],
                ),
                regexInflection(/^(.+er)(?:a|ae|am|as|arum)$/, '$1', ['adj12'], ['adj12']),
            ],
        },
        'neuter': {
            name: 'neuter',
            description: 'Adjective form',
            rules: [
                suffixInflection('um', 'us', ['adj12'], ['adj12']),
                suffixInflection('a', 'us', ['adj12'], ['adj12']),
                suffixInflection('e', 'is', ['adj3'], ['adj3']),
                suffixInflection('ia', 'is', ['adj3'], ['adj3']),
                regexInflection(
                    /^(.+[bcdfghjklmnpqstvxz])rum$/,
                    '$1er',
                    ['adj12'],
                    ['adj12'],
                ),
                regexInflection(/^(.+er)um$/, '$1', ['adj12'], ['adj12']),
                regexInflection(/^(.+)bre$/, '$1ber', ['adj3'], ['adj3']),
                wholeWordInflection('aliud', 'alius', ['adj'], ['adj12']),
                wholeWordInflection('maius', 'maior', ['adj'], ['adj3']),
            ],
        },
        'present indicative': {
            name: 'present indicative',
            description: 'Present active or deponent indicative form',
            rules: [
                ...suffixInflections(['as', 'at', 'amus', 'atis', 'ant'], 'o', ['v1'], ['v1']),
                ...suffixInflections(['as', 'at', 'amus', 'atis', 'ant'], 'are', ['v1'], ['vinf']),
                ...suffixInflections(['es', 'et', 'emus', 'etis', 'ent'], 'eo', ['v2'], ['v2']),
                ...suffixInflections(['es', 'et', 'emus', 'etis', 'ent'], 'ere', ['v2'], ['vinf']),
                ...suffixInflections(['is', 'it', 'imus', 'itis', 'unt'], 'o', ['v3'], ['v3']),
                ...suffixInflections(['is', 'it', 'imus', 'itis', 'unt'], 'ere', ['v3'], ['vinf']),
                ...suffixInflections(['is', 'it', 'imus', 'itis', 'iunt'], 'io', ['v3io'], ['v3io']),
                ...suffixInflections(['is', 'it', 'imus', 'itis', 'iunt'], 'ere', ['v3io'], ['vinf']),
                ...suffixInflections(['is', 'it', 'imus', 'itis', 'iunt'], 'io', ['v4'], ['v4']),
                ...suffixInflections(['is', 'it', 'imus', 'itis', 'iunt'], 'ire', ['v4'], ['vinf']),
                ...suffixInflections(['aris', 'atur', 'amur', 'amini', 'antur'], 'or', ['vdep'], ['vdep']),
                ...suffixInflections(['eris', 'etur', 'emur', 'emini', 'entur'], 'eor', ['vdep'], ['vdep']),
                ...suffixInflections(['eris', 'itur', 'imur', 'imini', 'untur'], 'or', ['vdep'], ['vdep']),
                ...suffixInflections(['iris', 'itur', 'imur', 'imini', 'iuntur'], 'ior', ['vdep'], ['vdep']),
                suffixInflection('it', 'eo', ['v'], ['virr']),
                suffixInflection('eunt', 'eo', ['v'], ['virr']),
                suffixInflection('est', 'sum', ['v'], ['virr']),
                suffixInflection('sunt', 'sum', ['v'], ['virr']),
                suffixInflection('fert', 'fero', ['v'], ['virr']),
                suffixInflection('ferunt', 'fero', ['v'], ['virr']),
                wholeWordInflection('es', 'sum', ['v'], ['v']),
                wholeWordInflection('est', 'sum', ['v'], ['v']),
                wholeWordInflection('sumus', 'sum', ['v'], ['v']),
                wholeWordInflection('estis', 'sum', ['v'], ['v']),
                wholeWordInflection('sunt', 'sum', ['v'], ['v']),
                wholeWordInflection('potes', 'possum', ['v'], ['v']),
                wholeWordInflection('potest', 'possum', ['v'], ['v']),
                wholeWordInflection('possumus', 'possum', ['v'], ['v']),
                wholeWordInflection('potestis', 'possum', ['v'], ['v']),
                wholeWordInflection('possunt', 'possum', ['v'], ['v']),
                wholeWordInflection('vis', 'volo', ['v'], ['v']),
                wholeWordInflection('vult', 'volo', ['v'], ['v']),
                wholeWordInflection('volumus', 'volo', ['v'], ['v']),
                wholeWordInflection('vultis', 'volo', ['v'], ['v']),
                wholeWordInflection('volunt', 'volo', ['v'], ['v']),
                wholeWordInflection('adest', 'adsum', ['v'], ['v']),
                wholeWordInflection('adsunt', 'adsum', ['v'], ['v']),
                wholeWordInflection('abest', 'absum', ['v'], ['v']),
                wholeWordInflection('prodest', 'prosum', ['v'], ['v']),
            ],
        },
        'present subjunctive': {
            name: 'present subjunctive',
            description: 'Present subjunctive verb form',
            rules: [
                ...suffixInflections(['em', 'es', 'et', 'emus', 'etis', 'ent'], 'o', ['v1'], ['v1']),
                ...suffixInflections(['eam', 'eas', 'eat', 'eamus', 'eatis', 'eant'], 'eo', ['v2'], ['v2']),
                ...suffixInflections(['am', 'as', 'at', 'amus', 'atis', 'ant'], 'o', ['v3'], ['v3']),
                ...suffixInflections(['iam', 'ias', 'iat', 'iamus', 'iatis', 'iant'], 'io', ['v3io'], ['v3io']),
                ...suffixInflections(['iam', 'ias', 'iat', 'iamus', 'iatis', 'iant'], 'io', ['v4'], ['v4']),
                wholeWordInflection('sim', 'sum', ['v'], ['v']),
                wholeWordInflection('sis', 'sum', ['v'], ['v']),
                wholeWordInflection('sit', 'sum', ['v'], ['v']),
                wholeWordInflection('simus', 'sum', ['v'], ['v']),
                wholeWordInflection('sitis', 'sum', ['v'], ['v']),
                wholeWordInflection('sint', 'sum', ['v'], ['v']),
                suffixInflection('ar', 'or', ['vdep'], ['vdep']),
            ],
        },
        'present passive indicative': {
            name: 'present passive indicative',
            description: 'Present passive indicative verb form',
            rules: [
                ...suffixInflections(['aris', 'atur', 'amur', 'amini', 'antur'], 'o', ['v1'], ['v1']),
                ...suffixInflections(['aris', 'atur', 'amur', 'amini', 'antur'], 'are', ['v1'], ['vinf']),
                ...suffixInflections(['eris', 'etur', 'emur', 'emini', 'entur'], 'eo', ['v2'], ['v2']),
                ...suffixInflections(['eris', 'etur', 'emur', 'emini', 'entur'], 'ere', ['v2'], ['vinf']),
                ...suffixInflections(['eris', 'itur', 'imur', 'imini', 'untur'], 'o', ['v3'], ['v3']),
                ...suffixInflections(['eris', 'itur', 'imur', 'imini', 'untur'], 'ere', ['v3'], ['vinf']),
                ...suffixInflections(['iris', 'itur', 'imur', 'imini', 'iuntur'], 'io', ['v3io'], ['v3io']),
                ...suffixInflections(['iris', 'itur', 'imur', 'imini', 'iuntur'], 'ere', ['v3io'], ['vinf']),
                ...suffixInflections(['iris', 'itur', 'imur', 'imini', 'iuntur'], 'io', ['v4'], ['v4']),
                ...suffixInflections(['iris', 'itur', 'imur', 'imini', 'iuntur'], 'ire', ['v4'], ['vinf']),
                suffixInflection('eor', 'eo', ['v2'], ['v2']),
            ],
        },
        'imperfect': {
            name: 'imperfect',
            description: 'Imperfect indicative verb form',
            rules: [
                ...suffixInflections(['iebam', 'iebas', 'iebat', 'iebamus', 'iebatis', 'iebant'], 'ire', ['v4'], ['vinf']),
                ...suffixInflections(['iebam', 'iebas', 'iebat', 'iebamus', 'iebatis', 'iebant'], 'ere', ['v3io'], ['vinf']),
                ...suffixInflections(['bam', 'bas', 'bat', 'bamus', 'batis', 'bant'], 're', ['v'], ['vinf']),
                ...suffixInflections(['abam', 'abas', 'abat', 'abamus', 'abatis', 'abant'], 'o', ['v1'], ['v1']),
                ...suffixInflections(['ebam', 'ebas', 'ebat', 'ebamus', 'ebatis', 'ebant'], 'eo', ['v2'], ['v2']),
                ...suffixInflections(['ebam', 'ebas', 'ebat', 'ebamus', 'ebatis', 'ebant'], 'o', ['v3'], ['v3']),
                ...suffixInflections(['iebam', 'iebas', 'iebat', 'iebamus', 'iebatis', 'iebant'], 'io', ['v3io'], ['v3io']),
                ...suffixInflections(['iebam', 'iebas', 'iebat', 'iebamus', 'iebatis', 'iebant'], 'io', ['v4'], ['v4']),
                ...suffixInflections(['ibam', 'ibas', 'ibat', 'ibamus', 'ibatis', 'ibant'], 'eo', ['v'], ['virr']),
                ...suffixInflections(['abatur', 'abantur'], 'o', ['v1'], ['v1']),
                ...suffixInflections(['ebatur', 'ebantur'], 'eo', ['v2'], ['v2']),
                ...suffixInflections(['ebatur', 'ebantur'], 'o', ['v3'], ['v3']),
                ...suffixInflections(['iebatur', 'iebantur'], 'io', ['v3io'], ['v3io']),
                ...suffixInflections(['iebatur', 'iebantur'], 'io', ['v4'], ['v4']),
                ...suffixInflections(['abar', 'abaris', 'abatur', 'abamur', 'abamini', 'abantur'], 'or', ['vdep'], ['vdep']),
                ...suffixInflections(['ebar', 'ebaris', 'ebatur', 'ebamur', 'ebamini', 'ebantur'], 'eor', ['vdep'], ['vdep']),
                ...suffixInflections(['ebar', 'ebaris', 'ebatur', 'ebamur', 'ebamini', 'ebantur'], 'or', ['vdep'], ['vdep']),
                ...suffixInflections(['iebar', 'iebaris', 'iebatur', 'iebamur', 'iebamini', 'iebantur'], 'ior', ['vdep'], ['vdep']),
                wholeWordInflection('eram', 'sum', ['v'], ['v']),
                wholeWordInflection('eras', 'sum', ['v'], ['v']),
                wholeWordInflection('erat', 'sum', ['v'], ['v']),
                wholeWordInflection('eramus', 'sum', ['v'], ['v']),
                wholeWordInflection('eratis', 'sum', ['v'], ['v']),
                wholeWordInflection('erant', 'sum', ['v'], ['v']),
                wholeWordInflection('aderat', 'adsum', ['v'], ['v']),
                wholeWordInflection('poteram', 'possum', ['v'], ['v']),
                wholeWordInflection('poteras', 'possum', ['v'], ['v']),
                wholeWordInflection('poterat', 'possum', ['v'], ['v']),
                wholeWordInflection('poteramus', 'possum', ['v'], ['v']),
                wholeWordInflection('poteratis', 'possum', ['v'], ['v']),
                wholeWordInflection('poterant', 'possum', ['v'], ['v']),
            ],
        },
        'imperfect subjunctive': {
            name: 'imperfect subjunctive',
            description: 'Imperfect active subjunctive verb form',
            rules: [
                ...suffixInflections(['rem', 'res', 'ret', 'remus', 'retis', 'rent'], 're', ['v'], ['vinf']),
                wholeWordInflection('essem', 'sum', ['v'], ['v']),
                wholeWordInflection('esses', 'sum', ['v'], ['v']),
                wholeWordInflection('esset', 'sum', ['v'], ['v']),
                wholeWordInflection('essemus', 'sum', ['v'], ['v']),
                wholeWordInflection('essetis', 'sum', ['v'], ['v']),
                wholeWordInflection('essent', 'sum', ['v'], ['v']),
            ],
        },
        'imperfect passive subjunctive': {
            name: 'imperfect passive subjunctive',
            description: 'Imperfect passive subjunctive verb form',
            rules: [
                ...suffixInflections(['rer', 'reris', 'retur', 'remur', 'remini', 'rentur'], 're', ['v'], ['vinf']),
            ],
        },
        'perfect': {
            name: 'perfect',
            description: 'Perfect active indicative verb form',
            rules: [
                ...suffixInflections(['isti', 'it', 'imus', 'istis', 'erunt', 'ere'], 'i', ['v'], ['vperf']),
                ...suffixInflections(['avi', 'avisti', 'avit', 'avimus', 'avistis', 'averunt'], 'o', ['v1'], ['v1']),
                ...suffixInflections(['evi', 'evisti', 'evit', 'evimus', 'evistis', 'everunt'], 'eo', ['v2'], ['v2']),
                ...suffixInflections(['ui', 'uisti', 'uit', 'uimus', 'uistis', 'uerunt'], 'eo', ['v2'], ['v2']),
                ...suffixInflections(['ui', 'uisti', 'uit', 'uimus', 'uistis', 'uerunt'], 'o', ['v1'], ['v1']),
                ...suffixInflections(['ivi', 'ivisti', 'ivit', 'ivimus', 'ivistis', 'iverunt'], 'io', ['v4'], ['v4']),
                suffixInflection('iit', 'eo', ['v'], ['virr']),
                suffixInflection('ierunt', 'eo', ['v'], ['virr']),
                wholeWordInflection('cecidit', 'cado', ['v'], ['v']),
                wholeWordInflection('cecidi', 'cado', ['v'], ['v']),
                wholeWordInflection('fui', 'sum', ['v'], ['v']),
                wholeWordInflection('fuisti', 'sum', ['v'], ['v']),
                wholeWordInflection('fuit', 'sum', ['v'], ['v']),
                wholeWordInflection('fuimus', 'sum', ['v'], ['v']),
                wholeWordInflection('fuistis', 'sum', ['v'], ['v']),
                wholeWordInflection('fuerunt', 'sum', ['v'], ['v']),
            ],
        },
        'pluperfect': {
            name: 'pluperfect',
            description: 'Pluperfect active indicative verb form',
            rules: [
                ...suffixInflections(['eram', 'eras', 'erat', 'eramus', 'eratis', 'erant'], 'i', ['v'], ['vperf']),
                wholeWordInflection('fueram', 'sum', ['v'], ['v']),
                wholeWordInflection('fueras', 'sum', ['v'], ['v']),
                wholeWordInflection('fuerat', 'sum', ['v'], ['v']),
                wholeWordInflection('fueramus', 'sum', ['v'], ['v']),
                wholeWordInflection('fueratis', 'sum', ['v'], ['v']),
                wholeWordInflection('fuerant', 'sum', ['v'], ['v']),
            ],
        },
        'future indicative': {
            name: 'future indicative',
            description: 'Future active indicative verb form',
            rules: [
                ...suffixInflections(['abo', 'abis', 'abit', 'abimus', 'abitis', 'abunt'], 'o', ['v1'], ['v1']),
                ...suffixInflections(['ebo', 'ebis', 'ebit', 'ebimus', 'ebitis', 'ebunt'], 'eo', ['v2'], ['v2']),
                ...suffixInflections(['am', 'es', 'et', 'emus', 'etis', 'ent'], 'o', ['v3'], ['v3']),
                ...suffixInflections(['iam', 'ies', 'iet', 'iemus', 'ietis', 'ient'], 'io', ['v3io'], ['v3io']),
                ...suffixInflections(['iam', 'ies', 'iet', 'iemus', 'ietis', 'ient'], 'io', ['v4'], ['v4']),
                suffixInflection('ibis', 'eo', ['v'], ['virr']),
                wholeWordInflection('ero', 'sum', ['v'], ['v']),
                wholeWordInflection('eris', 'sum', ['v'], ['v']),
                wholeWordInflection('erit', 'sum', ['v'], ['v']),
                wholeWordInflection('erimus', 'sum', ['v'], ['v']),
                wholeWordInflection('eritis', 'sum', ['v'], ['v']),
                wholeWordInflection('erunt', 'sum', ['v'], ['v']),
            ],
        },
        'future passive indicative': {
            name: 'future passive indicative',
            description: 'Future passive indicative verb form',
            rules: [
                ...suffixInflections(['abor', 'aberis', 'abitur', 'abimur', 'abimini', 'abuntur'], 'o', ['v1'], ['v1']),
                ...suffixInflections(['ebor', 'eberis', 'ebitur', 'ebimur', 'ebimini', 'ebuntur'], 'eo', ['v2'], ['v2']),
                ...suffixInflections(['ar', 'eris', 'etur', 'emur', 'emini', 'entur'], 'o', ['v3'], ['v3']),
                ...suffixInflections(['iar', 'ieris', 'ietur', 'iemur', 'iemini', 'ientur'], 'io', ['v3io'], ['v3io']),
                ...suffixInflections(['iar', 'ieris', 'ietur', 'iemur', 'iemini', 'ientur'], 'io', ['v4'], ['v4']),
            ],
        },
        'future perfect indicative': {
            name: 'future perfect indicative',
            description: 'Future perfect active indicative verb form',
            rules: [
                ...suffixInflections(['ero', 'eris', 'erit', 'erimus', 'eritis', 'erint'], 'i', ['v'], ['vperf']),
            ],
        },
        'present infinitive': {
            name: 'present infinitive',
            description: 'Present active infinitive verb form',
            rules: [
                suffixInflection('are', 'o', ['vinf'], ['v1']),
                suffixInflection('ere', 'eo', ['vinf'], ['v2']),
                suffixInflection('ere', 'o', ['vinf'], ['v3']),
                suffixInflection('ere', 'io', ['vinf'], ['v3io']),
                suffixInflection('ire', 'io', ['vinf'], ['v4']),
                suffixInflection('ire', 'eo', ['vinf'], ['virr']),
                suffixInflection('i', 'o', ['vinf'], ['v3']),
            ],
        },
        'present imperative': {
            name: 'present imperative',
            description: 'Present active imperative verb form',
            rules: [
                ...suffixInflections(['a', 'ate'], 'o', ['v1'], ['v1']),
                ...suffixInflections(['e', 'ete'], 'eo', ['v2'], ['v2']),
                ...suffixInflections(['e', 'ite'], 'o', ['v3'], ['v3']),
                ...suffixInflections(['e', 'ite'], 'io', ['v3io'], ['v3io']),
                ...suffixInflections(['i', 'ite'], 'io', ['v4'], ['v4']),
                wholeWordInflection('noli', 'nolo', ['v'], ['v']),
                wholeWordInflection('esto', 'sum', ['v'], ['v']),
                wholeWordInflection('estote', 'sum', ['v'], ['v']),
            ],
        },
        'present participle': {
            name: 'present participle',
            description: 'Present active participle form',
            rules: [
                ...suffixInflections(['ans', 'antis', 'anti', 'antem', 'ante', 'antes', 'antium', 'antibus'], 'o', ['v1'], ['v1']),
                ...suffixInflections(['ens', 'entis', 'enti', 'entem', 'ente', 'entes', 'entium', 'entibus'], 'eo', ['v2'], ['v2']),
                ...suffixInflections(['ens', 'entis', 'enti', 'entem', 'ente', 'entes', 'entium', 'entibus'], 'o', ['v3'], ['v3']),
                ...suffixInflections(['iens', 'ientis', 'ienti', 'ientem', 'iente', 'ientes', 'ientium', 'ientibus'], 'io', ['v3io'], ['v3io']),
                ...suffixInflections(['iens', 'ientis', 'ienti', 'ientem', 'iente', 'ientes', 'ientium', 'ientibus'], 'io', ['v4'], ['v4']),
            ],
        },
        'perfect participle': {
            name: 'perfect participle',
            description: 'Perfect passive or deponent participle form',
            rules: [
                ...suffixInflections(['us', 'a', 'um', 'i', 'ae', 'o', 'am', 'os', 'as', 'orum', 'arum', 'is'], 'um', ['v'], ['vsup']),
                wholeWordInflection('factum', 'facio', ['v'], ['v']),
                wholeWordInflection('vulneratus', 'vulnero', ['v'], ['v']),
                wholeWordInflection('vulneratum', 'vulnero', ['v'], ['v']),
                wholeWordInflection('conatus', 'conor', ['v'], ['v']),
                wholeWordInflection('conati', 'conor', ['v'], ['v']),
            ],
        },
        'future participle': {
            name: 'future participle',
            description: 'Future active participle form',
            rules: [
                ...suffixInflections(['urus', 'ura', 'urum', 'uri', 'urae', 'uro', 'uram', 'uros', 'uras', 'urorum', 'urarum', 'uris'], 'um', ['v'], ['vsup']),
            ],
        },
        'comparative': {
            name: 'comparative',
            description: 'Comparative adjective form',
            rules: [
                ...suffixInflections(['iorem', 'ioris', 'iori', 'iore', 'iores', 'iorum', 'ioribus'], 'ior', ['adj'], ['adj3']),
                suffixInflection('ior', 'us', ['adj'], ['adj12']),
                suffixInflection('ius', 'us', ['adj'], ['adj12']),
                wholeWordInflection('maius', 'magnus', ['adj'], ['adj12']),
            ],
        },
        'phonological variant': {
            name: 'phonological variant',
            description: 'Context-conditioned phonological form',
            rules: [
                wholeWordInflection('a', 'ab', ['prep'], ['prep']),
                wholeWordInflection('ab', 'a', ['prep'], ['prep']),
                wholeWordInflection('e', 'ex', ['prep'], ['prep']),
            ],
        },
    },
};
