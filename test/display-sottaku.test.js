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

// Existing DOM fixtures intentionally provide partial Display objects.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck

import {afterAll, afterEach, describe, expect, test, vi} from 'vitest';
import {DisplaySottaku} from '../ext/js/display/display-sottaku.js';
import {SottakuIntegration} from '../ext/js/background/sottaku-integration.js';
import {StructuredContentGenerator} from '../ext/js/display/structured-content-generator.js';
import {setupDomTest} from './fixtures/dom-test.js';

const {window, teardown} = await setupDomTest();

// Preserve inference for the mock methods and DOM nodes returned by this fixture.
// eslint-disable-next-line jsdoc/require-returns
/**
 * Exercise the rendered button's event listener with the popup's public display interface.
 * @param {object} [details]
 * @param {string} [details.browser]
 * @param {object} [details.metadata]
 */
function createActionDisplay({browser = 'safari', metadata = {}} = {}) {
    document.documentElement.dataset.browser = browser;
    vi.stubGlobal('chrome', {
        runtime: {getURL: (path) => `${browser === 'safari' ? 'safari-web-extension' : 'chrome-extension'}://test/${path.replace(/^\//, '')}`},
    });
    const listeners = new Map();
    const node = document.createElement('div');
    const container = document.createElement('div');
    container.className = 'note-actions-container';
    node.append(container);
    const entry = {sottaku: {questionId: 1461, language: 'ja', hasDefinition: true, ...metadata}};
    const optionsContext = {url: 'https://example.com/article', depth: 0};
    const api = {
        sottakuAddFlashcard: vi.fn().mockResolvedValue(void 0),
        sottakuSubmitWordRequest: vi.fn().mockResolvedValue(void 0),
    };
    const display = {
        application: {api},
        on: (name, callback) => listeners.set(name, callback),
        getOptionsContext: () => optionsContext,
        dictionaryEntries: [entry],
        dictionaryEntryNodes: [node],
    };
    const controller = new DisplaySottaku(display);
    controller.prepare();
    const options = {
        general: {language: 'ko'},
        sottaku: {enabled: true, authToken: 'test-token', user: {id: 1, isPro: true}},
    };
    listeners.get('optionsUpdated')({options});
    const client = {
        addFlashcard: vi.fn().mockResolvedValue(void 0),
        submitWordRequest: vi.fn().mockResolvedValue(void 0),
    };
    Object.assign(Reflect.get(controller, '_client'), client);
    listeners.get('contentUpdateComplete')();
    const button = container.querySelector('button');
    return {api, button, client, container, controller, entry, listeners, options, optionsContext};
}

/** @returns {Promise<void>} */
async function finishAction() {
    await new Promise((resolve) => { setTimeout(resolve, 0); });
}

