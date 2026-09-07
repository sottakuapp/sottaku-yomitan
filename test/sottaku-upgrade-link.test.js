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
import {parseJson} from '../ext/js/core/json.js';
import {Display} from '../ext/js/display/display.js';
import {configureSottakuUpgradeLink} from '../ext/js/display/sottaku-upgrade-link.js';
import {localizeElement} from '../ext/js/dom/i18n.js';
import {setupDomTest} from './fixtures/dom-test.js';

const {teardown} = await setupDomTest();
afterAll(() => teardown(global));
afterEach(() => {
    vi.unstubAllGlobals();
    document.body.textContent = '';
});

/** @param {string} page */
function loadPage(page) {
    const html = fs.readFileSync(new URL(`../ext/${page}`, import.meta.url), 'utf8');
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    document.body.replaceChildren(...Array.from(parsed.body.childNodes, (node) => document.importNode(node, true)));
    vi.stubGlobal('chrome', {i18n: {getMessage: (/** @type {string} */ key) => (key === 'popup_open_sottaku' ? 'Open Sottaku' : '')}});
}

const mobileCases = [
    {name: 'iOS', os: 'ios', navigator: {}},
    {name: 'iPadOS', os: 'ipados', navigator: {}},
    {name: 'iPhone user agent', os: 'mac', navigator: {userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X)'}},
    {name: 'desktop-mode iPad', os: 'mac', navigator: {platform: 'MacIntel', maxTouchPoints: 5}},
];

for (const page of ['popup.html', 'search.html']) {
    test.each(mobileCases)(`${page}: $name opens only the native upgrade screen`, ({os, navigator}) => {
        loadPage(page);
        vi.stubGlobal('navigator', navigator);
        configureSottakuUpgradeLink(document, {browser: 'safari', platform: {os}});
        const link = document.querySelector('#sottaku-upgrade-required a');
        expect(link?.getAttribute('href')).toBe('sottaku://upgrade');
        expect(link?.textContent).toBe('Open Sottaku');
        expect(link?.getAttribute('data-i18n')).toBe('popup_open_sottaku');
        expect(link?.closest('.scan-disable')).not.toBeNull();
        localizeElement(document);
        expect(link?.textContent).toBe('Open Sottaku');
    });

    test.each(/** @type {import('environment').Browser[]} */ (['chrome', 'firefox', 'safari']))(`${page}: desktop %s retains the web upgrade link`, (browser) => {
        loadPage(page);
        vi.stubGlobal('navigator', {platform: 'MacIntel', maxTouchPoints: 0});
        configureSottakuUpgradeLink(document, {browser, platform: {os: 'mac'}});
        const link = document.querySelector('#sottaku-upgrade-required a');
        expect(link?.getAttribute('href')).toBe('https://sottaku.app/upgrade');
        expect(link?.getAttribute('data-i18n')).toBe('popup_pro_required_link');
        expect(link?.getAttribute('target')).toBe('_blank');
    });

    test.each(/** @type {import('environment').Browser[]} */ (['chrome', 'firefox']))(`${page}: %s does not change based on a mobile identity alone`, (browser) => {
        loadPage(page);
        vi.stubGlobal('navigator', {platform: 'MacIntel', maxTouchPoints: 5});
        configureSottakuUpgradeLink(document, {browser, platform: {os: 'ios'}});
        expect(document.querySelector('#sottaku-upgrade-required a')?.getAttribute('href')).toBe('https://sottaku.app/upgrade');
    });
}

test('Display preparation configures the link immediately after resolving its environment', async () => {
    loadPage('popup.html');
    const stopAfterConfiguration = new Error('Stop before dictionary preparation');
    const display = {
        _themeController: {prepare: vi.fn()},
        _application: {api: {
            getEnvironmentInfo: vi.fn().mockResolvedValue({browser: 'safari', platform: {os: 'ios'}}),
            getLanguageSummaries: vi.fn().mockRejectedValue(stopAfterConfiguration),
        }},
    };
    await expect(Reflect.get(Display.prototype, 'prepare').call(display)).rejects.toBe(stopAfterConfiguration);
    expect(document.querySelector('#sottaku-upgrade-required a')?.getAttribute('href')).toBe('sottaku://upgrade');
});

test('every shipped locale has a neutral, nonempty app-opening label', () => {
    const locales = fs.readdirSync(new URL('../ext/_locales/', import.meta.url));
    expect(locales).toHaveLength(17);
    for (const locale of locales) {
        const messages = /** @type {{popup_open_sottaku: {message: string}}} */ (parseJson(fs.readFileSync(new URL(`../ext/_locales/${locale}/messages.json`, import.meta.url), 'utf8')));
        expect(messages.popup_open_sottaku.message).toContain('Sottaku');
        expect(messages.popup_open_sottaku.message).not.toMatch(/https?:|\$|%/u);
    }
});
