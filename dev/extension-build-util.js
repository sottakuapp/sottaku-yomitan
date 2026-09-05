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
import path from 'path';

// 7-Zip's recursive exclusions and the in-process builders share these patterns.
export const EXTENSION_METADATA_PATTERNS = Object.freeze(['.DS_Store', '._*', '__MACOSX']);

/**
 * @param {string} relativePath
 * @returns {boolean}
 */
export function isExtensionMetadataPath(relativePath) {
    return relativePath.split(/[\\/]/).some((part) => EXTENSION_METADATA_PATTERNS.some((pattern) => (
        pattern.endsWith('*') ? part.startsWith(pattern.slice(0, -1)) : part === pattern
    )));
}

/**
 * Rebuild an unpacked extension from source with the same exclusions as ZIP builds.
 * @param {string} sourceDirectory
 * @param {string} outputDirectory
 * @param {string[]} excludeFiles
 * @throws {Error}
 */
export function copyExtensionDirectory(sourceDirectory, outputDirectory, excludeFiles) {
    const source = path.resolve(sourceDirectory);
    const output = path.resolve(outputDirectory);
    if (output === path.parse(output).root || source === output || source.startsWith(`${output}${path.sep}`) || output.startsWith(`${source}${path.sep}`)) {
        throw new Error('Extension output must be outside the source directory');
    }
    fs.rmSync(output, {recursive: true, force: true});
    const excludedPaths = new Set(excludeFiles.map((file) => path.resolve(source, file)));
    fs.cpSync(source, output, {
        recursive: true,
        filter: (file) => !excludedPaths.has(path.resolve(file)) && !isExtensionMetadataPath(path.relative(source, file)),
    });
}
