/*
 * Lightweight controller that adds Sottaku-specific actions to dictionary entries.
 */

import {SottakuClient} from '../comm/sottaku-client.js';
import {EventListenerCollection} from '../core/event-listener-collection.js';
import {toError} from '../core/to-error.js';

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
            cookieDomain: sottaku?.cookieDomain,
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
            const container = node.querySelector('.note-actions-container');
            if (!container) { continue; }
            this._removeOldButtons(container);

            if (hasDefinition) {
                const addButton = this._createButton('Save to Sottaku', metadata.inFlashcards);
                this._eventListeners.addEventListener(addButton, 'click', this._wrapAsync(() => this._addFlashcard(entry, addButton)));
                container.appendChild(addButton);
            } else {
                const requestButton = this._createButton('Request dictionary entry', false);
                this._eventListeners.addEventListener(requestButton, 'click', this._wrapAsync(() => this._requestWord(entry, requestButton)));
                container.appendChild(requestButton);
            }
        }
    }

    /**
     * @param {string} label
     * @param {boolean} disabled
     * @returns {HTMLButtonElement}
     */
    _createButton(label, disabled) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.classList.add('action-button', 'sottaku-action');
        button.disabled = disabled;
        if (disabled) {
            button.title = 'Already saved to Sottaku';
        }
        return button;
    }

    /**
     * @param {Element} container
     */
    _removeOldButtons(container) {
        for (const button of [...container.querySelectorAll('.sottaku-action')]) {
            button.remove();
        }
    }

    /** */
    _clearButtons() {
        for (const node of this._display.dictionaryEntryNodes) {
            for (const button of [...node.querySelectorAll('.sottaku-action')]) {
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
            button.title = 'Sign in to Sottaku first';
            return;
        }
        const metadata = this._getMetadata(entry);
        if (!metadata?.questionId) {
            button.title = 'Missing Sottaku question id';
            return;
        }
        button.disabled = true;
        button.textContent = 'Saving...';
        try {
            await this._client.addFlashcard(metadata.questionId, metadata.language || this._options.general.language);
            metadata.inFlashcards = true;
            button.textContent = 'Saved';
            button.title = 'Added to your Sottaku flashcards';
        } catch (e) {
            button.disabled = false;
            button.textContent = 'Save to Sottaku';
            button.title = toError(e).message;
        }
    }

    /**
     * @param {import('dictionary').DictionaryEntry} entry
     * @param {HTMLButtonElement} button
     */
    async _requestWord(entry, button) {
        if (!this._options || !this._enabled) {
            button.title = 'Sign in to Sottaku first';
            return;
        }
        const metadata = this._getMetadata(entry);
        if (!metadata?.questionId) {
            button.title = 'Missing Sottaku question id';
            return;
        }
        button.disabled = true;
        button.textContent = 'Requesting...';
        try {
            await this._client.submitWordRequest(metadata.questionId, metadata.language || this._options.general.language);
            button.textContent = 'Requested';
            button.title = 'Request submitted to Sottaku';
        } catch (e) {
            button.disabled = false;
            button.textContent = 'Request translation';
            button.title = toError(e).message;
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
     * @param {import('dictionary').DictionaryEntry} entry
     * @returns {any}
     */
    _getMetadata(entry) {
        return entry && typeof entry === 'object' ? /** @type {any} */ (entry).sottaku : null;
    }
}
