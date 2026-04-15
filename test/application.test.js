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
import {Application} from '../ext/js/application.js';

const onMessageOptionsUpdated =
    /** @type {(this: {trigger: ReturnType<typeof vi.fn>}, details: {source: string}) => void} */ (
        Reflect.get(Application.prototype, '_onMessageOptionsUpdated')
    );

describe('Application', () => {
    test('ignores background option update broadcasts', () => {
        const application = {trigger: vi.fn()};

        onMessageOptionsUpdated.call(application, {source: 'background'});

        expect(application.trigger).not.toHaveBeenCalled();
    });

    test('ignores sottaku client auth-refresh broadcasts', () => {
        const application = {trigger: vi.fn()};

        onMessageOptionsUpdated.call(application, {source: 'sottaku-client'});

        expect(application.trigger).not.toHaveBeenCalled();
    });

    test('still forwards user-visible option updates', () => {
        const application = {trigger: vi.fn()};

        onMessageOptionsUpdated.call(application, {source: 'settings-page'});

        expect(application.trigger).toHaveBeenCalledWith('optionsUpdated', {source: 'settings-page'});
    });
});
