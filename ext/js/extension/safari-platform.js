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
 * Includes iPad desktop mode, which can report macOS to the extension API.
 * @param {{browser: import('environment').Browser, platform: {os: string}}} environment
 * @returns {boolean}
 */
export function isMobileSafari(environment) {
    const isSafari = (
        environment.browser === 'safari' ||
        (typeof location !== 'undefined' && location.protocol === 'safari-web-extension:')
    );
    if (!isSafari) { return false; }
    const os = environment.platform.os.toLowerCase();
    if (os === 'ios' || os === 'ipados') { return true; }
    if (typeof navigator === 'undefined') { return false; }
    const {userAgent, platform, maxTouchPoints} = navigator;
    if (typeof userAgent === 'string' && /\b(?:iPad|iPhone|iPod)\b/u.test(userAgent)) { return true; }
    return platform === 'MacIntel' && maxTouchPoints > 1;
}
