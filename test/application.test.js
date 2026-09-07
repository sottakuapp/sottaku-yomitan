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

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import {Application} from '../ext/js/application.js';
import {API} from '../ext/js/comm/api.js';
import {CrossFrameAPI} from '../ext/js/comm/cross-frame-api.js';
import {ExtensionError} from '../ext/js/core/extension-error.js';
import {deferPromise} from '../ext/js/core/utilities.js';
import {WebExtension} from '../ext/js/extension/web-extension.js';

const onMessageOptionsUpdated =
    /** @type {(this: {trigger: ReturnType<typeof vi.fn>}, details: {source: string}) => void} */ (
        Reflect.get(Application.prototype, '_onMessageOptionsUpdated')
    );

describe('Application', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    describe('backend readiness', () => {
        beforeEach(() => {
            vi.useFakeTimers();
            vi.stubGlobal('window', {location: {protocol: 'https:'}});
            vi.stubGlobal('chrome', {runtime: {
                getURL: (/** @type {string} */ path) => `safari-web-extension://test${path}`,
                getManifest: () => ({name: 'Sottaku-Yomitan', version: '1'}),
                onMessage: {addListener: vi.fn(), removeListener: vi.fn()},
            }});
            vi.stubGlobal('MessageChannel', vi.fn(() => ({port1: {}, port2: {}})));
            vi.spyOn(API.prototype, 'frameInformationGet').mockResolvedValue({tabId: 1, frameId: 0});
            vi.spyOn(CrossFrameAPI.prototype, 'prepare').mockImplementation(() => {});
            vi.spyOn(Application.prototype, 'prepare').mockImplementation(() => {});
            vi.spyOn(Application.prototype, 'ready').mockImplementation(() => {});
        });

        test.each([true, false])('starts on a %s acknowledgement without a broadcast', async (result) => {
            const send = vi.spyOn(WebExtension.prototype, 'sendMessagePromise').mockResolvedValue({result});
            const main = vi.fn(async () => {});

            await Application.main(false, main);

            expect(send).toHaveBeenCalledExactlyOnceWith({action: 'requestBackendReadySignal'});
            expect(main).toHaveBeenCalledOnce();
            expect(chrome.runtime.onMessage.addListener).not.toHaveBeenCalled();
            expect(chrome.runtime.onMessage.removeListener).not.toHaveBeenCalled();
        });

        test('waits for an accepted request even when backend preparation exceeds the retry deadline', async () => {
            const acknowledgement = deferPromise();
            const send = vi.spyOn(WebExtension.prototype, 'sendMessagePromise').mockReturnValue(acknowledgement.promise);
            const main = vi.fn(async () => {});
            const startup = Application.main(false, main);

            await vi.advanceTimersByTimeAsync(6000);
            expect(send).toHaveBeenCalledOnce();
            expect(API.prototype.frameInformationGet).not.toHaveBeenCalled();
            expect(main).not.toHaveBeenCalled();

            acknowledgement.resolve({result: false});
            await startup;
            expect(main).toHaveBeenCalledOnce();
        });

        test.each([
            'Could not establish connection. Receiving end does not exist.',
            'Receiving end does not exist.',
        ])('retries a transient transport error: %s', async (message) => {
            const send = vi.spyOn(WebExtension.prototype, 'sendMessagePromise')
                .mockRejectedValueOnce(new Error(message))
                .mockResolvedValue({result: true});
            const main = vi.fn(async () => {});
            const startup = Application.main(false, main);

            await vi.advanceTimersByTimeAsync(99);
            expect(send).toHaveBeenCalledOnce();
            expect(main).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(1);
            await startup;

            expect(send).toHaveBeenCalledTimes(2);
            expect(main).toHaveBeenCalledOnce();
        });

        test('stops retrying a missing receiver after five seconds', async () => {
            const error = new Error('Receiving end does not exist.');
            const send = vi.spyOn(WebExtension.prototype, 'sendMessagePromise').mockRejectedValue(error);
            const main = vi.fn(async () => {});
            const rejected = expect(Application.main(false, main)).rejects.toBe(error);

            await vi.advanceTimersByTimeAsync(5000);
            await rejected;

            expect(send).toHaveBeenCalledTimes(51);
            expect(main).not.toHaveBeenCalled();
            expect(vi.getTimerCount()).toBe(0);
        });

        test('does not retry other transport errors', async () => {
            const error = new Error('The message port closed before a response was received.');
            const send = vi.spyOn(WebExtension.prototype, 'sendMessagePromise').mockRejectedValue(error);
            const main = vi.fn(async () => {});

            await expect(Application.main(false, main)).rejects.toBe(error);

            expect(send).toHaveBeenCalledOnce();
            expect(main).not.toHaveBeenCalled();
            expect(vi.getTimerCount()).toBe(0);
        });

        test('preserves backend error details without retrying a message that resembles a transport error', async () => {
            const error = new ExtensionError('Receiving end does not exist.');
            error.data = {stage: 'prepare'};
            const send = vi.spyOn(WebExtension.prototype, 'sendMessagePromise').mockResolvedValue({
                error: ExtensionError.serialize(error), result: true,
            });
            const main = vi.fn(async () => {});

            await expect(Application.main(false, main)).rejects.toMatchObject({
                name: error.name, message: error.message, stack: error.stack, data: error.data,
            });

            expect(send).toHaveBeenCalledOnce();
            expect(main).not.toHaveBeenCalled();
            expect(vi.getTimerCount()).toBe(0);
        });

        test.each([
            void 0, null, false, {}, {result: 0}, {result: 'true'},
            {error: null}, {error: void 0, result: true},
        ])('rejects malformed acknowledgement %j without retrying', async (response) => {
            const send = vi.spyOn(WebExtension.prototype, 'sendMessagePromise').mockResolvedValue(response);
            const main = vi.fn(async () => {});

            await expect(Application.main(false, main)).rejects.toThrow('Invalid backend readiness acknowledgement');

            expect(send).toHaveBeenCalledOnce();
            expect(main).not.toHaveBeenCalled();
            expect(vi.getTimerCount()).toBe(0);
        });
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
