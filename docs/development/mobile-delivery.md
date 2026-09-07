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

`SottakuMobile.xcodeproj` contains the `SottakuSafariExtension` target, which the
containing app depends on and embeds in its `PlugIns` directory. This prepares
Safari delivery inside the existing app without a second customer-facing container.
The candidate native release must pass the runtime and signed-artifact gates below
before upload or release; source integration does not establish public availability.
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

Both Safari build commands bundle the dictionary popup's module graph into one
ES module to avoid iframe module-loader stalls. For this bundle, the build
replaces the copied popup's entry script; Chrome and Firefox retain their
original module entries. Each source module's `import.meta.url` keeps its original
extension URL, so SharedWorker and media worker resources remain at their existing
packaged paths. The build fails if popup imports cannot be included in the bundle.

Safari's content script also uses a bundle at the existing registered wrapper
path. It runs as a classic script to avoid a separate module-loader stall during
page lookup. A guard around the complete bundle preserves one initialization
per content-script world, including while startup is pending or after it fails.
The entry's asynchronous completion and original module URLs are preserved.
The build rejects unresolved imports and top-level await in dependencies instead
of silently changing their evaluation order. Background and worker entry scripts
remain unchanged, as do Chrome and Firefox content scripts.

Safari cross-frame calls use outgoing native `runtime.connect` ports from both
endpoints. This avoids Safari delivering `tabs.connect` to a popup frame's
content-script world while its popup listener runs in the extension page world.
The background router binds ports to browser-supplied extension, tab, frame and
document identities. An extension page registration must have this extension's
scheme and host and takes priority over an older content-script registration in
the same frame. Dedicated route ports preserve the existing invoke/ack/result
protocol and activate only after both endpoints are ready.

Pending routes have one five-second deadline. Disconnects reject pending calls;
reconnection never repeats them. Page navigation releases the old registration,
and restoring a cached page establishes a fresh registration. Background restart
retries are bounded, with another attempt available on the next lookup. Native
document IDs allow same-document URL changes. When Safari omits document IDs,
the conservative URL fallback ignores fragments but a path/query change requires
reloading the page. Chrome and Firefox keep their existing native transport.

Safari saves and dictionary-entry requests also run through the background page:
embedded extension pages can have different fetch restrictions from extension
tabs. These are two named operations with fixed API endpoints, not a general
network proxy. Only this extension's own pages may call them. Each validates the
entry, language, profile context and expected account ID, then uses a separate
client configured from the current stored profile. Relinking an account rejects
a stale popup's mutation. Results do not expose server payloads or credentials.
Failed saves and requests show localized text beside the button and allow retry.

On September 7, 2026, command enumeration from the iPad Safari popup caused a
rejected WebKit native IPC message and terminated its web process, despite the
exposed `commands.getAll` method. iOS/iPadOS Safari now avoids the commands API
and hides global shortcut configuration, including when an iPad reports a
desktop identity. Local popup hotkeys remain available. Desktop Safari, Chrome
and Firefox retain their existing global shortcut behavior. This guards the
observed popup failure; it does not assume that every Safari context lacks the
commands API.

The native handler does not expose or log credentials, share the native app's
keychain, or echo native messages. Link the extension to the same Sottaku account
through **Use browser session** in Safari. Signing in to the native app does not
automatically sign in the extension.

Safari uses **Use browser session** for sign-in, password recovery and security
checks. Its settings hide the direct password controls. Password recovery and
human checks run in the normal Sottaku website session, then the user explicitly
approves the extension connection. The website's login page includes **Forgot
password**; `/extension/link` preserves the approval destination through login.
If recovery takes longer than the extension's five-minute polling window, finish
website sign-in and click **Use browser session** again to start a fresh approval.

The Safari runtime scheme also guards every direct password/code/recovery entry
point. A stale password flow clears its transient secrets and restores the
browser-session action; existing connected credentials remain usable. Chrome and
Firefox retain their existing direct password flows. Safari does not send a
password security callback to its installation-specific extension origin. Keep
the client origin validator and server `PASSWORD_RECOVERY_EXTENSION_ORIGINS`
allowlist unchanged; never substitute a wildcard or fabricate a website recovery
session from an extension transaction.

When incrementing an iOS release, update both targets' `MARKETING_VERSION` and
`CURRENT_PROJECT_VERSION` together, including the mobile package and Android
version fields required by the existing upload guard. On September 7, 2026, the
extension's App ID and App Store profile were registered using the existing
distribution certificate. Xcode rejected the active Xcode-managed main-app profile
with manual Release signing, so a separate manual App Store profile was created
using that same certificate. Existing profiles, certificates and capabilities were
preserved. Both Release targets use
manual signing mappings in the native project and `ios/exportOptions-safari.plist`.
The release preflight rejects profiles explicitly marked `IsXcodeManaged`.
The profiles/certificate must be revalidated before their December 2026 expiration.

