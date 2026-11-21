#!/usr/bin/env bash
# Verifies the local AI/dev tooling for Clerk, Convex, Vercel, Mux and UI SDK.
# Usage: scripts/check-dev-tooling.sh [--online]
#   --online  also probe the MCP servers and the Clerk, Convex and Vercel setup over the network

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

failures=0
pass() { printf '  \033[32mok\033[0m   %s\n' "$1"; }
fail() { printf '  \033[31mFAIL\033[0m %s\n' "$1"; failures=$((failures + 1)); }
check() { local name="$1"; shift; if "$@" >/dev/null 2>&1; then pass "$name"; else fail "$name"; fi; }

echo "CLIs"
check "node >= 20" node -e 'process.exit(+process.versions.node.split(".")[0] >= 20 ? 0 : 1)'
check "clerk CLI" clerk --version
check "vercel CLI" vercel --version
check "mux CLI" mux --version
check "convex CLI (npx)" npx -y convex@latest --version

echo "MCP config (.cursor/mcp.json)"
for server in clerk convex vercel mux; do
  check "server '$server' configured" node -e "
    const c = require('./.cursor/mcp.json');
    process.exit(c.mcpServers && c.mcpServers['$server'] ? 0 : 1);"
done

echo "Skills (.agents/skills vs skills-lock.json)"
check "every locked skill is installed" node -e "
  const fs = require('fs');
  const lock = require('./skills-lock.json');
  const missing = Object.keys(lock.skills).filter(s => !fs.existsSync('.agents/skills/' + s + '/SKILL.md'));
  if (missing.length) { console.error(missing.join(', ')); process.exit(1); }"
for prefix in clerk convex; do
  check "$prefix skills present" test -f ".agents/skills/$prefix/SKILL.md"
done
check "vercel skills present" test -f ".agents/skills/deploy-to-vercel/SKILL.md" -a -f ".agents/skills/vercel-cli/SKILL.md"
check "mux skill present" test -f ".agents/skills/mux-video/SKILL.md"
check "ui-sdk skill present" test -f ".agents/skills/ui-sdk/SKILL.md"
check "modern-web-guidance skill present" test -f ".agents/skills/modern-web-guidance/SKILL.md"
check "eve skill present" test -f ".agents/skills/eve/SKILL.md"

echo "Environment (.env.local has every key in .env.example)"
check ".env.local complete" node -e "
  const fs = require('fs');
  const keys = (file) => fs.readFileSync(file, 'utf8').split('\n')
    .map(l => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean);
  const local = Object.fromEntries(keys('.env.local').map(m => [m[1], m[2].trim()]));
  const missing = keys('.env.example').map(m => m[1]).filter(k => !local[k]);
  if (missing.length) { console.error(missing.join(', ')); process.exit(1); }"
check "directory linked to the Vercel project (vercel link)" node -e "
  process.exit(require('./.vercel/project.json').projectName === 'llm-platform' ? 0 : 1);"

if [[ "${1:-}" == "--online" ]]; then
  echo "MCP servers (network)"
  init='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"check","version":"0"}}}'
  probe() {
    local code
    code=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
      -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
      -d "$init" "$1")
    [[ "$code" == "200" || "$code" == "401" ]]
  }
  check "clerk MCP reachable" probe https://mcp.clerk.com/mcp
  check "vercel MCP reachable" probe https://mcp.vercel.com
  check "mux MCP reachable" probe https://mcp.mux.com
  check "convex MCP starts and lists tools" bash -c "
    (printf '%s\n' '$init' '{\"jsonrpc\":\"2.0\",\"method\":\"notifications/initialized\"}' \
       '{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/list\"}'; sleep 6) \
      | npx -y convex@latest mcp start --project-dir '$ROOT' 2>/dev/null | grep -q '\"status\"'"

  echo "Clerk <-> Convex (network)"
  check "convex/auth.config.ts reads CLERK_FRONTEND_API_URL" grep -q 'CLERK_FRONTEND_API_URL' convex/auth.config.ts
  fapi=$(npx convex env get CLERK_FRONTEND_API_URL 2>/dev/null)
  check "CLERK_FRONTEND_API_URL set on the Convex deployment" test -n "$fapi"
  check "Convex and .env.local point at the same Clerk instance" node -e "
    const fs = require('fs');
    const pk = fs.readFileSync('.env.local', 'utf8').match(/^NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_\w+?_(.+)$/m)[1];
    const host = Buffer.from(pk, 'base64').toString().replace(/\\\$$/, '');
    process.exit('https://' + host === '$fapi' ? 0 : 1);"
  check "Clerk issuer matches CLERK_FRONTEND_API_URL" bash -c "
    curl -sf '$fapi/.well-known/openid-configuration' | grep -q '\"issuer\":\"$fapi\"'"

  echo "Mux (network)"
  check "mux CLI signed in to the LMS-Platform development environment" bash -c "
    mux whoami --json 2>/dev/null | node -e \"
      const me = JSON.parse(require('fs').readFileSync(0, 'utf8'));
      process.exit(me.environment_name === 'LMS-Platform' && me.environment_type === 'development' ? 0 : 1);\""
  check "Mux token on the Convex deployment works for LMS-Platform (development)" bash -c "
    id=\$(npx convex env get MUX_TOKEN_ID 2>/dev/null); secret=\$(npx convex env get MUX_TOKEN_SECRET 2>/dev/null)
    [ -n \"\$id\" ] && [ -n \"\$secret\" ] || exit 1
    curl -sf -u \"\$id:\$secret\" https://api.mux.com/system/v1/whoami | node -e \"
      const me = JSON.parse(require('fs').readFileSync(0, 'utf8')).data;
      process.exit(me.environment_name === 'LMS-Platform' && me.environment_type === 'development' ? 0 : 1);\""

  echo "Vercel project (network)"
  # CONVEX_DEPLOYMENT only drives the local Convex CLI, so Vercel does not need it.
  check "Vercel Preview and Development have every app key from .env.example" bash -c "
    vercel env ls --format json 2>/dev/null | node -e \"
      const fs = require('fs');
      const envs = JSON.parse(fs.readFileSync(0, 'utf8')).envs;
      const wanted = fs.readFileSync('.env.example', 'utf8').split('\n')
        .map(l => l.match(/^([A-Z0-9_]+)=/)).filter(Boolean).map(m => m[1])
        .filter(k => k !== 'CONVEX_DEPLOYMENT');
      const missing = [];
      for (const target of ['preview', 'development'])
        for (const key of wanted)
          if (!envs.some(e => e.key === key && e.target.includes(target))) missing.push(key + ' [' + target + ']');
      if (missing.length) { console.error(missing.join(', ')); process.exit(1); }\""
fi

echo
if (( failures )); then echo "$failures check(s) failed"; exit 1; fi
echo "All checks passed"
