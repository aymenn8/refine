#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

# Read current version
CURRENT=$(grep '"version"' package.json | head -1 | sed 's/.*: "\(.*\)".*/\1/')

if [ -n "$1" ]; then
  # Use provided version
  VERSION="${1#v}"
else
  # Auto-increment patch
  IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"
  VERSION="${MAJOR}.${MINOR}.$((PATCH + 1))"
fi

TAG="v${VERSION}"

echo ""
echo -e "${BOLD}${CURRENT} → ${VERSION}${NC}"

# Check RELEASE_NOTES.md exists and has content
if [ ! -f RELEASE_NOTES.md ] || ! grep -q '[a-zA-Z]' RELEASE_NOTES.md 2>/dev/null; then
  echo -e "${RED}Error: RELEASE_NOTES.md is missing or empty. Write your patch notes first.${NC}"
  exit 1
fi

echo ""
echo -e "${YELLOW}🚀 Releasing Refine ${TAG}${NC}"
echo ""

# 1. Check we're on main and clean
BRANCH=$(git branch --show-current)
if [ "$BRANCH" != "main" ]; then
  echo -e "${RED}Error: Not on main branch (currently on ${BRANCH})${NC}"
  exit 1
fi

if [ -n "$(git status --porcelain -- ':!RELEASE_NOTES.md')" ]; then
  echo -e "${RED}Error: Working directory not clean. Commit or stash changes first.${NC}"
  exit 1
fi

# 2. Update versions
echo -e "${GREEN}[1/5]${NC} Updating version to ${VERSION}..."
sed -i '' "s/^version = \".*\"/version = \"${VERSION}\"/" src-tauri/Cargo.toml
sed -i '' "s/\"version\": \".*\"/\"version\": \"${VERSION}\"/" package.json
sed -i '' "s/\"version\": \".*\"/\"version\": \"${VERSION}\"/" src-tauri/tauri.conf.json

# 3. Update Cargo.lock
echo -e "${GREEN}[2/5]${NC} Updating Cargo.lock..."
cd src-tauri && cargo update -p refine --quiet 2>/dev/null || true && cd ..

# 4. Commit
echo -e "${GREEN}[3/5]${NC} Committing version bump..."
git add src-tauri/Cargo.toml src-tauri/Cargo.lock package.json src-tauri/tauri.conf.json RELEASE_NOTES.md
git commit -m "Release ${TAG}"

# 5. Tag
echo -e "${GREEN}[4/5]${NC} Creating tag ${TAG}..."
git tag "${TAG}"

# 6. Push
echo -e "${GREEN}[5/5]${NC} Pushing to origin..."
git push origin main
git push origin "${TAG}"

# 7. Clear release notes for next time
echo "" > RELEASE_NOTES.md
git add RELEASE_NOTES.md
git commit -m "Clear release notes"
git push origin main

echo ""
echo -e "${GREEN}✅ Done! ${TAG} pushed.${NC}"
echo ""
echo "GitHub Actions will now build and publish the release."
echo "Watch progress: https://github.com/aymenn8/refine-app/actions"
echo "Release will appear on: https://github.com/aymenn8/refine-releases/releases"
