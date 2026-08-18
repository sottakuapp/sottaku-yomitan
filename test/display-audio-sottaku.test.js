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

import {afterAll, describe, expect, test, vi} from 'vitest';
import {DisplayAudio} from '../ext/js/display/display-audio.js';
import {WebAudioLocalAudio} from '../ext/js/media/web-audio-local-audio.js';
import {setupDomTest} from './fixtures/dom-test.js';

const {window, teardown} = await setupDomTest();

class FakeAudioBufferSourceNode {
    constructor() {
        /** @type {?AudioBuffer} */
        this.buffer = null;
        /** @type {((event: Event) => void)|null} */
        this.onended = null;
        /** @type {boolean} */
        this.started = false;
    }

    /** */
    connect() {}

    /** */
    start() {
        this.started = true;
    }

    /** */
    stop() {
        this.onended?.(new Event('ended'));
    }

    /** */
    finish() {
        this.onended?.(new Event('ended'));
    }
}

class FakeAudioContext {
    constructor() {
        /** @type {AudioContextState} */
        this.state = 'running';
        /** @type {object} */
        this.destination = {};
        /** @type {FakeAudioBufferSourceNode[]} */
        this.sources = [];
    }

    /**
     * @returns {Promise<AudioBuffer>}
     */
    async decodeAudioData() {
        return /** @type {AudioBuffer} */ (/** @type {unknown} */ ({duration: 1}));
    }

    /**
     * @returns {FakeAudioBufferSourceNode}
     */
    createBufferSource() {
        const source = new FakeAudioBufferSourceNode();
        this.sources.push(source);
        return source;
    }

    /**
     * @returns {{gain: {value: number}, connect: () => void}}
     */
    createGain() {
        return {
            gain: {value: 1},
            connect: () => {},
        };
    }

    /** */
    async resume() {
        this.state = 'running';
    }
}

vi.stubGlobal('AudioContext', FakeAudioContext);

describe('Sottaku audio sequences', () => {
    afterAll(async () => {
        vi.unstubAllGlobals();
        await teardown(global);
    });

    test('waits for HTML and local Web Audio playback before advancing', async () => {
        const popupMenus = window.document.createElement('div');
        popupMenus.id = 'popup-menus';
        window.document.body.appendChild(popupMenus);

        const htmlAudio = window.document.createElement('audio');
        const playHtmlAudio = vi.fn(async () => {});
        htmlAudio.play = playHtmlAudio;
        htmlAudio.pause = vi.fn();

        const localAudio = new WebAudioLocalAudio('AA==', 'audio/mpeg');
        await localAudio.prepare();
        const localAudioContext = /** @type {FakeAudioContext} */ (/** @type {unknown} */ (Reflect.get(localAudio, '_audioContext')));

        const display = /** @type {import('../ext/js/display/display.js').Display} */ (/** @type {unknown} */ ({application: {api: null}}));
        const displayAudio = new DisplayAudio(display);
        const createAudio = vi.fn(async (url) => (url === 'html' ? htmlAudio : localAudio));
        Reflect.set(displayAudio, '_audioSystem', {createAudio});

        const sequencePromise = Reflect.get(displayAudio, '_playSottakuAudioSequence').call(
            displayAudio,
            ['html', 'local'],
        );

        await vi.waitFor(() => expect(createAudio).toHaveBeenCalledTimes(1));
        expect(playHtmlAudio).toHaveBeenCalledTimes(1);

        htmlAudio.dispatchEvent(new window.Event('ended'));

        await vi.waitFor(() => expect(createAudio).toHaveBeenCalledTimes(2));
        expect(localAudioContext.sources).toHaveLength(1);
        expect(localAudioContext.sources[0].started).toBe(true);

        localAudioContext.sources[0].finish();

        await expect(sequencePromise).resolves.toBe(true);
        expect(Reflect.get(displayAudio, '_audioPlaying')).toBeNull();
    });

    test('does not report a natural end when local playback is paused', async () => {
        const localAudio = new WebAudioLocalAudio('AA==', 'audio/mpeg');
        await localAudio.prepare();
        const onEnded = vi.fn();
        localAudio.addEventListener('ended', onEnded, {once: true});

        await localAudio.play();
        localAudio.pause();

        expect(onEnded).not.toHaveBeenCalled();
    });
});
