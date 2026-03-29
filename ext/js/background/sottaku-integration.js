import {SottakuClient} from '../comm/sottaku-client.js';
import {ExtensionError} from '../core/extension-error.js';
import {toError} from '../core/to-error.js';
import {getSottakuLanguageFlag, normalizeSottakuLanguages, SOTTAKU_SUPPORTED_LANGUAGES} from '../language/sottaku-languages.js';

const HIRAGANA_RANGE = [0x3040, 0x309f];
const KATAKANA_RANGES = [
    [0x30a0, 0x30ff],
    [0x31f0, 0x31ff],
    [0xff65, 0xff9f],
];
const HANGUL_RANGES = [
    [0x1100, 0x11ff],
    [0x3130, 0x318f],
    [0xa960, 0xa97f],
    [0xac00, 0xd7af],
    [0xd7b0, 0xd7ff],
];
const HAN_RANGES = [
    [0x3400, 0x4dbf],
    [0x4e00, 0x9fff],
    [0xf900, 0xfaff],
];
const LANGUAGE_HINT_MIN_COUNT = 3;
const LANGUAGE_HINT_MIN_RATIO = 0.02;
const SOTTAKU_SETTINGS_TTL_MS = 5 * 60 * 1000;
const HANZI_DISPLAY_MODES = new Set(['traditional', 'simplified', 'both']);
const HANZI_DISPLAY_SEPARATOR = ' / ';
const CHINESE_READING_MODES = new Set(['pinyin', 'bopomofo']);
const SOTTAKU_UPGRADE_URL = 'https://sottaku.app/upgrade';

/**
 * @param {number} codePoint
 * @param {number[][]} ranges
 * @returns {boolean}
 */
function isCodePointInRanges(codePoint, ranges) {
    for (const [min, max] of ranges) {
        if (codePoint >= min && codePoint <= max) {
            return true;
        }
    }
    return false;
}

/**
 * @param {string} text
 * @returns {{han: number, hiragana: number, katakana: number, hangul: number}}
 */
function getCjkScriptCounts(text) {
    const counts = {han: 0, hiragana: 0, katakana: 0, hangul: 0};
    if (typeof text !== 'string' || text.length === 0) { return counts; }
    for (const char of text) {
        const codePoint = char.codePointAt(0);
        if (!codePoint) { continue; }
        if (codePoint >= HIRAGANA_RANGE[0] && codePoint <= HIRAGANA_RANGE[1]) {
            counts.hiragana += 1;
            continue;
        }
        if (isCodePointInRanges(codePoint, KATAKANA_RANGES)) {
            counts.katakana += 1;
            continue;
        }
        if (isCodePointInRanges(codePoint, HANGUL_RANGES)) {
            counts.hangul += 1;
            continue;
        }
        if (isCodePointInRanges(codePoint, HAN_RANGES)) {
            counts.han += 1;
        }
    }
    return counts;
}

/**
 * @param {string} preference
 * @param {unknown} variants
 * @param {string} fallbackText
 * @returns {string}
 */
