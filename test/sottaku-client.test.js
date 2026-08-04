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
const PASSWORD_STEP_UP_TRANSACTION = 't'.repeat(43);
const PASSWORD_HUMAN_STATE = 's'.repeat(43);
const PASSWORD_HUMAN_CONTEXT = 'c'.repeat(43);

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
        const body = /** @type {Record<string, unknown>} */ (
            parseJson(String(fetchMock.mock.calls[0][1].body))
        );
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
            .mockResolvedValueOnce(buildJsonResponse({accepted: true, challenge_id: 'challenge-1', retry_after: 60}))
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

    test('uses hosted human verification without persisting its token', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(buildJsonResponse({password_step_up_token: 'code-proof', expires_in: 600}))
            .mockResolvedValueOnce(buildJsonResponse({password_step_up_token: 'recovery-proof', expires_in: 600}));
        vi.stubGlobal('fetch', fetchMock);
        const {SottakuClient} = await importSottakuClientModule();
        const client = new SottakuClient({apiBaseUrl: 'https://sottaku.app/api/v1'});

        await client.verifyPasswordStepUp(
            'challenge-1',
            '12345678',
            'human-token',
            PASSWORD_HUMAN_CONTEXT,
        );
        await client.verifyPasswordRecoveryHuman(
            PASSWORD_STEP_UP_TRANSACTION,
            'human-token',
            PASSWORD_HUMAN_CONTEXT,
        );

        expect(parseJson(String(fetchMock.mock.calls[0][1].body))).toStrictEqual({
            challenge_id: 'challenge-1',
            code: '12345678',
            human_verification_token: 'human-token',
            human_verification_context: PASSWORD_HUMAN_CONTEXT,
        });
        expect(parseJson(String(fetchMock.mock.calls[1][1].body))).toStrictEqual({
            step_up_transaction: PASSWORD_STEP_UP_TRANSACTION,
            human_verification_token: 'human-token',
            human_verification_context: PASSWORD_HUMAN_CONTEXT,
        });
        expect(() => client.createPasswordHumanVerificationRequest(
            /** @type {any} */ ('invalid'),
            PASSWORD_STEP_UP_TRANSACTION,
        )).toThrow(
            'Invalid password human-verification action',
        );
    });

    test.each([
        ['production', 'https://sottaku.app/api/v1', 'https://sottaku.app'],
        ['staging', 'https://staging.sottaku.app/api/v1', 'https://staging.sottaku.app'],
    ])('derives the %s human-verification origin from the API base', async (
        _environment,
        apiBaseUrl,
        expectedOrigin,
    ) => {
        vi.stubGlobal('chrome', {
            runtime: {
                getURL: () => 'chrome-extension://abcdefghijklmnop/',
            },
        });
        vi.stubGlobal('crypto', {
            getRandomValues: (bytes) => {
                bytes.fill(7);
                return bytes;
            },
        });
        const {SottakuClient} = await importSottakuClientModule();
        const client = new SottakuClient({apiBaseUrl});

        const request = client.createPasswordHumanVerificationRequest(
            'password_recovery',
            PASSWORD_STEP_UP_TRANSACTION,
        );
        const url = new URL(request.url);

        expect(client.passwordHumanVerificationOrigin).toBe(expectedOrigin);
        expect(request.expectedOrigin).toBe(expectedOrigin);
        expect(request.action).toBe('password_recovery');
        expect(request.stepUpTransaction).toBe(PASSWORD_STEP_UP_TRANSACTION);
        expect(request.state).toMatch(/^[A-Za-z0-9_-]{43}$/u);
        expect(url.origin).toBe(expectedOrigin);
        expect(url.pathname).toBe('/auth/password-recovery/human-challenge');
        expect(url.searchParams.get('client')).toBe('extension');
        expect(url.searchParams.get('action')).toBe('password_recovery');
        expect(url.searchParams.get('state')).toBe(request.state);
        expect(url.searchParams.get('step_up_transaction')).toBe(PASSWORD_STEP_UP_TRANSACTION);
        expect(url.searchParams.get('return_origin')).toBe(
            'chrome-extension://abcdefghijklmnop',
        );
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

/* eslint-disable no-underscore-dangle, @typescript-eslint/no-unsafe-assignment */
describe('SottakuController password step-up proof lifecycle', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        vi.resetModules();
    });

    /**
     * @param {ReturnType<typeof vi.fn>} loginWithPassword
     * @param {Record<string, unknown>} [clientOverrides]
     * @returns {Promise<{controller: any, loginWithPassword: ReturnType<typeof vi.fn>, applyAuthUpdate: ReturnType<typeof vi.fn>}>}
     */
    async function createController(loginWithPassword, clientOverrides = {}) {
        const {SottakuController} = await import('../ext/js/pages/settings/sottaku-controller.js');
        const controller = Object.create(SottakuController.prototype);
        const applyAuthUpdate = vi.fn().mockResolvedValue(void 0);
        Object.assign(controller, {
            _busy: false,
            _usernameInput: {value: 'user'},
            _passwordInput: {value: 'password'},
            _passwordStepUpCodeInput: {value: ''},
            _passwordStepUpTransaction: PASSWORD_STEP_UP_TRANSACTION,
            _passwordStepUpChallengeId: 'challenge-1',
            _passwordStepUpProof: 'one-use-proof',
            _passwordStepUpForm: {hidden: true},
            _passwordHumanVerificationAction: null,
            _passwordHumanVerificationRequest: null,
            _passwordHumanRecoveryAvailable: false,
            _passwordStepUpHumanVerificationToken: null,
            _passwordStepUpHumanVerificationContext: null,
            _passwordHumanVerificationForm: {hidden: true},
            _authForm: {hidden: false},
            _client: {loginWithPassword, ...clientOverrides},
            _applyAuthUpdate: applyAuthUpdate,
            _setStatus: vi.fn(),
        });
        return {controller, loginWithPassword, applyAuthUpdate};
    }

    test('retries the same in-memory proof after a transport failure', async () => {
        const loginWithPassword = vi.fn()
            .mockRejectedValueOnce(new TypeError('Failed to fetch'))
            .mockResolvedValueOnce({token: 'token', refreshToken: 'refresh', user: {id: 1}});
        const {controller, applyAuthUpdate} = await createController(loginWithPassword);
        const event = {preventDefault: vi.fn()};

        await controller._onLoginClick(event);
        expect(controller._passwordStepUpProof).toBe('one-use-proof');
        expect(controller._passwordInput.value).toBe('');

        controller._passwordInput.value = 'password-again';
        await controller._onLoginClick(event);
        expect(loginWithPassword).toHaveBeenNthCalledWith(1, 'user', 'password', 'one-use-proof');
        expect(loginWithPassword).toHaveBeenNthCalledWith(2, 'user', 'password-again', 'one-use-proof');
        expect(controller._passwordStepUpProof).toBeNull();
        expect(applyAuthUpdate).toHaveBeenCalledTimes(1);
    });

    test.each([429, 503])('retains the proof after retryable HTTP %s', async (status) => {
        const error = Object.assign(new Error('Authentication temporarily unavailable'), {status});
        const loginWithPassword = vi.fn().mockRejectedValue(error);
        const {controller} = await createController(loginWithPassword);

        await controller._onLoginClick({preventDefault: vi.fn()});

        expect(controller._passwordStepUpProof).toBe('one-use-proof');
        expect(controller._passwordInput.value).toBe('');
    });

    test('clears the proof after a definitive authentication response', async () => {
        const error = Object.assign(new Error('Invalid credentials'), {status: 401});
        const loginWithPassword = vi.fn().mockRejectedValue(error);
        const {controller} = await createController(loginWithPassword);

        await controller._onLoginClick({preventDefault: vi.fn()});

        expect(controller._passwordStepUpProof).toBeNull();
        expect(controller._passwordStepUpTransaction).toBeNull();
        expect(controller._passwordStepUpChallengeId).toBeNull();
    });

    test('offers generic human recovery on the ordinary code screen', async () => {
        const stepUpError = Object.assign(new Error('Additional verification required'), {
            status: 403,
            data: {
                error_code: 'PASSWORD_STEP_UP_REQUIRED',
                step_up_transaction: PASSWORD_STEP_UP_TRANSACTION,
                human_verification_available: true,
                turnstile_action: 'password_recovery',
            },
        });
        const loginWithPassword = vi.fn().mockRejectedValue(stepUpError);
        const requestPasswordStepUp = vi.fn().mockResolvedValue({
            challenge_id: 'human-challenge',
        });
        const verifyPasswordRecoveryHuman = vi.fn().mockResolvedValue({
            password_step_up_token: 'human-proof',
        });
        const {controller} = await createController(loginWithPassword, {
            requestPasswordStepUp,
            verifyPasswordRecoveryHuman,
        });
        controller._passwordStepUpProof = null;

        await controller._onLoginClick({preventDefault: vi.fn()});
        expect(controller._passwordHumanVerificationAction).toBe('password_recovery');
        expect(controller._passwordStepUpForm.hidden).toBe(false);
        expect(controller._passwordHumanVerificationForm.hidden).toBe(false);
        expect(controller._passwordHumanRecoveryAvailable).toBe(true);

        const popup = {close: vi.fn()};
        controller._passwordHumanVerificationRequest = {
            popup,
            expectedOrigin: 'https://staging.sottaku.app',
            state: PASSWORD_HUMAN_STATE,
            action: 'password_recovery',
            transaction: PASSWORD_STEP_UP_TRANSACTION,
        };
        const message = {
            type: 'sottaku-password-human-verification',
            action: 'password_recovery',
            state: PASSWORD_HUMAN_STATE,
            step_up_transaction: PASSWORD_STEP_UP_TRANSACTION,
            human_verification_context: PASSWORD_HUMAN_CONTEXT,
            token: 'human-token',
        };
        await controller._onPasswordHumanVerificationMessage({
            origin: 'https://attacker.test',
            source: popup,
            data: message,
        });
        await controller._onPasswordHumanVerificationMessage({
            origin: 'https://staging.sottaku.app',
            source: {},
            data: message,
        });
        for (const data of [
            {...message, state: 'x'.repeat(43)},
            {...message, action: 'password_step_up_code'},
            {...message, step_up_transaction: 'u'.repeat(43)},
            {...message, human_verification_context: 'short'},
        ]) {
            await controller._onPasswordHumanVerificationMessage({
                origin: 'https://staging.sottaku.app',
                source: popup,
                data: JSON.stringify(data),
            });
        }
        expect(verifyPasswordRecoveryHuman).not.toHaveBeenCalled();

        await controller._onPasswordHumanVerificationMessage({
            origin: 'https://staging.sottaku.app',
            source: popup,
            data: JSON.stringify(message),
        });
        expect(verifyPasswordRecoveryHuman).toHaveBeenCalledWith(
            PASSWORD_STEP_UP_TRANSACTION,
            'human-token',
            PASSWORD_HUMAN_CONTEXT,
        );
        expect(controller._passwordStepUpProof).toBe('human-proof');
        expect(controller._authForm.hidden).toBe(false);
        expect(controller._passwordStepUpForm.hidden).toBe(true);
        expect(controller._passwordHumanRecoveryAvailable).toBe(false);
        expect(popup.close).toHaveBeenCalledTimes(1);

        await controller._onPasswordHumanVerificationMessage({
            origin: 'https://staging.sottaku.app',
            source: popup,
            data: JSON.stringify(message),
        });
        expect(verifyPasswordRecoveryHuman).toHaveBeenCalledTimes(1);
    });

    test('recovers the same transaction after a human-proof response is lost', async () => {
        const firstState = 'a'.repeat(43);
        const retryState = 'b'.repeat(43);
        const firstPopup = {close: vi.fn()};
        const retryPopup = {close: vi.fn()};
        vi.stubGlobal('open', vi.fn()
            .mockReturnValueOnce(firstPopup)
            .mockReturnValueOnce(retryPopup));
        const createPasswordHumanVerificationRequest = vi.fn()
            .mockReturnValueOnce({
                url: `https://staging.sottaku.app/auth/password-recovery/human-challenge?client=extension&action=password_recovery&state=${firstState}&step_up_transaction=${PASSWORD_STEP_UP_TRANSACTION}`,
                expectedOrigin: 'https://staging.sottaku.app',
                state: firstState,
                action: 'password_recovery',
                stepUpTransaction: PASSWORD_STEP_UP_TRANSACTION,
            })
            .mockReturnValueOnce({
                url: `https://staging.sottaku.app/auth/password-recovery/human-challenge?client=extension&action=password_recovery&state=${retryState}&step_up_transaction=${PASSWORD_STEP_UP_TRANSACTION}`,
                expectedOrigin: 'https://staging.sottaku.app',
                state: retryState,
                action: 'password_recovery',
                stepUpTransaction: PASSWORD_STEP_UP_TRANSACTION,
            });
        const verifyPasswordRecoveryHuman = vi.fn()
            .mockRejectedValueOnce(new TypeError('Failed to fetch'))
            .mockResolvedValueOnce({password_step_up_token: 'reissued-human-proof'});
        const {controller} = await createController(vi.fn(), {
            createPasswordHumanVerificationRequest,
            verifyPasswordRecoveryHuman,
        });
        controller._passwordStepUpProof = null;
        controller._passwordHumanVerificationAction = 'password_recovery';

        controller._onPasswordHumanVerificationClick({preventDefault: vi.fn()});
        await controller._onPasswordHumanVerificationMessage({
            origin: 'https://staging.sottaku.app',
            source: firstPopup,
            data: {
                type: 'sottaku-password-human-verification',
                action: 'password_recovery',
                state: firstState,
                step_up_transaction: PASSWORD_STEP_UP_TRANSACTION,
                human_verification_context: PASSWORD_HUMAN_CONTEXT,
                token: 'first-human-token',
            },
        });
        expect(controller._passwordHumanVerificationAction).toBe('password_recovery');
        expect(controller._passwordStepUpTransaction).toBe(PASSWORD_STEP_UP_TRANSACTION);
        expect(controller._passwordStepUpProof).toBeNull();

        controller._onPasswordHumanVerificationClick({preventDefault: vi.fn()});
        expect(createPasswordHumanVerificationRequest).toHaveBeenNthCalledWith(
            2,
            'password_recovery',
            PASSWORD_STEP_UP_TRANSACTION,
        );
        expect(controller._passwordHumanVerificationRequest.state).toBe(retryState);
        await controller._onPasswordHumanVerificationMessage({
            origin: 'https://staging.sottaku.app',
            source: retryPopup,
            data: {
                type: 'sottaku-password-human-verification',
                action: 'password_recovery',
                state: retryState,
                step_up_transaction: PASSWORD_STEP_UP_TRANSACTION,
                human_verification_context: 'd'.repeat(43),
                token: 'retry-human-token',
            },
        });

        expect(verifyPasswordRecoveryHuman).toHaveBeenNthCalledWith(
            1,
            PASSWORD_STEP_UP_TRANSACTION,
            'first-human-token',
            PASSWORD_HUMAN_CONTEXT,
        );
        expect(verifyPasswordRecoveryHuman).toHaveBeenNthCalledWith(
            2,
            PASSWORD_STEP_UP_TRANSACTION,
            'retry-human-token',
            'd'.repeat(43),
        );
        expect(controller._passwordStepUpProof).toBe('reissued-human-proof');
    });

    test('uses a hosted human token after the aggregate code threshold', async () => {
        const humanRequired = Object.assign(new Error('Human verification required'), {
            status: 403,
            data: {
                error_code: 'PASSWORD_STEP_UP_INVALID',
                human_verification_available: true,
                turnstile_action: 'password_step_up_code',
            },
        });
        const verifyPasswordStepUp = vi.fn()
            .mockRejectedValueOnce(humanRequired)
            .mockResolvedValueOnce({password_step_up_token: 'aggregate-proof'});
        const {controller} = await createController(vi.fn(), {verifyPasswordStepUp});
        controller._passwordStepUpProof = null;
        controller._passwordStepUpCodeInput.value = '12345678';

        await controller._onPasswordStepUpVerify({preventDefault: vi.fn()});
        expect(controller._passwordHumanVerificationAction).toBe('password_step_up_code');
        expect(controller._passwordStepUpCodeInput.value).toBe('');

        const popup = {close: vi.fn()};
        controller._passwordHumanVerificationRequest = {
            popup,
            expectedOrigin: 'https://sottaku.app',
            state: PASSWORD_HUMAN_STATE,
            action: 'password_step_up_code',
            transaction: PASSWORD_STEP_UP_TRANSACTION,
        };
        await controller._onPasswordHumanVerificationMessage({
            origin: 'https://sottaku.app',
            source: popup,
            data: JSON.stringify({
                type: 'sottaku-password-human-verification',
                action: 'password_step_up_code',
                state: PASSWORD_HUMAN_STATE,
                step_up_transaction: PASSWORD_STEP_UP_TRANSACTION,
                human_verification_context: PASSWORD_HUMAN_CONTEXT,
                token: 'aggregate-human-token',
            }),
        });
        expect(verifyPasswordStepUp).toHaveBeenCalledTimes(1);
        controller._passwordStepUpCodeInput.value = '87654321';
        await controller._onPasswordStepUpVerify({preventDefault: vi.fn()});

        expect(verifyPasswordStepUp).toHaveBeenNthCalledWith(
            2,
            'challenge-1',
            '87654321',
            'aggregate-human-token',
            PASSWORD_HUMAN_CONTEXT,
        );
        expect(controller._passwordStepUpProof).toBe('aggregate-proof');
    });

    test('opens a state-bound hosted human-verification URL only after a button click', async () => {
        const popup = {close: vi.fn()};
        const open = vi.fn().mockReturnValue(popup);
        vi.stubGlobal('open', open);
        const url =
            'https://staging.sottaku.app/auth/password-recovery/human-challenge' +
            `?client=extension&action=password_recovery&state=${PASSWORD_HUMAN_STATE}` +
            `&step_up_transaction=${PASSWORD_STEP_UP_TRANSACTION}`;
        const createPasswordHumanVerificationRequest = vi.fn().mockReturnValue({
            url,
            expectedOrigin: 'https://staging.sottaku.app',
            state: PASSWORD_HUMAN_STATE,
            action: 'password_recovery',
            stepUpTransaction: PASSWORD_STEP_UP_TRANSACTION,
        });
        const {controller} = await createController(vi.fn(), {
            createPasswordHumanVerificationRequest,
        });
        controller._passwordHumanVerificationAction = 'password_recovery';

        controller._onPasswordHumanVerificationClick({preventDefault: vi.fn()});

        expect(createPasswordHumanVerificationRequest).toHaveBeenCalledWith(
            'password_recovery',
            PASSWORD_STEP_UP_TRANSACTION,
        );
        expect(open).toHaveBeenCalledWith(
            url,
            'sottaku-password-human-verification',
            'popup,width=520,height=680',
        );
        expect(controller._passwordHumanVerificationRequest).toStrictEqual({
            popup,
            expectedOrigin: 'https://staging.sottaku.app',
            state: PASSWORD_HUMAN_STATE,
            action: 'password_recovery',
            transaction: PASSWORD_STEP_UP_TRANSACTION,
        });
    });
});
/* eslint-enable no-underscore-dangle, @typescript-eslint/no-unsafe-assignment */
