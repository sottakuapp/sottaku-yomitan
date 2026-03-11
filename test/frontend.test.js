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

import {describe, expect, test} from 'vitest';
import {Frontend} from '../ext/js/app/frontend.js';

const shouldEagerlySetPopupOptionsContext =
    /** @type {(this: object, popup: object|null, currentPopup: object|null, isIframe: boolean, showIframePopupsInRootFrame: boolean) => boolean} */ (
        Reflect.get(Frontend.prototype, '_shouldEagerlySetPopupOptionsContext')
    );

describe('Frontend', () => {
    test('does not eagerly set popup options context for a newly attached iframe root-frame proxy', () => {
        const result = shouldEagerlySetPopupOptionsContext.call({}, {id: 'popup'}, null, true, true);

        expect(result).toBe(false);
    });

    test('still eagerly sets popup options context for the current iframe root-frame proxy popup', () => {
        const popup = {id: 'popup'};
        const result = shouldEagerlySetPopupOptionsContext.call({}, popup, popup, true, true);

        expect(result).toBe(true);
    });

    test('still eagerly sets popup options context for non-iframe popups', () => {
        const result = shouldEagerlySetPopupOptionsContext.call({}, {id: 'popup'}, null, false, true);

        expect(result).toBe(true);
    });
});
