/*
 * Copyright (C) 2023-2026  Yomitan Authors
 * Copyright (C) 2020-2022  Yomichan Authors
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

import {Application} from '../application.js';
import {localizeElement} from '../dom/i18n.js';
import {LocaleDirectionController} from '../dom/locale-direction-controller.js';
import {SettingsController} from '../pages/settings/settings-controller.js';
import {AnkiTemplateRenderer} from './anki-template-renderer.js';
import {TemplateRendererFrameApi} from './template-renderer-frame-api.js';

/**
 * Entry point.
 * @param {Application} application
 */
async function main(application) {
    const settingsController = new SettingsController(application);
    await settingsController.prepare();
    const localeDirectionController = new LocaleDirectionController();
    settingsController.on('optionsChanged', ({options}) => {
        void localeDirectionController.applyFromOptions(options);
    });
    void settingsController.getOptions().then((options) => {
        void localeDirectionController.applyFromOptions(options);
    });

    const ankiTemplateRenderer = new AnkiTemplateRenderer(document, window);
    await ankiTemplateRenderer.prepare();
    const templateRendererFrameApi = new TemplateRendererFrameApi(ankiTemplateRenderer.templateRenderer);
    templateRendererFrameApi.prepare();
}

localizeElement(document);

await Application.main(true, async (application) => {
    await main(application);
});
