/*
 * Sottaku API helper used for authentication, dictionary search, flashcards,
 * and word requests.
 */

import {toError} from '../core/to-error.js';

export class SottakuClient {
    /**
     * @param {{apiBaseUrl?: string, authToken?: string, cookieDomain?: string}} [options]
     */
    constructor(options = {}) {
        /** @type {string} */
        this._apiBaseUrl = options.apiBaseUrl || 'https://sottaku.app/api/v1';
        /** @type {string} */
        this._authToken = options.authToken || '';
        /** @type {string} */
        this._cookieDomain = options.cookieDomain || this._getOrigin(this._apiBaseUrl);
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
     * @param {{apiBaseUrl?: string, authToken?: string, cookieDomain?: string}} options
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
     * @param {string} query
     * @param {string} language
     * @returns {Promise<unknown>}
     */
    async search(query, language) {
        return await this._request('/dictionary/search', {
            method: 'POST',
            body: {query, language},
        });
    }

    /**
     * Optimized scan endpoint tailored for Yomitan lookups.
     * @param {string} text
     * @param {string} language
     * @param {number} [maxResults]
     * @returns {Promise<{results: any[], originalTextLength: number}>}
     */
    async scan(text, language, maxResults) {
        /** @type {Record<string, any>} */
        const body = {text, language};
        if (Number.isFinite(maxResults)) {
            body.maxResults = maxResults;
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
        return {results, originalTextLength};
    }

    /**
     * @param {number[]} wordIds
     * @param {string} language
     * @returns {Promise<Record<string, unknown>>}
     */
    async getWordInfoBatch(wordIds, language) {
        const data = await this._request('/dictionary/word-info-batch', {
            method: 'POST',
            body: {wordIds, language},
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
     * @returns {Promise<unknown>}
     */
    async getWordInfo(wordId, language) {
        const url = `/dictionary/word/${wordId}`;
        return await this._request(url, {method: 'GET', language});
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
     * @param {string} path
     * @param {{method?: string, body?: unknown, auth?: boolean, language?: string}} [options]
     * @returns {Promise<any>}
     */
    async _request(path, options = {}) {
        const {
            method = 'GET',
            body,
            auth = true,
            language = null,
        } = options;
        const url = this._buildUrl(path, language);
        /** @type {RequestInit} */
        const fetchOptions = {
            method,
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
            fetchOptions.body = JSON.stringify(body);
            fetchOptions.headers = {
                ...fetchOptions.headers,
                'Content-Type': 'application/json',
            };
        }

        const response = await fetch(url, fetchOptions);
        let json = null;
        try {
            json = await response.json();
        } catch (e) {
            // NOP
        }

        if (!response.ok || (json && json.success === false)) {
            const message = (json && (json.error || json.message)) || response.statusText;
            throw new Error(message || 'Request failed');
        }

        return (json && Object.prototype.hasOwnProperty.call(json, 'data')) ? json.data : json;
    }

    /**
     * @param {string} path
     * @param {string|null} language
     * @returns {string}
     */
    _buildUrl(path, language) {
        const trimmedBase = this._apiBaseUrl.replace(/\/+$/, '');
        const trimmedPath = path.startsWith('/') ? path : `/${path}`;
        const url = new URL(trimmedBase + trimmedPath);
        if (language && !url.searchParams.has('language')) {
            url.searchParams.set('language', language);
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
