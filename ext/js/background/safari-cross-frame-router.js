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

import {parseJson} from '../core/json.js';
import {isObjectNotArray} from '../core/object-utilities.js';
import {deferPromise} from '../core/utilities.js';
import {SAFARI_CROSS_FRAME_DATA_PORT, SAFARI_CROSS_FRAME_REGISTER_PORT} from '../comm/safari-cross-frame-client.js';

/** @typedef {{tabId: number, frameId: number, documentId: string|null, url: string, role: 'content'|'extension', port: chrome.runtime.Port}} Registration */
/** @typedef {{id: string, key: string, identities: chrome.runtime.MessageSender[], registrations: (Registration|null)[], ports: (chrome.runtime.Port|null)[], ready: boolean[], active: boolean, started: boolean, promise: Promise<void>, resolve: () => void, reject: (error: unknown) => void, timer: ReturnType<typeof setTimeout>}} Route */

export class SafariCrossFrameRouter {
    /**
     * @param {{runtime?: typeof chrome.runtime, timeout?: number}} [options]
     */
    constructor({runtime = chrome.runtime, timeout = 5000} = {}) {
        /** @type {typeof globalThis.chrome.runtime} */
        this._runtime = runtime;
        /** @type {number} */
        this._timeout = timeout;
        /** @type {Map<string, Registration>} */
        this._registrations = new Map();
        /** @type {Map<string, Route>} */
        this._routes = new Map();
        /** @type {Map<string, Route>} */
        this._routesById = new Map();
        /** @type {(port: chrome.runtime.Port) => void} */
        this._onConnectBound = this._onConnect.bind(this);
        /** @type {boolean} */
        this._prepared = false;
    }

    /** */
    prepare() {
        if (this._prepared) { return; }
        this._prepared = true;
        this._runtime.onConnect.addListener(this._onConnectBound);
    }

    /** */
    dispose() {
        this._runtime.onConnect.removeListener(this._onConnectBound);
        this._prepared = false;
        for (const route of this._routes.values()) { this._closeRoute(route, new Error('Safari frame router disposed')); }
        for (const registration of this._registrations.values()) { registration.port.disconnect(); }
        this._registrations.clear();
    }

    /**
     * @param {chrome.runtime.MessageSender} sender
     * @param {number} targetTabId
     * @param {number} targetFrameId
     * @returns {Promise<{targetTabId: number, targetFrameId: number}>}
     */
    async open(sender, targetTabId, targetFrameId) {
        if (!this._validSender(sender) || !this._validId(targetTabId) || !this._validId(targetFrameId)) {
            throw new Error('Invalid Safari cross-frame identity');
        }
        const sourceKey = this._senderKey(sender);
        const targetKey = this._key(targetTabId, targetFrameId);
        const key = JSON.stringify([sourceKey, targetKey].sort());
        let route = this._routes.get(key);
        if (route) {
            const index = route.identities.findIndex((identity) => this._senderKey(identity) === sourceKey);
            if (index < 0 || !this._sameDocument(route.identities[index], sender)) {
                throw new Error('Stale Safari cross-frame document');
            }
            if (!route.started) { route.identities[index] = sender; }
        } else {
            const bytes = crypto.getRandomValues(new Uint8Array(16));
            const id = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
            const {promise, resolve, reject} = /** @type {import('core').DeferredPromiseDetails<void>} */ (deferPromise());
            const target = {tab: {id: targetTabId}, frameId: targetFrameId};
            route = {
                id,
                key,
                identities: [sender, /** @type {chrome.runtime.MessageSender} */ (target)],
                registrations: [null, null],
                ports: [null, null],
                ready: [false, false],
                active: false,
                started: false,
                promise,
                resolve,
                reject,
                timer: setTimeout(() => { if (route) { this._closeRoute(route, new Error('Safari frame connection timed out')); } }, this._timeout),
            };
            this._routes.set(key, route);
            this._routesById.set(id, route);
        }
        this._startRoute(route);
        await route.promise;
        return {targetTabId, targetFrameId};
    }

    /**
     * @param {unknown} value
     * @returns {value is number}
     */
    _validId(value) { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }

    /**
     * @param {chrome.runtime.MessageSender|undefined} sender
     * @returns {sender is chrome.runtime.MessageSender}
     */
    _validSender(sender) {
        return Boolean(sender && sender.id === this._runtime.id && this._validId(sender.tab?.id) && this._validId(sender.frameId));
    }

    /**
     * @param {number} tabId
     * @param {number} frameId
     * @returns {string}
     */
    _key(tabId, frameId) { return JSON.stringify([tabId, frameId]); }

    /**
     * @param {chrome.runtime.MessageSender} sender
     * @returns {string}
     */
    _senderKey(sender) { return this._key(/** @type {number} */ (sender.tab?.id), /** @type {number} */ (sender.frameId)); }

    /**
     * @param {chrome.runtime.MessageSender} first
     * @param {chrome.runtime.MessageSender} second
     * @returns {boolean}
     */
    _sameDocument(first, second) {
        if (first.documentId) { return first.documentId === second.documentId; }
        // Without a native document ID, only fragment changes are unambiguous.
        return !first.url || first.url.split('#', 1)[0] === second.url?.split('#', 1)[0];
    }

    /**
     * @param {string|undefined} url
     * @returns {boolean}
     */
    _isExtensionUrl(url) {
        try {
            const own = new URL(this._runtime.getURL('/'));
            const candidate = new URL(url || '');
            return own.protocol === candidate.protocol && own.host === candidate.host;
        } catch (error) { return false; }
    }

