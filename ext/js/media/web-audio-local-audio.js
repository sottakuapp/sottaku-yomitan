/*
 * Copyright (C) 2026  Yomitan Authors
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


/** @type {?AudioContext} */
let sharedAudioContext = null;

/**
 * @returns {AudioContext}
 */
function getSharedAudioContext() {
    if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
        sharedAudioContext = new AudioContext();
    }
    return sharedAudioContext;
}

export class WebAudioLocalAudio {
    /**
     * @param {string} base64Data
     * @param {string} contentType
     */
    constructor(base64Data, contentType) {
        /** @type {string} */
        this._base64Data = base64Data;
        /** @type {string} */
        this._contentType = contentType;
        /** @type {number} */
        this._volume = 1;
        /** @type {number} */
        this._currentTime = 0;
        /** @type {AudioContext} */
        this._audioContext = getSharedAudioContext();
        /** @type {?AudioBufferSourceNode} */
        this._bufferSource = null;
        /** @type {?GainNode} */
        this._gainNode = null;
        /** @type {?AudioBuffer} */
        this._decodedBuffer = null;
        /** @type {Map<EventListenerOrEventListenerObject, boolean>} */
        this._endedEventListeners = new Map();
    }

    /** @type {number} */
    get currentTime() { return this._currentTime; }

    set currentTime(value) { this._currentTime = value; }

    /** @type {number} */
    get volume() { return this._volume; }

    set volume(value) {
        this._volume = value;
        if (this._gainNode) { this._gainNode.gain.value = value; }
    }

    /** @type {number} */
    get duration() { return this._decodedBuffer ? this._decodedBuffer.duration : 0; }

    /**
     * @param {'ended'} type
     * @param {EventListenerOrEventListenerObject} listener
     * @param {boolean|AddEventListenerOptions} [options]
     */
    addEventListener(type, listener, options) {
        if (type !== 'ended' || this._endedEventListeners.has(listener)) { return; }
        const once = typeof options === 'object' && options !== null && options.once === true;
        this._endedEventListeners.set(listener, once);
    }

    /**
     * @param {'ended'} type
     * @param {EventListenerOrEventListenerObject} listener
     */
    removeEventListener(type, listener) {
        if (type !== 'ended') { return; }
        this._endedEventListeners.delete(listener);
    }

    /** */
    async prepare() {
        const byteCharacters = atob(this._base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);

        this._decodedBuffer = await this._audioContext.decodeAudioData(byteArray.buffer);
    }

    /**
     * @returns {Promise<void>}
     */
    async play() {
        if (!this._decodedBuffer || !this._audioContext) { return; }
        if (this._audioContext.state === 'suspended') {
            await this._audioContext.resume();
        }
        this.pause();

        const bufferSource = this._audioContext.createBufferSource();
        this._bufferSource = bufferSource;
        bufferSource.buffer = this._decodedBuffer;

        this._gainNode = this._audioContext.createGain();
        this._gainNode.gain.value = this._volume;

        bufferSource.connect(this._gainNode);
        this._gainNode.connect(this._audioContext.destination);
        bufferSource.onended = () => this._onEnded(bufferSource);
        bufferSource.start(0, this._currentTime);
    }

    /**
     * @returns {void}
     */
    pause() {
        if (this._bufferSource) {
            const bufferSource = this._bufferSource;
            this._bufferSource = null;
            bufferSource.onended = null;
            try { bufferSource.stop(); } catch (e) { /* NOP */ }
        }
    }

    /**
     * @param {AudioBufferSourceNode} bufferSource
     */
    _onEnded(bufferSource) {
        if (this._bufferSource !== bufferSource) { return; }
        this._bufferSource = null;
        this._gainNode = null;
        bufferSource.onended = null;

        const event = new Event('ended');
        for (const [listener, once] of this._endedEventListeners) {
            if (once) {
                this._endedEventListeners.delete(listener);
            }
            if (typeof listener === 'function') {
                listener(event);
            } else {
                listener.handleEvent(event);
            }
        }
    }
}
