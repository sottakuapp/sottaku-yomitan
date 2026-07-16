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

import {readFileSync} from 'fs';
import {afterAll, describe, expect, test} from 'vitest';
import {DisplayGenerator} from '../ext/js/display/display-generator.js';
import {setupDomTest} from './fixtures/dom-test.js';

const {window, teardown} = await setupDomTest();
const displayCss = readFileSync(new URL('../ext/css/display.css', import.meta.url), {encoding: 'utf8'});

describe('DisplayGenerator', () => {
    afterAll(() => teardown(global));

    test('renders full Chinese reading above each dual Hanzi variant', () => {
        const generator = new DisplayGenerator(null, null);
        const container = window.document.createElement('span');

        Reflect.get(generator, '_appendToneColoredFurigana').call(
            generator,
            container,
            '履歷 / 履历',
            'lv3li4',
            'zh',
            'pinyin',
            ['lv3', 'li4'],
            'both',
        );

        const rubies = [...container.querySelectorAll('ruby')];
        const readings = rubies.map((ruby) => ruby.querySelector('rt')?.textContent);
        const spellings = rubies.map((ruby) => (
            [...ruby.querySelectorAll('.headword-kanji-link')]
                .map((node) => node.textContent)
                .join('')
        ));
        const hanziToneClasses = rubies.map((ruby) => (
            [...ruby.querySelectorAll('.headword-kanji-link')]
                .map((node) => [...node.classList].filter((className) => className.startsWith('tone-')))
        ));

        expect(rubies).toHaveLength(2);
        expect(spellings).toStrictEqual(['履歷', '履历']);
        expect(hanziToneClasses).toStrictEqual([[['tone-3'], ['tone-4']], [['tone-3'], ['tone-4']]]);
        expect(readings).toStrictEqual(['lǚ lì', 'lǚ lì']);
        expect(container.childNodes[1].textContent).toBe(' / ');
        expect([...rubies[0].querySelectorAll('rt .tone')].map((node) => node.textContent)).toStrictEqual(['lǚ', 'lì']);
        expect([...rubies[1].querySelectorAll('rt .tone')].map((node) => node.textContent)).toStrictEqual(['lǚ', 'lì']);
    });

    test('renders Sottaku Japanese pitch contour on its own headword line', () => {
        const generator = new DisplayGenerator(null, null);
        const container = window.document.createElement('div');

        const rendered = Reflect.get(generator, '_appendSottakuPitchAccent').call(
            generator,
            container,
            'あめ',
            {
                language: 'ja',
                japanesePitchAccentDisplay: 'contour',
                pitchAccent: {position: 1, reading: 'あめ'},
            },
        );

        expect(rendered).toBe(true);
        expect(container.hidden).toBe(false);
        expect(container.lang).toBe('ja');
        expect(container.querySelector('.pronunciation-text')).not.toBeNull();

        const morae = [...container.querySelectorAll('.pronunciation-mora')];
        expect(morae.map((node) => node.textContent)).toStrictEqual(['あ', 'め']);
        expect(morae.map((node) => node.dataset.pitch)).toStrictEqual(['high', 'low']);
        expect(morae.map((node) => node.dataset.pitchNext)).toStrictEqual(['low', 'low']);
    });

    test('renders Sottaku pitch contour when pitch reading only differs by kana script', () => {
        const generator = new DisplayGenerator(null, null);
        const container = window.document.createElement('div');

        const rendered = Reflect.get(generator, '_appendSottakuPitchAccent').call(
            generator,
            container,
            'あめ',
            {
                language: 'ja',
                japanesePitchAccentDisplay: 'contour',
                pitchAccent: {position: 1, reading: 'アメ'},
            },
        );

        expect(rendered).toBe(true);
        expect([...container.querySelectorAll('.pronunciation-mora')].map((node) => node.textContent)).toStrictEqual(['あ', 'め']);
    });

    test('does not render a Sottaku pitch line outside contour mode', () => {
        const generator = new DisplayGenerator(null, null);
        const container = window.document.createElement('div');
        container.hidden = true;

        const rendered = Reflect.get(generator, '_appendSottakuPitchAccent').call(
            generator,
            container,
            'あめ',
            {
                language: 'ja',
                japanesePitchAccentDisplay: 'number',
                pitchAccent: {position: 1, reading: 'あめ'},
            },
        );

        expect(rendered).toBe(false);
        expect(container.hidden).toBe(true);
        expect(container.textContent).toBe('');
    });

    test('renders Arabic Sottaku headwords RTL under an LTR extension UI', () => {
        const contentManager = /** @type {import('../ext/js/display/display-content-manager.js').DisplayContentManager} */ ({});
        const generator = new DisplayGenerator(contentManager, null);
        generator.updateLanguage('en');
        const templatesDocument = window.document.implementation.createHTMLDocument('templates');
        templatesDocument.body.innerHTML = `
            <template id="headword-template" data-remove-whitespace-text="true"><div class="headword">
                <div class="headword-text-container">
                    <span class="headword-term"></span>
                    <span class="headword-reading"></span>
                </div>
                <div class="headword-sottaku-pitch-accent" hidden></div>
            </div></template>
        `;
        Reflect.get(generator, '_templates').load(templatesDocument);

        const headword = /** @type {import('dictionary').TermHeadword & {sottaku: {language: string}}} */ ({
            index: 0,
            headwordIndex: 0,
            term: 'مدرسة',
            reading: 'مَدْرَسَة',
            sources: [{
                originalText: 'مدرسة',
                transformedText: 'مدرسة',
                deinflectedText: 'مدرسة',
                matchType: 'exact',
                matchSource: 'term',
                isPrimary: true,
            }],
            tags: [],
            wordClasses: [],
            sottaku: {language: 'ar'},
        });
        const node = Reflect.get(generator, '_createTermHeadword').call(generator, headword, 0, []);
        const textContainer = /** @type {HTMLElement} */ (node.querySelector('.headword-text-container'));
        const term = /** @type {HTMLElement} */ (node.querySelector('.headword-term'));
        const reading = /** @type {HTMLElement} */ (node.querySelector('.headword-reading'));

        expect(node.dataset.language).toBe('ar');
        expect(textContainer.dir).toBe('rtl');
        expect(term.lang).toBe('ar');
        expect(term.dir).toBe('rtl');
        expect(term.querySelectorAll('ruby')).toHaveLength(1);
        expect(term.querySelector('ruby')?.firstChild?.textContent).toBe('مدرسة');
        expect(reading.lang).toBe('ar');
        expect(reading.dir).toBe('rtl');
    });

    test('keeps tone-color rules specific enough for Hanzi links', () => {
        for (let tone = 1; tone <= 5; tone += 1) {
            expect(displayCss).toContain(`.headword-kanji-link.tone-${tone}`);
        }
    });
});
