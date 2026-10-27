#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"

upstream_key="${AI_AUDIT_UPSTREAM_OPENAI_KEY:-${OPENAI_API_KEY:-}}"
if [[ -z "$upstream_key" && -f .env ]]; then
  upstream_key="$(node --input-type=module -e 'import { readFileSync } from "node:fs"; const line = readFileSync(".env", "utf8").split(/\r?\n/).find((row) => /^OPENAI_API_KEY=/.test(row)); if (line) { const value = line.slice("OPENAI_API_KEY=".length).trim(); process.stdout.write(/^(["\x27]).*\1$/.test(value) ? value.slice(1, -1) : value); }')"
fi
if [[ -z "$upstream_key" ]]; then
  if [[ ! -t 0 ]]; then
    printf 'Set AI_AUDIT_UPSTREAM_OPENAI_KEY or run from a terminal\n' >&2
    exit 2
  fi
  read -r -s -p 'OpenAI API key: ' upstream_key
  printf '\n'
fi
if [[ -z "$upstream_key" ]]; then
  printf 'OpenAI API key is required\n' >&2
  exit 2
fi

umask 077
AI_AUDIT_UPSTREAM_OPENAI_KEY="$upstream_key" node examples/workflow/real.mjs
