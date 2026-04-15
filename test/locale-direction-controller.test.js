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

import {afterAll, afterEach, describe, expect, test, vi} from 'vitest';
import {LocaleDirectionController} from '../ext/js/dom/locale-direction-controller.js';
import {setupDomTest} from './fixtures/dom-test.js';

const {teardown} = await setupDomTest();

describe('LocaleDirectionController', () => {
    afterAll(() => teardown(global));
    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('uses the stored user locale before requesting language settings', async () => {
        const controller = new LocaleDirectionController();
        Reflect.get(controller, '_configureClient').call(controller, {sottaku: {authToken: 'test-token'}});
        const getLanguageSettings = vi.fn().mockResolvedValue({locale: 'en'});
        Reflect.get(controller, '_client').getLanguageSettings = getLanguageSettings;

        const locale = await Reflect.get(controller, '_resolveLocale').call(controller, {
            sottaku: {
                user: {
                    ui_locale: ' ar ',
                },
            },
        });

        expect(locale).toBe('ar');
        expect(getLanguageSettings).not.toHaveBeenCalled();
        expect(Reflect.get(controller, '_automaticLocale')).toBe('ar');
    });
});
