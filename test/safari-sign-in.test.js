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

import fs from 'fs';
import {afterAll, afterEach, expect, test, vi} from 'vitest';
import {SottakuClient} from '../ext/js/comm/sottaku-client.js';
import {parseJson} from '../ext/js/core/json.js';
import {localizeElement, setLocale} from '../ext/js/dom/i18n.js';
import {SottakuController} from '../ext/js/pages/settings/sottaku-controller.js';
import {setupDomTest} from './fixtures/dom-test.js';

const {teardown} = await setupDomTest();
const descriptionKey = 'settings_sottaku_safari_sign_in_description';
const permissionKey = 'settings_sottaku_safari_permission_required';
const connectionKey = 'settings_sottaku_safari_link_failed';
const settingsHtml = fs.readFileSync(new URL('../ext/settings.html', import.meta.url), 'utf8');
const localeDirectory = new URL('../ext/_locales/', import.meta.url);
const locales = fs.readdirSync(localeDirectory);
afterAll(() => teardown(global));
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.textContent = '';
});

/**
 * @param {string} [protocol]
 * @param {string} [authToken]
 * @returns {SottakuController}
 * @throws {Error}
 */
function createController(protocol = 'safari-web-extension:', authToken = '') {
    vi.stubGlobal('chrome', {
        runtime: {getURL: (/** @type {string} */ path) => `${protocol}//extension.test${path}`},
        permissions: {request: vi.fn((/** @type {{origins?: string[]}} */ _permissions, /** @type {(granted: boolean) => void} */ callback) => callback(true))},
    });
    const body = settingsHtml.match(/<body[^>]*>([\s\S]*)<\/body>/u)?.[1];
    if (!body) { throw new Error('Settings body is missing'); }
    // This fixture is the repository's own settings HTML, never external content.
    // eslint-disable-next-line no-unsanitized/property
    document.body.innerHTML = body;
    const controller = new SottakuController(/** @type {import('../ext/js/pages/settings/settings-controller.js').SettingsController} */ ({}));
    Reflect.set(controller, '_options', {sottaku: {enabled: true, authToken, refreshToken: 'existing-refresh', user: {username: 'test'}}});
    return controller;
}

/**
 * @param {SottakuController} controller
 * @returns {Promise<void>}
 */
function clickBrowserLink(controller) {
    return Reflect.get(controller, '_onBrowserLinkClick').call(controller, new Event('click'));
}

// Preserve the inferred signatures of the spies returned by this fixture.
// eslint-disable-next-line jsdoc/require-returns
/** @param {SottakuController} controller */
function prepareBrowserLink(controller) {
    const openTab = vi.fn().mockResolvedValue({id: 7});
    const applyAuth = vi.fn().mockResolvedValue(void 0);
    Reflect.set(controller, '_openTab', openTab);
    Reflect.set(controller, '_closeTab', vi.fn().mockResolvedValue(void 0));
    Reflect.set(controller, '_applyAuthUpdate', applyAuth);
    const createLink = vi.spyOn(SottakuClient.prototype, 'createBrowserLink').mockReturnValue({linkToken: 'one-time-link', url: 'https://sottaku.app/extension/link?token=one-time-link'});
    const exchange = vi.spyOn(SottakuClient.prototype, 'exchangeBrowserLink').mockResolvedValue({status: 'linked', token: 'scoped-access', refreshToken: 'scoped-refresh', user: {id: 1}});
    return {openTab, applyAuth, createLink, exchange};
}

/** @param {SottakuController} controller */
function setStalePasswordFlow(controller) {
    Reflect.get(controller, '_passwordInput').value = 'transient-password';
    Reflect.get(controller, '_passwordStepUpCodeInput').value = '12345678';
    for (const field of ['_passwordStepUpTransaction', '_passwordStepUpChallengeId', '_passwordStepUpProof', '_passwordStepUpHumanVerificationToken', '_passwordStepUpHumanVerificationContext']) {
        Reflect.set(controller, field, 'transient-secret');
    }
    Reflect.set(controller, '_passwordHumanVerificationAction', 'password_recovery');
    Reflect.set(controller, '_passwordHumanRecoveryAvailable', true);
    Reflect.get(controller, '_authForm').hidden = true;
    Reflect.get(controller, '_passwordStepUpForm').hidden = false;
    Reflect.get(controller, '_passwordHumanVerificationForm').hidden = false;
}

