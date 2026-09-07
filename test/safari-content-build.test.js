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

import fs from 'fs';
import os from 'os';
import path from 'path';
import vm from 'vm';
import {afterEach, describe, expect, test} from 'vitest';
import {copyExtensionDirectory} from '../dev/extension-build-util.js';
import {ManifestUtil} from '../dev/manifest-util.js';
import {bundleSafariContent} from '../dev/safari-content-build.js';

const sourceDirectory = path.resolve(import.meta.dirname, '../ext');
const contentEntry = 'js/app/content-script-main.js';
const contentWrapper = 'js/app/content-script-wrapper.js';
const originalWrapper = 'original content wrapper';
/** @type {string[]} */
const temporaryDirectories = [];

afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
        fs.rmSync(directory, {recursive: true, force: true});
    }
});

/** @returns {string} */
function createDirectory() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sottaku-safari-content-test-'));
    temporaryDirectories.push(directory);
    return directory;
}

/**
 * @param {string} directory
 * @param {string} source
 */
function writeFixture(directory, source) {
    fs.mkdirSync(path.join(directory, 'js/app'), {recursive: true});
    fs.writeFileSync(path.join(directory, contentEntry), source);
    fs.writeFileSync(path.join(directory, contentWrapper), originalWrapper);
}

/**
 * @param {string} directory
 * @returns {string}
 */
function readBundle(directory) {
    return fs.readFileSync(path.join(directory, contentWrapper), 'utf8');
}

