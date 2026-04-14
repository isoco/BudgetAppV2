#!/bin/bash
set -e

# ─── Environment ─────────────────────────────────────────────────────────────
export ANDROID_HOME="$HOME/android-sdk"
export JAVA_HOME="/usr/lib/jvm/java-17-openjdk-amd64"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$JAVA_HOME/bin:$PATH"

# ─── Paths ────────────────────────────────────────────────────────────────────
WIN_SRC="/mnt/d/Projekti/BudgetAppV2"
WSL_DST="$HOME/BudgetAppV2"
OUTPUT_DIR="/mnt/c/Users/Ivan/OneDrive/Aplikacija test"
VERSION_FILE="$OUTPUT_DIR/.version"

# ─── Version ──────────────────────────────────────────────────────────────────
mkdir -p "$OUTPUT_DIR"

if [[ -f "$VERSION_FILE" ]]; then
  VERSION=$(cat "$VERSION_FILE")
  MAJOR="${VERSION%%.*}"
  MINOR="${VERSION##*.}"
  MINOR=$((MINOR + 1))
else
  MAJOR=1
  MINOR=0
fi
NEW_VERSION="$MAJOR.$MINOR"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║  BudgetApp Build  v$NEW_VERSION"
echo "╚══════════════════════════════════════╝"
echo ""

# ─── 1. Sync ──────────────────────────────────────────────────────────────────
echo "▶ Syncing files to WSL2..."
rsync -a --delete \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='*.apk' \
  "$WIN_SRC/" "$WSL_DST/"

# ─── 2. Install deps ──────────────────────────────────────────────────────────
echo "▶ Installing dependencies..."
cd "$WSL_DST"
pnpm install --frozen-lockfile --silent

# ─── 3. Build ─────────────────────────────────────────────────────────────────
echo "▶ Building APK (this may take a few minutes)..."
BUILD_START=$(date +%s)
cd "$WSL_DST/apps/mobile"
eas build -p android --profile preview --local
BUILD_END=$(date +%s)

# ─── 4. Locate APK ────────────────────────────────────────────────────────────
APK=$(find "$WSL_DST/apps/mobile" -maxdepth 2 -name "*.apk" | tail -1)

if [[ -z "$APK" ]]; then
  echo "✗ No APK found after build!"
  exit 1
fi

# ─── 5. Copy to OneDrive ──────────────────────────────────────────────────────
DEST="$OUTPUT_DIR/BudgetApp_V$NEW_VERSION.apk"
echo "▶ Copying to: $DEST"
cp "$APK" "$DEST"

# ─── 6. Save version ──────────────────────────────────────────────────────────
echo "$NEW_VERSION" > "$VERSION_FILE"

# ─── Done ─────────────────────────────────────────────────────────────────────
ELAPSED=$(( $(date +%s) - BUILD_START ))
echo ""
echo "✔ Done in ${ELAPSED}s"
echo "  APK: BudgetApp_V$NEW_VERSION.apk"
echo "  Dir: $OUTPUT_DIR"
echo ""
