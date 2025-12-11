import {SottakuClient} from '../comm/sottaku-client.js';
import {ExtensionError} from '../core/extension-error.js';

const JAPANESE_CHAR_PATTERN = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/;
const HANGUL_CHAR_PATTERN = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/;

export class SottakuIntegration {
    constructor() {
        /** @type {SottakuClient} */
        this._client = new SottakuClient();
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
     * @returns {Promise<{dictionaryEntries: import('dictionary').TermDictionaryEntry[], originalTextLength: number}>}
     */
    async findTerms(text) {
        if (this._options === null) {
            throw new ExtensionError('Sottaku options not configured');
        }
        const {sottaku, general} = this._options;
        if (!sottaku.enabled) { return {dictionaryEntries: [], originalTextLength: text.length}; }
        if (!sottaku.authToken) {
            throw new ExtensionError('Sign in to Sottaku from the settings page to enable remote lookups.');
        }

        const language = this._resolveLanguage(text, sottaku, general.language);
        const query = (text || '').trim();
        if (!query) {
            return {dictionaryEntries: [], originalTextLength: 0};
        }

        const apiOrigin = this._getOrigin(sottaku.apiBaseUrl);
        const {results: scanResultsRaw, originalTextLength: scanOriginalLength} = await this._client.scan(
            query,
            language,
            general.maxResults || 32,
        );
        const scanResults = Array.isArray(scanResultsRaw) ? scanResultsRaw : [];
        const limitedResults = scanResults.slice(0, Math.max(1, general.maxResults || 32));

        /** @type {import('dictionary').TermDictionaryEntry[]} */
        const dictionaryEntries = [];
        for (let i = 0; i < limitedResults.length; ++i) {
            const result = limitedResults[i];
            const entry = this._createEntry(result, result, language, apiOrigin, query, i);
            dictionaryEntries.push(entry);
        }

        const originalTextLength =
            scanOriginalLength ||
            dictionaryEntries[0]?.sottaku?.matchLength ||
            dictionaryEntries[0]?.headwords?.[0]?.term?.length ||
            query.length;
        return {dictionaryEntries, originalTextLength};
    }

    /**
     * @param {unknown} result
     * @param {unknown} info
     * @param {string} language
     * @param {string} apiOrigin
     * @param {string} query
     * @param {number} index
     * @returns {import('dictionary').TermDictionaryEntry}
     */
    _createEntry(result, info, language, apiOrigin, query, index) {
        const normalizedResult = (typeof result === 'object' && result !== null) ? result : {};
        const normalizedInfo = (typeof info === 'object' && info !== null) ? info : {};
        const questionId = Number.parseInt(normalizedResult.id ?? normalizedInfo.id, 10);
        const term = (normalizedInfo.kanji_representation || normalizedResult.kanji_representation || query || '').toString();
        const reading = (normalizedInfo.reading || normalizedResult.reading || term).toString();
        const matchLength = Number.parseInt(normalizedResult.match_length ?? normalizedInfo.match_length, 10);
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
        const hasDefinition = Boolean(normalizedResult.has_definition ?? normalizedInfo.has_definition ?? translation || sentence);

        /** @type {import('dictionary').TermHeadword[]} */
        const headwords = [
            {
                index: 0,
                term: term || reading || query,
                reading: reading,
                sources: [
                    {
                        originalText: query,
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
                dictionaryAlias: 'Sottaku',
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
            dictionaryAlias: 'Sottaku',
            sourceTermExactMatchCount: query && term && query === term ? 1 : 0,
            matchPrimaryReading: query === reading,
            maxOriginalTextLength: Math.max(query.length, term.length, reading.length),
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
     * @param {string} text
     * @param {import('settings').SottakuOptions} sottakuOptions
     * @param {string} defaultLanguage
     * @returns {string}
     */
    _resolveLanguage(text, sottakuOptions, defaultLanguage) {
        switch (sottakuOptions.languageMode) {
            case 'ja': return 'ja';
            case 'ko': return 'ko';
        }
        const trimmed = (text || '').trim();
        if (HANGUL_CHAR_PATTERN.test(trimmed)) {
            return 'ko';
        }
        if (JAPANESE_CHAR_PATTERN.test(trimmed)) {
            return 'ja';
        }
        const preferred = Array.isArray(sottakuOptions.preferredLanguages) ? sottakuOptions.preferredLanguages : [];
        if (preferred.includes(defaultLanguage)) {
            return defaultLanguage;
        }
        if (preferred.length > 0) {
            return preferred[0];
        }
        return defaultLanguage || 'ja';
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