/** @param {SottakuController} controller */
function expectPasswordFlowCleared(controller) {
    expect(Reflect.get(controller, '_passwordInput').value).toBe('');
    expect(Reflect.get(controller, '_passwordStepUpCodeInput').value).toBe('');
    for (const field of ['_passwordStepUpTransaction', '_passwordStepUpChallengeId', '_passwordStepUpProof', '_passwordStepUpHumanVerificationToken', '_passwordStepUpHumanVerificationContext', '_passwordHumanVerificationAction', '_passwordHumanVerificationRequest']) {
        expect(Reflect.get(controller, field)).toBeNull();
    }
    expect(Reflect.get(controller, '_passwordStepUpForm').hidden).toBe(true);
    expect(Reflect.get(controller, '_passwordHumanVerificationForm').hidden).toBe(true);
}

test.each(['safari-web-extension:', 'chrome-extension:', 'moz-extension:'])('settings offer the appropriate sign-in controls for %s', (protocol) => {
    const controller = createController(protocol);
    Reflect.get(controller, '_updateStatus').call(controller);
    const safari = protocol === 'safari-web-extension:';
    for (const field of ['_usernameInput', '_passwordInput', '_loginButton']) {
        expect(Reflect.get(controller, field).hidden).toBe(safari);
    }
    const authForm = Reflect.get(controller, '_authForm');
    expect(authForm.hidden).toBe(false);
    expect(authForm.contains(Reflect.get(controller, '_browserLinkButton'))).toBe(true);
    expect(Reflect.get(controller, '_browserLinkButton').closest('[data-hide-for-browser~=safari]')).toBeNull();
    expect(document.querySelector(`[data-i18n="${descriptionKey}"]`)?.getAttribute('data-show-for-browser')).toBe('safari');
});

test.each([
    ['_onLoginClick', [{preventDefault: vi.fn()}]],
    ['_beginPasswordStepUp', ['transaction', true]],
    ['_verifyPasswordStepUp', ['human-token', 'context']],
    ['_beginPasswordHumanVerification', ['password_recovery', 'transaction']],
    ['_beginPasswordHumanVerification', ['password_step_up_code', null]],
    ['_onPasswordHumanVerificationClick', [{preventDefault: vi.fn()}]],
    ['_onPasswordStepUpResend', [{preventDefault: vi.fn()}]],
])('Safari recovers from a stale password flow through %s', async (method, args) => {
    const controller = createController();
    setStalePasswordFlow(controller);
    const close = vi.fn();
    Reflect.set(controller, '_passwordHumanVerificationRequest', {popup: {close}});
    const fetch = vi.fn();
    const open = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('open', open);

    await Reflect.get(controller, /** @type {string} */ (method)).apply(controller, args);

    expectPasswordFlowCleared(controller);
    expect(close).toHaveBeenCalledOnce();
    expect(Reflect.get(controller, '_authForm').hidden).toBe(false);
    expect(document.activeElement).toBe(Reflect.get(controller, '_browserLinkButton'));
    expect(Reflect.get(controller, '_statusNode').dataset.i18n).toBe(descriptionKey);
    expect(fetch).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
});

test('a Safari account already linked by password retains its credentials and connected controls', () => {
    const controller = createController('safari-web-extension:', 'existing-access');
    setStalePasswordFlow(controller);
    Reflect.get(controller, '_updateStatus').call(controller);
    expectPasswordFlowCleared(controller);
    expect(Reflect.get(controller, '_options')?.sottaku).toMatchObject({authToken: 'existing-access', refreshToken: 'existing-refresh'});
    expect(Reflect.get(controller, '_authForm').hidden).toBe(true);
    expect(Reflect.get(controller, '_linkedActions').hidden).toBe(false);
});

