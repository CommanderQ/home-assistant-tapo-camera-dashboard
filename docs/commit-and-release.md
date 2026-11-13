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

When shipping, bump `package.json` (and lockfile) in a dedicated commit. That commit body **and** the GitHub Release notes use the same shape:

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

## Workflow behavior

`.github/workflows/release.yml` still publishes **only** when `package.json` version changes on `main` and tag `vX.Y.Z` does not exist.

Release notes generation (`scripts/generate-release-notes.mjs`):

1. If the bump commit body already starts with `# Release …`, use that body as-is
2. Otherwise consolidate `## Features` / `## Fixes` / `## Changes` / `## Other` items from commits since the previous version tag, attach PR links when discoverable, and fall back to conventional-commit subject heuristics for older commits

`generate_release_notes: true` (GitHub auto notes) is **not** used.