function resolveHanziDisplay(preference, variants, fallbackText) {
    const normalized = typeof preference === 'string' ? preference.trim().toLowerCase() : '';
    const resolved = (variants && typeof variants === 'object') ? /** @type {any} */ (variants) : null;
    const traditional = typeof resolved?.traditional === 'string' ? resolved.traditional : '';
    const simplified = typeof resolved?.simplified === 'string' ? resolved.simplified : '';
    const fallback = typeof fallbackText === 'string' ? fallbackText : '';

    if (normalized === 'simplified') {
        return simplified || traditional || fallback;
    }
    if (normalized === 'both') {
        const resolvedTraditional = traditional || fallback;
        const resolvedSimplified = simplified || fallback;
        if (resolvedTraditional && resolvedSimplified && resolvedTraditional !== resolvedSimplified) {
            return `${resolvedTraditional}${HANZI_DISPLAY_SEPARATOR}${resolvedSimplified}`;
        }
        return resolvedTraditional || resolvedSimplified || fallback;
    }
    return traditional || simplified || fallback;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function resolveToneColorsPreference(value) {
    if (typeof value === 'boolean') { return value; }
    if (typeof value === 'number') { return value !== 0; }
    if (typeof value === 'string') {
        const normalizedValue = value.trim().toLowerCase();
        if (!normalizedValue) { return false; }
        return ['1', 'true', 'yes', 'on', 'enabled'].includes(normalizedValue);
    }
    return false;
}

/**
 * @param {unknown} payload
 * @returns {?{hanziDisplay: string, chineseReadingDisplay: string, chineseToneColors: boolean}}
 */
function normalizeDisplayPreferencesPayload(payload) {
    const normalizedPayload = (payload && typeof payload === 'object') ? payload : null;
    if (!normalizedPayload) { return null; }
    const payloadData = (normalizedPayload.data && typeof normalizedPayload.data === 'object') ?
        normalizedPayload.data :
        normalizedPayload;
    const settings = (payloadData.settings && typeof payloadData.settings === 'object') ?
        payloadData.settings :
        payloadData;
    if (!settings || typeof settings !== 'object') { return null; }

    const hanziDisplayRaw = typeof settings?.hanzi_display === 'string' ?
        settings.hanzi_display :
        (typeof settings?.hanziDisplay === 'string' ? settings.hanziDisplay : '');
    const chineseReadingRaw = typeof settings?.chinese_reading_display === 'string' ?
        settings.chinese_reading_display :
        (typeof settings?.chineseReadingDisplay === 'string' ? settings.chineseReadingDisplay : '');
    const toneColorsRaw = (
        settings && typeof settings === 'object' && 'chinese_tone_colors' in settings
            ? settings.chinese_tone_colors
            : settings?.chineseToneColors
    );
    const hasHanziDisplay = typeof hanziDisplayRaw === 'string' && hanziDisplayRaw.trim().length > 0;
    const hasChineseReading = typeof chineseReadingRaw === 'string' && chineseReadingRaw.trim().length > 0;
    const hasToneColors = typeof toneColorsRaw !== 'undefined';
    if (!hasHanziDisplay && !hasChineseReading && !hasToneColors) { return null; }

    const hanziDisplayCandidate = hanziDisplayRaw ? hanziDisplayRaw.trim().toLowerCase() : '';
    const chineseReadingCandidate = chineseReadingRaw ? chineseReadingRaw.trim().toLowerCase() : '';
    const hanziDisplay = HANZI_DISPLAY_MODES.has(hanziDisplayCandidate) ? hanziDisplayCandidate : '';
    const chineseReadingDisplay = CHINESE_READING_MODES.has(chineseReadingCandidate) ? chineseReadingCandidate : '';
    const chineseToneColors = hasToneColors ? resolveToneColorsPreference(toneColorsRaw) : undefined;
    return {hanziDisplay, chineseReadingDisplay, chineseToneColors};
}

/**
 * @typedef {object} SottakuLanguageResult
 * @property {string} language
 * @property {import('dictionary').TermDictionaryEntry[]} entries
 * @property {number} originalTextLength
 */

export class SottakuIntegration {
    /**
     * @param {import('../language/translator.js').Translator | import('./offscreen-proxy.js').TranslatorProxy} translator
     * @param {{onAuthTokenUpdated?: ((details: {apiBaseUrl: string, oldToken: string, newToken: string}) => (void|Promise<void>))|null, onAuthTokenInvalidated?: ((details: {apiBaseUrl: string, oldToken: string}) => (void|Promise<void>))|null}} [clientOptions]
     */
    constructor(translator, clientOptions = {}) {
        /** @type {SottakuClient} */
        this._client = new SottakuClient(clientOptions);
        /** @type {import('../language/translator.js').Translator | import('./offscreen-proxy.js').TranslatorProxy} */
        this._translator = translator;
        /** @type {?import('settings').ProfileOptions} */
        this._options = null;
        /** @type {string[]} */
        this._supportedLanguages = [...SOTTAKU_SUPPORTED_LANGUAGES];

        /** @type {string} */
        this._automaticLocaleCacheKey = '';
        /** @type {string|null} */
        this._automaticLocale = null;
        /** @type {number} */
        this._automaticLocaleTimestamp = 0;
        /** @type {Promise<string>|null} */
        this._automaticLocalePromise = null;
        /** @type {string} */
        this._automaticSettingsCacheKey = '';
        /** @type {?{hanziDisplay: string, chineseReadingDisplay: string, chineseToneColors: boolean}} */
        this._automaticSettings = null;
        /** @type {number} */
        this._automaticSettingsTimestamp = 0;
        /** @type {Promise<?{hanziDisplay: string, chineseReadingDisplay: string, chineseToneColors: boolean}>|null} */
        this._automaticSettingsPromise = null;
    }

    /**
     * @param {import('settings').ProfileOptions} options
     */
    configure(options) {
        this._options = options;
        const {sottaku} = options;
        this._client.setConfig({
            apiBaseUrl: sottaku.apiBaseUrl,
            authToken: sottaku.authToken,
            cookieDomain: sottaku.cookieDomain,
        });

        const automaticCacheKey = `${sottaku.apiBaseUrl}|${sottaku.authToken}`;
        if (automaticCacheKey !== this._automaticLocaleCacheKey) {
            this._automaticLocaleCacheKey = automaticCacheKey;
            this._automaticLocale = null;
            this._automaticLocaleTimestamp = 0;
            this._automaticLocalePromise = null;
        }
        if (automaticCacheKey !== this._automaticSettingsCacheKey) {
            this._automaticSettingsCacheKey = automaticCacheKey;
            this._automaticSettings = null;
            this._automaticSettingsTimestamp = 0;
            this._automaticSettingsPromise = null;
        }
    }

    /**
     * @param {string} text
     * @param {import('translation').FindDeinflectionOptions} [findTermsOptions]
     * @param {import('api').FindTermsDetails} [details]
     * @returns {Promise<{dictionaryEntries: import('dictionary').TermDictionaryEntry[], originalTextLength: number}>}
     */
    async findTerms(text, findTermsOptions, details) {
        if (this._options === null) {
            throw new ExtensionError('Sottaku options not configured');
        }
        const {sottaku, general} = this._options;
        if (!sottaku.enabled) { return {dictionaryEntries: [], originalTextLength: text.length}; }
        if (!sottaku.authToken) {
            throw new ExtensionError('Sign in to Sottaku from the settings page to enable remote lookups.');
        }

        const query = (text || '').trim();
        if (!query) {
            return {dictionaryEntries: [], originalTextLength: 0};
        }

        const {languages, autoPick, hintLanguage} = this._resolveLanguages(query, sottaku, general.language, details);
        const localePromise = this._resolveLocale();
        const displayPreferencesPromise = Promise.resolve(null);
        const maxResults = Math.max(1, general.maxResults || 32);
        const apiOrigin = this._getOrigin(sottaku.apiBaseUrl);
        const [locale, displayPreferences] = await Promise.all([localePromise, displayPreferencesPromise]);
        const localeLang = (locale || 'en').replace(/_/g, '-');

        /** @type {SottakuLanguageResult[]} */
        const languageResults = [];
        const variantsByLanguage = new Map();
        for (const language of languages) {
            variantsByLanguage.set(language, await this._buildQueryVariants(query, language, findTermsOptions));
        }

        if (languages.length > 1) {
            let scanResult;
            try {
                scanResult = await this._client.scan(
                    query,
                    languages,
                    maxResults,
                    locale,
                    null,
                );
            } catch (e) {
                const message = toError(e).message || '';
                const lowered = message.toLowerCase();
                if (lowered.includes('402') || lowered.includes('pro subscription') || lowered.includes('upgrade')) {
                    const error = new ExtensionError(`Upgrade required: ${SOTTAKU_UPGRADE_URL}`);
                    error.data = {type: 'sottakuUpgradeRequired', upgradeUrl: SOTTAKU_UPGRADE_URL};
                    throw error;
                }
                throw e;
            }

            const scanResultsByLanguage = new Map();
            if (Array.isArray(scanResult?.languageResults)) {
                for (const entry of scanResult.languageResults) {
                    const language = entry && typeof entry.language === 'string' ? entry.language : null;
                    if (!language) { continue; }
                    scanResultsByLanguage.set(language, entry);
                }
            }

            for (const language of languages) {
                const variants = variantsByLanguage.get(language) || [];
                const primaryVariant = variants[0] || {query, sourceText: query, originalTextLength: null};
                const scanEntry = scanResultsByLanguage.get(language);
                const scanResultForLanguage = {
                    results: Array.isArray(scanEntry?.results) ? scanEntry.results : [],
                    originalTextLength: (
                        typeof scanEntry?.originalTextLength === 'number' && Number.isFinite(scanEntry.originalTextLength)
                            ? scanEntry.originalTextLength
                            : Math.max(0, query.length)
                    ),
                    displayPreferences: scanResult?.displayPreferences ?? null,
                };
                const languageResult = await this._fetchLanguageEntries({
                    apiOrigin,
                    language,
                    maxResults,
                    query: primaryVariant.query,
                    sourceText: primaryVariant.sourceText,
                    originalTextLength: primaryVariant.originalTextLength,
                    locale,
                    localeLang,
                    displayPreferences: language.startsWith('zh') ? displayPreferences : null,
                    scanResult: scanResultForLanguage,
                });
                languageResults.push(languageResult);
            }
        } else {
            for (const language of languages) {
                const languageResult = await this._fetchLanguageEntriesWithVariants({
                    apiOrigin,
                    language,
                    maxResults,
                    variants: variantsByLanguage.get(language) || [],
                    locale,
                    localeLang,
                    displayPreferences: language.startsWith('zh') ? displayPreferences : null,
                });
                languageResults.push(languageResult);
            }
        }

        let resolvedLanguageResults = languageResults;
        if (autoPick) {
            const bestResult = this._selectBestLanguageResult(languageResults, languages, hintLanguage);
            if (bestResult) {
                resolvedLanguageResults = [bestResult];
            }
        }
        const dictionaryEntries = this._interleaveLanguageEntries(resolvedLanguageResults, maxResults);
        const originalTextLength = this._resolveOriginalTextLength(resolvedLanguageResults, dictionaryEntries, query);
        return {dictionaryEntries, originalTextLength};
    }

    /**
     * @param {string} text
     * @param {string} language
     * @param {import('translation').FindDeinflectionOptions} [findTermsOptions]
     * @returns {Promise<{query: string, sourceText: string, originalTextLength: number}[]>}
     */
    async _buildQueryVariants(text, language, findTermsOptions) {
        const normalizedText = (text || '').trim();
        /** @type {{query: string, sourceText: string, originalTextLength: number}[]} */
        const variants = [];
        const isEnglish = language === 'en';
        const seenQueries = new Set();
        const addVariant = (query, includeOriginalEnglishCase = false) => {
            const normalizedQuery = (query || '').trim();
            if (!normalizedQuery) { return; }

            if (isEnglish) {
                const loweredQuery = normalizedQuery.toLowerCase();
                if (loweredQuery && !seenQueries.has(loweredQuery)) {
                    seenQueries.add(loweredQuery);
                    variants.push({
                        query: loweredQuery,
                        sourceText: normalizedText,
                        originalTextLength: normalizedText.length,
                    });
                }
                if (
                    includeOriginalEnglishCase &&
                    normalizedQuery !== loweredQuery &&
                    !seenQueries.has(normalizedQuery)
                ) {
                    seenQueries.add(normalizedQuery);
                    variants.push({
                        query: normalizedQuery,
                        sourceText: normalizedText,
                        originalTextLength: normalizedText.length,
                    });
                }
                return;
            }

            if (seenQueries.has(normalizedQuery)) { return; }
            seenQueries.add(normalizedQuery);
            variants.push({
                query: normalizedQuery,
                sourceText: normalizedText,
                originalTextLength: normalizedText.length,
            });
        };

        if (this._translator && typeof this._translator.getDeinflectionTextVariants === 'function') {
            const deinflectionOptions = {
                deinflect: findTermsOptions?.deinflect ?? true,
                language,
                searchResolution: findTermsOptions?.searchResolution ?? 'length',
                textReplacements: findTermsOptions?.textReplacements ?? [null],
                removeNonJapaneseCharacters: findTermsOptions?.removeNonJapaneseCharacters ?? false,
            };
            try {
                const translatorVariants = await this._translator.getDeinflectionTextVariants(normalizedText, {...deinflectionOptions, language});
                const fullLengthVariants = translatorVariants.filter(({originalText}) => (
                    (originalText || '').trim().length === normalizedText.length
                ));
                const prioritizedVariants = fullLengthVariants.length > 0 ? fullLengthVariants : translatorVariants;
                prioritizedVariants.sort((a, b) => {
                    const aExact = ((a.deinflectedText || '').trim() === normalizedText);
                    const bExact = ((b.deinflectedText || '').trim() === normalizedText);
                    return Number(aExact) - Number(bExact);
                });
                for (const {deinflectedText} of prioritizedVariants) {
                    addVariant(
                        deinflectedText,
                        isEnglish && (deinflectedText || '').trim() === normalizedText,
                    );
                }
            } catch (e) {
                // Ignore translator errors and fall back to the raw query.
            }
        }

        if (variants.length === 0) {
            addVariant(normalizedText, isEnglish);
        }

        return variants;
    }

    /**
     * @param {{apiOrigin: string, language: string, maxResults: number, variants: {query: string, sourceText: string, originalTextLength: number}[], locale: string, localeLang: string, displayPreferences?: {hanziDisplay?: string, chineseReadingDisplay?: string, chineseToneColors?: boolean} | null}} options
     * @returns {Promise<SottakuLanguageResult>}
     */
    async _fetchLanguageEntriesWithVariants({apiOrigin, language, maxResults, variants, locale, localeLang, displayPreferences}) {
        const resolvedVariants = variants.length > 0 ? variants : [{query: '', sourceText: '', originalTextLength: 0}];
        /** @type {SottakuLanguageResult | null} */
        let fallbackResult = null;
        const scanCache = new Map();
        for (const {query, sourceText, originalTextLength} of resolvedVariants) {
            const languageResult = await this._fetchLanguageEntries({
                apiOrigin,
                language,
                maxResults,
                query,
                sourceText,
                originalTextLength,
                locale,
                localeLang,
                displayPreferences,
                scanCache,
            });
            if (languageResult.entries.length > 0) {
                return languageResult;
            }
            if (fallbackResult === null) {
                fallbackResult = languageResult;
            }
        }
        return fallbackResult ?? {
            language,
            entries: [],
            originalTextLength: resolvedVariants[0]?.originalTextLength ?? 0,
        };
    }

    /**
     * @param {{apiOrigin: string, language: string, maxResults: number, query: string, sourceText?: string, originalTextLength?: number, locale: string, localeLang: string, displayPreferences?: {hanziDisplay?: string, chineseReadingDisplay?: string, chineseToneColors?: boolean} | null, scanResult?: {results: unknown[], originalTextLength: number, displayPreferences?: unknown | null}, scanCache?: Map<string, {results: unknown[], originalTextLength: number, displayPreferences?: unknown | null}>}} options
     * @returns {Promise<SottakuLanguageResult>}
     */
    async _fetchLanguageEntries({apiOrigin, language, maxResults, query, sourceText, originalTextLength, locale, localeLang, displayPreferences, scanResult, scanCache}) {
        const normalizedQuery = (query || '').trim();
        const normalizedSource = (sourceText || normalizedQuery || '').trim();
        if (!normalizedQuery) {
            return {
                language,
                entries: [],
                originalTextLength: normalizedSource.length || 0,
            };
        }

        let scanResultsRaw = [];
        let scanOriginalLength = 0;
        let resolvedDisplayPreferences = (
            displayPreferences && typeof displayPreferences === 'object'
                ? displayPreferences
                : null
        );
        if (scanResult) {
            scanResultsRaw = scanResult.results;
            scanOriginalLength = scanResult.originalTextLength;
            const scanDisplayPreferences = normalizeDisplayPreferencesPayload(scanResult.displayPreferences);
            if (scanDisplayPreferences) {
                resolvedDisplayPreferences = scanDisplayPreferences;
                this._automaticSettings = scanDisplayPreferences;
                this._automaticSettingsTimestamp = Date.now();
            }
        } else {
            const updateDisplayPreferences = (response) => {
                const scanDisplayPreferences = normalizeDisplayPreferencesPayload(response?.displayPreferences);
                if (!scanDisplayPreferences) { return; }
                resolvedDisplayPreferences = scanDisplayPreferences;
                this._automaticSettings = scanDisplayPreferences;
                this._automaticSettingsTimestamp = Date.now();
            };
            const runScan = async (scanText) => {
                const cacheKey = `${language}\u0000${locale}\u0000${scanText}`;
                if (scanCache && scanCache.has(cacheKey)) {
                    return scanCache.get(cacheKey);
                }
                const response = await this._client.scan(
                    scanText,
                    language,
                    maxResults,
                    locale,
                    null,
                );
                if (scanCache) {
                    scanCache.set(cacheKey, response);
                }
                return response;
            };
            const scanTexts = [];
            if (normalizedSource) {
                scanTexts.push(normalizedSource);
            }
            if (normalizedQuery && normalizedQuery !== normalizedSource) {
                scanTexts.push(normalizedQuery);
            }
            try {
                for (const scanText of scanTexts) {
                    const scanResultResponse = await runScan(scanText);
                    scanResultsRaw = scanResultResponse.results;
                    scanOriginalLength = scanResultResponse.originalTextLength;
                    updateDisplayPreferences(scanResultResponse);
                    if (Array.isArray(scanResultsRaw) && scanResultsRaw.length > 0) {
                        break;
                    }
                }
            } catch (e) {
                const message = toError(e).message || '';
                const lowered = message.toLowerCase();
                if (lowered.includes('402') || lowered.includes('pro subscription') || lowered.includes('upgrade')) {
                    const error = new ExtensionError(`Upgrade required: ${SOTTAKU_UPGRADE_URL}`);
                    error.data = {type: 'sottakuUpgradeRequired', upgradeUrl: SOTTAKU_UPGRADE_URL};
                    throw error;
                }
                throw e;
            }
        }

        if (!resolvedDisplayPreferences && language.startsWith('zh')) {
            resolvedDisplayPreferences = await this._resolveDisplayPreferences();
        }

        const scanResults = Array.isArray(scanResultsRaw) ? scanResultsRaw : [];
        const matchLengthFallback = normalizedSource.length || normalizedQuery.length;
        const resultMetadataCache = new Map();
        /**
         * @param {any} value
         * @returns {{matchLength: number, hasDefinition: boolean}}
         */
        const getResultMetadata = (value) => {
            if (resultMetadataCache.has(value)) { return resultMetadataCache.get(value); }
            const normalizedValue = (typeof value === 'object' && value !== null) ? value : {};
            const matchLengthRaw = normalizedValue.match_length ?? normalizedValue.matchLength;
            const matchLengthParsed = Number.parseInt(matchLengthRaw, 10);
            const matchLength = Number.isFinite(matchLengthParsed) ? Math.max(0, matchLengthParsed) : matchLengthFallback;
            const translation = (
                normalizedValue.word_translation ||
                normalizedValue.english_word ||
                ''
            ).toString();
            const sentenceTokens = Array.isArray(normalizedValue.cloze_sentence_tokens) ? normalizedValue.cloze_sentence_tokens : null;
            const sentence = sentenceTokens && sentenceTokens.length > 0 ?
                sentenceTokens.join('') :
                (normalizedValue.cloze_sentence || '').toString();
            const sentenceTranslation = (
                normalizedValue.sentence_translation ||
                normalizedValue.english_sentence ||
                ''
            ).toString();
            const usageNotes = (normalizedValue.usage_notes || '').toString();
            const hasDefinition = Boolean(
                (normalizedValue.has_definition ?? null) ||
                translation ||
                sentence ||
                sentenceTranslation ||
                usageNotes,
            );
            const metadata = {matchLength, hasDefinition};
            resultMetadataCache.set(value, metadata);
            return metadata;
        };

        const scanResultsSorted = scanResults
            .map((result, index) => ({result, index}))
            .sort((a, b) => {
                const aMetadata = getResultMetadata(a.result);
                const bMetadata = getResultMetadata(b.result);
                let i = bMetadata.matchLength - aMetadata.matchLength;
                if (i !== 0) { return i; }
                i = (bMetadata.hasDefinition ? 1 : 0) - (aMetadata.hasDefinition ? 1 : 0);
                if (i !== 0) { return i; }
                return a.index - b.index;
            })
            .map(({result}) => result);

        const limitedResults = scanResultsSorted.slice(0, Math.max(1, maxResults));

        /** @type {import('dictionary').TermDictionaryEntry[]} */
        const entries = [];
        for (let i = 0; i < limitedResults.length; ++i) {
            const result = limitedResults[i];
            entries.push(this._createEntry(
                result,
                result,
                language,
                apiOrigin,
                normalizedQuery,
                i,
                normalizedSource,
                originalTextLength,
                localeLang,
                resolvedDisplayPreferences,
            ));
        }

        return {
            language,
            entries,
            originalTextLength: typeof originalTextLength === 'number' && Number.isFinite(originalTextLength) ?
                originalTextLength :
                scanOriginalLength,
        };
    }

    /**
     * @param {SottakuLanguageResult[]} languageResults
     * @param {number} maxResults
     * @returns {import('dictionary').TermDictionaryEntry[]}
     */
    _interleaveLanguageEntries(languageResults, maxResults) {
        if (languageResults.length <= 1) {
            const entries = languageResults[0]?.entries ?? [];
            return entries.slice(0, maxResults);
        }

        // Rank mixed-language results by match length, using definitions only as a tie-breaker.
        /** @type {{entry: import('dictionary').TermDictionaryEntry, matchLength: number, hasDefinition: boolean, languageIndex: number, entryIndex: number}[]} */
        const rankedEntries = [];
        for (let languageIndex = 0; languageIndex < languageResults.length; languageIndex += 1) {
            const {entries} = languageResults[languageIndex];
            for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
                const entry = entries[entryIndex];
                const metadata = entry && typeof entry === 'object' ? /** @type {any} */ (entry).sottaku : null;
                let matchLength = 0;
                const metadataMatchLength = Number.parseInt(metadata?.matchLength, 10);
                if (Number.isFinite(metadataMatchLength)) {
                    matchLength = metadataMatchLength;
                } else {
                    const headwordLength = entry?.headwords?.[0]?.term?.length;
                    if (typeof headwordLength === 'number' && Number.isFinite(headwordLength)) {
                        matchLength = headwordLength;
                    } else if (typeof entry?.maxOriginalTextLength === 'number' && Number.isFinite(entry.maxOriginalTextLength)) {
                        matchLength = entry.maxOriginalTextLength;
                    }
                }
                const hasDefinition = Boolean(metadata?.hasDefinition);
                rankedEntries.push({entry, matchLength, hasDefinition, languageIndex, entryIndex});
            }
        }

        rankedEntries.sort((a, b) => {
            let i = b.matchLength - a.matchLength;
            if (i !== 0) { return i; }
            i = (b.hasDefinition ? 1 : 0) - (a.hasDefinition ? 1 : 0);
            if (i !== 0) { return i; }
            i = a.languageIndex - b.languageIndex;
            if (i !== 0) { return i; }
            return a.entryIndex - b.entryIndex;
        });
        return rankedEntries.slice(0, maxResults).map(({entry}) => entry);
    }

    /**
     * @param {SottakuLanguageResult[]} languageResults
     * @param {import('dictionary').TermDictionaryEntry[]} dictionaryEntries
     * @param {string} query
     * @returns {number}
     */
    _resolveOriginalTextLength(languageResults, dictionaryEntries, query) {
        let maxLength = 0;
        for (const {originalTextLength} of languageResults) {
            if (typeof originalTextLength === 'number' && Number.isFinite(originalTextLength)) {
                maxLength = Math.max(maxLength, originalTextLength);
            }
        }
        if (maxLength > 0) { return maxLength; }

        for (const entry of dictionaryEntries) {
            const metadata = entry && typeof entry === 'object' ? /** @type {any} */ (entry).sottaku : null;
            if (metadata?.matchLength) {
                maxLength = Math.max(maxLength, metadata.matchLength);
                continue;
            }
            const headwordLength = entry?.headwords?.[0]?.term?.length;
            if (typeof headwordLength === 'number' && Number.isFinite(headwordLength)) {
                maxLength = Math.max(maxLength, headwordLength);
            }
        }

        if (maxLength > 0) { return maxLength; }
        return query.length;
    }

    /**
     * @param {SottakuLanguageResult[]} languageResults
     * @param {string[]} languageOrder
     * @param {?string} hintLanguage
     * @returns {?SottakuLanguageResult}
     */
    _selectBestLanguageResult(languageResults, languageOrder, hintLanguage) {
        let bestResult = null;
        let bestScore = null;
        for (const languageResult of languageResults) {
            const score = this._getLanguageResultScore(languageResult, languageOrder, hintLanguage);
            if (bestScore === null || this._compareLanguageResultScores(score, bestScore) > 0) {
                bestScore = score;
                bestResult = languageResult;
            }
        }
        return bestResult;
    }

    /**
     * @param {SottakuLanguageResult} languageResult
     * @param {string[]} languageOrder
     * @param {?string} hintLanguage
     * @returns {{matchLength: number, hasDefinition: boolean, entryCount: number, hintMatch: number, orderIndex: number}}
     */
    _getLanguageResultScore(languageResult, languageOrder, hintLanguage) {
        let maxMatchLength = 0;
        let hasDefinition = false;
        for (const entry of languageResult.entries) {
            const metadata = entry && typeof entry === 'object' ? /** @type {any} */ (entry).sottaku : null;
            const matchLength = Number.parseInt(metadata?.matchLength, 10);
            if (Number.isFinite(matchLength)) {
                maxMatchLength = Math.max(maxMatchLength, matchLength);
            } else if (typeof entry?.maxOriginalTextLength === 'number') {
                maxMatchLength = Math.max(maxMatchLength, entry.maxOriginalTextLength);
            }
            if (metadata?.hasDefinition) {
                hasDefinition = true;
            }
        }

        if (maxMatchLength === 0 && languageResult.entries.length > 0) {
            if (typeof languageResult.originalTextLength === 'number' && Number.isFinite(languageResult.originalTextLength)) {
                maxMatchLength = Math.max(maxMatchLength, languageResult.originalTextLength);
            }
        }

        const hintMatch = hintLanguage === languageResult.language ? 1 : 0;
        const orderIndex = languageOrder.indexOf(languageResult.language);
        return {
            matchLength: maxMatchLength,
            hasDefinition,
            entryCount: languageResult.entries.length,
            hintMatch,
            orderIndex: orderIndex >= 0 ? orderIndex : languageOrder.length,
        };
    }

    /**
     * @param {{matchLength: number, hasDefinition: boolean, entryCount: number, hintMatch: number, orderIndex: number}} a
     * @param {{matchLength: number, hasDefinition: boolean, entryCount: number, hintMatch: number, orderIndex: number}} b
     * @returns {number}
     */
    _compareLanguageResultScores(a, b) {
        if (a.matchLength !== b.matchLength) { return a.matchLength - b.matchLength; }
        if (a.hintMatch !== b.hintMatch) { return a.hintMatch - b.hintMatch; }
        if (a.hasDefinition !== b.hasDefinition) { return (a.hasDefinition ? 1 : 0) - (b.hasDefinition ? 1 : 0); }
        if (a.entryCount !== b.entryCount) { return a.entryCount - b.entryCount; }
        return b.orderIndex - a.orderIndex;
    }

    /**
     * @param {string} text
     * @param {import('settings').SottakuOptions} sottakuOptions
     * @param {string} defaultLanguage
     * @param {import('api').FindTermsDetails} [details]
     * @returns {{languages: string[], autoPick: boolean, hintLanguage: ?string}}
     */
    _resolveLanguages(text, sottakuOptions, defaultLanguage, details) {
        const supportedLanguages = this._supportedLanguages.length > 0 ? this._supportedLanguages : SOTTAKU_SUPPORTED_LANGUAGES;
        const preferredLanguages = normalizeSottakuLanguages(
            sottakuOptions.preferredLanguages,
            defaultLanguage,
            supportedLanguages,
        );
        switch (sottakuOptions.languageMode) {
            case 'ja': return {languages: ['ja'], autoPick: false, hintLanguage: null};
            case 'ko': return {languages: ['ko'], autoPick: false, hintLanguage: null};
            case 'zh': return {languages: ['zh'], autoPick: false, hintLanguage: null};
            case 'en': return {languages: ['en'], autoPick: false, hintLanguage: null};
            case 'mixed': return {languages: preferredLanguages, autoPick: false, hintLanguage: null};
        }
        const detected = this._detectLanguageFromText(text, details);
        if (detected?.language && detected.confidence === 'strong') {
            return {languages: [detected.language], autoPick: false, hintLanguage: null};
        }

        const candidates = preferredLanguages.length > 0 ? preferredLanguages : supportedLanguages;
        const queryCounts = getCjkScriptCounts(text || '');
        const hasHanOnly = queryCounts.han > 0 && (queryCounts.hiragana + queryCounts.katakana + queryCounts.hangul) === 0;
        const shouldProbe = candidates.length > 1 && (hasHanOnly || detected?.confidence === 'weak');
        if (shouldProbe) {
            return {languages: candidates, autoPick: true, hintLanguage: detected?.language ?? null};
        }

        const fallbackLanguage = candidates[0] || defaultLanguage || 'ja';
        return {languages: [fallbackLanguage], autoPick: false, hintLanguage: null};
    }

    /**
     * @param {string} text
     * @param {import('api').FindTermsDetails} [details]
     * @returns {{language: string, confidence: 'strong' | 'weak'} | null}
     */
    _detectLanguageFromText(text, details) {
        const trimmed = (text || '').trim();
        const counts = getCjkScriptCounts(trimmed);
        if (counts.hiragana + counts.katakana > 0) {
            return {language: 'ja', confidence: 'strong'};
        }
        if (counts.hangul > 0) {
            return {language: 'ko', confidence: 'strong'};
        }
        if (counts.han > 0) {
            return {language: 'zh', confidence: 'strong'};
        }
        return this._detectLanguageFromHints(details);
    }

    /**
     * @param {import('api').FindTermsDetails} [details]
     * @returns {{language: string, confidence: 'strong' | 'weak'} | null}
     */
    _detectLanguageFromHints(details) {
        const languageHints = details?.languageHints;
        if (!languageHints || typeof languageHints !== 'object') { return null; }
        const documentLang = typeof languageHints.documentLang === 'string' ? languageHints.documentLang.trim().toLowerCase() : '';
        if (documentLang.startsWith('ja')) { return {language: 'ja', confidence: 'strong'}; }
        if (documentLang.startsWith('ko')) { return {language: 'ko', confidence: 'strong'}; }
        if (documentLang.startsWith('zh')) { return {language: 'zh', confidence: 'strong'}; }
        if (documentLang.startsWith('en')) { return {language: 'en', confidence: 'weak'}; }

        const counts = this._normalizeScriptCounts(languageHints.documentScriptCounts);
        return this._resolveLanguageFromScriptCounts(counts);
    }

    /**
     * @param {unknown} value
     * @returns {{han: number, hiragana: number, katakana: number, hangul: number} | null}
     */
    _normalizeScriptCounts(value) {
        if (!value || typeof value !== 'object') { return null; }
        /** @type {any} */ const raw = value;
        const parseCount = (count) => {
            const parsed = Number.parseInt(count, 10);
            return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
        };
        return {
            han: parseCount(raw.han),
            hiragana: parseCount(raw.hiragana),
            katakana: parseCount(raw.katakana),
            hangul: parseCount(raw.hangul),
        };
    }

    /**
     * @param {{han: number, hiragana: number, katakana: number, hangul: number} | null} counts
     * @returns {{language: string, confidence: 'strong' | 'weak'} | null}
     */
    _resolveLanguageFromScriptCounts(counts) {
        if (!counts) { return null; }
        const kana = counts.hiragana + counts.katakana;
        const total = counts.han + counts.hangul + kana;
        if (total <= 0) { return null; }
        const hangulRatio = counts.hangul / total;
        const kanaRatio = kana / total;

        if (counts.hangul >= LANGUAGE_HINT_MIN_COUNT || hangulRatio >= LANGUAGE_HINT_MIN_RATIO) {
            return {language: 'ko', confidence: 'strong'};
        }
        if (kana >= LANGUAGE_HINT_MIN_COUNT || kanaRatio >= LANGUAGE_HINT_MIN_RATIO) {
            return {language: 'ja', confidence: 'strong'};
        }
        if (counts.han > 0 && kana === 0 && counts.hangul === 0) {
            return {language: 'zh', confidence: 'weak'};
        }
        return null;
    }

    /**
     * @param {unknown} result
     * @param {unknown} info
     * @param {string} language
     * @param {string} apiOrigin
     * @param {string} query
     * @param {number} index
     * @param {string} [sourceText]
     * @param {number} [matchLengthOverride]
     * @param {string} localeLang
     * @param {{hanziDisplay?: string, chineseReadingDisplay?: string, chineseToneColors?: boolean} | null | undefined} displayPreferences
     * @returns {import('dictionary').TermDictionaryEntry}
     */
    _createEntry(result, info, language, apiOrigin, query, index, sourceText, matchLengthOverride, localeLang, displayPreferences) {
        const normalizedResult = (typeof result === 'object' && result !== null) ? result : {};
        const normalizedInfo = (typeof info === 'object' && info !== null) ? info : {};
        const questionId = Number.parseInt(normalizedResult.id ?? normalizedInfo.id, 10);
        let term = (normalizedInfo.kanji_representation || normalizedResult.kanji_representation || query || '').toString();
        const reading = (normalizedInfo.reading || normalizedResult.reading || term).toString();
        const readingTokensRaw = (
            normalizedInfo.reading_tokens ??
            normalizedResult.reading_tokens ??
            normalizedInfo.readingTokens ??
            normalizedResult.readingTokens
        );
        const readingTokens = Array.isArray(readingTokensRaw) ? readingTokensRaw : null;
        const hanziVariants = normalizedInfo.hanzi_variants ||
            normalizedResult.hanzi_variants ||
            normalizedInfo.hanziVariants ||
            normalizedResult.hanziVariants;
        const hanziDisplayMode = (
            displayPreferences &&
            typeof displayPreferences === 'object' &&
            typeof displayPreferences.hanziDisplay === 'string' &&
            HANZI_DISPLAY_MODES.has(displayPreferences.hanziDisplay)
        ) ? displayPreferences.hanziDisplay : '';
        if (language.startsWith('zh') && hanziDisplayMode && hanziVariants) {
            term = resolveHanziDisplay(hanziDisplayMode, hanziVariants, term || query || '');
        }
        const matchLengthRaw = normalizedResult.match_length ?? normalizedInfo.match_length ?? matchLengthOverride;
        const matchLength = Number.parseInt(matchLengthRaw, 10);
        const translation = (
            normalizedInfo.word_translation ||
            normalizedInfo.english_word ||
            normalizedResult.word_translation ||
            normalizedResult.english_word ||
            ''
        ).toString();
        const sentenceTokens = Array.isArray(normalizedInfo.cloze_sentence_tokens) ? normalizedInfo.cloze_sentence_tokens : null;
        const sentence = sentenceTokens && sentenceTokens.length > 0 ?
            sentenceTokens.join('') :
            (normalizedInfo.cloze_sentence || '').toString();
        const sentenceTranslation = (
            normalizedInfo.sentence_translation ||
            normalizedInfo.english_sentence ||
            normalizedResult.sentence_translation ||
            normalizedResult.english_sentence ||
            ''
        ).toString();
        const usageNotes = (normalizedInfo.usage_notes || '').toString();
        const hasDefinition = Boolean(
            (normalizedResult.has_definition ?? normalizedInfo.has_definition ?? null) ||
            translation ||
            sentence ||
            sentenceTranslation ||
            usageNotes,
        );
        const dictionaryAlias = getSottakuLanguageFlag(language);
        const resolvedSourceText = (sourceText || query || '').toString();
        const rawInflectionRules = normalizedResult.inflection_rules ?? normalizedInfo.inflection_rules;
        const rawInflectionRuleKeys = normalizedResult.inflection_rule_keys ?? normalizedInfo.inflection_rule_keys;
        const inflectionRuleNames = Array.isArray(rawInflectionRules) ?
            rawInflectionRules.map((value) => (value ?? '').toString().trim()) :
            [];
        const inflectionRuleKeys = Array.isArray(rawInflectionRuleKeys) ?
            rawInflectionRuleKeys.map((value) => (value ?? '').toString().trim()) :
            [];
        const inflectionRulePairs = [];
        for (let i = 0; i < inflectionRuleNames.length; i += 1) {
            const name = inflectionRuleNames[i];
            if (!name) { continue; }
            inflectionRulePairs.push({
                name,
                reasonKey: inflectionRuleKeys[i] || '',
            });
        }
        const grammarLanguage = (language || '').toString().toLowerCase();

        /** @type {import('dictionary').InflectionRuleChainCandidate[]} */
        const inflectionRuleChainCandidates = [];
        if (inflectionRulePairs.length > 0) {
            inflectionRuleChainCandidates.push({
                source: 'algorithm',
                inflectionRules: inflectionRulePairs.map(({name, reasonKey}) => {
                    const rule = {name, description: ''};
                    if (reasonKey && grammarLanguage) {
                        rule.reasonKey = reasonKey;
                        rule.grammarLanguage = grammarLanguage;
                        rule.grammarUrl = `https://sottaku.app/dictionary/grammar/${grammarLanguage}/${encodeURIComponent(reasonKey)}`;
                    }
                    return rule;
                }),
            });
        }

        /** @type {import('dictionary').TermHeadword[]} */
        const headwords = [
            {
                index: 0,
                term: term || reading || query,
                reading: reading,
                sources: [
                    {
                        originalText: resolvedSourceText,
                        transformedText: query,
                        deinflectedText: term || query,
                        matchType: 'exact',
                        matchSource: 'term',
                        isPrimary: true,
                    },
                ],
                tags: [],
                wordClasses: [],
            },
        ];

        /** @type {import('dictionary').TermDefinition[]} */
        const definitions = [
            {
                index: 0,
                headwordIndices: [0],
                dictionary: 'Sottaku',
                dictionaryIndex: 0,
                dictionaryAlias,
                id: Number.isFinite(questionId) ? questionId : index,
                score: Math.max(0, 100 - index),
                frequencyOrder: index,
                sequences: [Number.isFinite(questionId) ? questionId : -1],
                isPrimary: true,
                tags: [],
                entries: this._createGlossaryEntries(translation, sentence, sentenceTranslation, usageNotes, language, localeLang),
            },
        ];

        const audioWord = this._resolveUrl(normalizedInfo.word_audio_file, apiOrigin);
        const audioSentence = this._resolveUrl(normalizedInfo.sentence_audio_file, apiOrigin);

        const metadata = {
            questionId: Number.isFinite(questionId) ? questionId : null,
            language,
            inFlashcards: Boolean(normalizedResult.in_flashcards),
            requested: Boolean(
                normalizedResult.requested ??
                normalizedInfo.requested ??
                normalizedResult.has_pending_request ??
                normalizedInfo.has_pending_request ??
                normalizedResult.already_requested ??
                normalizedInfo.already_requested
            ),
            audio: {
                word: audioWord,
                sentence: audioSentence,
            },
            matchLength: Number.isFinite(matchLength) ? matchLength : null,
            hasDefinition,
            translation,
            sentence,
            sentenceTranslation,
            usageNotes,
            reading,
            term,
            readingTokens,
            languageFlag: dictionaryAlias,
        };
        if (language.startsWith('zh') && displayPreferences && typeof displayPreferences === 'object') {
            metadata.hanziDisplay = displayPreferences.hanziDisplay;
            metadata.chineseReadingDisplay = displayPreferences.chineseReadingDisplay;
            metadata.toneColors = displayPreferences.chineseToneColors === true;
        }

        /** @type {any} */ (headwords[0]).sottaku = metadata;

        const entry = {
            type: 'term',
            isPrimary: true,
            textProcessorRuleChainCandidates: [],
            inflectionRuleChainCandidates,
            score: Math.max(0, 100 - index),
            frequencyOrder: index,
            dictionaryIndex: 0,
            dictionaryAlias,
            sourceTermExactMatchCount: query && term && query === term ? 1 : 0,
            matchPrimaryReading: query === reading,
            maxOriginalTextLength: Math.max(query.length, term.length, reading.length, resolvedSourceText.length),
            headwords,
            definitions,
            pronunciations: [],
            frequencies: [],
        };
        /** @type {any} */ (entry).sottaku = metadata;
        return entry;
    }

    /**
     * @param {string} translation
     * @param {string} sentence
     * @param {string} sentenceTranslation
     * @param {string} usageNotes
     * @param {string} language
     * @param {string} localeLang
     * @returns {import('dictionary-data').TermGlossaryContent[]}
     */
    _createGlossaryEntries(translation, sentence, sentenceTranslation, usageNotes, language, localeLang) {
        const hasAnyContent = Boolean(translation || sentence || sentenceTranslation || usageNotes);

        /** @type {import('structured-content').Content} */
        const content = {
            tag: 'div',
            data: {sottakuLayout: 'glossary'},
            content: [
                translation ? {tag: 'div', data: {sottakuField: 'definition'}, lang: localeLang, content: translation} : null,
                (sentence || sentenceTranslation) ? {
                    tag: 'div',
                    data: {sottakuField: 'exampleGroup'},
                    content: [
                        sentence ? {tag: 'div', data: {sottakuField: 'example'}, lang: language, content: sentence} : null,
                        sentenceTranslation ? {tag: 'div', data: {sottakuField: 'exampleTranslation'}, lang: localeLang, content: sentenceTranslation} : null,
                    ],
                } : null,
                usageNotes ? {tag: 'div', data: {sottakuField: 'usage'}, lang: localeLang, content: usageNotes} : null,
                hasAnyContent ? null : {tag: 'div', data: {sottakuField: 'empty'}, content: 'No Sottaku definition available yet.'},
            ],
        };

        return [{type: 'structured-content', content}];
    }

    /**
     * Resolve the locale that should be sent to Sottaku when the extension is configured for
     * "Automatic (use Sottaku account language)".
     * @returns {Promise<string>}
     */
    async _resolveLocale() {
        const configuredLocale = typeof this._options?.sottaku?.locale === 'string' ? this._options.sottaku.locale.trim() : '';
        if (configuredLocale) { return configuredLocale; }

        const ttlMs = 5 * 60 * 1000;
        const now = Date.now();
        if (this._automaticLocale !== null && (now - this._automaticLocaleTimestamp) <= ttlMs) {
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
     * Resolve Chinese display preferences from the Sottaku account.
     * @returns {Promise<?{hanziDisplay: string, chineseReadingDisplay: string, chineseToneColors: boolean}>}
     */
    async _resolveDisplayPreferences() {
        const now = Date.now();
        if (this._automaticSettings !== null && (now - this._automaticSettingsTimestamp) <= SOTTAKU_SETTINGS_TTL_MS) {
            return this._automaticSettings;
        }
        if (this._automaticSettingsPromise !== null) {
            return await this._automaticSettingsPromise;
        }

        this._automaticSettingsPromise = (async () => {
            try {
                const payload = await this._client.getSettings();
                const resolved = normalizeDisplayPreferencesPayload(payload);
                this._automaticSettings = resolved;
                this._automaticSettingsTimestamp = Date.now();
                return resolved;
            } catch (e) {
                this._automaticSettings = null;
                this._automaticSettingsTimestamp = Date.now();
                return null;
            } finally {
                this._automaticSettingsPromise = null;
            }
        })();

        return await this._automaticSettingsPromise;
    }

    /**
     * @param {unknown} value
     * @param {string} base
     * @returns {?string}
     */
    _resolveUrl(value, base) {
        if (!value) { return null; }
        const text = value.toString();
        try {
            return new URL(text, base).href;
        } catch (e) {
            return null;
        }
    }

    /**
     * @param {string} value
     * @returns {string}
     */
    _getOrigin(value) {
        try {
            return new URL(value).origin;
        } catch (e) {
            return 'https://sottaku.app';
        }
    }
}
