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

/*
 * Sottaku API helper used for authentication, dictionary search, flashcards,
 * and word requests.
 */

import {parseJson, readResponseJson} from '../core/json.js';
import {toError} from '../core/to-error.js';

const SHARED_REQUEST_CACHE = new Map();
const SHARED_INFLIGHT_REQUESTS = new Map();

const STATIC_SETTINGS_CACHE_TTL_MS = 5 * 60 * 1000;
const SHARED_SCAN_CACHE_TTL_MS = 10 * 1000;

const REQUEST_CACHE_TTLS = new Map([
    ['GET /profile/language-settings', STATIC_SETTINGS_CACHE_TTL_MS],
    ['GET /profile/settings', STATIC_SETTINGS_CACHE_TTL_MS],
    ['GET /dictionary/supported-languages', STATIC_SETTINGS_CACHE_TTL_MS],
    ['POST /dictionary/yomitan-scan', SHARED_SCAN_CACHE_TTL_MS],
]);
const AUTH_COOKIE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;
const SIGNED_SESSION_TOKEN_PREFIX = 'st1.';

/**
 * @param {unknown} message
 * @returns {Promise<unknown>}
 */
function sendRuntimeMessagePromise(message) {
    if (!(typeof chrome === 'object' && chrome !== null && chrome.runtime && typeof chrome.runtime.sendMessage === 'function')) {
        return Promise.resolve(void 0);
    }
    return new Promise((resolve, reject) => {
        try {
            chrome.runtime.sendMessage(message, (response) => {
                const error = chrome.runtime.lastError;
                if (error) {
                    reject(new Error(error.message));
                } else {
                    resolve(response);
                }
            });
        } catch (e) {
            reject(toError(e));
        }
    });
}

/**
 * @param {string} value
 * @returns {string}
 */
function decodeBase64Url(value) {
    try {
        const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
        const binary = globalThis.atob(padded);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; ++i) {
            bytes[i] = binary.charCodeAt(i);
        }
        return new TextDecoder().decode(bytes);
    } catch (e) {
        return '';
    }
}

/**
 * Signed session tokens are intentionally short-lived; store the durable origin
 * token embedded by the server so extension storage and cookies do not expire
 * every signed-token TTL.
 * @param {string} token
 * @returns {string}
 */
function extractOriginTokenFromSignedSessionToken(token) {
    if (!token.startsWith(SIGNED_SESSION_TOKEN_PREFIX)) { return ''; }
    const parts = token.split('.');
    if (parts.length !== 3) { return ''; }
    try {
        const payloadRaw = parseJson(decodeBase64Url(parts[1]));
        const payload = (
            payloadRaw !== null &&
            typeof payloadRaw === 'object' &&
            !Array.isArray(payloadRaw)
        ) ?
            /** @type {{t?: unknown}} */ (payloadRaw) :
            null;
        const originToken = typeof payload?.t === 'string' ? payload.t.trim() : '';
        return originToken || '';
    } catch (e) {
        return '';
    }
}

/**
 * @param {unknown} token
 * @returns {string}
 */
function normalizeAuthTokenForStorage(token) {
    const value = typeof token === 'string' ? token.trim() : '';
    if (!value) { return ''; }
    return extractOriginTokenFromSignedSessionToken(value) || value;
}

/**
 * @param {string} method
 * @param {string} path
 * @returns {number}
 */
function getRequestCacheTtlMs(method, path) {
    return REQUEST_CACHE_TTLS.get(`${method.toUpperCase()} ${path}`) || 0;
}

/**
 * @param {unknown} value
 * @returns {any}
 */
function cloneCachedValue(value) {
    if (typeof globalThis.structuredClone === 'function') {
        return globalThis.structuredClone(value);
    }
    return parseJson(JSON.stringify(value));
}

/**
 * @param {string} requestKey
 * @returns {any|null}
 */
function getSharedCachedValue(requestKey) {
    const entry = SHARED_REQUEST_CACHE.get(requestKey);
    if (!entry) { return null; }
    if (Date.now() >= entry.expiresAt) {
        SHARED_REQUEST_CACHE.delete(requestKey);
        return null;
    }
    SHARED_REQUEST_CACHE.delete(requestKey);
    SHARED_REQUEST_CACHE.set(requestKey, entry);
    return cloneCachedValue(entry.value);
}

/**
 * @param {string} requestKey
 * @param {unknown} value
 * @param {number} ttlMs
 * @returns {void}
 */
