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

import {afterAll, afterEach, describe, expect, test, vi} from 'vitest';
import {API} from '../ext/js/comm/api.js';
import {supportsExtensionCommands} from '../ext/js/extension/command-support.js';
import {WebExtension} from '../ext/js/extension/web-extension.js';
import {HotkeyHelpController} from '../ext/js/input/hotkey-help-controller.js';
import {ExtensionKeyboardShortcutController} from '../ext/js/pages/settings/extension-keyboard-shortcuts-controller.js';
import {setupDomTest} from './fixtures/dom-test.js';

const {teardown} = await setupDomTest();
afterAll(() => teardown(global));
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.textContent = '';
});

/** @type {{name: string, os: string, navigator: {userAgent?: string, platform?: string, maxTouchPoints?: number}}[]} */
const mobileCases = [
    {name: 'reported iOS', os: 'ios', navigator: {}},
    {name: 'reported iPadOS', os: 'ipados', navigator: {}},
    {name: 'iPhone user agent', os: 'unknown', navigator: {userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X)'}},
    {name: 'iPad user agent', os: 'mac', navigator: {userAgent: 'Mozilla/5.0 (iPad; CPU OS 26_5 like Mac OS X)'}},
    {name: 'desktop-mode iPad', os: 'mac', navigator: {platform: 'MacIntel', maxTouchPoints: 5, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)'}},
];

/**
 * @param {{browser: import('environment').Browser, platform: {os: string}}} environment
 * @returns {import('../ext/js/comm/api.js').API}
 */
function createApi(environment) {
    const api = new API(new WebExtension());
    vi.spyOn(api, 'getEnvironmentInfo').mockResolvedValue(/** @type {import('environment').Info} */ (environment));
    return api;
}

/** @returns {ReturnType<typeof vi.fn>} */
function forbidCommandsAccess() {
    const getCommands = vi.fn(() => { throw new Error('Unsafe commands namespace was accessed'); });
    const extension = Object.defineProperty({runtime: {}}, 'commands', {get: getCommands});
    vi.stubGlobal('chrome', extension);
    vi.stubGlobal('browser', extension);
    return getCommands;
}

/**
 * @param {import('../ext/js/comm/api.js').API} api
 * @returns {{controller: ExtensionKeyboardShortcutController, opener: HTMLButtonElement}}
 */
function createSettingsController(api) {
    for (const [tag, id] of [
        ['button', 'extension-hotkey-list-reset-all'],
        ['button', 'extension-hotkey-list-clear-all'],
        ['div', 'extension-hotkey-list'],
    ]) {
        const element = document.createElement(tag);
        element.id = id;
        document.body.appendChild(element);
    }
    const opener = document.createElement('button');
    opener.dataset.modalAction = 'show,extension-keyboard-shortcuts';
    document.body.appendChild(opener);
    const settings = /** @type {import('../ext/js/pages/settings/settings-controller.js').SettingsController} */ ({application: {api}});
    return {controller: new ExtensionKeyboardShortcutController(settings), opener};
}

describe('extension command platform guard', () => {
    test.each(mobileCases)('skips commands for $name', ({os, navigator}) => {
        vi.stubGlobal('navigator', navigator);
        const access = forbidCommandsAccess();
        expect(supportsExtensionCommands({browser: 'safari', platform: {os}})).toBe(false);
        expect(access).not.toHaveBeenCalled();
    });

    test('recognizes the Safari extension scheme even when environment browser detection differs', () => {
        vi.stubGlobal('location', {protocol: 'safari-web-extension:'});
        vi.stubGlobal('navigator', {platform: 'MacIntel', maxTouchPoints: 5});
        expect(supportsExtensionCommands({browser: 'chrome', platform: {os: 'mac'}})).toBe(false);
    });

    test.each(/** @type {import('environment').Browser[]} */ (['safari', 'chrome', 'firefox']))('retains desktop %s commands', (browser) => {
        vi.stubGlobal('location', {protocol: `${browser === 'safari' ? 'safari-web-extension' : 'chrome-extension'}:`});
        vi.stubGlobal('navigator', {platform: 'MacIntel', maxTouchPoints: 0, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)'});
        expect(supportsExtensionCommands({browser, platform: {os: 'mac'}})).toBe(true);
    });
});

describe('hotkey help', () => {
    test.each(mobileCases)('prepares without commands access on $name and keeps local shortcuts', async ({os, navigator}) => {
        vi.stubGlobal('navigator', navigator);
        const access = forbidCommandsAccess();
        const controller = new HotkeyHelpController();
        await controller.prepare(createApi({browser: 'safari', platform: {os}}));
        controller.setOptions(/** @type {import('settings').ProfileOptions} */ (/** @type {unknown} */ ({inputs: {
            hotkeys: [{enabled: true, action: 'save', key: 'KeyF', modifiers: []}],
        }})));
        const local = document.createElement('button');
        local.dataset.hotkey = JSON.stringify(['save', 'title', 'Save ({0})']);
        const global = document.createElement('button');
        global.title = 'Search';
        global.dataset.hotkey = JSON.stringify(['global:openSearch', 'title', 'Search ({0})']);
        document.body.append(local, global);

        controller.setupNode(document.body);

        expect(local.title).toBe('Save (F)');
        expect(global.title).toBe('Search');
        expect(access).not.toHaveBeenCalled();
    });

    test('desktop Safari still enumerates and displays its global shortcut', async () => {
        vi.stubGlobal('navigator', {platform: 'MacIntel', maxTouchPoints: 0});
        const getAll = vi.fn((/** @type {(commands: {name?: string, shortcut?: string}[]) => void} */ callback) => callback([{name: 'openSearch', shortcut: 'Command+F'}]));
        vi.stubGlobal('chrome', {runtime: {}, commands: {getAll}});
        const controller = new HotkeyHelpController();
        await controller.prepare(createApi({browser: 'safari', platform: {os: 'mac'}}));
        const node = document.createElement('button');
        node.dataset.hotkey = JSON.stringify(['global:openSearch', 'title', 'Search ({0})']);
        document.body.appendChild(node);

        controller.setupNode(document.body);

        expect(getAll).toHaveBeenCalledOnce();
        expect(node.title).toBe('Search (Cmd + F)');
    });
});

describe('global shortcut settings', () => {
    test.each(mobileCases)('hides unsupported settings and prevents enumeration/reset/update on $name', async ({os, navigator}) => {
        vi.stubGlobal('navigator', navigator);
        const access = forbidCommandsAccess();
        const {controller, opener} = createSettingsController(createApi({browser: 'safari', platform: {os}}));

        await controller.prepare();
        await controller.updateCommand('openSearch', 'KeyF', ['ctrl']);
        expect(await controller.resetCommand('openSearch')).toEqual({key: null, modifiers: []});

        expect(opener.hidden).toBe(true);
        expect(document.querySelector('#extension-hotkey-list-reset-all')?.hasAttribute('hidden')).toBe(true);
        expect(document.querySelector('#extension-hotkey-list-clear-all')?.hasAttribute('hidden')).toBe(true);
        expect(document.querySelector('#extension-hotkey-list')?.childElementCount).toBe(0);
        expect(controller.canModifyCommands()).toBe(false);
        expect(controller.canResetCommands()).toBe(false);
        expect(access).not.toHaveBeenCalled();
    });

    test('desktop Firefox retains enumeration and shortcut editing', async () => {
        vi.stubGlobal('navigator', {platform: 'Linux x86_64', maxTouchPoints: 0});
        const getAll = vi.fn((/** @type {(commands: {name?: string, shortcut?: string}[]) => void} */ callback) => callback([]));
        const update = vi.fn(async () => {});
        const reset = vi.fn(async () => {});
        vi.stubGlobal('chrome', {runtime: {}, commands: {getAll}});
        vi.stubGlobal('browser', {commands: {update, reset}});
        const {controller, opener} = createSettingsController(createApi({browser: 'firefox', platform: {os: 'linux'}}));

        await controller.prepare();
        await controller.updateCommand('openSearch', 'KeyF', ['ctrl']);
        await controller.resetCommand('openSearch');

        expect(opener.hidden).toBe(false);
        expect(controller.canModifyCommands()).toBe(true);
        expect(controller.canResetCommands()).toBe(true);
        expect(getAll).toHaveBeenCalledTimes(2);
        expect(update).toHaveBeenCalledExactlyOnceWith({name: 'openSearch', shortcut: 'Ctrl+F'});
        expect(reset).toHaveBeenCalledExactlyOnceWith('openSearch');
    });
});