describe('Safari classic content bundle', () => {
    test('guards dependencies and entry initialization while startup is pending and after it completes', async () => {
        const directory = createDirectory();
        writeFixture(directory, 'import "../dependency.js"; ++globalThis.starts; await globalThis.ready; ++globalThis.finishes;');
        fs.writeFileSync(path.join(directory, 'js/dependency.js'), '++globalThis.dependencies; globalThis.strictThis = (function() { return this; })();');
        await bundleSafariContent(directory);
        const bundle = readBundle(directory);
        /** @type {() => void} */
        let finish = () => {};
        const ready = new Promise((resolve) => { finish = () => resolve(void 0); });
        const context = vm.createContext({ready, starts: 0, finishes: 0, dependencies: 0, strictThis: 'unset'});
        /** @type {unknown} */
        const first = vm.runInContext(bundle, context);
        /** @type {unknown} */
        const pending = vm.runInContext(bundle, context);
        expect(pending).toBe(first);
        expect(context.starts).toBe(1);
        expect(context.finishes).toBe(0);
        expect(context.dependencies).toBe(1);
        expect(context.strictThis).toBeUndefined();
        finish();
        await expect(first).resolves.toBeUndefined();
        expect(vm.runInContext(bundle, context)).toBe(first);
        expect(context.starts).toBe(1);
        expect(context.finishes).toBe(1);
        expect(context.dependencies).toBe(1);
        expect(Object.hasOwn(context, '__sottakuSafariContent')).toBe(false);

        const otherFrame = vm.createContext({ready: Promise.resolve(), starts: 0, finishes: 0, dependencies: 0});
        await vm.runInContext(bundle, otherFrame);
        expect(otherFrame.starts).toBe(1);
        expect(otherFrame.finishes).toBe(1);
    });

    test.each(['dependency', 'entry'])('caches a %s failure without repeating side effects on reinjection', async (location) => {
        const directory = createDirectory();
        writeFixture(directory, 'import "../dependency.js"; ++globalThis.starts; await globalThis.fail();');
        fs.writeFileSync(path.join(directory, 'js/dependency.js'), `++globalThis.dependencies; ${location === 'dependency' ? 'throw globalThis.failure;' : ''}`);
        await bundleSafariContent(directory);
        const bundle = readBundle(directory);
        const failure = new Error('startup failed');
        const context = vm.createContext({failure, fail: () => Promise.reject(failure), starts: 0, dependencies: 0});
        /** @type {unknown} */
        const first = vm.runInContext(bundle, context);
        await expect(first).rejects.toBe(failure);
        expect(vm.runInContext(bundle, context)).toBe(first);
        expect(context.dependencies).toBe(1);
        expect(context.starts).toBe(location === 'dependency' ? 0 : 1);
    });

    test('preserves original module URLs and bundles a literal lazy import across an output directory alias', async () => {
        const directory = createDirectory();
        const output = path.join(directory, 'output');
        const alias = path.join(directory, 'alias');
        writeFixture(output, 'import "../application.js"; globalThis.load = () => import("./lazy.js");');
        fs.symlinkSync(output, alias, 'dir');
        fs.writeFileSync(path.join(output, 'js/application.js'), [
            'globalThis.urls = [import.meta.url,',
            'new URL("comm/shared-worker-bridge.js", import.meta.url).href,',
            'new URL("display/media-drawing-worker.js", import.meta["url"]).href];',
        ].join('\n'));
        fs.writeFileSync(path.join(output, 'js/app/lazy.js'), '++globalThis.lazyStarts; globalThis.urls.push(import.meta.url); export const loaded = true;');
        const metafile = await bundleSafariContent(alias);
        const bundle = readBundle(output);
        const context = vm.createContext({URL, lazyStarts: 0, chrome: {runtime: {getURL: (/** @type {string} */ file) => `safari-web-extension://test${file}`}}});
        await vm.runInContext(bundle, context);
        expect(context.urls).toEqual([
            'safari-web-extension://test/js/application.js',
            'safari-web-extension://test/js/comm/shared-worker-bridge.js',
            'safari-web-extension://test/js/display/media-drawing-worker.js',
        ]);
        expect(context.lazyStarts).toBe(0);
        await expect(context.load()).resolves.toHaveProperty('loaded', true);
        await context.load();
        expect(context.lazyStarts).toBe(1);
        expect(context.urls.at(-1)).toBe('safari-web-extension://test/js/app/lazy.js');
        expect(Object.values(metafile.outputs).flatMap(({imports}) => imports)).toEqual([]);
        expect(bundle).not.toContain(directory);
    });

    test.each([
        ['void import(globalThis.moduleUrl);', 'without unresolved imports'],
        ['export const value = 1;', 'must not export values'],
        ['export default 1;', 'must not export values'],
        ['const meta = import.meta;', 'Unsupported import.meta use'],
    ])('rejects unsafe entry syntax before replacing the wrapper: %s', async (source, error) => {
        const directory = createDirectory();
        writeFixture(directory, source);
        await expect(bundleSafariContent(directory)).rejects.toThrow(error);
        expect(readBundle(directory)).toBe(originalWrapper);
        expect(fs.readFileSync(path.join(directory, contentEntry), 'utf8')).toBe(source);
    });

    test('rejects top-level await in a dependency rather than silently changing module evaluation order', async () => {
        const directory = createDirectory();
        writeFixture(directory, 'import "../dependency.js";');
        fs.writeFileSync(path.join(directory, 'js/dependency.js'), 'await globalThis.ready;');
        await expect(bundleSafariContent(directory)).rejects.toThrow('Top-level await');
        expect(readBundle(directory)).toBe(originalWrapper);
    });

    test('rejects imported files that escape the copied extension through a symlink', async () => {
        const directory = createDirectory();
        const output = path.join(directory, 'output');
        const external = path.join(directory, 'external.js');
        writeFixture(output, 'import "../external.js";');
        fs.writeFileSync(external, 'globalThis.external = true;');
        fs.symlinkSync(external, path.join(output, 'js/external.js'));
        await expect(bundleSafariContent(output)).rejects.toThrow('Unexpected Safari content module');
        expect(readBundle(output)).toBe(originalWrapper);
    });

    test('real Safari output is deterministic and changes only the copied registered wrapper', async () => {
        const directory = createDirectory();
        const util = new ManifestUtil();
        const files = [contentWrapper, contentEntry, 'popup.html', 'action-popup.html', 'background.html', 'manifest.json', 'js/application.js', 'js/comm/shared-worker-bridge.js', 'js/display/media-drawing-worker.js'];
        const sourceBefore = files.map((file) => fs.readFileSync(path.join(sourceDirectory, file)));
        /** @type {string[]} */
        const bundles = [];
        for (const name of ['first', 'second']) {
            const output = path.join(directory, name);
            copyExtensionDirectory(sourceDirectory, output, util.getVariant('safari')?.excludeFiles || []);
            const metafile = await bundleSafariContent(output);
            const bundle = readBundle(output);
            bundles.push(bundle);
            // A Script rejects import/export syntax and top-level await.
            expect(() => new vm.Script(bundle)).not.toThrow();
            expect(Object.values(metafile.outputs).flatMap(({imports}) => imports)).toEqual([]);
            expect(Object.keys(metafile.inputs)).toContain('js/application.js');
            expect(bundle).toContain('globalThis.chrome.runtime.getURL("/js/application.js")');
            expect(bundle).not.toContain('sottakuSafariQa');
            expect(bundle).not.toContain('127.0.0.1:8104');
            for (const [index, file] of files.entries()) {
                expect(fs.readFileSync(path.join(sourceDirectory, file))).toEqual(sourceBefore[index]);
                if (file !== contentWrapper) {
                    expect(fs.readFileSync(path.join(output, file))).toEqual(sourceBefore[index]);
                }
            }
        }
        expect(bundles[0]).toBe(bundles[1]);
    }, 30_000);
});
