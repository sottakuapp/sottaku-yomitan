/*
 * Copyright (C) 2025  Sottaku Inc
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

// Generated from asgi_app/data/study_languages.json. Do not edit by hand.
export const SOTTAKU_SUPPORTED_LANGUAGES = ['ja', 'ko', 'zh', 'en', 'es', 'de', 'fr', 'it', 'ru', 'la'];

export const SOTTAKU_ADMIN_PREVIEW_LANGUAGES = ['vi', 'pt', 'ar', 'he', 'hi'];

export const SOTTAKU_KNOWN_LANGUAGES = [...SOTTAKU_SUPPORTED_LANGUAGES, ...SOTTAKU_ADMIN_PREVIEW_LANGUAGES];

/** @type {Readonly<Record<string, string>>} */
export const SOTTAKU_LANGUAGE_FLAGS = Object.freeze({
    ja: '🇯🇵',
    ko: '🇰🇷',
    zh: '🇨🇳',
    en: '🇺🇸',
    es: '🇪🇸',
    de: '🇩🇪',
    fr: '🇫🇷',
    it: '🇮🇹',
    ru: '🇷🇺',
    la: '🏛️',
    vi: '🇻🇳',
    pt: '🇧🇷',
    ar: '🇸🇦',
    he: '🇮🇱',
    hi: '🇮🇳',
});
