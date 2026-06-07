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
 * @param {{status?: number, headers?: Record<string, string>}} [init]
 * @returns {Response}
 */
function buildJsonResponse(data, init = {}) {
    const headers = {'Content-Type': 'application/json'};
    if (init.headers) {
        Object.assign(headers, init.headers);
    }
    return new Response(
        JSON.stringify({success: true, data}),
        {
            status: init.status || 200,
            headers,
        },
    );
}

/**
 * @param {Record<string, unknown>} data
 * @param {number} [status]
 * @returns {Response}
 */
function buildErrorResponse(data, status = 401) {
    return new Response(
        JSON.stringify({success: false, ...data}),
        {
            status,
            headers: {'Content-Type': 'application/json'},
        },
    );
}

const SIGNED_TOKEN_WITH_ORIGIN =
    'st1.eyJ0Ijoib3JpZ2luLXNlc3Npb24tdG9rZW4iLCJ1IjoxMDQxOCwiYyI6MTc4MDQ4MzQyNCwidiI6MTc4MDQ4MzQyNCwiZSI6MTc4MDQ4MzQ1NH0.signature';

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

/**
 * @param {Record<string, string>} [cookies]
 * @returns {{setCalls: Array<Record<string, unknown>>}}
 */
function stubChromeCookies(cookies = {}) {
    /** @type {Array<Record<string, unknown>>} */
    const setCalls = [];
    /**
     * @param {{name: string}} details
     * @param {(cookie: {value: string}|null) => void} callback
     */
    const getCookie = (details, callback) => {
        const {name} = details;
        const value = cookies[name];
        callback(typeof value === 'string' ? {value} : null);
    };
    /**
     * @param {Record<string, unknown>} details
     * @param {() => void} callback
     */
    const setCookie = (details, callback) => {
        setCalls.push(details);
        const name = typeof details.name === 'string' ? details.name : '';
        const value = typeof details.value === 'string' ? details.value : '';
        if (name) {
            cookies[name] = value;
        }
        callback();
    };
    vi.stubGlobal('chrome', {
        cookies: {
            get: vi.fn(getCookie),
            set: vi.fn(setCookie),
        },
        runtime: {
            lastError: null,
        },
    });
    return {setCalls};
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

    test('normalizes signed session tokens to their durable origin token', async () => {
        const {SottakuClient} = await importSottakuClientModule();
        const client = new SottakuClient({
            apiBaseUrl: 'https://sottaku.app/api/v1',
            authToken: SIGNED_TOKEN_WITH_ORIGIN,
        });

        expect(client.authToken).toBe('origin-session-token');
    });

    test('stores the origin token and refreshes the Sottaku cookie when the server rotates a signed token', async () => {
        const {setCalls} = stubChromeCookies();
        const fetchMock = vi.fn().mockResolvedValue(buildJsonResponse(
            {user: {id: 1, username: 'akira'}},
            {headers: {'X-New-Token': SIGNED_TOKEN_WITH_ORIGIN}},
        ));
        vi.stubGlobal('fetch', fetchMock);
        const onAuthTokenUpdated = vi.fn();

        const {SottakuClient} = await importSottakuClientModule();
        const client = new SottakuClient({
            apiBaseUrl: 'https://sottaku.app/api/v1',
            authToken: 'old-token',
            cookieDomain: 'https://sottaku.app',
            onAuthTokenUpdated,
        });

        await client.getProfile();

        expect(client.authToken).toBe('origin-session-token');
        expect(onAuthTokenUpdated).toHaveBeenCalledWith({
            apiBaseUrl: 'https://sottaku.app/api/v1',
            oldToken: 'old-token',
            newToken: 'origin-session-token',
        });
        expect(setCalls[0]).toMatchObject({
            url: 'https://sottaku.app',
            name: 'api_token',
            value: 'origin-session-token',
            path: '/',
            secure: true,
        });
    });

    test('retries a 401 with a newer browser-session cookie before invalidating auth', async () => {
        stubChromeCookies({api_token: 'cookie-token'});
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(buildErrorResponse({error: 'Unauthorized'}))
            .mockResolvedValueOnce(buildJsonResponse({user: {id: 1, username: 'akira'}}));
        vi.stubGlobal('fetch', fetchMock);
        const onAuthTokenUpdated = vi.fn();
        const onAuthTokenInvalidated = vi.fn();

        const {SottakuClient} = await importSottakuClientModule();
        const client = new SottakuClient({
            apiBaseUrl: 'https://sottaku.app/api/v1',
            authToken: 'old-token',
            cookieDomain: 'https://sottaku.app',
            onAuthTokenUpdated,
            onAuthTokenInvalidated,
        });

        const response = await client.getProfile();

        expect(response).toStrictEqual({user: {id: 1, username: 'akira'}});
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer old-token');
        expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer cookie-token');
        expect(client.authToken).toBe('cookie-token');
        expect(onAuthTokenUpdated).toHaveBeenCalledWith({
            apiBaseUrl: 'https://sottaku.app/api/v1',
            oldToken: 'old-token',
            newToken: 'cookie-token',
        });
        expect(onAuthTokenInvalidated).not.toHaveBeenCalled();
    });
});
