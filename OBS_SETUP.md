# OBS Setup for AI Virtual Camera Demo

## One-Time Setup

### Step 1: Install dependencies
```bash
brew install blackhole-2ch
brew install --cask obs
```
Log out and back in to macOS after installing BlackHole.

### Step 2: Launch the Camera Output Window (must be done BEFORE configuring OBS)

1. Start the Nextron app: `npm run dev`
2. Generate a 3D face in the app (or it will auto-restore if you've done this before)
3. In the app, scroll to the **DEMO CONTROLS** panel → click **"▶ Launch Camera Output (for OBS)"**
4. A frameless 1280×720 black window with the 3D face will appear — **keep it open**

### Step 3: Configure OBS Source

1. Open OBS
2. In **Scenes** (bottom left) → click **+** → name it `AI Virtual Camera`
3. In **Sources** → click **+** → select **macOS Screen Capture**
4. Name it `AI Face Window`
5. **Properties:**
   - Method: **Window Capture**
   - Window: select the entry containing `AI Virtual Camera Output` (e.g. `[my-nextron-app] AI Virtual Camera Output`)
   - ☑ Show Cursor: **OFF**
6. Right-click the source in preview → **Transform** → **Fit to Screen**

> **Note:** The camera window must be open for it to appear in the Window dropdown. If you don't see it, go back to the app and click "Launch Camera Output" first, then re-open the dropdown.
> Do NOT use the deprecated "Window Capture" under Sources → Deprecated. Use **macOS Screen Capture** instead.

### Step 4: Set OBS Resolution
OBS → **Settings** → **Video**:
- Base (Canvas) Resolution: **1280x720**
- Output (Scaled) Resolution: **1280x720**
- Common FPS Values: **30**

---

## Before Each Demo

1. Run: `bash scripts/demo-setup.sh`
2. Start your Nextron app: `npm run dev`
3. In your app → click **"Launch Camera Output (for OBS)"**
4. Confirm OBS preview shows the 3D face
5. OBS Controls panel → click **Start Virtual Camera**
6. Open Google Meet / Teams
7. Meet Settings → Camera: **OBS Virtual Camera**
8. Meet Settings → Microphone: **BlackHole 2ch**
9. Start the AI agent from the camera output window
10. 🎬 Record your screen (CMD+SHIFT+5 on macOS)

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "AI Virtual Camera Output" not in OBS window list | Click Launch button in app first, then refresh the Window dropdown in the macOS Screen Capture properties |
| BlackHole not in Meet mic list | Log out and back in to macOS after installing |
| OBS Virtual Camera not in Meet camera list | Click "Start Virtual Camera" in OBS Controls |
| AI voice plays through speakers instead of BlackHole | Wait 2–3 seconds after agent starts — AudioContext patch applies after first audio plays |
| Face appears letterboxed in OBS | OBS Settings → Video → set to exactly 1280x720, then Fit to Screen on the source |
| Canvas appears blank in camera-output page | Check browser console for WebGL errors |
