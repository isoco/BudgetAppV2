#!/bin/bash
set -e

# ─── Environment ─────────────────────────────────────────────────────────────

# Detect ANDROID_HOME — try common SDK locations
for sdk_candidate in \
  "$HOME/Android/Sdk" \
  "$HOME/android-sdk" \
  "$HOME/.android/sdk" \
  /opt/android-sdk \
  /usr/local/lib/android/sdk; do
  if [[ -d "$sdk_candidate/platform-tools" ]]; then
    export ANDROID_HOME="$sdk_candidate"
    break
  fi
done

if [[ -z "$ANDROID_HOME" ]] || [[ ! -d "$ANDROID_HOME/platform-tools" ]]; then
  echo "✗ Android SDK not found. Expected at ~/Android/Sdk or ~/android-sdk."
  echo "  Install cmdline-tools, or set ANDROID_HOME before running this script."
  exit 1
fi
export ANDROID_SDK_ROOT="$ANDROID_HOME"

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
VERSION_CODE=$MINOR

echo ""
echo "╔══════════════════════════════════════╗"
echo "║  BudgetApp Build  v$NEW_VERSION  (code $VERSION_CODE)"
echo "╚══════════════════════════════════════╝"
echo ""

# ─── 1. Sync ──────────────────────────────────────────────────────────────────
echo "▶ Syncing files from $WIN_SRC..."
rsync -a --checksum --delete \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='*.apk' \
  "$WIN_SRC/" "$WSL_DST/"

# ─── 1b. Verify sync ─────────────────────────────────────────────────────────
echo "▶ Verifying key files synced correctly..."
_fail=0
check() {
  local file="$WSL_DST/apps/mobile/$1" pattern="$2" label="$3"
  if grep -q "$pattern" "$file" 2>/dev/null; then
    echo "  ✔ $label"
  else
    echo "  ✗ $label — MISSING in $1! Sync failed."
    _fail=1
  fi
}

check "src/store/privacyStore.ts"              "useIncomeHidden"              "privacyStore — global privacy store"
check "app/(tabs)/index.tsx"                   "privacyInitialized"           "index.tsx — privacy persistence fix"
check "app/(tabs)/transactions.tsx"            "sortField"                    "transactions.tsx — sort by date/amount"
check "src/db/queries.ts"                      "savingsTarget"                "queries.ts — savings in projected expense"
check "app/(tabs)/savings.tsx"                 "pastTotal"                    "savings.tsx — past-only total"
check "app/(tabs)/budget.tsx"                  "viewMonth"                    "budget.tsx — month navigation"
check "src/components/BudgetCard.tsx"          "onDeleteExpense"              "BudgetCard.tsx — delete expense prop"
check "src/components/SpendingChart.tsx"       "import React from"            "SpendingChart.tsx — React imported before use"
check "app/(tabs)/index.tsx"                   "getTransactions"              "index.tsx — getTransactions imported"
check "app/daily-tracker.tsx"                  "getDailySpendTotalsByDay"     "daily-tracker.tsx — daily_spends calendar fix"
check "src/db/queries.ts"                      "getDailySpendTotalsByDay"     "queries.ts — getDailySpendTotalsByDay added"
check "src/widget/widgetTaskHandler.ts"        "widgetTaskHandler"            "widgetTaskHandler.ts — widget task handler"
check "src/widget/DailyLogWidget.tsx"          "DailyLogWidget"               "DailyLogWidget.tsx — widget UI component"
check "app/_layout.tsx"                        "widgetTaskHandler"            "_layout.tsx — widget registered"
check "credentials.json"                       "keystorePath"                 "credentials.json — consistent signing key"

[[ $_fail -eq 1 ]] && exit 1

# ─── 2. Patch versionCode + versionName in build.gradle ──────────────────────
# Android requires versionCode to increase with every install — without this
# the device refuses to update the installed APK.
GRADLE_FILE="$WSL_DST/apps/mobile/android/app/build.gradle"
sed -i "s/VERSION_CODE\.toInteger()/$VERSION_CODE/" "$GRADLE_FILE" 2>/dev/null || true
sed -i "s/VERSION_CODE/$VERSION_CODE/g" "$GRADLE_FILE"
sed -i "s/VERSION_NAME/\"$NEW_VERSION\"/" "$GRADLE_FILE" 2>/dev/null || true
sed -i "s/VERSION_NAME/$NEW_VERSION/g" "$GRADLE_FILE"
echo "▶ Set versionCode=$VERSION_CODE versionName=$NEW_VERSION in build.gradle"

