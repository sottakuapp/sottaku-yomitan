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
import path from 'path';
import * as ts from 'typescript';
import {preserveSafariModuleUrls} from './safari-popup-build.js';

const contentEntry = 'js/app/content-script-main.js';
const contentWrapper = 'js/app/content-script-wrapper.js';

/**
 * Keep imports at module scope, but expose the entry's asynchronous completion
 * without top-level await so esbuild can produce a classic content script.
 * @param {string} source
 * @returns {string}
 * @throws {Error}
 */
function exposeContentStartup(source) {
    const file = ts.createSourceFile(contentEntry, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    /** @type {string[]} */
    const imports = [];
    /** @type {string[]} */
    const body = [];
    for (const node of file.statements) {
        if (ts.isExportDeclaration(node) || ts.isExportAssignment(node) ||
        (ts.canHaveModifiers(node) && ts.getModifiers(node)?.some(({kind}) => kind === ts.SyntaxKind.ExportKeyword))) {
            throw new Error('Safari content entry must not export values');
        }
        (ts.isImportDeclaration(node) ? imports : body).push(node.getFullText(file));
    }
    return `${imports.join('\n')}\nexport const __sottakuSafariStartup = (async () => {\n${body.join('\n')}\n})();\n`;
}

/**
 * Replace the module loader's single evaluation with a guard around the whole
 * bundle, including dependency side effects. Repeated injection reuses pending,
 * fulfilled, or rejected completion instead of adding duplicate listeners.
 * @param {string} bundle
 * @returns {string}
 */
function wrapContentStartup(bundle) {
    return `// Generated Safari content script.\n(() => {
    'use strict';
    const key = Symbol.for('sottaku-yomitan:safari-content-startup');
    if (Object.prototype.hasOwnProperty.call(globalThis, key)) { return globalThis[key]; }
    let resolveStartup;
    let rejectStartup;
    const completion = new Promise((resolve, reject) => { resolveStartup = resolve; rejectStartup = reject; });
    Object.defineProperty(globalThis, key, {value: completion});
    try {
${bundle}
        Promise.resolve(__sottakuSafariContent.__sottakuSafariStartup).then(resolveStartup, rejectStartup);
    } catch (error) {
        rejectStartup(error);
    }
    return completion;
})();\n`;
}

/**
 * @param {string} source
 * @throws {Error}
 */
function assertClassicScript(source) {
    const file = ts.createSourceFile(contentWrapper, source, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
    /**
     * @param {import('typescript').Node} node
     * @param {number} functionDepth
     * @throws {Error}
     */
    function visit(node, functionDepth) {
        if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isExportAssignment(node) ||
        (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) ||
        (ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword) ||
        (functionDepth === 0 && (ts.isAwaitExpression(node) || (ts.isForOfStatement(node) && node.awaitModifier)))) {
            throw new Error('Safari content bundle must be a classic script without unresolved imports');
        }
        ts.forEachChild(node, (child) => visit(child, functionDepth + (ts.isFunctionLike(node) ? 1 : 0)));
    }
    visit(file, 0);
}

/**
 * Avoid Safari's content module-loader stall by replacing only the copied,
 * already registered wrapper. Chrome and Firefox keep their module loader.
 * Original module URLs preserve worker paths and extension-context detection.
 * @param {string} outputDirectory
 * @returns {Promise<import('esbuild').Metafile>}
 * @throws {Error}
 */
export async function bundleSafariContent(outputDirectory) {
    const root = fs.realpathSync(outputDirectory);
    const wrapperPath = path.join(root, contentWrapper);
    fs.accessSync(wrapperPath);
    const result = await esbuild.build({
        absWorkingDir: root,
        entryPoints: [path.join(root, contentEntry)],
        outfile: wrapperPath,
        bundle: true,
        format: 'iife',
        globalName: '__sottakuSafariContent',
        platform: 'browser',
        target: 'safari16.4',
        write: false,
        metafile: true,
        plugins: [{
            name: 'preserve-safari-content-module-urls-and-startup',
            setup(build) {
                build.onLoad({filter: /.*/}, (args) => {
                    const filePath = fs.realpathSync(args.path);
                    const relative = path.relative(root, filePath);
                    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || path.extname(relative) !== '.js') {
                        throw new Error(`Unexpected Safari content module: ${relative}`);
                    }
                    let contents = fs.readFileSync(filePath, 'utf8');
                    if (relative.split(path.sep).join('/') === contentEntry) {
                        contents = exposeContentStartup(contents);
                    }
                    return {
                        contents: preserveSafariModuleUrls(contents, `/${relative.split(path.sep).join('/')}`),
                        loader: 'js',
                    };
                });
            },
        }],
    });
    if (result.outputFiles.length !== 1 || Object.values(result.metafile.outputs).some(({imports}) => imports.length > 0)) {
        throw new Error('Safari content bundle must contain its complete module graph');
    }
    const bundle = wrapContentStartup(result.outputFiles[0].text);
    assertClassicScript(bundle);
    fs.writeFileSync(wrapperPath, bundle);
    return result.metafile;
}
