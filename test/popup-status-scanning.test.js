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
import {TextSourceRange} from '../ext/js/dom/text-source-range.js';
import {TextScanner} from '../ext/js/language/text-scanner.js';
import {setupDomTest} from './fixtures/dom-test.js';

const {teardown} = await setupDomTest();
afterAll(() => teardown(global));
afterEach(() => { document.body.textContent = ''; });

/**
 * @param {string} page
 * @returns {void}
 */
function loadPage(page) {
    const html = fs.readFileSync(new URL(`../ext/${page}`, import.meta.url), 'utf8');
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    document.body.replaceChildren(...Array.from(parsed.body.childNodes, (node) => document.importNode(node, true)));
    for (const panel of document.querySelectorAll('#sottaku-upgrade-required, #no-results, #error-extension-unloaded')) {
        panel.removeAttribute('hidden');
    }
}

/**
 * @param {Element} element
 * @returns {TextSourceRange}
 * @throws {Error} If the element has no text node.
 */
function textSource(element) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const node = walker.nextNode();
    if (node === null) { throw new Error('Expected visible text'); }
    const range = document.createRange();
    range.setStart(node, 0);
    range.collapse(true);
    return TextSourceRange.create(range);
}

// Retain inferred mock signatures for the request assertions.
// eslint-disable-next-line jsdoc/require-returns
/** */
function createScanner() {
    const termsFind = vi.fn().mockResolvedValue({dictionaryEntries: [], originalTextLength: 0});
    const scanner = new TextScanner({
        api: /** @type {import('../ext/js/comm/api.js').API} */ (/** @type {unknown} */ ({termsFind})),
        node: window,
        getSearchContext: () => ({optionsContext: {depth: 1, url: 'safari-web-extension://test/popup.html'}, detail: {documentTitle: 'Popup'}}),
        searchTerms: true,
        searchKanji: false,
        browser: 'safari',
        textSourceGenerator: /** @type {import('../ext/js/dom/text-source-generator.js').TextSourceGenerator} */ ({}),
    });
    scanner.language = 'ja';
    scanner.setOptions({scanLength: 20});
    // These are the selectors configured by Frontend for nested popup/search scanning.
    scanner.excludeSelector = '.scan-disable,.scan-disable *';
    scanner.touchEventExcludeSelector = '.gloss-link, .gloss-link *, .tag, .tag *, .inflection';
    return {scanner, termsFind};
}

test.each(['popup.html', 'search.html'])('%s status text and its upgrade link cannot start a nested touch lookup', async (page) => {
    loadPage(page);
    const {scanner, termsFind} = createScanner();
    const link = document.querySelector('#sottaku-upgrade-required a');
    expect(link).not.toBeNull();
    await Reflect.get(scanner, '_findTermDictionaryEntries').call(scanner, textSource(/** @type {Element} */ (link)), {current: true, pointerType: 'touch'});
    expect(termsFind).not.toHaveBeenCalled();
    expect(link?.getAttribute('href')).toBe('https://sottaku.app/upgrade');
    expect(link?.getAttribute('target')).toBe('_blank');
    for (const element of document.querySelectorAll('#sottaku-upgrade-required h1, #sottaku-upgrade-required p, #no-results p, #error-extension-unloaded h1, #error-extension-unloaded p')) {
        expect(scanner.getTextSourceContent(textSource(element), 20, false, 'touch')).toBe('');
    }
});

test.each(['popup.html', 'search.html'])('%s dictionary text still permits nested touch lookups', async (page) => {
    loadPage(page);
    const entry = document.createElement('div');
    entry.className = 'entry';
    entry.textContent = '猫';
    document.querySelector('#dictionary-entries')?.append(entry);
    const {scanner, termsFind} = createScanner();
    await Reflect.get(scanner, '_findTermDictionaryEntries').call(scanner, textSource(entry), {current: true, pointerType: 'touch'});
    expect(termsFind).toHaveBeenCalled();
    expect(termsFind.mock.calls[0][0].trim()).toBe('猫');
});