function setSharedCachedValue(requestKey, value, ttlMs) {
    if (ttlMs <= 0) { return; }
    SHARED_REQUEST_CACHE.set(requestKey, {
        expiresAt: Date.now() + ttlMs,
        value: cloneCachedValue(value),
    });
}

export class SottakuClient {
    /**
     * @param {{apiBaseUrl?: string, authToken?: string, cookieDomain?: string, onAuthTokenUpdated?: ((details: {apiBaseUrl: string, oldToken: string, newToken: string}) => (void|Promise<void>))|null, onAuthTokenInvalidated?: ((details: {apiBaseUrl: string, oldToken: string}) => (void|Promise<void>))|null}} [options]
     */
    constructor(options = {}) {
        /** @type {string} */
        this._apiBaseUrl = options.apiBaseUrl || 'https://sottaku.app/api/v1';
        /** @type {string} */
        this._authToken = normalizeAuthTokenForStorage(options.authToken);
        /** @type {string} */
        this._cookieDomain = options.cookieDomain || this._getOrigin(this._apiBaseUrl);
        /** @type {((details: {apiBaseUrl: string, oldToken: string, newToken: string}) => (void|Promise<void>))|null} */
        this._onAuthTokenUpdated = typeof options.onAuthTokenUpdated === 'function' ? options.onAuthTokenUpdated : null;
        /** @type {((details: {apiBaseUrl: string, oldToken: string}) => (void|Promise<void>))|null} */
        this._onAuthTokenInvalidated = typeof options.onAuthTokenInvalidated === 'function' ? options.onAuthTokenInvalidated : null;
    }

    /** @returns {string} */
    get apiBaseUrl() {
        return this._apiBaseUrl;
    }

    /** @returns {string} */
    get authToken() {
        return this._authToken;
    }

    /**
     * @param {{apiBaseUrl?: string, authToken?: string, cookieDomain?: string, onAuthTokenUpdated?: ((details: {apiBaseUrl: string, oldToken: string, newToken: string}) => (void|Promise<void>))|null, onAuthTokenInvalidated?: ((details: {apiBaseUrl: string, oldToken: string}) => (void|Promise<void>))|null}} options
     */
    setConfig(options) {
        if (typeof options.apiBaseUrl === 'string' && options.apiBaseUrl.length > 0) {
            this._apiBaseUrl = options.apiBaseUrl;
        }
        if (typeof options.authToken === 'string') {
            this._authToken = normalizeAuthTokenForStorage(options.authToken);
        }
        if (typeof options.cookieDomain === 'string' && options.cookieDomain.length > 0) {
            this._cookieDomain = options.cookieDomain;
        }
        if ('onAuthTokenUpdated' in options) {
            this._onAuthTokenUpdated = typeof options.onAuthTokenUpdated === 'function' ? options.onAuthTokenUpdated : null;
        }
        if ('onAuthTokenInvalidated' in options) {
            this._onAuthTokenInvalidated = typeof options.onAuthTokenInvalidated === 'function' ? options.onAuthTokenInvalidated : null;
        }
    }

    /**
     * @param {string} username
     * @param {string} password
     * @returns {Promise<{token: string, user: unknown}>}
     */
    async loginWithPassword(username, password) {
        const data = await this._request('/login', {
            method: 'POST',
            body: {username, email: username, password},
            auth: false,
        });
        if (typeof data?.token === 'string') {
            const token = normalizeAuthTokenForStorage(data.token);
            this._authToken = token;
            await this._persistAuthTokenCookie(token);
            if (token !== data.token && data && typeof data === 'object') {
                return {...data, token};
            }
        }
        return data;
    }

    /**
     * Uses an existing browser session (for example, after completing OAuth in a tab)
     * to pull the api_token cookie from the Sottaku origin.
     * @returns {Promise<string|null>}
     */
    async syncTokenFromCookies() {
        try {
            const tokens = await this._getCookieAuthTokenCandidates();
            const token = tokens[0] || null;
            if (token) {
                this._authToken = token;
                await this._persistAuthTokenCookie(token);
                return token;
            }
        } catch (e) {
            throw toError(e);
        }
        return null;
    }

