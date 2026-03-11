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

import {afterAll, describe, expect, test, vi} from 'vitest';
import {DisplaySottaku} from '../ext/js/display/display-sottaku.js';
import {setupDomTest} from './fixtures/dom-test.js';

const {window, teardown} = await setupDomTest();

describe('DisplaySottaku', () => {
    afterAll(() => teardown(global));

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
});
