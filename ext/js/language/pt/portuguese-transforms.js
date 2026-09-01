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
 * Keep productive endings to one pass; the restored lemma may itself end in a
 * sequence that looks inflected.
 * @param {Condition[]} conditionsIn
 * @returns {Condition[]}
 */
function getSourceConditions(conditionsIn) {
    return conditionsIn.map((condition) => {
        if (['n', 'ns', 'np'].includes(condition)) { return 'nsrc'; }
        return `${condition}src`;
    });
}

/**
 * @param {Condition[]} conditionsOut
 * @returns {Condition[]}
 */
function getOutputConditions(conditionsOut) {
    return conditionsOut.map((condition) => {
        if (['n', 'ns', 'np'].includes(condition)) { return 'nlemma'; }
        return `${condition}lemma`;
    });
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
    n: {name: 'n', isDictionaryForm: true, subConditions: ['ns', 'np', 'nsrc', 'nlemma']},
    ns: {name: 'ns', isDictionaryForm: true},
    np: {name: 'np', isDictionaryForm: false},
    v: {name: 'v', isDictionaryForm: true, subConditions: ['vsrc', 'vlemma']},
    adj: {name: 'adj', isDictionaryForm: true, subConditions: ['adjsrc', 'adjlemma']},
    adv: {name: 'adv', isDictionaryForm: true, subConditions: ['advsrc', 'advlemma']},
    pron: {name: 'pron', isDictionaryForm: true, subConditions: ['pronsrc', 'pronlemma']},
    det: {name: 'det', isDictionaryForm: true, subConditions: ['detsrc', 'detlemma']},
    prep: {name: 'prep', isDictionaryForm: true, subConditions: ['prepsrc', 'preplemma']},
    nsrc: {name: 'noun surface', isDictionaryForm: false},
    vsrc: {name: 'verb surface', isDictionaryForm: false},
    adjsrc: {name: 'adjective surface', isDictionaryForm: false},
    advsrc: {name: 'adverb surface', isDictionaryForm: false},
    pronsrc: {name: 'pronoun surface', isDictionaryForm: false},
    detsrc: {name: 'determiner surface', isDictionaryForm: false},
    prepsrc: {name: 'preposition surface', isDictionaryForm: false},
    nlemma: {name: 'noun lemma', isDictionaryForm: false},
    vlemma: {name: 'verb lemma', isDictionaryForm: false},
    adjlemma: {name: 'adjective lemma', isDictionaryForm: false},
    advlemma: {name: 'adverb lemma', isDictionaryForm: false},
    pronlemma: {name: 'pronoun lemma', isDictionaryForm: false},
    detlemma: {name: 'determiner lemma', isDictionaryForm: false},
    preplemma: {name: 'preposition lemma', isDictionaryForm: false},
};

/** @typedef {keyof typeof conditions} Condition */

