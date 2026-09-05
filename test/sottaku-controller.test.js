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

import {afterAll, afterEach, expect, test, vi} from 'vitest';
import {localizeElement} from '../ext/js/dom/i18n.js';
import {SottakuController} from '../ext/js/pages/settings/sottaku-controller.js';
import {setupDomTest} from './fixtures/dom-test.js';

const {teardown} = await setupDomTest();
afterAll(() => teardown(global));
afterEach(() => vi.unstubAllGlobals());

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
