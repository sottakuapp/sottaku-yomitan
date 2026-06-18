// @ts-nocheck

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
const SOTTAKU_SCAN_CACHE_TTL_MS = 10 * 1000;
const SOTTAKU_SCAN_CACHE_MAX_ENTRIES = 256;
const HANZI_DISPLAY_MODES = new Set(['traditional', 'simplified', 'both']);
const HANZI_DISPLAY_SEPARATOR = ' / ';
const CHINESE_READING_MODES = new Set(['pinyin', 'bopomofo']);
const SOTTAKU_UPGRADE_URL = 'https://sottaku.app/upgrade';
const JAPANESE_PROGRESSIVE_INFLECTION_DISPLAY_PRIORITY = new Map([
    ['causative-passive', 0],
    ['causative', 1],
    ['passive', 2],
    ['potential', 3],
    ['progressive', 20],
    ['polite', 30],
    ['negative', 31],
    ['past', 32],
]);

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
 * @param {unknown} value
 * @param {string} language
 * @returns {string}
 */
function normalizeMatchCandidateText(value, language) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) { return ''; }
    return language === 'en' ? text.toLowerCase() : text;
}

/**
 * @param {string} sourceText
 * @param {unknown} candidate
 * @param {string} language
 * @returns {number}
 */
function getPrefixMatchLength(sourceText, candidate, language) {
    const source = normalizeMatchCandidateText(sourceText, language);
    const normalizedCandidate = normalizeMatchCandidateText(candidate, language);
    if (!source || !normalizedCandidate) { return 0; }
    return source.startsWith(normalizedCandidate) ? normalizedCandidate.length : 0;
}

/**
 * @param {any} value
 * @returns {string[]}
 */
function getResultMatchCandidates(value) {
    const candidates = new Set();
    const addCandidate = (candidate) => {
        if (typeof candidate !== 'string') { return; }
        const normalizedCandidate = candidate.trim();
        if (!normalizedCandidate) { return; }
        candidates.add(normalizedCandidate);
    };

    addCandidate(value.kanji_representation ?? value.kanjiRepresentation);
    addCandidate(value.reading);

    const forms = Array.isArray(value.forms) ? value.forms : [];
    for (const form of forms) {
        if (!form || typeof form !== 'object') { continue; }
        const formRole = typeof form.form_role === 'string' ? form.form_role : form.formRole;
        if (typeof formRole === 'string' && formRole && formRole !== 'surface') { continue; }
        addCandidate(form.text);
    }

    const hanziVariants = value.hanzi_variants ?? value.hanziVariants;
    if (hanziVariants && typeof hanziVariants === 'object') {
        addCandidate(hanziVariants.traditional);
        addCandidate(hanziVariants.simplified);
    }

    return [...candidates];
}

/**
 * @param {unknown} value
 * @param {string[]} propertyNames
 * @returns {string}
 */