# ─── 3. Patch gradlew — inject JAVA_HOME + sdk.dir at runtime inside EAS temp dir
# (deps installed AFTER cache wipe below)
GRADLEW="$WSL_DST/apps/mobile/android/gradlew"
# Remove previous patch lines
sed -i '/^export JAVA_HOME=.*jdk/d' "$GRADLEW"
sed -i '/^echo "sdk.dir=/d' "$GRADLEW"
sed -i '/^export CMAKE_BUILD_PARALLEL_LEVEL=/d' "$GRADLEW"
# Inject after shebang:
#  - JAVA_HOME so Gradle finds the JDK
#  - sdk.dir so Android Gradle Plugin finds the SDK
#  - CMAKE_BUILD_PARALLEL_LEVEL=1 prevents multiple Clang processes exhausting RAM
sed -i "1a export JAVA_HOME=\"$JAVA_HOME\"\nexport CMAKE_BUILD_PARALLEL_LEVEL=1\necho \"sdk.dir=$ANDROID_HOME\" > \"\$(dirname \"\$0\")/local.properties\"" "$GRADLEW"
echo "▶ Patched gradlew with JAVA_HOME=$JAVA_HOME + sdk.dir=$ANDROID_HOME + CMAKE_BUILD_PARALLEL_LEVEL=1"

# Also write to eas.json env so EAS passes it through
EAS_JSON="$WSL_DST/apps/mobile/eas.json"
node -e "
  const fs = require('fs');
  const cfg = JSON.parse(fs.readFileSync('$EAS_JSON','utf8'));
  cfg.build.preview.env = {
    ...cfg.build.preview.env,
    JAVA_HOME: '$JAVA_HOME',
    ANDROID_HOME: '$ANDROID_HOME',
    ANDROID_SDK_ROOT: '$ANDROID_HOME'
  };
  fs.writeFileSync('$EAS_JSON', JSON.stringify(cfg, null, 2));
"
echo "▶ Injected JAVA_HOME + ANDROID_HOME into eas.json preview env"

# ─── 3c. Ensure enough virtual memory for native C++ compilation ──────────────
SWAP_FILE="$HOME/build-swap"
if ! swapon --show 2>/dev/null | grep -q "$SWAP_FILE"; then
  echo "▶ Creating 4 GB swap file (needed for C++ compilation)..."
  if [[ ! -f "$SWAP_FILE" ]]; then
    dd if=/dev/zero of="$SWAP_FILE" bs=1M count=4096 status=none
    chmod 600 "$SWAP_FILE"
    mkswap "$SWAP_FILE"
  fi
  if sudo -n swapon "$SWAP_FILE" 2>/dev/null; then
    echo "  ✔ Swap enabled: 4 GB at $SWAP_FILE"
  else
    echo "  ⚠ Could not enable swap (no sudo). Build may OOM on large files."
    echo "    Run once: sudo swapon $SWAP_FILE"
  fi
else
  echo "  ✔ Swap already active"
fi

# ─── 4. Kill stale Gradle daemons ────────────────────────────────────────────
echo "▶ Stopping Gradle daemons..."
"$WSL_DST/apps/mobile/android/gradlew" -p "$WSL_DST/apps/mobile/android" --stop 2>/dev/null || true
pkill -f "GradleDaemon" 2>/dev/null || true
pkill -f "gradle" 2>/dev/null || true

# ─── 5. Nuclear cache wipe — zero memory of previous builds ──────────────────
echo "▶ Wiping ALL caches and build artifacts (zero-cache build)..."

_nuke() {
  local label="$1"; shift
  local found=0
  for p in "$@"; do
    for match in $p; do
      [[ -e "$match" ]] || continue
      rm -rf "$match"
      found=1
    done
  done
  [[ $found -eq 1 ]] && echo "  ✔ nuked: $label" || echo "  ○ already gone: $label"
}

# Metro / Expo JS caches
_nuke "Metro/Expo JS cache"        "$HOME/.expo/metro-cache" "$HOME/.expo/cache"
_nuke "mobile .expo/.metro"        "$WSL_DST/apps/mobile/.expo" "$WSL_DST/apps/mobile/.metro"

# /tmp ephemeral build dirs
while IFS= read -r p; do rm -rf "$p"; done < <(find /tmp -maxdepth 2 \( -name 'metro-*' -o -name 'haste-map-*' -o -name 'eas-build-*' -o -name 'react-native-*' \) 2>/dev/null)
echo "  ✔ nuked: /tmp metro/haste/eas/RN dirs"

# EAS local build cache
_nuke "~/.eas-build"               "$HOME/.eas-build"

# All Gradle caches and daemon state — full wipe
_nuke "Gradle caches (full)"       "$HOME/.gradle/caches"
_nuke "Gradle daemon logs"         "$HOME/.gradle/daemon"
_nuke "Gradle native"              "$HOME/.gradle/native"

# Android project build outputs and incremental state
_nuke "android/app/build"          "$WSL_DST/apps/mobile/android/app/build"
_nuke "android/build"              "$WSL_DST/apps/mobile/android/build"
_nuke "android/.gradle"            "$WSL_DST/apps/mobile/android/.gradle"

# node_modules — full reinstall guarantees no stale JS transforms
_nuke "root node_modules"          "$WSL_DST/node_modules"
_nuke "mobile node_modules"        "$WSL_DST/apps/mobile/node_modules"

echo "  ✔ Zero-cache wipe complete"

