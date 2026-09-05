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

import {isObjectNotArray} from '../../core/object-utilities.js';
import {toError} from '../../core/to-error.js';
import {SottakuClient} from '../../comm/sottaku-client.js';
import {getMessage} from '../../dom/i18n.js';
import {querySelectorNotNull} from '../../dom/query-selector.js';
import {
    getSottakuLanguageFlag,
    getSottakuLanguageName,
    normalizeSottakuLanguages,
    normalizeSottakuSupportedLanguages,
    SOTTAKU_ADMIN_PREVIEW_LANGUAGES,
    SOTTAKU_SUPPORTED_LANGUAGES,
} from '../../language/sottaku-languages.js';

const PASSWORD_HUMAN_VERIFICATION_MESSAGE = 'sottaku-password-human-verification';

/**
 * Compare two fixed-format popup states without exiting on the first mismatch.
 * @param {string} first
 * @param {string} second
 * @returns {boolean}
 */
function passwordHumanVerificationStatesMatch(first, second) {
    if (typeof first !== 'string' || typeof second !== 'string') { return false; }
    let difference = first.length ^ second.length;
    const length = Math.max(first.length, second.length);
    for (let index = 0; index < length; ++index) {
        difference |= (first.charCodeAt(index) || 0) ^ (second.charCodeAt(index) || 0);
    }
    return difference === 0;
}

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
        /** @type {boolean} */
        this._loadingUser = false;
        /** @type {string[]} */
        this._preferredLanguages = [];
        /** @type {string[]} */
        this._supportedLanguages = [...SOTTAKU_SUPPORTED_LANGUAGES];
        /** @type {string|null} */
        this._passwordStepUpTransaction = null;
        /** @type {string|null} */
        this._passwordStepUpChallengeId = null;
        /** @type {string|null} */
        this._passwordStepUpProof = null;
        /** @type {'password_recovery'|'password_step_up_code'|null} */
        this._passwordHumanVerificationAction = null;
        /** @type {{popup: Window, expectedOrigin: string, state: string, action: 'password_recovery'|'password_step_up_code', transaction: string}|null} */
        this._passwordHumanVerificationRequest = null;
        /** @type {boolean} */
        this._passwordHumanRecoveryAvailable = false;
        /** @type {string|null} */
        this._passwordStepUpHumanVerificationToken = null;
        /** @type {string|null} */
        this._passwordStepUpHumanVerificationContext = null;

        /** @type {HTMLElement} */
        this._statusNode = querySelectorNotNull(document, '#sottaku-connection-status');
        /** @type {HTMLInputElement} */
        this._usernameInput = querySelectorNotNull(document, '#sottaku-username');
        /** @type {HTMLInputElement} */
        this._passwordInput = querySelectorNotNull(document, '#sottaku-password');
        /** @type {HTMLButtonElement} */
        this._loginButton = querySelectorNotNull(document, '#sottaku-login-button');
        /** @type {HTMLElement} */
        this._passwordStepUpForm = querySelectorNotNull(document, '#sottaku-password-step-up-form');
        /** @type {HTMLInputElement} */
        this._passwordStepUpCodeInput = querySelectorNotNull(document, '#sottaku-password-step-up-code');
        /** @type {HTMLButtonElement} */
        this._passwordStepUpVerifyButton = querySelectorNotNull(document, '#sottaku-password-step-up-verify');
        /** @type {HTMLButtonElement} */
        this._passwordStepUpResendButton = querySelectorNotNull(document, '#sottaku-password-step-up-resend');
        /** @type {HTMLElement} */
        this._passwordHumanVerificationForm = querySelectorNotNull(document, '#sottaku-password-human-verification-form');
        /** @type {HTMLButtonElement} */
        this._passwordHumanVerificationButton = querySelectorNotNull(document, '#sottaku-password-human-verification-button');
        /** @type {HTMLButtonElement} */
        this._browserLinkButton = querySelectorNotNull(document, '#sottaku-browser-link-button');
        /** @type {HTMLButtonElement} */
        this._logoutButton = querySelectorNotNull(document, '#sottaku-logout-button');
        /** @type {HTMLElement} */
        this._authForm = querySelectorNotNull(document, '#sottaku-auth-form');
        /** @type {HTMLElement} */
        this._linkedActions = querySelectorNotNull(document, '#sottaku-linked-actions');
        /** @type {HTMLElement} */
        this._languageList = querySelectorNotNull(document, '#sottaku-language-list');
        /** @type {HTMLSelectElement} */
        this._languageAddSelect = querySelectorNotNull(document, '#sottaku-language-add-select');
        /** @type {HTMLButtonElement} */
        this._languageAddButton = querySelectorNotNull(document, '#sottaku-language-add-button');
        /** @type {Map<string, HTMLOptionElement>} */
        this._adminPreviewLanguageModeOptions = new Map();
        for (const language of SOTTAKU_ADMIN_PREVIEW_LANGUAGES) {
            const option = /** @type {HTMLOptionElement} */ (
                querySelectorNotNull(document, `#sottaku-language-mode option[value="${language}"]`)
            );
            this._adminPreviewLanguageModeOptions.set(language, option);
        }
    }

    /** */
    async prepare() {
        this._settingsController.on('optionsChanged', this._onOptionsChanged.bind(this));
        this._loginButton.addEventListener('click', this._onLoginClick.bind(this), false);
        this._passwordStepUpVerifyButton.addEventListener('click', this._onPasswordStepUpVerify.bind(this), false);
        this._passwordStepUpResendButton.addEventListener('click', this._onPasswordStepUpResend.bind(this), false);
        this._passwordHumanVerificationButton.addEventListener('click', this._onPasswordHumanVerificationClick.bind(this), false);
        globalThis.addEventListener('message', this._onPasswordHumanVerificationMessage.bind(this), false);
        globalThis.addEventListener('pagehide', this._clearPasswordStepUpSecrets.bind(this), {once: true});
        this._browserLinkButton.addEventListener('click', this._onBrowserLinkClick.bind(this), false);
        this._logoutButton.addEventListener('click', this._onLogoutClick.bind(this), false);
        this._languageAddButton.addEventListener('click', this._onLanguageAdd.bind(this), false);
        const options = await this._settingsController.getOptions();
        this._onOptionsChanged({options, optionsContext: this._settingsController.getOptionsContext()});
    }

    // Private

    /**
     * @param {import('settings-controller').EventArgument<'optionsChanged'>} details
     */
    _onOptionsChanged({options}) {
        this._options = options;
        this._preferredLanguages = normalizeSottakuLanguages(
            options.sottaku.preferredLanguages,
            options.general.language,
            this._supportedLanguages,
        );
        if (!options.sottaku.enabled) {
            void this._settingsController.modifySettings([
                {action: 'set', scope: 'profile', path: 'sottaku.enabled', value: true},
            ]);
        }
        this._client.setConfig({
            apiBaseUrl: options.sottaku.apiBaseUrl,
            authToken: options.sottaku.authToken,
            refreshToken: options.sottaku.refreshToken,
        });
        this._updateStatus();
        void this._ensureUserDetails();
        this._renderLanguageList();
        void this._loadSupportedLanguages();
    }

    /**
     * @param {Event} e
     */
    async _onLoginClick(e) {
        e.preventDefault();
        const username = this._usernameInput.value.trim();
        const password = this._passwordInput.value;
        if (!username || !password || this._busy) { return; }
        this._passwordInput.value = '';
        const proof = this._passwordStepUpProof;
        try {
            this._busy = true;
            this._setStatus('Signing in...', false);
            const data = await this._client.loginWithPassword(username, password, proof);
            this._clearPasswordStepUpSecrets();
            await this._applyAuthUpdate(
                data.token || this._client.authToken,
                isObjectNotArray(data.user) ? data.user : null,
                data.refreshToken,
            );
        } catch (error) {
            const alternateRecovery = this._getPasswordAlternateRecovery(error);
            const stepUpRequirement = this._getPasswordStepUpRequirement(error);
            if (alternateRecovery) {
                if (
                    alternateRecovery.method === 'human_verification' &&
                    alternateRecovery.transaction
                ) {
                    this._beginPasswordHumanVerification(
                        'password_recovery',
                        alternateRecovery.transaction,
                    );
                } else if (
                    alternateRecovery.method === 'linked_google' ||
                    alternateRecovery.method === 'linked_apple'
                ) {
                    this._clearPasswordStepUpSecrets();
                    this._authForm.hidden = false;
                    this._setStatus(
                        getMessage('settings_sottaku_use_browser_session_title') ||
                        'Use your signed-in browser session',
                        false,
                    );
                } else {
                    this._clearPasswordStepUpSecrets();
                    this._authForm.hidden = false;
                    this._setStatus(
                        getMessage('settings_sottaku_password_recovery_support_required') ||
                        'Please contact Sottaku support to recover access.',
                        true,
                    );
                }
            } else if (stepUpRequirement) {
                try {
                    await this._beginPasswordStepUp(
                        stepUpRequirement.transaction,
                        stepUpRequirement.humanVerificationAvailable,
                    );
                } catch (stepUpError) {
                    this._clearPasswordStepUpSecrets();
                    this._setStatus(toError(stepUpError).message || 'Unable to send verification code', true);
                }
            } else if (
                proof &&
                this._passwordStepUpProof === proof &&
                this._isRetryablePasswordStepUpAuthError(error)
            ) {
                // A transport failure or a retryable guard response does not
                // prove that the server consumed this one-use proof. Retain it
                // in controller memory and require the password to be typed
                // again; pagehide still clears the complete flow.
                this._setStatus(toError(error).message || 'Unable to sign in', true);
            } else {
                this._clearPasswordStepUpSecrets();
                this._setStatus(toError(error).message || 'Unable to sign in', true);
            }
        } finally {
            this._busy = false;
        }
    }

    /**
     * @param {unknown} error
     * @returns {{transaction: string, humanVerificationAvailable: boolean}|null}
     */
    _getPasswordStepUpRequirement(error) {
        if (!(error instanceof Error)) { return null; }
        const errorData = /** @type {{data?: unknown}} */ (error).data;
        const data = isObjectNotArray(errorData) ? errorData : null;
        if (data?.error_code !== 'PASSWORD_STEP_UP_REQUIRED' || typeof data.step_up_transaction !== 'string') {
            return null;
        }
        return {
            transaction: data.step_up_transaction,
            humanVerificationAvailable: (
                data.human_verification_available === true &&
                data.turnstile_action === 'password_recovery'
            ),
        };
    }

    /**
     * @param {unknown} error
     * @returns {{method: 'human_verification'|'linked_google'|'linked_apple'|'support', transaction: string|null}|null}
     */
    _getPasswordAlternateRecovery(error) {
        if (!(error instanceof Error)) { return null; }
        const errorData = /** @type {{data?: unknown}} */ (error).data;
        const data = isObjectNotArray(errorData) ? errorData : null;
        if (data?.error_code !== 'PASSWORD_ALTERNATE_RECOVERY_REQUIRED') { return null; }
        const method = data.method;
        if (
            method !== 'human_verification' &&
            method !== 'linked_google' &&
            method !== 'linked_apple' &&
            method !== 'support'
        ) {
            return null;
        }
        return {
            method,
            transaction: typeof data.step_up_transaction === 'string' ? data.step_up_transaction : null,
        };
    }

    /**
     * @param {unknown} error
     * @returns {boolean}
     */
    _isPasswordStepUpHumanVerificationRequired(error) {
        if (!(error instanceof Error)) { return false; }
        const errorData = /** @type {{data?: unknown}} */ (error).data;
        const data = isObjectNotArray(errorData) ? errorData : null;
        return (
            (
                data?.error_code === 'PASSWORD_STEP_UP_INVALID' ||
                data?.error_code === 'PASSWORD_STEP_UP_HUMAN_VERIFICATION_REQUIRED'
            ) &&
            data?.human_verification_available !== false &&
            data.turnstile_action === 'password_step_up_code'
        );
    }

    /**
     * @param {unknown} error
     * @returns {boolean}
     */
    _isRetryablePasswordStepUpAuthError(error) {
        if (!(error instanceof Error)) { return true; }
        const statusValue = /** @type {{status?: unknown}} */ (error).status;
        if (typeof statusValue !== 'number' || !Number.isFinite(statusValue)) {
            return true;
        }
        return (
            statusValue === 408 ||
            statusValue === 425 ||
            statusValue === 429 ||
            statusValue >= 500
        );
    }

    /**
     * @param {string} transaction
     * @param {boolean} humanVerificationAvailable
     */
    async _beginPasswordStepUp(transaction, humanVerificationAvailable = false) {
        const response = await this._client.requestPasswordStepUp(transaction);
        if (!response || typeof response.challenge_id !== 'string') {
            throw new Error('Unable to create verification challenge');
        }
        this._passwordInput.value = '';
        this._passwordStepUpCodeInput.value = '';
        this._passwordStepUpTransaction = transaction;
        this._passwordStepUpChallengeId = response.challenge_id;
        this._passwordStepUpProof = null;
        this._passwordStepUpHumanVerificationToken = null;
        this._passwordStepUpHumanVerificationContext = null;
        this._passwordHumanRecoveryAvailable = humanVerificationAvailable;
        this._passwordHumanVerificationAction = humanVerificationAvailable ? 'password_recovery' : null;
        this._authForm.hidden = true;
        this._passwordStepUpForm.hidden = false;
        this._passwordHumanVerificationForm.hidden = !humanVerificationAvailable;
        this._setStatus(
            getMessage('settings_sottaku_step_up_code_sent') || 'Enter the eight-digit code sent to your email',
            false,
        );
    }

    /** @param {Event} e */
    async _onPasswordStepUpVerify(e) {
        e.preventDefault();
        await this._verifyPasswordStepUp(this._passwordStepUpHumanVerificationToken);
    }

    /**
     * @param {string|null} humanVerificationToken
     * @param {string|null} humanVerificationContext
     */
    async _verifyPasswordStepUp(
        humanVerificationToken,
        humanVerificationContext = this._passwordStepUpHumanVerificationContext,
    ) {
        const code = this._passwordStepUpCodeInput.value.replace(/\D/gu, '').slice(0, 8);
        if (this._busy || !this._passwordStepUpChallengeId || code.length !== 8) { return; }
        try {
            this._busy = true;
            const response = await this._client.verifyPasswordStepUp(
                this._passwordStepUpChallengeId,
                code,
                humanVerificationToken,
                humanVerificationContext,
            );
            if (!response || typeof response.password_step_up_token !== 'string') {
                throw new Error('Unable to verify code');
            }
            this._passwordStepUpCodeInput.value = '';
            this._passwordStepUpProof = response.password_step_up_token;
            this._passwordStepUpHumanVerificationToken = null;
            this._passwordStepUpHumanVerificationContext = null;
            this._passwordHumanVerificationAction = null;
            this._passwordHumanRecoveryAvailable = false;
            this._passwordStepUpForm.hidden = true;
            this._passwordHumanVerificationForm.hidden = true;
            this._authForm.hidden = false;
            this._setStatus(
                getMessage('settings_sottaku_step_up_reenter_password') || 'Code verified. Re-enter your password to sign in.',
                false,
            );
        } catch (error) {
            if (this._isPasswordStepUpHumanVerificationRequired(error)) {
                this._passwordStepUpCodeInput.value = '';
                this._passwordStepUpHumanVerificationToken = null;
                this._passwordStepUpHumanVerificationContext = null;
                this._beginPasswordHumanVerification('password_step_up_code', null);
            } else if (this._isRetryablePasswordStepUpAuthError(error)) {
                this._setStatus(toError(error).message || 'Unable to verify code', true);
            } else {
                this._passwordStepUpCodeInput.value = '';
                this._passwordStepUpHumanVerificationToken = null;
                this._passwordStepUpHumanVerificationContext = null;
                this._setStatus(
                    getMessage('settings_sottaku_step_up_invalid_code') || 'That code is invalid or expired',
                    true,
                );
            }
        } finally {
            this._busy = false;
        }
    }

    /**
     * @param {'password_recovery'|'password_step_up_code'} action
     * @param {string|null} transaction
     */
    _beginPasswordHumanVerification(action, transaction) {
        this._closePasswordHumanVerificationPopup();
        this._passwordStepUpHumanVerificationToken = null;
        this._passwordStepUpHumanVerificationContext = null;
        if (action === 'password_recovery') {
            if (!transaction) { return; }
            this._passwordStepUpTransaction = transaction;
            this._passwordStepUpChallengeId = null;
            this._passwordStepUpProof = null;
            this._passwordStepUpCodeInput.value = '';
        }
        this._passwordInput.value = '';
        this._passwordHumanVerificationAction = action;
        this._authForm.hidden = true;
        this._passwordStepUpForm.hidden = true;
        this._passwordHumanVerificationForm.hidden = false;
        this._setStatus(
            getMessage('settings_sottaku_human_verification_instruction') ||
            'Complete the human-verification check to continue.',
            false,
        );
    }

    /** @param {Event} e */
    _onPasswordHumanVerificationClick(e) {
        e.preventDefault();
        const action = this._passwordHumanVerificationAction;
        const transaction = this._passwordStepUpTransaction;
        if (this._busy || !action || !transaction) { return; }
        try {
            const request = this._client.createPasswordHumanVerificationRequest(
                action,
                transaction,
            );
            this._closePasswordHumanVerificationPopup();
            const popup = globalThis.open(
                request.url,
                'sottaku-password-human-verification',
                'popup,width=520,height=680',
            );
            if (!popup) {
                throw new Error('Unable to open human verification');
            }
            this._passwordHumanVerificationRequest = {
                popup,
                expectedOrigin: request.expectedOrigin,
                state: request.state,
                action: request.action,
                transaction: request.stepUpTransaction,
            };
            this._setStatus(
                getMessage('settings_sottaku_human_verification_instruction') ||
                'Complete the human-verification check to continue.',
                false,
            );
        } catch (error) {
            this._setStatus(toError(error).message, true);
        }
    }

    /** @param {MessageEvent} event */
    async _onPasswordHumanVerificationMessage(event) {
        const request = this._passwordHumanVerificationRequest;
        const action = this._passwordHumanVerificationAction;
        const transaction = this._passwordStepUpTransaction;
        let message = event.data;
        if (typeof message === 'string') {
            try {
                message = JSON.parse(message);
            } catch (e) {
                return;
            }
        }
        if (
            !request ||
            !action ||
            !transaction ||
            request.action !== action ||
            request.transaction !== transaction ||
            event.origin !== request.expectedOrigin ||
            event.source !== request.popup ||
            !isObjectNotArray(message) ||
            message.type !== PASSWORD_HUMAN_VERIFICATION_MESSAGE ||
            message.action !== action ||
            message.step_up_transaction !== transaction ||
            typeof message.state !== 'string' ||
            !/^[A-Za-z0-9_-]{43}$/u.test(message.state) ||
            !passwordHumanVerificationStatesMatch(message.state, request.state) ||
            typeof message.human_verification_context !== 'string' ||
            typeof message.token !== 'string'
        ) {
            return;
        }
        const token = message.token.trim();
        const humanVerificationContext = message.human_verification_context.trim();
        if (
            !token ||
            token.length > 2048 ||
            !/^[A-Za-z0-9_-]{40,96}$/u.test(humanVerificationContext)
        ) { return; }

        this._closePasswordHumanVerificationPopup();
        this._passwordHumanVerificationAction = null;

        if (action === 'password_step_up_code') {
            this._passwordStepUpHumanVerificationToken = token;
            this._passwordStepUpHumanVerificationContext = humanVerificationContext;
            this._passwordHumanVerificationForm.hidden = true;
            this._passwordStepUpForm.hidden = false;
            this._setStatus(
                getMessage('settings_sottaku_step_up_code_sent') ||
                'Security check complete. Enter the eight-digit code.',
                false,
            );
            return;
        }

        if (this._busy || !this._passwordStepUpTransaction) { return; }
        try {
            this._busy = true;
            const response = await this._client.verifyPasswordRecoveryHuman(
                transaction,
                token,
                humanVerificationContext,
            );
            if (!response || typeof response.password_step_up_token !== 'string') {
                throw new Error('Unable to verify human challenge');
            }
            this._passwordStepUpProof = response.password_step_up_token;
            this._passwordHumanRecoveryAvailable = false;
            this._passwordHumanVerificationForm.hidden = true;
            this._passwordStepUpForm.hidden = true;
            this._authForm.hidden = false;
            this._setStatus(
                getMessage('settings_sottaku_step_up_reenter_password') ||
                'Verification complete. Re-enter your password to sign in.',
                false,
            );
        } catch (error) {
            if (this._isRetryablePasswordStepUpAuthError(error)) {
                this._passwordHumanVerificationAction = 'password_recovery';
                this._setStatus(toError(error).message || 'Unable to verify human challenge', true);
            } else {
                this._clearPasswordStepUpSecrets();
                this._authForm.hidden = false;
                this._setStatus(
                    getMessage('settings_sottaku_password_recovery_support_required') ||
                    'Please contact Sottaku support to recover access.',
                    true,
                );
            }
        } finally {
            this._busy = false;
        }
    }

    /** @param {Event} e */
    async _onPasswordStepUpResend(e) {
        e.preventDefault();
        if (this._busy || !this._passwordStepUpTransaction || !this._passwordStepUpChallengeId) { return; }
        try {
            this._busy = true;
            const response = await this._client.resendPasswordStepUp(
                this._passwordStepUpTransaction,
                this._passwordStepUpChallengeId,
            );
            if (!response?.accepted) {
                throw new Error(
                    getMessage('settings_sottaku_step_up_resend_unavailable') ||
                    getMessage('settings_sottaku_step_up_invalid_code'),
                );
            }
            this._passwordStepUpCodeInput.value = '';
            this._setStatus(
                getMessage('settings_sottaku_step_up_code_sent') || 'Enter the eight-digit code sent to your email',
                false,
            );
        } catch {
            this._setStatus(
                getMessage('settings_sottaku_step_up_resend_unavailable'),
                true,
            );
        } finally {
            this._busy = false;
        }
    }

    /** */
    _clearPasswordStepUpSecrets() {
        this._passwordInput.value = '';
        this._passwordStepUpCodeInput.value = '';
        this._passwordStepUpTransaction = null;
        this._passwordStepUpChallengeId = null;
        this._passwordStepUpProof = null;
        this._passwordStepUpHumanVerificationToken = null;
        this._passwordStepUpHumanVerificationContext = null;
        this._passwordHumanVerificationAction = null;
        this._passwordHumanRecoveryAvailable = false;
        this._closePasswordHumanVerificationPopup();
        this._passwordStepUpForm.hidden = true;
        this._passwordHumanVerificationForm.hidden = true;
    }

    /** */
    _closePasswordHumanVerificationPopup() {
        const request = this._passwordHumanVerificationRequest;
        this._passwordHumanVerificationRequest = null;
        if (request) {
            try { request.popup.close(); } catch (e) { /* NOP */ }
        }
    }

    /**
     * @param {Event} e
     */
    async _onBrowserLinkClick(e) {
        e.preventDefault();
        if (this._busy) { return; }
        /** @type {chrome.tabs.Tab|null} */
        let tab = null;
        try {
            this._busy = true;
            this._setStatus(getMessage('settings_sottaku_use_browser_session_title') || 'Use your signed-in browser session', false);
            const {linkToken, url} = this._client.createBrowserLink();
            tab = await this._openTab(url);
            for (let attempt = 0; attempt < 300; ++attempt) {
                const data = await this._client.exchangeBrowserLink(linkToken);
                if (data?.status === 'linked' && typeof data.token === 'string') {
                    await this._applyAuthUpdate(
                        data.token,
                        isObjectNotArray(data.user) ? data.user : null,
                        data.refreshToken,
                    );
                    if (typeof tab.id === 'number') {
                        await this._closeTab(tab.id);
                    }
                    return;
                }
                await this._delay(1000);
            }
            this._setStatus(
                getMessage('settings_sottaku_status_sign_in_required') || 'Browser approval timed out',
                true,
            );
        } catch (error) {
            this._setStatus(toError(error).message, true);
        } finally {
            this._busy = false;
        }
    }

    /**
     * @param {Event} e
     */
    async _onLogoutClick(e) {
        e.preventDefault();
        if (this._busy) { return; }
        try {
            this._busy = true;
            try {
                await this._client.logout();
            } catch (error) {
                // Local sign-out still succeeds if the server is unreachable.
            }
            await this._settingsController.modifyProfileSettings([
                {action: 'set', path: 'sottaku.authToken', value: ''},
                {action: 'set', path: 'sottaku.refreshToken', value: ''},
                {action: 'set', path: 'sottaku.user', value: null},
            ]);
            this._client.setConfig({authToken: '', refreshToken: ''});
            this._updateStatus({authToken: '', user: null, enabled: false});
            await this._settingsController.refresh();
            this._setStatus(getMessage('settings_sottaku_status_signed_out') || 'Signed out of Sottaku', false);
        } catch (error) {
            this._setStatus(toError(error).message, true);
        } finally {
            this._busy = false;
        }
    }

    /**
     * @param {string} token
     * @param {unknown} user
     * @param {string|undefined} refreshToken
     */
    async _applyAuthUpdate(token, user, refreshToken) {
        const normalizedUser = this._normalizeUser(user);
        /** @type {import('settings-modifications').Modification[]} */
        const updates = [
            {action: 'set', path: 'sottaku.authToken', value: token},
            {action: 'set', path: 'sottaku.refreshToken', value: refreshToken || ''},
            {action: 'set', path: 'sottaku.enabled', value: true},
            {action: 'set', path: 'sottaku.user', value: normalizedUser},
        ];
        await this._settingsController.modifyProfileSettings(updates);
        this._client.setConfig({authToken: token, refreshToken: refreshToken || ''});
        this._updateStatus({authToken: token, user: normalizedUser, enabled: true});
        await this._settingsController.refresh();
    }

    /**
     * @param {{authToken?: string, user?: unknown, enabled?: boolean}|null} [override]
     */
    _updateStatus(override = null) {
        const options = this._options;
        if (!options) { return; }
        const {sottaku} = options;
        const authToken = override && 'authToken' in override ? override.authToken : sottaku.authToken;
        const user = override && 'user' in override ? override.user : sottaku.user;
        const enabled = override && 'enabled' in override ? override.enabled : sottaku.enabled;
        const isLinked = Boolean(enabled && authToken);
        let message = getMessage('settings_sottaku_status_not_connected') || 'Not connected';
        if (isLinked) {
            message = this._getSignedInStatusText(user);
        }
        this._authForm.hidden = isLinked;
        this._linkedActions.hidden = !isLinked;
        this._setStatus(message, !isLinked && !authToken);
    }

    /** */
    async _ensureUserDetails() {
        if (!this._options) { return; }
        const {sottaku} = this._options;
        if (!sottaku.enabled || !sottaku.authToken) { return; }
        if (this._loadingUser) { return; }
        if (this._getUserDisplayName(sottaku.user)) { return; }
        this._loadingUser = true;
        try {
            const profile = /** @type {Record<string, unknown>} */ (await this._client.getProfile());
            const normalizedUser = this._normalizeUser(profile?.user);
            if (normalizedUser) {
                await this._settingsController.modifyProfileSettings([
                    {action: 'set', path: 'sottaku.user', value: normalizedUser},
                ]);
                this._updateStatus({authToken: sottaku.authToken, user: normalizedUser, enabled: true});
            }
        } catch (e) {
            // Best-effort; ignore profile fetch errors for display purposes
        } finally {
            this._loadingUser = false;
        }
    }

    /** */
    async _loadSupportedLanguages() {
        if (!this._options || !this._options.sottaku.authToken) { return; }
        try {
            const response = await this._client.getSupportedLanguages();
            const languages = this._normalizeSupportedLanguagesResponse(response);
            if (languages.length === 0) { return; }
            const currentKey = this._supportedLanguages.join(',');
            const nextKey = languages.join(',');
            if (currentKey === nextKey) { return; }
            this._supportedLanguages = languages;
            this._updateLanguageModeOptions();
            const normalizedPreferred = normalizeSottakuLanguages(
                this._preferredLanguages,
                this._options.general.language,
                this._supportedLanguages,
            );
            const preferredChanged = normalizedPreferred.join(',') !== this._preferredLanguages.join(',');
            this._preferredLanguages = normalizedPreferred;
            if (preferredChanged) {
                await this._settingsController.modifyProfileSettings([
                    {action: 'set', path: 'sottaku.preferredLanguages', value: normalizedPreferred},
                ]);
            }
            this._renderLanguageList();
        } catch (e) {
            // Best-effort; ignore fetch errors and keep existing defaults.
        }
    }

    /**
     * @param {unknown} user
     * @returns {string}
     */
    _getUserDisplayName(user) {
        if (!isObjectNotArray(user)) { return ''; }
        const {username, email, name} = /** @type {{username?: unknown, email?: unknown, name?: unknown}} */ (user);
        const candidates = [username, email, name];
        for (const candidate of candidates) {
            if (typeof candidate === 'string') {
                const trimmed = candidate.trim();
                if (trimmed.length > 0) {
                    return trimmed;
                }
            }
        }
        return '';
    }

    /**
     * @param {unknown} user
     * @returns {string}
     */
    _getSignedInStatusText(user) {
        const name = this._getUserDisplayName(user);
        if (name) {
            return getMessage('settings_sottaku_status_signed_in_as', [name]) || `Signed in as ${name}`;
        }
        return getMessage('settings_sottaku_status_signed_in') || 'Signed in';
    }

    /**
     * @param {unknown} user
     * @returns {import('settings').SottakuUser|null}
     */
    _normalizeUser(user) {
        if (!isObjectNotArray(user)) { return null; }
        const idRaw = /** @type {{id?: unknown}} */ (user).id;
        let id = 0;
        if (typeof idRaw === 'number' && Number.isFinite(idRaw)) {
            id = idRaw;
        } else if (typeof idRaw === 'string') {
            const parsed = Number.parseInt(idRaw, 10);
            if (Number.isFinite(parsed)) {
                id = parsed;
            }
        }
        const normalized = /** @type {import('settings').SottakuUser} */ ({
            id,
            username: null,
            email: null,
            isPro: user.isPro === true || user.is_pro === true,
        });
        const username = /** @type {{username?: unknown, name?: unknown}} */ (user).username ?? /** @type {{username?: unknown, name?: unknown}} */ (user).name;
        if (typeof username === 'string' || username === null) {
            normalized.username = username;
        }
        const email = /** @type {{email?: unknown}} */ (user).email;
        if (typeof email === 'string' || email === null) {
            normalized.email = email;
        }
        if (typeof /** @type {{name?: unknown}} */ (user).name === 'string') {
            /** @type {{name?: string}} */ (normalized).name = /** @type {string} */ (user.name);
        }
        const uiLocale = (
            /** @type {{ui_locale?: unknown, uiLocale?: unknown}} */ (user).ui_locale ??
            /** @type {{ui_locale?: unknown, uiLocale?: unknown}} */ (user).uiLocale
        );
        if (typeof uiLocale === 'string' && uiLocale.trim().length > 0) {
            /** @type {{ui_locale?: string}} */ (normalized).ui_locale = uiLocale.trim();
        }
        return normalized;
    }

    /**
     * @param {string} text
     * @param {boolean} isError
     */
    _setStatus(text, isError) {
        // The account locale may finish loading after this dynamic status.
        // Do not let that pass restore the static "Not connected" placeholder.
        delete this._statusNode.dataset.i18n;
        this._statusNode.textContent = text;
        this._statusNode.classList.toggle('danger-text', !!isError);
    }

    /** */
    _renderLanguageList() {
        if (!this._options) { return; }
        const preferred = this._preferredLanguages;
        this._languageList.textContent = '';
        const total = preferred.length;
        for (let i = 0; i < total; ++i) {
            this._languageList.appendChild(this._createLanguageRow(preferred[i], i, total));
        }
        this._refreshLanguageAddOptions(preferred);
    }

    /** */
    _updateLanguageModeOptions() {
        for (const [language, option] of this._adminPreviewLanguageModeOptions) {
            const supported = this._supportedLanguages.includes(language);
            option.hidden = !supported;
            option.disabled = !supported;
        }
    }

    /**
     * @param {string} language
     * @param {number} index
     * @param {number} total
     * @returns {HTMLElement}
     */
    _createLanguageRow(language, index, total) {
        const node = /** @type {HTMLElement} */ (this._settingsController.instantiateTemplate('sottaku-language-row'));
        querySelectorNotNull(node, '.sottaku-language-flag').textContent = getSottakuLanguageFlag(language);
        querySelectorNotNull(node, '.sottaku-language-name').textContent = this._getLanguageName(language);
        querySelectorNotNull(node, '.sottaku-language-index').textContent = `${index + 1}`;

        /** @type {HTMLButtonElement} */
        const moveUpButton = querySelectorNotNull(node, '.sottaku-language-move-up');
        moveUpButton.disabled = index === 0;
        moveUpButton.addEventListener('click', () => { void this._moveLanguage(index, -1); }, false);

        /** @type {HTMLButtonElement} */
        const moveDownButton = querySelectorNotNull(node, '.sottaku-language-move-down');
        moveDownButton.disabled = index >= total - 1;
        moveDownButton.addEventListener('click', () => { void this._moveLanguage(index, 1); }, false);

        /** @type {HTMLButtonElement} */
        const removeButton = querySelectorNotNull(node, '.sottaku-language-remove');
        removeButton.disabled = total <= 1;
        removeButton.addEventListener('click', () => { void this._removeLanguage(index); }, false);

        return node;
    }

    /**
     * @param {string[]} selectedLanguages
     */
    _refreshLanguageAddOptions(selectedLanguages) {
        const selected = new Set(selectedLanguages);
        this._languageAddSelect.textContent = '';
        const available = this._supportedLanguages.filter((language) => !selected.has(language));
        for (const language of available) {
            const option = document.createElement('option');
            option.value = language;
            option.textContent = `${getSottakuLanguageFlag(language)} ${this._getLanguageName(language)}`;
            this._languageAddSelect.appendChild(option);
        }
        if (available.length > 0) {
            this._languageAddSelect.selectedIndex = 0;
        }
        this._languageAddSelect.disabled = available.length === 0;
        this._languageAddButton.disabled = available.length === 0;
    }

    /** @param {Event} e */
    _onLanguageAdd(e) {
        e.preventDefault();
        if (!this._options || this._languageAddSelect.disabled) { return; }
        const language = this._languageAddSelect.value;
        if (!language) { return; }
        if (this._preferredLanguages.includes(language)) { return; }
        const preferred = [...this._preferredLanguages, language];
        void this._updatePreferredLanguages(preferred);
    }

    /**
     * @param {number} index
     * @param {number} delta
     */
    async _moveLanguage(index, delta) {
        if (!this._options) { return; }
        const preferred = [...this._preferredLanguages];
        const newIndex = index + delta;
        if (newIndex < 0 || newIndex >= preferred.length) { return; }
        const [language] = preferred.splice(index, 1);
        preferred.splice(newIndex, 0, language);
        await this._updatePreferredLanguages(preferred);
    }

    /**
     * @param {number} index
     */
    async _removeLanguage(index) {
        if (!this._options) { return; }
        const preferred = [...this._preferredLanguages];
        if (index < 0 || index >= preferred.length) { return; }
        preferred.splice(index, 1);
        await this._updatePreferredLanguages(preferred);
    }

    /**
     * @param {string[]} languages
     */
    async _updatePreferredLanguages(languages) {
        if (!this._options) { return; }
        const normalized = normalizeSottakuLanguages(
            languages,
            this._options.general.language,
            this._supportedLanguages,
        );
        this._preferredLanguages = normalized;
        this._renderLanguageList();
        try {
            await this._settingsController.modifyProfileSettings([
                {action: 'set', path: 'sottaku.preferredLanguages', value: normalized},
            ]);
        } catch (e) {
            this._setStatus(toError(e).message, true);
            const options = await this._settingsController.getOptions();
            this._onOptionsChanged({options, optionsContext: this._settingsController.getOptionsContext()});
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

    /**
     * @param {number} tabId
     * @returns {Promise<void>}
     */
    _closeTab(tabId) {
        return new Promise((resolve) => {
            chrome.tabs.remove(tabId, () => { resolve(void 0); });
        });
    }

    /**
     * @param {number} milliseconds
     * @returns {Promise<void>}
     */
    _delay(milliseconds) {
        return new Promise((resolve) => {
            setTimeout(resolve, milliseconds);
        });
    }

    /**
     * @param {string} language
     * @returns {string}
     */
    _getLanguageName(language) {
        const name = getSottakuLanguageName(language);
        return name || language;
    }

    /**
     * @param {unknown} response
     * @returns {string[]}
     */
    _normalizeSupportedLanguagesResponse(response) {
        const data = (response && typeof response === 'object') ? /** @type {Record<string, unknown>} */ (response) : {};
        const candidates = Array.isArray(data.languages) ?
            data.languages :
            (Array.isArray(data.supported_languages) ? data.supported_languages : []);
        return normalizeSottakuSupportedLanguages(candidates);
    }
}
