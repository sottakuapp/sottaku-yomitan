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
const shouldRefreshSearchAfterOptionsUpdate =
    /** @type {(this: object, previousOptions: Record<string, unknown>|null, nextOptions: Record<string, unknown>) => boolean} */ (
        Reflect.get(Frontend.prototype, '_shouldRefreshSearchAfterOptionsUpdate')
    );
const shouldReconfigurePopupAfterOptionsUpdate =
    /** @type {(this: object, previousOptions: Record<string, unknown>|null, nextOptions: Record<string, unknown>) => boolean} */ (
        Reflect.get(Frontend.prototype, '_shouldReconfigurePopupAfterOptionsUpdate')
    );
const createSearchRefreshOptionsSnapshot =
    /** @type {(this: object, options: Record<string, unknown>) => Record<string, unknown>} */ (
        Reflect.get(Frontend.prototype, '_createSearchRefreshOptionsSnapshot')
    );
const createPopupOptionsUpdateSnapshot =
    /** @type {(this: object, options: Record<string, unknown>) => Record<string, unknown>} */ (
        Reflect.get(Frontend.prototype, '_createPopupOptionsUpdateSnapshot')
    );
const shouldIgnorePointWithinPopupInteractionBridge =
    /** @type {(this: object, x: number, y: number) => boolean} */ (
        Reflect.get(Frontend.prototype, '_shouldIgnorePointWithinPopupInteractionBridge')
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

    test('does not rerun the live search when only the auth token rotates', () => {
        const frontend = {_createSearchRefreshOptionsSnapshot: createSearchRefreshOptionsSnapshot};
        const previousOptions = {
            dictionaries: [],
            general: {language: 'ja', maxResults: 32},
            parsing: {},
            scanning: {delay: 0, length: 10},
            sentenceParsing: {},
            translation: {},
            sottaku: {
                enabled: true,
                apiBaseUrl: 'https://sottaku.app/api/v1',
                authToken: 'old-token',
                cookieDomain: 'https://sottaku.app',
                locale: 'en',
                preferredLanguages: ['ja'],
                user: {id: 1, username: 'akira'},
            },
        };
        const nextOptions = {
            ...previousOptions,
            sottaku: {
                ...previousOptions.sottaku,
                authToken: 'new-token',
                cookieDomain: 'https://api.sottaku.app',
                user: {id: 1, username: 'akira', ui_locale: 'en'},
            },
        };

        const result = shouldRefreshSearchAfterOptionsUpdate.call(frontend, previousOptions, nextOptions);

        expect(result).toBe(false);
    });

    test('reruns the live search when auth availability changes', () => {
        const frontend = {_createSearchRefreshOptionsSnapshot: createSearchRefreshOptionsSnapshot};
        const previousOptions = {
            dictionaries: [],
            general: {language: 'ja', maxResults: 32},
            parsing: {},
            scanning: {delay: 0, length: 10},
            sentenceParsing: {},
            translation: {},
            sottaku: {
                enabled: true,
                apiBaseUrl: 'https://sottaku.app/api/v1',
                authToken: '',
                locale: 'en',
                preferredLanguages: ['ja'],
            },
        };
        const nextOptions = {
            ...previousOptions,
            sottaku: {
                ...previousOptions.sottaku,
                authToken: 'new-token',
            },
        };

        const result = shouldRefreshSearchAfterOptionsUpdate.call(frontend, previousOptions, nextOptions);

        expect(result).toBe(true);
    });

    test('does not reconfigure the popup when only the auth token rotates', () => {
        const frontend = {_createPopupOptionsUpdateSnapshot: createPopupOptionsUpdateSnapshot};
        const previousOptions = {
            dictionaries: [],
            general: {
                language: 'ja',
                maxResults: 32,
                popupTheme: 'light',
                popupOuterTheme: 'auto',
            },
            inputs: {hotkeys: []},
            parsing: {},
            scanning: {delay: 0, length: 10},
            sentenceParsing: {},
            translation: {},
            sottaku: {
                enabled: true,
                apiBaseUrl: 'https://sottaku.app/api/v1',
                authToken: 'old-token',
                cookieDomain: 'https://sottaku.app',
                locale: 'en',
                preferredLanguages: ['ja'],
                user: {id: 1, username: 'akira'},
            },
        };
        const nextOptions = {
            ...previousOptions,
            sottaku: {
                ...previousOptions.sottaku,
                authToken: 'new-token',
                cookieDomain: 'https://api.sottaku.app',
                user: {id: 1, username: 'akira', ui_locale: 'en'},
            },
        };

        const result = shouldReconfigurePopupAfterOptionsUpdate.call(frontend, previousOptions, nextOptions);

        expect(result).toBe(false);
    });

    test('reconfigures the popup when popup presentation settings change', () => {
        const frontend = {_createPopupOptionsUpdateSnapshot: createPopupOptionsUpdateSnapshot};
        const previousOptions = {
            dictionaries: [],
            general: {
                language: 'ja',
                maxResults: 32,
                popupTheme: 'light',
                popupOuterTheme: 'auto',
            },
            inputs: {hotkeys: []},
            parsing: {},
            scanning: {delay: 0, length: 10},
            sentenceParsing: {},
            translation: {},
            sottaku: {
                enabled: true,
                apiBaseUrl: 'https://sottaku.app/api/v1',
                authToken: 'token',
                locale: 'en',
                preferredLanguages: ['ja'],
            },
        };
        const nextOptions = {
            ...previousOptions,
            general: {
                ...previousOptions.general,
                popupTheme: 'dark',
            },
        };

        const result = shouldReconfigurePopupAfterOptionsUpdate.call(frontend, previousOptions, nextOptions);

        expect(result).toBe(true);
    });

    test('ignores points in the source-to-popup bridge immediately after showing the popup', () => {
        const frontend = {
            _popupInteractionBridgeUntil: Number.POSITIVE_INFINITY,
            _popup: {
                getFrameRect: () => ({left: 100, top: 120, right: 220, bottom: 260, valid: true}),
            },
            _textScanner: {
                getCurrentTextSource: () => ({
                    getRects: () => [{left: 10, top: 20, right: 60, bottom: 40}],
                }),
            },
        };

        const result = shouldIgnorePointWithinPopupInteractionBridge.call(frontend, 90, 80);

        expect(result).toBe(true);
    });

    test('does not ignore points in the bridge after the grace period expires', () => {
        const frontend = {
            _popupInteractionBridgeUntil: 0,
            _popup: {
                getFrameRect: () => ({left: 100, top: 120, right: 220, bottom: 260, valid: true}),
            },
            _textScanner: {
                getCurrentTextSource: () => ({
                    getRects: () => [{left: 10, top: 20, right: 60, bottom: 40}],
                }),
            },
        };

        const result = shouldIgnorePointWithinPopupInteractionBridge.call(frontend, 90, 80);

        expect(result).toBe(false);
    });
});