    /**
     * @param {string} oldToken
     * @param {string} newToken
     * @returns {Promise<void>}
     */
    async _notifyAuthTokenUpdated(oldToken, newToken) {
        if (!(typeof oldToken === 'string' && oldToken.length > 0 && typeof newToken === 'string' && newToken.length > 0 && oldToken !== newToken)) {
            return;
        }
        if (this._onAuthTokenUpdated) {
            await this._onAuthTokenUpdated({apiBaseUrl: this._apiBaseUrl, oldToken, newToken});
            return;
        }
        try {
            await sendRuntimeMessagePromise({
                action: 'sottakuAuthTokenUpdate',
                params: {apiBaseUrl: this._apiBaseUrl, oldToken, newToken},
            });
        } catch (e) {
            // Best-effort only.
        }
    }

    /**
     * @param {string} oldToken
     * @returns {Promise<void>}
     */
    async _notifyAuthTokenInvalidated(oldToken) {
        if (!(typeof oldToken === 'string' && oldToken.length > 0)) {
            return;
        }
        if (this._onAuthTokenInvalidated) {
            await this._onAuthTokenInvalidated({apiBaseUrl: this._apiBaseUrl, oldToken});
            return;
        }
        try {
            await sendRuntimeMessagePromise({
                action: 'sottakuAuthTokenInvalidate',
                params: {apiBaseUrl: this._apiBaseUrl, oldToken},
            });
        } catch (e) {
            // Best-effort only.
        }
    }

    /**
     * @param {string} query
     * @param {string|string[]} language
     * @param {string} [locale]
     * @returns {Promise<unknown>}
     */
    async search(query, language, locale) {
        return await this._request('/dictionary/search', {
            method: 'POST',
            body: {query, language, locale},
        });
    }

    /**
     * Optimized scan endpoint tailored for Sottaku-Yomitan lookups.
     * @param {string} text
     * @param {string} language
     * @param {number} [maxResults]
     * @param {string} [locale]
     * @param {{hanziDisplay?: string, chineseReadingDisplay?: string, chineseToneColors?: boolean}} [displayPreferences]
     * @returns {Promise<{results: any[], originalTextLength: number, displayPreferences: unknown | null, languageResults?: {language: string, results: any[], originalTextLength: number}[] | null}>}
     */
    async scan(text, language, maxResults, locale, displayPreferences) {
        /** @type {Record<string, any>} */
        const body = {text};
        if (Array.isArray(language)) {
            body.languages = language;
        } else if (typeof language === 'string') {
            body.language = language;
        }
        if (Number.isFinite(maxResults)) {
            body.maxResults = maxResults;
        }
        if (typeof locale === 'string') {
            const trimmed = locale.trim();
            if (trimmed) {
                body.locale = trimmed;
            }
        }
        if (displayPreferences && typeof displayPreferences === 'object') {
            const {hanziDisplay, chineseReadingDisplay, chineseToneColors} = displayPreferences;
            if (typeof hanziDisplay === 'string' && hanziDisplay.trim()) {
                body.hanzi_display = hanziDisplay.trim();
            }
            if (typeof chineseReadingDisplay === 'string' && chineseReadingDisplay.trim()) {
                body.chinese_reading_display = chineseReadingDisplay.trim();
            }
            if (typeof chineseToneColors === 'boolean') {
                body.chinese_tone_colors = chineseToneColors;
            }
        }
        const data = await this._request('/dictionary/yomitan-scan', {
            method: 'POST',
            body,
        });
        const results = Array.isArray(data?.results) ? data.results : [];
        const originalTextLength = (
            typeof data?.original_text_length === 'number' && Number.isFinite(data.original_text_length)
                ? data.original_text_length
                : Math.max(0, (text || '').length)
        );
        const displayPreferencesResponse = (
            data && typeof data === 'object'
                ? (data.display_preferences || data.displayPreferences || null)
                : null
        );
        const rawLanguageResults = (
            data && typeof data === 'object' && Array.isArray(data.language_results) ? data.language_results :
                (data && typeof data === 'object' && Array.isArray(data.languageResults) ? data.languageResults : null)
        );
        const languageResults = Array.isArray(rawLanguageResults) ? rawLanguageResults.reduce((acc, item) => {
            const languageValue = item && typeof item === 'object' ? item.language : null;
            if (typeof languageValue !== 'string' || languageValue.trim().length === 0) { return acc; }
            const resultsValue = Array.isArray(item.results) ? item.results : [];
            const originalTextLengthValue = (
                typeof item.original_text_length === 'number' && Number.isFinite(item.original_text_length)
                    ? item.original_text_length
                    : (
                        typeof item.originalTextLength === 'number' && Number.isFinite(item.originalTextLength)
                            ? item.originalTextLength
                            : Math.max(0, (text || '').length)
                    )
            );
            acc.push({
                language: languageValue,
                results: resultsValue,
                originalTextLength: originalTextLengthValue,
            });
            return acc;
        }, /** @type {{language: string, results: any[], originalTextLength: number}[]} */ ([])) : null;
        return {results, originalTextLength, displayPreferences: displayPreferencesResponse, languageResults};
    }

