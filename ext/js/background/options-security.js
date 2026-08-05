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

/**
 * Returns true only for an extension-owned page. Content scripts have the
 * extension ID as their sender ID too, but their sender URL is the website
 * they are injected into and must not receive persisted bearer credentials.
 * @param {chrome.runtime.MessageSender|undefined} sender
 * @param {string} extensionRootUrl
 * @returns {boolean}
 */
export function isTrustedExtensionPageSender(sender, extensionRootUrl) {
    const senderUrl = typeof sender?.url === 'string' ? sender.url : '';
    if (!senderUrl) { return false; }
    try {
        const senderLocation = new URL(senderUrl);
        const extensionRoot = new URL(extensionRootUrl);
        const trustedProtocols = new Set([
            'chrome-extension:',
            'moz-extension:',
            'safari-web-extension:',
        ]);
        return (
            trustedProtocols.has(extensionRoot.protocol) &&
            senderLocation.protocol === extensionRoot.protocol &&
            senderLocation.host === extensionRoot.host
        );
    } catch (e) {
        return false;
    }
}

/**
 * @template T
 * @param {T} options
 * @returns {T}
 */
export function redactSottakuCredentialsFromProfileOptions(options) {
    if (typeof options !== 'object' || options === null) { return options; }
    const objectOptions = /** @type {Record<string, unknown>} */ (options);
    const sottakuValue = objectOptions.sottaku;
    const sottaku = typeof sottakuValue === 'object' && sottakuValue !== null ? sottakuValue : {};
    return /** @type {T} */ ({
        ...objectOptions,
        sottaku: {
            ...sottaku,
            authToken: '',
            refreshToken: '',
        },
    });
}

/**
 * @template T
 * @param {T} options
 * @returns {T}
 */
export function redactSottakuCredentialsFromOptions(options) {
    if (typeof options !== 'object' || options === null) { return options; }
    const objectOptions = /** @type {Record<string, unknown>} */ (options);
    if (!Array.isArray(objectOptions.profiles)) { return options; }
    const profiles = /** @type {unknown[]} */ (objectOptions.profiles);
    return /** @type {T} */ ({
        ...objectOptions,
        profiles: profiles.map((profileValue) => {
            if (typeof profileValue !== 'object' || profileValue === null) { return profileValue; }
            const profile = /** @type {Record<string, unknown>} */ (profileValue);
            return {
                ...profile,
                options: redactSottakuCredentialsFromProfileOptions(profile.options),
            };
        }),
    });
}

/**
 * @param {string} path
 * @returns {string[]}
 */
function normalizeSettingPath(path) {
    return String(path || '')
        .replace(/\[(?:"|')?([^\]"']+)(?:"|')?\]/gu, '.$1')
        .split('.')
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
}

/**
 * @param {string} path
 * @returns {boolean}
 */
export function isSottakuCredentialSettingPath(path) {
    const parts = normalizeSettingPath(path);
    const sottakuIndex = parts.lastIndexOf('sottaku');
    if (sottakuIndex < 0) { return false; }
    return parts.slice(sottakuIndex + 1).some((part) => part === 'authToken' || part === 'refreshToken');
}

/**
 * The API base URL is part of the credential boundary: changing it while
 * credentials remain stored changes where those credentials will be sent.
 * @param {string} path
 * @returns {boolean}
 */
export function isSottakuCredentialDestinationSettingPath(path) {
    const parts = normalizeSettingPath(path);
    const sottakuIndex = parts.lastIndexOf('sottaku');
    return (
        sottakuIndex >= 0 &&
        parts.length === sottakuIndex + 2 &&
        parts[sottakuIndex + 1] === 'apiBaseUrl'
    );
}

/**
 * @param {string[]} parts
 * @returns {string}
 */
