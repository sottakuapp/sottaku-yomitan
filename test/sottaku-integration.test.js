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

import {describe, expect, test} from 'vitest';
import {SottakuIntegration} from '../ext/js/background/sottaku-integration.js';

describe('SottakuIntegration', () => {
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

        integration['_client'].scan = async () => ({
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

        integration['_client'].scan = async () => ({
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
        integration['_client'].getLanguageSettings = async () => ({locale: 'es'});
        integration['_client'].scan = async (_text, _language, _maxResults, locale) => {
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
});
