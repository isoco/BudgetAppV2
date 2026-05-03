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
echo "▶ Syncing files to WSL2..."
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
check "app/daily-tracker.tsx"                  "getDailySpendTotalsByDay"     "daily-tracker.tsx — daily_spends calendar fix"
check "src/db/queries.ts"                      "getDailySpendTotalsByDay"     "queries.ts — getDailySpendTotalsByDay added"
check "src/widget/widgetTaskHandler.ts"        "widgetTaskHandler"            "widgetTaskHandler.ts — widget task handler"
check "src/widget/DailyLogWidget.tsx"          "DailyLogWidget"               "DailyLogWidget.tsx — widget UI component"
check "app/_layout.tsx"                        "widgetTaskHandler"            "_layout.tsx — widget registered"
check "credentials.json"                       "keystorePath"                 "credentials.json — consistent signing key"

[[ $_fail -eq 1 ]] && exit 1

# ─── 2. Install deps ──────────────────────────────────────────────────────────
echo "▶ Installing dependencies..."
cd "$WSL_DST"
pnpm install --no-frozen-lockfile

# ─── 2b. Patch gradlew — inject JAVA_HOME + sdk.dir at runtime inside EAS temp dir
GRADLEW="$WSL_DST/apps/mobile/android/gradlew"
# Remove previous patch lines
sed -i '/^export JAVA_HOME=.*jdk/d' "$GRADLEW"
sed -i '/^echo "sdk.dir=/d' "$GRADLEW"
sed -i '/^export CMAKE_BUILD_PARALLEL_LEVEL=/d' "$GRADLEW"
# Inject after shebang:
#  - JAVA_HOME so Gradle finds the JDK
#  - sdk.dir so Android Gradle Plugin finds the SDK
#  - CMAKE_BUILD_PARALLEL_LEVEL=1 so cmake --build invokes ninja with -j1,
#    preventing multiple Clang processes from exhausting RAM during native compilation
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

# ─── 2c. Ensure enough virtual memory for native C++ compilation ─────────────
# cmake --build spawns multiple Clang processes; without swap they exhaust RAM
# and kill the Gradle daemon. Create a 4 GB swap file if one isn't active.
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

# ─── 3. Kill stale Gradle daemons ────────────────────────────────────────────
# Gradle reuses daemons across builds. If a daemon started without
# CMAKE_BUILD_PARALLEL_LEVEL in its env, it won't pick up the new value.
# Kill all daemons so fresh ones start with the correct environment.
echo "▶ Stopping Gradle daemons..."
"$WSL_DST/apps/mobile/android/gradlew" -p "$WSL_DST/apps/mobile/android" --stop 2>/dev/null || true
pkill -f "GradleDaemon" 2>/dev/null || true

# ─── 4. Clear ALL caches ─────────────────────────────────────────────────────
echo "▶ Clearing all caches..."

_removed=0
_rm_verbose() {
  local label="$1"; shift
  local found=0
  for p in "$@"; do
    for match in $p; do
      [[ -e "$match" ]] || continue
      rm -rf "$match"
      found=1; _removed=1
    done
  done
  [[ $found -eq 1 ]] && echo "  ✔ cleared: $label" || echo "  ○ already clean: $label"
}

_rm_verbose "Metro/Expo JS cache"       "$HOME/.expo/metro-cache" "$HOME/.expo/cache"
_rm_verbose "mobile .expo/.metro"       "$WSL_DST/apps/mobile/.expo" "$WSL_DST/apps/mobile/.metro"
_rm_verbose "node_modules/.cache"       "$WSL_DST/node_modules/.cache"
_rm_verbose "Gradle build-cache"        "$HOME/.gradle/caches"/build-cache-*
_rm_verbose "Gradle transforms"         "$HOME/.gradle/caches"/transforms-*
_rm_verbose "android/app/build output" "$WSL_DST/apps/mobile/android/app/build"
_rm_verbose "android/.gradle"          "$WSL_DST/apps/mobile/android/.gradle"
_rm_verbose "/tmp eas-build dirs"      "$(find /tmp -maxdepth 2 \( -name 'metro-*' -o -name 'haste-map-*' -o -name 'eas-build-*' \) 2>/dev/null | tr '\n' ' ')"
_rm_verbose "~/.eas-build"             "$HOME/.eas-build"

[[ $_removed -eq 1 ]] && echo "  ✔ All caches cleared" || echo "  ⚠ No caches found — already clean (stale bundle risk!)"

# ─── 5. Stamp build version ───────────────────────────────────────────────────
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

echo "▶ Building APK (this may take a few minutes)..."
BUILD_START=$(date +%s)
cd "$WSL_DST/apps/mobile"
EXPO_NO_METRO_CACHE=1 METRO_RESET_CACHE=true eas build -p android --profile preview --local --clear-cache
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
