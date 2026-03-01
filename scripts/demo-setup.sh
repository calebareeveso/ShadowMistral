#!/bin/bash
# scripts/demo-setup.sh
# Run this before every demo to verify everything is ready

echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║     AI Virtual Camera — Demo Setup        ║"
echo "╚═══════════════════════════════════════════╝"
echo ""

# Check BlackHole
echo "[ AUDIO ]"
if [ -d "/Library/Audio/Plug-Ins/HAL/BlackHole2ch.driver" ]; then
  # Driver is installed — check if macOS actually sees it as an audio device
  if system_profiler SPAudioDataType 2>/dev/null | grep -qi "BlackHole"; then
    echo "  ✅ BlackHole 2ch — installed and active"
  else
    echo "  ⚠️  BlackHole 2ch — driver installed but NOT registered as audio device"
    echo "     Fix: Reboot your Mac (or log out and log back in) so macOS loads the driver"
  fi
elif brew list --cask 2>/dev/null | grep -q "blackhole-2ch"; then
  echo "  ⚠️  BlackHole 2ch — brew reports installed but driver not found"
  echo "     Fix: Reboot your Mac to complete installation"
else
  echo "  ❌ BlackHole NOT found"
  echo "     Fix: brew install blackhole-2ch"
  echo "     Then: reboot your Mac"
fi

echo ""
echo "[ VIDEO ]"
# Check OBS
if [ -d "/Applications/OBS.app" ]; then
  echo "  ✅ OBS Studio — installed"
else
  echo "  ❌ OBS not found"
  echo "     Fix: brew install --cask obs"
fi

# Check OBS Virtual Camera
if system_profiler SPCameraDataType 2>/dev/null | grep -q "OBS Virtual Camera"; then
  echo "  ✅ OBS Virtual Camera — ACTIVE"
else
  echo "  ⚠️  OBS Virtual Camera not active"
  echo "     → Open OBS → click 'Start Virtual Camera' in the Controls panel"
fi

echo ""
echo "[ DEMO CHECKLIST ]"
echo "  1. npm run dev  (start Nextron app)"
echo "  2. Open OBS → Scene: 'AI Virtual Camera' → Add macOS Screen Capture"
echo "     → Method: Window Capture → Window: 'AI Virtual Camera Output'"
echo "     → Fit to screen (right-click source → Transform → Fit to Screen)"
echo "  3. OBS Settings → Video → 1280x720 @ 30fps"
echo "  4. OBS → Click 'Start Virtual Camera'"
echo "  5. In your app → click 'Launch Camera Output (for OBS)'"
echo "  6. In OBS preview — you should see the 3D face"
echo "  7. Open Google Meet → Settings → Camera: 'OBS Virtual Camera'"
echo "                              → Mic: 'BlackHole 2ch'"
echo "  8. Start the ElevenLabs agent from the camera output window"
echo "  9. Screen record 🎬"
echo ""
