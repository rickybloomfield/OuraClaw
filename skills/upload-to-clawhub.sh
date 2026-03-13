#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: skills/upload-to-clawhub.sh [--publish]

Publish the local oura OpenClaw skill to ClawHub.

Default behavior is preview-only (no publish).
Use --publish to execute the real clawhub publish command.
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

PUBLISH=false
if [[ $# -gt 1 ]]; then
  usage
  exit 1
fi

if [[ $# -eq 1 ]]; then
  case "$1" in
    --publish|-p)
      PUBLISH=true
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
fi

if [[ ! -x "${REPO_ROOT}/node-check.sh" ]]; then
  echo "Missing helper script: ${REPO_ROOT}/node-check.sh" >&2
  exit 1
fi

# Ensure Node is available for reading package.json version.
source "${REPO_ROOT}/node-check.sh"

if ! command -v clawhub >/dev/null 2>&1; then
  echo "clawhub CLI not found in PATH. Install it first (npm i -g clawhub)." >&2
  exit 1
fi

SKILL_PATH="${REPO_ROOT}/skills/oura"
if [[ ! -f "${SKILL_PATH}/SKILL.md" ]]; then
  echo "Skill file not found: ${SKILL_PATH}/SKILL.md" >&2
  exit 1
fi

VERSION="$(cd "${REPO_ROOT}" && node -p "require('./package.json').version")"
SLUG="oura"
NAME="Oura Ring Automation"
TAGS="latest"
CHANGELOG_TEXT="Sync from ouraclaw-cli v${VERSION}"

CMD=(
  clawhub publish "${SKILL_PATH}"
  --slug "${SLUG}"
  --name "${NAME}"
  --version "${VERSION}"
  --changelog "${CHANGELOG_TEXT}"
  --tags "${TAGS}"
)

echo "ClawHub upload target"
echo "  Skill path: ${SKILL_PATH}"
echo "  Slug:       ${SLUG}"
echo "  Name:       ${NAME}"
echo "  Version:    ${VERSION}"
echo "  Tags:       ${TAGS}"
echo "  Changelog:  ${CHANGELOG_TEXT}"
echo

if ! ${PUBLISH}; then
  echo "Preview auth check: clawhub whoami"
  if ! WHOAMI_OUTPUT="$(clawhub whoami 2>&1)"; then
    echo "Auth check failed. Run 'clawhub login' and retry." >&2
    echo "${WHOAMI_OUTPUT}" >&2
    exit 1
  fi
  echo "Authenticated as: ${WHOAMI_OUTPUT}"
  echo

  echo "Preview mode (default): not publishing."
  echo "Command:"
  printf '  %q' "${CMD[@]}"
  echo
  echo
  echo "Run with --publish to publish for real."
  exit 0
fi

echo "Publishing to ClawHub..."
"${CMD[@]}"
echo "Publish complete."
