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

import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {expect, test} from 'vitest';

const root = path.resolve(import.meta.dirname, '..');

/**
 * @param {string} directory
 * @returns {Record<string, string>}
 */
function inventory(directory) {
    /** @type {Record<string, string>} */
    const result = {};
    /** @param {string} relative */
    const visit = (relative) => {
        for (const entry of fs.readdirSync(path.join(directory, relative), {withFileTypes: true})) {
            const name = path.join(relative, entry.name);
            if (entry.isDirectory()) {
                visit(name);
            } else if (entry.isFile()) {
                result[name] = createHash('sha256').update(fs.readFileSync(path.join(directory, name))).digest('hex');
            }
        }
    };
    visit('');
    return result;
}

/** @returns {Record<string, string>} */
function sourceMapInventory() {
    return Object.fromEntries(Object.entries(inventory(path.join(root, 'ext/lib'))).filter(([name]) => name.endsWith('.map')));
}

test('production Safari resources and library source maps are identical from an external working directory', () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'sottaku-library-cwd-'));
    try {
        const outside = path.join(temporary, 'unrelated caller with spaces');
        fs.mkdirSync(outside);
        const first = path.join(temporary, 'from-extension');
        const second = path.join(temporary, 'from-outside');
        /**
         * @param {string} cwd
         * @param {string} output
         */
        const build = (cwd, output) => {
            execFileSync(process.execPath, [path.join(root, 'dev/bin/build-safari.js'), '--output', output], {
                cwd,
                env: {PATH: process.env.PATH},
                timeout: 60000,
                stdio: 'pipe',
            });
        };
        // Sequential production builds: buildLibs regenerates the shared ignored ext/lib.
        build(root, first);
        const expected = inventory(first);
        const expectedMaps = sourceMapInventory();
        const entries = fs.readdirSync(path.join(root, 'dev/lib')).filter((name) => name.endsWith('.js'));
        expect(entries.length).toBeGreaterThan(0);
        for (const entry of entries) {
            expect(expected[path.join('lib', entry)]).toMatch(/^[a-f0-9]{64}$/u);
            expect(expectedMaps[`${entry}.map`]).toMatch(/^[a-f0-9]{64}$/u);
        }
        expect(expected['manifest.json']).toBeDefined();
        expect(expected[path.join('js/display/popup-main.bundle.js')]).toBeDefined();
        expect(expected[path.join('js/app/content-script-wrapper.js')]).toBeDefined();

        build(outside, second);
        expect(inventory(second)).toEqual(expected);
        expect(sourceMapInventory()).toEqual(expectedMaps);
        const callerRelativeRoot = path.relative(outside, root).split(path.sep).join('/');
        for (const entry of entries) {
            const library = fs.readFileSync(path.join(second, 'lib', entry), 'utf8');
            expect(library).not.toContain(`${callerRelativeRoot}/`);
            expect(library).not.toContain(outside);
        }
    } finally {
        fs.rmSync(temporary, {recursive: true, force: true});
    }
}, 120000);
