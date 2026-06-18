/*
 * Copyright (C) 2023-2025  Yomitan Authors
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

import http from 'node:http';
import {parseJson} from '../../dev/json.js';
import {test, expect} from './playwright-util.js';

test.beforeEach(async ({context}) => {
    const welcome = await context.waitForEvent('page');
    await welcome.close();
});

/**
 * @param {import('playwright').Page} page
 * @param {Record<string, unknown>} values
 * @returns {Promise<void>}
 */
async function updateProfileSettings(page, values) {
    await page.evaluate(async (entries) => {
        const optionsContext = {index: 0};
        const targets = Object.entries(entries).map(([path, value]) => ({
            action: 'set',
            scope: 'profile',
            optionsContext,
            path,
            value,
        }));
        await chrome.runtime.sendMessage({
            action: 'modifySettings',
            params: {targets, source: 'playwright'},
        });
    }, values);
}

test('english hover prefers bidirectional phrase spans and selects the exact source text', async ({page, extensionId}) => {
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url || '/', 'http://127.0.0.1');
        if (req.method === 'GET' && url.pathname === '/test.html') {
            res.writeHead(200, {'content-type': 'text/html; charset=utf-8'});
            res.end(`<!DOCTYPE html>
                <html lang="en">
                <body>
                    <p>it will <span id="target">become</span> soon</p>
                </body>
                </html>`);
            return;
        }

        if (req.method === 'POST' && url.pathname === '/api/v1/dictionary/yomitan-scan') {
            let body = '';
            for await (const chunk of req) {
                body += chunk;
            }
            const payload = /** @type {{text?: string}} */ (parseJson(body || '{}'));
            const text = String(payload.text || '');

            let response;
            if (text.startsWith('it will become')) {
                response = {
                    results: [{id: 1, language: 'en', kanji_representation: 'it', reading: 'ɪt', word_translation: 'it', match_length: 2, has_definition: true}],
                    original_text_length: 2,
                };
            } else if (text.startsWith('will become')) {
                response = {
                    results: [{id: 2, language: 'en', kanji_representation: 'become', reading: 'bɪˈkʌm', word_translation: 'become', match_length: 11, has_definition: true}],
                    original_text_length: 11,
                };
            } else if (text.startsWith('become')) {
                response = {
                    results: [{id: 3, language: 'en', kanji_representation: 'become', reading: 'bɪˈkʌm', word_translation: 'become', match_length: 7, has_definition: true}],
                    original_text_length: 7,
                };
            } else {
                response = {results: [], original_text_length: 0};
            }

            res.writeHead(200, {'content-type': 'application/json; charset=utf-8'});
            res.end(JSON.stringify({success: true, data: response}));
            return;
        }

        res.writeHead(404, {'content-type': 'application/json; charset=utf-8'});
        res.end(JSON.stringify({success: false, error: 'not found'}));
    });

    await new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            resolve(void 0);
        });
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
        await new Promise((resolve, reject) => {
            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(void 0);
            });
        });
        throw new Error('Failed to start Playwright test server');
    }

    try {
        const apiBaseUrl = `http://127.0.0.1:${address.port}/api/v1`;
        await page.goto(`chrome-extension://${extensionId}/settings.html`);
        await page.waitForLoadState('domcontentloaded');
        await updateProfileSettings(page, {
            'sottaku.enabled': true,
            'sottaku.apiBaseUrl': apiBaseUrl,
            'sottaku.authToken': 'playwright-token',
            'sottaku.preferredLanguages': ['en'],
            'general.language': 'en',
            'scanning.length': 20,
            'scanning.selectText': true,
        });

        await page.goto(`http://127.0.0.1:${address.port}/test.html`);
        await page.keyboard.down('Shift');
        await page.locator('#target').hover();
        await expect.poll(async () => {
            return await page.evaluate(() => window.getSelection()?.toString() || '');
        }).toBe('will become');
        await page.keyboard.up('Shift');
    } finally {
        await new Promise((resolve, reject) => {
            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(void 0);
            });
        });
    }
});