    /**
     * @param {chrome.runtime.Port} port
     */
    _onConnect(port) {
        /** @type {unknown} */
        let details;
        try {
            details = parseJson(port.name);
        } catch (error) {
            return;
        }
        if (!isObjectNotArray(details) || (details.name !== SAFARI_CROSS_FRAME_REGISTER_PORT && details.name !== SAFARI_CROSS_FRAME_DATA_PORT)) { return; }
        const sender = port.sender;
        if (!this._validSender(sender)) {
            port.disconnect();
            return;
        }
        if (details.name === SAFARI_CROSS_FRAME_REGISTER_PORT) {
            this._register(port, sender, details.role);
        } else {
            this._connectData(port, sender, details.id, details.side);
        }
    }

    /**
     * @param {chrome.runtime.Port} port
     * @param {chrome.runtime.MessageSender} sender
     * @param {unknown} role
     */
    _register(port, sender, role) {
        if ((role !== 'content' && role !== 'extension') || (role === 'extension' && !this._isExtensionUrl(sender.url))) {
            port.disconnect();
            return;
        }
        const key = this._senderKey(sender);
        const old = this._registrations.get(key);
        // A popup Main endpoint outranks its former content-script world. Opaque
        // document IDs cannot order live documents, so wait for pagehide/disconnect
        // before accepting a different document in the same role.
        if (old && ((old.role === 'extension' && role === 'content') ||
        (old.role === role && old.documentId && sender.documentId && old.documentId !== sender.documentId))) {
            port.disconnect();
            return;
        }
        /** @type {Registration} */
        const registration = {tabId: /** @type {number} */ (sender.tab?.id), frameId: /** @type {number} */ (sender.frameId), documentId: sender.documentId || null, url: sender.url || '', role, port};
        this._registrations.set(key, registration);
        if (old) {
            for (const route of this._routes.values()) {
                if (route.registrations.includes(old)) { this._closeRoute(route, new Error('Safari frame registration replaced')); }
            }
            old.port.disconnect();
        }
        port.onDisconnect.addListener(() => {
            void this._runtime.lastError;
            if (this._registrations.get(key) !== registration) { return; }
            this._registrations.delete(key);
            for (const route of this._routes.values()) {
                if (route.registrations.includes(registration)) { this._closeRoute(route, new Error('Safari frame registration disconnected')); }
            }
        });
        try {
            port.postMessage({type: 'registered'});
        } catch (error) {
            if (this._registrations.get(key) === registration) { this._registrations.delete(key); }
            port.disconnect();
            return;
        }
        for (const route of this._routes.values()) { this._startRoute(route); }
    }

    /**
     * @param {Route} route
     */
    _startRoute(route) {
        if (route.started || !this._routes.has(route.key)) { return; }
        const registrations = route.identities.map((sender) => this._registrations.get(this._senderKey(sender)));
        if (!registrations.every(Boolean)) { return; }
        for (let side = 0; side < 2; side++) {
            const registration = /** @type {Registration} */ (registrations[side]);
            const sender = route.identities[side];
            if (!this._sameDocument(sender, {url: registration.url, documentId: registration.documentId || void 0})) {
                this._closeRoute(route, new Error('Stale Safari cross-frame document'));
                return;
            }
            route.registrations[side] = registration;
            route.identities[side] = {...sender, url: registration.url, documentId: registration.documentId || void 0};
        }
        route.started = true;
        try {
            for (let side = 0; side < 2; side++) {
                const registration = /** @type {Registration} */ (route.registrations[side]);
                const other = /** @type {Registration} */ (route.registrations[1 - side]);
                registration.port.postMessage({type: 'connect', id: route.id, side, otherTabId: other.tabId, otherFrameId: other.frameId});
            }
        } catch (error) { this._closeRoute(route, error); }
    }

    /**
     * @param {chrome.runtime.Port} port
     * @param {chrome.runtime.MessageSender} sender
     * @param {unknown} id
     * @param {unknown} side
     */
    _connectData(port, sender, id, side) {
        const route = typeof id === 'string' ? this._routesById.get(id) : void 0;
        if (!route || (side !== 0 && side !== 1)) {
            port.disconnect();
            return;
        }
        const registration = route.registrations[side];
        if (!registration || route.ports[side] || this._registrations.get(this._senderKey(sender)) !== registration ||
        this._senderKey(sender) !== this._key(registration.tabId, registration.frameId) || !this._sameDocument(route.identities[side], sender)) {
            port.disconnect();
            return;
        }
        route.ports[side] = port;
        port.onDisconnect.addListener(() => {
            void this._runtime.lastError;
            this._closeRoute(route, new Error('Safari frame port disconnected'));
        });
        port.onMessage.addListener((message) => {
            if (this._routesById.get(route.id) !== route) { return; }
            if (!route.active) {
                if (message?.type !== 'ready') { return; }
                route.ready[side] = true;
                if (route.ready.every(Boolean)) {
                    route.active = true;
                    clearTimeout(route.timer);
                    try {
                        for (const endpoint of route.ports) { endpoint?.postMessage({type: 'activate'}); }
                        route.resolve();
                    } catch (error) { this._closeRoute(route, error); }
                }
                return;
            }
            try {
                route.ports[1 - side]?.postMessage(message);
            } catch (error) {
                this._closeRoute(route, error);
            }
        });
    }

    /**
     * @param {Route} route
     * @param {unknown} error
     */
    _closeRoute(route, error) {
        if (this._routesById.get(route.id) !== route) { return; }
        this._routesById.delete(route.id);
        if (this._routes.get(route.key) === route) { this._routes.delete(route.key); }
        clearTimeout(route.timer);
        route.reject(error);
        for (const port of route.ports) { port?.disconnect(); }
    }
}
