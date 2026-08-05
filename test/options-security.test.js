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

import {readFileSync} from 'node:fs';
import {describe, expect, test, vi} from 'vitest';
import {Backend} from '../ext/js/background/backend.js';
import {parseJson} from '../ext/js/core/json.js';
import {
    getSottakuCredentialResetPathsForApiBaseUrlMutation,
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
            path: 'sottaku.apiBaseUrl',
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
            'sottaku.apiBaseUrl',
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
        expect(results).toStrictEqual([{result: 'sottaku.apiBaseUrl'}]);
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
});
