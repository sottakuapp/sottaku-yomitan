# Extension releases

Sottaku-Yomitan uses `YYYY.M.D.N` versions with no leading zeroes. The store version comes from the build command, not `package.json`. For example, the first September 5, 2026 release is `2026.9.5.0`; another release that day increments the final component. Recheck both stores for a newer published or pending version before uploading.

## Prepare the exact release source and artifacts

1. Finish browser/device QA, freeze the source, and commit the release changes on `master`. Keep a record of the full commit SHA. The source ZIP must describe the same commit used to produce the binaries.
2. Build the stable packages with the explicit version:

   ```sh
   RELEASE_VERSION=2026.9.5.0
   npm ci
   npm run license-report:html
   npm run build -- --target chrome --version "$RELEASE_VERSION"
   npm run build -- --target firefox --version "$RELEASE_VERSION"
   ```

3. Inspect `manifest.json` inside each ZIP. Confirm the version, intended permissions, and the Firefox ID `sottaku-yomitan@sottaku.app`. The stable Firefox ZIP includes Android support; the unpacked `firefox-android` directory is a development artifact. Do not upload the Safari or development variants to these listings.
4. Package source from the frozen commit, not from a dirty working tree:

   ```sh
   git archive --format=zip --prefix=sottaku-yomitan/ --output="builds/sottaku-yomitan-source-$RELEASE_VERSION.zip" HEAD
   shasum -a 256 builds/sottaku-yomitan-chrome.zip builds/sottaku-yomitan-firefox.zip "builds/sottaku-yomitan-source-$RELEASE_VERSION.zip"
   ```

   If release binaries were built immediately before committing and copied into `builds/releases/$RELEASE_VERSION/`, verify their runtime source matches the commit before packaging source into that directory. Preserve their filenames and checksums. The source includes the lockfile and these build instructions; extract it, enter `sottaku-yomitan/`, and run the same commands with Node 22 or newer to reproduce generated libraries.

The store artifacts are:

| Purpose                            | File                                    |
| ---------------------------------- | --------------------------------------- |
| Chrome stable                      | `sottaku-yomitan-chrome.zip`            |
| Firefox desktop and Android stable | `sottaku-yomitan-firefox.zip`           |
| Mozilla source review              | `sottaku-yomitan-source-YYYY.M.D.N.zip` |

## Manual store upload

API credentials were not configured for this repository at inspection on September 5, 2026. Browser login to the publisher accounts is separate from GitHub CLI authentication. Use the existing store entries so users receive an update.

### Chrome

1. Open the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole), sign in to the Sottaku publisher, and select **Sottaku-Yomitan**, item ID `eamdkaenfibhpkkhimnngkhccdepnljo`. Confirm this matches the [public listing](https://chromewebstore.google.com/detail/sottaku-yomitan/eamdkaenfibhpkkhimnngkhccdepnljo).
2. Check the current draft/review status. Under **Package**, choose **Upload New Package** and upload `sottaku-yomitan-chrome.zip` from the validated release directory.
3. Check the parsed version and permissions. Review the existing listing, privacy practices, and distribution settings; update only information affected by this release. Keep the stable listing's distribution channel.
4. Select **Submit for Review**. Choose publication after approval or deferred publication according to the coordinated release plan. Save the resulting version/review status and artifact hash.
5. After publication, verify the public version and test installation/update from the store.

Chrome requires each uploaded code version to increase and describes these controls in its [official update guide](https://developer.chrome.com/docs/webstore/update). Review submission alone does not establish that the new version is published.

### Firefox and Firefox for Android

1. Open the [Add-ons Developer Hub](https://addons.mozilla.org/developers/), sign in to the Sottaku publisher, and select the existing **Sottaku-Yomitan** add-on, ID `sottaku-yomitan@sottaku.app`, [public listing](https://addons.mozilla.org/en-US/firefox/addon/sottaku-yomitan/).
2. Open the add-on's versions page and choose **Upload a New Version**. Upload the stable `sottaku-yomitan-firefox.zip` and retain the listed AMO distribution channel. This is an update to the existing add-on, not a new listing or an unlisted development build.
3. Review validation results and keep both Firefox and Android compatibility. The public August 18 release supports Firefox 115+ and Android 120+; preserve the store's existing Android minimum unless separately validated.
4. Supply `sottaku-yomitan-source-YYYY.M.D.N.zip` for generated/bundled code review, with the frozen commit SHA and the reproduction commands above. Provide appropriate reviewer access/instructions for account-dependent behavior through the private review fields, never in public release notes or source archives.
5. Enter release notes describing the validated account/setup improvements, confirm the existing privacy/data declarations, and submit the version. Record the result and signed download URL when available.
6. Verify the published version on both desktop and Android listings, then install/update from AMO and repeat the account-linking smoke test. A locally loaded extension does not verify the store update path.

Mozilla describes package/source upload and updating the existing add-on in its [submission guide](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/). This release makes no claim of Safari availability.

## GitHub artifact workflow

`./tag.sh --dry-run` calculates a four-digit-year tag using local tags without fetching, tagging, or pushing. The normal helper requires committed source and matching local/remote `master`, fetches current tags, and asks before creating and pushing a signed tag.

Pushing a `YYYY.M.D.N` tag triggers `create-prerelease-on-tag.yml`. It validates the tag, builds the variants, packages the committed source, and creates a GitHub prerelease containing ZIPs, `SHA256SUMS`, and provenance. Directory outputs are excluded. Manual reruns must select the same existing tag.

**Tagging does not publish any store edition.** No development or Edge publishing workflow is dispatched by the artifact workflow.

Promoting the GitHub prerelease to a stable release also defaults to manual store delivery. Automatic stable publishing is opt-in through repository variable `ENABLE_EXTENSION_STORE_PUBLISH=true`; only then does `release.yml` dispatch Chrome and Firefox for the release's exact tag. It never dispatches Edge or development editions. Keep the variable unset when uploading through store dashboards.

## Optional API publishing configuration

Before enabling automatic stable publishing, configure the intended publisher credentials as repository/organization secrets or in the `cd` environment:

| Store          | Required secret names                                                        |
| -------------- | ---------------------------------------------------------------------------- |
| Chrome stable  | `G_CLIENT_ID`, `G_CLIENT_SECRET`, `G_REFRESH_TOKEN`, `G_STABLE_EXTENSION_ID` |
| Firefox stable | `FF_EXTENSION_ID`, `FF_JWT_ISSUER`, `FF_JWT_SECRET`                          |

Set the Chrome stable ID to `eamdkaenfibhpkkhimnngkhccdepnljo` and the Firefox ID to `sottaku-yomitan@sottaku.app`. Never put tokens or signing keys in source files. GitHub CLI authentication does not supply these store credentials.

The individual `publish-chrome` and `publish-firefox` workflows can also be dispatched explicitly against the reviewed tag after credentials are configured. Their preflight stops before store API calls when the tag or credentials are missing, then verifies downloaded ZIP checksums and manifest versions. Chrome does not automatically schedule another publishing attempt if a previous version is under review; inspect the state before manually retrying.

Development publishing remains a separate explicit action. It requires dedicated development listing/signing credentials and the GitHub release upload URL. Firefox development updates additionally require the `metadata` branch and a configured development update channel. Edge is manual-only and now requires `EDGE_PRODUCT_ID`, `EDGE_CLIENT_ID`, and `EDGE_API_KEY`; it has no hardcoded upstream product ID. None of these channels is part of a stable Chrome/Firefox release.
