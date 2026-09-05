# Mobile delivery

## Firefox for Android

The public [Sottaku-Yomitan listing](https://addons.mozilla.org/en-US/firefox/addon/sottaku-yomitan/)
includes Firefox for Android. On September 5, 2026, AMO listed version
`2026.8.18.0`, with Android compatibility starting at Firefox 120.
The repository's Firefox manifest remains compatible with desktop Firefox.

Install from AMO in Firefox for Android. Open the extension's Settings → Sottaku
→ Account → **Use browser session**, sign in at Sottaku if needed, and confirm
the account link. Sottaku Pro is required for connected lookups. The confirmation
uses a one-time browser link; it does not copy browser cookies into the extension.
Enable the recommended website permission when prompted. Clipboard and native
messaging permissions are not required for Sottaku lookups or saving flashcards.
The default touch input scans on a tap, with no hold delay.

For a temporary development install, follow Mozilla's
[Android extension development instructions](https://extensionworkshop.com/documentation/develop/developing-extensions-for-firefox-for-android/):

```sh
npm run build -- --target firefox-android --version 2026.8.18.0
web-ext run --target firefox-android --android-device emulator-5554 \
  --firefox-apk org.mozilla.firefox --source-dir builds/sottaku-yomitan-firefox-android
```

Use the actual ID returned by `adb devices`; never wipe an existing emulator to
prepare this test. Temporary loading does not verify the AMO installation prompt.

On September 5, 2026, Firefox 155.0.1 on an isolated Android 11 (API 30) arm64
emulator loaded the public signed XPI temporarily. The native website permission
prompt and a logged-out website sign-in followed by one-time account confirmation
succeeded. A real touch tap displayed the Pro requirement for the free test account.
The current development build then passed an existing Pro account sign-in, a
trusted touch lookup of Japanese 猫, and touch saving. The popup changed to the
localized disabled Saved state; an authenticated lookup confirmed entry 1508 was
in that same account's flashcards. The Pro account's Arabic locale also exercised
RTL popup rendering. No account membership or browser security settings changed.
The temporary device and downloaded SDK packages were removed after testing.

This run also reproduced a connected-account label being replaced by the static
Not connected translation when the account locale finished loading. The account
controller now owns the dynamic status, and both a regression test and the real
Android settings page verify that the signed-in state remains visible.

## Safari in the existing iOS app

`SottakuMobile.xcodeproj` contains the independent `SottakuSafariExtension` target.
The default app target does not depend on or embed it, so ordinary app releases
do not ship an unverified Safari extension. Once the runtime release gate below
passes, add a dependency from `SottakuMobile` to `SottakuSafariExtension` and an
Embed App Extensions copy phase targeting `PlugIns` with Remove Headers on Copy.
This will bundle it in the existing app without a second customer-facing container.
The extension's bundle ID is `com.sottaku.sottakumobile.SafariExtension`.
Its minimum OS is iOS/iPadOS 16.4, matching its use of `storage.session`.
The existing app retains its own deployment target.

The extension build phase invokes `dev/bin/build-safari.js` with the app release
version and copies fresh generated resources into the extension bundle. Run
`npm ci` in `sottaku-yomitan` before the native build, and configure Node.js 22+
using `SottakuMobile/ios/.xcode.env`. The generated extension resources and native
build output stay outside tracked source. To build the resources on their own:

```sh
npm run build:safari
```

Unlike the general browser build command, this entry point never rewrites
`ext/manifest.json`. The Safari variant uses a nonpersistent background page,
MV3 object security policy, and no Chrome offscreen, native messaging, omnibox,
or iOS-unsupported context-menu permission. Background communication follows
the manifest's actual background type, so Safari's support for service workers
does not incorrectly select Chrome's transport.

The native handler does not expose or log credentials, share the native app's
keychain, or echo native messages. Link the extension to the same Sottaku account
through **Use browser session** in Safari. Signing in to the native app does not
automatically sign in the extension.

The password recovery human-check callback is a separate unresolved Safari gate:
its client origin validator and server `PASSWORD_RECOVERY_EXTENSION_ORIGINS`
parser currently accept Chrome/Firefox origins. Keep the browser-session flow
as the planned Safari connection path. Before enabling password recovery, verify
Safari's actual callback origin and add it consistently to the exact-origin
validation and tests; do not allow arbitrary origins or weaken the callback checks.

When incrementing an iOS release, update both targets' `MARKETING_VERSION` and
`CURRENT_PROJECT_VERSION` together. A signed release needs an App ID and
provisioning profile for the extension as well as the existing app. This work
has not registered or changed remote signing resources.

Build the independent native target with `xcodebuild -project
SottakuMobile/ios/SottakuMobile.xcodeproj -target SottakuSafariExtension
-configuration Debug -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO build` from
the repository root. This compiles the extension without embedding it in the app.
For runtime testing, Apple's packager can create an isolated QA container:

```sh
xcrun safari-web-extension-converter builds/sottaku-yomitan-safari \
  --project-location /tmp/sottaku-safari-check --app-name 'Sottaku Safari Check' \
  --bundle-identifier app.sottaku.safaricheck --swift --ios-only --no-open --no-prompt
```

The installed Xcode 26.5 packager reports `persistent` as unsupported in MV3.
The explicit `false` value is retained for iOS tooling: without it the same
packager incorrectly warns about persistent background pages. Apple's
[compatibility guidance](https://developer.apple.com/documentation/safariservices/assessing-your-safari-web-extension-s-browser-compatibility)
states that MV3 background pages are nonpersistent. Check that the generated
container's bundle ID prefixes its extension's ID before building; the packager
used here generated mismatched IDs when a custom app name was supplied.

## Verification and release gate

The existing app's extension target has compiled successfully for arm64 iOS
Simulator with Xcode 26.5. An isolated converter host also compiled and installed
on an iPad simulator. These are packaging checks; they do not establish that
Safari lookups work.

Before describing Safari as available or releasing it, verify all of these on
Safari on an iPhone and iPad:

1. Enable the extension in Settings → Apps → Safari → Extensions (the path varies
   by OS version), and grant the selected site's access.
2. Open Settings from Safari's extension menu; complete **Use browser session**
   with the intended test account, including logged-out sign-in and cancellation.
3. Tap a real supported-language word, scroll naturally, dismiss the popup,
   and repeat near the viewport edges and inside a frame.
4. Save a flashcard; verify it appears exactly once on the same Sottaku account.
   Check the signed-out and non-Pro cases as well.
5. Reopen Safari after background suspension and confirm linking, scanning,
   permissions, and token refresh still behave correctly.
6. Confirm denying site access prevents scanning and page content cannot read
   credentials or invoke privileged save/account APIs.
7. Archive the existing app with the extension and verify both bundle IDs,
   matching release/build versions, signing, and App Store validation.

Automated checks:

```sh
npx vitest run test/mobile-build.test.js test/application.test.js \
  test/sottaku-controller.test.js test/options-security.test.js \
  test/sottaku-client.test.js test/display-sottaku.test.js
```

The packaging tests cover real output exclusions/stale-file removal, the Safari
background/security configuration, and Firefox Android output. Application tests
cover Safari/Firefox/Chrome background transport selection. Existing auth and
save tests cover token exchange and privileged API boundaries.
