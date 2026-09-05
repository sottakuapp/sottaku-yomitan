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

import fs from 'fs';
import {afterAll, afterEach, expect, test, vi} from 'vitest';
import {localizeElement, setLocale} from '../ext/js/dom/i18n.js';
import {LocaleDirectionController} from '../ext/js/dom/locale-direction-controller.js';
import {SottakuController} from '../ext/js/pages/settings/sottaku-controller.js';
import {setupDomTest} from './fixtures/dom-test.js';

const {teardown} = await setupDomTest();
afterAll(() => teardown(global));
afterEach(() => {
    vi.unstubAllGlobals();
    document.body.textContent = '';
});

/**
 * @param {() => Promise<void>} [waitForArabic]
 */
function mockLocaleLoading(waitForArabic = async () => {}) {
    vi.stubGlobal('chrome', {runtime: {getURL: (/** @type {string} */ path) => `https://extension.test${path}`}});
    vi.stubGlobal('fetch', vi.fn(async (/** @type {string} */ url) => {
        const locale = new URL(url).pathname.split('/')[2];
        if (locale === 'ar') { await waitForArabic(); }
        const catalog = fs.readFileSync(new URL(`../ext/_locales/${locale}/messages.json`, import.meta.url), 'utf8');
        return new Response(catalog, {headers: {'Content-Type': 'application/json'}});
    }));
}

/** @returns {SottakuController} */
function createStatusController() {
    document.body.innerHTML = '<div id="status" data-i18n="settings_sottaku_status_not_connected"></div><form></form><section></section>';
    return Object.assign(Object.create(SottakuController.prototype), {
        _statusNode: document.querySelector('#status'),
        _authForm: document.querySelector('form'),
        _linkedActions: document.querySelector('section'),
        _options: {sottaku: {authToken: '', refreshToken: '', enabled: true, user: null}},
    });
}

test('account locale loading preserves the connected status after browser linking', () => {
    vi.stubGlobal('chrome', {i18n: {getMessage: () => 'Not connected'}});
    const statusNode = document.createElement('div');
    statusNode.dataset.i18n = 'settings_sottaku_account_not_connected';
    statusNode.textContent = 'Not connected';
    const controller = {_statusNode: statusNode};

    Reflect.get(SottakuController.prototype, '_setStatus').call(controller, 'Signed in as test account', false);
    localizeElement(statusNode);

    expect(statusNode.textContent).toBe('Signed in as test account');
    expect(statusNode.classList.contains('danger-text')).toBe(false);
});

test('browser linking relocalizes the authenticated Japanese status when Arabic finishes loading', async () => {
    let finishArabic = () => {};
    /** @type {Promise<void>} */
    const arabicReady = new Promise((resolve) => { finishArabic = resolve; });
    mockLocaleLoading(() => arabicReady);
    await setLocale('ja');
    const controller = createStatusController();
    const options = Reflect.get(controller, '_options');
    if (options === null) { throw new Error('Missing test options'); }
    const clientSetConfig = vi.fn();
    const modifyProfileSettings = vi.fn(async (/** @type {import('settings-modifications').Modification[]} */ updates) => {
        for (const update of updates) {
            if (update.action === 'set') { Reflect.set(options.sottaku, update.path.split('.')[1], update.value); }
        }
    });
    const localeController = new LocaleDirectionController();
    let localeApplied = Promise.resolve();
    const refresh = vi.fn(async () => {
        localeApplied = localeController.applyFromOptions(options);
        Reflect.get(controller, '_updateStatus').call(controller);
    });
    Reflect.set(controller, '_client', {setConfig: clientSetConfig});
    Reflect.set(controller, '_settingsController', {modifyProfileSettings, refresh});

    await Reflect.get(controller, '_applyAuthUpdate').call(controller, 'test-auth', {username: 'admin', ui_locale: 'ar', is_pro: true}, 'test-refresh');
    const statusNode = Reflect.get(controller, '_statusNode');
    expect(statusNode.textContent).toBe('admin としてサインイン済み');
    finishArabic();
    await localeApplied;

    expect(statusNode.textContent).toBe('تم تسجيل الدخول باسم admin');
    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(statusNode.classList.contains('danger-text')).toBe(false);
    expect(Reflect.get(controller, '_authForm').hidden).toBe(true);
    expect(Reflect.get(controller, '_linkedActions').hidden).toBe(false);
    expect(options.sottaku).toMatchObject({authToken: 'test-auth', refreshToken: 'test-refresh', user: {username: 'admin', isPro: true}});
    expect(modifyProfileSettings).toHaveBeenCalledTimes(1);
    expect(clientSetConfig).toHaveBeenCalledExactlyOnceWith({authToken: 'test-auth', refreshToken: 'test-refresh'});
    expect(refresh).toHaveBeenCalledTimes(1);
});

test('a transient error survives a later locale pass without restoring a stale account label', async () => {
    mockLocaleLoading();
    await setLocale('ja');
    const controller = createStatusController();
    Reflect.get(controller, '_updateStatus').call(controller, {authToken: 'test-auth', user: {username: 'admin'}, enabled: true});
    Reflect.get(controller, '_setStatus').call(controller, 'Account request failed', true);
    await setLocale('ar');
    localizeElement(document);

    const statusNode = Reflect.get(controller, '_statusNode');
    expect(statusNode.textContent).toBe('Account request failed');
    expect(statusNode.classList.contains('danger-text')).toBe(true);
    expect(statusNode.dataset.i18nArgs).toBeUndefined();
});

test('disconnected and unnamed account statuses discard the previous username while relocalizing', async () => {
    mockLocaleLoading();
    await setLocale('ja');
    const controller = createStatusController();
    Reflect.get(controller, '_updateStatus').call(controller, {authToken: 'test-auth', user: {username: '<img src=x onerror=alert(1)>'}, enabled: true});
    const statusNode = Reflect.get(controller, '_statusNode');
    expect(statusNode.children).toHaveLength(0);
    Reflect.get(controller, '_updateStatus').call(controller, {authToken: 'test-auth', user: null, enabled: true});
    await setLocale('ar');
    localizeElement(document);
    expect(statusNode.textContent).toBe('تم تسجيل الدخول');
    expect(statusNode.dataset.i18nArgs).toBeUndefined();

    Reflect.get(controller, '_updateStatus').call(controller, {authToken: '', user: null, enabled: false});
    await setLocale('ja');
    localizeElement(document);
    expect(statusNode.textContent).toBe('未接続');
    expect(statusNode.classList.contains('danger-text')).toBe(true);
    expect(Reflect.get(controller, '_authForm').hidden).toBe(false);
    expect(Reflect.get(controller, '_linkedActions').hidden).toBe(true);
});
