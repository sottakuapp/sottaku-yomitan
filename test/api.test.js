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

import {afterEach, expect, test, vi} from 'vitest';
import {API} from '../ext/js/comm/api.js';
import {log} from '../ext/js/core/log.js';
import {WebExtension} from '../ext/js/extension/web-extension.js';

/** @type {MessagePort[]} */
const ports = [];
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    for (const port of ports.splice(0)) { port.close(); }
});

/** @returns {MessageChannel} */
function createChannel() {
    const channel = new MessageChannel();
    ports.push(channel.port1, channel.port2);
    return channel;
}

/** @returns {{activate: () => void, postMessage: ReturnType<typeof vi.fn>, getReady: ReturnType<typeof vi.fn>, container: object}} */
function createServiceWorker() {
    const postMessage = vi.fn();
    let activate = () => {};
    const ready = new Promise((resolve) => { activate = () => resolve({active: {postMessage}}); });
    const getReady = vi.fn(() => ready);
    const container = Object.defineProperty({}, 'ready', {get: getReady});
    return {activate, postMessage, getReady, container};
}

test.each(['Safari', 'Firefox'])('%s background pages transfer the database port without waiting for a service worker', async (browser) => {
    const worker = createServiceWorker();
    vi.stubGlobal('navigator', browser === 'Safari' ? {serviceWorker: worker.container} : {});
    const backend = createChannel();
    const database = createChannel();
    const backendPostMessage = vi.spyOn(backend.port1, 'postMessage');
    /** @type {Promise<MessageEvent>} */
    const received = new Promise((resolve) => { backend.port2.onmessage = resolve; });
    const api = new API(new WebExtension(), null, backend.port1);

    api.connectToDatabaseWorker(database.port1);

    expect(backendPostMessage).toHaveBeenCalledExactlyOnceWith({action: 'connectToDatabaseWorker', params: void 0}, [database.port1]);
    expect(worker.getReady).not.toHaveBeenCalled();
    const event = await received;
    expect(event.data).toEqual({action: 'connectToDatabaseWorker', params: void 0});
    expect(event.ports).toHaveLength(1);
    ports.push(event.ports[0]);
    /** @type {Promise<MessageEvent>} */
    const databaseMessage = new Promise((resolve) => { database.port2.onmessage = resolve; });
    event.ports[0].postMessage('database-port-received');
    expect((await databaseMessage).data).toBe('database-port-received');

    worker.activate();
    await Promise.resolve();
    expect(worker.postMessage).not.toHaveBeenCalled();
    expect(backendPostMessage).toHaveBeenCalledTimes(1);
});

test('Chrome service-worker backgrounds transfer the port once their worker becomes active', async () => {
    const worker = createServiceWorker();
    vi.stubGlobal('navigator', {serviceWorker: worker.container});
    const database = createChannel();
    const api = new API(new WebExtension());

    api.connectToDatabaseWorker(database.port1);
    expect(worker.postMessage).not.toHaveBeenCalled();
    worker.activate();
    await Promise.resolve();

    expect(worker.postMessage).toHaveBeenCalledExactlyOnceWith({action: 'connectToDatabaseWorker', params: void 0}, [database.port1]);
});

test('a failing background port preserves the error without retrying a transfer through a service worker', () => {
    const worker = createServiceWorker();
    vi.stubGlobal('navigator', {serviceWorker: worker.container});
    const backend = createChannel();
    const database = createChannel();
    const failure = new Error('Port unavailable');
    vi.spyOn(backend.port1, 'postMessage').mockImplementation(() => { throw failure; });
    const api = new API(new WebExtension(), null, backend.port1);

    expect(() => api.connectToDatabaseWorker(database.port1)).toThrow(failure);
    expect(worker.getReady).not.toHaveBeenCalled();
    expect(worker.postMessage).not.toHaveBeenCalled();
});

test('missing background transports retain the existing diagnostic', () => {
    vi.stubGlobal('navigator', {});
    const error = vi.spyOn(log, 'error').mockImplementation(() => {});
    const database = createChannel();
    const api = new API(new WebExtension());

    api.connectToDatabaseWorker(database.port1);

    expect(error).toHaveBeenCalledExactlyOnceWith('no backend port available');
});

test('a service worker without an active instance retains the existing diagnostic', async () => {
    vi.stubGlobal('navigator', {serviceWorker: {ready: Promise.resolve({active: null})}});
    vi.stubGlobal('self', {constructor: {name: 'Window'}});
    const error = vi.spyOn(log, 'error').mockImplementation(() => {});
    const api = new API(new WebExtension());

    api.registerOffscreenPort([]);
    await Promise.resolve();

    expect(error).toHaveBeenCalledExactlyOnceWith('[Window] no active service worker');
});
