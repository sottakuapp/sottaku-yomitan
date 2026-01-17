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

const DEFAULT_LOCALE = 'en';
const SUPPORTED_LOCALES = new Set([
    'en',
    'zh_CN',
    'zh_TW',
    'hi',
    'es',
    'ar',
    'fr',
    'pt',
    'ru',
    'id',
    'de',
    'ja',
    'vi',
    'tl',
    'ko',
    'th',
    'it',
]);
const LOCALE_ALIASES = new Map([
    ['zh-cn', 'zh_CN'],
    ['zh_cn', 'zh_CN'],
    ['zh-hans', 'zh_CN'],
    ['zh_hans', 'zh_CN'],
    ['zh-hans-cn', 'zh_CN'],
    ['zh_hans_cn', 'zh_CN'],
    ['zh-tw', 'zh_TW'],
    ['zh_tw', 'zh_TW'],
    ['zh-hant', 'zh_TW'],
    ['zh_hant', 'zh_TW'],
    ['zh-hant-tw', 'zh_TW'],
    ['zh_hant_tw', 'zh_TW'],
    ['zh', 'zh_CN'],
    ['fil', 'tl'],
    ['fil-ph', 'tl'],
    ['fil_ph', 'tl'],
]);

/** @type {Map<string, Promise<Record<string, {message: string}>>|Record<string, {message: string}>>} */
const localeCache = new Map();
/** @type {string|null} */
let activeLocale = null;
/** @type {Record<string, {message: string}>|null} */
let activeMessages = null;
/** @type {Record<string, {message: string}>|null} */
let fallbackMessages = null;

/**
 * @param {string} locale
 * @returns {string}
 */
function normalizeLocale(locale) {
    if (typeof locale !== 'string') { return ''; }
    const raw = locale.trim();
    if (raw.length === 0) { return ''; }
    const normalized = raw.replace(/-/g, '_');
    const alias = LOCALE_ALIASES.get(normalized.toLowerCase());
    if (alias) { return alias; }
    const parts = normalized.split('_');
    const language = parts[0].toLowerCase();
    const region = (parts.length > 1 ? parts[1].toUpperCase() : '');
    const combined = region ? `${language}_${region}` : language;
    if (SUPPORTED_LOCALES.has(combined)) { return combined; }
    if (SUPPORTED_LOCALES.has(language)) { return language; }
    return '';
}

/**
 * @param {string} locale
 * @returns {Promise<Record<string, {message: string}>|null>}
 */
async function loadMessages(locale) {
    const cached = localeCache.get(locale);
    if (cached) { return await cached; }
    const loader = (async () => {
        const runtime = (typeof chrome !== 'undefined' && chrome.runtime) ? chrome.runtime : null;
        if (!runtime || typeof runtime.getURL !== 'function') { return null; }
        const url = runtime.getURL(`/_locales/${locale}/messages.json`);
        try {
            const response = await fetch(url, {cache: 'force-cache'});
            if (!response.ok) { return null; }
            const data = await response.json();
            return (data && typeof data === 'object') ? /** @type {Record<string, {message: string}>} */ (data) : null;
        } catch {
            return null;
        }
    })();
    localeCache.set(locale, loader);
    const result = await loader;
    if (result !== null) {
        localeCache.set(locale, result);
    }
    return result;
}

/**
 * @param {string} message
 * @param {string[]|string|undefined} substitutions
 * @returns {string}
 */
function applySubstitutions(message, substitutions) {
    if (!substitutions) { return message; }
    const values = Array.isArray(substitutions) ? substitutions : [substitutions];
    let result = message.replace(/\$\$/g, '\u0000');
    result = result.replace(/\$(\d+)/g, (_, index) => {
        const value = values[Number(index) - 1];
        return (typeof value === 'string') ? value : '';
    });
    return result.replace(/\u0000/g, '$');
}

/**
 * @param {string} key
 * @param {string[]|string|undefined} substitutions
 * @returns {string}
 */
export function getMessage(key, substitutions) {
    if (typeof key !== 'string' || key.length === 0) { return ''; }
    let message = activeMessages?.[key]?.message;
    if (!message) {
        message = fallbackMessages?.[key]?.message;
    }
    if (!message) {
        if (typeof chrome === 'undefined' || !chrome.i18n || typeof chrome.i18n.getMessage !== 'function') {
            return '';
        }
        const fallback = chrome.i18n.getMessage(key, substitutions);
        return typeof fallback === 'string' ? fallback : '';
    }
    return applySubstitutions(message, substitutions);
}

/**
 * @param {string} locale
 * @returns {Promise<{changed: boolean, locale: (string|null)}>}
 */
export async function setLocale(locale) {
    const resolved = normalizeLocale(locale);
    if (!resolved) { return {changed: false, locale: null}; }
    if (activeLocale === resolved && activeMessages !== null) {
        return {changed: false, locale: resolved};
    }
    const [messages, fallback] = await Promise.all([
        loadMessages(resolved),
        fallbackMessages === null ? loadMessages(DEFAULT_LOCALE) : Promise.resolve(fallbackMessages),
    ]);
    if (fallbackMessages === null && fallback) {
        fallbackMessages = fallback;
    }
    if (messages === null) {
        return {changed: false, locale: null};
    }
    activeLocale = resolved;
    activeMessages = messages;
    return {changed: true, locale: resolved};
}

/**
 * @param {HTMLElement} element
 * @returns {string[]|string|undefined}
 */
function parseArgs(element) {
    const raw = element.dataset.i18nArgs;
    if (typeof raw !== 'string' || raw.length === 0) { return undefined; }
    try {
        return /** @type {string[]|string} */ (JSON.parse(raw));
    } catch {
        if (raw.includes('|')) {
            return raw.split('|');
        }
        return raw;
    }
}

/**
 * @param {Element|Document|DocumentFragment} root
 */
export function localizeElement(root) {
    /** @type {Element|Document|DocumentFragment|null} */
    const rootNode = root || null;
    if (rootNode === null) { return; }

    /** @type {Element[]} */
    const elements = [];
    if (rootNode instanceof Element) {
        if (rootNode.matches('[data-i18n], [data-i18n-html], [data-i18n-attr]')) {
            elements.push(rootNode);
        }
        elements.push(...rootNode.querySelectorAll('[data-i18n], [data-i18n-html], [data-i18n-attr]'));
    } else {
        elements.push(...rootNode.querySelectorAll('[data-i18n], [data-i18n-html], [data-i18n-attr]'));
    }

    for (const element of elements) {
        const args = parseArgs(element);
        const key = element.dataset.i18n;
        if (typeof key === 'string') {
            const message = getMessage(key, args);
            if (message) { element.textContent = message; }
        }
        const htmlKey = element.dataset.i18nHtml;
        if (typeof htmlKey === 'string') {
            const message = getMessage(htmlKey, args);
            if (message) { element.innerHTML = message; }
        }
        const attrMapping = element.dataset.i18nAttr;
        if (typeof attrMapping === 'string') {
            const mappings = attrMapping.split(',').map((item) => item.trim()).filter((item) => item.length > 0);
            for (const mapping of mappings) {
                const [attr, attrKey] = mapping.split(':').map((item) => item.trim());
                if (!attr || !attrKey) { continue; }
                const message = getMessage(attrKey, args);
                if (message) { element.setAttribute(attr, message); }
            }
        }
    }

    if (rootNode instanceof Document || rootNode instanceof DocumentFragment || rootNode instanceof Element) {
        for (const template of /** @type {NodeListOf<HTMLTemplateElement>} */ (rootNode.querySelectorAll('template'))) {
            localizeElement(template.content);
        }
    }
}