    /**
     * @param {number[]} wordIds
     * @param {string} language
     * @param {string} [locale]
     * @returns {Promise<Record<string, unknown>>}
     */
    async getWordInfoBatch(wordIds, language, locale) {
        const data = await this._request('/dictionary/word-info-batch', {
            method: 'POST',
            body: {wordIds, language, locale},
        });
        if (data && typeof data === 'object' && 'word_info' in data) {
            const {word_info: wordInfo} = /** @type {{word_info: unknown}} */ (data);
            return (wordInfo && typeof wordInfo === 'object' && !Array.isArray(wordInfo)) ?
                /** @type {Record<string, unknown>} */ (wordInfo) :
                {};
        }
        return {};
    }

    /**
     * @param {number} wordId
     * @param {string} language
     * @param {string} [locale]
     * @returns {Promise<unknown>}
     */
    async getWordInfo(wordId, language, locale) {
        const url = `/dictionary/word/${wordId}`;
        return await this._request(url, {method: 'GET', language, locale});
    }

    /**
     * Fetch audio (with auth) and return an object URL.
     * @param {string} path
     * @param {string} language
     * @returns {Promise<string|null>}
     */
    async fetchAudioAsObjectUrl(path, language) {
        const url = this._resolveUrl(path);
        let retriedAuth = false;
        while (true) {
            const tokenUsed = this._authToken;
            /** @type {RequestInit} */
            const options = {
                method: 'GET',
                credentials: 'include',
                headers: {},
            };
            if (tokenUsed) {
                options.headers = {
                    ...options.headers,
                    'Authorization': `Bearer ${tokenUsed}`,
                };
            }
            const response = await fetch(url, options);
            const rotatedToken = normalizeAuthTokenForStorage(response.headers.get('X-New-Token'));
            if (tokenUsed && rotatedToken && rotatedToken !== tokenUsed) {
                this._authToken = rotatedToken;
                await this._persistAuthTokenCookie(rotatedToken);
                await this._notifyAuthTokenUpdated(tokenUsed, rotatedToken);
            }
            if (response.status === 401 && tokenUsed && !retriedAuth) {
                retriedAuth = true;
                if (rotatedToken && rotatedToken !== tokenUsed) {
                    continue;
                }
                let cookieToken = null;
                try {
                    cookieToken = await this._recoverAuthTokenFromCookies(tokenUsed);
                } catch (e) {
                    cookieToken = null;
                }
                if (cookieToken) {
                    await this._notifyAuthTokenUpdated(tokenUsed, cookieToken);
                    continue;
                }
                this._authToken = '';
                await this._notifyAuthTokenInvalidated(tokenUsed);
                return null;
            }
            if (!response.ok) {
                return null;
            }
            const blob = await response.blob();
            return URL.createObjectURL(blob);
        }
    }

    /**
     * Resolve a path or URL against the current API base.
     * @param {string} path
     * @returns {string}
     */
    _resolveUrl(path) {
        try {
            return new URL(path).href;
        } catch (e) {
            const origin = this._getOrigin(this._apiBaseUrl);
            const trimmedPath = path.startsWith('/') ? path : `/${path}`;
            return `${origin}${trimmedPath}`;
        }
    }

    /**
     * @param {number} questionId
     * @param {string} language
     * @returns {Promise<unknown>}
     */
    async addFlashcard(questionId, language) {
        return await this._request('/flashcards/add', {
            method: 'POST',
            body: {questionId, language},
        });
    }

    /**
     * @param {number} questionId
     * @param {string} language
     * @returns {Promise<unknown>}
     */
    async submitWordRequest(questionId, language) {
        return await this._request('/word_requests/submit', {
            method: 'POST',
            body: {question_id: questionId, language},
        });
    }

