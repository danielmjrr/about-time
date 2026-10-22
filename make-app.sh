#!/bin/bash
# Builds "About Time.app" in this folder. Run it again after you move the folder.
set -euo pipefail
cd "$(dirname "$0")"
APP="About Time.app"
VERSION="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' package.json)"
TMP="$(mktemp -d)"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" "$TMP/AppIcon.iconset"

swift app/icon.swift "$TMP/icon.png"
for s in 16 32 128 256 512; do
  sips -z $s $s "$TMP/icon.png" --out "$TMP/AppIcon.iconset/icon_${s}x${s}.png" >/dev/null
  sips -z $((s * 2)) $((s * 2)) "$TMP/icon.png" --out "$TMP/AppIcon.iconset/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$TMP/AppIcon.iconset" -o "$APP/Contents/Resources/AppIcon.icns"

# Bundle the server and UI inside the app: macOS blocks Dock-launched apps from reading ~/Desktop,
# but an app may always read its own bundle. Re-run this script after editing server.py or web/.
cp server.py "$APP/Contents/Resources/"
cp -R web "$APP/Contents/Resources/web"

cp app/launch.sh "$APP/Contents/MacOS/about-time"
chmod +x "$APP/Contents/MacOS/about-time"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>About Time</string>
  <key>CFBundleDisplayName</key><string>About Time</string>
  <key>CFBundleIdentifier</key><string>local.abouttime</string>
  <key>CFBundleExecutable</key><string>about-time</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>LSUIElement</key><true/>
</dict>
</plist>
PLIST
rm -rf "$TMP"
touch "$APP"
echo "Built $PWD/$APP"
