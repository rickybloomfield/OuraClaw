#!/usr/bin/env bash
set -e

source "$(dirname "$0")/node-check.sh" || exit 1

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

FAILURES=0

echo "========================================="
echo "Running Code Quality Checks"
echo "========================================="
echo ""

echo -e "${YELLOW}[1/6] Running TypeScript type check...${NC}"
if npm run typecheck; then
  echo -e "${GREEN}✓ Type check passed${NC}"
else
  echo -e "${RED}✗ Type check failed${NC}"
  FAILURES=$((FAILURES + 1))
fi
echo ""

echo -e "${YELLOW}[2/6] Running ESLint...${NC}"
if npm run lint; then
  echo -e "${GREEN}✓ Lint check passed${NC}"
else
  echo -e "${RED}✗ Lint check failed${NC}"
  FAILURES=$((FAILURES + 1))
fi
echo ""

echo -e "${YELLOW}[3/6] Running Prettier format check...${NC}"
if npm run format:check; then
  echo -e "${GREEN}✓ Format check passed${NC}"
else
  echo -e "${RED}✗ Format check failed${NC}"
  echo -e "${YELLOW}  Run 'npm run format' to fix formatting${NC}"
  FAILURES=$((FAILURES + 1))
fi
echo ""

echo -e "${YELLOW}[4/6] Validating repository skills...${NC}"
if python3 -B "$(dirname "$0")/scripts/test_repo_skills.py"; then
  echo -e "${GREEN}✓ Skill validation passed${NC}"
else
  echo -e "${RED}✗ Skill validation failed${NC}"
  FAILURES=$((FAILURES + 1))
fi
echo ""

echo -e "${YELLOW}[5/6] Running tests...${NC}"
if npm test; then
  echo -e "${GREEN}✓ Tests passed${NC}"
else
  echo -e "${RED}✗ Tests failed${NC}"
  FAILURES=$((FAILURES + 1))
fi
echo ""

echo -e "${YELLOW}[6/6] Running coverage check...${NC}"
if npm run test:coverage; then
  echo -e "${GREEN}✓ Coverage check passed${NC}"
else
  echo -e "${RED}✗ Coverage check failed${NC}"
  FAILURES=$((FAILURES + 1))
fi
echo ""

echo "========================================="
if [ $FAILURES -eq 0 ]; then
  echo -e "${GREEN}All checks passed! ✓${NC}"
  exit 0
else
  echo -e "${RED}$FAILURES check(s) failed ✗${NC}"
  exit 1
fi
