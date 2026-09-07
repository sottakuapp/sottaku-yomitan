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
import {parse} from 'parse5';
import * as ts from 'typescript';

const popupEntry = '/js/display/popup-main.js';
const popupBundle = '/js/display/popup-main.bundle.js';

/**
 * Preserve worker URL bases when modules move into a Safari bundle.
 * AST ranges deliberately leave strings, comments, and template text untouched.
 * @param {string} source
 * @param {string} modulePath
 * @returns {string}
 * @throws {Error}
 */
export function preserveSafariModuleUrls(source, modulePath) {
    const file = ts.createSourceFile(modulePath, source, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
    /** @type {{start: number, end: number}[]} */
    const replacements = [];
    /**
     * @param {import('typescript').Node} node
     * @throws {Error}
     */
    function visit(node) {
        if ((ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
        ts.isMetaProperty(node.expression) && node.expression.keywordToken === ts.SyntaxKind.ImportKeyword) {
            const isUrl = ts.isPropertyAccessExpression(node) ?
                node.name.text === 'url' :
                ts.isStringLiteral(node.argumentExpression) && node.argumentExpression.text === 'url';
            if (isUrl) {
                replacements.push({start: node.getStart(file), end: node.getEnd()});
                return;
            }
        }
        if (ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword) {
            throw new Error(`Unsupported import.meta use in Safari module: ${modulePath}`);
        }
        ts.forEachChild(node, visit);
    }
    visit(file);
    const replacement = `globalThis.chrome.runtime.getURL(${JSON.stringify(modulePath)})`;
    for (const {start, end} of replacements.reverse()) {
        source = source.slice(0, start) + replacement + source.slice(end);
    }
    return source;
}

/**
 * Change only the copied popup's module entry, retaining the rest of its markup.
 * @param {string} html
 * @returns {string}
 * @throws {Error}
 */
function replacePopupEntry(html) {
    /** @type {import('parse5').DefaultTreeAdapterMap['element'][]} */
    const entries = [];
    /** @param {import('parse5').DefaultTreeAdapterMap['node']} node */
    function visit(node) {
        if ('tagName' in node && node.tagName === 'script' && node.attrs.some(({name, value}) => name === 'src' && value === popupEntry)) {
            entries.push(node);
        }
        if ('childNodes' in node) {
            for (const child of node.childNodes) { visit(child); }
        }
    }
    visit(parse(html, {sourceCodeLocationInfo: true}));
    const entry = entries[0];
    const location = entry?.sourceCodeLocation?.attrs?.src;
    if (entries.length !== 1 || !entry.attrs.some(({name, value}) => name === 'type' && value === 'module') || !location) {
        throw new Error('Expected exactly one Safari popup module entry');
    }
    return html.slice(0, location.startOffset) + `src="${popupBundle}"` + html.slice(location.endOffset);
}

/**
 * Bundle the Safari popup's module graph to avoid iframe module-loader stalls.
 * Only an already copied Safari output directory is changed; other builds keep
 * their original module entries. Worker scripts remain separately packaged.
 * @param {string} outputDirectory
 * @returns {Promise<import('esbuild').Metafile>}
 * @throws {Error}
 */
export async function bundleSafariPopup(outputDirectory) {
    // Canonicalize /tmp aliases and symlinks before comparing esbuild's paths.
    const root = fs.realpathSync(outputDirectory);
    const htmlPath = path.join(root, 'popup.html');
    const html = replacePopupEntry(fs.readFileSync(htmlPath, 'utf8'));
    const result = await esbuild.build({
        absWorkingDir: root,
        entryPoints: [path.join(root, popupEntry)],
        outfile: path.join(root, popupBundle),
        bundle: true,
        format: 'esm',
        platform: 'browser',
        target: 'safari16.4',
        write: false,
        metafile: true,
        plugins: [{
            name: 'preserve-safari-module-urls',
            setup(build) {
                build.onLoad({filter: /.*/}, (args) => {
                    const filePath = fs.realpathSync(args.path);
                    const relative = path.relative(root, filePath);
                    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || path.extname(relative) !== '.js') {
                        throw new Error(`Unexpected Safari popup module: ${relative}`);
                    }
                    return {
                        contents: preserveSafariModuleUrls(fs.readFileSync(filePath, 'utf8'), `/${relative.split(path.sep).join('/')}`),
                        loader: 'js',
                    };
                });
            },
        }],
    });
    if (result.outputFiles.length !== 1 || Object.values(result.metafile.outputs).some(({imports}) => imports.length > 0)) {
        throw new Error('Safari popup bundle must contain its complete module graph');
    }
    const [bundle] = result.outputFiles;
    // esbuild leaves nonliteral dynamic imports alone; reject these too.
    const file = ts.createSourceFile(popupBundle, bundle.text, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
    /**
     * @param {import('typescript').Node} node
     * @throws {Error}
     */
    function checkImports(node) {
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
            throw new Error('Safari popup bundle contains an unresolved dynamic import');
        }
        ts.forEachChild(node, checkImports);
    }
    checkImports(file);
    fs.writeFileSync(bundle.path, bundle.contents);
    fs.writeFileSync(htmlPath, html);
    return result.metafile;
}