# ─── 5b. Fresh dep install (after wipe) ──────────────────────────────────────
echo "▶ Installing dependencies (fresh)..."
cd "$WSL_DST"
pnpm install --no-frozen-lockfile

# ─── 6. Stamp build version ──────────────────────────────────────────────────
BUILD_TIMESTAMP=$(date '+%Y-%m-%d %H:%M')
export EXPO_PUBLIC_BUILD_VERSION="$NEW_VERSION"
export EXPO_PUBLIC_BUILD_DATE="$BUILD_TIMESTAMP"
echo "▶ Exported env vars for Metro:"
echo "  EXPO_PUBLIC_BUILD_VERSION=$EXPO_PUBLIC_BUILD_VERSION"
echo "  EXPO_PUBLIC_BUILD_DATE=$EXPO_PUBLIC_BUILD_DATE"

# Also write into eas.json
EAS_JSON="$WSL_DST/apps/mobile/eas.json"
node -e "
  const fs = require('fs');
  const cfg = JSON.parse(fs.readFileSync('$EAS_JSON', 'utf8'));
  cfg.build.preview.env = {
    ...cfg.build.preview.env,
    EXPO_PUBLIC_BUILD_VERSION: '$NEW_VERSION',
    EXPO_PUBLIC_BUILD_DATE:    '$BUILD_TIMESTAMP',
  };
  fs.writeFileSync('$EAS_JSON', JSON.stringify(cfg, null, 2));
"
echo "  eas.json preview.env updated ✔"

# ─── 7. Gradle clean ──────────────────────────────────────────────────────────
echo "▶ Running gradlew clean..."
cd "$WSL_DST/apps/mobile/android"
./gradlew clean --no-daemon 2>&1 | tail -5
echo "  ✔ Gradle clean done"

# ─── 8. Build ─────────────────────────────────────────────────────────────────
echo "▶ Building APK (this may take a few minutes)..."
BUILD_START=$(date +%s)
cd "$WSL_DST/apps/mobile"
EXPO_NO_METRO_CACHE=1 METRO_RESET_CACHE=true eas build -p android --profile preview --local --clear-cache
BUILD_END=$(date +%s)

# ─── 9. Locate APK ────────────────────────────────────────────────────────────
APK=$(find "$WSL_DST/apps/mobile" -maxdepth 2 -name "*.apk" | tail -1)

if [[ -z "$APK" ]]; then
  echo "✗ No APK found after build!"
  exit 1
fi

APK_SIZE=$(du -sh "$APK" | cut -f1)
APK_MTIME=$(stat -c '%y' "$APK" | cut -d'.' -f1)
echo "▶ APK: $APK ($APK_SIZE, modified $APK_MTIME)"

# ─── 8b. Verify bundle contains expected version ──────────────────────────────
echo "▶ Verifying bundle contains expected version..."
VERIFY_DIR=$(mktemp -d)
unzip -q "$APK" "assets/index.android.bundle" -d "$VERIFY_DIR" 2>/dev/null || \
  unzip -q "$APK" "assets/*.bundle" -d "$VERIFY_DIR" 2>/dev/null || true

BUNDLE=$(find "$VERIFY_DIR" -name "*.bundle" | head -1)
if [[ -n "$BUNDLE" ]]; then
  BUNDLE_SIZE=$(du -sh "$BUNDLE" | cut -f1)
  if strings "$BUNDLE" 2>/dev/null | grep -q "$NEW_VERSION"; then
    echo "  ✔ Bundle ($BUNDLE_SIZE) contains version $NEW_VERSION — FRESH"
  else
    FOUND_VER=$(strings "$BUNDLE" 2>/dev/null | grep -o '[0-9]\+\.[0-9]\+' | head -5 | tr '\n' ' ' || true)
    echo "  ✗ Bundle ($BUNDLE_SIZE) does NOT contain '$NEW_VERSION'"
    echo "    Versions found in bundle: ${FOUND_VER:-none}"
    echo "    ⚠ Stale bundle suspected — cache clear may have failed"
  fi
else
  echo "  ⚠ Could not extract bundle from APK (install: sudo apt install unzip binutils)"
fi
rm -rf "$VERIFY_DIR"

# ─── 9. Copy to OneDrive ──────────────────────────────────────────────────────
DEST="$OUTPUT_DIR/BudgetApp_V$NEW_VERSION.apk"
echo "▶ Copying to: $DEST"
cp "$APK" "$DEST"

# ─── 10. Save version ─────────────────────────────────────────────────────────
echo "$NEW_VERSION" > "$VERSION_FILE"

# ─── Done ─────────────────────────────────────────────────────────────────────
ELAPSED=$(( $(date +%s) - BUILD_START ))
echo ""
echo "╔══════════════════════════════════════╗"
echo "║  Build complete in ${ELAPSED}s"
echo "║  APK:         BudgetApp_V$NEW_VERSION.apk"
echo "║  versionCode: $VERSION_CODE"
echo "║  Dir:         $OUTPUT_DIR"
echo "╚══════════════════════════════════════╝"
echo ""