    /**
     * @returns {Promise<unknown>}
     */
    async getProfile() {
        return await this._request('/profile/data', {method: 'GET'});
    }

    /**
     * Fetch the user's current language and locale preferences.
     * @returns {Promise<unknown>}
     */
    async getLanguageSettings() {
        return await this._request('/profile/language-settings', {method: 'GET'});
    }

    /**
     * Fetch the user's profile settings (includes Chinese display preferences).
     * @returns {Promise<unknown>}
     */
    async getSettings() {
        return await this._request('/profile/settings', {method: 'GET'});
    }

    /**
     * Fetch supported study languages for the current user context.
     * @returns {Promise<unknown>}
     */
    async getSupportedLanguages() {
        return await this._request('/dictionary/supported-languages', {method: 'GET'});
    }

    /**
     * Fetch supported UI locales (code + display name).
     * @returns {Promise<unknown>}
     */
    async getSupportedLocales() {
        return await this._request('/dictionary/supported-locales', {method: 'GET', auth: false});
    }

    /**
     * @param {string} path
     * @param {{method?: string, body?: unknown, auth?: boolean, language?: string, locale?: string, _retryAuth?: boolean}} [options]
     * @returns {Promise<any>}
     */
    async _request(path, options = {}) {
        const {
            method = 'GET',
            body,
            auth = true,
            language = null,
            locale = null,
            _retryAuth = false,
        } = options;
        const url = this._buildUrl(path, language, locale);
        const normalizedMethod = method.toUpperCase();
        const cacheTtlMs = getRequestCacheTtlMs(normalizedMethod, path);
        const serializedBody = typeof body !== 'undefined' ? JSON.stringify(body) : null;
        const tokenUsed = auth ? this._authToken : '';
        const requestKey = cacheTtlMs > 0 ?
            [
                normalizedMethod,
                url,
                tokenUsed,
                serializedBody || '',
            ].join('\u0000') :
            null;
        /** @type {RequestInit} */
        const fetchOptions = {
            method: normalizedMethod,
            headers: {
                Accept: 'application/json',
            },
            credentials: 'include',
        };
        if (auth && tokenUsed) {
            fetchOptions.headers = {
                ...fetchOptions.headers,
                Authorization: `Bearer ${tokenUsed}`,
            };
        }
        if (typeof body !== 'undefined') {
            fetchOptions.body = serializedBody;
            fetchOptions.headers = {
                ...fetchOptions.headers,
                'Content-Type': 'application/json',
            };
        }

        const performRequest = async () => {
            const response = await fetch(url, fetchOptions);
            const rotatedToken = normalizeAuthTokenForStorage(response.headers.get('X-New-Token'));
            if (auth && rotatedToken && rotatedToken !== this._authToken) {
                const oldToken = this._authToken || tokenUsed;
                this._authToken = rotatedToken;
                await this._persistAuthTokenCookie(rotatedToken);
                await this._notifyAuthTokenUpdated(oldToken, rotatedToken);
            }
            /** @type {any} */
            let json = null;
            try {
                json = await readResponseJson(response);
            } catch (e) {
                // NOP
            }

            const message = (json && (json.error || json.message)) || response.statusText;

            const isAuthError = response.status === 401 && auth && tokenUsed;
            if (isAuthError && !_retryAuth) {
                if (this._authToken && this._authToken !== tokenUsed) {
                    return await this._request(path, {...options, _retryAuth: true});
                }
                let cookieToken = null;
                try {
                    cookieToken = await this._recoverAuthTokenFromCookies(tokenUsed);
                } catch (e) {
                    cookieToken = null;
                }
                if (cookieToken) {
                    await this._notifyAuthTokenUpdated(tokenUsed, cookieToken);
                    return await this._request(path, {...options, _retryAuth: true});
                }
            }

            const isTokenExpired = (
                response.status === 401 &&
                auth &&
                tokenUsed &&
                (
                    (json && (json.code === 'TOKEN_EXPIRED' || json.error === 'Invalid or expired token')) ||
                    (typeof message === 'string' && message.includes('Invalid or expired token'))
                )
            );
            if (isTokenExpired) {
                if (this._authToken === tokenUsed) {
                    this._authToken = '';
                }
                await this._notifyAuthTokenInvalidated(tokenUsed);
            }

            if (!response.ok || (json && json.success === false)) {
                throw new Error(message || 'Request failed');
            }

            return (json && Object.prototype.hasOwnProperty.call(json, 'data')) ? json.data : json;
        };

        if (!requestKey) {
            return await performRequest();
        }

        const cachedValue = getSharedCachedValue(requestKey);
        if (cachedValue !== null) {
            return cachedValue;
        }

        const inflightRequest = SHARED_INFLIGHT_REQUESTS.get(requestKey);
        if (inflightRequest) {
            return cloneCachedValue(await inflightRequest);
        }

        const requestPromise = (async () => {
            const responseData = await performRequest();
            setSharedCachedValue(requestKey, responseData, cacheTtlMs);
            return responseData;
        })();
        SHARED_INFLIGHT_REQUESTS.set(requestKey, requestPromise);
        try {
            return cloneCachedValue(await requestPromise);
        } finally {
            if (SHARED_INFLIGHT_REQUESTS.get(requestKey) === requestPromise) {
                SHARED_INFLIGHT_REQUESTS.delete(requestKey);
            }
        }
    }

