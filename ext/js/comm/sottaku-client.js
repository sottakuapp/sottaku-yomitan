/*
 * Sottaku API helper used for authentication, dictionary search, flashcards,
 * and word requests.
 */

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
    return JSON.parse(JSON.stringify(value));
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
    if (!(ttlMs > 0)) { return; }
    SHARED_REQUEST_CACHE.set(requestKey, {
        expiresAt: Date.now() + ttlMs,
        value: cloneCachedValue(value),
    });
}

export class SottakuClient {
    /**
     * @param {{apiBaseUrl?: string, authToken?: string, cookieDomain?: string, onAuthTokenUpdated?: ((details: {apiBaseUrl: string, oldToken: string, newToken: string}) => (void|Promise<void>)), onAuthTokenInvalidated?: ((details: {apiBaseUrl: string, oldToken: string}) => (void|Promise<void>))}} [options]
     */
    constructor(options = {}) {
        /** @type {string} */
        this._apiBaseUrl = options.apiBaseUrl || 'https://sottaku.app/api/v1';
        /** @type {string} */
        this._authToken = options.authToken || '';
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
            this._authToken = options.authToken;
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
            this._authToken = data.token;
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
            const value = await this._getCookieValue('api_token');
            if (value) {
                this._authToken = value;
                return value;
            }
            const sessionValue = await this._getCookieValue('session_id');
            if (sessionValue) {
                this._authToken = sessionValue;
                return sessionValue;
            }
            const bearer = await this._getCookieValue('auth_token');
            if (bearer) {
                this._authToken = bearer;
                return bearer;
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
            /** @type {Record<string, unknown>} */
            const {word_info: wordInfo} = /** @type {{word_info: Record<string, unknown>}} */ (data);
            return wordInfo;
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
            const rotatedToken = response.headers.get('X-New-Token');
            if (tokenUsed && rotatedToken && rotatedToken !== tokenUsed) {
                this._authToken = rotatedToken;
                await this._notifyAuthTokenUpdated(tokenUsed, rotatedToken);
            }
            if (response.status === 401 && tokenUsed && !retriedAuth) {
                retriedAuth = true;
                if (rotatedToken && rotatedToken !== tokenUsed) {
                    continue;
                }
                let cookieToken = null;
                try {
                    cookieToken = await this.syncTokenFromCookies();
                } catch (e) {
                    cookieToken = null;
                }
                if (cookieToken && cookieToken !== tokenUsed) {
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
        const serializedBody = body !== undefined ? JSON.stringify(body) : null;
        const requestKey = cacheTtlMs > 0 ? [
            normalizedMethod,
            url,
            auth ? this._authToken : '',
            serializedBody || '',
        ].join('\u0000') : null;
        /** @type {RequestInit} */
        const fetchOptions = {
            method: normalizedMethod,
            headers: {
                'Accept': 'application/json',
            },
            credentials: 'include',
        };
        if (auth && this._authToken) {
            fetchOptions.headers = {
                ...fetchOptions.headers,
                'Authorization': `Bearer ${this._authToken}`,
            };
        }
        if (body !== undefined) {
            fetchOptions.body = serializedBody;
            fetchOptions.headers = {
                ...fetchOptions.headers,
                'Content-Type': 'application/json',
            };
        }

        const performRequest = async () => {
            const response = await fetch(url, fetchOptions);
            const rotatedToken = response.headers.get('X-New-Token');
            if (auth && rotatedToken && rotatedToken !== this._authToken) {
                const oldToken = this._authToken;
                this._authToken = rotatedToken;
                await this._notifyAuthTokenUpdated(oldToken, rotatedToken);
            }
            let json = null;
            try {
                json = await response.json();
            } catch (e) {
                // NOP
            }

            const message = (json && (json.error || json.message)) || response.statusText;

            const isTokenExpired = (
                response.status === 401 &&
                auth &&
                this._authToken &&
                (
                    (json && (json.code === 'TOKEN_EXPIRED' || json.error === 'Invalid or expired token')) ||
                    (typeof message === 'string' && message.includes('Invalid or expired token'))
                )
            );
            if (isTokenExpired && !_retryAuth) {
                const oldToken = this._authToken;
                let cookieToken = null;
                try {
                    cookieToken = await this.syncTokenFromCookies();
                } catch (e) {
                    cookieToken = null;
                }
                if (cookieToken && cookieToken !== oldToken) {
                    await this._notifyAuthTokenUpdated(oldToken, cookieToken);
                    return await this._request(path, {...options, _retryAuth: true});
                }
                this._authToken = '';
                await this._notifyAuthTokenInvalidated(oldToken);
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
        if (!chrome.cookies) {
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
