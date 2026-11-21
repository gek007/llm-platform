#!/usr/bin/env bash
# Gives a coding agent its own Convex cloud dev deployment (Convex "agent mode":
# https://docs.convex.dev/cli/agent-mode), so it never pushes to the owner's personal dev deployment.
#
# Run it from an agent's git worktree (not the main checkout):
#   scripts/agent-deployment.sh [--expiration "in 5 days"]
#
# It:
#   1. copies the non-Convex keys (Clerk, Mux) from the main checkout's .env.local,
#   2. creates and selects dev deployment `dev/agent-<worktree>` (expires, default in 5 days),
#   3. copies the deployment env vars (CLERK_FRONTEND_API_URL, MUX_*) from the owner's dev deployment,
#   4. saves a deploy key scoped to the new deployment as CONVEX_DEPLOY_KEY in .env.local,
#   5. pushes the functions once and seeds the sample courses.
# Values are piped through a mode-600 temp file and never printed. Re-running is a no-op once
# CONVEX_DEPLOY_KEY is set.
set -euo pipefail

TEAM_PROJECT="kostya-shilkrot:llm-platform"
EXPIRATION="in 5 days"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --expiration) EXPIRATION="$2"; shift 2 ;;
    -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

root="$(git rev-parse --show-toplevel)"
cd "$root"
git_dir="$(cd "$(git rev-parse --git-dir)" && pwd)"
common_dir="$(cd "$(git rev-parse --git-common-dir)" && pwd)"
if [[ "$git_dir" == "$common_dir" ]]; then
  echo "Refusing to run in the main checkout: it would repoint the owner's .env.local away from their" >&2
  echo "personal dev deployment. Run it inside an agent worktree (git worktree add …)." >&2
  exit 1
fi
main_root="$(dirname "$common_dir")"

if [[ -f .env.local ]] && grep -q '^CONVEX_DEPLOY_KEY=' .env.local; then
  echo "This worktree already has its own deployment (CONVEX_DEPLOY_KEY is set). Nothing to do."
  exit 0
fi
if [[ ! -f "$main_root/.env.local" ]]; then
  echo "Missing $main_root/.env.local; set up the main checkout first (see docs/ARCHITECTURE.md)." >&2
  exit 1
fi

# 1. Non-Convex keys from the main checkout (Convex keys are written by --select / --save-env below).
umask 077
grep -vE '^(CONVEX_|NEXT_PUBLIC_CONVEX_)' "$main_root/.env.local" > .env.local

if [[ ! -d node_modules ]]; then npm ci; fi

name="agent-$(basename "$root" | tr -c 'a-zA-Z0-9-\n' '-' | tr '[:upper:]' '[:lower:]')"

# 2. Own dev deployment, selected for this worktree (writes CONVEX_DEPLOYMENT / NEXT_PUBLIC_CONVEX_* to .env.local).
npx convex deployment create "$TEAM_PROJECT:dev/$name" --type dev --select --expiration "$EXPIRATION"

# 3. Deployment env vars from the owner's personal dev deployment, without printing them.
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
(cd "$main_root" && npx convex env list --include-values) > "$tmp"
if [[ -s "$tmp" ]]; then npx convex env set --from-file "$tmp" --force > /dev/null; fi
rm -f "$tmp"

# 4. Deploy key scoped to this deployment only.
npx convex deployment token create "$name" --save-env

# 5. Push once and seed.
npx convex dev --once
npx convex run seed:run > /dev/null

echo "Done: this worktree uses its own Convex deployment dev/$name (expires $EXPIRATION)."
echo "Env var names on it:"; npx convex env list --names-only
