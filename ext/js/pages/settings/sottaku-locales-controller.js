import {SottakuClient} from '../../comm/sottaku-client.js';
import {getMessage} from '../../dom/i18n.js';
import {querySelectorNotNull} from '../../dom/query-selector.js';
import {SOTTAKU_SUPPORTED_LOCALES} from '../../language/sottaku-locales.js';

export class SottakuLocalesController {
    /**
     * @param {import('./settings-controller.js').SettingsController} settingsController
     */
    constructor(settingsController) {
        /** @type {import('./settings-controller.js').SettingsController} */
        this._settingsController = settingsController;
        /** @type {SottakuClient} */
        this._client = new SottakuClient();
        /** @type {HTMLSelectElement} */
        this._localeSelect = querySelectorNotNull(document, '#locale-select');
        /** @type {string|null} */
        this._apiBaseUrl = null;
    }

    /** */
    async prepare() {
        this._settingsController.on('optionsChanged', this._onOptionsChanged.bind(this));
        const options = await this._settingsController.getOptions();
        this._configureClient(options);
        await this._populate();
    }

    /**
     * @param {import('settings-controller').EventArgument<'optionsChanged'>} details
     */
    async _onOptionsChanged({options}) {
        const previousBaseUrl = this._apiBaseUrl;
        this._configureClient(options);
        if (this._apiBaseUrl !== previousBaseUrl) {
            await this._populate();
        }
    }

    /**
     * @param {import('settings').ProfileOptions} options
     */
    _configureClient(options) {
        const {sottaku} = options;
        this._apiBaseUrl = typeof sottaku?.apiBaseUrl === 'string' ? sottaku.apiBaseUrl : null;
        this._client.setConfig({
            apiBaseUrl: this._apiBaseUrl || undefined,
            authToken: typeof sottaku?.authToken === 'string' ? sottaku.authToken : '',
            cookieDomain: typeof sottaku?.cookieDomain === 'string' ? sottaku.cookieDomain : '',
        });
    }

    /** */
    async _populate() {
        const currentValue = this._localeSelect.value;
        const supportedLocales = await this._loadSupportedLocales();

        this._localeSelect.textContent = '';

        const autoOption = document.createElement('option');
        autoOption.value = '';
        autoOption.dataset.i18n = 'sottaku_locale_automatic';
        autoOption.text = getMessage('sottaku_locale_automatic') || 'Automatic (use Sottaku account language)';
        this._localeSelect.appendChild(autoOption);

        for (const {locale, name} of supportedLocales) {
            const option = document.createElement('option');
            option.value = locale;
            option.text = `${name} (${locale})`;
            this._localeSelect.appendChild(option);
        }

        const hasCurrent = Array.from(this._localeSelect.options).some((option) => option.value === currentValue);
        this._localeSelect.value = hasCurrent ? currentValue : '';
    }

    /**
     * @returns {Promise<{locale: string, name: string}[]>}
     */
    async _loadSupportedLocales() {
        try {
            const response = await this._client.getSupportedLocales();
            const rawLocales = Array.isArray(response?.locales) ? response.locales : [];
            const normalized = [];
            const seen = new Set();

            for (const value of rawLocales) {
                if (!value || typeof value !== 'object') { continue; }
                const locale = value.locale;
                const name = value.name;
                if (typeof locale !== 'string' || typeof name !== 'string') { continue; }
                const trimmedLocale = locale.trim();
                const trimmedName = name.trim();
                if (!trimmedLocale || !trimmedName || seen.has(trimmedLocale)) { continue; }
                seen.add(trimmedLocale);
                normalized.push({locale: trimmedLocale, name: trimmedName});
            }

            if (normalized.length > 0) {
                return normalized;
            }
        } catch (e) {
            // NOP
        }

        return [...SOTTAKU_SUPPORTED_LOCALES];
    }
}