function createSettingPath(parts) {
    let result = '';
    for (const part of parts) {
        if (/^(?:0|[1-9][0-9]*)$/u.test(part)) {
            result += `[${part}]`;
        } else if (/^[A-Za-z_][A-Za-z0-9_]*$/u.test(part)) {
            result += result.length === 0 ? part : `.${part}`;
        } else {
            const escaped = part.replace(/["\\]/gu, '\\$&');
            result += `["${escaped}"]`;
        }
    }
    return result;
}

/**
 * Returns the credential fields which must be cleared atomically when a
 * direct API-destination mutation is accepted from a trusted settings page.
 * @param {{path?: unknown, path1?: unknown, path2?: unknown}} target
 * @returns {string[]}
 */
export function getSottakuCredentialResetPathsForApiBaseUrlMutation(target) {
    const result = new Set();
    for (const pathValue of [target?.path, target?.path1, target?.path2]) {
        if (typeof pathValue !== 'string' || !isSottakuCredentialDestinationSettingPath(pathValue)) { continue; }
        const parts = normalizeSettingPath(pathValue);
        const parentParts = parts.slice(0, -1);
        for (const field of ['authToken', 'refreshToken', 'user']) {
            result.add(createSettingPath([...parentParts, field]));
        }
    }
    return [...result];
}

/**
 * Redacts credentials from arbitrary setting result shapes, including global
 * profile arrays returned through getSettings.
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function redactSottakuCredentialsDeep(value) {
    if (Array.isArray(value)) {
        return /** @type {T} */ (value.map((item) => redactSottakuCredentialsDeep(item)));
    }
    if (typeof value !== 'object' || value === null) { return value; }

    /** @type {Record<string, unknown>} */
    const result = {};
    const objectValue = /** @type {Record<string, unknown>} */ (value);
    for (const [key, nestedValue] of Object.entries(objectValue)) {
        if (key === 'sottaku' && typeof nestedValue === 'object' && nestedValue !== null) {
            const sottaku = /** @type {Record<string, unknown>} */ (nestedValue);
            result[key] = redactSottakuCredentialsDeep({
                ...sottaku,
                authToken: '',
                refreshToken: '',
            });
        } else {
            result[key] = redactSottakuCredentialsDeep(nestedValue);
        }
    }
    return /** @type {T} */ (result);
}

/**
 * Redacts a getSettings result with awareness of the requested path. A direct
 * request for `sottaku` returns the block itself, so a purely recursive search
 * would otherwise miss that the root object carries credentials.
 * @param {string} path
 * @param {unknown} value
 * @returns {unknown}
 */
export function redactSottakuCredentialsForSettingResult(path, value) {
    if (isSottakuCredentialSettingPath(path)) { return ''; }
    const parts = normalizeSettingPath(path);
    if (parts.at(-1) === 'sottaku' && typeof value === 'object' && value !== null) {
        const sottaku = /** @type {Record<string, unknown>} */ (value);
        return {
            ...sottaku,
            authToken: '',
            refreshToken: '',
        };
    }
    return redactSottakuCredentialsDeep(value);
}

/**
 * @param {{action?: unknown, path?: unknown, path1?: unknown, path2?: unknown, value?: unknown, items?: unknown}} target
 * @returns {boolean}
 */
export function settingMutationTouchesSottakuCredentials(target) {
    const pathValues = [target?.path, target?.path1, target?.path2]
        .filter((value) => typeof value === 'string');
    if (pathValues.length === 0) { return true; }

    for (const path of pathValues) {
        const parts = normalizeSettingPath(path);
        if (
            isSottakuCredentialSettingPath(path) ||
            isSottakuCredentialDestinationSettingPath(path)
        ) {
            return true;
        }

        // Replacing an entire Sottaku block, profile list, or options root can
        // overwrite credentials even if the supplied value omits the secret keys.
        const lastPart = parts.at(-1);
        const isProfileAncestorReplacement = (
            parts[0] === 'profiles' && (
                // Replacing profiles[0] or profiles[0].options can erase the
                // credential-bearing Sottaku subtree even when the replacement
                // value contains no explicit secret properties.
                parts.length === 2 ||
                lastPart === 'options'
            )
        );
        if (
            parts.length === 0 ||
            lastPart === 'sottaku' ||
            lastPart === 'profiles' ||
            isProfileAncestorReplacement
        ) {
            return true;
        }
    }

    /**
     * @param {unknown} value
     * @returns {boolean}
     */
    const containsCredentialObject = (value) => {
        if (Array.isArray(value)) { return value.some(containsCredentialObject); }
        if (typeof value !== 'object' || value === null) { return false; }
        const objectValue = /** @type {Record<string, unknown>} */ (value);
        for (const [key, nestedValue] of Object.entries(objectValue)) {
            if (
                key === 'sottaku' &&
                typeof nestedValue === 'object' &&
                nestedValue !== null &&
                (
                    Object.prototype.hasOwnProperty.call(nestedValue, 'authToken') ||
                    Object.prototype.hasOwnProperty.call(nestedValue, 'refreshToken')
                )
            ) {
                return true;
            }
            if (containsCredentialObject(nestedValue)) { return true; }
        }
        return false;
    };
    return containsCredentialObject(target?.value) || containsCredentialObject(target?.items);
}
