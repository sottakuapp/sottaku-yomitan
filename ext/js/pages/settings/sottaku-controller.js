/*
 * Controller for Sottaku account and API settings.
 */

import {isObjectNotArray} from '../../core/object-utilities.js';
import {toError} from '../../core/to-error.js';
import {SottakuClient} from '../../comm/sottaku-client.js';
import {querySelectorNotNull} from '../../dom/query-selector.js';

export class SottakuController {
    /**
     * @param {import('./settings-controller.js').SettingsController} settingsController
     */
    constructor(settingsController) {
        /** @type {import('./settings-controller.js').SettingsController} */
        this._settingsController = settingsController;
        /** @type {SottakuClient} */
        this._client = new SottakuClient();
        /** @type {?import('settings').ProfileOptions} */
        this._options = null;
        /** @type {boolean} */
        this._busy = false;

        /** @type {HTMLElement} */
        this._statusNode = querySelectorNotNull(document, '#sottaku-connection-status');
        /** @type {HTMLInputElement} */
        this._usernameInput = querySelectorNotNull(document, '#sottaku-username');
        /** @type {HTMLInputElement} */
        this._passwordInput = querySelectorNotNull(document, '#sottaku-password');
        /** @type {HTMLButtonElement} */
        this._loginButton = querySelectorNotNull(document, '#sottaku-login-button');
        /** @type {HTMLButtonElement} */
        this._googleButton = querySelectorNotNull(document, '#sottaku-google-button');
        /** @type {HTMLButtonElement} */
        this._syncCookieButton = querySelectorNotNull(document, '#sottaku-sync-cookie-button');
        /** @type {HTMLButtonElement} */
        this._logoutButton = querySelectorNotNull(document, '#sottaku-logout-button');
        /** @type {HTMLInputElement} */
        this._apiInput = querySelectorNotNull(document, 'input[data-setting="sottaku.apiBaseUrl"]');
    }

    /** */
    async prepare() {
        this._settingsController.on('optionsChanged', this._onOptionsChanged.bind(this));
        this._loginButton.addEventListener('click', this._onLoginClick.bind(this), false);
        this._googleButton.addEventListener('click', this._onGoogleClick.bind(this), false);
        this._syncCookieButton.addEventListener('click', this._onSyncCookieClick.bind(this), false);
        this._logoutButton.addEventListener('click', this._onLogoutClick.bind(this), false);
        this._apiInput.addEventListener('change', this._onApiUrlChanged.bind(this), false);
        const options = await this._settingsController.getOptions();
        this._onOptionsChanged({options, optionsContext: this._settingsController.getOptionsContext()});
    }

    // Private

    /**
     * @param {import('settings-controller').EventArgument<'optionsChanged'>} details
     */
    _onOptionsChanged({options}) {
        this._options = options;
        this._client.setConfig({
            apiBaseUrl: options.sottaku.apiBaseUrl,
            authToken: options.sottaku.authToken,
            cookieDomain: options.sottaku.cookieDomain,
        });
        this._updateStatus();
    }

    /** */
    async _onLoginClick(e) {
        e.preventDefault();
        const username = this._usernameInput.value.trim();
        const password = this._passwordInput.value;
        if (!username || !password || this._busy) { return; }
        this._passwordInput.value = '';
        try {
            this._busy = true;
            this._setStatus('Signing in...', false);
            const data = await this._client.loginWithPassword(username, password);
            await this._applyAuthUpdate(data?.token ?? this._client.authToken, isObjectNotArray(data?.user) ? data.user : null);
            this._setStatus('Signed in to Sottaku', false);
        } catch (e2) {
            this._setStatus(toError(e2).message, true);
        } finally {
            this._busy = false;
        }
    }

