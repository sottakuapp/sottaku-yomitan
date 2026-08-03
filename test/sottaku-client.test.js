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
import {parseJson} from '../ext/js/core/json.js';

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

    test('scan includes Japanese pitch accent display preferences in the request body', async () => {
        const fetchMock = vi.fn().mockResolvedValue(buildJsonResponse({
            results: [],
            original_text_length: 1,
        }));
        vi.stubGlobal('fetch', fetchMock);

        const {SottakuClient} = await importSottakuClientModule();
        const client = new SottakuClient({apiBaseUrl: 'https://sottaku.app/api/v1', authToken: 'test-token'});

        await client.scan('雨', 'ja', 8, 'en', {japanesePitchAccentDisplay: 'contour'});

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const body = parseJson(fetchMock.mock.calls[0][1].body);
        expect(body.japanese_pitch_accent_display).toBe('contour');
    });

    test('keeps signed session wrappers opaque', async () => {
        const {SottakuClient} = await importSottakuClientModule();
        const client = new SottakuClient({
            apiBaseUrl: 'https://sottaku.app/api/v1',
            authToken: SIGNED_TOKEN_WITH_ORIGIN,
        });

        expect(client.authToken).toBe(SIGNED_TOKEN_WITH_ORIGIN);
    });

    test('rotates only the in-memory opaque wrapper without sending browser cookies', async () => {
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
            onAuthTokenUpdated,
        });

        await client.getProfile();

        expect(client.authToken).toBe(SIGNED_TOKEN_WITH_ORIGIN);
        expect(onAuthTokenUpdated).toHaveBeenCalledWith({
            apiBaseUrl: 'https://sottaku.app/api/v1',
            oldToken: 'old-token',
            newToken: SIGNED_TOKEN_WITH_ORIGIN,
        });
        expect(fetchMock.mock.calls[0][1].credentials).toBe('omit');
    });

    test('creates a 256-bit one-time browser approval without reading cookies', async () => {
        const {SottakuClient} = await importSottakuClientModule();
        const client = new SottakuClient({apiBaseUrl: 'https://sottaku.app/api/v1'});

        const {linkToken, url} = client.createBrowserLink();

        expect(linkToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);
        expect(url).toBe(`https://sottaku.app/extension/link?token=${linkToken}`);
    });

    test('completes password step-up without persisting its code or proof', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(buildJsonResponse({challenge_id: 'challenge-1', expires_in: 600}))
            .mockResolvedValueOnce(buildJsonResponse({resent: true, challenge_id: 'challenge-1', retry_after: 60}))
            .mockResolvedValueOnce(buildJsonResponse({password_step_up_token: 'one-use-proof', expires_in: 600}))
            .mockResolvedValueOnce(buildJsonResponse({
                token: 'access-token',
                refresh_token: 'refresh-token',
                user: {id: 1},
            }));
        vi.stubGlobal('fetch', fetchMock);
        const {SottakuClient} = await importSottakuClientModule();
        const client = new SottakuClient({apiBaseUrl: 'https://sottaku.app/api/v1'});

        await client.requestPasswordStepUp('opaque-login-transaction');
        await client.resendPasswordStepUp('opaque-login-transaction', 'challenge-1');
        await client.verifyPasswordStepUp('challenge-1', '12345678');
        await client.loginWithPassword('user', 'password', 'one-use-proof');

        expect(parseJson(String(fetchMock.mock.calls[0][1].body))).toStrictEqual({
            step_up_transaction: 'opaque-login-transaction',
        });
        expect(parseJson(String(fetchMock.mock.calls[1][1].body))).toStrictEqual({
            step_up_transaction: 'opaque-login-transaction',
            challenge_id: 'challenge-1',
        });
        expect(parseJson(String(fetchMock.mock.calls[2][1].body))).toStrictEqual({
            challenge_id: 'challenge-1',
            code: '12345678',
        });
        expect(parseJson(String(fetchMock.mock.calls[3][1].body))).toStrictEqual({
            username: 'user',
            email: 'user',
            password: 'password',
            password_step_up_token: 'one-use-proof',
        });
    });

    test('exposes only the opaque step-up transaction from an auth error', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
            JSON.stringify({
                success: false,
                error: 'Additional verification is required',
                data: {
                    error_code: 'PASSWORD_STEP_UP_REQUIRED',
                    step_up_transaction: 'opaque-login-transaction',
                },
            }),
            {status: 403, headers: {'Content-Type': 'application/json'}},
        )));
        const {SottakuClient} = await importSottakuClientModule();
        const client = new SottakuClient({apiBaseUrl: 'https://sottaku.app/api/v1'});

        await expect(client.loginWithPassword('user', 'password')).rejects.toMatchObject({
            status: 403,
            data: {
                error_code: 'PASSWORD_STEP_UP_REQUIRED',
                step_up_transaction: 'opaque-login-transaction',
            },
        });
    });

    test('exchanges browser approval for a scoped token and never sends cookies', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(buildJsonResponse({status: 'pending'}))
            .mockResolvedValueOnce(buildJsonResponse({
                status: 'linked',
                token: SIGNED_TOKEN_WITH_ORIGIN,
                refresh_token: 'extension-refresh-secret',
                user: {id: 1, username: 'akira'},
            }));
        vi.stubGlobal('fetch', fetchMock);

        const {SottakuClient} = await importSottakuClientModule();
        const client = new SottakuClient({
            apiBaseUrl: 'https://sottaku.app/api/v1',
        });

        const pending = await client.exchangeBrowserLink('a'.repeat(43));
        const linked = await client.exchangeBrowserLink('a'.repeat(43));

        expect(pending.status).toBe('pending');
        expect(linked.status).toBe('linked');
        expect(linked.refreshToken).toBe('extension-refresh-secret');
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[0][1].credentials).toBe('omit');
        expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
        expect(client.authToken).toBe(SIGNED_TOKEN_WITH_ORIGIN);
    });

    test('refreshes an expired wrapper without browser cookies and retries once', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(
                JSON.stringify({success: false, error: 'Invalid or expired token', code: 'TOKEN_EXPIRED'}),
                {status: 401, headers: {'Content-Type': 'application/json'}},
            ))
            .mockResolvedValueOnce(buildJsonResponse({token: 'fresh-access-wrapper'}))
            .mockResolvedValueOnce(buildJsonResponse({user: {id: 1, username: 'akira'}}));
        vi.stubGlobal('fetch', fetchMock);
        const onAuthTokenUpdated = vi.fn();

        const {SottakuClient} = await importSottakuClientModule();
        const client = new SottakuClient({
            apiBaseUrl: 'https://sottaku.app/api/v1',
            authToken: 'expired-access-wrapper',
            refreshToken: 'extension-refresh-secret',
            onAuthTokenUpdated,
        });

        const profile = await client.getProfile();

        expect(profile).toStrictEqual({user: {id: 1, username: 'akira'}});
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(fetchMock.mock.calls[0][0]).toBe('https://sottaku.app/api/v1/profile/data');
        expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer expired-access-wrapper');
        expect(fetchMock.mock.calls[1][0]).toBe('https://sottaku.app/api/v1/auth/extension-refresh');
        expect(fetchMock.mock.calls[1][1].credentials).toBe('omit');
        expect(parseJson(String(fetchMock.mock.calls[1][1].body))).toStrictEqual({
            refresh_token: 'extension-refresh-secret',
        });
        expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer fresh-access-wrapper');
        expect(onAuthTokenUpdated).toHaveBeenCalledWith({
            apiBaseUrl: 'https://sottaku.app/api/v1',
            oldToken: 'expired-access-wrapper',
            newToken: 'fresh-access-wrapper',
        });
    });

    test('revokes the durable session on extension sign-out', async () => {
        const fetchMock = vi.fn().mockResolvedValue(buildJsonResponse(null));
        vi.stubGlobal('fetch', fetchMock);

        const {SottakuClient} = await importSottakuClientModule();
        const client = new SottakuClient({
            apiBaseUrl: 'https://sottaku.app/api/v1',
            authToken: 'scoped-access-wrapper',
            refreshToken: 'extension-refresh-secret',
        });

        await client.logout();

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][0]).toBe('https://sottaku.app/api/v1/logout');
        expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer scoped-access-wrapper');
        expect(fetchMock.mock.calls[0][1].credentials).toBe('omit');
        expect(client.authToken).toBe('');
    });

    test('rejects API origins outside Sottaku and local development', async () => {
        const {SottakuClient} = await importSottakuClientModule();

        expect(() => new SottakuClient({apiBaseUrl: 'https://attacker.example/api'})).toThrow('Untrusted Sottaku API origin');
        expect(() => new SottakuClient({apiBaseUrl: 'http://localhost:8080/api/v1'})).not.toThrow();
    });

    test('does not send the Sottaku bearer token to third-party audio URLs', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(new Blob(['audio']), {status: 200}));
        vi.stubGlobal('fetch', fetchMock);
        const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');

        const {SottakuClient} = await importSottakuClientModule();
        const client = new SottakuClient({
            apiBaseUrl: 'https://sottaku.app/api/v1',
            authToken: 'scoped-token',
        });

        expect(await client.fetchAudioAsObjectUrl('https://media.example/audio.mp3', 'ja')).toBe('blob:test');
        expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
        expect(fetchMock.mock.calls[0][1].credentials).toBe('omit');
        createObjectUrl.mockRestore();
    });
});
