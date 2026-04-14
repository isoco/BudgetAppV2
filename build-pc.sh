#!/bin/bash
set -e

# ─── Environment ─────────────────────────────────────────────────────────────
export ANDROID_HOME="$HOME/android-sdk"

# Detect JAVA_HOME — ~/.jdk17 first (no-sudo install), then system paths
for candidate in \
  "$HOME/.jdk17" \
  /usr/lib/jvm/java-17-openjdk-amd64 \
  /usr/lib/jvm/java-17-openjdk \
  /usr/lib/jvm/java-17 \
  /usr/lib/jvm/temurin-17; do
  if [[ -d "$candidate" ]]; then
    export JAVA_HOME="$candidate"
    break
  fi
done

# Last resort: derive from java binary on PATH
if [[ -z "$JAVA_HOME" ]] || [[ ! -d "$JAVA_HOME" ]]; then
  _java=$(command -v java 2>/dev/null)
  [[ -n "$_java" ]] && export JAVA_HOME="$(dirname "$(dirname "$(readlink -f "$_java")")")"
fi

if [[ -z "$JAVA_HOME" ]] || [[ ! -d "$JAVA_HOME" ]]; then
  echo "✗ Java 17 not found. Run:"
  echo "  cd ~ && curl -L https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.11%2B9/OpenJDK17U-jdk_x64_linux_hotspot_17.0.11_9.tar.gz -o jdk17.tar.gz && tar -xzf jdk17.tar.gz && mv jdk-17.0.11+9 ~/.jdk17 && rm jdk17.tar.gz"
  exit 1
fi

echo "▶ Using JAVA_HOME=$JAVA_HOME"
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

# ─── 2b. Patch gradlew with correct JAVA_HOME (EAS isolates its subprocess env)
GRADLEW="$WSL_DST/apps/mobile/android/gradlew"
sed -i '/^export JAVA_HOME=.*jdk/d' "$GRADLEW"
sed -i "1a export JAVA_HOME=\"$JAVA_HOME\"" "$GRADLEW"
echo "▶ Patched gradlew with JAVA_HOME=$JAVA_HOME"

# Also write to eas.json env so EAS passes it through
EAS_JSON="$WSL_DST/apps/mobile/eas.json"
node -e "
  const fs = require('fs');
  const cfg = JSON.parse(fs.readFileSync('$EAS_JSON','utf8'));
  cfg.build.preview.env = { ...cfg.build.preview.env, JAVA_HOME: '$JAVA_HOME' };
  fs.writeFileSync('$EAS_JSON', JSON.stringify(cfg, null, 2));
"
echo "▶ Injected JAVA_HOME into eas.json preview env"

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
