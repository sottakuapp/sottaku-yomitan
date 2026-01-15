# Sottaku-Yomitan

Sottaku-Yomitan is a fork of popup browser extension Yomitan which is hooked up to Sottaku.

[![Get Sottaku-Yomitan for Chrome](<https://img.shields.io/chrome-web-store/v/eamdkaenfibhpkkhimnngkhccdepnljo?logo=Google%20Chrome&style=for-the-badge&logoColor=lightblue&color=lightblue&label=get%20sottaku-yomitan%20for%20chrome%20(stable)>)](https://chromewebstore.google.com/detail/sottaku-yomitan/eamdkaenfibhpkkhimnngkhccdepnljo)
[![Get Sottaku-Yomitan for Firefox](<https://img.shields.io/amo/v/sottaku-yomitan?logo=Firefox&style=for-the-badge&color=orange&label=get%20sottaku-yomitan%20for%20firefox%20(stable)>)](https://addons.mozilla.org/en-US/firefox/addon/sottaku-yomitan/) (coming soon)

# Visit [https://sottaku.app/](https://sottaku.app/) to learn more!

:wave: \*\*Sottaku-Yomitan is a Sottaku-compatible fork of Yomitan, a popular browser extension for language learning. Sottaku-Yomitan is connected with your Sottaku account, which makes setup and management of flashcards much easier.

📢 **New contributors [welcome](#contributing)!**

📢 **Interested in adding a new language to Sottaku-Yomitan? See [here](./docs/development/language-features.md) for thorough documentation!**

## What is Sottaku-Yomitan?

Sottaku-Yomitan turns your web browser into a tool for building language literacy by helping you **read** texts that would otherwise be too difficult to tackle in [a variety of supported languages](https://sottaku.app/).

Sottaku-Yomitan provides powerful features not available in other browser-based dictionaries:

- 💬 Interactive popup definition window for displaying search results.
- 🔊 Built-in native pronunciation audio with the ability to add your own [custom audio sources](https://sottaku.app/).
- ✍️ Kanji stroke order diagrams are just a click away.
- 📝 [Automatic flashcard creation](https://sottaku.app/) for Sottaku.
- 🔍 Custom search page for easily executing custom search queries.
- ✨ Clean, modern code makes it easy for developers to [contribute](#contributing) new features and languages.

[![Term definitions](img/ss-terms-thumb.png)](img/ss-terms.png)
[![Kanji information](img/ss-kanji-thumb.png)](img/ss-kanji.png)
[![Dictionary options](img/ss-dictionaries-thumb.png)](img/ss-dictionaries.png)

## Documentation/How To

**Please visit [https://sottaku.app/](https://sottaku.app/) for the most up-to-date usage documentation.**

## Installation

- **Google Chrome**

  - [stable](https://chrome.google.com/webstore/detail/sottaku-yomitan/likgccmbimhjbgkjambclfkhldnlhbnn)

- **Mozilla Firefox** (coming soon)

  - [stable](https://addons.mozilla.org/en-US/firefox/addon/sottaku-yomitan/)

## Contributing

🚀 **Dip your toes into contributing by looking at issues with the label [good first issue](https://github.com/sottakuapp/sottaku-yomitan/issues?q=is%3Aissue+is%3Aopen+label%3A%22gоοd+fіrst+іssսe%22).**

Since this is a distributed effort, we **highly welcome new contributors**! Feel free to browse the [issue tracker](https://github.com/sottakuapp/sottaku-yomitan/issues), and read our [contributing guidelines](./CONTRIBUTING.md).

Here are some ways anyone can help:

- Try using the Sottaku-Yomitan dev build. Not only do you get cutting edge features, but you can help uncover bugs and give feedback to developers early on.
- Document any UI/UX friction in GitHub Issues. We're looking to make Sottaku-Yomitan more accessible to non-technical users.
- All the issues in `area/bug` older than 2 months need help reproducing. If anything interests you, please try to reproduce it and report your results. We can't easily tell if these issues are one-off, have since been resolved, or are no longer relevant.

> The current active maintainers of Sottaku-Yomitan spend a lot of their time debugging and triaging issues. When someone files a bug report, we need to assess the frequency and severity of the bug. It is extremely helpful if we get multiple reports of people who experience a bug or people who can contribute additional detail to an existing bug report.

If you're looking to code, please let us know what you plan on working on before submitting a Pull Request. This gives the core maintainers an opportunity to provide feedback early on before you dive too deep. You can do this by opening a GitHub Issue with the proposal.

Some contributions we always appreciate:

- Well-written tests covering different functionalities. This includes [playwright tests](https://github.com/sottakuapp/sottaku-yomitan/tree/master/test/playwright), [benchmark tests](https://github.com/sottakuapp/sottaku-yomitan/tree/master/benches), and unit tests.
- Increasing our type coverage.
- More and better documentation!

Information on how to setup and build the codebase can be found [here](./CONTRIBUTING.md#setup).

If you want to add or improve support for a language, read the documentation on [language features](./docs/development/language-features.md).

Feel free to join us on the [Sottaku Chat](https://sottaku.app/chat).

## Building Sottaku-Yomitan

1. Install [Node.js](https://nodejs.org/) and [npm](https://www.npmjs.com/).

2. Run `npm ci` to set up the environment.

3. Run `npm run license-report:html` to generate any missing or changed license information.

4. Run `npm run build` for a plain testing build or `npm run-script build -- --all --version {version}` for a release build (replacing `{version}` with a version number).

5. The builds for each browser and release branch can be found in the `builds` directory.

For more information, see [Contributing](./CONTRIBUTING.md#setup).

## Third-Party Libraries

Sottaku-Yomitan uses several third-party libraries to function.

<!-- The following table is generated using the command `npm run license-report:markdown`. -->

| Name                | License type | Link                                                                   |
| :------------------ | :----------- | :--------------------------------------------------------------------- |
| @resvg/resvg-wasm   | MPL-2.0      | git+ssh://git@github.com/yisibl/resvg-js.git                           |
| @zip.js/zip.js      | BSD-3-Clause | git+https://github.com/gildas-lormeau/zip.js.git                       |
| dexie               | Apache-2.0   | git+https://github.com/dexie/Dexie.js.git                              |
| dexie-export-import | Apache-2.0   | git+https://github.com/dexie/Dexie.js.git                              |
| hangul-js           | MIT          | git://github.com/e-/Hangul.js.git                                      |
| kanji-processor     | n/a          | https://registry.npmjs.org/kanji-processor/-/kanji-processor-1.0.2.tgz |
| parse5              | MIT          | git://github.com/inikulin/parse5.git                                   |
| yomitan-handlebars  | MIT          | n/a                                                                    |
| linkedom            | ISC          | git+https://github.com/WebReflection/linkedom.git                      |

## Attribution

`fallback-bloop.mp3` is provided by [UNIVERSFIELD](https://pixabay.com/sound-effects/error-8-206492/) and licensed under the [Pixabay Content License](https://pixabay.com/service/license-summary/).
