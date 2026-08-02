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

import {SottakuClient} from '../comm/sottaku-client.js';
import {EventListenerCollection} from '../core/event-listener-collection.js';
import {toError} from '../core/to-error.js';
import {getMessage} from '../dom/i18n.js';

/**
 * @typedef {object} SottakuEntryMetadata
 * @property {number} [questionId]
 * @property {string} [language]
 * @property {boolean} [hasDefinition]
 * @property {boolean} [inFlashcards]
 * @property {boolean} [requested]
 */

export class DisplaySottaku {
    /**
     * @param {import('./display.js').Display} display
     */
    constructor(display) {
        /** @type {import('./display.js').Display} */
        this._display = display;
        /** @type {SottakuClient} */
        this._client = new SottakuClient();
        /** @type {import('settings').ProfileOptions|null} */
        this._options = null;
        /** @type {boolean} */
        this._enabled = false;
        /** @type {EventListenerCollection} */
        this._eventListeners = new EventListenerCollection();
    }

    /** */
    prepare() {
        this._display.on('optionsUpdated', this._onOptionsUpdated.bind(this));
        this._display.on('contentUpdateComplete', this._onContentUpdateComplete.bind(this));
        this._display.on('contentClear', this._onContentClear.bind(this));
    }

    // Private

    /**
     * @param {import('display').EventArgument<'optionsUpdated'>} details
     */
    _onOptionsUpdated({options}) {
        this._options = options;
        const {sottaku} = options;
        this._enabled = Boolean(sottaku?.enabled && sottaku.authToken);
        this._client.setConfig({
            apiBaseUrl: sottaku?.apiBaseUrl,
            authToken: sottaku?.authToken,
            refreshToken: sottaku?.refreshToken,
        });
        if (!this._enabled) {
            this._clearButtons();
        }
    }

    /** */
    _onContentClear() {
        this._eventListeners.removeAllEventListeners();
        this._clearButtons();
    }

    /** */
    _onContentUpdateComplete() {
        if (!this._enabled) { return; }
        this._renderButtons();
    }

    /** */
    _renderButtons() {
        this._eventListeners.removeAllEventListeners();
        const entries = this._display.dictionaryEntries;
        const nodes = this._display.dictionaryEntryNodes;
        for (let i = 0; i < entries.length; ++i) {
            const entry = entries[i];
            const metadata = this._getMetadata(entry);
            if (!metadata || !metadata.questionId) { continue; }
            const hasDefinition = Boolean(metadata.hasDefinition);
            const node = nodes[i];
            if (!node) { continue; }
            const container = /** @type {?HTMLElement} */ (node.querySelector('.note-actions-container'));
            if (!container) { continue; }
            this._removeOldButtons(container);

            if (hasDefinition) {
                const addButton = this._createButton('sottaku_save_button', 'Save to Sottaku', Boolean(metadata.inFlashcards));
                this._eventListeners.addEventListener(addButton, 'click', this._wrapAsync(() => this._addFlashcard(entry, addButton)));
                container.appendChild(addButton);
            } else {
                const requestButton = this._createButton('sottaku_request_button', 'Request dictionary entry', false);
                requestButton.classList.add('sottaku-request-only');
                if (metadata.requested) {
                    this._setRequestButtonRequestedState(requestButton);
                } else {
                    this._eventListeners.addEventListener(requestButton, 'click', this._wrapAsync(() => this._requestWord(entry, requestButton)));
                }
                // Move to the end so it aligns right when alone
                container.appendChild(requestButton);
                container.style.justifyContent = 'flex-end';
            }
        }
    }

    /**
     * @param {string} labelKey
     * @param {string} fallbackLabel
     * @param {boolean} disabled
     * @returns {HTMLButtonElement}
     */
    _createButton(labelKey, fallbackLabel, disabled) {
        const button = document.createElement('button');
        button.type = 'button';
        button.classList.add('action-button', 'sottaku-action');
        this._setButtonText(button, labelKey, fallbackLabel);
        button.disabled = disabled;
        if (disabled) {
            this._setButtonTitle(button, 'sottaku_save_button_title_already_saved', 'Already saved to Sottaku');
        }
        return button;
    }

    /**
     * @param {Element} container
     */
    _removeOldButtons(container) {
        for (const button of container.querySelectorAll('.sottaku-action')) {
            button.remove();
        }
    }

    /** */
    _clearButtons() {
        for (const node of this._display.dictionaryEntryNodes) {
            for (const button of node.querySelectorAll('.sottaku-action')) {
                button.remove();
            }
        }
    }

