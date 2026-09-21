/*
 * Copyright (C) 2025-2026  Sottaku Inc
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

import {EventListenerCollection} from '../core/event-listener-collection.js';
import {getMessage} from '../dom/i18n.js';

/** A deliberate lookup action which leaves native text selection in control. */
export class MobileSelectionController {
    /**
     * @param {(range: Range) => Promise<void>} lookup
     * @param {() => void} dismissPopup
     * @param {(target: EventTarget|null) => boolean} isPopupTarget
     */
    constructor(lookup, dismissPopup, isPopupTarget) {
        /** @type {(range: Range) => Promise<void>} */
        this._lookup = lookup;
        /** @type {() => void} */
        this._dismissPopup = dismissPopup;
        /** @type {(target: EventTarget|null) => boolean} */
        this._isPopupTarget = isPopupTarget;
        /** @type {EventListenerCollection} */
        this._listeners = new EventListenerCollection();
        /** @type {boolean} */
        this._enabled = false;
        /** @type {boolean} */
        this._pressingAction = false;
        /** @type {boolean} */
        this._touching = false;
        /** @type {boolean} */
        this._pending = false;
        /** @type {?ReturnType<typeof setTimeout>} */
        this._timer = null;
        /** @type {?Range} */
        this._range = null;
        /** @type {?Range} */
        this._dismissedRange = null;
        /** @type {string} */
        this._dismissedText = '';
        /** @type {?HTMLDivElement} */
        this._host = null;
        /** @type {?HTMLButtonElement} */
        this._lookupButton = null;
        /** @type {?HTMLDivElement} */
        this._label = null;
        /** @type {boolean} */
        this._failed = false;
    }

    /** @returns {boolean} */
    get enabled() { return this._enabled; }

    /** @param {boolean} enabled */
    setEnabled(enabled) {
        if (this._enabled === enabled) { return; }
        this._enabled = enabled;
        this._listeners.removeAllEventListeners();
        this._hide();
        this._dismissedRange = null;
        this._touching = false;
        this._pressingAction = false;
        if (!enabled) {
            this._host?.remove();
            this._host = null;
            return;
        }
        this._listeners.addEventListener(document, 'selectionchange', () => {
            if (!this._pressingAction && !this._pending && window.getSelection()?.isCollapsed) {
                this._dismissedRange = null;
                this._range = null;
            }
            this._schedule();
        });
        this._listeners.addEventListener(document, 'pointerdown', this._onPointerDown.bind(this), true);
        this._listeners.addEventListener(document, 'pointerup', () => this._onPointerEnd(), true);
        this._listeners.addEventListener(document, 'pointercancel', () => {
            this._pressingAction = false;
            this._onPointerEnd();
        }, true);
        this._listeners.addEventListener(document, 'scroll', () => {
            this._dismissPopup();
            this._schedule();
        }, {capture: true, passive: true});
        this._listeners.addEventListener(window, 'resize', () => this._schedule());
        this._listeners.addEventListener(document, 'visibilitychange', () => {
            this._dismissPopup();
            this._hide();
        });
        this._listeners.addEventListener(document, 'keydown', (/** @type {KeyboardEvent} */ event) => {
            if (event.key === 'Escape') { this._dismiss(); }
        });
        if (window.visualViewport !== null && typeof window.visualViewport !== 'undefined') {
            this._listeners.addEventListener(window.visualViewport, 'resize', () => this._schedule());
            this._listeners.addEventListener(window.visualViewport, 'scroll', () => this._schedule());
        }
        this._schedule();
    }

    /** @param {PointerEvent} event */
    _onPointerDown(event) {
        if (event.target === this._host || this._isPopupTarget(event.target)) { return; }
        this._touching = true;
        this._pressingAction = false;
        this._hide();
        this._dismissPopup();
    }

    /** */
    _onPointerEnd() {
        this._touching = false;
        if (!this._pressingAction) {
            this._schedule();
        } else {
            // A gesture dragged off the button need not produce a click.
            setTimeout(() => {
                if (!this._pressingAction) { return; }
                this._pressingAction = false;
                this._schedule();
            }, 500);
        }
    }

    /** */
    _hide() {
        if (this._timer !== null) { clearTimeout(this._timer); }
        this._timer = null;
        if (this._host !== null) { this._host.style.display = 'none'; }
    }

    /** */
    _schedule() {
        // Focusing a button can collapse selection before its click arrives.
        if (this._pressingAction) { return; }
        this._hide();
        if (!this._enabled || this._touching || this._pending || document.hidden) { return; }
        this._timer = setTimeout(() => {
            this._timer = null;
            this._show();
        }, 250);
    }

    /** @returns {?Range} */
    _getSelection() {
        const selection = window.getSelection();
        if (selection === null || selection.isCollapsed || selection.rangeCount === 0) { return null; }
        const range = selection.getRangeAt(0);
        const text = range.toString();
        if (text.trim().length === 0 || text.length > 200) { return null; }
        // Do not add controls to password fields, editors, or extension UI.
        for (const node of [range.startContainer, range.endContainer, range.commonAncestorContainer]) {
            const element = node instanceof Element ? node : node.parentElement;
            if (element?.closest('input, textarea, [contenteditable]:not([contenteditable="false"]), .scan-disable')) { return null; }
            if (this._isPopupTarget(element)) { return null; }
        }
        if (!range.startContainer.isConnected || !range.endContainer.isConnected) { return null; }
        return range.cloneRange();
    }