test('japanese hover expands left of the hovered character and selects the exact source text', async ({page, extensionId}) => {
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url || '/', 'http://127.0.0.1');
        if (req.method === 'GET' && url.pathname === '/test.html') {
            res.writeHead(200, {'content-type': 'text/html; charset=utf-8'});
            res.end(`<!DOCTYPE html>
                <html lang="ja">
                <body>
                    <p>今日は<span id="target">開発</span>中です</p>
                </body>
                </html>`);
            return;
        }

        if (req.method === 'POST' && url.pathname === '/api/v1/dictionary/yomitan-scan') {
            let body = '';
            for await (const chunk of req) {
                body += chunk;
            }
            const payload = /** @type {{text?: string}} */ (parseJson(body || '{}'));
            const text = String(payload.text || '');

            const response = text.startsWith('開発中') ?
                {
                    results: [{id: 1, language: 'ja', kanji_representation: '開発', reading: 'かいはつ', word_translation: 'development', match_length: 2, has_definition: true}],
                    original_text_length: 2,
                } :
                {results: [], original_text_length: 0};

            res.writeHead(200, {'content-type': 'application/json; charset=utf-8'});
            res.end(JSON.stringify({success: true, data: response}));
            return;
        }

        res.writeHead(404, {'content-type': 'application/json; charset=utf-8'});
        res.end(JSON.stringify({success: false, error: 'not found'}));
    });

    await new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            resolve(void 0);
        });
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
        await new Promise((resolve, reject) => {
            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(void 0);
            });
        });
        throw new Error('Failed to start Playwright test server');
    }

    try {
        const apiBaseUrl = `http://127.0.0.1:${address.port}/api/v1`;
        await page.goto(`chrome-extension://${extensionId}/settings.html`);
        await page.waitForLoadState('domcontentloaded');
        await updateProfileSettings(page, {
            'sottaku.enabled': true,
            'sottaku.apiBaseUrl': apiBaseUrl,
            'sottaku.authToken': 'playwright-token',
            'sottaku.preferredLanguages': ['ja'],
            'general.language': 'ja',
            'scanning.length': 10,
            'scanning.selectText': true,
        });

        await page.goto(`http://127.0.0.1:${address.port}/test.html`);
        await page.keyboard.down('Shift');
        await page.locator('#target').hover();
        await expect.poll(async () => {
            return await page.evaluate(() => window.getSelection()?.toString() || '');
        }).toBe('開発');
        await page.keyboard.up('Shift');
    } finally {
        await new Promise((resolve, reject) => {
            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(void 0);
            });
        });
    }
});

test('mixed-language hover uses the winning match span instead of a longer non-winning scan result', async ({page, extensionId}) => {
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url || '/', 'http://127.0.0.1');
        if (req.method === 'GET' && url.pathname === '/test.html') {
            res.writeHead(200, {'content-type': 'text/html; charset=utf-8'});
            res.end(`<!DOCTYPE html>
                <html lang="ja">
                <body>
                    <p><span id="target">インターネット回線の速度テスト</span> | Fast.com</p>
                </body>
                </html>`);
            return;
        }

        if (req.method === 'POST' && url.pathname === '/api/v1/dictionary/yomitan-scan') {
            res.writeHead(200, {'content-type': 'application/json; charset=utf-8'});
            res.end(JSON.stringify({
                success: true,
                data: {
                    language_results: [
                        {
                            language: 'ja',
                            results: [
                                {
                                    id: 1,
                                    language: 'ja',
                                    kanji_representation: 'インターネット',
                                    reading: 'インターネット',
                                    word_translation: 'internet',
                                    match_length: 7,
                                    has_definition: true,
                                },
                            ],
                            original_text_length: 7,
                        },
                        {
                            language: 'en',
                            results: [],
                            original_text_length: 15,
                        },
                    ],
                },
            }));
            return;
        }

        res.writeHead(404, {'content-type': 'application/json; charset=utf-8'});
        res.end(JSON.stringify({success: false, error: 'not found'}));
    });

    await new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            resolve(void 0);
        });
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
        await new Promise((resolve, reject) => {
            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(void 0);
            });
        });
        throw new Error('Failed to start Playwright test server');
    }

    try {
        const apiBaseUrl = `http://127.0.0.1:${address.port}/api/v1`;
        await page.goto(`chrome-extension://${extensionId}/settings.html`);
        await page.waitForLoadState('domcontentloaded');
        await updateProfileSettings(page, {
            'sottaku.enabled': true,
            'sottaku.apiBaseUrl': apiBaseUrl,
            'sottaku.authToken': 'playwright-token',
            'sottaku.languageMode': 'mixed',
            'sottaku.preferredLanguages': ['ja', 'en'],
            'general.language': 'ja',
            'scanning.length': 32,
            'scanning.selectText': true,
        });

        await page.goto(`http://127.0.0.1:${address.port}/test.html`);
        await page.keyboard.down('Shift');
        await page.locator('#target').hover();
        await expect.poll(async () => {
            return await page.evaluate(() => window.getSelection()?.toString() || '');
        }).toBe('インターネット');
        await page.keyboard.up('Shift');
    } finally {
        await new Promise((resolve, reject) => {
            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(void 0);
            });
        });
    }
});
