import {SottakuClient} from '../comm/sottaku-client.js';
import {localizeElement, setLocale} from './i18n.js';

const AUTO_LOCALE_TTL_MS = 5 * 60 * 1000;

/**
 * @param {string} locale
 * @returns {string}
 */
function normalizeLocale(locale) {
    if (typeof locale !== 'string') { return ''; }
    const trimmed = locale.trim();
    if (!trimmed) { return ''; }
    return trimmed.replace(/_/g, '-').toLowerCase();
}

/**
 * @param {string} locale
 * @returns {boolean}
 */
function isArabicLocale(locale) {
    return /^ar($|[-_])/.test(locale);
}

export class LocaleDirectionController {
    constructor() {
        /** @type {SottakuClient} */
        this._client = new SottakuClient();
        /** @type {?string} */
        this._apiBaseUrl = null;
        /** @type {string} */
        this._authToken = '';
        /** @type {string} */
        this._cookieDomain = '';
        /** @type {string|null} */
        this._automaticLocale = null;
        /** @type {number} */
        this._automaticLocaleTimestamp = 0;
        /** @type {Promise<string>|null} */
        this._automaticLocalePromise = null;
    }

    /**
     * @param {import('settings').ProfileOptions} options
     */
    async applyFromOptions(options) {
        if (!options || typeof options !== 'object') { return; }
        this._configureClient(options);
        const locale = await this._resolveLocale(options);
        const resolvedLocale = await this._applyLocale(locale);
        this._applyDirection(resolvedLocale || locale);
    }

    /**
     * @param {import('settings').ProfileOptions} options
     */
    _configureClient(options) {
        const {sottaku} = options;
        const apiBaseUrl = typeof sottaku?.apiBaseUrl === 'string' ? sottaku.apiBaseUrl : null;
        const authToken = typeof sottaku?.authToken === 'string' ? sottaku.authToken : '';
        const cookieDomain = typeof sottaku?.cookieDomain === 'string' ? sottaku.cookieDomain : '';

        if (apiBaseUrl === this._apiBaseUrl && authToken === this._authToken && cookieDomain === this._cookieDomain) { return; }

        this._apiBaseUrl = apiBaseUrl;
        this._authToken = authToken;
        this._cookieDomain = cookieDomain;
        this._automaticLocale = null;
        this._automaticLocaleTimestamp = 0;
        this._client.setConfig({
            apiBaseUrl: this._apiBaseUrl || undefined,
            authToken: this._authToken,
            cookieDomain: this._cookieDomain,
        });
    }

    /**
     * @param {import('settings').ProfileOptions} options
     * @returns {Promise<string>}
     */
    async _resolveLocale(options) {
        const configuredLocale = typeof options?.sottaku?.locale === 'string' ? options.sottaku.locale.trim() : '';
        if (configuredLocale) { return configuredLocale; }
        const storedLocale = (
            typeof options?.sottaku?.user?.ui_locale === 'string' ? options.sottaku.user.ui_locale :
            typeof options?.sottaku?.user?.uiLocale === 'string' ? options.sottaku.user.uiLocale :
            ''
        ).trim();
        if (storedLocale) {
            this._automaticLocale = storedLocale;
            this._automaticLocaleTimestamp = Date.now();
            return storedLocale;
        }
        if (!this._authToken) { return ''; }

        const now = Date.now();
        if (this._automaticLocale !== null && (now - this._automaticLocaleTimestamp) <= AUTO_LOCALE_TTL_MS) {
            return this._automaticLocale;
        }
        if (this._automaticLocalePromise !== null) {
            return await this._automaticLocalePromise;
        }

        this._automaticLocalePromise = (async () => {
            try {
                const settings = await this._client.getLanguageSettings();
                const locale = typeof settings?.locale === 'string' ? settings.locale.trim() : '';
                this._automaticLocale = locale;
                this._automaticLocaleTimestamp = Date.now();
                return locale;
            } catch (e) {
                this._automaticLocale = '';
                this._automaticLocaleTimestamp = Date.now();
                return '';
            } finally {
                this._automaticLocalePromise = null;
            }
        })();

        return await this._automaticLocalePromise;
    }

    /**
     * @param {string} locale
     */
    _applyDirection(locale) {
        if (typeof locale !== 'string') { return; }
        const normalized = normalizeLocale(locale);
        if (!normalized) { return; }
        const root = document.documentElement;
        if (!root) { return; }
        root.setAttribute('dir', isArabicLocale(normalized) ? 'rtl' : 'ltr');
    }

    /**
     * @param {string} locale
     * @returns {Promise<string>}
     */
    async _applyLocale(locale) {
        const {changed, locale: resolvedLocale} = await setLocale(locale);
        if (resolvedLocale) {
            const root = document.documentElement;
            if (root) {
                root.setAttribute('lang', resolvedLocale.replace(/_/g, '-'));
            }
        }
        if (changed) {
            localizeElement(document);
        }
        return resolvedLocale || '';
    }
}