    /**
     * @param {import('dictionary').DictionaryEntry} entry
     * @param {HTMLButtonElement} button
     */
    async _addFlashcard(entry, button) {
        if (!this._options || !this._enabled) {
            this._setButtonTitle(button, 'sottaku_action_title_sign_in', 'Sign in to Sottaku first');
            return;
        }
        const metadata = this._getMetadata(entry);
        if (!metadata?.questionId) {
            this._setButtonTitle(button, 'sottaku_action_title_missing_id', 'Missing Sottaku question id');
            return;
        }
        this._lockButtonSize(button);
        button.disabled = true;
        this._setButtonText(button, 'sottaku_save_button_saving', 'Saving...');
        try {
            await this._client.addFlashcard(metadata.questionId, metadata.language || this._options.general.language);
            metadata.inFlashcards = true;
            this._setButtonText(button, 'sottaku_save_button_saved', 'Saved');
            this._setButtonTitle(button, 'sottaku_save_button_title_saved', 'Added to your Sottaku flashcards');
        } catch (e) {
            button.disabled = false;
            this._setButtonText(button, 'sottaku_save_button', 'Save to Sottaku');
            this._setButtonTitle(button, '', toError(e).message);
        }
    }

    /**
     * @param {import('dictionary').DictionaryEntry} entry
     * @param {HTMLButtonElement} button
     */
    async _requestWord(entry, button) {
        if (!this._options || !this._enabled) {
            this._setButtonTitle(button, 'sottaku_action_title_sign_in', 'Sign in to Sottaku first');
            return;
        }
        const metadata = this._getMetadata(entry);
        if (!metadata?.questionId) {
            this._setButtonTitle(button, 'sottaku_action_title_missing_id', 'Missing Sottaku question id');
            return;
        }
        this._lockButtonSize(button);
        button.disabled = true;
        this._setButtonText(button, 'sottaku_request_button_requesting', 'Requesting...');
        try {
            await this._client.submitWordRequest(metadata.questionId, metadata.language || this._options.general.language);
            metadata.requested = true;
            this._setRequestButtonRequestedState(button);
        } catch (e) {
            button.disabled = false;
            this._setButtonText(button, 'sottaku_request_button_retry', 'Request translation');
            this._setButtonTitle(button, '', toError(e).message);
        }
    }

    /**
     * @param {() => Promise<void>} fn
     * @returns {(e: Event) => void}
     */
    _wrapAsync(fn) {
        return (e) => {
            e.preventDefault();
            void fn();
        };
    }

    /**
     * Prevent label changes from shrinking the popup out from under the cursor.
     * @param {HTMLButtonElement} button
     */
    _lockButtonSize(button) {
        if (button.dataset.sizeLocked === 'true') { return; }
        const {width, height} = button.getBoundingClientRect();
        if (Number.isFinite(width) && width > 0) {
            button.style.minWidth = `${Math.ceil(width)}px`;
        }
        if (Number.isFinite(height) && height > 0) {
            button.style.minHeight = `${Math.ceil(height)}px`;
        }
        button.dataset.sizeLocked = 'true';
    }

    /**
     * @param {HTMLButtonElement} button
     */
    _setRequestButtonRequestedState(button) {
        button.disabled = true;
        this._setButtonText(button, 'sottaku_request_button_requested', 'Requested');
        this._setButtonTitle(button, 'sottaku_request_button_title_submitted', 'Request submitted to Sottaku');
    }

    /**
     * @param {import('dictionary').DictionaryEntry} entry
     * @returns {?SottakuEntryMetadata}
     */
    _getMetadata(entry) {
        return entry && typeof entry === 'object' ? /** @type {?SottakuEntryMetadata} */ (/** @type {Record<string, unknown>} */ (entry).sottaku) : null;
    }

    /**
     * @param {HTMLButtonElement} button
     * @param {string} key
     * @param {string} fallback
     */
    _setButtonText(button, key, fallback) {
        if (typeof key === 'string' && key.length > 0) {
            button.dataset.i18n = key;
        } else {
            delete button.dataset.i18n;
        }
        const message = getMessage(key);
        button.textContent = message || fallback;
    }

    /**
     * @param {HTMLButtonElement} button
     * @param {string} key
     * @param {string} fallback
     */
    _setButtonTitle(button, key, fallback) {
        if (typeof key === 'string' && key.length > 0) {
            button.dataset.i18nAttr = `title:${key}`;
            const message = getMessage(key);
            button.title = message || fallback;
            return;
        }
        delete button.dataset.i18nAttr;
        button.title = fallback || '';
    }
}
