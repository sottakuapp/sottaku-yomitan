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

import {afterAll, describe, expect, test} from 'vitest';
import {StructuredContentGenerator} from '../ext/js/display/structured-content-generator.js';
import {getTextDirection, setElementLanguageDirection} from '../ext/js/language/text-direction.js';
import {setupDomTest} from './fixtures/dom-test.js';

const {window, teardown} = await setupDomTest();

describe('target-language text direction', () => {
    afterAll(() => teardown(global));

    test('uses the target language instead of the extension UI direction', () => {
        expect(getTextDirection('ar')).toBe('rtl');
        expect(getTextDirection('ar-SA')).toBe('rtl');
        expect(getTextDirection('pt-BR')).toBe('ltr');
        expect(getTextDirection('hi')).toBe('ltr');

        const arabic = window.document.createElement('span');
        setElementLanguageDirection(arabic, 'ar');
        expect(arabic.lang).toBe('ar');
        expect(arabic.dir).toBe('rtl');

        const english = window.document.createElement('span');
        setElementLanguageDirection(english, 'en');
        expect(english.dir).toBe('ltr');
    });

    test('renders nested Arabic examples RTL and their English translations LTR', () => {
        const contentManager = /** @type {import('../ext/js/display/display-content-manager.js').DisplayContentManager} */ ({});
        const browserWindow = /** @type {Window} */ (/** @type {unknown} */ (window));
        const generator = new StructuredContentGenerator(contentManager, window.document, browserWindow);
        const node = generator.createStructuredContent({
            tag: 'div',
            lang: 'ar',
            data: {sottakuField: 'exampleGroup'},
            content: [
                {tag: 'div', lang: 'ar', data: {sottakuField: 'example'}, content: 'هذه مدرسة.'},
                {tag: 'div', lang: 'en', data: {sottakuField: 'exampleTranslation'}, content: 'This is a school.'},
            ],
        }, 'Sottaku');

        const group = /** @type {HTMLElement} */ (node.firstElementChild);
        const example = /** @type {HTMLElement} */ (group.children[0]);
        const translation = /** @type {HTMLElement} */ (group.children[1]);
        expect(group.dir).toBe('rtl');
        expect(example.dir).toBe('rtl');
        expect(translation.dir).toBe('ltr');
    });
});
