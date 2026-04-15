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

import http from 'node:http';
import {parseJson} from '../../dev/json.js';
import {expect, test} from './playwright-util.js';

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

/**
 * @returns {Promise<{server: http.Server, port: number, requests: {scan: number, submit: number}}>}
 */
async function createApiServer() {
    const requests = {scan: 0, submit: 0};
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url || '/', 'http://127.0.0.1');

        if (req.method === 'POST' && url.pathname === '/api/v1/dictionary/yomitan-scan') {
            requests.scan += 1;
            let body = '';
            for await (const chunk of req) {
                body += chunk;
            }
            const payload = /** @type {{text?: string}} */ (parseJson(body || '{}'));
            const text = String(payload.text || '');
            const result = text.startsWith('孤独') ?
                {
                    results: [{
                        id: 314159,
                        language: 'ja',
                        kanji_representation: '孤独',
                        reading: 'こどく',
                        word_translation: '',
                        english_sentence: '',
                        match_length: 2,
                        has_definition: false,
                    }],
                    original_text_length: 2,
                } :
                {
                    results: [],
                    original_text_length: 0,
                };
            res.writeHead(200, {'content-type': 'application/json; charset=utf-8'});
            res.end(JSON.stringify({success: true, data: result}));
            return;
        }

        if (req.method === 'POST' && url.pathname === '/api/v1/word_requests/submit') {
            requests.submit += 1;
            let body = '';
            for await (const chunk of req) {
                body += chunk;
            }
            const payload = /** @type {{question_id?: number, language?: string}} */ (parseJson(body || '{}'));
            const valid = payload.question_id === 314159 && payload.language === 'ja';
            res.writeHead(valid ? 200 : 400, {
                'content-type': 'application/json; charset=utf-8',
                'X-New-Token': 'rotated-playwright-token',
            });
            res.end(JSON.stringify(
                valid ?
                    {success: true, data: {submitted: true}} :
                    {success: false, error: 'invalid request'},
            ));
            return;
        }

        res.writeHead(404, {'content-type': 'application/json; charset=utf-8'});
        res.end(JSON.stringify({success: false, error: 'not found'}));
    });

    await new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            resolve();
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
                resolve();
            });
        });
        throw new Error('Failed to start popup blanking test server');
    }

    return {server, port: address.port, requests};
}

/**
 * @param {import('playwright').BrowserContext} context
 * @returns {Promise<void>}
 */
async function registerXTestPage(context) {
    await context.route('https://x.com/test-yomitan', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'text/html; charset=utf-8',
            body: `<!DOCTYPE html>
                <html lang="ja">
                <body>
                    <main>
                        <article>
                            <div>これは <span id="target">孤独</span> のテストです。</div>
                        </article>
                    </main>
                </body>
                </html>`,
        });
    });
}

test('request dictionary entry keeps the popup alive after auth token rotation on x.com', async ({context, page, extensionId}) => {
    const {server, port, requests} = await createApiServer();
    const popupFrameNavigations = [];
    const popupFrameDetaches = [];

    try {
        const apiBaseUrl = `http://127.0.0.1:${port}/api/v1`;
        await registerXTestPage(context);

        page.on('framenavigated', (frame) => {
            const url = frame.url();
            if (url.startsWith('chrome-extension://') && url.includes('/popup.html')) {
                popupFrameNavigations.push(url);
            }
        });
        page.on('framedetached', (frame) => {
            const url = frame.url();
            if (url.startsWith('chrome-extension://') && url.includes('/popup.html')) {
                popupFrameDetaches.push(url);
            }
        });

        await page.goto(`chrome-extension://${extensionId}/settings.html`);
        await page.waitForLoadState('domcontentloaded');
        await updateProfileSettings(page, {
            'sottaku.enabled': true,
            'sottaku.apiBaseUrl': apiBaseUrl,
            'sottaku.authToken': 'playwright-token',
            'sottaku.locale': 'en',
            'sottaku.preferredLanguages': ['ja'],
            'general.language': 'ja',
            'scanning.length': 10,
            'scanning.selectText': true,
        });

        await page.goto('https://x.com/test-yomitan');
        const popupFramePromise = page.waitForEvent('frameattached', {timeout: 10000});

        await page.keyboard.down('Shift');
        await page.locator('#target').hover();
        const popupFrame = await popupFramePromise;
        await popupFrame.waitForLoadState('domcontentloaded');

        const requestButton = popupFrame.locator('button.sottaku-action');
        await expect(requestButton).toHaveText('Request dictionary entry');

        await requestButton.click();

        await expect(requestButton).toHaveText('Requested', {timeout: 10000});
        await expect(popupFrame.locator('.entry')).toContainText('孤独', {timeout: 10000});
        await expect.poll(async () => requests.submit).toBe(1);
        await expect.poll(async () => popupFrameNavigations.length).toBeLessThanOrEqual(1);
        await expect.poll(async () => popupFrameDetaches.length).toBe(0);
    } finally {
        await page.keyboard.up('Shift').catch(() => {});
        await context.unroute('https://x.com/test-yomitan').catch(() => {});
        await new Promise((resolve, reject) => {
            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            });
        });
    }
});