function getObjectStringProperty(value, propertyNames) {
    const objectValue = (value && typeof value === 'object') ? /** @type {Record<string, unknown>} */ (value) : null;
    if (!objectValue) { return ''; }
    for (const propertyName of propertyNames) {
        const propertyValue = objectValue[propertyName];
        if (typeof propertyValue === 'string') { return propertyValue; }
    }
    return '';
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeInflectionRuleRelation(value) {
    const relation = typeof value === 'string' ? value.trim().toLowerCase() : '';
    switch (relation) {
        case 'alternative':
        case 'alternatives':
        case 'ambiguous':
        case 'either':
        case 'or':
            return 'alternatives';
        case 'chain':
        case 'sequence':
        case 'sequential':
        case 'and':
            return 'chain';
        default:
            return '';
    }
}

/**
 * @param {{name: string, reasonKey: string}} pair
 * @returns {string}
 */
function getInflectionRuleDisplayKey(pair) {
    const reasonKey = (pair.reasonKey || '').trim().toLowerCase();
    if (reasonKey) { return reasonKey; }
    const name = (pair.name || '').trim().toLowerCase();
    if (name === 'progressive' || name === '-いる') { return 'progressive'; }
    if (name === 'te-form' || name === '-て') { return 'te-form'; }
    return name;
}

/**
 * @param {string} language
 * @param {{name: string, reasonKey: string}[]} pairs
 * @returns {{name: string, reasonKey: string}[]}
 */
function normalizeInflectionRulePairsForDisplay(language, pairs) {
    if (language !== 'ja' || !pairs.some((pair) => getInflectionRuleDisplayKey(pair) === 'progressive')) {
        return pairs;
    }

    const filtered = pairs.filter((pair) => getInflectionRuleDisplayKey(pair) !== 'te-form');
    return [...filtered].sort((a, b) => {
        const aKey = getInflectionRuleDisplayKey(a);
        const bKey = getInflectionRuleDisplayKey(b);
        const aPriority = JAPANESE_PROGRESSIVE_INFLECTION_DISPLAY_PRIORITY.get(aKey) ?? 25;
        const bPriority = JAPANESE_PROGRESSIVE_INFLECTION_DISPLAY_PRIORITY.get(bKey) ?? 25;
        if (aPriority !== bPriority) { return aPriority - bPriority; }
        return filtered.indexOf(a) - filtered.indexOf(b);
    });
}

/**
 * @param {any} value
 * @param {string} sourceText
 * @param {string} query
 * @param {number} originalTextLength
 * @param {string} language
 * @returns {number}
 */
function deriveResultMatchLength(value, sourceText, query, originalTextLength, language) {
    const normalizedValue = (typeof value === 'object' && value !== null) ? value : {};
    const matchLengthRaw = normalizedValue.match_length ?? normalizedValue.matchLength;
    const matchLengthParsed = Number.parseInt(matchLengthRaw, 10);
    if (Number.isFinite(matchLengthParsed)) {
        return Math.max(0, matchLengthParsed);
    }

    const normalizedSource = (sourceText || '').trim();
    const normalizedQuery = (query || '').trim();
    if (normalizedSource && normalizedQuery && normalizedSource !== normalizedQuery && originalTextLength > 0) {
        return originalTextLength;
    }

    let derivedMatchLength = 0;
    for (const candidate of getResultMatchCandidates(normalizedValue)) {
        derivedMatchLength = Math.max(
            derivedMatchLength,
            getPrefixMatchLength(sourceText, candidate, language),
        );
    }
    if (derivedMatchLength > 0) {
        return derivedMatchLength;
    }

    return 0;
}

/**
 * @param {string} text
 * @param {number} length
 * @returns {string}
 */
function sliceCodePoints(text, length) {
    if (typeof text !== 'string' || text.length === 0) { return ''; }
    if (!Number.isFinite(length) || length <= 0) { return ''; }
    return Array.from(text).slice(0, length).join('');
}

/**
 * @param {string} sourceText
 * @param {string} query
 * @param {number} matchLength
 * @returns {string}
 */
function resolveDisplayedSourceText(sourceText, query, matchLength) {
    const normalizedSource = (sourceText || '').toString();
    const normalizedQuery = (query || '').toString();
    if (!normalizedSource) { return normalizedQuery; }
    if (
        Number.isFinite(matchLength) &&
        matchLength > 0 &&
        normalizedSource === normalizedQuery
    ) {
        return sliceCodePoints(normalizedSource, matchLength) || normalizedSource;
    }
    return normalizedSource;
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
        this._scanCacheConfigKey = '';
        /** @type {Map<string, {expiresAt: number, value: {results: any[], originalTextLength: number, displayPreferences: unknown | null, languageResults?: {language: string, results: any[], originalTextLength: number}[] | null}}>} */
        this._scanResponseCache = new Map();

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
        if (automaticCacheKey !== this._scanCacheConfigKey) {
            this._scanCacheConfigKey = automaticCacheKey;
            this._scanResponseCache.clear();
        }
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
     * @param {import('translation').FindDeinflectionOptions} [_findTermsOptions]
     * @param {import('api').FindTermsDetails} [details]
     * @returns {Promise<{dictionaryEntries: import('dictionary').TermDictionaryEntry[], originalTextLength: number}>}
     */
    async findTerms(text, _findTermsOptions, details) {
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
        /** @type {Map<string, {results: any[], originalTextLength: number, displayPreferences: unknown | null, languageResults?: {language: string, results: any[], originalTextLength: number}[] | null}>} */
        const scanCache = new Map();

        if (languages.length > 1) {
            let scanResult;
            try {
                scanResult = await this._scanWithCache(
                    query,
                    languages,
                    maxResults,
                    locale,
                    null,
                    scanCache,
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
                    query,
                    sourceText: query,
                    originalTextLength: query.length,
                    locale,
                    localeLang,
                    displayPreferences: language.startsWith('zh') ? displayPreferences : null,
                    scanResult: scanResultForLanguage,
                });
                languageResults.push(languageResult);
            }
        } else {
            for (const language of languages) {
                const languageResult = await this._fetchLanguageEntries({
                    apiOrigin,
                    language,
                    maxResults,
                    query,
                    sourceText: query,
                    originalTextLength: query.length,
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
                const response = await this._scanWithCache(
                    scanText,
                    language,
                    maxResults,
                    locale,
                    null,
                    scanCache,
                );
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
        const resultMetadataCache = new Map();
        /**
         * @param {any} value
         * @returns {{matchLength: number, hasDefinition: boolean}}
         */
        const getResultMetadata = (value) => {
            if (resultMetadataCache.has(value)) { return resultMetadataCache.get(value); }
            const normalizedValue = (typeof value === 'object' && value !== null) ? value : {};
            const matchLength = deriveResultMatchLength(
                normalizedValue,
                normalizedSource,
                normalizedQuery,
                Number.isFinite(originalTextLength) ? originalTextLength : 0,
                language,
            );
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

        let effectiveOriginalTextLength = 0;
        for (const result of limitedResults) {
            effectiveOriginalTextLength = Math.max(
                effectiveOriginalTextLength,
                getResultMetadata(result).matchLength,
            );
        }
        if (effectiveOriginalTextLength === 0) {
            effectiveOriginalTextLength = (
                typeof scanOriginalLength === 'number' &&
                Number.isFinite(scanOriginalLength) &&
                scanOriginalLength > 0
            ) ? scanOriginalLength : originalTextLength;
        }

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
                effectiveOriginalTextLength,
                localeLang,
                resolvedDisplayPreferences,
            ));
        }

        return {
            language,
            entries,
            originalTextLength: typeof effectiveOriginalTextLength === 'number' && Number.isFinite(effectiveOriginalTextLength) ?
                effectiveOriginalTextLength :
                0,
        };
    }

    /**
     * @param {string|string[]} language
     * @returns {string}
     */
    _getScanCacheLanguageKey(language) {
        if (Array.isArray(language)) {
            return language.join(',');
        }
        return typeof language === 'string' ? language : '';
    }

    /**
     * @param {string} text
     * @param {string|string[]} language
     * @param {number} maxResults
     * @param {string} locale
     * @param {{hanziDisplay?: string, chineseReadingDisplay?: string, chineseToneColors?: boolean} | null | undefined} displayPreferences
     * @returns {string}
     */
    _getScanCacheKey(text, language, maxResults, locale, displayPreferences) {
        const resolvedDisplayPreferences = (
            displayPreferences && typeof displayPreferences === 'object'
                ? displayPreferences
                : null
        );
        return [
            this._getScanCacheLanguageKey(language),
            typeof locale === 'string' ? locale : '',
            Number.isFinite(maxResults) ? String(maxResults) : '',
            typeof text === 'string' ? text : '',
            resolvedDisplayPreferences?.hanziDisplay || '',
            resolvedDisplayPreferences?.chineseReadingDisplay || '',
            resolvedDisplayPreferences?.chineseToneColors ? '1' : '0',
        ].join('\u0000');
    }

    /**
     * @param {string} cacheKey
     * @returns {{results: any[], originalTextLength: number, displayPreferences: unknown | null, languageResults?: {language: string, results: any[], originalTextLength: number}[] | null} | null}
     */
    _getCachedScanResponse(cacheKey) {
        const entry = this._scanResponseCache.get(cacheKey);
        if (!entry) { return null; }
        if (Date.now() >= entry.expiresAt) {
            this._scanResponseCache.delete(cacheKey);
            return null;
        }
        this._scanResponseCache.delete(cacheKey);
        this._scanResponseCache.set(cacheKey, entry);
        return entry.value;
    }

    /**
     * @param {string} cacheKey
     * @param {{results: any[], originalTextLength: number, displayPreferences: unknown | null, languageResults?: {language: string, results: any[], originalTextLength: number}[] | null}} value
     * @returns {void}
     */
    _setCachedScanResponse(cacheKey, value) {
        if (SOTTAKU_SCAN_CACHE_TTL_MS <= 0 || SOTTAKU_SCAN_CACHE_MAX_ENTRIES <= 0) { return; }
        this._scanResponseCache.set(cacheKey, {
            expiresAt: Date.now() + SOTTAKU_SCAN_CACHE_TTL_MS,
            value,
        });
        while (this._scanResponseCache.size > SOTTAKU_SCAN_CACHE_MAX_ENTRIES) {
            const oldestKey = this._scanResponseCache.keys().next().value;
            if (typeof oldestKey !== 'string') { break; }
            this._scanResponseCache.delete(oldestKey);
        }
    }

    /**
     * @param {string} text
     * @param {string|string[]} language
     * @param {number} maxResults
     * @param {string} locale
     * @param {{hanziDisplay?: string, chineseReadingDisplay?: string, chineseToneColors?: boolean} | null | undefined} displayPreferences
     * @param {Map<string, {results: any[], originalTextLength: number, displayPreferences: unknown | null, languageResults?: {language: string, results: any[], originalTextLength: number}[] | null}> | undefined} perRequestCache
     * @returns {Promise<{results: any[], originalTextLength: number, displayPreferences: unknown | null, languageResults?: {language: string, results: any[], originalTextLength: number}[] | null}>}
     */
    async _scanWithCache(text, language, maxResults, locale, displayPreferences, perRequestCache) {
        const cacheKey = this._getScanCacheKey(text, language, maxResults, locale, displayPreferences);
        if (perRequestCache && perRequestCache.has(cacheKey)) {
            return perRequestCache.get(cacheKey);
        }

        const cachedResponse = this._getCachedScanResponse(cacheKey);
        if (cachedResponse !== null) {
            if (perRequestCache) {
                perRequestCache.set(cacheKey, cachedResponse);
            }
            return cachedResponse;
        }

        const response = await this._client.scan(
            text,
            language,
            maxResults,
            locale,
            displayPreferences,
        );
        if (perRequestCache) {
            perRequestCache.set(cacheKey, response);
        }
        this._setCachedScanResponse(cacheKey, response);
        return response;
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

        for (const languageResult of languageResults) {
            if (!Array.isArray(languageResult?.entries) || languageResult.entries.length === 0) { continue; }
            const {originalTextLength} = languageResult;
            if (typeof originalTextLength === 'number' && Number.isFinite(originalTextLength)) {
                maxLength = Math.max(maxLength, originalTextLength);
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
            case 'mixed': {
                const preferredScanLanguage = this._resolvePreferredScanLanguage(details, preferredLanguages);
                if (preferredScanLanguage !== null) {
                    return {languages: [preferredScanLanguage], autoPick: false, hintLanguage: null};
                }
                return {languages: preferredLanguages, autoPick: false, hintLanguage: null};
            }
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
     * @param {import('api').FindTermsDetails} [details]
     * @param {string[]} preferredLanguages
     * @returns {?string}
     */
    _resolvePreferredScanLanguage(details, preferredLanguages) {
        const preferredScanLanguage = typeof details?.preferredScanLanguage === 'string' ?
            details.preferredScanLanguage.trim() :
            '';
        if (!preferredScanLanguage) { return null; }
        return preferredLanguages.includes(preferredScanLanguage) ? preferredScanLanguage : null;
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
        const rawInflectionRuleRelation = getObjectStringProperty(
            result,
            ['inflection_rule_relation', 'inflectionRuleRelation'],
        ) || getObjectStringProperty(
            info,
            ['inflection_rule_relation', 'inflectionRuleRelation'],
        );
        const inflectionRuleRelation = normalizeInflectionRuleRelation(rawInflectionRuleRelation);
        const inflectionRuleNames = Array.isArray(rawInflectionRules) ?
            rawInflectionRules.map((value) => (value ?? '').toString().trim()) :
            [];
        const inflectionRuleKeys = Array.isArray(rawInflectionRuleKeys) ?
            rawInflectionRuleKeys.map((value) => (value ?? '').toString().trim()) :
            [];
        /** @type {{name: string, reasonKey: string}[]} */
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
        const displayInflectionRulePairs = normalizeInflectionRulePairsForDisplay(
            grammarLanguage,
            inflectionRulePairs,
        );
        const displayedSourceText = resolveDisplayedSourceText(
            resolvedSourceText,
            query,
            matchLength,
        );

        /** @type {import('dictionary').InflectionRuleChainCandidate[]} */
        const inflectionRuleChainCandidates = [];
        if (displayInflectionRulePairs.length > 0) {
            const inflectionRules = displayInflectionRulePairs.map(({name, reasonKey}) => {
                const rule = {name, description: ''};
                if (reasonKey && grammarLanguage) {
                    rule.reasonKey = reasonKey;
                    rule.grammarLanguage = grammarLanguage;
                    rule.grammarUrl = `https://sottaku.app/dictionary/grammar/${grammarLanguage}/${encodeURIComponent(reasonKey)}`;
                }
                return rule;
            });
            inflectionRuleChainCandidates.push({
                source: 'algorithm',
                inflectionRules,
                separator: inflectionRuleRelation === 'alternatives' && inflectionRules.length > 1 ? 'alternatives' : 'chain',
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
                        originalText: displayedSourceText,
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
            maxOriginalTextLength: (
                Number.isFinite(matchLength) && matchLength > 0 ?
                    matchLength :
                    Math.max(query.length, term.length, reading.length, displayedSourceText.length)
            ),
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

        const storedUser = (this._options?.sottaku?.user && typeof this._options.sottaku.user === 'object') ?
            /** @type {Record<string, unknown>} */ (this._options.sottaku.user) :
            null;
        const storedLocale = typeof storedUser?.ui_locale === 'string' ?
            storedUser.ui_locale.trim() :
            (typeof storedUser?.uiLocale === 'string' ? storedUser.uiLocale.trim() : '');
        if (storedLocale) {
            this._automaticLocale = storedLocale;
            this._automaticLocaleTimestamp = Date.now();
            return storedLocale;
        }

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
