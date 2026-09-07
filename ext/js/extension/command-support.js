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
 * Command enumeration in our iOS Safari popup triggers rejected native IPC and
 * terminates its web process despite the exposed API. Avoid that call rather
 * than relying on method presence or catching a JavaScript exception.
 * iPad desktop mode may report macOS, so include its touch-capable Mac identity.
 * @param {{browser: import('environment').Browser, platform: {os: string}}} environment
 * @returns {boolean}
 */
export function supportsExtensionCommands(environment) {
    const isSafari = (
        environment.browser === 'safari' ||
        (typeof location !== 'undefined' && location.protocol === 'safari-web-extension:')
    );
    if (!isSafari) { return true; }
    const os = environment.platform.os.toLowerCase();
    if (os === 'ios' || os === 'ipados') { return false; }
    if (typeof navigator === 'undefined') { return true; }
    const {userAgent, platform, maxTouchPoints} = navigator;
    if (typeof userAgent === 'string' && /\b(?:iPad|iPhone|iPod)\b/u.test(userAgent)) { return false; }
    return !(platform === 'MacIntel' && maxTouchPoints > 1);
}