From `SottakuMobile`, `npm run ios:release:plan` reports the candidate and paths
without building. `npm run ios:archive` and `npm run ios:ipa` use the guarded
release helper: two jobs, no running simulators, distinct build-number artifact
directories, 8 GiB free before archiving and 2 GiB before export, with a 1.5 GiB abort
floor. Both artifacts are checked for native device platform/signing/versions and
the exact freshly generated Safari resource set. These commands never upload.

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

Before release, run the core flow on Safari on an iPhone and iPad using the
production extension resources:

1. Enable the extension, grant access to the selected site and open extension
   settings. Settings must offer **Use browser session** with no direct password
   controls. Approve the intended account on the website and verify the connected
   account; signing in alone must not approve the extension.
2. Tap a supported-language word near the viewport edges, confirm the popup
   contents are reachable, and dismiss it with Close. Save once, confirm the card
   belongs to the same account and verify its disabled saved state on reopening.
3. Background and resume Safari, then repeat a lookup and dismissal with the
   account and site permission preserved.

Record the actual scrolling input and result. If automation cannot deliver a
natural swipe and the same failure occurs without extension access, retain
natural swipe scrolling as unverified. Keyboard scrolling does not establish a
physical-touch pass; this limitation remains explicit in the release evidence.

Check these shared flows once per release candidate, on either device:

1. Verify a lookup inside a short frame displays its popup in the root page.
   Deny access to a separate test origin, confirm scanning stops there, and
   restore the previous permission.
2. Verify a non-Pro account receives the connected-lookup restriction. Ordinary
   flashcard access remains free. Unlink while a save popup is open: saving must
   fail visibly without creating a card. Relink with explicit approval and
   confirm that retry succeeds exactly once for the intended account.
3. Start browser linking from the logged-out website and verify the login and
   **Forgot password** entry points. Close approval without confirming and check
   that the extension stays disconnected; then approve a fresh link. Full
   password resets, induced security challenges and waiting out the polling
   window on each device are not required for this extension release. The
   automated tests below retain approval, timeout and stale-flow coverage.
4. Confirm an extension-saved card appears in the same account's card interface,
   preview and reveal it, and open the normal review flow. This verifies saved-card
   access and review handoff without grading unrelated account cards. Do not
   describe a preview or queue entry as a completed review.

Retain dated evidence for the tested source revision. Repeat a completed check
when a relevant code, packaging or environment change invalidates that evidence.
Signing preparation can proceed alongside device checks. Before submission,
archive the existing app with the extension and verify the embedded production
resources, both bundle IDs, matching release/build versions, signing and App
Store validation. Describe Safari as available only after the containing app is
available, with installation, site-access and explicit account-link instructions.

Run the automated security, authentication, lifecycle and packaging checks:

```sh
npx vitest run test/mobile-build.test.js test/safari-popup-build.test.js \
  test/safari-content-build.test.js test/safari-cross-frame-router.test.js \
  test/safari-sottaku-actions.test.js \
  test/application.test.js test/api.test.js test/extension-commands.test.js \
  test/sottaku-controller.test.js test/safari-sign-in.test.js test/options-security.test.js \
  test/sottaku-client.test.js test/display-sottaku.test.js
```

The packaging tests cover real output exclusions/stale-file removal, the Safari
background/security configuration, Firefox Android output, and popup/content
bundling with preserved worker resource URLs. Content tests also cover duplicate
injection during pending, successful and failed startup. Application and API
tests cover Safari/Firefox/Chrome background transport selection, validated readiness
acknowledgements, retry boundaries, and media worker port transfer. Command tests
verify that mobile Safari never accesses the commands API, including on an iPad
reporting macOS, while local hotkeys and desktop behavior remain intact. Existing
auth and save tests cover token refresh/retry, invalidation, account binding and
privileged API boundaries; there is no need to wait for a production token to
expire. Safari sign-in
tests cover stale password flows, unchanged desktop controls, existing account
credentials, explicit approval, timeout/retry and every shipped locale catalog.
These security checks remain required: page content must not receive credentials
or invoke privileged save/account actions, and stale password/recovery flows must
restore browser linking without an extension-origin challenge or loss of an
existing connection. Website recovery keeps its existing security controls and
callback-origin restrictions.
