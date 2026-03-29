/*
 * Copyright (C) 2023-2025  Yomitan Authors
 * Copyright (C) 2016-2022  Yomichan Authors
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

/* eslint-disable no-underscore-dangle */

import {describe, expect, test} from 'vitest';
import {SottakuIntegration} from '../ext/js/background/sottaku-integration.js';
import {Translator} from '../ext/js/language/translator.js';

describe('SottakuIntegration', () => {
    test('translator keeps full source text for transformed English variants', async () => {
        const translator = new Translator(null);
        translator.prepare();

        const variants = await translator.getDeinflectionTextVariants('Getting', {
            language: 'en',
            deinflect: true,
            textReplacements: [null],
            searchResolution: 'length',
            removeNonJapaneseCharacters: false,
        });

        expect(variants.find(({deinflectedText}) => deinflectedText === 'get')).toStrictEqual({
            originalText: 'Getting',
            deinflectedText: 'get',
        });
    });

    test('english variants prefer lowercase lemma queries while preserving the scanned source text', async () => {
        const integration = new SottakuIntegration({
            async getDeinflectionTextVariants() {
                return [
                    {originalText: 'Getting', deinflectedText: 'Getting'},
                    {originalText: 'Getting', deinflectedText: 'Get'},
                ];
            },
        });

        const variants = await integration._buildQueryVariants('Getting', 'en');
        expect(variants).toStrictEqual([
            {query: 'get', sourceText: 'Getting', originalTextLength: 7},
            {query: 'getting', sourceText: 'Getting', originalTextLength: 7},
            {query: 'Getting', sourceText: 'Getting', originalTextLength: 7},
        ]);
    });

    test('english fallback scans the transformed query after the original source misses', async () => {
        const integration = new SottakuIntegration({
            async getDeinflectionTextVariants() {
                return [
                    {originalText: 'Getting', deinflectedText: 'Getting'},
                    {originalText: 'Getting', deinflectedText: 'Get'},
                ];
            },
        });
        integration.configure({
            general: {
                language: 'en',
                maxResults: 32,
            },
            sottaku: {
                enabled: true,
                authToken: 'test-token',
                apiBaseUrl: 'https://sottaku.app/api/v1',
                cookieDomain: 'https://sottaku.app',
                locale: 'en',
                languageMode: 'en',
                preferredLanguages: [],
            },
        });

        const scanCalls = [];
        integration._client.scan = async (text) => {
            scanCalls.push(text);
            if (text === 'get') {
                return {
                    results: [
                        {id: 1, kanji_representation: 'get', reading: 'ɡet', match_length: 7, has_definition: true, word_translation: 'obtain'},
                    ],
                    originalTextLength: 3,
                };
            }
            return {
                results: [],
                originalTextLength: text.length,
            };
        };

        const {dictionaryEntries, originalTextLength} = await integration.findTerms('Getting');

        expect(scanCalls).toStrictEqual(['Getting', 'get']);
        expect(originalTextLength).toBe(7);
        expect(dictionaryEntries[0].headwords[0].sources[0].originalText).toBe('Getting');
        expect(dictionaryEntries[0].headwords[0].sources[0].transformedText).toBe('get');
    });

    test('sorts longest matches then defined entries', async () => {
        const integration = new SottakuIntegration(null);
        integration.configure({
            general: {
                language: 'ja',
                maxResults: 32,
            },
            sottaku: {
                enabled: true,
                authToken: 'test-token',
                apiBaseUrl: 'https://sottaku.app/api/v1',
                cookieDomain: 'https://sottaku.app',
                locale: 'en',
                languageMode: 'ja',
                preferredLanguages: [],
            },
        });

        integration._client.scan = async () => ({
            results: [
                {id: 1, kanji_representation: '猫', reading: 'ねこ', match_length: 2, has_definition: false, word_translation: ''},
                {id: 5, kanji_representation: 'ねこ', reading: 'ねこ', match_length: 3, has_definition: false, word_translation: ''},
                {id: 2, kanji_representation: 'ネコ', reading: 'ねこ', match_length: 2, word_translation: 'cat'},
                {id: 3, kanji_representation: '寝子', reading: 'ねこ', match_length: 2, has_definition: true, word_translation: ''},
                {id: 4, kanji_representation: '猫', reading: 'ねこ', match_length: 1, word_translation: 'cat-short'},
            ],
            originalTextLength: 3,
        });

        const {dictionaryEntries} = await integration.findTerms('ねこ');
        const ids = dictionaryEntries.map((entry) => entry.sottaku.questionId);
        expect(ids).toStrictEqual([5, 2, 3, 1, 4]);
    });

    test('mixed mode prioritizes longest matches before definitions', async () => {
        const integration = new SottakuIntegration(null);
        integration.configure({
            general: {
                language: 'ja',
                maxResults: 32,
            },
            sottaku: {
                enabled: true,
                authToken: 'test-token',
                apiBaseUrl: 'https://sottaku.app/api/v1',
                cookieDomain: 'https://sottaku.app',
                locale: 'en',
                languageMode: 'mixed',
                preferredLanguages: ['ko', 'zh'],
            },
        });

        integration._client.scan = async () => ({
            languageResults: [
                {
                    language: 'ko',
                    results: [
                        {id: 1, kanji_representation: '바', reading: '바', match_length: 1, has_definition: true, word_translation: 'bar'},
                    ],
                    originalTextLength: 1,
                },
                {
                    language: 'zh',
                    results: [
                        {id: 2, kanji_representation: '反對', reading: 'fandui', match_length: 2, has_definition: false, word_translation: ''},
                    ],
                    originalTextLength: 2,
                },
            ],
            displayPreferences: null,
        });

        const {dictionaryEntries} = await integration.findTerms('반대했다는');
        const ids = dictionaryEntries.map((entry) => entry.sottaku.questionId);
        expect(ids).toStrictEqual([2, 1]);
    });

    test('resolves automatic locale from Sottaku language settings', async () => {
        const integration = new SottakuIntegration(null);
        integration.configure({
            general: {
                language: 'ja',
                maxResults: 32,
            },
            sottaku: {
                enabled: true,
                authToken: 'test-token',
                apiBaseUrl: 'https://sottaku.app/api/v1',
                cookieDomain: 'https://sottaku.app',
                locale: '',
                languageMode: 'ja',
                preferredLanguages: [],
            },
        });

        /** @type {string|null} */
        let resolvedLocale = null;
        integration._client.getLanguageSettings = async () => ({locale: 'es'});
        integration._client.scan = async (_text, _language, _maxResults, locale) => {
            resolvedLocale = locale;
            return {
                results: [
                    {id: 1, kanji_representation: '猫', reading: 'ねこ', match_length: 2, has_definition: true, word_translation: 'gato'},
                ],
                originalTextLength: 2,
            };
        };

        const {dictionaryEntries} = await integration.findTerms('ねこ');
        expect(resolvedLocale).toBe('es');

        const glossary = dictionaryEntries[0].definitions[0].entries[0];
        expect(glossary.type).toBe('structured-content');
        expect(glossary.content.content[0].lang).toBe('es');
    });

    test('preserves requested status from scan results', async () => {
        const integration = new SottakuIntegration(null);
        integration.configure({
            general: {
                language: 'ja',
                maxResults: 32,
            },
            sottaku: {
                enabled: true,
                authToken: 'test-token',
                apiBaseUrl: 'https://sottaku.app/api/v1',
                cookieDomain: 'https://sottaku.app',
                locale: 'en',
                languageMode: 'ja',
                preferredLanguages: [],
            },
        });

        integration._client.scan = async () => ({
            results: [
                {
                    id: 1,
                    kanji_representation: '猫',
                    reading: 'ねこ',
                    match_length: 2,
                    has_definition: false,
                    requested: true,
                    word_translation: '',
                },
            ],
            originalTextLength: 2,
        });

        const {dictionaryEntries} = await integration.findTerms('ねこ');
        expect(dictionaryEntries[0].sottaku.requested).toBe(true);
    });
});
