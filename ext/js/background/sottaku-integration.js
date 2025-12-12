import {SottakuClient} from '../comm/sottaku-client.js';
import {ExtensionError} from '../core/extension-error.js';
import {toError} from '../core/to-error.js';
import {getSottakuLanguageFlag, normalizeSottakuLanguages} from '../language/sottaku-languages.js';

const JAPANESE_CHAR_PATTERN = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/;
const HANGUL_CHAR_PATTERN = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/;

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

        const languages = this._resolveLanguages(query, sottaku, general.language);
        const maxResults = Math.max(1, general.maxResults || 32);
        const apiOrigin = this._getOrigin(sottaku.apiBaseUrl);

        /** @type {SottakuLanguageResult[]} */
        const languageResults = [];
        for (const language of languages) {
            const languageResult = await this._fetchLanguageEntriesWithVariants({
                apiOrigin,
                language,
                maxResults,
                variants: await this._buildQueryVariants(query, language, findTermsOptions),
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
        /** @type {{query: string, sourceText: string, originalTextLength: number}[]} */
        const variants = [];
        /** @type {Set<string>} */
        const seenQueries = new Set();
        const pushVariant = (query, sourceText) => {
            const normalizedQuery = (query || '').trim();
            if (!normalizedQuery || seenQueries.has(normalizedQuery)) { return; }
            seenQueries.add(normalizedQuery);
            const normalizedSourceText = (sourceText || normalizedQuery).trim();
            variants.push({
                query: normalizedQuery,
                sourceText: normalizedSourceText,
                originalTextLength: normalizedSourceText.length,
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
                const translatorVariants = await this._translator.getDeinflectionTextVariants(text, {...deinflectionOptions, language});
                for (const {originalText, deinflectedText} of translatorVariants) {
                    pushVariant(deinflectedText, originalText);
                }
            } catch (e) {
                // Ignore translator errors and fall back to the raw query.
            }
        }

        pushVariant(text, text);

        return variants;
    }

    /**
     * @param {{apiOrigin: string, language: string, maxResults: number, variants: {query: string, sourceText: string, originalTextLength: number}[]}} options
     * @returns {Promise<SottakuLanguageResult>}
     */
    async _fetchLanguageEntriesWithVariants({apiOrigin, language, maxResults, variants}) {
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
     * @param {{apiOrigin: string, language: string, maxResults: number, query: string, sourceText?: string, originalTextLength?: number}} options
     * @returns {Promise<SottakuLanguageResult>}
     */
    async _fetchLanguageEntries({apiOrigin, language, maxResults, query, sourceText, originalTextLength}) {
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
                normalizedQuery,
                language,
                maxResults,
            );
            scanResultsRaw = scanResult.results;
            scanOriginalLength = scanResult.originalTextLength;
        } catch (e) {
            const message = toError(e).message || '';
            const lowered = message.toLowerCase();
            if (lowered.includes('402') || lowered.includes('pro subscription') || lowered.includes('upgrade')) {
                throw new ExtensionError('Upgrade required: https://sottaku.app/upgrade');
            }
            throw e;
        }

        const scanResults = Array.isArray(scanResultsRaw) ? scanResultsRaw : [];
        const limitedResults = scanResults.slice(0, Math.max(1, maxResults));

        // Batch flashcard membership for accurate button state
        const questionIds = limitedResults
            .map((item) => Number.parseInt(item?.id, 10))
            .filter((id) => Number.isFinite(id) && id > 0);
        let inFlashcards = new Set();
        if (questionIds.length > 0 && this._client.authToken) {
            try {
                inFlashcards = await this._client.getFlashcardMembership(questionIds, language);
            } catch (e) {
                // NOP
            }
        }

        /** @type {import('dictionary').TermDictionaryEntry[]} */
        const entries = [];
        for (let i = 0; i < limitedResults.length; ++i) {
            const result = limitedResults[i];
            if (inFlashcards.has(Number.parseInt(result?.id, 10))) {
                result.in_flashcards = true;
            }
            entries.push(this._createEntry(
                result,
                result,
                language,
                apiOrigin,
                normalizedQuery,
                i,
                normalizedSource,
                originalTextLength,
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
        const preferredLanguages = normalizeSottakuLanguages(sottakuOptions.preferredLanguages, defaultLanguage);
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
     * @returns {import('dictionary').TermDictionaryEntry}
     */
    _createEntry(result, info, language, apiOrigin, query, index, sourceText, matchLengthOverride) {
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
        const sentenceTranslation = (normalizedInfo.english_sentence || '').toString();
        const usageNotes = (normalizedInfo.usage_notes || '').toString();
        const hasDefinition = Boolean((normalizedResult.has_definition ?? normalizedInfo.has_definition ?? null) || translation || sentence);
        const dictionaryAlias = getSottakuLanguageFlag(language);
        const resolvedSourceText = (sourceText || query || '').toString();

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
                entries: this._createGlossaryEntries(translation, sentence, sentenceTranslation, usageNotes),
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
            inflectionRuleChainCandidates: [],
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
     * @returns {import('dictionary-data').TermGlossaryContent[]}
     */
    _createGlossaryEntries(translation, sentence, sentenceTranslation, usageNotes) {
        /** @type {import('dictionary-data').TermGlossaryContent[]} */
        const entries = [];
        if (translation) { entries.push(translation); }
        if (sentence) { entries.push(`Context: ${sentence}`); }
        if (sentenceTranslation) { entries.push(`Translation: ${sentenceTranslation}`); }
        if (usageNotes) { entries.push(`Usage: ${usageNotes}`); }
        if (entries.length === 0) {
            entries.push('No Sottaku definition available yet.');
        }
        return entries;
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
