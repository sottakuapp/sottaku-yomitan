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

import {isObjectNotArray} from '../core/object-utilities.js';
import {deferPromise} from '../core/utilities.js';

/** @typedef {ReturnType<typeof globalThis.chrome.runtime.connect>} NativePort */

export const SAFARI_CROSS_FRAME_REGISTER_PORT = 'sottaku-safari-cross-frame-register';

export const SAFARI_CROSS_FRAME_DATA_PORT = 'sottaku-safari-cross-frame-data';

/**
 * Safari routes tabs.connect by the top-level page's content world. Register
 * outgoing native ports instead, including for extension iframes in web pages.
 */
export class SafariCrossFrameClient {
    /**
     * @param {(tabId: number, frameId: number, port: NativePort) => void} onConnect
     * @param {{runtime?: typeof globalThis.chrome.runtime, timeout?: number, role?: 'content'|'extension', reconnectDelay?: number}} [options]
     */
    constructor(onConnect, {runtime = chrome.runtime, timeout = 5000, role = 'extension', reconnectDelay = 100} = {}) {
        /** @type {typeof globalThis.chrome.runtime} */
        this._runtime = runtime;
        /** @type {(tabId: number, frameId: number, port: NativePort) => void} */
        this._onConnect = onConnect;
        /** @type {number} */
        this._timeout = timeout;
        /** @type {'content'|'extension'} */
        this._role = role;
        /** @type {number} */
        this._reconnectDelay = reconnectDelay;
        /** @type {number} */
        this._reconnectAttempt = 0;
        /** @type {ReturnType<typeof setTimeout>|null} */
        this._reconnectTimer = null;
        /** @type {NativePort|null} */
        this._registration = null;
        /** @type {Set<NativePort>} */
        this._ports = new Set();
        /** @type {Map<string, {promise: Promise<NativePort>, resolve: (port: NativePort) => void, reject: (error: unknown) => void, timer: ReturnType<typeof setTimeout>}>} */
        this._pending = new Map();
        /** @type {boolean} */
        this._disposed = false;
        /** @type {boolean} */
        this._suspended = false;
    }

    /** */
    prepare() {
        if (this._disposed || this._suspended || this._registration !== null) { return; }
        try {
            const port = this._runtime.connect({name: JSON.stringify({name: SAFARI_CROSS_FRAME_REGISTER_PORT, role: this._role})});
            this._registration = port;
            port.onMessage.addListener((/** @type {unknown} */ message) => {
                if (!isObjectNotArray(message)) { return; }
                if (this._registration !== port) { return; }
                if (message?.type === 'registered') {
                    this._reconnectAttempt = 0;
                } else if (message?.type === 'connect') {
                    this._connectDataPort(message);
                }
            });
            port.onDisconnect.addListener(() => {
                void this._runtime.lastError;
                if (this._registration !== port) { return; }
                this._registration = null;
                this._disconnectDataPorts();
                for (const key of this._pending.keys()) { this._rejectPending(key, new Error('Safari frame registration disconnected')); }
                this._scheduleReconnect();
            });
        } catch (error) {
            this._scheduleReconnect();
        }
    }

    /**
     * @param {number} tabId
     * @param {number} frameId
     * @returns {Promise<NativePort>}
     */
    waitForConnection(tabId, frameId) {
        if (this._disposed || this._suspended) { return Promise.reject(new Error('Safari frame transport unavailable')); }
        const key = JSON.stringify([tabId, frameId]);
        const current = this._pending.get(key);
        if (current) { return current.promise; }
        const {promise, resolve, reject} = /** @type {import('core').DeferredPromiseDetails<NativePort>} */ (deferPromise());
        const timer = setTimeout(() => this._rejectPending(key, new Error('Safari frame connection timed out')), this._timeout);
        this._pending.set(key, {promise, resolve, reject, timer});
        this._reconnectAttempt = 0;
        this.prepare();
        return promise;
    }