    /** */
    async _onGoogleClick(e) {
        e.preventDefault();
        const origin = this._getOriginFromApiUrl();
        const url = `${origin}/login?source=extension`;
        try {
            await this._openTab(url);
            this._setStatus('Complete Google sign-in in the opened tab, then click "Use browser session".', false);
        } catch (e2) {
            this._setStatus(toError(e2).message, true);
        }
    }

    /** */
    async _onSyncCookieClick(e) {
        e.preventDefault();
        if (this._busy) { return; }
        try {
            this._busy = true;
            this._setStatus('Checking browser session...', false);
            const token = await this._client.syncTokenFromCookies();
            if (!token) {
                this._setStatus('No api_token cookie found on sottaku.app', true);
                return;
            }
            let user = null;
            try {
                const profile = await this._client.getProfile();
                if (profile && typeof profile === 'object' && isObjectNotArray(profile.user)) {
                    // @ts-expect-error Allow loose shape from API
                    user = profile.user;
                }
            } catch (e2) {
                // Best-effort; status will still update
                this._setStatus('Session detected; unable to load profile details (continuing)', false);
            }
            await this._applyAuthUpdate(token, user);
            this._setStatus('Sottaku session linked from browser login', false);
        } catch (e3) {
            this._setStatus(toError(e3).message, true);
        } finally {
            this._busy = false;
        }
    }

    /** */
    async _onLogoutClick(e) {
        e.preventDefault();
        if (this._busy) { return; }
        try {
            this._busy = true;
            await this._settingsController.modifySettings([
                {action: 'set', path: 'sottaku.authToken', value: ''},
                {action: 'set', path: 'sottaku.user', value: null},
            ]);
            this._client.setConfig({authToken: ''});
            this._setStatus('Signed out of Sottaku', false);
        } catch (e2) {
            this._setStatus(toError(e2).message, true);
        } finally {
            this._busy = false;
        }
    }

    /** */
    async _onApiUrlChanged() {
        const origin = this._getOriginFromApiUrl();
        await this._settingsController.modifySettings([
            {action: 'set', path: 'sottaku.cookieDomain', value: origin},
        ]);
        this._client.setConfig({cookieDomain: origin});
    }

    /**
     * @param {string} token
     * @param {unknown} user
     */
    async _applyAuthUpdate(token, user) {
        const origin = this._getOriginFromApiUrl();
        const updates = [
            {action: 'set', path: 'sottaku.authToken', value: token},
            {action: 'set', path: 'sottaku.cookieDomain', value: origin},
            {action: 'set', path: 'sottaku.enabled', value: true},
            {action: 'set', path: 'sottaku.user', value: user ?? null},
        ];
        await this._settingsController.modifySettings(updates);
        this._client.setConfig({authToken: token, cookieDomain: origin});
    }

    /** */
    _updateStatus() {
        const options = this._options;
        if (!options) { return; }
        const {sottaku} = options;
        const {user, authToken, enabled} = sottaku;
        let message = 'Not connected';
        if (enabled && authToken) {
            const name = isObjectNotArray(user) ? (user.username || user.email || '') : '';
            message = name ? `Connected as ${name}` : 'API token stored for Sottaku';
        }
        this._setStatus(message, false);
    }

    /**
     * @param {string} text
     * @param {boolean} isError
     */
    _setStatus(text, isError) {
        this._statusNode.textContent = text;
        this._statusNode.classList.toggle('danger-text', !!isError);
    }

    /**
     * @returns {string}
     */
    _getOriginFromApiUrl() {
        try {
            return new URL(this._apiInput.value || this._client.apiBaseUrl).origin;
        } catch (e) {
            return 'https://sottaku.app';
        }
    }

    /**
     * @param {string} url
     * @returns {Promise<chrome.tabs.Tab>}
     */
    _openTab(url) {
        return new Promise((resolve, reject) => {
            chrome.tabs.create({url}, (tab) => {
                const error = chrome.runtime.lastError;
                if (error) {
                    reject(new Error(error.message));
                } else {
                    resolve(tab);
                }
            });
        });
    }
}
