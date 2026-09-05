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

import {afterEach, describe, expect, test, vi} from 'vitest';
import {Application} from '../ext/js/application.js';

const onMessageOptionsUpdated =
    /** @type {(this: {trigger: ReturnType<typeof vi.fn>}, details: {source: string}) => void} */ (
        Reflect.get(Application.prototype, '_onMessageOptionsUpdated')
    );

describe('Application', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    test.each([
        {name: 'Safari with service worker support', background: {page: 'background.html'}, serviceWorker: {}, shared: true},
        {name: 'Firefox background page', background: {page: 'background.html'}, serviceWorker: null, shared: true},
        {name: 'Chrome background service worker', background: {service_worker: 'sw.js'}, serviceWorker: {}, shared: false},
    ])('uses the manifest transport for $name', async ({background, serviceWorker, shared}) => {
        vi.stubGlobal('window', {location: {protocol: new URL(import.meta.url).protocol}});
        vi.stubGlobal('navigator', serviceWorker === null ? {} : {serviceWorker});
        vi.stubGlobal('chrome', {runtime: {getManifest: () => ({background})}});
        const sharedWorker = vi.fn(() => { throw new Error('shared worker transport selected'); });
        const drawingWorker = vi.fn(() => { throw new Error('drawing worker reached'); });
        vi.stubGlobal('SharedWorker', sharedWorker);
        vi.stubGlobal('Worker', drawingWorker);

        await expect(Application.main(false, async () => {})).rejects.toThrow(
            shared ? 'shared worker transport selected' : 'drawing worker reached',
        );
        expect(sharedWorker).toHaveBeenCalledTimes(shared ? 1 : 0);
    });

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
