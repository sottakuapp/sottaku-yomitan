#!/usr/bin/env bash
# Create a signed YYYY.M.D.N tag. Pushing builds a GitHub prerelease only.
set -euo pipefail

dry_run=false
if [[ $# -eq 1 && ${1:-} == --dry-run ]]; then
    dry_run=true
elif [[ $# -ne 0 ]]; then
    echo 'Usage: ./tag.sh [--dry-run]' >&2
    exit 2
fi

if [[ $(git branch --show-current) != master ]]; then
    echo 'Tag releases from master.' >&2
    exit 1
fi

if ! $dry_run; then
    if [[ -n $(git --no-optional-locks status --porcelain --untracked-files=normal) ]]; then
        echo 'Commit the release source and tests before tagging.' >&2
        exit 1
    fi
    git fetch origin master --tags
    if [[ $(git rev-parse HEAD) != "$(git rev-parse origin/master)" ]]; then
        echo 'Local master and origin/master must identify the same release commit.' >&2
        exit 1
    fi
fi

release_date=$(date +%Y.%-m.%-d)
counter=0
tag="$release_date.$counter"
while git show-ref --verify --quiet "refs/tags/$tag"; do
    counter=$((counter + 1))
    if ((counter > 65535)); then
        echo 'The daily version counter exceeds the extension manifest limit.' >&2
        exit 1
    fi
    tag="$release_date.$counter"
done

if $dry_run; then
    echo "$tag (local tags only; no fetch, tag creation, or push)"
    exit 0
fi

git log -1 --oneline
read -r -p "Create signed tag $tag? [y/N] " answer
[[ $answer == y || $answer == Y ]] || exit 0
git tag -s "$tag" -m "Sottaku-Yomitan $tag"
read -r -p "Push $tag to build prerelease artifacts? [y/N] " answer
[[ $answer == y || $answer == Y ]] || exit 0
git push origin "refs/tags/$tag"
