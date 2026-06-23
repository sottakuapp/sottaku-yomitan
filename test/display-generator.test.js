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

    test('keeps tone-color rules specific enough for Hanzi links', () => {
        for (let tone = 1; tone <= 5; tone += 1) {
            expect(displayCss).toContain(`.headword-kanji-link.tone-${tone}`);
        }
    });
});
