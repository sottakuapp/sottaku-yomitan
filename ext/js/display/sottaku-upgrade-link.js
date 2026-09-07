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

import {localizeElement} from '../dom/i18n.js';
import {isMobileSafari} from '../extension/safari-platform.js';

/**
 * iPhone/iPad Safari opens the containing app's existing StoreKit screen.
 * The link carries only a navigation intent; it never starts a purchase.
 * @param {Document} document
 * @param {{browser: import('environment').Browser, platform: {os: string}}} environment
 */
export function configureSottakuUpgradeLink(document, environment) {
    if (!isMobileSafari(environment)) { return; }
    const link = document.querySelector('#sottaku-upgrade-required a');
    if (!(link instanceof HTMLAnchorElement)) { return; }
    link.href = 'sottaku://upgrade';
    link.dataset.i18n = 'popup_open_sottaku';
    localizeElement(link);
}