/** @type {import('language-transformer').LanguageTransformDescriptor<Condition>} */
export const portugueseTransforms = {
    language: 'pt',
    conditions,
    transforms: {
        'plural': {
            name: 'plural',
            description: 'Plural form',
            rules: [
                suffixInflection('ões', 'ão', ['np'], ['ns']),
                suffixInflection('ães', 'ão', ['np'], ['ns']),
                suffixInflection('ãos', 'ão', ['np'], ['ns']),
                suffixInflection('ais', 'al', ['np'], ['ns']),
                suffixInflection('éis', 'el', ['np'], ['ns']),
                suffixInflection('eis', 'el', ['np'], ['ns']),
                suffixInflection('óis', 'ol', ['np'], ['ns']),
                suffixInflection('uis', 'ul', ['np'], ['ns']),
                suffixInflection('is', 'il', ['np'], ['ns']),
                suffixInflection('ns', 'm', ['np'], ['ns']),
                suffixInflection('zes', 'z', ['np'], ['ns']),
                suffixInflection('res', 'r', ['np'], ['ns']),
                suffixInflection('ses', 's', ['np'], ['ns']),
                suffixInflection('es', '', ['np'], ['ns']),
                suffixInflection('s', '', ['np'], ['ns']),
                suffixInflection('s', '', ['adj'], ['adj']),
                suffixInflection('eses', 'ês', ['np'], ['ns']),
                suffixInflection('eis', 'il', ['np'], ['ns']),
                wholeWordInflection('avós', 'avô', ['np'], ['ns']),
            ],
        },
        'feminine adjective': {
            name: 'feminine adjective',
            description: 'Feminine adjective form',
            rules: [
                suffixInflection('ora', 'or', ['adj'], ['adj']),
                suffixInflection('esa', 'ês', ['adj'], ['adj']),
                suffixInflection('ona', 'ão', ['adj'], ['adj']),
                suffixInflection('ã', 'ão', ['adj'], ['adj']),
                suffixInflection('a', 'o', ['adj'], ['adj']),
                wholeWordInflection('boa', 'bom', ['adj'], ['adj']),
            ],
        },
        'feminine plural adjective': {
            name: 'feminine plural adjective',
            description: 'Feminine plural form of an adjective or determiner',
            rules: [
                suffixInflection('oras', 'or', ['adj'], ['adj']),
                suffixInflection('esas', 'ês', ['adj'], ['adj']),
                suffixInflection('onas', 'ão', ['adj'], ['adj']),
                suffixInflection('ãs', 'ão', ['adj'], ['adj']),
                suffixInflection('as', 'o', ['adj'], ['adj']),
                suffixInflection('as', 'o', ['det'], ['det']),
            ],
        },
        'present indicative': {
            name: 'present indicative',
            description: 'Present indicative form',
            rules: [
                suffixInflection('amos', 'ar', ['v'], ['v']),
                suffixInflection('ais', 'ar', ['v'], ['v']),
                suffixInflection('as', 'ar', ['v'], ['v']),
                suffixInflection('am', 'ar', ['v'], ['v']),
                suffixInflection('a', 'ar', ['v'], ['v']),
                suffixInflection('emos', 'er', ['v'], ['v']),
                suffixInflection('eis', 'er', ['v'], ['v']),
                suffixInflection('es', 'er', ['v'], ['v']),
                suffixInflection('em', 'er', ['v'], ['v']),
                suffixInflection('e', 'er', ['v'], ['v']),
                suffixInflection('imos', 'ir', ['v'], ['v']),
                suffixInflection('is', 'ir', ['v'], ['v']),
                suffixInflection('es', 'ir', ['v'], ['v']),
                suffixInflection('em', 'ir', ['v'], ['v']),
                suffixInflection('e', 'ir', ['v'], ['v']),
                suffixInflection('o', 'ar', ['v'], ['v']),
                suffixInflection('o', 'er', ['v'], ['v']),
                suffixInflection('o', 'ir', ['v'], ['v']),
                wholeWordInflection('é', 'ser', ['v'], ['v']),
                wholeWordInflection('são', 'ser', ['v'], ['v']),
                wholeWordInflection('está', 'estar', ['v'], ['v']),
                wholeWordInflection('tem', 'ter', ['v'], ['v']),
                wholeWordInflection('têm', 'ter', ['v'], ['v']),
                wholeWordInflection('vai', 'ir', ['v'], ['v']),
                wholeWordInflection('vão', 'ir', ['v'], ['v']),
                wholeWordInflection('faz', 'fazer', ['v'], ['v']),
                wholeWordInflection('pode', 'poder', ['v'], ['v']),
                suffixInflection('uz', 'uzir', ['v'], ['v']),
                wholeWordInflection('reúne', 'reunir', ['v'], ['v']),
                wholeWordInflection('vou', 'ir', ['v'], ['v']),
                wholeWordInflection('vamos', 'ir', ['v'], ['v']),
                wholeWordInflection('mantém', 'manter', ['v'], ['v']),
                wholeWordInflection('dá', 'dar', ['v'], ['v']),
                wholeWordInflection('traz', 'trazer', ['v'], ['v']),
                wholeWordInflection('prefiro', 'preferir', ['v'], ['v']),
                wholeWordInflection('tenho', 'ter', ['v'], ['v']),
                wholeWordInflection('contém', 'conter', ['v'], ['v']),
                wholeWordInflection('destrói', 'destruir', ['v'], ['v']),
                wholeWordInflection('estão', 'estar', ['v'], ['v']),
                wholeWordInflection('homenageia', 'homenagear', ['v'], ['v']),
                wholeWordInflection('prevê', 'prever', ['v'], ['v']),
                wholeWordInflection('sobe', 'subir', ['v'], ['v']),
                wholeWordInflection('mantenho', 'manter', ['v'], ['v']),
                wholeWordInflection('consome', 'consumir', ['v'], ['v']),
                wholeWordInflection('constrói', 'construir', ['v'], ['v']),
                wholeWordInflection('posso', 'poder', ['v'], ['v']),
                wholeWordInflection('bloqueia', 'bloquear', ['v'], ['v']),
                wholeWordInflection('diz', 'dizer', ['v'], ['v']),
                wholeWordInflection('esqueço', 'esquecer', ['v'], ['v']),
                wholeWordInflection('faço', 'fazer', ['v'], ['v']),
                wholeWordInflection('lê', 'ler', ['v'], ['v']),
                wholeWordInflection('manuseio', 'manusear', ['v'], ['v']),
                wholeWordInflection('põe', 'pôr', ['v'], ['v']),
                wholeWordInflection('quer', 'querer', ['v'], ['v']),
                wholeWordInflection('reconstrói', 'reconstruir', ['v'], ['v']),
                wholeWordInflection('reúnem', 'reunir', ['v'], ['v']),
                wholeWordInflection('vejo', 'ver', ['v'], ['v']),
            ],
        },
        'past': {
            name: 'past',
            description: 'Past form',
            rules: [
                suffixInflection('ei', 'ar', ['v'], ['v']),
                suffixInflection('aste', 'ar', ['v'], ['v']),
                suffixInflection('ou', 'ar', ['v'], ['v']),
                suffixInflection('aram', 'ar', ['v'], ['v']),
                suffixInflection('i', 'er', ['v'], ['v']),
                suffixInflection('este', 'er', ['v'], ['v']),
                suffixInflection('eu', 'er', ['v'], ['v']),
                suffixInflection('eram', 'er', ['v'], ['v']),
                suffixInflection('i', 'ir', ['v'], ['v']),
                suffixInflection('iste', 'ir', ['v'], ['v']),
                suffixInflection('iu', 'ir', ['v'], ['v']),
                suffixInflection('iram', 'ir', ['v'], ['v']),
                wholeWordInflection('foi', 'ser', ['v'], ['v']),
                wholeWordInflection('foram', 'ser', ['v'], ['v']),
                wholeWordInflection('teve', 'ter', ['v'], ['v']),
                wholeWordInflection('fez', 'fazer', ['v'], ['v']),
                wholeWordInflection('pôde', 'poder', ['v'], ['v']),
                wholeWordInflection('trouxe', 'trazer', ['v'], ['v']),
                suffixInflection('quei', 'car', ['v'], ['v']),
                suffixInflection('guei', 'gar', ['v'], ['v']),
                wholeWordInflection('foi', 'ir', ['v'], ['v']),
                wholeWordInflection('manteve', 'manter', ['v'], ['v']),
                wholeWordInflection('deu', 'dar', ['v'], ['v']),
                wholeWordInflection('disse', 'dizer', ['v'], ['v']),
                wholeWordInflection('viu', 'ver', ['v'], ['v']),
                wholeWordInflection('vimos', 'ver', ['v'], ['v']),
                wholeWordInflection('fiz', 'fazer', ['v'], ['v']),
                wholeWordInflection('diminuíram', 'diminuir', ['v'], ['v']),
                wholeWordInflection('fizeram', 'fazer', ['v'], ['v']),
                wholeWordInflection('saí', 'sair', ['v'], ['v']),
                wholeWordInflection('fomos', 'ir', ['v'], ['v']),
                wholeWordInflection('fui', 'ser', ['v'], ['v']),
                wholeWordInflection('fui', 'ir', ['v'], ['v']),
                suffixInflection('uíram', 'uir', ['v'], ['v']),
                suffixInflection('cei', 'çar', ['v'], ['v']),
                wholeWordInflection('comecei', 'começar', ['v'], ['v']),
                wholeWordInflection('depôs', 'depor', ['v'], ['v']),
                wholeWordInflection('expôs', 'expor', ['v'], ['v']),
                wholeWordInflection('disseram', 'dizer', ['v'], ['v']),
                wholeWordInflection('esteve', 'estar', ['v'], ['v']),
                wholeWordInflection('foram', 'ir', ['v'], ['v']),
                wholeWordInflection('houve', 'haver', ['v'], ['v']),
                wholeWordInflection('interveio', 'intervir', ['v'], ['v']),
                wholeWordInflection('fizemos', 'fazer', ['v'], ['v']),
                wholeWordInflection('puderam', 'poder', ['v'], ['v']),
                wholeWordInflection('saíram', 'sair', ['v'], ['v']),
            ],
        },
        'imperfect': {
            name: 'imperfect',
            description: 'Imperfect form',
            rules: [
                suffixInflection('ava', 'ar', ['v'], ['v']),
                suffixInflection('avas', 'ar', ['v'], ['v']),
                suffixInflection('ávamos', 'ar', ['v'], ['v']),
                suffixInflection('avam', 'ar', ['v'], ['v']),
                suffixInflection('ia', 'er', ['v'], ['v']),
                suffixInflection('iam', 'er', ['v'], ['v']),
                suffixInflection('ia', 'ir', ['v'], ['v']),
                suffixInflection('iam', 'ir', ['v'], ['v']),
                wholeWordInflection('era', 'ser', ['v'], ['v']),
                wholeWordInflection('eram', 'ser', ['v'], ['v']),
                wholeWordInflection('estava', 'estar', ['v'], ['v']),
                wholeWordInflection('tinha', 'ter', ['v'], ['v']),
                wholeWordInflection('caía', 'cair', ['v'], ['v']),
                wholeWordInflection('diminuía', 'diminuir', ['v'], ['v']),
                wholeWordInflection('doíam', 'doer', ['v'], ['v']),
                wholeWordInflection('incluía', 'incluir', ['v'], ['v']),
                wholeWordInflection('tinham', 'ter', ['v'], ['v']),
                wholeWordInflection('vinha', 'vir', ['v'], ['v']),
            ],
        },
        'past participle': {
            name: 'past participle',
            description: 'Past participle form',
            rules: [
                suffixInflection('ado', 'ar', ['v'], ['v']),
                suffixInflection('ido', 'er', ['v'], ['v']),
                suffixInflection('ido', 'ir', ['v'], ['v']),
                suffixInflection('ada', 'ar', ['v'], ['v']),
                suffixInflection('adas', 'ar', ['v'], ['v']),
                suffixInflection('ados', 'ar', ['v'], ['v']),
                suffixInflection('ida', 'er', ['v'], ['v']),
                suffixInflection('idas', 'ir', ['v'], ['v']),
                wholeWordInflection('atribuída', 'atribuir', ['v'], ['v']),
                wholeWordInflection('descoberto', 'descobrir', ['v'], ['v']),
                wholeWordInflection('descrito', 'descrever', ['v'], ['v']),
                wholeWordInflection('descrita', 'descrever', ['v'], ['v']),
                wholeWordInflection('divididos', 'dividir', ['v'], ['v']),
                wholeWordInflection('escolhidas', 'escolher', ['v'], ['v']),
                wholeWordInflection('exigida', 'exigir', ['v'], ['v']),
                wholeWordInflection('feita', 'fazer', ['v'], ['v']),
                wholeWordInflection('prevista', 'prever', ['v'], ['v']),
                wholeWordInflection('proposta', 'propor', ['v'], ['v']),
                wholeWordInflection('transmitida', 'transmitir', ['v'], ['v']),
            ],
        },
        'gerund': {
            name: 'gerund',
            description: 'Gerund form',
            rules: [
                suffixInflection('ando', 'ar', ['v'], ['v']),
                suffixInflection('endo', 'er', ['v'], ['v']),
                suffixInflection('indo', 'ir', ['v'], ['v']),
            ],
        },
        'agreement': {
            name: 'agreement',
            description: 'Agreement form',
            rules: [
                wholeWordInflection('os', 'o', ['det'], ['det']),
                wholeWordInflection('as', 'a', ['det'], ['det']),
                wholeWordInflection('aquela', 'aquele', ['det'], ['det']),
                wholeWordInflection('as', 'os', ['det'], ['det']),
            ],
        },
        'feminine agreement': {
            name: 'feminine agreement',
            description: 'Feminine agreement form',
            rules: [
                wholeWordInflection('uma', 'um', ['det'], ['det']),
                wholeWordInflection('sua', 'seu', ['pron'], ['pron']),
                wholeWordInflection('esta', 'este', ['det'], ['det']),
                wholeWordInflection('minha', 'meu', ['pron'], ['pron']),
            ],
        },
        'plural agreement': {
            name: 'plural agreement',
            description: 'Plural agreement form',
            rules: [
                wholeWordInflection('uns', 'um', ['det'], ['det']),
            ],
        },
        'feminine plural agreement': {
            name: 'feminine plural agreement',
            description: 'Feminine plural agreement form',
            rules: [
                wholeWordInflection('umas', 'um', ['det'], ['det']),
                wholeWordInflection('suas', 'seu', ['pron'], ['pron']),
                wholeWordInflection('minhas', 'meu', ['pron'], ['pron']),
                wholeWordInflection('boas', 'bom', ['adj'], ['adj']),
                wholeWordInflection('europeias', 'europeu', ['adj'], ['adj']),
            ],
        },
        'past subjunctive': {
            name: 'past subjunctive',
            description: 'Past subjunctive form',
            rules: [
                suffixInflection('asse', 'ar', ['v'], ['v']),
                suffixInflection('assem', 'ar', ['v'], ['v']),
                suffixInflection('esse', 'er', ['v'], ['v']),
                suffixInflection('isse', 'ir', ['v'], ['v']),
                wholeWordInflection('escolhessem', 'escolher', ['v'], ['v']),
                wholeWordInflection('estivesse', 'estar', ['v'], ['v']),
                wholeWordInflection('fizesse', 'fazer', ['v'], ['v']),
                wholeWordInflection('houvesse', 'haver', ['v'], ['v']),
                wholeWordInflection('mantivesse', 'manter', ['v'], ['v']),
                wholeWordInflection('trouxesse', 'trazer', ['v'], ['v']),
            ],
        },
        'future indicative': {
            name: 'future indicative',
            description: 'Future indicative form',
            rules: [
                wholeWordInflection('será', 'ser', ['v'], ['v']),
                wholeWordInflection('ficará', 'ficar', ['v'], ['v']),
                wholeWordInflection('ficaremos', 'ficar', ['v'], ['v']),
                wholeWordInflection('terá', 'ter', ['v'], ['v']),
                suffixInflection('ará', 'ar', ['v'], ['v']),
                suffixInflection('erá', 'er', ['v'], ['v']),
                suffixInflection('irá', 'ir', ['v'], ['v']),
                suffixInflection('aremos', 'ar', ['v'], ['v']),
                suffixInflection('eremos', 'er', ['v'], ['v']),
                suffixInflection('iremos', 'ir', ['v'], ['v']),
                wholeWordInflection('poderão', 'poder', ['v'], ['v']),
                wholeWordInflection('serão', 'ser', ['v'], ['v']),
            ],
        },
        'present subjunctive': {
            name: 'present subjunctive',
            description: 'Present subjunctive form',
            rules: [
                wholeWordInflection('seja', 'ser', ['v'], ['v']),
                wholeWordInflection('comece', 'começar', ['v'], ['v']),
                wholeWordInflection('faça', 'fazer', ['v'], ['v']),
                wholeWordInflection('compare', 'comparar', ['v'], ['v']),
                wholeWordInflection('tente', 'tentar', ['v'], ['v']),
                suffixInflection('em', 'ar', ['v'], ['v']),
                suffixInflection('a', 'er', ['v'], ['v']),
                suffixInflection('a', 'ir', ['v'], ['v']),
                suffixInflection('am', 'er', ['v'], ['v']),
                suffixInflection('am', 'ir', ['v'], ['v']),
                suffixInflection('arem', 'ar', ['v'], ['v']),
                suffixInflection('erem', 'er', ['v'], ['v']),
                suffixInflection('irem', 'ir', ['v'], ['v']),
                suffixInflection('armos', 'ar', ['v'], ['v']),
                suffixInflection('ermos', 'er', ['v'], ['v']),
                suffixInflection('irmos', 'ir', ['v'], ['v']),
                wholeWordInflection('consiga', 'conseguir', ['v'], ['v']),
                wholeWordInflection('dê', 'dar', ['v'], ['v']),
                wholeWordInflection('possam', 'poder', ['v'], ['v']),
                wholeWordInflection('tenha', 'ter', ['v'], ['v']),
            ],
        },
        'imperative': {
            name: 'imperative',
            description: 'Imperative form',
            rules: [
                wholeWordInflection('leve', 'levar', ['v'], ['v']),
                wholeWordInflection('pare', 'parar', ['v'], ['v']),
                wholeWordInflection('leia', 'ler', ['v'], ['v']),
                suffixInflection('e', 'ar', ['v'], ['v']),
                wholeWordInflection('escreva', 'escrever', ['v'], ['v']),
                wholeWordInflection('ouça', 'ouvir', ['v'], ['v']),
                wholeWordInflection('preencha', 'preencher', ['v'], ['v']),
                wholeWordInflection('venha', 'vir', ['v'], ['v']),
                wholeWordInflection('confira', 'conferir', ['v'], ['v']),
                wholeWordInflection('entregue', 'entregar', ['v'], ['v']),
                wholeWordInflection('pratique', 'praticar', ['v'], ['v']),
            ],
        },
        'future subjunctive': {
            name: 'future subjunctive',
            description: 'Future subjunctive form',
            rules: [
                wholeWordInflection('estiver', 'estar', ['v'], ['v']),
                wholeWordInflection('virem', 'ver', ['v'], ['v']),
            ],
        },
        'contraction': {
            name: 'contraction',
            description: 'Contracted preposition and determiner',
            rules: [wholeWordInflection('naquela', 'aquele', ['det'], ['det'])],
        },
        'feminine': {
            name: 'feminine',
            description: 'Feminine form',
            rules: [
                wholeWordInflection('duas', 'dois', ['adj'], ['adj']),
            ],
        },
        'conditional': {
            name: 'conditional',
            description: 'Conditional form',
            rules: [
                suffixInflection('aria', 'ar', ['v'], ['v']),
                suffixInflection('eria', 'er', ['v'], ['v']),
                suffixInflection('iria', 'ir', ['v'], ['v']),
            ],
        },
    },
};
