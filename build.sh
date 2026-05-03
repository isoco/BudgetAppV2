#!/bin/bash
set -e

# ─── Environment ─────────────────────────────────────────────────────────────
export ANDROID_HOME="$HOME/Android/Sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"

# Detect JAVA_HOME — try SDKMAN first (no sudo), then common system paths
if [[ -z "$JAVA_HOME" ]] || [[ ! -d "$JAVA_HOME" ]]; then
  if [[ -f "$HOME/.sdkman/bin/sdkman-init.sh" ]]; then
    source "$HOME/.sdkman/bin/sdkman-init.sh"
    _sdkjava=$(sdk home java 2>/dev/null || true)
    [[ -d "$_sdkjava" ]] && export JAVA_HOME="$_sdkjava"
  fi
fi

if [[ -z "$JAVA_HOME" ]] || [[ ! -d "$JAVA_HOME" ]]; then
  for candidate in \
    "$HOME/.jdk17" \
    /usr/lib/jvm/java-17-openjdk-amd64 \
    /usr/lib/jvm/java-17-openjdk \
    /usr/lib/jvm/java-17 \
    /usr/lib/jvm/temurin-17 \
    /usr/local/lib/jvm/openjdk17 \
    /opt/java/17; do
    if [[ -d "$candidate" ]]; then
      export JAVA_HOME="$candidate"
      break
    fi
  done
fi

if [[ -z "$JAVA_HOME" ]] || [[ ! -d "$JAVA_HOME" ]]; then
  _java=$(command -v java 2>/dev/null)
  [[ -n "$_java" ]] && export JAVA_HOME="$(dirname "$(dirname "$(readlink -f "$_java")")")"
fi

if [[ -z "$JAVA_HOME" ]] || [[ ! -d "$JAVA_HOME" ]]; then
  echo "✗ Java 17 not found. Run: sudo apt-get install -y openjdk-17-jdk"
  exit 1
fi

echo "▶ Using JAVA_HOME=$JAVA_HOME"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$JAVA_HOME/bin:$PATH"

# ─── Paths ────────────────────────────────────────────────────────────────────
WIN_SRC="/mnt/c/Users/Ivan/Projekti/BudgetAppV2"
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
# versionCode: unique integer Android uses to compare versions (use total minor count)
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
check "app/settings.tsx"                       "EXPO_PUBLIC_BUILD_VERSION"    "settings.tsx — version from env var"
check "app/(tabs)/savings.tsx"                 "pastTotal"                    "savings.tsx — past-only total"
check "app/(tabs)/budget.tsx"                  "viewMonth"                    "budget.tsx — month navigation"
check "src/components/BudgetCard.tsx"          "onDeleteExpense"              "BudgetCard.tsx — delete expense prop"
check "app/daily-tracker.tsx"                  "getDailySpendTotalsByDay"     "daily-tracker.tsx — daily_spends calendar fix"
check "src/db/queries.ts"                      "savingsTarget"                "queries.ts — savings in projected expense"
check "src/widget/widgetTaskHandler.ts"        "widgetTaskHandler"            "widgetTaskHandler.ts — widget task handler"
check "src/widget/DailyLogWidget.tsx"          "DailyLogWidget"               "DailyLogWidget.tsx — widget UI component"
check "app/_layout.tsx"                        "widgetTaskHandler"            "_layout.tsx — widget registered"
check "credentials.json"                       "keystorePath"                 "credentials.json — consistent signing key"

[[ $_fail -eq 1 ]] && exit 1

# ─── 2. Patch versionCode + versionName in build.gradle ──────────────────────
GRADLE_FILE="$WSL_DST/apps/mobile/android/app/build.gradle"
sed -i "s/VERSION_CODE\.toInteger()/$VERSION_CODE/" "$GRADLE_FILE" 2>/dev/null || true
sed -i "s/VERSION_CODE/$VERSION_CODE/g" "$GRADLE_FILE"
sed -i "s/VERSION_NAME/\"$NEW_VERSION\"/" "$GRADLE_FILE" 2>/dev/null || true
sed -i "s/VERSION_NAME/$NEW_VERSION/g" "$GRADLE_FILE"
echo "▶ Set versionCode=$VERSION_CODE versionName=$NEW_VERSION in build.gradle"

