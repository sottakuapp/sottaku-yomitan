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

import {
    suffixInflection as createSuffixInflection,
    wholeWordInflection as createWholeWordInflection,
} from '../language-transforms.js';

/**
 * Use an input-only condition so restored lemmas cannot be deinflected again.
 * This is especially important for replacements which themselves end in ा.
 * @param {Condition[]} conditionsIn
 * @returns {Condition[]}
 */
function getSourceConditions(conditionsIn) {
    return conditionsIn.map((condition) => `${condition}src`);
}

/**
 * @param {Condition[]} conditionsOut
 * @returns {Condition[]}
 */
function getOutputConditions(conditionsOut) {
    return conditionsOut.map((condition) => `${condition}lemma`);
}

/**
 * @param {string} inflected
 * @param {string} deinflected
 * @param {Condition[]} conditionsIn
 * @param {Condition[]} conditionsOut
 * @returns {import('language-transformer').SuffixRule<Condition>}
 */
function suffixInflection(inflected, deinflected, conditionsIn, conditionsOut) {
    return createSuffixInflection(
        inflected,
        deinflected,
        getSourceConditions(conditionsIn),
        getOutputConditions(conditionsOut),
    );
}

/**
 * @param {string} inflected
 * @param {string} deinflected
 * @param {Condition[]} conditionsIn
 * @param {Condition[]} conditionsOut
 * @returns {import('language-transformer').Rule<Condition>}
 */
function wholeWordInflection(inflected, deinflected, conditionsIn, conditionsOut) {
    return createWholeWordInflection(
        inflected,
        deinflected,
        getSourceConditions(conditionsIn),
        getOutputConditions(conditionsOut),
    );
}

const conditions = {
    n: {name: 'n', isDictionaryForm: true, subConditions: ['nsrc', 'nlemma']},
    v: {name: 'v', isDictionaryForm: true, subConditions: ['vsrc', 'vlemma']},
    adj: {name: 'adj', isDictionaryForm: true, subConditions: ['adjsrc', 'adjlemma']},
    pron: {name: 'pron', isDictionaryForm: true, subConditions: ['pronsrc', 'pronlemma']},
    det: {name: 'det', isDictionaryForm: true, subConditions: ['detsrc', 'detlemma']},
    prep: {name: 'prep', isDictionaryForm: true, subConditions: ['prepsrc', 'preplemma']},
    nsrc: {name: 'noun surface', isDictionaryForm: false},
    vsrc: {name: 'verb surface', isDictionaryForm: false},
    adjsrc: {name: 'adjective surface', isDictionaryForm: false},
    pronsrc: {name: 'pronoun surface', isDictionaryForm: false},
    detsrc: {name: 'determiner surface', isDictionaryForm: false},
    prepsrc: {name: 'preposition surface', isDictionaryForm: false},
    nlemma: {name: 'noun lemma', isDictionaryForm: false},
    vlemma: {name: 'verb lemma', isDictionaryForm: false},
    adjlemma: {name: 'adjective lemma', isDictionaryForm: false},
    pronlemma: {name: 'pronoun lemma', isDictionaryForm: false},
    detlemma: {name: 'determiner lemma', isDictionaryForm: false},
    preplemma: {name: 'preposition lemma', isDictionaryForm: false},
};

/** @typedef {keyof typeof conditions} Condition */