test('Safari ignores old password popup callbacks without consuming a proof', async () => {
    const controller = createController();
    setStalePasswordFlow(controller);
    const verify = vi.spyOn(SottakuClient.prototype, 'verifyPasswordRecoveryHuman');
    await Reflect.get(controller, '_onPasswordHumanVerificationMessage').call(controller, new MessageEvent('message', {data: {type: 'sottaku-password-human-verification'}}));
    expect(verify).not.toHaveBeenCalled();
    expectPasswordFlowCleared(controller);
    expect(Reflect.get(controller, '_authForm').hidden).toBe(false);
});

test('Safari browser approval clears transient secrets and connects only after approval', async () => {
    const controller = createController();
    setStalePasswordFlow(controller);
    const openTab = vi.fn().mockResolvedValue({id: 7});
    const closeTab = vi.fn().mockResolvedValue(void 0);
    const applyAuth = vi.fn().mockResolvedValue(void 0);
    Reflect.set(controller, '_openTab', openTab);
    Reflect.set(controller, '_closeTab', closeTab);
    Reflect.set(controller, '_applyAuthUpdate', applyAuth);
    Reflect.set(controller, '_delay', vi.fn().mockResolvedValue(void 0));
    vi.spyOn(SottakuClient.prototype, 'createBrowserLink').mockReturnValue({linkToken: 'one-time-link', url: 'https://sottaku.app/extension/link?token=one-time-link'});
    vi.spyOn(SottakuClient.prototype, 'exchangeBrowserLink')
        .mockImplementationOnce(async () => {
            expectPasswordFlowCleared(controller);
            expect(applyAuth).not.toHaveBeenCalled();
            return {status: 'pending'};
        })
        .mockResolvedValueOnce({status: 'linked', token: 'scoped-access', refreshToken: 'scoped-refresh', user: {id: 1}});

    await Reflect.get(controller, '_onBrowserLinkClick').call(controller, new Event('click'));

    expect(openTab).toHaveBeenCalledExactlyOnceWith('https://sottaku.app/extension/link?token=one-time-link');
    expect(applyAuth).toHaveBeenCalledExactlyOnceWith('scoped-access', {id: 1}, 'scoped-refresh');
    expect(closeTab).toHaveBeenCalledExactlyOnceWith(7);
});

test('canceled or expired Safari approval stays disconnected and permits a fresh browser link', async () => {
    const controller = createController();
    const applyAuth = vi.fn();
    Reflect.set(controller, '_openTab', vi.fn().mockResolvedValue({id: 7}));
    Reflect.set(controller, '_applyAuthUpdate', applyAuth);
    Reflect.set(controller, '_delay', vi.fn().mockResolvedValue(void 0));
    const createBrowserLink = vi.spyOn(SottakuClient.prototype, 'createBrowserLink').mockReturnValue({linkToken: 'new-link', url: 'https://sottaku.app/extension/link?token=new-link'});
    vi.spyOn(SottakuClient.prototype, 'exchangeBrowserLink').mockResolvedValue({status: 'pending'});

    await Reflect.get(controller, '_onBrowserLinkClick').call(controller, new Event('click'));

    expect(applyAuth).not.toHaveBeenCalled();
    expect(Reflect.get(controller, '_busy')).toBe(false);
    expect(Reflect.get(controller, '_authForm').hidden).toBe(false);
    await Reflect.get(controller, '_onBrowserLinkClick').call(controller, new Event('click'));
    expect(createBrowserLink).toHaveBeenCalledTimes(2);
});

