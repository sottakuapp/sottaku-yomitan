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

import {afterEach, describe, expect, test, vi} from 'vitest';

/**
 * @returns {Promise<typeof import('../ext/js/comm/sottaku-client.js')>}
 */
async function importSottakuClientModule() {
    vi.resetModules();
    return await import('../ext/js/comm/sottaku-client.js');
}

/**
 * @param {unknown} data
 * @returns {Response}
 */
function buildJsonResponse(data) {
    return new Response(
        JSON.stringify({success: true, data}),
        {
            status: 200,
            headers: {'Content-Type': 'application/json'},
        },
    );
}

/**
 * @returns {{promise: Promise<Response>, resolve: (value: Response) => void, reject: (reason?: unknown) => void}}
 */
function createDeferredResponse() {
    /** @type {(value: Response) => void} */
    let resolve = () => {};
    /** @type {(reason?: unknown) => void} */
    let reject = () => {};
    /** @type {Promise<Response>} */
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = /** @type {(value: Response) => void} */ (resolvePromise);
        reject = /** @type {(reason?: unknown) => void} */ (rejectPromise);
    });
    return {promise, resolve, reject};
}

describe('SottakuClient', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        vi.resetModules();
    });

    test('dedupes concurrent language settings requests across client instances and reuses the shared cache', async () => {
        const fetchDeferred = createDeferredResponse();
        const fetchMock = vi.fn().mockReturnValue(fetchDeferred.promise);
        vi.stubGlobal('fetch', fetchMock);

        const {SottakuClient} = await importSottakuClientModule();
        const clientA = new SottakuClient({apiBaseUrl: 'https://sottaku.app/api/v1', authToken: 'test-token'});
        const clientB = new SottakuClient({apiBaseUrl: 'https://sottaku.app/api/v1', authToken: 'test-token'});

        const firstPromise = clientA.getLanguageSettings();
        const secondPromise = clientB.getLanguageSettings();

        expect(fetchMock).toHaveBeenCalledTimes(1);
        fetchDeferred.resolve(buildJsonResponse({language: 'ja', locale: 'en'}));

        const [first, second] = await Promise.all([firstPromise, secondPromise]);
        const third = await clientA.getLanguageSettings();

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(first).toStrictEqual({language: 'ja', locale: 'en'});
        expect(second).toStrictEqual({language: 'ja', locale: 'en'});
        expect(third).toStrictEqual({language: 'ja', locale: 'en'});
    });

    test('dedupes concurrent identical scans across client instances and reuses the short-lived scan cache', async () => {
        const fetchDeferred = createDeferredResponse();
        const fetchMock = vi.fn().mockReturnValue(fetchDeferred.promise);
        vi.stubGlobal('fetch', fetchMock);

        const {SottakuClient} = await importSottakuClientModule();
        const clientA = new SottakuClient({apiBaseUrl: 'https://sottaku.app/api/v1', authToken: 'test-token'});
        const clientB = new SottakuClient({apiBaseUrl: 'https://sottaku.app/api/v1', authToken: 'test-token'});

        const firstPromise = clientA.scan('getting', 'en', 8, 'en');
        const secondPromise = clientB.scan('getting', 'en', 8, 'en');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        fetchDeferred.resolve(buildJsonResponse({
            results: [{id: 1, kanji_representation: 'get', reading: 'ɡet'}],
            original_text_length: 7,
        }));

        const [first, second] = await Promise.all([firstPromise, secondPromise]);
        const third = await clientA.scan('getting', 'en', 8, 'en');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(first).toStrictEqual({
            results: [{id: 1, kanji_representation: 'get', reading: 'ɡet'}],
            originalTextLength: 7,
            displayPreferences: null,
            languageResults: null,
        });
        expect(second).toStrictEqual(first);
        expect(third).toStrictEqual(first);
    });
});
