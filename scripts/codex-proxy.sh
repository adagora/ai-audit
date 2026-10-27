#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"

proxy_port="${AI_AUDIT_PORT:-8788}"
codex_model="${AI_AUDIT_CODEX_MODEL:-gpt-6-sol}"
upstream_url="${AI_AUDIT_UPSTREAM_OPENAI_URL:-https://api.openai.com}"

if [[ ! "$proxy_port" =~ ^[0-9]+$ ]] || (( proxy_port < 1 || proxy_port > 65535 )); then
  printf 'AI_AUDIT_PORT must be a number from 1 to 65535\n' >&2
  exit 2
fi

for executable in node npm codex curl; do
  if ! command -v "$executable" >/dev/null 2>&1; then
    printf '%s is required\n' "$executable" >&2
    exit 2
  fi
done

if curl -sS --max-time 1 -o /dev/null "http://127.0.0.1:$proxy_port/" 2>/dev/null; then
  printf 'Port %s is already in use; set AI_AUDIT_PORT to another port\n' "$proxy_port" >&2
  exit 2
fi

if [[ ! -d node_modules ]]; then
  npm ci
fi
npm run build

keygen_output="$(node dist/src/cli.js keygen --name codex)"
client_key="$(printf '%s\n' "$keygen_output" | sed -n 's/^key (give to the client, not stored): //p')"
if [[ ! "$client_key" =~ ^aia-[A-Za-z0-9_-]+$ ]]; then
  printf 'Could not generate a client key\n' >&2
  exit 2
fi

upstream_key="${AI_AUDIT_UPSTREAM_OPENAI_KEY:-}"
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

if [[ -L live ]]; then
  printf 'live must be a directory, not a symlink\n' >&2
  exit 2
fi
mkdir -p live
chmod 700 live
umask 077

AI_AUDIT_CLIENT_KEY="$client_key" AI_AUDIT_UPSTREAM_OPENAI_KEY="$upstream_key" \
  node dist/src/cli.js serve --mode redact --host 127.0.0.1 --port "$proxy_port" \
  --log live/audit.jsonl --upstream-openai "$upstream_url" \
  >live/proxy.stdout.log 2>live/proxy.stderr.log &
proxy_pid=$!

cleanup() {
  kill "$proxy_pid" 2>/dev/null || true
  wait "$proxy_pid" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

ready=0
for _ in {1..40}; do
  if ! kill -0 "$proxy_pid" 2>/dev/null; then
    printf 'Proxy stopped during startup; see live/proxy.stderr.log\n' >&2
    exit 1
  fi
  if [[ "$(curl -fsS --max-time 1 "http://127.0.0.1:$proxy_port/healthz" 2>/dev/null || true)" == ok ]]; then
    ready=1
    break
  fi
  sleep 0.25
done
if (( ready == 0 )); then
  printf 'Proxy did not become ready; see live/proxy.stderr.log\n' >&2
  exit 1
fi

printf 'ai-audit proxy ready at http://127.0.0.1:%s/v1\n' "$proxy_port"
printf 'Audit log: %s/live/audit.jsonl\n' "$repo_dir"

(
  unset AI_AUDIT_UPSTREAM_OPENAI_KEY AI_AUDIT_CLIENT_KEY
  export AI_AUDIT_CODEX_KEY="$client_key"
  codex -m "$codex_model" \
    -c 'model_provider="ai_audit"' \
    -c 'model_providers.ai_audit.name="ai-audit"' \
    -c "model_providers.ai_audit.base_url=\"http://127.0.0.1:$proxy_port/v1\"" \
    -c 'model_providers.ai_audit.env_key="AI_AUDIT_CODEX_KEY"' \
    -c 'model_providers.ai_audit.wire_api="responses"' \
    -c 'model_providers.ai_audit.requires_openai_auth=false' \
    -c 'model_providers.ai_audit.supports_websockets=false' \
    "$@"
)