# ─── 3. Install deps ──────────────────────────────────────────────────────────
echo "▶ Installing dependencies..."
cd "$WSL_DST"
pnpm install --no-frozen-lockfile --silent

# ─── 3b. Ensure swap for C++ compilation ─────────────────────────────────────
SWAP_FILE="$HOME/build-swap"
if ! swapon --show 2>/dev/null | grep -q "$SWAP_FILE"; then
  echo "▶ Creating 4 GB swap file..."
  if [[ ! -f "$SWAP_FILE" ]]; then
    dd if=/dev/zero of="$SWAP_FILE" bs=1M count=4096 status=none
    chmod 600 "$SWAP_FILE"
    mkswap "$SWAP_FILE"
  fi
  if sudo -n swapon "$SWAP_FILE" 2>/dev/null; then
    echo "  ✔ Swap enabled"
  else
    echo "  ⚠ Could not enable swap (needs sudo). Run once: sudo swapon $SWAP_FILE"
  fi
else
  echo "  ✔ Swap already active"
fi

# ─── 3c. Patch gradlew ───────────────────────────────────────────────────────
GRADLEW="$WSL_DST/apps/mobile/android/gradlew"
sed -i '/^export JAVA_HOME=.*jdk/d' "$GRADLEW"
sed -i '/^echo "sdk.dir=/d' "$GRADLEW"
sed -i '/^export CMAKE_BUILD_PARALLEL_LEVEL=/d' "$GRADLEW"
sed -i "1a export JAVA_HOME=\"$JAVA_HOME\"\nexport CMAKE_BUILD_PARALLEL_LEVEL=1\necho \"sdk.dir=$ANDROID_HOME\" > \"\$(dirname \"\$0\")/local.properties\"" "$GRADLEW"
echo "▶ Patched gradlew (JAVA_HOME + CMAKE_BUILD_PARALLEL_LEVEL=1 + sdk.dir)"

# ─── 4. Kill stale Gradle daemons ────────────────────────────────────────────
echo "▶ Stopping Gradle daemons..."
"$GRADLEW" -p "$WSL_DST/apps/mobile/android" --stop 2>/dev/null || true
pkill -f "GradleDaemon" 2>/dev/null || true

# ─── 5. Clear ALL caches ─────────────────────────────────────────────────────
echo "▶ Clearing all caches..."

_removed=0
_rm_verbose() {
  local label="$1"; shift
  local found=0
  for p in "$@"; do
    # expand globs manually so we can count
    for match in $p; do
      [[ -e "$match" ]] || continue
      rm -rf "$match"
      found=1
      _removed=1
    done
  done
  if [[ $found -eq 1 ]]; then
    echo "  ✔ cleared: $label"
  else
    echo "  ○ already clean: $label"
  fi
}

_rm_verbose "Metro/Expo JS cache"       "$HOME/.expo/metro-cache" "$HOME/.expo/cache"
_rm_verbose "mobile .expo/.metro"       "$WSL_DST/apps/mobile/.expo" "$WSL_DST/apps/mobile/.metro"
_rm_verbose "node_modules/.cache"       "$WSL_DST/node_modules/.cache"
_rm_verbose "Gradle build-cache"        "$HOME/.gradle/caches"/build-cache-*
_rm_verbose "Gradle transforms"         "$HOME/.gradle/caches"/transforms-*
_rm_verbose "android/app/build output" "$WSL_DST/apps/mobile/android/app/build"
_rm_verbose "android/.gradle"          "$WSL_DST/apps/mobile/android/.gradle"
_rm_verbose "/tmp metro/haste/eas dirs" \
  "$(find /tmp -maxdepth 1 \( -name 'metro-*' -o -name 'haste-map-*' -o -name 'eas-build-*' \) 2>/dev/null | tr '\n' ' ')" \
  "$(find /tmp -maxdepth 2 -name 'eas-build-*' 2>/dev/null | tr '\n' ' ')"