test('Safari requests only its API site within the click gesture and waits before starting approval', async () => {
    const controller = createController();
    const {openTab, applyAuth, createLink, exchange} = prepareBrowserLink(controller);
    /** @type {((granted: boolean) => void)[]} */
    const callbacks = [];
    const request = vi.spyOn(chrome.permissions, 'request').mockImplementation((_permissions, callback) => { callbacks.push(callback); });

    const pending = clickBrowserLink(controller);

    // This assertion intentionally precedes any await: permission must retain the user gesture.
    expect(request).toHaveBeenCalledExactlyOnceWith({origins: ['https://sottaku.app/*']}, expect.any(Function));
    expect(createLink).not.toHaveBeenCalled();
    expect(openTab).not.toHaveBeenCalled();
    expect(exchange).not.toHaveBeenCalled();
    await clickBrowserLink(controller);
    expect(request).toHaveBeenCalledOnce();
    callbacks[0](true);
    await pending;
    expect(applyAuth).toHaveBeenCalledOnce();
});

test('denied Safari site access preserves credentials and permits a fresh approved retry', async () => {
    const controller = createController('safari-web-extension:', 'existing-access');
    const {openTab, applyAuth, createLink, exchange} = prepareBrowserLink(controller);
    vi.spyOn(chrome.permissions, 'request').mockImplementationOnce((_permissions, callback) => callback(false));

    await clickBrowserLink(controller);

    expect(openTab).not.toHaveBeenCalled();
    expect(createLink).not.toHaveBeenCalled();
    expect(exchange).not.toHaveBeenCalled();
    expect(applyAuth).not.toHaveBeenCalled();
    expect(Reflect.get(controller, '_options')?.sottaku).toMatchObject({authToken: 'existing-access', refreshToken: 'existing-refresh'});
    expect(Reflect.get(controller, '_statusNode').dataset).toMatchObject({i18n: permissionKey, i18nArgs: '["sottaku.app"]'});
    expect(Reflect.get(controller, '_busy')).toBe(false);
    await clickBrowserLink(controller);
    expect(createLink).toHaveBeenCalledOnce();
    expect(applyAuth).toHaveBeenCalledOnce();
});

test.each(['throws', 'lastError', 'unavailable'])('Safari permission API failure (%s) gives site-access guidance without opening approval', async (mode) => {
    const controller = createController();
    const {openTab, applyAuth, createLink} = prepareBrowserLink(controller);
    if (mode === 'unavailable') {
        Reflect.deleteProperty(chrome, 'permissions');
    } else {
        vi.spyOn(chrome.permissions, 'request').mockImplementation((_permissions, callback) => {
            if (mode === 'throws') { throw new Error('Native permission request failed'); }
            Reflect.set(chrome.runtime, 'lastError', {message: 'Native permission request failed'});
            callback(false);
            Reflect.deleteProperty(chrome.runtime, 'lastError');
        });
    }

    await clickBrowserLink(controller);

    expect(Reflect.get(controller, '_statusNode').dataset.i18n).toBe(permissionKey);
    expect(Reflect.get(controller, '_statusNode').textContent).not.toContain('Native permission');
    expect(Reflect.get(controller, '_busy')).toBe(false);
    expect(openTab).not.toHaveBeenCalled();
    expect(createLink).not.toHaveBeenCalled();
    expect(applyAuth).not.toHaveBeenCalled();
});

test('Safari network failure gives recovery guidance and a retry uses a new approval token', async () => {
    const controller = createController();
    const {createLink, exchange, applyAuth} = prepareBrowserLink(controller);
    exchange.mockRejectedValueOnce(new TypeError('Load failed: private-one-time-token'));

    await clickBrowserLink(controller);

    expect(Reflect.get(controller, '_statusNode').dataset.i18n).toBe(connectionKey);
    expect(Reflect.get(controller, '_statusNode').textContent).not.toMatch(/Load failed|private-one-time-token/u);
    expect(applyAuth).not.toHaveBeenCalled();
    expect(Reflect.get(controller, '_busy')).toBe(false);
    createLink.mockReturnValueOnce({linkToken: 'fresh-link', url: 'https://sottaku.app/extension/link?token=fresh-link'});
    await clickBrowserLink(controller);
    expect(exchange).toHaveBeenLastCalledWith('fresh-link');
    expect(applyAuth).toHaveBeenCalledOnce();
});