    /** */
    _show() {
        const range = this._getSelection();
        this._range = range;
        if (range === null) {
            this._dismissedRange = null;
            return;
        }
        if (this._dismissedRange !== null && range.toString() === this._dismissedText &&
        range.compareBoundaryPoints(Range.START_TO_START, this._dismissedRange) === 0 &&
        range.compareBoundaryPoints(Range.END_TO_END, this._dismissedRange) === 0) { return; }
        const rect = range.getBoundingClientRect();
        const viewport = window.visualViewport;
        const left = viewport?.offsetLeft ?? 0;
        const top = viewport?.offsetTop ?? 0;
        const width = viewport?.width ?? window.innerWidth;
        const height = viewport?.height ?? window.innerHeight;
        if (rect.bottom < top || rect.top > top + height || rect.right < left || rect.left > left + width) { return; }
        this._host?.remove();
        const host = document.createElement('div');
        this._host = host;
        // Inline style properties and a closed shadow root isolate this small control
        // from site styles without adding a stylesheet to the page's CSP.
        host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;display:block;box-sizing:border-box;';
        const actionWidth = Math.min(360, width - 24);
        host.style.width = `${actionWidth}px`;
        host.style.left = `${left + (width - actionWidth) / 2}px`;
        const root = host.attachShadow({mode: 'closed'});
        const row = document.createElement('div');
        row.dir = 'auto';
        row.style.cssText = 'display:flex;border:1px solid #53627a;border-radius:14px;background:#172438;color:#fff;box-shadow:0 4px 18px #0005;font:15px/1.3 system-ui,sans-serif;overflow:hidden;';
        const lookup = document.createElement('button');
        this._lookupButton = lookup;
        lookup.type = 'button';
        lookup.style.cssText = 'all:unset;box-sizing:border-box;display:block;flex:1;min-width:0;min-height:56px;padding:8px 14px;cursor:pointer;text-align:start;touch-action:manipulation;';
        const label = document.createElement('div');
        this._label = label;
        label.textContent = getMessage('mobile_selection_lookup');
        const preview = document.createElement('div');
        preview.dir = 'auto';
        preview.textContent = range.toString().trim();
        preview.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;color:#d5e3f7;margin-top:3px;';
        lookup.append(label, preview);
        const close = document.createElement('button');
        close.type = 'button';
        close.textContent = '×';
        close.setAttribute('aria-label', getMessage('common_close'));
        close.style.cssText = 'all:unset;box-sizing:border-box;display:grid;place-items:center;min-width:48px;min-height:56px;cursor:pointer;font:24px system-ui,sans-serif;touch-action:manipulation;';
        for (const button of [lookup, close]) {
            button.addEventListener('pointerdown', (event) => {
                this._pressingAction = true;
                event.preventDefault();
                event.stopPropagation();
            });
            button.addEventListener('focus', () => {
                button.style.outline = '2px solid #9ecbff';
                button.style.outlineOffset = '-3px';
            });
            button.addEventListener('blur', () => { button.style.outline = ''; });
        }
        lookup.addEventListener('click', () => { void this._activate(); });
        close.addEventListener('click', () => this._dismiss());
        row.append(lookup, close);
        root.append(row);
        document.documentElement.append(host);
        this._position();
    }

    /** Fit wrapped translations and keep the action away from selection handles. */
    _position() {
        if (this._host === null || this._range === null) { return; }
        const viewport = window.visualViewport;
        const top = viewport?.offsetTop ?? 0;
        const height = viewport?.height ?? window.innerHeight;
        const actionHeight = this._host.getBoundingClientRect().height;
        const nearBottom = this._range.getBoundingClientRect().bottom > top + height - actionHeight - 80;
        this._host.style.top = nearBottom ? `${top + 12}px` : `calc(${top + height - actionHeight - 16}px - env(safe-area-inset-bottom, 0px))`;
    }

    /** */
    _dismiss() {
        this._dismissedRange = this._range?.cloneRange() ?? null;
        this._dismissedText = this._range?.toString() ?? '';
        this._pressingAction = false;
        this._hide();
        this._dismissPopup();
    }

    /** Keep a failed explicit request visible and retryable. */
    showLookupError() {
        this._failed = true;
        if (this._label !== null) {
            this._label.textContent = getMessage('mobile_selection_error');
            this._label.setAttribute('role', 'alert');
        }
        this._position();
    }

    /** @returns {Promise<void>} */
    async _activate() {
        const range = this._range;
        if (!this._enabled || this._pending || range === null) { return; }
        this._dismissedRange = range.cloneRange();
        this._dismissedText = range.toString();
        this._pressingAction = false;
        this._dismissPopup();
        if (!range.startContainer.isConnected || !range.endContainer.isConnected || range.collapsed) { return; }
        this._pending = true;
        this._failed = false;
        if (this._lookupButton !== null) { this._lookupButton.disabled = true; }
        if (this._label !== null) {
            this._label.textContent = getMessage('action_popup_loading');
            this._label.setAttribute('role', 'status');
        }
        try {
            await this._lookup(range.cloneRange());
        } catch {
            this.showLookupError();
        } finally {
            this._pending = false;
            if (this._lookupButton !== null) { this._lookupButton.disabled = false; }
            // A different word may have been highlighted while the old request
            // was finishing. Offer its action without requiring another gesture.
            if (!this._failed || this._host?.style.display === 'none') { this._schedule(); }
        }
    }
}
