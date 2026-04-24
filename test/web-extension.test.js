/*
 * Copyright (C) 2025  Sottaku Inc
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

import {describe, expect, test} from 'vitest';
import {isMessageConnectionError} from '../ext/js/extension/web-extension.js';

describe('WebExtension', () => {
    test('identifies missing receiver messaging errors', () => {
        expect(isMessageConnectionError(new Error('Could not establish connection. Receiving end does not exist.'))).toBe(true);
        expect(isMessageConnectionError(new Error('Receiving end does not exist.'))).toBe(true);
    });

    test('does not treat other errors as missing receiver messaging errors', () => {
        expect(isMessageConnectionError(new Error('Extension context invalidated.'))).toBe(false);
        expect(isMessageConnectionError('Receiving end does not exist.')).toBe(false);
        expect(isMessageConnectionError(null)).toBe(false);
    });
});
