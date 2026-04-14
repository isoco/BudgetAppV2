#!/bin/bash
set -e

# ─── Environment ─────────────────────────────────────────────────────────────
export ANDROID_HOME="$HOME/Android/Sdk"

# Detect JAVA_HOME — try SDKMAN first (no sudo), then common system paths
if [[ -z "$JAVA_HOME" ]] || [[ ! -d "$JAVA_HOME" ]]; then
  # SDKMAN current Java (no sudo required)
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

# Last resort: derive from the java binary on PATH
if [[ -z "$JAVA_HOME" ]] || [[ ! -d "$JAVA_HOME" ]]; then
  _java=$(command -v java 2>/dev/null)
  if [[ -n "$_java" ]]; then
    export JAVA_HOME="$(dirname "$(dirname "$(readlink -f "$_java")")")"
  fi
fi

if [[ -z "$JAVA_HOME" ]] || [[ ! -d "$JAVA_HOME" ]]; then
  echo "✗ Could not find a valid Java 17 installation."
  echo "  Install it with: sudo apt-get install -y openjdk-17-jdk"
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
rsync -a --delete \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='*.apk' \
  "$WIN_SRC/" "$WSL_DST/"

# ─── 2. Install deps ──────────────────────────────────────────────────────────
echo "▶ Installing dependencies..."
cd "$WSL_DST"
pnpm install --frozen-lockfile --silent

# ─── 2b. Patch gradlew to hardcode JAVA_HOME (EAS resets env in subprocess) ───
GRADLEW="$WSL_DST/apps/mobile/android/gradlew"
# Remove any previous patch line, then insert after shebang (line 1)
sed -i '/^export JAVA_HOME=.*jdk/d' "$GRADLEW"
sed -i "1a export JAVA_HOME=\"$JAVA_HOME\"" "$GRADLEW"
echo "▶ Patched gradlew with JAVA_HOME=$JAVA_HOME"

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
