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
if grep -q "onToggle" "$WSL_DST/apps/mobile/src/components/TransactionItem.tsx"; then
  echo "  ✔ TransactionItem.tsx — checkbox code present"
else
  echo "  ✗ TransactionItem.tsx — MISSING checkbox code! Sync failed."
  exit 1
fi
if grep -q "manually_unchecked" "$WSL_DST/apps/mobile/app/(tabs)/transactions.tsx"; then
  echo "  ✔ transactions.tsx — manually_unchecked fix present"
else
  echo "  ✗ transactions.tsx — MISSING manually_unchecked fix! Sync failed."
  exit 1
fi
if grep -q "dayTxs" "$WSL_DST/apps/mobile/app/daily-tracker.tsx"; then
  echo "  ✔ daily-tracker.tsx — expenses list present"
else
  echo "  ✗ daily-tracker.tsx — MISSING expenses list! Sync failed."
  exit 1
fi
if grep -q "viewMonth" "$WSL_DST/apps/mobile/app/(tabs)/index.tsx"; then
  echo "  ✔ index.tsx — month navigation present"
else
  echo "  ✗ index.tsx — MISSING month navigation! Sync failed."
  exit 1
fi
if grep -q "privacy_hide_income" "$WSL_DST/apps/mobile/app/settings.tsx"; then
  echo "  ✔ settings.tsx — privacy settings present"
else
  echo "  ✗ settings.tsx — MISSING privacy settings! Sync failed."
  exit 1
fi

# ─── 2. Install deps ──────────────────────────────────────────────────────────
echo "▶ Installing dependencies..."
cd "$WSL_DST"
pnpm install --frozen-lockfile --silent

# ─── 2b. Patch gradlew — inject JAVA_HOME + sdk.dir at runtime inside EAS temp dir
GRADLEW="$WSL_DST/apps/mobile/android/gradlew"
# Remove previous patch lines
sed -i '/^export JAVA_HOME=.*jdk/d' "$GRADLEW"
sed -i '/^echo "sdk.dir=/d' "$GRADLEW"
# Inject after shebang: set JAVA_HOME and write local.properties with sdk.dir
# (EAS extracts project to /tmp/..., gradlew runs there — so we write local.properties relative to gradlew)
sed -i "1a export JAVA_HOME=\"$JAVA_HOME\"\necho \"sdk.dir=$ANDROID_HOME\" > \"\$(dirname \"\$0\")/local.properties\"" "$GRADLEW"
echo "▶ Patched gradlew with JAVA_HOME=$JAVA_HOME + sdk.dir=$ANDROID_HOME"

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

# ─── 3. Build ─────────────────────────────────────────────────────────────────
echo "▶ Clearing all caches..."
rm -rf "$HOME/.expo/metro-cache"
rm -rf "$HOME/.expo/cache"
rm -rf "$WSL_DST/apps/mobile/.expo"
rm -rf "$WSL_DST/apps/mobile/.metro"
rm -rf "$WSL_DST/node_modules/.cache"
find /tmp -maxdepth 1 -name "metro-*" -o -name "haste-map-*" 2>/dev/null | xargs rm -rf

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
