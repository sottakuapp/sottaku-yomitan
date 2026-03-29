/*
 * Copyright (C) 2023-2025  Yomitan Authors
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

import {afterAll, describe, expect, test, vi} from 'vitest';
import {TextSourceElement} from '../ext/js/dom/text-source-element.js';
import {TextScanner} from '../ext/js/language/text-scanner.js';
import {setupDomTest} from './fixtures/dom-test.js';

const textScannerTestEnv = await setupDomTest();

/**
 * @param {{termsFind?: (text: string) => Promise<{dictionaryEntries: any[], originalTextLength: number}>}} [apiOverrides]
 * @returns {TextScanner}
 */
function createScanner(apiOverrides = {}) {
    const api = {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        termsFind: vi.fn(async (text) => ({dictionaryEntries: [], originalTextLength: text.length})),
        ...apiOverrides,
    };
    const textSourceGenerator = {
        extractSentence: vi.fn(() => ({text: '', offset: 0})),
    };
    return new TextScanner({
        api,
        node: window,
        getSearchContext: () => ({optionsContext: {}, detail: null}),
        searchTerms: true,
        searchKanji: false,
        textSourceGenerator,
    });
}

describe('TextScanner', () => {
    const {window, teardown} = textScannerTestEnv;
    afterAll(() => teardown(global));

    test('builds English search variants from earlier word boundaries', () => {
        const scanner = createScanner();

        // eslint-disable-next-line no-underscore-dangle
        expect(scanner._getEnglishBidirectionalSearchVariants('it will become soon', 8, 20)).toEqual([
            {text: 'will become', startOffset: 5, anchorOffset: 5},
            {text: 'become', startOffset: 0, anchorOffset: 0},
        ]);
    });

    test('keeps ordinary English lookups on the hovered word only', () => {
        const scanner = createScanner();

        // eslint-disable-next-line no-underscore-dangle
        expect(scanner._getEnglishBidirectionalSearchVariants('perpetrators are burning in hell', 0, 32)).toEqual([
            {text: 'perpetrators', startOffset: 0, anchorOffset: 0},
        ]);
    });

    test('uses the first successful English phrase span and stops scanning', async () => {
        const definitionEntry = {id: 'future-become'};
        const scanner = createScanner({
            termsFind: vi.fn(async (text) => {
                if (text === 'will become') {
                    return {dictionaryEntries: [definitionEntry], originalTextLength: 11};
                }
                return {dictionaryEntries: [], originalTextLength: 0};
            }),
        });
        // eslint-disable-next-line no-underscore-dangle
        scanner._language = 'en';
        // eslint-disable-next-line no-underscore-dangle
        scanner._scanLength = 20;

        const textSource = new TextSourceElement(
            window.document.createElement('div'),
            'it will become soon',
            8,
            8,
        );
        // eslint-disable-next-line no-underscore-dangle
        const result = await scanner._findTermDictionaryEntries(textSource, {pointerType: 'mouse'});

        expect(result).not.toBeNull();
        expect(result?.dictionaryEntries).toEqual([definitionEntry]);
        expect(textSource.text()).toBe('will become');
        // eslint-disable-next-line no-underscore-dangle, @typescript-eslint/unbound-method
        expect(scanner._api.termsFind).toHaveBeenCalledTimes(1);
    });

    test('prefers the hovered English word over trailing text', async () => {
        const definitionEntry = {id: 'perpetrator'};
        const scanner = createScanner({
            termsFind: vi.fn(async (text) => {
                if (text === 'perpetrators') {
                    return {dictionaryEntries: [definitionEntry], originalTextLength: 12};
                }
                return {dictionaryEntries: [], originalTextLength: 0};
            }),
        });
        // eslint-disable-next-line no-underscore-dangle
        scanner._language = 'en';
        // eslint-disable-next-line no-underscore-dangle
        scanner._scanLength = 32;

        const textSource = new TextSourceElement(
            window.document.createElement('div'),
            'perpetrators are burning in hell',
            0,
            0,
        );
        // eslint-disable-next-line no-underscore-dangle
        const result = await scanner._findTermDictionaryEntries(textSource, {pointerType: 'mouse'});

        expect(result).not.toBeNull();
        expect(result?.dictionaryEntries).toEqual([definitionEntry]);
        expect(textSource.text()).toBe('perpetrators');
        // eslint-disable-next-line no-underscore-dangle, @typescript-eslint/unbound-method
        expect(scanner._api.termsFind).toHaveBeenCalledTimes(1);
    });

    test('keeps exact source spans for non-English matches', async () => {
        const definitionEntry = {id: 'development'};
        const scanner = createScanner({
            termsFind: vi.fn(async () => ({
                dictionaryEntries: [definitionEntry],
                originalTextLength: 2,
            })),
        });
        // eslint-disable-next-line no-underscore-dangle
        scanner._language = 'ja';
        // eslint-disable-next-line no-underscore-dangle
        scanner._scanLength = 10;

        const textSource = new TextSourceElement(
            window.document.createElement('div'),
            '開発中',
            0,
            0,
        );
        // eslint-disable-next-line no-underscore-dangle
        const result = await scanner._findTermDictionaryEntries(textSource, {pointerType: 'mouse'});

        expect(result).not.toBeNull();
        expect(result?.dictionaryEntries).toEqual([definitionEntry]);
        expect(textSource.text()).toBe('開発');
    });
});
