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

// Fixtures deliberately supply partial browser and frontend dependencies.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
/* eslint-disable no-underscore-dangle */

import {afterAll, afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import {Frontend} from '../ext/js/app/frontend.js';
import {MobileSelectionController} from '../ext/js/app/mobile-selection-controller.js';
import {TextSourceRange} from '../ext/js/dom/text-source-range.js';
import {setupDomTest} from './fixtures/dom-test.js';

const env = await setupDomTest();
/** @type {MobileSelectionController} */
let controller;
/** @type {ShadowRoot} */
let root;
/** @type {import('vitest').Mock<(range: Range) => Promise<void>>} */
let lookup;
/** @type {import('vitest').Mock<() => void>} */
let dismiss;

/**
 *
 * @param {string} text
 * @param {number} start
 * @param {number} end
 * @returns {Range}
 */
function select(text, start = 0, end = text.length) {
    const paragraph = document.querySelector('p');
    if (paragraph.textContent !== text || paragraph.firstChild === null) { paragraph.replaceChildren(document.createTextNode(text)); }
    const range = document.createRange();
    range.setStart(paragraph.firstChild, start);
    range.setEnd(paragraph.firstChild, end);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    return range;
}

/** @returns {Promise<void>} */
async function settle() { await vi.advanceTimersByTimeAsync(300); }
/** @returns {NodeListOf<HTMLButtonElement>} */
function buttons() { return root.querySelectorAll('button'); }
/** @returns {boolean} */
function visible() { return controller._host !== null && controller._host.style.display !== 'none'; }

afterAll(() => env.teardown(global));
beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<p>読む</p><a href="#next">Link</a>';
    vi.stubGlobal('chrome', {i18n: {getMessage: (key) => key}});
    // Calling the original method with its actual element receiver below.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const attachShadow = Element.prototype.attachShadow;
    vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function captureShadow(options) {
        root = attachShadow.call(this, options);
        return root;
    });
    Range.prototype.getBoundingClientRect = () => ({top: 100, bottom: 130, left: 30, right: 100});
    lookup = vi.fn().mockResolvedValue();
    dismiss = vi.fn();
    controller = new MobileSelectionController(lookup, dismiss, () => false);
    controller.setEnabled(true);
});
afterEach(() => {
    controller.setEnabled(false);
    window.getSelection().removeAllRanges();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('mobile highlight lookup', () => {
    test('normal taps, link clicks, and scrolling never start lookup or suppress browser gestures', async () => {
        for (const type of ['pointerdown', 'pointerup', 'click', 'scroll']) {
            const event = new Event(type, {bubbles: true, cancelable: true});
            document.querySelector('a').dispatchEvent(event);
            expect(event.defaultPrevented).toBe(false);
        }
        await settle();
        expect(lookup).not.toHaveBeenCalled();
        expect(visible()).toBe(false);
    });

    test('highlights show a preview and require a separate action, preserving the native selection', async () => {
        select('彼は日本語を読む。', 2, 5);
        await settle();
        expect(visible()).toBe(true);
        expect(root.textContent).toContain('日本語');
        expect(lookup).not.toHaveBeenCalled();
        buttons()[0].click();
        await settle();
        expect(lookup).toHaveBeenCalledOnce();
        expect(lookup.mock.calls[0][0].toString()).toBe('日本語');
        expect(window.getSelection().toString()).toBe('日本語');
        expect(visible()).toBe(false);
    });

    test('waits while selection handles move and searches the latest range with the same start', async () => {
        select('日本語', 0, 2);
        await settle();
        document.querySelector('p').dispatchEvent(new Event('pointerdown', {bubbles: true}));
        select('日本語', 0, 3);
        await settle();
        expect(visible()).toBe(false);
        document.dispatchEvent(new Event('pointerup'));
        await settle();
        buttons()[0].click();
        await settle();
        expect(lookup.mock.calls[0][0].toString()).toBe('日本語');
    });

    test('keeps the range when focusing the lookup action collapses browser selection', async () => {
        select('猫');
        await settle();
        const button = buttons()[0];
        button.dispatchEvent(new Event('pointerdown', {bubbles: true, cancelable: true}));
        window.getSelection().removeAllRanges();
        document.dispatchEvent(new Event('selectionchange'));
        await settle();
        expect(visible()).toBe(true);
        button.click();
        await settle();
        expect(lookup.mock.calls[0][0].toString()).toBe('猫');
    });

    test('closing the action preserves selection and suppresses only that selected span', async () => {
        select('猫と犬', 0, 1);
        await settle();
        buttons()[1].click();
        document.dispatchEvent(new Event('selectionchange'));
        await settle();
        expect(visible()).toBe(false);
        expect(window.getSelection().toString()).toBe('猫');
        select('猫と犬', 2, 3);
        await settle();
        expect(visible()).toBe(true);
        expect(root.textContent).toContain('犬');
        expect(lookup).not.toHaveBeenCalled();
    });

    test('the same word can be deliberately selected again after dismissal', async () => {
        select('猫');
        await settle();
        buttons()[1].click();
        document.querySelector('p').dispatchEvent(new Event('pointerdown', {bubbles: true}));
        window.getSelection().removeAllRanges();
        document.dispatchEvent(new Event('selectionchange'));
        select('猫');
        document.dispatchEvent(new Event('pointerup'));
        await settle();
        expect(visible()).toBe(true);
        expect(lookup).not.toHaveBeenCalled();
    });

    test('provides loading feedback and ignores repeated activation', async () => {
        let resolve;
        lookup.mockImplementation(() => new Promise((r) => { resolve = r; }));
        select('猫');
        await settle();
        const button = buttons()[0];
        button.click();
        button.click();
        expect(button.disabled).toBe(true);
        expect(root.textContent).toContain('action_popup_loading');
        expect(lookup).toHaveBeenCalledOnce();
        resolve();
        await settle();
        expect(visible()).toBe(false);
    });

    test('a failed lookup leaves an explicit retry action', async () => {
        lookup.mockRejectedValueOnce(new Error('offline'));
        select('猫');
        await settle();
        buttons()[0].click();
        await settle();
        expect(root.textContent).toContain('mobile_selection_error');
        expect(visible()).toBe(true);
        buttons()[0].click();
        await settle();
        expect(lookup).toHaveBeenCalledTimes(2);
        expect(visible()).toBe(false);
    });

    test('a new highlight made during a slow request receives its action when that request settles', async () => {
        let finish;
        lookup.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
        select('猫と犬', 0, 1);
        await settle();
        buttons()[0].click();
        document.querySelector('p').dispatchEvent(new Event('pointerdown', {bubbles: true}));
        select('猫と犬', 2, 3);
        document.dispatchEvent(new Event('pointerup'));
        await settle();
        expect(visible()).toBe(false);
        finish();
        await settle();
        expect(visible()).toBe(true);
        expect(root.textContent).toContain('犬');
        expect(lookup).toHaveBeenCalledOnce();
    });

    test('does not appear in editors or for collapsed, blank, or very long selections', async () => {
        for (const text of ['', ' ', '猫'.repeat(201)]) {
            select(text);
            await settle();
            expect(visible()).toBe(false);
        }
        document.querySelector('p').setAttribute('contenteditable', 'true');
        select('猫');
        await settle();
        expect(visible()).toBe(false);
    });

    test('does not search detached selected content or retain controls after disable', async () => {
        select('猫');
        await settle();
        document.querySelector('p').remove();
        buttons()[0].click();
        expect(lookup).not.toHaveBeenCalled();
        controller.setEnabled(false);
        expect(controller._host).toBeNull();
    });

    test('a cancelled button drag does not freeze subsequent selections', async () => {
        select('猫と犬', 0, 1);
        await settle();
        buttons()[0].dispatchEvent(new Event('pointerdown', {bubbles: true, cancelable: true}));
        document.dispatchEvent(new Event('pointerup'));
        await vi.advanceTimersByTimeAsync(600);
        select('猫と犬', 2, 3);
        await settle();
        expect(root.textContent).toContain('犬');
        expect(lookup).not.toHaveBeenCalled();
    });
});

describe('mobile frontend integration', () => {
    /**
     *
     * @param {boolean} mobile
     * @returns {Frontend}
     */
    function frontend(mobile = true) {
        return new Frontend({
            application: {api: {}},
            pageType: 'web',
            popupFactory: {},
            depth: 0,
            parentPopupId: null,
            parentFrameId: null,
            useProxyPopup: false,
            allowRootFramePopupProxy: false,
            hotkeyHandler: {registerActions: vi.fn()},
            browser: 'safari',
            mobile,
        });
    }

    test.each([true, false])('selection mode disables all automatic scanner events only on mobile=%s', (mobile) => {
        const f = frontend(mobile);
        f._options = {general: {enable: true}, scanning: {mobileSelection: true}};
        f._updateTextScannerEnabled();
        expect(f._textScanner.isEnabled()).toBe(!mobile);
        expect(f._mobileSelection.enabled).toBe(mobile);
        f._options.scanning.mobileSelection = false;
        f._updateTextScannerEnabled();
        expect(f._textScanner.isEnabled()).toBe(true);
        f._options.general.enable = false;
        f._updateTextScannerEnabled();
        expect(f._textScanner.isEnabled()).toBe(false);
        expect(f._mobileSelection.enabled).toBe(false);
    });

    test('explicit requests preserve the complete selected range and allow resizing the same start', async () => {
        const f = frontend();
        f._mobileSelection.setEnabled(true);
        const search = vi.spyOn(f._textScanner, 'search').mockResolvedValue(void 0);
        const range = select('先に日本語を読む', 2, 5);
        await f._lookupMobileSelection(range);
        const [source, detail, showEmpty, fixedStart] = search.mock.calls[0];
        expect(source).toBeInstanceOf(TextSourceRange);
        expect(source.text()).toBe('日本語');
        source.setStartOffset(10, false);
        source.setEndOffset(20, false, false);
        expect(source.text()).toBe('日本語');
        expect(detail.focus).toBe(false);
        expect(showEmpty).toBe(true);
        expect(fixedStart).toBe(true);
        range.setEnd(range.endContainer, 4);
        await f._lookupMobileSelection(range);
        expect(search.mock.calls[1][0].text()).toBe('日本');
        f._mobileSelection.setEnabled(false);
    });

    test('dismissing or disabling rejects delayed success and error responses', () => {
        const f = frontend();
        f._mobileSelection.setEnabled(true);
        f._mobileLookupToken = 2;
        const showContent = vi.spyOn(f, '_showContent').mockImplementation(() => {});
        f._onSearchSuccess({inputInfo: {detail: {selectionToken: 1}}});
        expect(showContent).not.toHaveBeenCalled();
        const showError = vi.spyOn(f._mobileSelection, 'showLookupError');
        f._onSearchError({error: new Error('late'), inputInfo: {detail: {selectionToken: 1}}});
        expect(showError).not.toHaveBeenCalled();
        f._mobileSelection.setEnabled(false);
        expect(f._isStaleMobileLookup({selectionToken: 2})).toBe(true);
    });
});

/* eslint-enable no-underscore-dangle */
