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

import {ObjectPropertyAccessor} from '../general/object-property-accessor.js';

const DANGEROUS_SETTING_PATH_SEGMENTS = new Set([
    '__proto__',
    'prototype',
    'constructor',
]);

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
 * Parses settings paths with the same parser used to read and mutate the
 * settings object. Keeping a single parser is security-sensitive: quoted
 * bracket properties can contain escapes which must resolve identically at
 * the authorization and access layers.
 * @param {string} path
 * @returns {(string|number)[]}
 * @throws {Error}
 */
function parseSettingPath(path) {
    if (typeof path !== 'string') { throw new Error('Invalid path'); }
    return ObjectPropertyAccessor.getPathArray(path);
}

/**
 * Parses and validates a path supplied by an untrusted extension context.
 * Validation intentionally happens after canonical parsing so escaped quoted
 * properties cannot disguise a dangerous segment.
 * @param {string} path
 * @returns {(string|number)[]}
 * @throws {Error}
 */
export function getUntrustedSettingPathArray(path) {
    const parts = parseSettingPath(path);
    for (const part of parts) {
        if (typeof part === 'string' && DANGEROUS_SETTING_PATH_SEGMENTS.has(part)) {
            throw new Error('Dangerous setting path');
        }
    }
    return parts;
}

/**
 * @param {(string|number)[]} parts
 * @returns {boolean}
 */
function isSottakuCredentialSettingPathArray(parts) {
    const sottakuIndex = parts.lastIndexOf('sottaku');
    if (sottakuIndex < 0) { return false; }
    return parts.slice(sottakuIndex + 1).some((part) => part === 'authToken' || part === 'refreshToken');
}

/**
 * @param {(string|number)[]} parts
 * @returns {boolean}
 */
function isSottakuCredentialDestinationSettingPathArray(parts) {
    const sottakuIndex = parts.lastIndexOf('sottaku');
    return (
        sottakuIndex >= 0 &&
        parts.length === sottakuIndex + 2 &&
        parts[sottakuIndex + 1] === 'apiBaseUrl'
    );
}

/**
 * @param {string} path
 * @returns {boolean}
 */
export function isSottakuCredentialSettingPath(path) {
    return isSottakuCredentialSettingPathArray(parseSettingPath(path));
}

/**
 * The API base URL is part of the credential boundary: changing it while
 * credentials remain stored changes where those credentials will be sent.
 * @param {string} path
 * @returns {boolean}
 */
export function isSottakuCredentialDestinationSettingPath(path) {
    return isSottakuCredentialDestinationSettingPathArray(parseSettingPath(path));
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
        if (typeof pathValue !== 'string') { continue; }
        let parts;
        try {
            parts = parseSettingPath(pathValue);
        } catch (e) {
            // The actual mutation layer will report malformed trusted paths.
            continue;
        }
        if (!isSottakuCredentialDestinationSettingPathArray(parts)) { continue; }
        const parentParts = parts.slice(0, -1);
        for (const field of ['authToken', 'refreshToken', 'user']) {
            result.add(ObjectPropertyAccessor.getPathString([...parentParts, field]));
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
    const parts = parseSettingPath(path);
    if (isSottakuCredentialSettingPathArray(parts)) { return ''; }
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
        .filter((value) => typeof value !== 'undefined');
    if (pathValues.length === 0) { return true; }

    for (const pathValue of pathValues) {
        if (typeof pathValue !== 'string') { return true; }
        let parts;
        try {
            parts = getUntrustedSettingPathArray(pathValue);
        } catch (e) {
            // Mutations from untrusted contexts must fail closed whenever the
            // canonical settings parser cannot understand a supplied path or
            // it contains a prototype-manipulation segment.
            return true;
        }
        if (
            isSottakuCredentialSettingPathArray(parts) ||
            isSottakuCredentialDestinationSettingPathArray(parts)
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

    /** @type {Set<unknown>} */
    const visited = new Set();
    /**
     * @param {unknown} value
     * @returns {boolean}
     */
    const containsProtectedObject = (value) => {
        if (typeof value !== 'object' || value === null) { return false; }
        if (visited.has(value)) { return true; }
        visited.add(value);
        const objectValue = /** @type {Record<string, unknown>} */ (value);
        for (const [key, nestedValue] of Object.entries(objectValue)) {
            if (DANGEROUS_SETTING_PATH_SEGMENTS.has(key)) { return true; }
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
            if (containsProtectedObject(nestedValue)) { return true; }
        }
        visited.delete(value);
        return false;
    };
    return containsProtectedObject(target?.value) || containsProtectedObject(target?.items);
}
