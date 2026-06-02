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

import {describe, expect, test, vi} from 'vitest';
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

    test('variant scans use the backend original text length for the matched source span', async () => {
        const integration = new SottakuIntegration(null);
        integration._client.scan = async () => ({
            results: [
                {id: 1, kanji_representation: '開発', reading: 'かいはつ', match_length: 2, has_definition: true, word_translation: 'development'},
            ],
            originalTextLength: 2,
        });

        const result = await integration._fetchLanguageEntriesWithVariants({
            apiOrigin: 'https://sottaku.app',
            language: 'ja',
            maxResults: 32,
            variants: [{query: '開発中です', sourceText: '開発中です', originalTextLength: 5}],
            locale: 'en',
            localeLang: 'en',
            displayPreferences: null,
        });

        expect(result.originalTextLength).toBe(2);
    });

    test('same-source scans derive the highlight span from the matched Japanese term when match_length is missing', async () => {
        const integration = new SottakuIntegration(null);
        integration._client.scan = async (text) => ({
            results: [
                {id: 1, kanji_representation: 'インターネット', reading: 'インターネット', has_definition: true, word_translation: 'internet'},
            ],
            originalTextLength: text.length,
        });

        const result = await integration._fetchLanguageEntriesWithVariants({
            apiOrigin: 'https://sottaku.app',
            language: 'ja',
            maxResults: 32,
            variants: [{query: 'インターネット回線の速度テスト', sourceText: 'インターネット回線の速度テスト', originalTextLength: 'インターネット回線の速度テスト'.length}],
            locale: 'en',
            localeLang: 'en',
            displayPreferences: null,
        });

        expect(result.originalTextLength).toBe('インターネット'.length);
        expect(result.entries[0].sottaku.matchLength).toBe('インターネット'.length);
        expect(result.entries[0].headwords[0].sources[0].originalText).toBe('インターネット');
    });

    test('transformed scans keep the original source span when match_length is missing', async () => {
        const integration = new SottakuIntegration(null);
        integration._client.scan = async () => ({
            results: [
                {id: 1, kanji_representation: 'get', reading: 'ɡet', has_definition: true, word_translation: 'obtain'},
            ],
            originalTextLength: 3,
        });

        const result = await integration._fetchLanguageEntriesWithVariants({
            apiOrigin: 'https://sottaku.app',
            language: 'en',
            maxResults: 32,
            variants: [{query: 'get', sourceText: 'Getting', originalTextLength: 7}],
            locale: 'en',
            localeLang: 'en',
            displayPreferences: null,
        });

        expect(result.originalTextLength).toBe(7);
        expect(result.entries[0].sottaku.matchLength).toBe(7);
        expect(result.entries[0].headwords[0].sources[0].originalText).toBe('Getting');
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

    test('mixed mode highlight span ignores longer no-result languages', async () => {
        const integration = new SottakuIntegration(null);

        const dictionaryEntries = [
            {
                sottaku: {matchLength: 7},
                headwords: [{term: 'インターネット'}],
            },
        ];
        const originalTextLength = integration._resolveOriginalTextLength([
            {
                language: 'ja',
                entries: dictionaryEntries,
                originalTextLength: 7,
            },
            {
                language: 'en',
                entries: [],
                originalTextLength: 15,
            },
        ], dictionaryEntries, 'インターネット回線の速度テスト');

        expect(originalTextLength).toBe(7);
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

    test('reuses stored Sottaku user locale before fetching language settings', async () => {
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
                user: {
                    id: 1,
                    username: 'tester',
                    email: 'test@example.com',
                    isPro: true,
                    ui_locale: 'fr',
                },
            },
        });

        const getLanguageSettingsSpy = vi.fn(async () => ({locale: 'es'}));
        integration._client.getLanguageSettings = getLanguageSettingsSpy;
        integration._client.scan = async (_text, _language, _maxResults, locale) => ({
            results: [
                {id: 1, kanji_representation: '猫', reading: 'ねこ', match_length: 2, has_definition: true, word_translation: 'chat'},
            ],
            originalTextLength: 2,
            displayPreferences: null,
            localeUsed: locale,
        });

        const {dictionaryEntries} = await integration.findTerms('ねこ');
        const glossary = dictionaryEntries[0].definitions[0].entries[0];

        expect(getLanguageSettingsSpy).not.toHaveBeenCalled();
        expect(glossary.type).toBe('structured-content');
        expect(glossary.content.content[0].lang).toBe('fr');
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

    test('reuses exact scan responses across repeated lookups', async () => {
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

        const scanSpy = vi.fn(async () => ({
            results: [
                {id: 1, kanji_representation: '猫', reading: 'ねこ', match_length: 2, has_definition: true, word_translation: 'cat'},
            ],
            originalTextLength: 2,
            displayPreferences: null,
        }));
        integration._client.scan = scanSpy;

        await integration.findTerms('ねこ');
        await integration.findTerms('ねこ');

        expect(scanSpy).toHaveBeenCalledTimes(1);
    });

    test('reuses cached fallback variant scans on repeated English lookups', async () => {
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

        const seenTexts = [];
        const scanSpy = vi.fn(async (text) => {
            seenTexts.push(typeof text === 'string' ? text : '');
            if (text === 'get') {
                return {
                    results: [
                        {id: 1, kanji_representation: 'get', reading: 'ɡet', match_length: 7, has_definition: true, word_translation: 'obtain'},
                    ],
                    originalTextLength: 3,
                    displayPreferences: null,
                };
            }
            return {
                results: [],
                originalTextLength: 0,
                displayPreferences: null,
            };
        });
        integration._client.scan = scanSpy;

        await integration.findTerms('Getting');
        await integration.findTerms('Getting');

        expect(scanSpy).toHaveBeenCalledTimes(2);
        expect(seenTexts).toStrictEqual(['Getting', 'get']);
    });

    test('Sottaku API alternative inflection rules keep Sottaku grammar links and separator', () => {
        const integration = new SottakuIntegration(null);
        const entry = integration._createEntry(
            {
                id: 1,
                kanji_representation: '来る',
                reading: 'くる',
                word_translation: 'come',
                match_length: 4,
                inflection_rules: ['Potential', 'Passive'],
                inflection_rule_keys: ['potential', 'passive'],
                inflection_rule_relation: 'alternatives',
            },
            {},
            'ja',
            'https://sottaku.app',
            '来られる',
            0,
            '来られる',
            4,
            'en',
            null,
        );

        expect(entry.inflectionRuleChainCandidates).toHaveLength(1);
        expect(entry.inflectionRuleChainCandidates[0].separator).toBe('alternatives');
        expect(entry.inflectionRuleChainCandidates[0].inflectionRules).toStrictEqual([
            {
                name: 'Potential',
                description: '',
                reasonKey: 'potential',
                grammarLanguage: 'ja',
                grammarUrl: 'https://sottaku.app/dictionary/grammar/ja/potential',
            },
            {
                name: 'Passive',
                description: '',
                reasonKey: 'passive',
                grammarLanguage: 'ja',
                grammarUrl: 'https://sottaku.app/dictionary/grammar/ja/passive',
            },
        ]);
    });
});
/* eslint-enable no-underscore-dangle */
