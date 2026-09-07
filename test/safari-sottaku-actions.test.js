/*
 * Copyright (C) 2025-2026  Sottaku Inc
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
import {Backend} from '../ext/js/background/backend.js';
import {API} from '../ext/js/comm/api.js';
import {createApiMap, invokeApiMapHandler} from '../ext/js/core/api-map.js';
import {parseJson} from '../ext/js/core/json.js';

/** @typedef {import('api').ApiParams<'sottakuAddFlashcard'>} ActionParams */
/** @typedef {'sottakuAddFlashcard'|'sottakuSubmitWordRequest'} ActionName */
/** @typedef {NonNullable<ReturnType<typeof globalThis.chrome.runtime.connect>['sender']>} MessageSender */

const extensionId = 'sottaku-safari-test';
const extensionRoot = `safari-web-extension://${extensionId}/`;
const trustedSender = {id: extensionId, url: `${extensionRoot}popup.html`};
const validParams = {questionId: 1461, language: 'ja', optionsContext: {current: true}, expectedUserId: 1};
const actions = [
    {name: /** @type {const} */ ('sottakuAddFlashcard'), path: '/flashcards/add', body: {questionId: 1461, language: 'ja'}},
    {name: /** @type {const} */ ('sottakuSubmitWordRequest'), path: '/word_requests/submit', body: {question_id: 1461, language: 'ja'}},
];

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

// Preserve inference for the distinct mock signatures returned by this fixture.
// eslint-disable-next-line jsdoc/require-returns
/**
 * Use real backend validation, API serialization, and SottakuClient HTTP behavior.
 * Only native transport, stored profile lookup, and the network are replaced.
 */
function createBackend() {
    const backend = /** @type {Backend} */ ({});
    Object.setPrototypeOf(backend, Backend.prototype);
    const profile = {
        sottaku: {
            enabled: true,
            apiBaseUrl: 'https://sottaku.app/api/v1',
            authToken: 'test-access-a',
            refreshToken: 'test-refresh-a',
            user: {id: 1, isPro: true},
        },
    };
    const getProfile = vi.fn(() => /** @type {object} */ (profile));
    const update = vi.fn(async () => {});
    const invalidate = vi.fn(async () => {});
    Reflect.set(backend, '_getProfileOptions', getProfile);
    Reflect.set(backend, '_handleSottakuAuthTokenUpdate', update);
    Reflect.set(backend, '_handleSottakuAuthTokenInvalidate', invalidate);
    /** @type {unknown[]} */
    const sent = [];
    /** @type {unknown[]} */
    const received = [];
    /** @type {MessageSender} */
    let sender = trustedSender;
    /** @type {import('api').ApiMap} */
    const map = createApiMap([
        ['sottakuAddFlashcard', handler(backend, 'sottakuAddFlashcard')],
        ['sottakuSubmitWordRequest', handler(backend, 'sottakuSubmitWordRequest')],
    ]);
    const webExtension = {
        /**
         * @param {import('api').ApiMessageAny} message
         * @param {(response: unknown) => void} callback
         */
        sendMessage: (message, callback) => {
            sent.push(message);
            invokeApiMapHandler(map, message.action, /** @type {ActionParams} */ (message.params), [sender], (response) => {
                received.push(response);
                callback(response);
            });
        },
        getLastError: () => {},
    };
    vi.stubGlobal('chrome', {runtime: {id: extensionId, getURL: (/** @type {string} */ path) => `${extensionRoot}${path.replace(/^\//, '')}`}});
    const fetchMock = vi.fn(/** @type {(url: string, options: {headers: Record<string, string>, body: string}) => Promise<Response>} */ (
        async () => jsonResponse({success: true, data: {private: 'must-not-return'}})
    ));
    vi.stubGlobal('fetch', fetchMock);
    const api = new API(/** @type {import('../ext/js/extension/web-extension.js').WebExtension} */ (/** @type {unknown} */ (webExtension)));
    return {
        backend,
        profile,
        getProfile,
        update,
        invalidate,
        fetchMock,
        api,
        sent,
        received,
        setSender: (/** @type {MessageSender} */ value) => { sender = value; },
    };
}

/**
 * @param {Backend} backend
 * @param {ActionName} action
 * @returns {import('api').ApiHandler<'sottakuAddFlashcard'>}
 */
function handler(backend, action) {
    const method = action === 'sottakuAddFlashcard' ? '_onApiSottakuAddFlashcard' : '_onApiSottakuSubmitWordRequest';
    const fn = /** @type {import('api').ApiHandler<'sottakuAddFlashcard'>} */ (Reflect.get(backend, method));
    return fn.bind(backend);
}

/**
 * @param {unknown} body
 * @param {number} [status]
 * @param {Record<string, string>} [headers]
 * @returns {Response}
 */