    /**
     * @param {number} tabId
     * @param {number} frameId
     * @param {unknown} error
     */
    cancelConnection(tabId, frameId, error) {
        this._rejectPending(JSON.stringify([tabId, frameId]), error);
    }

    /** */
    dispose() {
        this._disposed = true;
        this.suspend();
    }

    /** Release a cached/navigation document's claim to its native frame. */
    suspend() {
        this._suspended = true;
        if (this._reconnectTimer !== null) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
        const registration = this._registration;
        this._registration = null;
        registration?.disconnect();
        this._disconnectDataPorts();
        for (const key of this._pending.keys()) { this._rejectPending(key, new Error('Safari frame transport suspended')); }
    }

    /** */
    resume() {
        if (this._disposed) { return; }
        this._suspended = false;
        this._reconnectAttempt = 0;
        this.prepare();
    }

    /**
     * @param {string} key
     * @param {unknown} error
     */
    _rejectPending(key, error) {
        const pending = this._pending.get(key);
        if (!pending) { return; }
        this._pending.delete(key);
        clearTimeout(pending.timer);
        pending.reject(error);
    }

    /** */
    _disconnectDataPorts() {
        for (const port of this._ports) { port.disconnect(); }
        this._ports.clear();
    }

    /** */
    _scheduleReconnect() {
        if (this._disposed || this._suspended || this._reconnectTimer !== null || this._reconnectAttempt >= 5) { return; }
        const delay = Math.min(this._reconnectDelay * (2 ** this._reconnectAttempt++), 5000);
        this._reconnectTimer = setTimeout(() => {
            this._reconnectTimer = null;
            this.prepare();
        }, delay);
    }

    /**
     * @param {{id?: unknown, side?: unknown, otherTabId?: unknown, otherFrameId?: unknown}} message
     */
    _connectDataPort({id, side, otherTabId, otherFrameId}) {
        if (typeof id !== 'string' || !/^[a-f0-9]{32}$/u.test(id) || (side !== 0 && side !== 1) ||
        typeof otherTabId !== 'number' || !Number.isSafeInteger(otherTabId) || otherTabId < 0 ||
        typeof otherFrameId !== 'number' || !Number.isSafeInteger(otherFrameId) || otherFrameId < 0) { return; }
        const key = JSON.stringify([otherTabId, otherFrameId]);
        /** @type {NativePort} */
        let port;
        try {
            port = this._runtime.connect({name: JSON.stringify({name: SAFARI_CROSS_FRAME_DATA_PORT, id, side})});
        } catch (error) {
            this._rejectPending(key, error);
            return;
        }
        this._ports.add(port);
        /** @type {ReturnType<typeof setTimeout>|null} */
        let timer = setTimeout(() => port.disconnect(), this._timeout);
        let connected = true;
        const onMessage = (/** @type {unknown} */ data) => {
            if (!connected) { return; }
            if (typeof data !== 'object' || data === null || Reflect.get(data, 'type') !== 'activate') { return; }
            if (timer !== null) {
                clearTimeout(timer);
                timer = null;
            }
            port.onMessage.removeListener(onMessage);
            try { this._onConnect(otherTabId, otherFrameId, port); } catch (error) {
                this._rejectPending(key, error);
                port.disconnect();
                return;
            }
            const pending = this._pending.get(key);
            if (pending) {
                this._pending.delete(key);
                clearTimeout(pending.timer);
                pending.resolve(port);
            }
        };
        port.onMessage.addListener(onMessage);
        port.onDisconnect.addListener(() => {
            connected = false;
            port.onMessage.removeListener(onMessage);
            void this._runtime.lastError;
            if (timer !== null) {
                clearTimeout(timer);
                timer = null;
            }
            this._ports.delete(port);
        });
        try {
            port.postMessage({type: 'ready'});
        } catch (error) {
            this._rejectPending(key, error);
            port.disconnect();
        }
    }
}