_rm_verbose "~/.eas-build"             "$HOME/.eas-build"

if [[ $_removed -eq 1 ]]; then
  echo "  ✔ All caches cleared"
else
  echo "  ⚠ No caches found — everything was already clean (stale bundle risk!)"
fi

# ─── 6. Stamp build version into eas.json env ────────────────────────────────
# Using EXPO_PUBLIC_* vars — these are inlined by Metro at bundle time,
# bypassing all file/transform caches. Far more reliable than buildInfo.ts.
BUILD_TIMESTAMP=$(date '+%Y-%m-%d %H:%M')
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
echo "▶ Stamped eas.json: EXPO_PUBLIC_BUILD_VERSION=$NEW_VERSION @ $BUILD_TIMESTAMP"
echo "  Verifying..."
node -e "const c=JSON.parse(require('fs').readFileSync('$EAS_JSON','utf8')); console.log('  BUILD_VERSION =', c.build.preview.env.EXPO_PUBLIC_BUILD_VERSION);"

# ─── 7. Build ─────────────────────────────────────────────────────────────────
echo "▶ Building APK..."
BUILD_START=$(date +%s)
cd "$WSL_DST/apps/mobile"
EXPO_NO_METRO_CACHE=1 METRO_RESET_CACHE=true eas build -p android --profile preview --local --clear-cache
BUILD_END=$(date +%s)

# ─── 8. Locate APK ────────────────────────────────────────────────────────────
APK=$(find "$WSL_DST/apps/mobile" -maxdepth 2 -name "*.apk" | tail -1)

if [[ -z "$APK" ]]; then
  echo "✗ No APK found after build!"
  exit 1
fi

APK_SIZE=$(du -sh "$APK" | cut -f1)
APK_MTIME=$(stat -c '%y' "$APK" | cut -d'.' -f1)
echo "▶ APK: $APK ($APK_SIZE, modified $APK_MTIME)"

# ─── 8b. Verify bundle contents ──────────────────────────────────────────────
echo "▶ Verifying bundle contains expected version..."
VERIFY_DIR=$(mktemp -d)
# APKs are ZIP files — extract just the JS bundle
unzip -q "$APK" "assets/index.android.bundle" -d "$VERIFY_DIR" 2>/dev/null || \
  unzip -q "$APK" "assets/*.bundle" -d "$VERIFY_DIR" 2>/dev/null || true

BUNDLE=$(find "$VERIFY_DIR" -name "*.bundle" | head -1)
if [[ -n "$BUNDLE" ]]; then
  BUNDLE_SIZE=$(du -sh "$BUNDLE" | cut -f1)
  # Search for the stamped version string inside the (hermes bytecode) bundle.
  # strings extracts readable text; grep -c counts matches.
  if strings "$BUNDLE" 2>/dev/null | grep -q "$NEW_VERSION"; then
    echo "  ✔ Bundle ($BUNDLE_SIZE) contains version $NEW_VERSION — FRESH"
  else
    # Also check for any EXPO_PUBLIC_BUILD_VERSION value present
    FOUND_VER=$(strings "$BUNDLE" 2>/dev/null | grep -o '[0-9]\+\.[0-9]\+' | head -5 | tr '\n' ' ' || true)
    echo "  ✗ Bundle ($BUNDLE_SIZE) does NOT contain '$NEW_VERSION'"
    echo "    Versions found in bundle: ${FOUND_VER:-none}"
    echo "    ⚠ Stale bundle suspected — cache clear may have failed"
  fi
else
  echo "  ⚠ Could not extract bundle from APK for verification (strings check skipped)"
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
