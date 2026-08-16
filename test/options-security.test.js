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

import {existsSync, readFileSync} from 'node:fs';
import {describe, expect, test, vi} from 'vitest';
import {Backend} from '../ext/js/background/backend.js';
import {parseJson} from '../ext/js/core/json.js';
import {ObjectPropertyAccessor} from '../ext/js/general/object-property-accessor.js';
import {ManifestUtil} from '../dev/manifest-util.js';
import {
    getSottakuCredentialResetPathsForApiBaseUrlMutation,
    getUntrustedSettingPathArray,
    isSottakuCredentialDestinationSettingPath,
    isSottakuCredentialSettingPath,
    isTrustedExtensionPageSender,
    redactSottakuCredentialsDeep,
    redactSottakuCredentialsForSettingResult,
    redactSottakuCredentialsFromOptions,
    redactSottakuCredentialsFromProfileOptions,
    settingMutationTouchesSottakuCredentials,
} from '../ext/js/background/options-security.js';

const extensionRoot = 'chrome-extension://abcdefghijklmnop/';

/**
 * Returns every runtime JavaScript module reachable from an extension entry point.
 * @param {string} entryPoint
 * @returns {Set<string>}
 */
function getExtensionModuleGraph(entryPoint) {
    const extensionRootUrl = new URL('../ext/', import.meta.url);
    const pending = [entryPoint];
    const modules = new Set();
    const importPattern = /(?:import|export)\s+(?:[^"'()]*?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

    while (pending.length > 0) {
        const modulePath = pending.pop();
        if (typeof modulePath === 'undefined' || modules.has(modulePath)) { continue; }
        modules.add(modulePath);

        const moduleUrl = new URL(modulePath, extensionRootUrl);
        const source = readFileSync(moduleUrl, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
        for (const match of source.matchAll(importPattern)) {
            const specifier = match[1] ?? match[2];
            if (!specifier.startsWith('.') || !specifier.endsWith('.js')) { continue; }

            const dependencyUrl = new URL(specifier, moduleUrl);
            if (!dependencyUrl.href.startsWith(extensionRootUrl.href) || !existsSync(dependencyUrl)) { continue; }
            pending.push(dependencyUrl.href.slice(extensionRootUrl.href.length));
        }
    }

    return modules;
}

const escapedSettingPathCases = [
    {scope: 'profile', property: 'authToken', kind: 'credential', path: String.raw`sottaku["auth\Token"]`},
    {scope: 'profile', property: 'authToken', kind: 'credential', path: String.raw`sottaku['auth\Token']`},
    {scope: 'global', property: 'authToken', kind: 'credential', path: String.raw`profiles[0].options.sottaku["auth\Token"]`},
    {scope: 'global', property: 'authToken', kind: 'credential', path: String.raw`profiles[0].options.sottaku['auth\Token']`},
    {scope: 'profile', property: 'refreshToken', kind: 'credential', path: String.raw`sottaku["refresh\Token"]`},
    {scope: 'profile', property: 'refreshToken', kind: 'credential', path: String.raw`sottaku['refresh\Token']`},
    {scope: 'global', property: 'refreshToken', kind: 'credential', path: String.raw`profiles[0].options.sottaku["refresh\Token"]`},
    {scope: 'global', property: 'refreshToken', kind: 'credential', path: String.raw`profiles[0].options.sottaku['refresh\Token']`},
    {scope: 'profile', property: 'apiBaseUrl', kind: 'destination', path: String.raw`sottaku["apiBase\Url"]`},
    {scope: 'profile', property: 'apiBaseUrl', kind: 'destination', path: String.raw`sottaku['apiBase\Url']`},
    {scope: 'global', property: 'apiBaseUrl', kind: 'destination', path: String.raw`profiles[0].options.sottaku["apiBase\Url"]`},
    {scope: 'global', property: 'apiBaseUrl', kind: 'destination', path: String.raw`profiles[0].options.sottaku['apiBase\Url']`},
    {scope: 'profile', property: 'sottaku', kind: 'block', path: String.raw`["sott\aku"]`},
    {scope: 'profile', property: 'sottaku', kind: 'block', path: String.raw`['sott\aku']`},
    {scope: 'global', property: 'sottaku', kind: 'block', path: String.raw`profiles[0].options["sott\aku"]`},
    {scope: 'global', property: 'sottaku', kind: 'block', path: String.raw`profiles[0].options['sott\aku']`},
];

const dangerousSettingPathCases = [
    {segment: '__proto__', escapedSegment: String.raw`__pro\to__`},
    {segment: 'prototype', escapedSegment: String.raw`proto\type`},
    {segment: 'constructor', escapedSegment: String.raw`construc\tor`},
].flatMap(({segment, escapedSegment}) => [
    {syntax: 'dot', segment, suffix: `.${segment}`},
    {syntax: 'double-quoted', segment, suffix: `["${segment}"]`},
    {syntax: 'single-quoted', segment, suffix: `['${segment}']`},
    {syntax: 'escaped-double-quoted', segment, suffix: `["${escapedSegment}"]`},
    {syntax: 'escaped-single-quoted', segment, suffix: `['${escapedSegment}']`},
]).flatMap(({syntax, segment, suffix}) => [
    {scope: /** @type {const} */ ('profile'), syntax, segment, path: `sottaku${suffix}`},
    {scope: /** @type {const} */ ('global'), syntax, segment, path: `profiles[0].options.sottaku${suffix}`},
]);

/**
 * @returns {{general: {language: string}, sottaku: {enabled: boolean, apiBaseUrl: string, authToken: string, refreshToken: string, user: {id: number}}}}
 */
function profileOptions() {
    return {
        general: {language: 'ja'},
        sottaku: {
            enabled: true,
            apiBaseUrl: 'https://sottaku.app/api/v1',
            authToken: 'access-secret',
            refreshToken: 'refresh-secret',
            user: {id: 7},
        },
    };
}

describe('extension option credential boundaries', () => {
    test('trusts extension pages but not content scripts injected into websites', () => {
        expect(isTrustedExtensionPageSender(
            {url: 'chrome-extension://abcdefghijklmnop/settings.html'},
            extensionRoot,
        )).toBe(true);
        expect(isTrustedExtensionPageSender(
            {url: 'https://attacker.example/article', id: 'abcdefghijklmnop'},
            extensionRoot,
        )).toBe(false);
        expect(isTrustedExtensionPageSender(
            {url: 'chrome-extension://different-extension/settings.html'},
            extensionRoot,
        )).toBe(false);
        expect(isTrustedExtensionPageSender(
            {url: 'file:///tmp/untrusted.html'},
            extensionRoot,
        )).toBe(false);
        expect(isTrustedExtensionPageSender(void 0, extensionRoot)).toBe(false);
    });

    test('redacts both persisted credentials without mutating the stored profile', () => {
        const original = profileOptions();
        const redacted = redactSottakuCredentialsFromProfileOptions(original);

        expect(redacted.sottaku.authToken).toBe('');
        expect(redacted.sottaku.refreshToken).toBe('');
        expect(redacted.sottaku.enabled).toBe(true);
        expect(original.sottaku.authToken).toBe('access-secret');
        expect(original.sottaku.refreshToken).toBe('refresh-secret');
    });

    test('keeps authenticated features available to extension-owned display pages', async () => {
        const original = profileOptions();
        const context = {
            _getProfileOptions: vi.fn(() => original),
            _senderCanReadPersistedCredentials: (/** @type {{url?: string}|undefined} */ sender) => isTrustedExtensionPageSender(sender, extensionRoot),
        };
        // eslint-disable-next-line no-underscore-dangle, @typescript-eslint/unbound-method
        const optionsGet = Backend.prototype._onApiOptionsGet;

        const trusted = await optionsGet.call(context, {optionsContext: {current: true}}, {
            url: 'chrome-extension://abcdefghijklmnop/popup.html',
        });
        const untrusted = await optionsGet.call(context, {optionsContext: {current: true}}, {
            url: 'https://attacker.example/article',
        });

        expect(trusted.sottaku.authToken).toBe('access-secret');
        expect(trusted.sottaku.refreshToken).toBe('refresh-secret');
        expect(untrusted.sottaku.authToken).toBe('');
        expect(untrusted.sottaku.refreshToken).toBe('');
    });

    test('redacts every profile returned by optionsGetFull', () => {
        const first = profileOptions();
        const second = profileOptions();
        second.sottaku.authToken = 'other-access';
        second.sottaku.refreshToken = 'other-refresh';
        const full = {profileCurrent: 0, profiles: [{name: 'A', options: first}, {name: 'B', options: second}]};

        const redacted = redactSottakuCredentialsFromOptions(full);

        expect(redacted.profiles.map(({options}) => options.sottaku.authToken)).toStrictEqual(['', '']);
        expect(redacted.profiles.map(({options}) => options.sottaku.refreshToken)).toStrictEqual(['', '']);
        expect(full.profiles[1].options.sottaku.refreshToken).toBe('other-refresh');
    });

    test('redacts credentials from arbitrary getSettings result shapes', () => {
        const nested = {
            profiles: [{options: profileOptions()}],
            unrelated: {authToken: 'not-a-sottaku-token'},
        };

        const redacted = redactSottakuCredentialsDeep(nested);

        expect(redacted.profiles[0].options.sottaku.authToken).toBe('');
        expect(redacted.profiles[0].options.sottaku.refreshToken).toBe('');
        expect(redacted.unrelated.authToken).toBe('not-a-sottaku-token');
        expect(nested.profiles[0].options.sottaku.authToken).toBe('access-secret');
    });

    test('redacts direct Sottaku block and scalar credential setting results', () => {
        const block = profileOptions().sottaku;
        const redactedBlock = /** @type {{authToken: string, refreshToken: string, enabled: boolean}} */ (redactSottakuCredentialsForSettingResult(
            'profiles[0].options.sottaku',
            block,
        ));

        expect(redactedBlock.authToken).toBe('');
        expect(redactedBlock.refreshToken).toBe('');
        expect(redactedBlock.enabled).toBe(true);
        expect(redactSottakuCredentialsForSettingResult(
            'profiles[0].options.sottaku.authToken',
            'access-secret',
        )).toBe('');
        expect(block.authToken).toBe('access-secret');
    });

    test('uses canonical escaped paths for profile and global reads and redaction', () => {
        const profile = profileOptions();
        const fullOptions = {profiles: [{name: 'Default', options: profile}]};

        for (const {scope, property, kind, path} of escapedSettingPathCases) {
            const source = scope === 'profile' ? profile : fullOptions;
            const accessor = new ObjectPropertyAccessor(source);
            const result = accessor.get(ObjectPropertyAccessor.getPathArray(path));
            const redacted = redactSottakuCredentialsForSettingResult(path, result);

            expect(isSottakuCredentialSettingPath(path)).toBe(kind === 'credential');
            expect(isSottakuCredentialDestinationSettingPath(path)).toBe(kind === 'destination');
            expect(settingMutationTouchesSottakuCredentials({action: 'set', path, value: null})).toBe(true);

            if (kind === 'credential') {
                expect(result).toBe(profile.sottaku[/** @type {'authToken'|'refreshToken'} */ (property)]);
                expect(redacted).toBe('');
            } else if (kind === 'destination') {
                expect(result).toBe(profile.sottaku.apiBaseUrl);
                expect(redacted).toBe(profile.sottaku.apiBaseUrl);
            } else {
                const redactedBlock = /** @type {{authToken: string, refreshToken: string}} */ (redacted);
                expect(result).toBe(profile.sottaku);
                expect(redactedBlock.authToken).toBe('');
                expect(redactedBlock.refreshToken).toBe('');
            }
        }

        expect(profile.sottaku.authToken).toBe('access-secret');
        expect(profile.sottaku.refreshToken).toBe('refresh-secret');
    });

    test('rejects canonical and escaped prototype path segments after parsing', () => {
        expect(getUntrustedSettingPathArray('profiles[0].name')).toStrictEqual(['profiles', 0, 'name']);
        for (const {segment, path} of dangerousSettingPathCases) {
            expect(ObjectPropertyAccessor.getPathArray(path)).toContain(segment);
            expect(() => getUntrustedSettingPathArray(path)).toThrow('Dangerous setting path');
        }
    });

    test('keeps the credential-bearing Sottaku settings object schema-closed', () => {
        const schema = /** @type {{properties: {profiles: {items: {properties: {options: {properties: {sottaku: {additionalProperties?: boolean}}}}}}}}} */ (parseJson(readFileSync(
            new URL('../ext/data/schemas/options-schema.json', import.meta.url),
            'utf8',
        )));

        expect(schema.properties.profiles.items.properties.options.properties.sottaku.additionalProperties).toBe(false);
    });

    test('blocks dangerous prototype paths from untrusted profile and global reads', async () => {
        const profile = profileOptions();
        const fullOptions = {profiles: [{name: 'Default', options: profile}]};
        const context = {
            _senderCanReadPersistedCredentials: (/** @type {{url?: string}|undefined} */ sender) => isTrustedExtensionPageSender(sender, extensionRoot),
            // eslint-disable-next-line no-underscore-dangle, @typescript-eslint/unbound-method
            _getSetting: Backend.prototype._getSetting,
            _getModifySettingObject: (/** @type {{scope: string}} */ target) => (target.scope === 'profile' ? profile : fullOptions),
        };
        // eslint-disable-next-line no-underscore-dangle, @typescript-eslint/unbound-method
        const getSettings = Backend.prototype._onApiGetSettings;
        const targets = dangerousSettingPathCases.map(({scope, path}) => ({scope, path}));

        const results = await getSettings.call(context, {targets}, {url: 'https://attacker.example/article'});

        expect(results).toHaveLength(targets.length);
        expect(results.every((result) => typeof result.error !== 'undefined')).toBe(true);
        expect(Object.getPrototypeOf(profile.sottaku)).toBe(Object.prototype);
    });

    test('fails closed on malformed untrusted read paths before accessing settings', async () => {
        const profile = profileOptions();
        const context = {
            _senderCanReadPersistedCredentials: (/** @type {{url?: string}|undefined} */ sender) => isTrustedExtensionPageSender(sender, extensionRoot),
            // eslint-disable-next-line no-underscore-dangle, @typescript-eslint/unbound-method
            _getSetting: Backend.prototype._getSetting,
            _getModifySettingObject: vi.fn(() => profile),
        };
        // eslint-disable-next-line no-underscore-dangle, @typescript-eslint/unbound-method
        const getSettings = Backend.prototype._onApiGetSettings;
        const targets = /** @type {import('settings-modifications').ScopedRead[]} */ ([
            {scope: 'profile', optionsContext: {current: true}, path: 'sottaku["__proto__"'},
            {scope: 'profile', optionsContext: {current: true}, path: 'sottaku.'},
            {scope: 'profile', optionsContext: {current: true}, path: 'sottaku["constructor"]x'},
            {scope: 'profile', optionsContext: {current: true}, path: 1},
        ]);

        const results = await getSettings.call(context, {targets}, {url: 'https://attacker.example/article'});

        expect(results).toHaveLength(targets.length);
        expect(results.every((result) => typeof result.error !== 'undefined')).toBe(true);
    });

    test('blocks direct, nested, and whole-block credential mutations from untrusted contexts', () => {
        expect(isSottakuCredentialSettingPath('sottaku.authToken')).toBe(true);
        expect(isSottakuCredentialSettingPath('profiles[0].options.sottaku.refreshToken')).toBe(true);
        expect(isSottakuCredentialSettingPath('sottaku.enabled')).toBe(false);
        expect(isSottakuCredentialDestinationSettingPath('sottaku.apiBaseUrl')).toBe(true);
        expect(isSottakuCredentialDestinationSettingPath('sottaku.locale')).toBe(false);

        expect(settingMutationTouchesSottakuCredentials({path: 'sottaku.authToken', value: 'secret'})).toBe(true);
        expect(settingMutationTouchesSottakuCredentials({path: 'sottaku.apiBaseUrl', value: 'http://127.0.0.1:8080/api/v1'})).toBe(true);
        expect(settingMutationTouchesSottakuCredentials({path: 'sottaku', value: {enabled: true}})).toBe(true);
        expect(settingMutationTouchesSottakuCredentials({
            path: 'profiles',
            value: [{options: profileOptions()}],
        })).toBe(true);
        expect(settingMutationTouchesSottakuCredentials({
            path: 'profiles[0]',
            value: {name: 'Replacement profile', options: {general: {language: 'ja'}}},
        })).toBe(true);
        expect(settingMutationTouchesSottakuCredentials({
            path: 'profiles[0].options',
            value: {general: {language: 'ja'}},
        })).toBe(true);
        expect(settingMutationTouchesSottakuCredentials({
            path: 'profiles[0].nested.options',
            value: {general: {language: 'ja'}},
        })).toBe(true);
        expect(settingMutationTouchesSottakuCredentials({path: 'profiles[0].name', value: 'Renamed'})).toBe(false);
        expect(settingMutationTouchesSottakuCredentials({path: 'sottaku.enabled', value: true})).toBe(false);
        expect(settingMutationTouchesSottakuCredentials({
            action: 'swap',
            path1: 'profiles[0].name',
            path2: 'profiles[1].name',
        })).toBe(false);
        expect(settingMutationTouchesSottakuCredentials({
            action: 'swap',
            path1: 'profiles[0].options.sottaku.authToken',
            path2: 'profiles[0].name',
        })).toBe(true);
    });

    test('blocks every escaped path through every mutation action from untrusted contexts', async () => {
        const modifySettings = vi.fn(async () => []);
        const context = {
            _senderCanReadPersistedCredentials: (/** @type {{url?: string}|undefined} */ sender) => isTrustedExtensionPageSender(sender, extensionRoot),
            _modifySettings: modifySettings,
        };
        // eslint-disable-next-line no-underscore-dangle, @typescript-eslint/unbound-method
        const modify = Backend.prototype._onApiModifySettings;

        for (const {scope, path} of escapedSettingPathCases) {
            const scopeTarget = scope === 'profile' ?
                {scope: /** @type {const} */ ('profile'), optionsContext: {current: true}} :
                {scope: /** @type {const} */ ('global')};
            const safePath = scope === 'profile' ? 'general.language' : 'profiles[0].name';
            const mutations = /** @type {import('settings-modifications').ScopedModification[]} */ ([
                {...scopeTarget, action: 'set', path, value: 'replacement'},
                {...scopeTarget, action: 'delete', path},
                {...scopeTarget, action: 'swap', path1: path, path2: safePath},
                {...scopeTarget, action: 'splice', path, start: 0, deleteCount: 0, items: []},
                {...scopeTarget, action: 'push', path, items: []},
            ]);

            for (const target of mutations) {
                expect(settingMutationTouchesSottakuCredentials(target)).toBe(true);
                await expect(modify.call(context, {targets: [target], source: 'test'}, {
                    url: 'https://attacker.example/article',
                })).rejects.toThrow('Untrusted extension context');
            }
        }
        expect(modifySettings).not.toHaveBeenCalled();
    });

    test('blocks every dangerous prototype path through every untrusted mutation action', async () => {
        const modifySettings = vi.fn(async () => []);
        const context = {
            _senderCanReadPersistedCredentials: (/** @type {{url?: string}|undefined} */ sender) => isTrustedExtensionPageSender(sender, extensionRoot),
            _modifySettings: modifySettings,
        };
        // eslint-disable-next-line no-underscore-dangle, @typescript-eslint/unbound-method
        const modify = Backend.prototype._onApiModifySettings;

        for (const {scope, path} of dangerousSettingPathCases) {
            const scopeTarget = scope === 'profile' ?
                {scope: /** @type {const} */ ('profile'), optionsContext: {current: true}} :
                {scope: /** @type {const} */ ('global')};
            const safePath = scope === 'profile' ? 'general.language' : 'profiles[0].name';
            const mutations = /** @type {import('settings-modifications').ScopedModification[]} */ ([
                {...scopeTarget, action: 'set', path, value: {polluted: true}},
                {...scopeTarget, action: 'delete', path},
                {...scopeTarget, action: 'swap', path1: path, path2: safePath},
                {...scopeTarget, action: 'splice', path, start: 0, deleteCount: 0, items: []},
                {...scopeTarget, action: 'push', path, items: []},
            ]);

            for (const target of mutations) {
                expect(settingMutationTouchesSottakuCredentials(target)).toBe(true);
                await expect(modify.call(context, {targets: [target], source: 'test'}, {
                    url: 'https://attacker.example/article',
                })).rejects.toThrow('Untrusted extension context');
            }
        }
        expect(modifySettings).not.toHaveBeenCalled();
    });

    test('blocks dangerous object keys embedded in untrusted setting values', async () => {
        const modifySettings = vi.fn(async () => []);
        const context = {
            _senderCanReadPersistedCredentials: (/** @type {{url?: string}|undefined} */ sender) => isTrustedExtensionPageSender(sender, extensionRoot),
            _modifySettings: modifySettings,
        };
        // eslint-disable-next-line no-underscore-dangle, @typescript-eslint/unbound-method
        const modify = Backend.prototype._onApiModifySettings;
        const dangerousNested = {};
        Object.defineProperty(dangerousNested, '__proto__', {
            configurable: true,
            enumerable: true,
            value: {polluted: true},
            writable: true,
        });
        const value = {nested: dangerousNested};
        const target = {
            action: /** @type {const} */ ('set'),
            scope: /** @type {const} */ ('profile'),
            optionsContext: {current: true},
            path: 'general.customPopupCss',
            value,
        };

        expect(settingMutationTouchesSottakuCredentials(target)).toBe(true);
        await expect(modify.call(context, {targets: [target], source: 'test'}, {
            url: 'https://attacker.example/article',
        })).rejects.toThrow('Untrusted extension context');
        expect(modifySettings).not.toHaveBeenCalled();
    });

    test('applies legitimate untrusted writes through strict own-path validation', async () => {
        const profile = profileOptions();
        const saveOptions = vi.fn(async () => {});
        const context = {
            _senderCanReadPersistedCredentials: (/** @type {{url?: string}|undefined} */ sender) => isTrustedExtensionPageSender(sender, extensionRoot),
            // eslint-disable-next-line no-underscore-dangle, @typescript-eslint/unbound-method
            _modifySettings: Backend.prototype._modifySettings,
            // eslint-disable-next-line no-underscore-dangle, @typescript-eslint/unbound-method
            _modifySetting: Backend.prototype._modifySetting,
            _getModifySettingObject: () => profile,
            _saveOptions: saveOptions,
        };
        // eslint-disable-next-line no-underscore-dangle, @typescript-eslint/unbound-method
        const modify = Backend.prototype._onApiModifySettings;

        const result = await modify.call(context, {
            targets: [{
                action: 'set',
                scope: 'profile',
                optionsContext: {current: true},
                path: 'general.language',
                value: 'ko',
            }],
            source: 'test',
        }, {url: 'https://example.com/article'});

        expect(result).toStrictEqual([{result: 'ko'}]);
        expect(profile.general.language).toBe('ko');
        expect(saveOptions).toHaveBeenCalledOnce();
    });

    test('requires untrusted mutation destinations to be existing own settings paths', () => {
        const inheritedSottaku = {inheritedSetting: 'inherited'};
        const sottaku = {
            enabled: true,
            values: ['first'],
        };
        Object.setPrototypeOf(sottaku, inheritedSottaku);
        const profile = {general: {language: 'ja'}, sottaku};
        const context = {_getModifySettingObject: () => profile};
        // eslint-disable-next-line no-underscore-dangle, @typescript-eslint/unbound-method
        const modifySetting = Backend.prototype._modifySetting;

        expect(modifySetting.call(context, {
            action: 'set', scope: 'profile', optionsContext: {current: true}, path: 'sottaku.enabled', value: false,
        }, true)).toBe(false);
        expect(sottaku.enabled).toBe(false);

        expect(() => modifySetting.call(context, {
            action: 'set', scope: 'profile', optionsContext: {current: true}, path: 'sottaku.newSetting', value: true,
        }, true)).toThrow('Invalid path');
        expect(() => modifySetting.call(context, {
            action: 'set', scope: 'profile', optionsContext: {current: true}, path: 'sottaku.inheritedSetting', value: 'shadowed',
        }, true)).toThrow('Invalid path');
        expect(() => modifySetting.call(context, {
            action: 'set', scope: 'profile', optionsContext: {current: true}, path: 'sottaku.__proto__', value: {polluted: true},
        }, true)).toThrow('Dangerous setting path');

        expect(Object.prototype.hasOwnProperty.call(sottaku, 'newSetting')).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(sottaku, 'inheritedSetting')).toBe(false);
        expect(Object.getPrototypeOf(sottaku)).toBe(inheritedSottaku);
    });

    test('fails closed on malformed untrusted mutation paths', async () => {
        const malformedTargets = [
            {action: 'set', path: 'sottaku["authToken"', value: 'replacement'},
            {action: 'delete', path: 'sottaku.'},
            {action: 'swap', path1: 'profiles[0].name', path2: 'profiles[0].options["sottaku"]x'},
            {action: 'splice', path: '[', start: 0, deleteCount: 0, items: []},
            {action: 'push', path: 1, items: []},
        ];
        const modifySettings = vi.fn(async () => []);
        const context = {
            _senderCanReadPersistedCredentials: (/** @type {{url?: string}|undefined} */ sender) => isTrustedExtensionPageSender(sender, extensionRoot),
            _modifySettings: modifySettings,
        };
        // eslint-disable-next-line no-underscore-dangle, @typescript-eslint/unbound-method
        const modify = Backend.prototype._onApiModifySettings;

        for (const target of malformedTargets) {
            expect(settingMutationTouchesSottakuCredentials(target)).toBe(true);
            const scopedTarget = /** @type {import('settings-modifications').ScopedModification} */ ({scope: 'global', ...target});
            await expect(modify.call(context, {
                targets: [scopedTarget],
                source: 'test',
            }, {
                url: 'https://attacker.example/article',
            })).rejects.toThrow('Untrusted extension context');
        }
        expect(modifySettings).not.toHaveBeenCalled();
    });

    test('derives credential cleanup paths for profile and global API destination changes', () => {
        expect(getSottakuCredentialResetPathsForApiBaseUrlMutation({
            path: 'sottaku.apiBaseUrl',
        })).toStrictEqual([
            'sottaku.authToken',
            'sottaku.refreshToken',
            'sottaku.user',
        ]);
        expect(getSottakuCredentialResetPathsForApiBaseUrlMutation({
            path: 'profiles[2].options.sottaku.apiBaseUrl',
        })).toStrictEqual([
            'profiles[2].options.sottaku.authToken',
            'profiles[2].options.sottaku.refreshToken',
            'profiles[2].options.sottaku.user',
        ]);

        for (const {scope, kind, path} of escapedSettingPathCases) {
            if (kind !== 'destination') { continue; }
            expect(getSottakuCredentialResetPathsForApiBaseUrlMutation({path})).toStrictEqual(
                scope === 'profile' ?
                    ['sottaku.authToken', 'sottaku.refreshToken', 'sottaku.user'] :
                    [
                        'profiles[0].options.sottaku.authToken',
                        'profiles[0].options.sottaku.refreshToken',
                        'profiles[0].options.sottaku.user',
                    ],
            );
        }
    });

    test('rejects untrusted token rotation messages and permits extension-owned rotation', async () => {
        const senderCanRead = (/** @type {{url?: string}|undefined} */ sender) => isTrustedExtensionPageSender(sender, extensionRoot);
        const handleUpdate = vi.fn(async () => {});
        const handleInvalidate = vi.fn(async () => {});
        const context = {
            _senderCanReadPersistedCredentials: senderCanRead,
            _handleSottakuAuthTokenUpdate: handleUpdate,
            _handleSottakuAuthTokenInvalidate: handleInvalidate,
        };
        // eslint-disable-next-line no-underscore-dangle, @typescript-eslint/unbound-method
        const update = Backend.prototype._onApiSottakuAuthTokenUpdate;
        // eslint-disable-next-line no-underscore-dangle, @typescript-eslint/unbound-method
        const invalidate = Backend.prototype._onApiSottakuAuthTokenInvalidate;
        const params = {
            apiBaseUrl: 'https://sottaku.app/api/v1',
            oldToken: 'old-token',
            newToken: 'new-token',
        };

        await expect(update.call(context, params, {
            url: 'https://attacker.example/article',
        })).rejects.toThrow('Untrusted extension context');
        await expect(invalidate.call(context, params, {
            url: 'https://attacker.example/article',
        })).rejects.toThrow('Untrusted extension context');
        expect(handleUpdate).not.toHaveBeenCalled();
        expect(handleInvalidate).not.toHaveBeenCalled();

        const trustedSender = {url: 'chrome-extension://abcdefghijklmnop/popup.html'};
        await update.call(context, params, trustedSender);
        await invalidate.call(context, params, trustedSender);
        expect(handleUpdate).toHaveBeenCalledWith(params.apiBaseUrl, params.oldToken, params.newToken);
        expect(handleInvalidate).toHaveBeenCalledWith(params.apiBaseUrl, params.oldToken);
    });

    test('clears stored credentials atomically when a trusted page changes API destination', async () => {
        const captured = {
            /** @type {Array<{path: string, value: unknown}>|null} */
            targets: null,
        };
        const modifySettings = vi.fn(
            /**
             * @param {Array<{path: string, value: unknown}>} targets
             * @returns {Promise<Array<{result: string}>>}
             */
            async (targets) => {
                captured.targets = targets;
                return targets.map(({path}) => ({result: path}));
            },
        );
        const context = {
            _senderCanReadPersistedCredentials: (/** @type {{url?: string}|undefined} */ sender) => isTrustedExtensionPageSender(sender, extensionRoot),
            _modifySettings: modifySettings,
        };
        // eslint-disable-next-line no-underscore-dangle, @typescript-eslint/unbound-method
        const modify = Backend.prototype._onApiModifySettings;
        const destinationChange = /** @type {import('settings-modifications').ScopedModificationSet} */ ({
            action: 'set',
            scope: 'profile',
            optionsContext: {index: 0},
            path: String.raw`sottaku["apiBase\Url"]`,
            value: 'https://staging.sottaku.app/api/v1',
        });

        await expect(modify.call(context, {targets: [destinationChange], source: 'test'}, {
            url: 'https://attacker.example/article',
        })).rejects.toThrow('Untrusted extension context');
        expect(modifySettings).not.toHaveBeenCalled();

        const results = /** @type {unknown} */ (await modify.call(context, {targets: [destinationChange], source: 'test'}, {
            url: 'chrome-extension://abcdefghijklmnop/settings.html',
        }));
        const {targets: appliedTargets} = captured;
        expect(appliedTargets).not.toBeNull();
        if (appliedTargets === null) { throw new Error('Expected settings mutations'); }
        expect(appliedTargets.map(({path}) => path)).toStrictEqual([
            String.raw`sottaku["apiBase\Url"]`,
            'sottaku.authToken',
            'sottaku.refreshToken',
            'sottaku.user',
        ]);
        expect(appliedTargets.map(({value}) => value)).toStrictEqual([
            'https://staging.sottaku.app/api/v1',
            '',
            '',
            null,
        ]);
        expect(results).toStrictEqual([{result: String.raw`sottaku["apiBase\Url"]`}]);
    });

    test('keeps the production audio CDN in media CSP without granting it API access', () => {
        const manifestVariants = /** @type {{manifest: {host_permissions: string[], content_security_policy: {extension_pages: string}}}} */ (parseJson(readFileSync(
            new URL('../dev/data/manifest-variants.json', import.meta.url),
            'utf8',
        )));
        const {manifest} = manifestVariants;

        expect(manifest.host_permissions).toStrictEqual([
            'https://sottaku.app/*',
            'https://staging.sottaku.app/*',
            'https://cdn.sottaku.app/*',
        ]);
        expect(manifest.content_security_policy.extension_pages).toContain(
            'media-src \'self\' blob: https://sottaku.app https://staging.sottaku.app https://cdn.sottaku.app;',
        );
        expect(manifest.content_security_policy.extension_pages).toContain(
            'connect-src \'self\' https://sottaku.app https://staging.sottaku.app https://cdn.sottaku.app',
        );
    });

    test('allows same-extension popup previews without allowing web origins to frame extension pages', () => {
        const manifestUtil = new ManifestUtil();

        for (const {name} of manifestUtil.getVariants()) {
            const {content_security_policy: contentSecurityPolicy} = /** @type {{content_security_policy: string | {extension_pages: string}}} */ (manifestUtil.getManifest(name));
            const extensionPages = (
                typeof contentSecurityPolicy === 'string' ?
                contentSecurityPolicy :
                contentSecurityPolicy.extension_pages
            );

            expect(extensionPages).toContain("frame-ancestors 'self'");
            expect(extensionPages).not.toContain("frame-ancestors 'none'");
        }
    });

    test('exposes the complete content-script module graph through stable extension URLs', () => {
        const manifestUtil = new ManifestUtil();
        const requiredResources = getExtensionModuleGraph('js/app/content-script-main.js');

        for (const {name} of manifestUtil.getVariants()) {
            const {web_accessible_resources: webAccessibleResources} = /** @type {{web_accessible_resources: Array<{resources: string[], use_dynamic_url?: boolean}>}} */ (manifestUtil.getManifest(name));
            const resourceEntry = webAccessibleResources[0];
            const exposedResources = new Set(resourceEntry.resources);
            const missingResources = [...requiredResources].filter((resource) => !exposedResources.has(resource));

            expect(missingResources).toStrictEqual([]);
            expect(resourceEntry.use_dynamic_url).not.toBe(true);
        }
    });
});
