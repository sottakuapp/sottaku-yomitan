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

import esbuild from 'esbuild';
import fs from 'fs';
import os from 'os';
import path from 'path';
import vm from 'vm';
import {afterEach, describe, expect, test} from 'vitest';
import {copyExtensionDirectory} from '../dev/extension-build-util.js';
import {ManifestUtil} from '../dev/manifest-util.js';
import {bundleSafariPopup, preserveSafariModuleUrls} from '../dev/safari-popup-build.js';

const sourceDirectory = path.resolve(import.meta.dirname, '../ext');
const popupEntry = '/js/display/popup-main.js';
const popupBundle = '/js/display/popup-main.bundle.js';
const popupHtml = `<html><body><!-- ${popupEntry} --><script data-keep="yes" src='${popupEntry}' type="module"></script></body></html>`;
/** @type {string[]} */
const temporaryDirectories = [];

afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
        fs.rmSync(directory, {recursive: true, force: true});
    }
});

/** @returns {string} */
function createDirectory() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sottaku-safari-popup-test-'));
    temporaryDirectories.push(directory);
    return directory;
}

/**
 * @param {string} directory
 * @param {string} entrySource
 */
function writeFixture(directory, entrySource) {
    fs.mkdirSync(path.join(directory, 'js/display'), {recursive: true});
    fs.writeFileSync(path.join(directory, 'popup.html'), popupHtml);
    fs.writeFileSync(path.join(directory, popupEntry), entrySource);
}

