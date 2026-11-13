# Commit and release conventions

Repo: `CommanderQ/home-assistant-tapo-camera-dashboard`  
Also summarized in root [`AGENTS.md`](../AGENTS.md).

## Every commit

Use a short subject line, then a **markdown body** with only the categories that apply:

```markdown
## Features
- Concise user-facing capability

## Fixes
- Concise bug fix

## Changes
- Behavior or non-fix change that is not a new feature

## Other
- Docs, CI, chores, misc
```

Rules:

- Concise list items (one line each when possible)
- Omit empty categories
- Do **not** bump `package.json` version unless intentionally cutting a HACS release

## Version bump commit + GitHub Release

When shipping, bump `package.json` (and lockfile) in a dedicated commit. That commit’s **full body** becomes the GitHub Release body as-is (workflow reads `git log -1 --format=%b` on the bump commit). Author it in this shape:

```markdown
# Release x.x.x

## Features
- … ([#12](https://github.com/CommanderQ/home-assistant-tapo-camera-dashboard/pull/12))

## Fixes
- …

## Changes
- …

## Other
- …
```

- `x.x.x` comes from `package.json` `version` (tag will be `vX.Y.Z`)
- Categories **consolidate** all commits since the previous version tag
- Include a **PR link per change/PR** when a PR exists
- Omit empty categories
- An empty bump-commit body fails the release job

## Workflow behavior

`.github/workflows/release.yml` publishes **only** when `package.json` version changes on `main` and tag `vX.Y.Z` does not exist.

Release notes: the version-bump commit message body is used verbatim (`body_path` from that body). `generate_release_notes: true` (GitHub auto notes) is **not** used. There is no notes-generator script.
