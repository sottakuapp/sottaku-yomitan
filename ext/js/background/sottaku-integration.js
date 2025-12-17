import {SottakuClient} from '../comm/sottaku-client.js';
import {ExtensionError} from '../core/extension-error.js';
import {toError} from '../core/to-error.js';
import {getSottakuLanguageFlag, normalizeSottakuLanguages, SOTTAKU_SUPPORTED_LANGUAGES} from '../language/sottaku-languages.js';

const JAPANESE_CHAR_PATTERN = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/;
const HANGUL_CHAR_PATTERN = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/;
const SOTTAKU_UPGRADE_URL = 'https://sottaku.app/upgrade';

/**
 * @typedef {object} SottakuLanguageResult
 * @property {string} language
 * @property {import('dictionary').TermDictionaryEntry[]} entries
 * @property {number} originalTextLength
 */

export class SottakuIntegration {
    /**
     * @param {import('../language/translator.js').Translator | import('./offscreen-proxy.js').TranslatorProxy} translator
     */
    constructor(translator) {
        /** @type {SottakuClient} */
        this._client = new SottakuClient();
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

        const automaticLocaleCacheKey = `${sottaku.apiBaseUrl}|${sottaku.authToken}`;
        if (automaticLocaleCacheKey !== this._automaticLocaleCacheKey) {
            this._automaticLocaleCacheKey = automaticLocaleCacheKey;
            this._automaticLocale = null;
            this._automaticLocaleTimestamp = 0;
            this._automaticLocalePromise = null;
        }
    }

    /**
     * @param {string} text
     * @param {import('translation').FindDeinflectionOptions} [findTermsOptions]
     * @returns {Promise<{dictionaryEntries: import('dictionary').TermDictionaryEntry[], originalTextLength: number}>}
     */
    async findTerms(text, findTermsOptions) {
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

        const localePromise = this._resolveLocale();
        const languages = this._resolveLanguages(query, sottaku, general.language);
        const maxResults = Math.max(1, general.maxResults || 32);
        const apiOrigin = this._getOrigin(sottaku.apiBaseUrl);
        const locale = await localePromise;
        const localeLang = (locale || 'en').replace(/_/g, '-');

        /** @type {SottakuLanguageResult[]} */
        const languageResults = [];
        for (const language of languages) {
            const languageResult = await this._fetchLanguageEntriesWithVariants({
                apiOrigin,
                language,
                maxResults,
                variants: await this._buildQueryVariants(query, language, findTermsOptions),
                locale,
                localeLang,
            });
            languageResults.push(languageResult);
        }

        const dictionaryEntries = this._interleaveLanguageEntries(languageResults, maxResults);
        const originalTextLength = this._resolveOriginalTextLength(languageResults, dictionaryEntries, query);
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
                const fullLengthVariant = translatorVariants.find(({originalText}) => (originalText || '').trim().length === normalizedText.length);
                if (fullLengthVariant) {
                    const {originalText, deinflectedText} = fullLengthVariant;
                    variants.push({
                        query: (deinflectedText || '').trim(),
                        sourceText: (originalText || '').trim(),
                        originalTextLength: null,
                    });
                }
            } catch (e) {
                // Ignore translator errors and fall back to the raw query.
            }
        }

        if (variants.length === 0) {
            variants.push({
                query: normalizedText,
                sourceText: normalizedText,
                originalTextLength: null,
            });
        }

        return variants;
    }

    /**
     * @param {{apiOrigin: string, language: string, maxResults: number, variants: {query: string, sourceText: string, originalTextLength: number}[], locale: string, localeLang: string}} options
     * @returns {Promise<SottakuLanguageResult>}
     */
    async _fetchLanguageEntriesWithVariants({apiOrigin, language, maxResults, variants, locale, localeLang}) {
        const resolvedVariants = variants.length > 0 ? variants : [{query: '', sourceText: '', originalTextLength: 0}];
        /** @type {SottakuLanguageResult | null} */
        let fallbackResult = null;
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
     * @param {{apiOrigin: string, language: string, maxResults: number, query: string, sourceText?: string, originalTextLength?: number, locale: string, localeLang: string}} options
     * @returns {Promise<SottakuLanguageResult>}
     */
    async _fetchLanguageEntries({apiOrigin, language, maxResults, query, sourceText, originalTextLength, locale, localeLang}) {
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
        try {
            const scanResult = await this._client.scan(
                normalizedSource,
                language,
                maxResults,
                locale,
            );
            scanResultsRaw = scanResult.results;
            scanOriginalLength = scanResult.originalTextLength;
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
        /** @type {import('dictionary').TermDictionaryEntry[]} */
        const dictionaryEntries = [];
        let index = 0;
        let added = true;
        while (dictionaryEntries.length < maxResults && added) {
            added = false;
            for (const {entries} of languageResults) {
                if (index < entries.length) {
                    dictionaryEntries.push(entries[index]);
                    added = true;
                    if (dictionaryEntries.length >= maxResults) { break; }
                }
            }
            ++index;
        }
        return dictionaryEntries;
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
     * @param {string} text
     * @param {import('settings').SottakuOptions} sottakuOptions
     * @param {string} defaultLanguage
     * @returns {string[]}
     */
    _resolveLanguages(text, sottakuOptions, defaultLanguage) {
        const supportedLanguages = this._supportedLanguages.length > 0 ? this._supportedLanguages : SOTTAKU_SUPPORTED_LANGUAGES;
        const preferredLanguages = normalizeSottakuLanguages(
            sottakuOptions.preferredLanguages,
            defaultLanguage,
            supportedLanguages,
        );
        switch (sottakuOptions.languageMode) {
            case 'ja': return ['ja'];
            case 'ko': return ['ko'];
            case 'mixed': return preferredLanguages;
        }
        const detected = this._detectLanguageFromText(text);
        if (detected) { return [detected]; }
        if (preferredLanguages.length > 0) { return [preferredLanguages[0]]; }
        if (defaultLanguage) { return [defaultLanguage]; }
        return ['ja'];
    }

    /**
     * @param {string} text
     * @returns {?string}
     */
    _detectLanguageFromText(text) {
        const trimmed = (text || '').trim();
        if (HANGUL_CHAR_PATTERN.test(trimmed)) {
            return 'ko';
        }
        if (JAPANESE_CHAR_PATTERN.test(trimmed)) {
            return 'ja';
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
     * @returns {import('dictionary').TermDictionaryEntry}
     */
    _createEntry(result, info, language, apiOrigin, query, index, sourceText, matchLengthOverride, localeLang) {
        const normalizedResult = (typeof result === 'object' && result !== null) ? result : {};
        const normalizedInfo = (typeof info === 'object' && info !== null) ? info : {};
        const questionId = Number.parseInt(normalizedResult.id ?? normalizedInfo.id, 10);
        const term = (normalizedInfo.kanji_representation || normalizedResult.kanji_representation || query || '').toString();
        const reading = (normalizedInfo.reading || normalizedResult.reading || term).toString();
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
        const inflectionRuleNames = Array.isArray(rawInflectionRules) ?
            rawInflectionRules
                .map((value) => (value ?? '').toString().trim())
                .filter((value) => value.length > 0) :
            [];

        /** @type {import('dictionary').InflectionRuleChainCandidate[]} */
        const inflectionRuleChainCandidates = [];
        if (inflectionRuleNames.length > 0) {
            inflectionRuleChainCandidates.push({
                source: 'algorithm',
                inflectionRules: inflectionRuleNames.map((name) => ({name, description: ''})),
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
            languageFlag: dictionaryAlias,
        };

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