test('Safari requests the configured staging site without adding production or other hosts', async () => {
    const controller = createController();
    Reflect.get(controller, '_client').setConfig({apiBaseUrl: 'https://staging.sottaku.app/api/v1'});
    prepareBrowserLink(controller);
    await clickBrowserLink(controller);
    expect(chrome.permissions.request).toHaveBeenCalledExactlyOnceWith({origins: ['https://staging.sottaku.app/*']}, expect.any(Function));
});

test.each(['chrome-extension:', 'moz-extension:'])('browser linking in %s retains its flow without reading Safari permissions', async (protocol) => {
    const controller = createController(protocol);
    const {applyAuth} = prepareBrowserLink(controller);
    Object.defineProperty(chrome, 'permissions', {get: () => { throw new Error('Desktop must not request Safari site access'); }});
    await clickBrowserLink(controller);
    expect(applyAuth).toHaveBeenCalledOnce();
});

test.each([permissionKey, connectionKey])('the native locale fallback receives the hostname for %s before an account locale loads', async (key) => {
    createController();
    vi.resetModules();
    const {getMessage: freshGetMessage, localizeElement: freshLocalizeElement} = await import('../ext/js/dom/i18n.js');
    const catalog = /** @type {Record<string, {message: string}>} */ (parseJson(fs.readFileSync(new URL('ja/messages.json', localeDirectory), 'utf8')));
    const expected = catalog[key].message.replace('$1', 'sottaku.app');
    const nativeGetMessage = vi.fn().mockReturnValue(expected);
    Reflect.set(chrome, 'i18n', {getMessage: nativeGetMessage});

    expect(freshGetMessage(key, ['sottaku.app'])).toBe(expected);
    expect(nativeGetMessage).toHaveBeenCalledExactlyOnceWith(key, ['sottaku.app']);
    const status = document.createElement('div');
    status.dataset.i18n = key;
    status.dataset.i18nArgs = '["sottaku.app"]';
    nativeGetMessage.mockClear();
    freshLocalizeElement(status);
    expect(nativeGetMessage).toHaveBeenCalledExactlyOnceWith(key, ['sottaku.app']);
    expect(status.textContent).toContain('Sottaku-Yomitanにsottaku.appへの');
});

test.each(locales)('Safari website instructions localize in %s without English fallback', async (locale) => {
    const controller = createController();
    vi.stubGlobal('fetch', vi.fn(async (/** @type {string} */ url) => {
        const language = new URL(url).pathname.split('/')[2];
        return new Response(fs.readFileSync(new URL(`${language}/messages.json`, localeDirectory), 'utf8'), {headers: {'Content-Type': 'application/json'}});
    }));
    const catalog = /** @type {Record<string, {message: string}>} */ (parseJson(fs.readFileSync(new URL(`${locale}/messages.json`, localeDirectory), 'utf8')));
    expect(catalog[descriptionKey]?.message).toBeTruthy();
    await setLocale(locale);
    Reflect.get(controller, '_redirectPasswordSignInToBrowser').call(controller);
    localizeElement(document);
    expect(Reflect.get(controller, '_statusNode').textContent).toBe(catalog[descriptionKey].message);
    expect(document.querySelector(`[data-show-for-browser=safari][data-i18n="${descriptionKey}"]`)?.textContent).toBe(catalog[descriptionKey].message);

    const {exchange} = prepareBrowserLink(controller);
    vi.spyOn(chrome.permissions, 'request').mockImplementationOnce((_permissions, callback) => callback(false));
    await clickBrowserLink(controller);
    localizeElement(document);
    expect(catalog[permissionKey]?.message).toContain('$1');
    expect(Reflect.get(controller, '_statusNode').textContent).toBe(catalog[permissionKey].message.replace('$1', 'sottaku.app'));
    exchange.mockRejectedValueOnce(new TypeError('Load failed'));
    await clickBrowserLink(controller);
    localizeElement(document);
    expect(catalog[connectionKey]?.message).toContain('$1');
    expect(Reflect.get(controller, '_statusNode').textContent).toBe(catalog[connectionKey].message.replace('$1', 'sottaku.app'));
});