    /**
     * @param {string} path
     * @param {string|null} language
     * @param {string|null} locale
     * @returns {string}
     */
    _buildUrl(path, language, locale) {
        const trimmedBase = this._apiBaseUrl.replace(/\/+$/, '');
        const trimmedPath = path.startsWith('/') ? path : `/${path}`;
        const url = new URL(trimmedBase + trimmedPath);
        if (language && !url.searchParams.has('language')) {
            url.searchParams.set('language', language);
        }
        if (locale && !url.searchParams.has('locale')) {
            url.searchParams.set('locale', locale);
        }
        return url.href;
    }

    /**
     * @param {string} name
     * @returns {Promise<string|null>}
     */
    _getCookieValue(name) {
        if (!(typeof chrome === 'object' && chrome !== null && chrome.cookies)) {
            return Promise.resolve(null);
        }
        return new Promise((resolve, reject) => {
            chrome.cookies.get({url: this._cookieDomain, name}, (cookie) => {
                const error = chrome.runtime.lastError;
                if (error) {
                    reject(new Error(error.message));
                    return;
                }
                resolve(cookie?.value ?? null);
            });
        });
    }

    /**
     * @returns {Promise<string[]>}
     */
    async _getCookieAuthTokenCandidates() {
        const tokens = [];
        const seen = new Set();
        for (const name of ['api_token', 'session_id', 'auth_token']) {
            const token = normalizeAuthTokenForStorage(await this._getCookieValue(name));
            if (!token || seen.has(token)) { continue; }
            seen.add(token);
            tokens.push(token);
        }
        return tokens;
    }

    /**
     * @param {string} oldToken
     * @returns {Promise<string|null>}
     */
    async _recoverAuthTokenFromCookies(oldToken) {
        const normalizedOldToken = normalizeAuthTokenForStorage(oldToken);
        const tokens = await this._getCookieAuthTokenCandidates();
        const token = tokens.find((value) => value !== normalizedOldToken) || null;
        if (!token) { return null; }
        this._authToken = token;
        await this._persistAuthTokenCookie(token);
        return token;
    }

    /**
     * @param {string} token
     * @returns {Promise<void>}
     */
    async _persistAuthTokenCookie(token) {
        const normalizedToken = normalizeAuthTokenForStorage(token);
        if (!normalizedToken) { return; }
        if (!(typeof chrome === 'object' && chrome !== null && chrome.cookies && typeof chrome.cookies.set === 'function')) {
            return;
        }
        try {
            const details = {
                url: this._cookieDomain,
                name: 'api_token',
                value: normalizedToken,
                path: '/',
                expirationDate: Math.floor(Date.now() / 1000) + AUTH_COOKIE_MAX_AGE_SECONDS,
                sameSite: /** @type {chrome.cookies.SameSiteStatus} */ ('lax'),
                secure: this._cookieDomain.startsWith('https://'),
            };
            await new Promise((resolve, reject) => {
                void chrome.cookies.set(details, () => {
                    const error = chrome.runtime.lastError;
                    if (error) {
                        reject(new Error(error.message));
                    } else {
                        resolve(void 0);
                    }
                });
            });
        } catch (e) {
            // Best-effort; storage still keeps the token even when cookies are unavailable.
        }
    }

    /**
     * @param {string} url
     * @returns {string}
     */
    _getOrigin(url) {
        try {
            return new URL(url).origin;
        } catch (e) {
            return 'https://sottaku.app';
        }
    }
}
