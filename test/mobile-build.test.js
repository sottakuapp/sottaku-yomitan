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

import childProcess from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';
import {afterEach, describe, expect, test, vi} from 'vitest';
import {createZip} from '../dev/bin/build.js';
import {copyExtensionDirectory, isExtensionMetadataPath} from '../dev/extension-build-util.js';
import {ManifestUtil} from '../dev/manifest-util.js';

const util = new ManifestUtil();
const sourceDirectory = path.resolve(import.meta.dirname, '../ext');
/** @type {string[]} */
const temporaryDirectories = [];

afterEach(() => {
    vi.restoreAllMocks();
    for (const directory of temporaryDirectories.splice(0)) {
        fs.rmSync(directory, {recursive: true, force: true});
    }
});

describe('mobile extension packaging', () => {
    test.each(['safari', 'firefox-android'])('%s has a packaged background and MV3 security policy', (name) => {
        const variant = util.getVariant(name);
        const manifest = util.getManifest(name);
        expect(variant?.fileName).toBeTruthy();
        expect(manifest.manifest_version).toBe(3);
        expect(manifest.background.page).toBe('background.html');
        expect(manifest.background.service_worker).toBeUndefined();
        expect(fs.existsSync(path.join(sourceDirectory, 'background.html'))).toBe(true);
        expect(variant?.excludeFiles).toContain('sw.js');
        expect(variant?.excludeFiles).not.toContain('background.html');
        expect(manifest.permissions).not.toContain('offscreen');
        expect(typeof manifest.content_security_policy).toBe('object');
        expect(manifest.content_security_policy.sandbox).toBeUndefined();
        expect(typeof manifest.content_security_policy.extension_pages).toBe('string');
        expect(manifest.content_security_policy.extension_pages).not.toContain("'unsafe-eval'");
        expect(manifest.optional_host_permissions).toEqual(['<all_urls>']);
        expect(manifest.host_permissions).not.toContain('<all_urls>');
    });

    test('Safari has no unsupported native or desktop menu permissions', () => {
        const manifest = util.getManifest('safari');
        expect(manifest.permissions).not.toContain('contextMenus');
        expect(manifest.optional_permissions).toBeUndefined();
        expect(manifest.background.persistent).toBe(false);
        expect(manifest.browser_specific_settings).toBeUndefined();
        expect(manifest.omnibox).toBeUndefined();
    });

    test('unpacked builds exclude unsupported files and remove stale resources', () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sottaku-extension-build-'));
        temporaryDirectories.push(directory);
        const source = path.join(directory, 'source');
        const output = path.join(directory, 'output');
        fs.mkdirSync(path.join(source, 'js'), {recursive: true});
        fs.mkdirSync(output);
        fs.writeFileSync(path.join(source, 'background.html'), 'background');
        fs.writeFileSync(path.join(source, 'js/offscreen.js'), 'unsupported');
        fs.writeFileSync(path.join(output, 'obsolete.js'), 'stale');
        copyExtensionDirectory(source, output, ['js/offscreen.js']);
        expect(fs.readFileSync(path.join(output, 'background.html'), 'utf8')).toBe('background');
        expect(fs.existsSync(path.join(output, 'js/offscreen.js'))).toBe(false);
        expect(fs.existsSync(path.join(output, 'obsolete.js'))).toBe(false);
        expect(() => copyExtensionDirectory(source, source, [])).toThrow('outside the source');
        expect(() => copyExtensionDirectory(source, directory, [])).toThrow('outside the source');
        expect(fs.existsSync(path.join(source, 'background.html'))).toBe(true);
    });

    test.each(['.DS_Store', 'js/.DS_Store', '._manifest.json', 'js/._content.js', '__MACOSX/js/content.js', 'js/__MACOSX/content.js', 'js\\nested\\._content.js'])('recognizes metadata at any depth: %s', (fileName) => {
        expect(isExtensionMetadataPath(fileName)).toBe(true);
    });

    test.each([
        {name: 'JSZip', executables: []},
        ...(process.env.SOTTAKU_TEST_7ZIP ? [{name: '7-Zip', executables: [process.env.SOTTAKU_TEST_7ZIP]}] : []),
    ])('$name and directory builds preserve runtime files while removing nested Finder metadata', async ({executables}) => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sottaku-extension-metadata-'));
        temporaryDirectories.push(directory);
        const source = path.join(directory, 'source');
        const output = path.join(directory, 'output');
        const zipPath = path.join(directory, 'extension.zip');
        const runtimeFiles = ['manifest.json', 'background.html', 'js/content.js', 'js/.runtime-config', 'images/DS_Store.png', 'js/__MACOSX-helper.js'];
        const metadataFiles = ['.DS_Store', 'js/.DS_Store', '._manifest.json', 'js/nested/._content.js', '__MACOSX/js/content.js', 'js/__MACOSX/content.js'];
        for (const fileName of [...runtimeFiles, ...metadataFiles, 'js/offscreen.js']) {
            const file = path.join(source, fileName);
            fs.mkdirSync(path.dirname(file), {recursive: true});
            fs.writeFileSync(file, `contents:${fileName}`);
        }
        copyExtensionDirectory(source, output, ['js/offscreen.js']);
        // Exercise only this fixture, selecting JSZip or an optional real 7-Zip executable.
        const archiveTool = vi.spyOn(childProcess, 'execFileSync');
        await createZip(source, ['js/offscreen.js'], zipPath, executables, null, false);
        if (executables.length > 0) {
            expect(archiveTool).toHaveBeenCalledOnce();
            expect(archiveTool.mock.results[0].type).toBe('return');
        }
        const archive = await JSZip.loadAsync(fs.readFileSync(zipPath));
        expect(Object.keys(archive.files).filter((fileName) => !archive.files[fileName].dir).sort()).toEqual([...runtimeFiles].sort());
        for (const fileName of runtimeFiles) {
            expect(fs.readFileSync(path.join(output, fileName), 'utf8')).toBe(`contents:${fileName}`);
            expect(await archive.file(fileName)?.async('string')).toBe(`contents:${fileName}`);
        }
        for (const fileName of [...metadataFiles, 'js/offscreen.js']) {
            expect(fs.existsSync(path.join(output, fileName))).toBe(false);
            expect(archive.file(fileName)).toBeNull();
            expect(fs.existsSync(path.join(source, fileName))).toBe(true);
        }
    });
});