describe('Safari popup bundle', () => {
    test('rewrites only parsed module URL expressions, including template substitutions and bracket access', () => {
        const source = [
            '// import.meta.url is documentation',
            'const literal = "import.meta.url";',
            // eslint-disable-next-line no-template-curly-in-string
            'const template = `import.meta.url: ${import /* keep parser aware */ . meta . url}`;',
            'const bracket = import.meta["url"];',
            'const regexp = /import.meta.url/;',
        ].join('\n');
        const transformed = preserveSafariModuleUrls(source, '/js/application.js');
        expect(transformed).toBe([
            '// import.meta.url is documentation',
            'const literal = "import.meta.url";',
            // eslint-disable-next-line no-template-curly-in-string
            'const template = `import.meta.url: ${globalThis.chrome.runtime.getURL("/js/application.js")}`;',
            'const bracket = globalThis.chrome.runtime.getURL("/js/application.js");',
            'const regexp = /import.meta.url/;',
        ].join('\n'));
    });

    test.each(['const meta = import.meta;', 'import.meta.resolve("./worker.js");', 'import.meta[key];'])('rejects unsupported module metadata instead of changing its meaning: %s', (source) => {
        expect(() => preserveSafariModuleUrls(source, '/js/example.js')).toThrow('Unsupported import.meta use');
    });

    test('preserves each module URL and worker base across a copied output directory alias', async () => {
        const directory = createDirectory();
        const output = path.join(directory, 'output');
        const alias = path.join(directory, 'alias');
        writeFixture(output, 'import "../application.js"; import "./other.js";');
        fs.symlinkSync(output, alias, 'dir');
        fs.writeFileSync(path.join(output, 'js/application.js'), [
            'globalThis.urls = [import.meta.url,',
            'new URL("comm/shared-worker-bridge.js", import.meta.url).href,',
            'new URL("display/media-drawing-worker.js", import.meta.url).href];',
        ].join('\n'));
        fs.writeFileSync(path.join(output, 'js/display/other.js'), 'globalThis.urls.push(new URL("other-worker.js", import.meta["url"]).href);');
        const metafile = await bundleSafariPopup(alias);
        const bundle = fs.readFileSync(path.join(output, popupBundle), 'utf8');
        /** @type {{urls?: string[], URL: typeof URL, chrome: {runtime: {getURL: (file: string) => string}}}} */
        const context = {URL, chrome: {runtime: {getURL: (file) => `safari-web-extension://test${file}`}}};
        vm.runInNewContext(bundle, context);
        expect(context.urls).toEqual([
            'safari-web-extension://test/js/application.js',
            'safari-web-extension://test/js/comm/shared-worker-bridge.js',
            'safari-web-extension://test/js/display/media-drawing-worker.js',
            'safari-web-extension://test/js/display/other-worker.js',
        ]);
        expect(Object.values(metafile.outputs).flatMap(({imports}) => imports)).toEqual([]);
        expect(fs.readFileSync(path.join(output, 'popup.html'), 'utf8')).toBe(popupHtml.replace(`src='${popupEntry}'`, `src="${popupBundle}"`));
        expect(bundle).not.toContain(directory);
    });

    test.each([
        '<script src="/other.js" type="module"></script>',
        `<script src="${popupEntry}"></script>`,
        popupHtml + `<script src="${popupEntry}" type="module"></script>`,
    ])('rejects missing, changed, or duplicated popup entries before writing output', async (html) => {
        const directory = createDirectory();
        writeFixture(directory, 'globalThis.loaded = true;');
        fs.writeFileSync(path.join(directory, 'popup.html'), html);
        await expect(bundleSafariPopup(directory)).rejects.toThrow('Expected exactly one Safari popup module entry');
        expect(fs.readFileSync(path.join(directory, 'popup.html'), 'utf8')).toBe(html);
        expect(fs.existsSync(path.join(directory, popupBundle))).toBe(false);
    });

    test('rejects unresolved dynamic imports before replacing the popup entry', async () => {
        const directory = createDirectory();
        writeFixture(directory, 'void import(globalThis.moduleUrl);');
        await expect(bundleSafariPopup(directory)).rejects.toThrow('unresolved dynamic import');
        expect(fs.readFileSync(path.join(directory, 'popup.html'), 'utf8')).toBe(popupHtml);
        expect(fs.existsSync(path.join(directory, popupBundle))).toBe(false);
    });

    test('rejects an imported file that escapes the copied extension through a symlink', async () => {
        const directory = createDirectory();
        const output = path.join(directory, 'output');
        const external = path.join(directory, 'external.js');
        writeFixture(output, 'import "../external.js";');
        fs.writeFileSync(external, 'globalThis.external = true;');
        fs.symlinkSync(external, path.join(output, 'js/external.js'));
        await expect(bundleSafariPopup(output)).rejects.toThrow('Unexpected Safari popup module');
        expect(fs.readFileSync(path.join(output, 'popup.html'), 'utf8')).toBe(popupHtml);
        expect(fs.existsSync(path.join(output, popupBundle))).toBe(false);
    });

    test('real Safari output is deterministic, self-contained, and leaves source and worker files unchanged', async () => {
        const directory = createDirectory();
        const util = new ManifestUtil();
        const unchangedFiles = ['popup.html', 'action-popup.html', 'background.html', 'manifest.json', 'js/application.js', 'js/comm/shared-worker-bridge.js', 'js/display/media-drawing-worker.js'];
        const sourceBefore = unchangedFiles.map((file) => fs.readFileSync(path.join(sourceDirectory, file)));
        /** @type {string[]} */
        const bundles = [];
        for (const name of ['first', 'second']) {
            const output = path.join(directory, name);
            copyExtensionDirectory(sourceDirectory, output, util.getVariant('safari')?.excludeFiles || []);
            const metafile = await bundleSafariPopup(output);
            const bundle = fs.readFileSync(path.join(output, popupBundle), 'utf8');
            bundles.push(bundle);
            expect(Object.values(metafile.outputs).flatMap(({imports}) => imports)).toEqual([]);
            expect(Object.keys(metafile.inputs)).toContain('js/application.js');
            expect(bundle).toContain('globalThis.chrome.runtime.getURL("/js/application.js")');
            expect(bundle).not.toContain('sottakuSafariQa');
            expect(bundle).not.toContain('127.0.0.1:8104');
            await expect(esbuild.transform(bundle, {format: 'esm', target: 'safari16.4'})).resolves.toBeDefined();
            for (const [index, file] of unchangedFiles.entries()) {
                expect(fs.readFileSync(path.join(sourceDirectory, file))).toEqual(sourceBefore[index]);
                if (file !== 'popup.html') {
                    expect(fs.readFileSync(path.join(output, file))).toEqual(sourceBefore[index]);
                }
            }
        }
        expect(bundles[0]).toBe(bundles[1]);
    }, 30_000);
});
