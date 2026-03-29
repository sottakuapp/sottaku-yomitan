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

import {describe, expect, test, vi} from 'vitest';
import {Popup} from '../ext/js/app/popup.js';

/* eslint-disable no-underscore-dangle */
const showContent =
    /** @type {(this: Record<string, unknown>, details: {optionsContext: unknown, sourceRects: unknown[], writingMode: string}, displayDetails: unknown|null) => Promise<void>} */ (
        Reflect.get(Popup.prototype, 'showContent')
    );
const setCustomCss =
    /** @type {(this: Record<string, unknown>, css: string) => Promise<void>} */ (
        Reflect.get(Popup.prototype, 'setCustomCss')
    );

describe('Popup', () => {
    test('showContent initializes the popup options context from the request details', async () => {
        /** @type {Record<string, unknown>} */
        const popup = {
            _optionsContext: null,
            _frameConnected: false,
            _frameInjectionId: 0,
            _frameInjectionIdWithContent: 0,
            _hasShownContent: false,
            _recoveryDisplayDetails: null,
            _setOptionsContext: vi.fn(async (optionsContext) => {
                popup._optionsContext = optionsContext;
            }),
            _setOptionsContextIfDifferent: vi.fn(async () => {}),
            stopHideDelayed: vi.fn(),
            _show: vi.fn(async () => {}),
            _cacheRecoveryDisplayDetails: vi.fn(),
            _invokeSafe: vi.fn(async () => {}),
        };
        const optionsContext = {current: true};

        await showContent.call(popup, {
            optionsContext,
            sourceRects: [],
            writingMode: 'horizontal-tb',
        }, null);

        expect(popup._setOptionsContext).toHaveBeenCalledWith(optionsContext);
        expect(popup._setOptionsContextIfDifferent).not.toHaveBeenCalled();
    });

    test('setCustomCss caches css until the popup frame is ready', async () => {
        /** @type {Record<string, unknown>} */
        const popup = {
            _customCss: '',
            _frameConnected: false,
            _invokeSafe: vi.fn(async () => {}),
        };

        await setCustomCss.call(popup, 'body { color: red; }');

        expect(popup._customCss).toBe('body { color: red; }');
        expect(popup._invokeSafe).not.toHaveBeenCalled();
    });
});
/* eslint-enable no-underscore-dangle */
