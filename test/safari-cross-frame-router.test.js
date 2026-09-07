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

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import {SafariCrossFrameRouter} from '../ext/js/background/safari-cross-frame-router.js';
import {parseJson} from '../ext/js/core/json.js';
import {CrossFrameAPI, CrossFrameAPIPort} from '../ext/js/comm/cross-frame-api.js';
import {SAFARI_CROSS_FRAME_DATA_PORT, SAFARI_CROSS_FRAME_REGISTER_PORT, SafariCrossFrameClient} from '../ext/js/comm/safari-cross-frame-client.js';

/** @typedef {ReturnType<typeof globalThis.chrome.runtime.connect>} RuntimePort */
/** @typedef {NonNullable<RuntimePort['sender']>} MessageSender */
/** @typedef {NonNullable<MessageSender['tab']>} RuntimeTab */

const extensionId = 'sottaku-safari-test';
const extensionRoot = `safari-web-extension://${extensionId}/`;
/** @type {SafariCrossFrameClient[]} */
const clients = [];
/** @type {SafariCrossFrameRouter[]} */
const routers = [];

/** @template {unknown[]} T */
class NativeEvent {
    constructor() {
        /** @type {Set<(...args: T) => void>} */
        this.listeners = new Set();
    }

    /** @param {(...args: T) => void} listener */
    addListener(listener) { this.listeners.add(listener); }

    /** @param {(...args: T) => void} listener */
    removeListener(listener) { this.listeners.delete(listener); }

    /** @param {T} args */
    emit(...args) {
        // Native events snapshot listeners; activation may replace them mid-event.
        // eslint-disable-next-line unicorn/no-useless-spread
        for (const listener of [...this.listeners]) { listener(...args); }
    }
}

class NativePort {
    /**
     * @param {string} name
     * @param {MessageSender} [sender]
     */
    constructor(name, sender) {
        /** @type {string} */
        this.name = name;
        /** @type {MessageSender|undefined} */
        this.sender = sender;
        /** @type {NativeEvent<[unknown, RuntimePort]>} */
        this.onMessage = new NativeEvent();
        /** @type {NativeEvent<[RuntimePort]>} */
        this.onDisconnect = new NativeEvent();
        /** @type {NativePort|null} */
        this.peer = null;
        /** @type {boolean} */
        this.closed = false;
        /** @type {unknown[]} */
        this.sent = [];
    }

    /**
     * @param {unknown} message
     * @throws {Error}
     */
    postMessage(message) {
        if (this.closed || this.peer === null || this.peer.closed) { throw new Error('Port disconnected'); }
        const data = structuredClone(message);
        this.sent.push(data);
        const peer = this.peer;
        queueMicrotask(() => {
            if (!peer.closed) { peer.onMessage.emit(data, peer.asPort()); }
        });
    }

    /** */
    disconnect() {
        if (this.closed) { return; }
        this.closed = true;
        const peer = this.peer;
        if (peer !== null) { peer.closed = true; }
        queueMicrotask(() => {
            this.onDisconnect.emit(this.asPort());
            peer?.onDisconnect.emit(peer.asPort());
        });
    }

    /** @returns {RuntimePort} */
    asPort() { return /** @type {RuntimePort} */ (/** @type {unknown} */ (this)); }
}

/**
 * Runtime sender identity belongs to the harness, not connectInfo or messages.
 */
class NativeRuntime {
    /**
     * @param {NativeEvent<[RuntimePort]>} onConnect
     * @param {MessageSender} sender
     */
    constructor(onConnect, sender) {
        /** @type {string} */
        this.id = extensionId;
        /** @type {NativeEvent<[RuntimePort]>} */
        this.onConnect = onConnect;
        /** @type {MessageSender} */
        this.sender = sender;
        /** @type {NativePort[]} */
        this.ports = [];
    }

    /**
     * @param {{name?: string}} info
     * @returns {RuntimePort}
     */
    connect(info) {
        const client = new NativePort(info.name || '');
        const backend = new NativePort(info.name || '', this.sender);
        client.peer = backend;
        backend.peer = client;
        this.ports.push(client);
        queueMicrotask(() => {
            if (!backend.closed) { this.onConnect.emit(backend.asPort()); }
        });
        return client.asPort();
    }

