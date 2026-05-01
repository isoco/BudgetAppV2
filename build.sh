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

echo ""
echo "╔══════════════════════════════════════╗"
echo "║  BudgetApp Build  v$NEW_VERSION"
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
check "app/(tabs)/transactions.tsx"            "budget"                       "transactions.tsx — budget filter"
check "app/(tabs)/savings.tsx"                 "pastTotal"                    "savings.tsx — past-only total"
check "app/(tabs)/budget.tsx"                  "viewMonth"                    "budget.tsx — month navigation"
check "src/components/BudgetCard.tsx"          "onDeleteExpense"              "BudgetCard.tsx — delete expense prop"
check "app/daily-tracker.tsx"                  "getDailySpendTotalsByDay"     "daily-tracker.tsx — daily_spends calendar fix"
check "src/db/queries.ts"                      "getDailySpendTotalsByDay"     "queries.ts — getDailySpendTotalsByDay added"
check "src/widget/widgetTaskHandler.ts"        "widgetTaskHandler"            "widgetTaskHandler.ts — widget task handler"
check "src/widget/DailyLogWidget.tsx"          "DailyLogWidget"               "DailyLogWidget.tsx — widget UI component"
check "app/_layout.tsx"                        "widgetTaskHandler"            "_layout.tsx — widget registered"

[[ $_fail -eq 1 ]] && exit 1

# ─── 2. Install deps ──────────────────────────────────────────────────────────
echo "▶ Installing dependencies..."
cd "$WSL_DST"
pnpm install --no-frozen-lockfile --silent

# ─── 2b. Ensure swap for C++ compilation ─────────────────────────────────────
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

# ─── 2c. Patch gradlew ───────────────────────────────────────────────────────
GRADLEW="$WSL_DST/apps/mobile/android/gradlew"
sed -i '/^export JAVA_HOME=.*jdk/d' "$GRADLEW"
sed -i '/^echo "sdk.dir=/d' "$GRADLEW"
sed -i '/^export CMAKE_BUILD_PARALLEL_LEVEL=/d' "$GRADLEW"
sed -i "1a export JAVA_HOME=\"$JAVA_HOME\"\nexport CMAKE_BUILD_PARALLEL_LEVEL=1\necho \"sdk.dir=$ANDROID_HOME\" > \"\$(dirname \"\$0\")/local.properties\"" "$GRADLEW"
echo "▶ Patched gradlew (JAVA_HOME + CMAKE_BUILD_PARALLEL_LEVEL=1 + sdk.dir)"

# ─── 3. Kill stale Gradle daemons ────────────────────────────────────────────
echo "▶ Stopping Gradle daemons..."
"$GRADLEW" -p "$WSL_DST/apps/mobile/android" --stop 2>/dev/null || true
pkill -f "GradleDaemon" 2>/dev/null || true

# ─── 4. Clear ALL caches ─────────────────────────────────────────────────────
echo "▶ Clearing all caches..."
rm -rf "$HOME/.expo/metro-cache" "$HOME/.expo/cache"
rm -rf "$WSL_DST/apps/mobile/.expo" "$WSL_DST/apps/mobile/.metro"
rm -rf "$WSL_DST/node_modules/.cache"
rm -rf "$HOME/.gradle/caches/build-cache-*"
rm -rf "$HOME/.gradle/caches/transforms-*"
find /tmp -maxdepth 1 \( -name "metro-*" -o -name "haste-map-*" \) 2>/dev/null | xargs rm -rf
echo "  ✔ All caches cleared"

# ─── 4b. Stamp build info into app ───────────────────────────────────────────
BUILD_INFO_FILE="$WSL_DST/apps/mobile/src/constants/buildInfo.ts"
BUILD_TIMESTAMP=$(date '+%Y-%m-%d %H:%M')
cat > "$BUILD_INFO_FILE" << EOF
// Auto-updated by build.sh before every build — do not edit manually
export const BUILD_DATE = '$BUILD_TIMESTAMP';
export const BUILD_VERSION = '$NEW_VERSION';
EOF
echo "▶ Stamped build info: v$NEW_VERSION @ $BUILD_TIMESTAMP"

# ─── 5. Build ─────────────────────────────────────────────────────────────────
echo "▶ Building APK..."
BUILD_START=$(date +%s)
cd "$WSL_DST/apps/mobile"
EXPO_NO_METRO_CACHE=1 METRO_RESET_CACHE=true eas build -p android --profile preview --local --clear-cache
BUILD_END=$(date +%s)

# ─── 6. Locate APK ────────────────────────────────────────────────────────────
APK=$(find "$WSL_DST/apps/mobile" -maxdepth 2 -name "*.apk" | tail -1)

if [[ -z "$APK" ]]; then
  echo "✗ No APK found after build!"
  exit 1
fi

# ─── 7. Copy to OneDrive ──────────────────────────────────────────────────────
DEST="$OUTPUT_DIR/BudgetApp_V$NEW_VERSION.apk"
echo "▶ Copying to: $DEST"
cp "$APK" "$DEST"

# ─── 8. Save version ──────────────────────────────────────────────────────────
echo "$NEW_VERSION" > "$VERSION_FILE"

# ─── Done ─────────────────────────────────────────────────────────────────────
ELAPSED=$(( $(date +%s) - BUILD_START ))
echo ""
echo "✔ Done in ${ELAPSED}s"
echo "  APK: BudgetApp_V$NEW_VERSION.apk"
echo "  Dir: $OUTPUT_DIR"
echo ""
