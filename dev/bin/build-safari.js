/*
 * Copyright (C) 2023-2026  Yomitan Authors
 * Copyright (C) 2021-2022  Yomichan Authors
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
import {fileURLToPath} from 'node:url';
import path from 'path';
import {parseArgs} from 'util';
import {buildLibs} from '../build-libs.js';
import {copyExtensionDirectory} from '../extension-build-util.js';
import {parseJson} from '../json.js';
import {ManifestUtil} from '../manifest-util.js';

// Xcode invokes this entry point directly. It never rewrites the desktop manifest.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = path.join(root, 'ext');
const {values: args} = parseArgs({options: {output: {type: 'string'}, version: {type: 'string'}}});
const output = args.output || path.join(root, 'builds/sottaku-yomitan-safari');
const {version: sourceVersion} = /** @type {{version?: unknown}} */ (parseJson(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8')));
const version = args.version || sourceVersion;
if (typeof version !== 'string' || !/^\d+(?:\.\d+){0,3}$/u.test(version)) {
    throw new Error('Provide a numeric extension version with one to four components');
}
const util = new ManifestUtil();
const variant = util.getVariant('safari');
if (!variant) { throw new Error('Safari manifest variant is missing'); }
await buildLibs();
copyExtensionDirectory(source, output, variant.excludeFiles || []);
const manifest = util.getManifest('safari');
manifest.version = version;
fs.writeFileSync(path.join(output, 'manifest.json'), ManifestUtil.createManifestString(manifest));
process.stdout.write(`Built Safari extension ${version} at ${output}\n`);