    /**
     * @param {string} file
     * @returns {string}
     */
    getURL(file) { return new URL(file.replace(/^\//u, ''), extensionRoot).href; }

    /** @returns {typeof globalThis.chrome.runtime} */
    asRuntime() { return /** @type {typeof globalThis.chrome.runtime} */ (/** @type {unknown} */ (this)); }
}

/**
 * @param {number} tabId
 * @param {number} frameId
 * @param {string} url
 * @param {string} [documentId]
 * @returns {MessageSender}
 */
function createSender(tabId, frameId, url, documentId = `${tabId}:${frameId}`) {
    return {id: extensionId, tab: /** @type {RuntimeTab} */ ({id: tabId}), frameId, url, documentId};
}

/** @returns {Promise<void>} */
async function flushPorts() {
    for (let index = 0; index < 30; ++index) { await Promise.resolve(); }
}

/** @returns {{router: SafariCrossFrameRouter, onConnect: NativeEvent<[RuntimePort]>, endpoint: (identity: MessageSender, role: 'extension'|'content') => {client: SafariCrossFrameClient, runtime: NativeRuntime, connected: ReturnType<typeof vi.fn>, identity: MessageSender, connection: (tabId: number, frameId: number) => Promise<RuntimePort>}}} */
function createNetwork() {
    /** @type {NativeEvent<[RuntimePort]>} */
    const onConnect = new NativeEvent();
    const backendRuntime = new NativeRuntime(onConnect, {});
    const router = new SafariCrossFrameRouter({runtime: backendRuntime.asRuntime(), timeout: 5000});
    routers.push(router);
    router.prepare();
    /**
     * @param {MessageSender} identity
     * @param {'extension'|'content'} role
     * @returns {{client: SafariCrossFrameClient, runtime: NativeRuntime, connected: ReturnType<typeof vi.fn>, identity: MessageSender, connection: (tabId: number, frameId: number) => Promise<RuntimePort>}}
     */
    function endpoint(identity, role) {
        const runtime = new NativeRuntime(onConnect, identity);
        /** @type {Map<string, RuntimePort>} */
        const active = new Map();
        const connected = vi.fn();
        /**
         * @param {number} tabId
         * @param {number} frameId
         * @param {RuntimePort} port
         */
        function onConnection(tabId, frameId, port) {
            connected(tabId, frameId, port);
            const key = JSON.stringify([tabId, frameId]);
            active.set(key, port);
            port.onDisconnect.addListener(() => {
                if (active.get(key) === port) { active.delete(key); }
            });
        }
        const client = new SafariCrossFrameClient(onConnection, {runtime: runtime.asRuntime(), timeout: 5000, role});
        clients.push(client);
        client.prepare();
        /**
         * @param {number} tabId
         * @param {number} frameId
         * @returns {Promise<RuntimePort>}
         */
        function connection(tabId, frameId) {
            const current = active.get(JSON.stringify([tabId, frameId]));
            return current ? Promise.resolve(current) : client.waitForConnection(tabId, frameId);
        }
        return {client, runtime, connected, identity, connection};
    }
    return {router, endpoint, onConnect};
}

/**
 * @param {NativeRuntime} runtime
 * @param {string} name
 * @returns {NativePort[]}
 */
function portsNamed(runtime, name) {
    return runtime.ports.filter((port) => {
        const details = parseJson(port.name);
        return typeof details === 'object' && details !== null && Reflect.get(details, 'name') === name;
    });
}

/**
 * @returns {Promise<{router: SafariCrossFrameRouter, onConnect: NativeEvent<[RuntimePort]>, source: NativeRuntime, target: NativeRuntime, sourceInfo: {id: string, side: number}, targetInfo: {id: string, side: number}, opened: Promise<{targetTabId: number, targetFrameId: number}>}>}
 */
async function createRawRoute() {
    const {router, onConnect} = createNetwork();
    const source = new NativeRuntime(onConnect, createSender(1, 0, 'https://example.com/'));
    const target = new NativeRuntime(onConnect, createSender(1, 8, `${extensionRoot}popup.html`));
    source.connect({name: JSON.stringify({name: SAFARI_CROSS_FRAME_REGISTER_PORT, role: 'content'})});
    target.connect({name: JSON.stringify({name: SAFARI_CROSS_FRAME_REGISTER_PORT, role: 'extension'})});
    await flushPorts();
    const opened = router.open(source.sender, 1, 8);
    await flushPorts();
    /**
     * @param {NativeRuntime} runtime
     * @returns {{id: string, side: number}}
     */
    function connectInfo(runtime) {
        const message = runtime.ports[0].peer?.sent.find((item) => typeof item === 'object' && item !== null && Reflect.get(item, 'type') === 'connect');
        expect(message).toBeDefined();
        return /** @type {{id: string, side: number}} */ (message);
    }
    return {router, onConnect, source, target, sourceInfo: connectInfo(source), targetInfo: connectInfo(target), opened};
}

/**
 * @param {NativeRuntime} runtime
 * @param {{id: string, side: number}} info
 * @returns {RuntimePort}
 */
function connectData(runtime, info) {
    return runtime.connect({name: JSON.stringify({name: SAFARI_CROSS_FRAME_DATA_PORT, id: info.id, side: info.side})});
}

beforeEach(() => {
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
    vi.stubGlobal('window', new EventTarget());
    vi.stubGlobal('document', new EventTarget());
});

afterEach(async () => {
    for (const client of clients.splice(0)) { client.dispose(); }
    for (const router of routers.splice(0)) { router.dispose(); }
    await flushPorts();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('Safari reverse cross-frame ports', () => {
    test('routes a real pair of outgoing ports in both directions using browser sender identities', async () => {
        /** @type {NativeEvent<[RuntimePort]>} */
        const onConnect = new NativeEvent();
        const backendRuntime = new NativeRuntime(onConnect, {});
        const sourceSender = createSender(33, 0, 'https://example.com/');
        const targetSender = createSender(33, 25769803779, `${extensionRoot}popup.html`);
        const sourceRuntime = new NativeRuntime(onConnect, sourceSender);
        const targetRuntime = new NativeRuntime(onConnect, targetSender);
        const router = new SafariCrossFrameRouter({runtime: backendRuntime.asRuntime(), timeout: 5000});
        const source = new SafariCrossFrameClient(vi.fn(), {runtime: sourceRuntime.asRuntime(), timeout: 5000, role: 'content'});
        const target = new SafariCrossFrameClient(vi.fn(), {runtime: targetRuntime.asRuntime(), timeout: 5000});
        clients.push(source, target);
        routers.push(router);
        router.prepare();
        source.prepare();
        target.prepare();
        const sourcePortPromise = source.waitForConnection(33, 25769803779);
        const targetPortPromise = target.waitForConnection(33, 0);
        const opened = router.open(sourceSender, 33, 25769803779);
        await flushPorts();
        await expect(opened).resolves.toEqual({targetTabId: 33, targetFrameId: 25769803779});
        const [sourcePort, targetPort] = await Promise.all([sourcePortPromise, targetPortPromise]);
        const atSource = vi.fn();
        const atTarget = vi.fn();
        sourcePort.onMessage.addListener(atSource);
        targetPort.onMessage.addListener(atTarget);
        const request = {type: 'invoke', id: 0, data: {action: 'frontendGetPageInfo'}};
        sourcePort.postMessage(request);
        await flushPorts();
        expect(atTarget).toHaveBeenCalledWith(request, expect.anything());
        const reply = {type: 'result', id: 0, data: {result: 'confirmed'}};
        targetPort.postMessage(reply);
        await flushPorts();
        expect(atSource).toHaveBeenCalledWith(reply, expect.anything());
    });

    test('preserves the existing invoke, acknowledgement and result protocol', async () => {
        const {router, endpoint} = createNetwork();
        const source = endpoint(createSender(33, 0, 'https://example.com/'), 'content');
        const target = endpoint(createSender(33, 8, `${extensionRoot}popup.html`), 'extension');
        const sourceReady = source.connection(33, 8);
        const targetReady = target.connection(33, 0);
        await router.open(source.identity, 33, 8);
        const sourcePort = new CrossFrameAPIPort(33, 8, await sourceReady, new Map());
        /** @type {import('cross-frame-api').ApiMap} */
        const handlers = new Map();
        handlers.set('frontendGetPopupInfo', async () => ({popupId: 'popup-test'}));
        const targetPort = new CrossFrameAPIPort(33, 0, await targetReady, handlers);
        sourcePort.prepare();
        targetPort.prepare();
        await expect(sourcePort.invoke('frontendGetPopupInfo', void 0, 3000, 10000)).resolves.toEqual({popupId: 'popup-test'});
        const nativeClosed = vi.fn();
        (await target.connection(33, 0)).onDisconnect.addListener(nativeClosed);
        sourcePort.disconnect();
        await flushPorts();
        expect(nativeClosed).toHaveBeenCalledOnce();
        await expect(router.open(source.identity, 33, 8)).resolves.toEqual({targetTabId: 33, targetFrameId: 8});
        targetPort.disconnect();
    });

    test('keeps frames with the same ID in separate tabs independent', async () => {
        const {router, endpoint} = createNetwork();
        const source = endpoint(createSender(1, 0, 'https://example.com/'), 'content');
        const first = endpoint(createSender(2, 7, `${extensionRoot}popup.html`), 'extension');
        const second = endpoint(createSender(3, 7, `${extensionRoot}popup.html`), 'extension');
        const firstReady = source.connection(2, 7);
        const secondReady = source.connection(3, 7);
        await Promise.all([router.open(source.identity, 2, 7), router.open(source.identity, 3, 7)]);
        const firstPort = await firstReady;
        const secondPort = await secondReady;
        const atFirst = vi.fn();
        const atSecond = vi.fn();
        (await first.connection(1, 0)).onMessage.addListener(atFirst);
        (await second.connection(1, 0)).onMessage.addListener(atSecond);
        firstPort.postMessage({test: 'first'});
        secondPort.postMessage({test: 'second'});
        await flushPorts();
        expect(atFirst.mock.calls.map(([message]) => message)).toEqual([{test: 'first'}]);
        expect(atSecond.mock.calls.map(([message]) => message)).toEqual([{test: 'second'}]);
    });

    test('deduplicates simultaneous opens in both directions', async () => {
        const {router, endpoint} = createNetwork();
        const first = endpoint(createSender(1, 0, 'https://example.com/'), 'content');
        const second = endpoint(createSender(1, 8, `${extensionRoot}popup.html`), 'extension');
        await Promise.all([
            router.open(first.identity, 1, 8),
            router.open(first.identity, 1, 8),
            router.open(second.identity, 1, 0),
        ]);
        expect(portsNamed(first.runtime, SAFARI_CROSS_FRAME_DATA_PORT)).toHaveLength(1);
        expect(portsNamed(second.runtime, SAFARI_CROSS_FRAME_DATA_PORT)).toHaveLength(1);
        expect(first.connected).toHaveBeenCalledOnce();
        expect(second.connected).toHaveBeenCalledOnce();
    });

    test('waits for a late registration within the single connection deadline', async () => {
        const {router, endpoint} = createNetwork();
        const source = endpoint(createSender(1, 0, 'https://example.com/'), 'content');
        const opened = router.open(source.identity, 1, 8);
        await vi.advanceTimersByTimeAsync(4000);
        const target = endpoint(createSender(1, 8, `${extensionRoot}popup.html`), 'extension');
        await flushPorts();
        await expect(opened).resolves.toEqual({targetTabId: 1, targetFrameId: 8});
        expect(target.connected).toHaveBeenCalledOnce();
    });

    test('expires a missing registration and can open a later fresh request', async () => {
        const {router, endpoint} = createNetwork();
        const source = endpoint(createSender(1, 0, 'https://example.com/'), 'content');
        const first = router.open(source.identity, 1, 8);
        const failed = expect(first).rejects.toThrow();
        await vi.advanceTimersByTimeAsync(5001);
        await failed;
        endpoint(createSender(1, 8, `${extensionRoot}popup.html`), 'extension');
        await expect(router.open(source.identity, 1, 8)).resolves.toEqual({targetTabId: 1, targetFrameId: 8});
    });

    test.each([
        {id: 'another-extension'},
        {frameId: -1},
        {frameId: Number.NaN},
        {frameId: 0.5},
        {tab: /** @type {RuntimeTab} */ ({id: -1})},
    ])('rejects invalid browser sender identity %j', async (invalid) => {
        const {router, endpoint} = createNetwork();
        const sourceIdentity = createSender(1, 0, 'https://example.com/');
        endpoint(sourceIdentity, 'content');
        endpoint(createSender(1, 8, `${extensionRoot}popup.html`), 'extension');
        await flushPorts();
        await expect(router.open({...sourceIdentity, ...invalid}, 1, 8)).rejects.toThrow();
    });

    test.each(['https://example.com/', 'safari-web-extension://other/popup.html', `${extensionRoot.replace(/\/$/u, '')}.example/popup.html`, `chrome-extension://${extensionId}/popup.html`])('rejects an extension-role registration outside its exact native origin: %s', async (url) => {
        const {endpoint} = createNetwork();
        const invalid = endpoint(createSender(1, 0, url), 'extension');
        await flushPorts();
        expect(portsNamed(invalid.runtime, SAFARI_CROSS_FRAME_REGISTER_PORT)[0].closed).toBe(true);
        expect(invalid.connected).not.toHaveBeenCalled();
    });

    test('selects popup Main over an earlier content world in the same frame', async () => {
        const {router, endpoint} = createNetwork();
        const source = endpoint(createSender(1, 0, 'https://example.com/'), 'content');
        const isolated = endpoint(createSender(1, 8, 'about:blank', 'old-document'), 'content');
        await flushPorts();
        const main = endpoint(createSender(1, 8, `${extensionRoot}popup.html`, 'new-document'), 'extension');
        await flushPorts();
        await router.open(source.identity, 1, 8);
        expect(main.connected).toHaveBeenCalledOnce();
        expect(isolated.connected).not.toHaveBeenCalled();
        expect(portsNamed(isolated.runtime, SAFARI_CROSS_FRAME_REGISTER_PORT)[0].closed).toBe(true);
    });

    test('does not let a later content registration steal a live popup Main endpoint', async () => {
        const {router, endpoint} = createNetwork();
        const source = endpoint(createSender(1, 0, 'https://example.com/'), 'content');
        const main = endpoint(createSender(1, 8, `${extensionRoot}popup.html`), 'extension');
        await flushPorts();
        const isolated = endpoint(createSender(1, 8, `${extensionRoot}popup.html`), 'content');
        await flushPorts();
        await router.open(source.identity, 1, 8);
        expect(main.connected).toHaveBeenCalledOnce();
        expect(isolated.connected).not.toHaveBeenCalled();
        expect(portsNamed(isolated.runtime, SAFARI_CROSS_FRAME_REGISTER_PORT)[0].closed).toBe(true);
    });

    test('rejects an API request from an old document after its frame registration is replaced', async () => {
        const {router, endpoint} = createNetwork();
        const old = endpoint(createSender(1, 0, 'https://example.com/', 'old-document'), 'content');
        await flushPorts();
        old.client.dispose();
        await flushPorts();
        endpoint(createSender(1, 0, 'https://example.com/', 'new-document'), 'content');
        endpoint(createSender(1, 8, `${extensionRoot}popup.html`), 'extension');
        await flushPorts();
        await expect(router.open(old.identity, 1, 8)).rejects.toThrow();
    });

    test.each(['https://example.com/after', 'https://example.com/before#changed'])('accepts a URL change within the same browser document: %s', async (url) => {
        const {router, endpoint} = createNetwork();
        const source = endpoint(createSender(1, 0, 'https://example.com/before', 'stable-document'), 'content');
        endpoint(createSender(1, 8, `${extensionRoot}popup.html`), 'extension');
        await flushPorts();
        source.runtime.sender = {...source.identity, url};
        await expect(router.open(source.runtime.sender, 1, 8)).resolves.toEqual({targetTabId: 1, targetFrameId: 8});
    });

    test('keeps a live Main document until it suspends, then accepts the new document', async () => {
        const {router, endpoint} = createNetwork();
        const source = endpoint(createSender(1, 0, 'https://example.com/'), 'content');
        const previous = endpoint(createSender(1, 8, `${extensionRoot}popup.html`, 'previous-document'), 'extension');
        await flushPorts();
        const current = endpoint(createSender(1, 8, `${extensionRoot}popup.html`, 'current-document'), 'extension');
        await flushPorts();
        expect(portsNamed(current.runtime, SAFARI_CROSS_FRAME_REGISTER_PORT)[0].closed).toBe(true);
        previous.client.suspend();
        await vi.advanceTimersByTimeAsync(101);
        await router.open(source.identity, 1, 8);
        expect(current.connected).toHaveBeenCalledOnce();
        expect(previous.connected).not.toHaveBeenCalled();
        await expect(router.open(previous.identity, 1, 0)).rejects.toThrow();
    });

    test('late stale disconnects cannot remove a replacement registration or route', async () => {
        const {router, endpoint} = createNetwork();
        const source = endpoint(createSender(1, 0, 'https://example.com/'), 'content');
        const old = endpoint(createSender(1, 8, `${extensionRoot}popup.html`, 'old-document'), 'extension');
        await flushPorts();
        const staleBackend = portsNamed(old.runtime, SAFARI_CROSS_FRAME_REGISTER_PORT)[0].peer;
        old.client.dispose();
        await flushPorts();
        const replacement = endpoint(createSender(1, 8, `${extensionRoot}popup.html`, 'new-document'), 'extension');
        await flushPorts();
        staleBackend?.onDisconnect.emit(staleBackend.asPort());
        await router.open(source.identity, 1, 8);
        expect(replacement.connected).toHaveBeenCalledOnce();
        expect(old.connected).not.toHaveBeenCalled();
    });

    test('disconnecting an endpoint tears down both data ports and permits a fresh route', async () => {
        const {router, endpoint} = createNetwork();
        const source = endpoint(createSender(1, 0, 'https://example.com/'), 'content');
        const target = endpoint(createSender(1, 8, `${extensionRoot}popup.html`), 'extension');
        await router.open(source.identity, 1, 8);
        const firstSource = await source.connection(1, 8);
        const firstTarget = await target.connection(1, 0);
        const disconnected = vi.fn();
        firstSource.onDisconnect.addListener(disconnected);
        firstTarget.disconnect();
        await flushPorts();
        expect(disconnected).toHaveBeenCalledOnce();
        await router.open(source.identity, 1, 8);
        expect(await source.connection(1, 8)).not.toBe(firstSource);
        expect(await target.connection(1, 0)).not.toBe(firstTarget);
    });

    test('reconnects registration after background restart without replaying old data', async () => {
        const {router, endpoint, onConnect} = createNetwork();
        const source = endpoint(createSender(1, 0, 'https://example.com/'), 'content');
        const target = endpoint(createSender(1, 8, `${extensionRoot}popup.html`), 'extension');
        await router.open(source.identity, 1, 8);
        const previousPort = await source.connection(1, 8);
        previousPort.postMessage({type: 'invoke', id: 99, data: {action: 'test-side-effect'}});
        await flushPorts();
        router.dispose();
        const next = new SafariCrossFrameRouter({runtime: new NativeRuntime(onConnect, {}).asRuntime(), timeout: 5000});
        routers.push(next);
        next.prepare();
        await vi.advanceTimersByTimeAsync(101);
        await next.open(source.identity, 1, 8);
        const nextPort = await source.connection(1, 8);
        expect(nextPort).not.toBe(previousPort);
        const nextTarget = await target.connection(1, 0);
        const received = vi.fn();
        nextTarget.onMessage.addListener(received);
        await flushPorts();
        expect(received).not.toHaveBeenCalled();
        expect(portsNamed(target.runtime, SAFARI_CROSS_FRAME_DATA_PORT).at(-1)?.peer?.sent).not.toContainEqual({type: 'invoke', id: 99, data: {action: 'test-side-effect'}});
    });

    test.each([
        {id: 'other-extension'},
        {tab: /** @type {RuntimeTab} */ ({id: 999})},
        {frameId: 999},
        {documentId: 'stale-document'},
        {documentId: void 0},
    ])('rejects a stolen route ID presented with the wrong browser identity %j', async (invalid) => {
        const {onConnect, source, target, sourceInfo, targetInfo, opened} = await createRawRoute();
        const attacker = new NativeRuntime(onConnect, {...target.sender, ...invalid});
        connectData(attacker, targetInfo);
        await flushPorts();
        expect(attacker.ports[0].closed).toBe(true);
        const sourcePort = connectData(source, sourceInfo);
        const targetPort = connectData(target, targetInfo);
        await flushPorts();
        sourcePort.postMessage({type: 'ready'});
        targetPort.postMessage({type: 'ready'});
        await expect(opened).resolves.toEqual({targetTabId: 1, targetFrameId: 8});
    });

    test('does not relay data before both endpoint ports are ready', async () => {
        const {source, target, sourceInfo, targetInfo, opened} = await createRawRoute();
        const sourcePort = connectData(source, sourceInfo);
        const targetPort = connectData(target, targetInfo);
        const atTarget = vi.fn();
        targetPort.onMessage.addListener(atTarget);
        await flushPorts();
        sourcePort.postMessage({type: 'invoke', id: 9, data: {action: 'premature'}});
        sourcePort.postMessage({type: 'ready'});
        await flushPorts();
        expect(atTarget).not.toHaveBeenCalled();
        targetPort.postMessage({type: 'ready'});
        await opened;
        await flushPorts();
        expect(atTarget.mock.calls.map(([message]) => message)).toEqual([{type: 'activate'}]);
    });

    test('does not restart the overall deadline while waiting for data-port readiness', async () => {
        const {source, target, sourceInfo, targetInfo, opened} = await createRawRoute();
        const failed = expect(opened).rejects.toThrow();
        await vi.advanceTimersByTimeAsync(4000);
        const sourcePort = connectData(source, sourceInfo);
        connectData(target, targetInfo);
        await flushPorts();
        sourcePort.postMessage({type: 'ready'});
        await vi.advanceTimersByTimeAsync(1001);
        await failed;
        expect(portsNamed(source, SAFARI_CROSS_FRAME_DATA_PORT)[0].closed).toBe(true);
        expect(portsNamed(target, SAFARI_CROSS_FRAME_DATA_PORT)[0].closed).toBe(true);
    });

    test('rejects a pending route immediately if a registered endpoint disconnects', async () => {
        const {target, opened} = await createRawRoute();
        const failed = expect(opened).rejects.toThrow();
        target.ports[0].disconnect();
        await flushPorts();
        await failed;
    });

    test('bounds automatic reconnects and permits a new lazy retry', async () => {
        const {endpoint} = createNetwork();
        const invalid = endpoint(createSender(1, 0, 'https://example.com/'), 'extension');
        await vi.advanceTimersByTimeAsync(60000);
        expect(invalid.runtime.ports).toHaveLength(6);
        const pending = invalid.client.waitForConnection(1, 8);
        const failed = expect(pending).rejects.toThrow();
        await flushPorts();
        await failed;
        expect(invalid.runtime.ports).toHaveLength(7);
    });

    test('contains a native data-port connection failure and starts a fresh later request', async () => {
        const {router, endpoint} = createNetwork();
        const source = endpoint(createSender(1, 0, 'https://example.com/'), 'content');
        const target = endpoint(createSender(1, 8, `${extensionRoot}popup.html`), 'extension');
        await flushPorts();
        const connect = target.runtime.connect.bind(target.runtime);
        let failNext = true;
        vi.spyOn(target.runtime, 'connect').mockImplementation((info) => {
            /** @type {unknown} */
            const name = Reflect.get(/** @type {object} */ (parseJson(info.name || '')), 'name');
            if (name === SAFARI_CROSS_FRAME_DATA_PORT && failNext) {
                failNext = false;
                throw new Error('Native connection unavailable');
            }
            return connect(info);
        });
        const failed = expect(router.open(source.identity, 1, 8)).rejects.toThrow();
        await vi.advanceTimersByTimeAsync(5001);
        await failed;
        await expect(router.open(source.identity, 1, 8)).resolves.toEqual({targetTabId: 1, targetFrameId: 8});
        expect(portsNamed(source.runtime, SAFARI_CROSS_FRAME_DATA_PORT)).toHaveLength(2);
        expect(source.connected).toHaveBeenCalledOnce();
        expect(target.connected).toHaveBeenCalledOnce();
    });

    test('cleans up a failed registration acknowledgement and reconnects with a fresh native port', async () => {
        const {router, endpoint} = createNetwork();
        const source = endpoint(createSender(1, 0, 'https://example.com/'), 'content');
        const backendPort = source.runtime.ports[0].peer;
        if (backendPort === null) { throw new Error('Missing paired runtime port'); }
        vi.spyOn(backendPort, 'postMessage').mockImplementationOnce(() => { throw new Error('Native acknowledgement unavailable'); });
        endpoint(createSender(1, 8, `${extensionRoot}popup.html`), 'extension');
        await vi.advanceTimersByTimeAsync(101);
        expect(source.runtime.ports[0].closed).toBe(true);
        await expect(router.open(source.identity, 1, 8)).resolves.toEqual({targetTabId: 1, targetFrameId: 8});
        expect(portsNamed(source.runtime, SAFARI_CROSS_FRAME_REGISTER_PORT)).toHaveLength(2);
        expect(source.connected).toHaveBeenCalledOnce();
    });

    test('rejects waits while suspended and can establish a fresh connection after resume', async () => {
        const {router, endpoint} = createNetwork();
        const source = endpoint(createSender(1, 0, 'https://example.com/'), 'content');
        endpoint(createSender(1, 8, `${extensionRoot}popup.html`), 'extension');
        await flushPorts();
        source.client.suspend();
        await expect(source.client.waitForConnection(1, 8)).rejects.toThrow();
        source.client.resume();
        await expect(router.open(source.identity, 1, 8)).resolves.toEqual({targetTabId: 1, targetFrameId: 8});
    });

    test('actual CrossFrameAPI times out missing activation but accepts activation after a lost API callback', async () => {
        const {router, onConnect} = createNetwork();
        const sourceIdentity = createSender(33, 0, 'https://example.com/');
        const targetIdentity = createSender(33, 25769803779, `${extensionRoot}popup.html`);
        const sourceRuntime = new NativeRuntime(onConnect, sourceIdentity);
        const targetRuntime = new NativeRuntime(onConnect, targetIdentity);
        const sourceWindow = new EventTarget();
        const targetWindow = new EventTarget();
        const opened = vi.fn();
        let openAttempt = 0;
        /**
         * @param {number} tabId
         * @param {number} frameId
         * @returns {Promise<{targetTabId: number, targetFrameId: number}>}
         */
        function openSource(tabId, frameId) {
            opened(tabId, frameId);
            ++openAttempt;
            if (openAttempt === 1) {
                return new Promise(() => {});
            }
            if (openAttempt === 2) {
                // The backend activates both native ports, but its RPC callback
                // is lost. Native activation must still complete the connection.
                void router.open(sourceIdentity, tabId, frameId).catch(() => {});
                return new Promise(() => {});
            }
            return router.open(sourceIdentity, tabId, frameId);
        }
        const sourceApi = /** @type {import('../ext/js/comm/api.js').API} */ (/** @type {unknown} */ ({openCrossFramePort: openSource}));
        const targetApi = /** @type {import('../ext/js/comm/api.js').API} */ (/** @type {unknown} */ ({openCrossFramePort: (/** @type {number} */ tabId, /** @type {number} */ frameId) => router.open(targetIdentity, tabId, frameId)}));
        vi.stubGlobal('chrome', {runtime: sourceRuntime.asRuntime()});
        vi.stubGlobal('window', sourceWindow);
        const source = new CrossFrameAPI(sourceApi, 33, 0, 'content');
        source.prepare();
        vi.stubGlobal('chrome', {runtime: targetRuntime.asRuntime()});
        vi.stubGlobal('window', targetWindow);
        const target = new CrossFrameAPI(targetApi, 33, 25769803779, 'extension');
        target.prepare();
        const handled = vi.fn();
        target.registerHandlers([['frontendGetPopupInfo', () => {
            handled();
            return {popupId: 'live-popup'};
        }]]);
        const firstFailed = expect(source.invoke(25769803779, 'frontendGetPopupInfo', void 0)).rejects.toThrow();
        await vi.advanceTimersByTimeAsync(5001);
        await firstFailed;
        // A silent native callback must not retain the pending-creation cache.
        await expect(Promise.all([
            source.invoke(25769803779, 'frontendGetPopupInfo', void 0),
            source.invoke(25769803779, 'frontendGetPopupInfo', void 0),
            source.invoke(25769803779, 'frontendGetPopupInfo', void 0),
        ])).resolves.toEqual(new Array(3).fill({popupId: 'live-popup'}));
        expect(opened).toHaveBeenCalledTimes(2);
        expect(handled).toHaveBeenCalledTimes(3);
        sourceWindow.dispatchEvent(new Event('pagehide'));
        await flushPorts();
        const resumed = new Event('pageshow');
        Object.defineProperty(resumed, 'persisted', {value: true});
        sourceWindow.dispatchEvent(resumed);
        await expect(source.invoke(25769803779, 'frontendGetPopupInfo', void 0)).resolves.toEqual({popupId: 'live-popup'});
        expect(opened).toHaveBeenCalledTimes(3);
        expect(handled).toHaveBeenCalledTimes(4);
        sourceWindow.dispatchEvent(new Event('pagehide'));
        targetWindow.dispatchEvent(new Event('pagehide'));
    });

    test.each(['chrome-extension:', 'moz-extension:'])('retains native incoming ports for %s', (protocol) => {
        /** @type {NativeEvent<[RuntimePort]>} */
        const onConnect = new NativeEvent();
        const runtime = new NativeRuntime(onConnect, createSender(1, 0, 'https://example.com/'));
        runtime.getURL = (file) => `${protocol}//${extensionId}/${file.replace(/^\//u, '')}`;
        vi.stubGlobal('chrome', {runtime: runtime.asRuntime()});
        const api = /** @type {import('../ext/js/comm/api.js').API} */ (/** @type {unknown} */ ({}));
        new CrossFrameAPI(api, 1, 0, 'content').prepare();
        expect(onConnect.listeners.size).toBe(1);
        expect(runtime.ports).toEqual([]);
    });
});
