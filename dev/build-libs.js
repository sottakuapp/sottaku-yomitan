/*
 * Copyright (C) 2023-2025  Yomitan Authors
 * Copyright (C) 2020-2022  Yomichan Authors
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

import Ajv from 'ajv';
import standaloneCode from 'ajv/dist/standalone/index.js';
import esbuild from 'esbuild';
import fs from 'fs';
import {createRequire} from 'module';
import path from 'path';
import {fileURLToPath} from 'url';
import {parseJson} from './json.js';

const require = createRequire(import.meta.url);

const dirname = path.dirname(fileURLToPath(import.meta.url));
const extDir = path.join(dirname, '..', 'ext');

/**
 * @param {string} out
 */
async function copyWasm(out) {
    // copy from node modules '@resvg/resvg-wasm/index_bg.wasm' to out
    const resvgWasmPath = path.dirname(require.resolve('@resvg/resvg-wasm'));
    const wasmPath = path.join(resvgWasmPath, 'index_bg.wasm');
    fs.copyFileSync(wasmPath, path.join(out, 'resvg.wasm'));
}


/**
 * @param {string} scriptPath
 */
async function buildLib(scriptPath) {
    const outFile = path.join(extDir, 'lib', path.basename(scriptPath));
    await esbuild.build({
        entryPoints: [scriptPath],
        bundle: true,
        minify: false,
        sourcemap: false,
        target: 'es2020',
        format: 'esm',
        outfile: outFile,
        external: ['fs'],
        banner: {
            js: '// @ts-nocheck',
        },
    });

    // Clean up stale source maps from older builds so release packages do not
    // ship code patterns that only exist inside sourcesContent.
    fs.rmSync(`${outFile}.map`, {force: true});
}

/**
 * Removes dormant eval-based Handlebars compiler code from the shipped bundle
 * and aliases compile() to the interpreter-based compileAST() implementation.
 * @throws {Error} When the generated bundle no longer matches the expected patch points.
 */
function patchHandlebarsBundle() {
    const fileName = path.join(extDir, 'lib', 'handlebars.js');
    let content = fs.readFileSync(fileName, {encoding: 'utf8'});

    const replacements = [
        {
            before: 'this.decorators = Function.apply(this, ["fn", "props", "container", "depth0", "data", "blockParams", "depths", this.decorators.merge()]);',
            after: 'this.decorators = function disabledHandlebarsDecoratorCompiler() { throw new _exception2["default"]("Unsafe Handlebars decorator compilation is disabled; use compileAST instead."); };',
        },
        {
            before: 'return Function.apply(this, params);',
            after: 'return function disabledHandlebarsCompiler() { throw new _exception2["default"]("Unsafe Handlebars compilation is disabled; use compileAST instead."); };',
        },
        {
            before: '  SandboxedHandlebars.compileAST = import_handlebars2.default.compileAST;\n  return SandboxedHandlebars;\n};',
            after: '  SandboxedHandlebars.compileAST = import_handlebars2.default.compileAST;\n  SandboxedHandlebars.compile = import_handlebars2.default.compile;\n  return SandboxedHandlebars;\n};',
        },
        {
            before: [
                'import_handlebars2.default.compileAST = function(input, options) {',
                '  if (input == null || typeof input !== "string" && input.type !== "Program") {',
                '    throw new import_handlebars2.default.Exception(',
                '      `You must pass a string or Handlebars AST to Handlebars.compileAST. You passed ${' + 'input}`',
                '    );',
                '  }',
                '  const visitor = new ElasticHandlebarsVisitor(this ?? import_handlebars2.default, input, options);',
                '  return (context, runtimeOptions) => visitor.render(context, runtimeOptions);',
                '};',
            ].join('\n'),
            after: [
                'import_handlebars2.default.compileAST = function(input, options) {',
                '  if (input == null || typeof input !== "string" && input.type !== "Program") {',
                '    throw new import_handlebars2.default.Exception(',
                '      `You must pass a string or Handlebars AST to Handlebars.compileAST. You passed ${' + 'input}`',
                '    );',
                '  }',
                '  const visitor = new ElasticHandlebarsVisitor(this ?? import_handlebars2.default, input, options);',
                '  return (context, runtimeOptions) => visitor.render(context, runtimeOptions);',
                '};',
                'import_handlebars2.default.compile = function(input, options) {',
                '  return import_handlebars2.default.compileAST.call(this ?? import_handlebars2.default, input, options);',
                '};',
            ].join('\n'),
        },
    ];

    for (const {before, after} of replacements) {
        if (!content.includes(before)) {
            throw new Error(`Failed to patch handlebars bundle: missing expected snippet: ${before.slice(0, 80)}`);
        }
        content = content.replace(before, after);
    }

    fs.writeFileSync(fileName, content);
}

/**
 * Removes variable dynamic-import fallbacks from zip.js worker bundles.
 *
 * Firefox AMO flags `import(variable)` even when it is only a dormant fallback.
 * The classic worker path already uses `importScripts(...)`, so the fallback can
 * safely do the same in our shipped artifact.
 * @throws {Error} When the generated bundle no longer matches the expected patch points.
 */
function patchZipWorkerBundles() {
    const replacements = [
        {
            fileName: path.join(extDir, 'lib', 'z-worker.js'),
            before: 'await import(script);',
            after: 'importScripts(script);',
        },
        {
            fileName: path.join(extDir, 'lib', 'zip.js'),
            before: 'await import(t)',
            after: 'importScripts(t)',
        },
    ];

    for (const {fileName, before, after} of replacements) {
        let content = fs.readFileSync(fileName, {encoding: 'utf8'});
        if (!content.includes(before)) {
            throw new Error(`Failed to patch zip worker bundle: missing expected snippet: ${before}`);
        }
        content = content.replaceAll(before, after);
        fs.writeFileSync(fileName, content);
    }
}

/**
 * Bundles libraries.
 */
export async function buildLibs() {
    const devLibPath = path.join(dirname, 'lib');
    const files = await fs.promises.readdir(devLibPath, {
        withFileTypes: true,
    });
    for (const f of files) {
        if (f.isFile()) {
            await buildLib(path.join(devLibPath, f.name));
        }
    }

    patchHandlebarsBundle();
    patchZipWorkerBundles();

    const schemaDir = path.join(extDir, 'data/schemas/');
    const schemaFileNames = fs.readdirSync(schemaDir);
    const schemas = schemaFileNames.map((schemaFileName) => {
        /** @type {import('ajv').AnySchema} */
        // eslint-disable-next-line sonarjs/prefer-immediate-return
        const result = parseJson(fs.readFileSync(path.join(schemaDir, schemaFileName), {encoding: 'utf8'}));
        return result;
    });
    const ajv = new Ajv({
        schemas,
        code: {source: true, esm: true},
        allowUnionTypes: true,
    });
    const moduleCode = standaloneCode(ajv);

    // https://github.com/ajv-validator/ajv/issues/2209
    const patchedModuleCode = "// @ts-nocheck\nimport {ucs2length} from './ucs2length.js';" + moduleCode.replaceAll('require("ajv/dist/runtime/ucs2length").default', 'ucs2length');

    fs.writeFileSync(path.join(extDir, 'lib/validate-schemas.js'), patchedModuleCode);

    await copyWasm(path.join(extDir, 'lib'));
}
