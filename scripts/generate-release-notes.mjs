#!/usr/bin/env node
/**
 * Build GitHub Release notes matching AGENTS.md / docs/commit-and-release.md.
 *
 * Prefer the version-bump commit body when it already starts with `# Release`.
 * Otherwise consolidate ## Features / ## Fixes / ## Changes / ## Other list
 * items from commits since the previous version tag, attaching PR links when
 * known from the commit message or GitHub's commit→PR API.
 *
 * Usage:
 *   node scripts/generate-release-notes.mjs <version> [previousTag]
 * Env:
 *   GITHUB_REPOSITORY  owner/repo (optional; enables PR API lookup)
 *   GITHUB_TOKEN       token for API (optional)
 * Output: markdown on stdout
 */

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const CATEGORIES = ["Features", "Fixes", "Changes", "Other"];

const version = process.argv[2];
const previousTag = process.argv[3] || "";
const outPath = process.argv[4] || "";

if (!version) {
  console.error("Usage: generate-release-notes.mjs <version> [previousTag] [outPath]");
  process.exit(1);
}

function git(args, opts = {}) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...opts,
    }).trimEnd();
  } catch (err) {
    const stderr = err?.stderr?.toString?.() || err?.message || String(err);
    throw new Error(`git ${args.join(" ")} failed: ${stderr.trim()}`);
  }
}

function tagExists(tag) {
  if (!tag) return false;
  try {
    git(["rev-parse", "-q", "--verify", `${tag}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

function parseSections(body) {
  const buckets = Object.fromEntries(CATEGORIES.map((c) => [c, []]));
  if (!body) return buckets;

  let current = null;
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      const name = heading[1].trim();
      const match = CATEGORIES.find((c) => c.toLowerCase() === name.toLowerCase());
      current = match || null;
      continue;
    }
    if (!current) continue;
    const item = line.match(/^\s*[-*+]\s+(.+)$/);
    if (item) buckets[current].push(item[1].trim());
  }
  return buckets;
}

function guessCategory(subject) {
  const s = subject.toLowerCase();
  if (/^(feat|feature)(\b|[(:!/])/.test(s)) return "Features";
  if (/^(fix)(\b|[(:!/])/.test(s)) return "Fixes";
  if (/^(refactor|perf|style|docs|ci|build|chore|change)(\b|[(:!/])/.test(s)) {
    return "Changes";
  }
  return "Other";
}

function extractPrNumbers(...texts) {
  const found = new Set();
  for (const text of texts) {
    if (!text) continue;
    for (const m of text.matchAll(/(?:^|\W)#(\d+)\b/g)) {
      found.add(Number(m[1]));
    }
    for (const m of text.matchAll(
      /(?:merge(?:d)?\s+pull\s+request|pull\s+request)\s+#(\d+)/gi,
    )) {
      found.add(Number(m[1]));
    }
  }
  return [...found];
}

async function prsForCommit(sha) {
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!repo || !token) return [];
  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/commits/${sha}/pulls`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          Authorization: `Bearer ${token}`,
          "User-Agent": "tapo-c260-release-notes",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data.map((p) => p.number).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function linkifyPrRefs(text, repo) {
  if (!repo) return text;
  return text.replace(/(^|[^[\w/])#(\d+)\b/g, (full, prefix, num) => {
    return `${prefix}[#${num}](https://github.com/${repo}/pull/${num})`;
  });
}

function withPrLinks(text, prNumbers, repo) {
  let out = linkifyPrRefs(text, repo);
  if (!prNumbers.length) return out;
  const existing = new Set(extractPrNumbers(text));
  const missing = prNumbers.filter((n) => !existing.has(n));
  if (!missing.length) return out;
  const links = missing
    .map((n) =>
      repo
        ? `[#${n}](https://github.com/${repo}/pull/${n})`
        : `#${n}`,
    )
    .join(", ");
  return `${out} (${links})`;
}

function render(version, buckets) {
  const lines = [`# Release ${version}`, ""];
  for (const cat of CATEGORIES) {
    const items = buckets[cat];
    if (!items.length) continue;
    lines.push(`## ${cat}`, "");
    for (const item of items) lines.push(`- ${item}`);
    lines.push("");
  }
  if (lines.length === 2) {
    lines.push("## Other", "", "- No categorized changes since previous version.", "");
  }
  return lines.join("\n").trimEnd() + "\n";
}

function dedupePush(list, item) {
  const key = item.toLowerCase();
  if (list.some((x) => x.toLowerCase() === key)) return;
  list.push(item);
}

async function main() {
  const repo = process.env.GITHUB_REPOSITORY || "";
  const headSubject = git(["log", "-1", "--format=%s"]);
  const headBody = git(["log", "-1", "--format=%b"]);

  // Prefer an already-authored release body on the bump commit.
  if (/^#\s+Release\s+/i.test(headBody.trim()) || /^#\s+Release\s+/i.test(headSubject.trim())) {
    const body = /^#\s+Release\s+/i.test(headBody.trim())
      ? headBody.trim() + "\n"
      : `${headSubject.trim()}\n\n${headBody.trim()}\n`.trimStart();
    if (outPath) writeFileSync(outPath, body);
    process.stdout.write(body);
    return;
  }

  const range =
    previousTag && tagExists(previousTag) ? `${previousTag}..HEAD` : "HEAD";
  const raw = git([
    "log",
    range,
    "--reverse",
    "--format=%H%x1f%s%x1f%b%x1e",
  ]);

  const buckets = Object.fromEntries(CATEGORIES.map((c) => [c, []]));
  const records = raw
    ? raw
        .split("\x1e")
        .map((chunk) => chunk.replace(/^\n/, "").trimEnd())
        .filter(Boolean)
    : [];

  for (const record of records) {
    const [sha, subject = "", body = ""] = record.split("\x1f");
    if (!sha) continue;

    // Skip pure version-bump commits with no categorized body.
    if (/^(chore\(release\)|bump version|release\b)/i.test(subject) && !body.includes("## ")) {
      continue;
    }

    const sections = parseSections(body);
    const hasStructured = CATEGORIES.some((c) => sections[c].length > 0);
    let prs = extractPrNumbers(subject, body);
    const apiPrs = await prsForCommit(sha);
    for (const n of apiPrs) if (!prs.includes(n)) prs.push(n);

    if (hasStructured) {
      for (const cat of CATEGORIES) {
        for (const item of sections[cat]) {
          dedupePush(buckets[cat], withPrLinks(item, prs, repo));
        }
      }
    } else {
      const cat = guessCategory(subject);
      const text = subject.replace(/\s*\(#\d+\)\s*$/, "").trim() || subject;
      dedupePush(buckets[cat], withPrLinks(text, prs, repo));
    }
  }

  const markdown = render(version, buckets);
  if (outPath) writeFileSync(outPath, markdown);
  process.stdout.write(markdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