describe('DisplaySottaku', () => {
    afterAll(() => teardown(global));
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        delete document.documentElement.dataset.browser;
    });

    test('renders localized grammar as text with the interface locale direction', () => {
        const integration = new SottakuIntegration(null);
        const entry = Reflect.get(integration, '_createEntry').call(
            integration,
            {id: 1},
            {
                word_translation: 'صبي',
                grammar_details: [
                    {key: 'gender', label: 'الجنس', value: 'مذكر <img src=x>'},
                    {key: 'declension_class', label: 'التصريف', value: 'ضعيف'},
                ],
            },
            'de',
            'https://sottaku.app',
            'Junge',
            0,
            'Junge',
            5,
            'ar',
            null,
        );
        const generator = new StructuredContentGenerator(null, window.document, window);
        const glossary = /** @type {import('dictionary-data').TermGlossaryStructuredContent} */ (entry.definitions[0].entries[0]);
        const node = generator.createStructuredContent(glossary.content, 'Sottaku');
        const grammar = node.querySelector('[data-sc-sottaku-field="grammarDetails"]');
        expect(grammar.textContent).toBe('الجنس: مذكر <img src=x> · التصريف: ضعيف');
        expect(grammar.lang).toBe('ar');
        expect(grammar.dir).toBe('rtl');
        expect(grammar.querySelector('img')).toBeNull();
        expect(grammar.nextElementSibling.dataset.scSottakuField).toBe('definition');
    });

    test('locks request button dimensions before changing the label', async () => {
        const display = {
            on: () => {},
            dictionaryEntries: [],
            dictionaryEntryNodes: [],
        };
        const controller = new DisplaySottaku(display);
        Reflect.set(controller, '_options', {general: {language: 'ja'}});
        Reflect.set(controller, '_enabled', true);
        Reflect.get(controller, '_client').submitWordRequest = vi.fn().mockResolvedValue({});
        const metadata = {questionId: 1, language: 'ja'};

        const button = window.document.createElement('button');
        button.getBoundingClientRect = () => ({
            width: 183.2,
            height: 31.4,
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        });

        await Reflect.get(controller, '_requestWord').call(controller, {sottaku: metadata}, button);

        expect(button.style.minWidth).toBe('184px');
        expect(button.style.minHeight).toBe('32px');
        expect(button.dataset.sizeLocked).toBe('true');
        expect(button.textContent).toBe('Requested');
        expect(metadata.requested).toBe(true);
    });

    test('renders previously requested words as disabled requested buttons', () => {
        const container = window.document.createElement('div');
        container.className = 'note-actions-container';
        const node = window.document.createElement('div');
        node.appendChild(container);
        const display = {
            on: () => {},
            dictionaryEntries: [{sottaku: {questionId: 1, language: 'ja', hasDefinition: false, requested: true}}],
            dictionaryEntryNodes: [node],
        };
        const controller = new DisplaySottaku(display);
        Reflect.set(controller, '_enabled', true);

        Reflect.get(controller, '_renderButtons').call(controller);

        const button = /** @type {HTMLButtonElement} */ (container.querySelector('.sottaku-action'));
        expect(button).not.toBeNull();
        expect(button.disabled).toBe(true);
        expect(button.textContent).toBe('Requested');
        expect(button.title).toBe('Request submitted to Sottaku');
    });

    test.each([
        {action: 'save', method: 'sottakuAddFlashcard', metadata: {}, pending: 'Saving...', done: 'Saved', flag: 'inFlashcards'},
        {action: 'request', method: 'sottakuSubmitWordRequest', metadata: {hasDefinition: false}, pending: 'Requesting...', done: 'Requested', flag: 'requested'},
    ])('routes a Safari $action click through the named action and ignores repeated taps', async ({method, metadata, pending, done, flag}) => {
        const fixture = createActionDisplay({metadata});
        let finish;
        fixture.api[method].mockImplementation(() => new Promise((resolve) => { finish = resolve; }));

        fixture.button.click();
        fixture.button.click();
        expect(fixture.button.disabled).toBe(true);
        expect(fixture.button.textContent).toBe(pending);
        expect(fixture.api[method]).toHaveBeenCalledExactlyOnceWith(1461, 'ja', fixture.optionsContext, 1);
        expect(fixture.client.addFlashcard).not.toHaveBeenCalled();
        expect(fixture.client.submitWordRequest).not.toHaveBeenCalled();

        finish();
        await finishAction();
        expect(fixture.button.disabled).toBe(true);
        expect(fixture.button.textContent).toBe(done);
        expect(fixture.entry.sottaku[flag]).toBe(true);
        fixture.button.click();
        fixture.listeners.get('contentUpdateComplete')();
        const rerenderedButton = fixture.container.querySelector('button');
        expect(rerenderedButton.disabled).toBe(true);
        rerenderedButton.click();
        expect(fixture.api[method]).toHaveBeenCalledTimes(1);
    });

    test.each(['chrome', 'firefox'])('%s keeps the direct authenticated client save and request paths', async (browser) => {
        for (const hasDefinition of [true, false]) {
            const fixture = createActionDisplay({browser, metadata: {hasDefinition, language: ''}});
            fixture.button.click();
            await finishAction();
            const method = hasDefinition ? 'addFlashcard' : 'submitWordRequest';
            expect(fixture.client[method]).toHaveBeenCalledExactlyOnceWith(1461, 'ko');
            expect(fixture.api.sottakuAddFlashcard).not.toHaveBeenCalled();
            expect(fixture.api.sottakuSubmitWordRequest).not.toHaveBeenCalled();
            expect(fixture.button.disabled).toBe(true);
        }
    });

    test.each([
        {action: 'save', method: 'sottakuAddFlashcard', metadata: {}, flag: 'inFlashcards'},
        {action: 'request', method: 'sottakuSubmitWordRequest', metadata: {hasDefinition: false}, flag: 'requested'},
    ])('a failed Safari $action leaves a visible error and supports a successful retry', async ({method, metadata, flag}) => {
        const fixture = createActionDisplay({metadata});
        fixture.api[method].mockRejectedValueOnce(new Error('Sottaku Pro is required <img src=x>'));

        fixture.button.click();
        await finishAction();
        expect(fixture.button.disabled).toBe(false);
        expect(fixture.entry.sottaku[flag]).not.toBe(true);
        const error = fixture.container.querySelector('.sottaku-action-error');
        expect(error).not.toBeNull();
        expect(error.getAttribute('role')).toBe('alert');
        expect(error.dataset.i18n).toBe(method === 'sottakuAddFlashcard' ? 'sottaku_save_error' : 'sottaku_request_error');
        expect(error.textContent).toContain('Try again.');
        expect(error.textContent).not.toContain('Sottaku Pro is required <img src=x>');
        expect(error.querySelector('img')).toBeNull();

        fixture.button.click();
        expect(fixture.container.querySelector('.sottaku-action-error')).toBeNull();
        await finishAction();
        expect(fixture.button.disabled).toBe(true);
        expect(fixture.entry.sottaku[flag]).toBe(true);
        expect(fixture.api[method]).toHaveBeenCalledTimes(2);
        expect(fixture.container.querySelector('.sottaku-action-error')).toBeNull();
    });

    test('content clear removes a failed action message and disconnects its old button', async () => {
        const fixture = createActionDisplay();
        fixture.api.sottakuAddFlashcard.mockRejectedValueOnce(new Error('Network unavailable'));
        fixture.button.click();
        await finishAction();
        expect(fixture.container.querySelector('.sottaku-action-error')).not.toBeNull();

        fixture.listeners.get('contentClear')();
        expect(fixture.container.children).toHaveLength(0);
        fixture.button.click();
        expect(fixture.api.sottakuAddFlashcard).toHaveBeenCalledTimes(1);
    });

    test('disabling the linked account removes actions before another request can run', () => {
        const fixture = createActionDisplay();
        fixture.options.sottaku.enabled = false;
        fixture.listeners.get('optionsUpdated')({options: fixture.options});
        expect(fixture.container.querySelector('button')).toBeNull();
        fixture.button.click();
        expect(fixture.api.sottakuAddFlashcard).not.toHaveBeenCalled();
        expect(fixture.client.addFlashcard).not.toHaveBeenCalled();
    });
});
