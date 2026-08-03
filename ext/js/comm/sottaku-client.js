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

class SottakuRequestError extends Error {
    /**
     * @param {string} message
     * @param {number} status
     * @param {unknown} data
     */
    constructor(message, status, data) {
        super(message);
        this.status = status;
        this.data = data;
    }
}

const STATIC_SETTINGS_CACHE_TTL_MS = 5 * 60 * 1000;
const SHARED_SCAN_CACHE_TTL_MS = 10 * 1000;

const REQUEST_CACHE_TTLS = new Map([
    ['GET /profile/language-settings', STATIC_SETTINGS_CACHE_TTL_MS],
    ['GET /profile/settings', STATIC_SETTINGS_CACHE_TTL_MS],
    ['GET /dictionary/supported-languages', STATIC_SETTINGS_CACHE_TTL_MS],
    ['POST /dictionary/yomitan-scan', SHARED_SCAN_CACHE_TTL_MS],
]);
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
 * @param {unknown} token
 * @returns {string}
 */
function normalizeAuthTokenForStorage(token) {
    const value = typeof token === 'string' ? token.trim() : '';
    if (!value) { return ''; }
    return value;
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
     * @param {{apiBaseUrl?: string, authToken?: string, refreshToken?: string, onAuthTokenUpdated?: ((details: {apiBaseUrl: string, oldToken: string, newToken: string}) => (void|Promise<void>))|null, onAuthTokenInvalidated?: ((details: {apiBaseUrl: string, oldToken: string}) => (void|Promise<void>))|null}} [options]
     */
    constructor(options = {}) {
        /** @type {string} */
        this._apiBaseUrl = this._normalizeApiBaseUrl(options.apiBaseUrl);
        /** @type {string} */
        this._authToken = normalizeAuthTokenForStorage(options.authToken);
        /** @type {string} */
        this._refreshToken = normalizeAuthTokenForStorage(options.refreshToken);
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
     * @param {{apiBaseUrl?: string, authToken?: string, refreshToken?: string, onAuthTokenUpdated?: ((details: {apiBaseUrl: string, oldToken: string, newToken: string}) => (void|Promise<void>))|null, onAuthTokenInvalidated?: ((details: {apiBaseUrl: string, oldToken: string}) => (void|Promise<void>))|null}} options
     */
    setConfig(options) {
        if (typeof options.apiBaseUrl === 'string' && options.apiBaseUrl.length > 0) {
            this._apiBaseUrl = this._normalizeApiBaseUrl(options.apiBaseUrl);
        }
        if (typeof options.authToken === 'string') {
            this._authToken = normalizeAuthTokenForStorage(options.authToken);
        }
        if (typeof options.refreshToken === 'string') {
            this._refreshToken = normalizeAuthTokenForStorage(options.refreshToken);
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
     * @param {string|null} passwordStepUpToken
     * @returns {Promise<{token: string, refreshToken: string, user?: unknown}>}
     */
    async loginWithPassword(username, password, passwordStepUpToken = null) {
        const response = /** @type {unknown} */ (await this._request('/login', {
            method: 'POST',
            body: {
                username,
                email: username,
                password,
                ...(passwordStepUpToken ? {password_step_up_token: passwordStepUpToken} : {}),
            },
            auth: false,
        }));
        const data = response && typeof response === 'object' ?
            /** @type {{token?: unknown, refresh_token?: unknown, user?: unknown}} */ (response) :
            {};
        const refreshToken = normalizeAuthTokenForStorage(data.refresh_token);
        this._refreshToken = refreshToken;
        if (typeof data.token === 'string') {
            const token = normalizeAuthTokenForStorage(data.token);
            this._authToken = token;
            return {token, refreshToken, user: data.user};
        }
        return {token: '', refreshToken, user: data.user};
    }

    /**
     * @param {string} stepUpTransaction
     * @returns {Promise<{challenge_id: string, expires_in: number}>}
     */
    async requestPasswordStepUp(stepUpTransaction) {
        return await this._request('/auth/password-step-up/request', {
            method: 'POST',
            body: {step_up_transaction: stepUpTransaction},
            auth: false,
        });
    }

    /**
     * @param {string} stepUpTransaction
     * @param {string} challengeId
     * @returns {Promise<{resent: boolean, challenge_id: string, retry_after: number}>}
     */
    async resendPasswordStepUp(stepUpTransaction, challengeId) {
        return await this._request('/auth/password-step-up/resend', {
            method: 'POST',
            body: {
                step_up_transaction: stepUpTransaction,
                challenge_id: challengeId,
            },
            auth: false,
        });
    }

    /**
     * @param {string} challengeId
     * @param {string} code
     * @returns {Promise<{password_step_up_token: string, expires_in: number}>}
     */
    async verifyPasswordStepUp(challengeId, code) {
        return await this._request('/auth/password-step-up/verify', {
            method: 'POST',
            body: {challenge_id: challengeId, code},
            auth: false,
        });
    }

    /**
     * Create a one-time browser approval URL without exposing browser cookies.
     * @throws {Error} If secure random generation is unavailable.
     * @returns {{linkToken: string, url: string}}
     */
    createBrowserLink() {
        if (!(globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function')) {
            throw new Error('Secure random number generation is unavailable');
        }
        const bytes = new Uint8Array(32);
        globalThis.crypto.getRandomValues(bytes);
        let binary = '';
        for (const value of bytes) {
            binary += String.fromCharCode(value);
        }
        const linkToken = btoa(binary)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/u, '');
        const origin = new URL(this._apiBaseUrl).origin;
        const url = new URL('/extension/link', origin);
        url.searchParams.set('token', linkToken);
        return {linkToken, url: url.href};
    }

    /**
     * Poll a one-time browser approval and retain only the scoped result.
     * @param {string} linkToken
     * @returns {Promise<{status: string, token?: string, refreshToken?: string, user?: unknown}>}
     */
    async exchangeBrowserLink(linkToken) {
        const response = /** @type {unknown} */ (await this._request('/auth/extension-link/exchange', {
            method: 'POST',
            body: {link_token: linkToken},
            auth: false,
        }));
        const data = response && typeof response === 'object' ?
            /** @type {{status: string, token?: string, refresh_token?: string, user?: unknown}} */ (response) :
            {status: 'pending'};
        if (data?.status === 'linked' && typeof data.token === 'string') {
            this._authToken = normalizeAuthTokenForStorage(data.token);
            this._refreshToken = normalizeAuthTokenForStorage(data.refresh_token);
        }
        return {
            status: data.status,
            token: data.token,
            refreshToken: data.refresh_token,
            user: data.user,
        };
    }

    /**
     * Revoke the extension session before clearing local credentials.
     * @returns {Promise<void>}
     */
    async logout() {
        try {
            if (this._authToken) {
                await this._request('/logout', {method: 'POST'});
            }
        } finally {
            this._authToken = '';
            this._refreshToken = '';
        }
    }

    /**
     * @returns {Promise<'refreshed'|'invalid'|'unavailable'>}
     */
    async _refreshAccessToken() {
        if (!this._refreshToken) { return 'invalid'; }
        const url = this._buildUrl('/auth/extension-refresh', null, null);
        /** @type {Response} */
        let response;
        try {
            response = await fetch(url, {
                method: 'POST',
                credentials: 'omit',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'X-Client-Platform': 'browser_extension',
                },
                body: JSON.stringify({refresh_token: this._refreshToken}),
            });
        } catch (e) {
            return 'unavailable';
        }
        /** @type {unknown} */
        let rawData = null;
        try {
            rawData = await readResponseJson(response);
        } catch (e) {
            // NOP
        }
        const envelope = rawData && typeof rawData === 'object' ?
            /** @type {{data?: unknown}} */ (rawData) :
            {};
        const data = envelope.data && typeof envelope.data === 'object' ?
            /** @type {{token?: unknown}} */ (envelope.data) :
            envelope;
        const newToken = normalizeAuthTokenForStorage(
            /** @type {{token?: unknown}} */ (data).token,
        );
        if (!response.ok || !newToken) {
            if (response.status === 401) {
                this._refreshToken = '';
                return 'invalid';
            }
            return 'unavailable';
        }
        const oldToken = this._authToken;
        this._authToken = newToken;
        await this._notifyAuthTokenUpdated(oldToken, newToken);
        return 'refreshed';
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
     * @param {string|string[]} language
     * @param {number} [maxResults]
     * @param {string} [locale]
     * @param {{hanziDisplay?: string, chineseReadingDisplay?: string, chineseToneColors?: boolean, japanesePitchAccentDisplay?: string}} [displayPreferences]
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
            const {hanziDisplay, chineseReadingDisplay, chineseToneColors, japanesePitchAccentDisplay} = displayPreferences;
            if (typeof hanziDisplay === 'string' && hanziDisplay.trim()) {
                body.hanzi_display = hanziDisplay.trim();
            }
            if (typeof chineseReadingDisplay === 'string' && chineseReadingDisplay.trim()) {
                body.chinese_reading_display = chineseReadingDisplay.trim();
            }
            if (typeof chineseToneColors === 'boolean') {
                body.chinese_tone_colors = chineseToneColors;
            }
            if (typeof japanesePitchAccentDisplay === 'string' && japanesePitchAccentDisplay.trim()) {
                body.japanese_pitch_accent_display = japanesePitchAccentDisplay.trim();
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
     * @param {string} _language
     * @returns {Promise<string|null>}
     */
    async fetchAudioAsObjectUrl(path, _language) {
        const url = this._resolveUrl(path);
        let retriedAuth = false;
        while (true) {
            const tokenUsed = this._isTrustedApiUrl(url) ? this._authToken : '';
            /** @type {RequestInit} */
            const options = {
                method: 'GET',
                credentials: 'omit',
                headers: {'X-Client-Platform': 'browser_extension'},
            };
            if (tokenUsed) {
                options.headers = {
                    ...options.headers,
                    Authorization: `Bearer ${tokenUsed}`,
                };
            }
            const response = await fetch(url, options);
            const rotatedToken = normalizeAuthTokenForStorage(response.headers.get('X-New-Token'));
            if (tokenUsed && rotatedToken && rotatedToken !== tokenUsed) {
                this._authToken = rotatedToken;
                await this._notifyAuthTokenUpdated(tokenUsed, rotatedToken);
            }
            if (response.status === 401 && tokenUsed && !retriedAuth) {
                retriedAuth = true;
                if (rotatedToken && rotatedToken !== tokenUsed) {
                    continue;
                }
                const refreshResult = await this._refreshAccessToken();
                if (refreshResult === 'refreshed') {
                    continue;
                }
                if (refreshResult === 'invalid') {
                    this._authToken = '';
                    await this._notifyAuthTokenInvalidated(tokenUsed);
                }
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
            const origin = new URL(this._apiBaseUrl).origin;
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
                'Accept': 'application/json',
                'X-Client-Platform': 'browser_extension',
            },
            credentials: 'omit',
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
            if (
                isAuthError &&
                !_retryAuth &&
                this._authToken &&
                this._authToken !== tokenUsed
            ) {
                return await this._request(path, {...options, _retryAuth: true});
            }
            let refreshResult = null;
            if (isAuthError && !_retryAuth) {
                refreshResult = await this._refreshAccessToken();
                if (refreshResult === 'refreshed') {
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
            if (isTokenExpired && refreshResult !== 'unavailable') {
                if (this._authToken === tokenUsed) {
                    this._authToken = '';
                }
                await this._notifyAuthTokenInvalidated(tokenUsed);
            }

            if (!response.ok || (json && json.success === false)) {
                const errorMessage = typeof message === 'string' && message ? message : 'Request failed';
                const errorData = json && typeof json === 'object' ?
                    /** @type {{data?: unknown}} */ (json).data :
                    null;
                throw new SottakuRequestError(errorMessage, response.status, errorData);
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
     * @param {unknown} value
     * @throws {Error} If the configured API origin is not trusted.
     * @returns {string}
     */
    _normalizeApiBaseUrl(value) {
        const fallback = 'https://sottaku.app/api/v1';
        const candidate = typeof value === 'string' && value.trim() ? value.trim() : fallback;
        try {
            const url = new URL(candidate);
            if (!this._isTrustedApiUrl(url.href)) {
                throw new Error('Untrusted Sottaku API origin');
            }
            return url.href.replace(/\/+$/, '');
        } catch (e) {
            throw new Error('Untrusted Sottaku API origin');
        }
    }

    /**
     * @param {string} value
     * @returns {boolean}
     */
    _isTrustedApiUrl(value) {
        try {
            const url = new URL(value);
            const hostname = url.hostname.toLowerCase();
            return (
                url.protocol === 'https:' && (
                    hostname === 'sottaku.app' || hostname.endsWith('.sottaku.app')
                )
            ) || (
                (url.protocol === 'http:' || url.protocol === 'https:') &&
                (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1')
            );
        } catch (e) {
            return false;
        }
    }
}