/** @type {import('language-transformer').LanguageTransformDescriptor<Condition>} */
export const hindiTransforms = {
    language: 'hi',
    conditions,
    transforms: {
        'direct plural': {
            name: 'direct plural',
            description: 'Direct plural form',
            rules: [
                suffixInflection('े', 'ा', ['n'], ['n']),
                suffixInflection('ें', '', ['n'], ['n']),
            ],
        },
        'oblique plural': {
            name: 'oblique plural',
            description: 'Oblique plural form',
            rules: [
                suffixInflection('ों', '', ['n'], ['n']),
                suffixInflection('ों', 'ा', ['n'], ['n']),
                suffixInflection('ओं', '', ['n'], ['n']),
                suffixInflection('ियों', 'ी', ['n'], ['n']),
                suffixInflection('इयों', 'ई', ['n'], ['n']),
            ],
        },
        'masculine oblique/plural': {
            name: 'masculine oblique/plural',
            description: 'Masculine oblique/plural form',
            rules: [
                suffixInflection('े', 'ा', ['adj'], ['adj']),
                wholeWordInflection('अपने', 'अपना', ['pron'], ['pron']),
                wholeWordInflection('मेरे', 'मेरा', ['pron'], ['pron']),
                wholeWordInflection('उसके', 'उसका', ['pron'], ['pron']),
                wholeWordInflection('नए', 'नया', ['adj'], ['adj']),
            ],
        },
        'feminine adjective': {
            name: 'feminine adjective',
            description: 'Feminine adjective form',
            rules: [
                suffixInflection('ी', 'ा', ['adj'], ['adj']),
                wholeWordInflection('नई', 'नया', ['adj'], ['adj']),
            ],
        },
        'habitual masculine singular': {
            name: 'habitual masculine singular',
            description: 'Habitual masculine singular form',
            rules: [
                suffixInflection('ता', 'ना', ['v'], ['v']),
            ],
        },
        'habitual masculine plural': {
            name: 'habitual masculine plural',
            description: 'Habitual masculine plural form',
            rules: [
                suffixInflection('ते', 'ना', ['v'], ['v']),
            ],
        },
        'habitual feminine': {
            name: 'habitual feminine',
            description: 'Habitual feminine form',
            rules: [
                suffixInflection('ती', 'ना', ['v'], ['v']),
            ],
        },
        'conjunctive': {
            name: 'conjunctive',
            description: 'Conjunctive form',
            rules: [
                suffixInflection('कर', 'ना', ['v'], ['v']),
                wholeWordInflection('कर', 'करना', ['v'], ['v']),
                wholeWordInflection('करके', 'करना', ['v'], ['v']),
            ],
        },
        'oblique infinitive': {
            name: 'oblique infinitive',
            description: 'Oblique infinitive form',
            rules: [
                suffixInflection('ने', 'ना', ['v'], ['v']),
            ],
        },
        'imperative': {
            name: 'imperative',
            description: 'Imperative form',
            rules: [
                suffixInflection('ो', 'ना', ['v'], ['v']),
                wholeWordInflection('पियो', 'पीना', ['v'], ['v']),
                suffixInflection('ओ', 'ना', ['v'], ['v']),
                wholeWordInflection('दो', 'देना', ['v'], ['v']),
                wholeWordInflection('ले', 'लेना', ['v'], ['v']),
            ],
        },
        'subjunctive': {
            name: 'subjunctive',
            description: 'Subjunctive form',
            rules: [
                suffixInflection('ें', 'ना', ['v'], ['v']),
                suffixInflection('ाएँ', 'ाना', ['v'], ['v']),
                suffixInflection('ूँ', 'ना', ['v'], ['v']),
                wholeWordInflection('हो', 'होना', ['v'], ['v']),
                wholeWordInflection('दें', 'देना', ['v'], ['v']),
                wholeWordInflection('लें', 'लेना', ['v'], ['v']),
            ],
        },
        'agreement': {
            name: 'agreement',
            description: 'Agreement form',
            rules: [
                wholeWordInflection('के', 'का', ['prep'], ['prep']),
            ],
        },
        'feminine agreement': {
            name: 'feminine agreement',
            description: 'Feminine agreement form',
            rules: [
                wholeWordInflection('की', 'का', ['prep'], ['prep']),
                wholeWordInflection('अपनी', 'अपना', ['pron'], ['pron']),
            ],
        },
        'oblique pronoun': {
            name: 'oblique pronoun',
            description: 'Oblique pronoun form',
            rules: [
                wholeWordInflection('इस', 'यह', ['pron'], ['pron']),
                wholeWordInflection('उसने', 'वह', ['pron'], ['pron']),
                wholeWordInflection('मुझे', 'मैं', ['pron'], ['pron']),
                wholeWordInflection('हमें', 'हम', ['pron'], ['pron']),
                wholeWordInflection('मैंने', 'मैं', ['pron'], ['pron']),
                wholeWordInflection('हमने', 'हम', ['pron'], ['pron']),
                wholeWordInflection('सबको', 'सब', ['pron'], ['pron']),
            ],
        },
        'present': {
            name: 'present',
            description: 'Present form',
            rules: [
                wholeWordInflection('है', 'होना', ['v'], ['v']),
            ],
        },
        'present plural': {
            name: 'present plural',
            description: 'Present plural form',
            rules: [
                wholeWordInflection('हैं', 'होना', ['v'], ['v']),
            ],
        },
        'present first person': {
            name: 'present first person',
            description: 'Present first person form',
            rules: [
                wholeWordInflection('हूँ', 'होना', ['v'], ['v']),
            ],
        },
        'past masculine singular': {
            name: 'past masculine singular',
            description: 'Past masculine singular form',
            rules: [
                wholeWordInflection('था', 'होना', ['v'], ['v']),
                wholeWordInflection('गया', 'जाना', ['v'], ['v']),
                wholeWordInflection('आया', 'आना', ['v'], ['v']),
            ],
        },
        'past feminine singular': {
            name: 'past feminine singular',
            description: 'Past feminine singular form',
            rules: [
                wholeWordInflection('थी', 'होना', ['v'], ['v']),
                wholeWordInflection('गई', 'जाना', ['v'], ['v']),
                wholeWordInflection('आई', 'आना', ['v'], ['v']),
            ],
        },
        'past masculine plural': {
            name: 'past masculine plural',
            description: 'Past masculine plural form',
            rules: [
                wholeWordInflection('थे', 'होना', ['v'], ['v']),
                wholeWordInflection('गए', 'जाना', ['v'], ['v']),
                wholeWordInflection('आए', 'आना', ['v'], ['v']),
                wholeWordInflection('हुए', 'होना', ['v'], ['v']),
                suffixInflection('े', 'ना', ['v'], ['v']),
                suffixInflection('ाए', 'ाना', ['v'], ['v']),
                wholeWordInflection('दिए', 'देना', ['v'], ['v']),
                wholeWordInflection('लिए', 'लेना', ['v'], ['v']),
            ],
        },
        'past feminine plural': {
            name: 'past feminine plural',
            description: 'Past feminine plural form',
            rules: [
                wholeWordInflection('थीं', 'होना', ['v'], ['v']),
                wholeWordInflection('कीं', 'करना', ['v'], ['v']),
                wholeWordInflection('गईं', 'जाना', ['v'], ['v']),
                wholeWordInflection('गाईं', 'गाना', ['v'], ['v']),
                wholeWordInflection('हुईं', 'होना', ['v'], ['v']),
            ],
        },
        'future': {
            name: 'future',
            description: 'Future form',
            rules: [
                wholeWordInflection('होगा', 'होना', ['v'], ['v']),
                suffixInflection('ोगे', 'ना', ['v'], ['v']),
                suffixInflection('ेगा', 'ना', ['v'], ['v']),
                wholeWordInflection('देगा', 'देना', ['v'], ['v']),
            ],
        },
        'verb stem': {
            name: 'verb stem',
            description: 'Verb stem form',
            rules: [
                wholeWordInflection('रह', 'रहना', ['v'], ['v']),
                wholeWordInflection('फैल', 'फैलना', ['v'], ['v']),
                wholeWordInflection('भर', 'भरना', ['v'], ['v']),
                wholeWordInflection('उभर', 'उभरना', ['v'], ['v']),
                wholeWordInflection('बन', 'बनना', ['v'], ['v']),
                wholeWordInflection('भीग', 'भीगना', ['v'], ['v']),
                wholeWordInflection('मच', 'मचना', ['v'], ['v']),
                wholeWordInflection('रुक', 'रुकना', ['v'], ['v']),
                wholeWordInflection('उठा', 'उठाना', ['v'], ['v']),
                wholeWordInflection('बचा', 'बचाना', ['v'], ['v']),
                wholeWordInflection('मिटा', 'मिटाना', ['v'], ['v']),
                wholeWordInflection('हिला', 'हिलाना', ['v'], ['v']),
                wholeWordInflection('रोक', 'रोकना', ['v'], ['v']),
                wholeWordInflection('लौट', 'लौटना', ['v'], ['v']),
            ],
        },
        'progressive masculine plural': {
            name: 'progressive masculine plural',
            description: 'Progressive masculine plural form',
            rules: [
                wholeWordInflection('रहे', 'रहना', ['v'], ['v']),
            ],
        },
        'perfective feminine singular': {
            name: 'perfective feminine singular',
            description: 'Perfective feminine singular form',
            rules: [
                suffixInflection('ाई', 'ाना', ['v'], ['v']),
            ],
        },
        'perfective masculine singular': {
            name: 'perfective masculine singular',
            description: 'Perfective masculine singular form',
            rules: [
                suffixInflection('ा', 'ना', ['v'], ['v']),
                suffixInflection('या', 'ना', ['v'], ['v']),
                wholeWordInflection('दिया', 'वचन देना', ['v'], ['v']),
                wholeWordInflection('निभाया', 'वचन निभाना', ['v'], ['v']),
            ],
        },
        'perfective feminine plural': {
            name: 'perfective feminine plural',
            description: 'Perfective feminine plural form',
            rules: [
                suffixInflection('ीं', 'ना', ['v'], ['v']),
            ],
        },
        'future feminine singular': {
            name: 'future feminine singular',
            description: 'Future feminine singular form',
            rules: [
                wholeWordInflection('होगी', 'होना', ['v'], ['v']),
            ],
        },
        'plural pronoun': {
            name: 'plural pronoun',
            description: 'Plural pronoun form',
            rules: [
                wholeWordInflection('वे', 'वह', ['pron'], ['pron']),
            ],
        },
    },
};