function jsonResponse(body, status = 200, headers = {}) {
    return new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json', ...headers}});
}

describe('Safari named Sottaku actions', () => {
    test.each(actions)('$name uses only its fixed endpoint with stored credentials and returns no server data', async ({name, path, body}) => {
        const fixture = createBackend();
        const result = await fixture.api[name](1461, 'ja', {current: true}, 1);
        expect(result).toBeUndefined();
        expect(fixture.sent).toEqual([{action: name, params: validParams}]);
        expect(fixture.received).toEqual([{result: void 0}]);
        expect(fixture.getProfile).toHaveBeenCalledExactlyOnceWith({current: true}, false);
        expect(fixture.fetchMock).toHaveBeenCalledExactlyOnceWith(`https://sottaku.app/api/v1${path}`, expect.objectContaining({
            method: 'POST',
            credentials: 'omit',
            body: JSON.stringify(body),
            headers: /** @type {unknown} */ (expect.objectContaining({Authorization: 'Bearer test-access-a'})),
        }));
    });

    test.each(actions)('$name rejects untrusted native senders before reading credentials or using the network', async ({name}) => {
        const fixture = createBackend();
        const invalidSenders = [
            {},
            {id: extensionId},
            {id: 'other-extension', url: trustedSender.url},
            {id: extensionId, url: 'https://sottaku.app/extension/setup'},
            {id: extensionId, url: 'https://attacker.example/article'},
            {id: extensionId, url: 'about:blank'},
            {id: extensionId, url: 'null'},
            {id: extensionId, url: `safari-web-extension://${extensionId}.evil/popup.html`},
            {id: extensionId, url: `chrome-extension://${extensionId}/popup.html`},
            {id: extensionId, url: `https://${extensionId}/popup.html`},
        ];
        for (const sender of invalidSenders) {
            fixture.setSender(sender);
            await expect(fixture.api[name](1461, 'ja', {current: true}, 1)).rejects.toThrow('Untrusted extension context');
        }
        expect(fixture.getProfile).not.toHaveBeenCalled();
        expect(fixture.fetchMock).not.toHaveBeenCalled();
    });

    test.each(actions)('$name rejects extra parameters, malformed identities, and unknown languages', async ({name}) => {
        const fixture = createBackend();
        const run = handler(fixture.backend, name);
        const invalid = [
            null,
            [],
            {},
            ...[0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1461', null].map((questionId) => ({...validParams, questionId})),
            ...[0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1', null, void 0].map((expectedUserId) => ({...validParams, expectedUserId})),
            ...['', 'xx', 'JA', '../flashcards/add', null].map((language) => ({...validParams, language})),
            ...['url', 'headers', 'authToken', 'refreshToken', 'method', 'body'].map((field) => ({...validParams, [field]: 'caller-input'})),
        ];
        for (const params of invalid) {
            await expect(run(/** @type {ActionParams} */ (params), trustedSender)).rejects.toThrow();
        }
        expect(fixture.getProfile).not.toHaveBeenCalled();
        expect(fixture.fetchMock).not.toHaveBeenCalled();
    });

    test('rejects invalid profile selection and condition fields before resolving a stored profile', async () => {
        const fixture = createBackend();
        const run = handler(fixture.backend, 'sottakuAddFlashcard');
        const contexts = [
            null,
            [],
            {},
            {current: false},
            {index: -1},
            {index: 0.5},
            {index: '0'},
            {current: true, index: 0},
            {current: true, url: 'https://example.com'},
            {url: 'not a URL', depth: 0},
            {url: 'https://example.com'},
            {url: 'https://example.com', depth: -1},
            {url: 'https://example.com', depth: 0.5},
            {url: `https://example.com/${'x'.repeat(16384)}`, depth: 0},
            {current: true, authToken: 'caller-input'},
            {current: true, flags: 'clipboard'},
            {current: true, flags: ['unknown']},
            {current: true, modifiers: ['escape']},
            {current: true, modifierKeys: ['mouse0']},
            {current: true, pointerType: 'unknown'},
        ];
        for (const optionsContext of contexts) {
            await expect(run(/** @type {ActionParams} */ ({...validParams, optionsContext}), trustedSender)).rejects.toThrow();
        }
        expect(fixture.getProfile).not.toHaveBeenCalled();
        expect(fixture.fetchMock).not.toHaveBeenCalled();
    });

    test('accepts current, explicit profile, and URL-based selection with legitimate input conditions', async () => {
        const fixture = createBackend();
        const contexts = [
            {current: true},
            {index: 2},
            {url: 'https://example.com/article#word', depth: 0, flags: ['clipboard'], modifiers: ['ctrl', 'mouse0'], modifierKeys: ['shift'], pointerType: 'touch'},
        ];
        for (const context of contexts) {
            await fixture.api.sottakuAddFlashcard(1461, 'ja', /** @type {import('settings').OptionsContext} */ (context), 1);
            expect(fixture.getProfile).toHaveBeenLastCalledWith(context, false);
        }
        expect(fixture.fetchMock).toHaveBeenCalledTimes(3);
    });

    test.each(actions)('$name fails closed when the account disconnected or changed since popup rendering', async ({name}) => {
        const fixture = createBackend();
        for (const changed of [{enabled: false}, {authToken: ''}, {user: null}, {user: {id: 2}}]) {
            fixture.getProfile.mockReturnValue({sottaku: {...fixture.profile.sottaku, ...changed}});
            await expect(fixture.api[name](1461, 'ja', {current: true}, 1)).rejects.toThrow('account changed or disconnected');
        }
        expect(fixture.fetchMock).not.toHaveBeenCalled();
    });

    test('uses current stored credentials on the next action while an in-flight action remains bound to its original account', async () => {
        const fixture = createBackend();
        /** @type {(response: Response) => void} */
        let finishFirst = () => {};
        fixture.fetchMock.mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }));
        const first = fixture.api.sottakuAddFlashcard(1461, 'ja', {current: true}, 1);
        fixture.profile.sottaku.authToken = 'test-access-b';
        fixture.profile.sottaku.refreshToken = 'test-refresh-b';
        fixture.profile.sottaku.user.id = 2;
        await fixture.api.sottakuSubmitWordRequest(346, 'ja', {current: true}, 2);
        finishFirst(jsonResponse({success: true}, 200, {'X-New-Token': 'test-access-a-rotated'}));
        await first;
        expect(fixture.fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer test-access-a');
        expect(fixture.fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer test-access-b');
        expect(fixture.update).toHaveBeenCalledExactlyOnceWith('https://sottaku.app/api/v1', 'test-access-a', 'test-access-a-rotated');
        expect(fixture.invalidate).not.toHaveBeenCalled();
    });

    test('refreshes expired credentials through the existing bound callback and retries only the fixed action', async () => {
        const fixture = createBackend();
        fixture.fetchMock
            .mockResolvedValueOnce(jsonResponse({error: 'Invalid or expired token', code: 'TOKEN_EXPIRED'}, 401))
            .mockResolvedValueOnce(jsonResponse({token: 'test-refreshed'}))
            .mockResolvedValueOnce(jsonResponse({success: true}));
        await fixture.api.sottakuAddFlashcard(1461, 'ja', {current: true}, 1);
        expect(fixture.fetchMock.mock.calls.map(([url]) => url)).toEqual([
            'https://sottaku.app/api/v1/flashcards/add', 'https://sottaku.app/api/v1/auth/extension-refresh', 'https://sottaku.app/api/v1/flashcards/add',
        ]);
        expect(parseJson(fixture.fetchMock.mock.calls[1][1].body)).toEqual({refresh_token: 'test-refresh-a'});
        expect(fixture.fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer test-refreshed');
        expect(fixture.update).toHaveBeenCalledExactlyOnceWith('https://sottaku.app/api/v1', 'test-access-a', 'test-refreshed');
        expect(fixture.received).toEqual([{result: void 0}]);
    });

    test('invalidates a rejected session through the existing callback without exposing credentials', async () => {
        const fixture = createBackend();
        fixture.fetchMock
            .mockResolvedValueOnce(jsonResponse({error: 'Invalid or expired token', code: 'TOKEN_EXPIRED'}, 401))
            .mockResolvedValueOnce(jsonResponse({error: 'Invalid refresh token'}, 401));
        await expect(fixture.api.sottakuAddFlashcard(1461, 'ja', {current: true}, 1)).rejects.toThrow('Invalid or expired token');
        expect(fixture.invalidate).toHaveBeenCalledWith('https://sottaku.app/api/v1', 'test-access-a');
        expect(JSON.stringify(fixture.received)).not.toContain('test-access-a');
        expect(JSON.stringify(fixture.received)).not.toContain('test-refresh-a');
    });

    test.each(actions)('$name preserves a non-Pro server rejection without returning its response payload', async ({name}) => {
        const fixture = createBackend();
        fixture.profile.sottaku.user.isPro = false;
        fixture.fetchMock.mockResolvedValueOnce(jsonResponse({success: false, error: 'Sottaku Pro is required', data: {private: 'not-for-popup'}}, 403));
        await expect(fixture.api[name](1461, 'ja', {current: true}, 1)).rejects.toThrow('Sottaku Pro is required');
        expect(fixture.fetchMock).toHaveBeenCalledTimes(1);
        expect(fixture.update).not.toHaveBeenCalled();
        expect(fixture.invalidate).not.toHaveBeenCalled();
        expect(JSON.stringify(fixture.received)).not.toContain('not-for-popup');
    });
});
