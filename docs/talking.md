# Talking Face Animation — Technical Documentation

> Everything learned about how the 3D face moves, blinks, and talks.
> Covers the complete pipeline from ElevenLabs AI transcript to WebGL vertex deformation.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [File Map](#file-map)
3. [The Render Pipeline](#the-render-pipeline)
4. [Keydot (Landmark) Reference](#keydot-landmark-reference)
5. [Expression Data Format](#expression-data-format)
6. [Expression Data Objects](#expression-data-objects)
7. [Mouth Animation — What Makes the Mouth Move](#mouth-animation--what-makes-the-mouth-move)
8. [Lip Pursing — What Makes the Mouth Shrink](#lip-pursing--what-makes-the-mouth-shrink)
9. [Lip Spreading — What Makes the Mouth Widen](#lip-spreading--what-makes-the-mouth-widen)
10. [Eye Blinks — What Makes the Eyes Blink](#eye-blinks--what-makes-the-eyes-blink)
11. [Eyebrow Movement — What Raises and Lowers the Brows](#eyebrow-movement--what-raises-and-lowers-the-brows)
12. [The Smooth Interpolation System](#the-smooth-interpolation-system)
13. [Text-to-Mouth Pipeline](#text-to-mouth-pipeline)
14. [Viseme Table](#viseme-table)
15. [Integration with ElevenLabs](#integration-with-elevenlabs)
16. [Lifecycle / Call Flow](#lifecycle--call-flow)
17. [Tuning Guide](#tuning-guide)
18. [Lessons Learned](#lessons-learned)

---

## Architecture Overview

The application uses a **PhotoAnim WebGL renderer** that deforms a 3D face mesh in real time. The face is defined by **71 keydots** (landmark points numbered 0–70) that control mesh vertices through binding weights.

There are **two expression channels** that run simultaneously:

| Channel  | Variable | Controls                              | Built By                                |
| -------- | -------- | ------------------------------------- | --------------------------------------- |
| Eye/Brow | `pa`     | Eyelid closure, brow raise/frown      | `buildEyeBrowAnim(lidScale, browScale)` |
| Mouth    | `S`      | Jaw opening, lip width (spread/purse) | `buildMouthAnim(openAmt, widthAmt)`     |

Both channels are **rebuilt dynamically every frame** from interpolated values and pushed to the GPU via the `T()` master refresh function.

The mouth also has a **physical triangle-splicing mechanism**: lip-closure triangles stored at index `Ha = 120996` in `g.triangles` are removed (spliced out) to visually open the mouth, and pushed back from `Wa[]` to close it.

---

## File Map

| File                                    | Purpose                                                                 |
| --------------------------------------- | ----------------------------------------------------------------------- |
| `renderer/public/main.js` (~4400 lines) | Core 3D face renderer, expression system, AI animation API (Section 10) |
| `renderer/pages/home.jsx` (~756 lines)  | React page with ElevenLabs conversation hook, drives the animation API  |
| `renderer/public/photoanim.js`          | PhotoAnim WebGL engine (compiled/minified)                              |
| `renderer/public/fd.js`                 | Face detection library                                                  |
| `renderer/public/facemodel.js`          | 3D face model data                                                      |

### Key Locations in main.js

| Section                     | Lines (approx) | Content                                      |
| --------------------------- | -------------- | -------------------------------------------- |
| Architecture / Variables    | ~440–500       | Variable map, render pipeline overview       |
| `T()` Master Refresh        | ~1890–1960     | Pushes pa and S to GPU                       |
| Section 8 — Expression Data | ~2680–2950     | nb, wc, tc, talkAnim, sc, uc, vc definitions |
| `on3dFace` Init             | ~2480–2500     | Clears pa/S, starts blink timer              |
| Section 10 — AI Animation   | ~3480–4380     | Complete v6 animation system                 |

---

## The Render Pipeline

```
Text from AI ──► processTextToMouth() ──► setMouthTarget(open, width)
                                                │
                                                ▼
                      ┌─────── smoothUpdate() (rAF ~60fps) ───────┐
                      │                                            │
                      │  curOpen  ──lerp──►  tgtOpen               │
                      │  curWidth ──lerp──►  tgtWidth              │
                      │  curLidClose ─lerp─► tgtLidClose           │
                      │  curBrowRaise ─lerp► tgtBrowRaise          │
                      │                                            │
                      │  S  = buildMouthAnim(curOpen, curWidth)    │
                      │  pa = buildEyeBrowAnim(curLid, curBrow)    │
                      │                                            │
                      │  splice/unsplice mouth triangles at Ha     │
                      │                                            │
                      │  safeT() ──► T()                           │
                      └────────────────────────────────────────────┘
                                        │
                                        ▼
                      T() Master Refresh:
                        1. O = wa.slice(0)  — copy base vertices
                        2. ec(pa, e)        — apply eye/brow keydot offsets
                        3. fc(e, b)         — compute vertex deltas for pa
                        4. ec(S, e)         — apply mouth keydot offsets
                        5. fc(e, c)         — compute vertex deltas for S
                        6. Write pa.traj[] → g.trajectory[Fa...]
                        7. Write S.traj[]  → g.trajectory[ia...]
                        8. Blend b[] + c[] into final vertex data
                        9. g.refreshVertices(O) → GPU upload
                                        │
                                        ▼
                      Tb() render loop (separate rAF):
                        g.renderFrame() → draws to canvas
                        drawMouthQuad() → renders mouth interior
```

---

## Keydot (Landmark) Reference

The face has **71 keydots** (0–70). Each keydot maps to mesh vertices via array `L[keydotIndex]`. Moving a keydot deforms surrounding mesh vertices through binding weights computed by `ec()`/`fc()`.

### Face Regions

```
         ┌── 15 ── 16 ── 17 ── 18 ──┐    EYEBROWS (Left)
         │          23               │    23 = arch peak
         └───────────────────────────┘
         ┌── 19 ── 20 ── 21 ── 22 ──┐    EYEBROWS (Right)
         │          28               │    28 = arch peak
         └───────────────────────────┘

    ┌── 56 ──── 53 ──┐  ┌── 57 ──── 60 ──┐    UPPER EYELIDS
    │                 │  │                 │
   24                26 29                31    EYE CORNERS
    │                 │  │                 │
    └── 55 ──── 54 ──┘  └── 58 ──── 59 ──┘    LOWER EYELIDS

     3 ─── 4 ─── 5         9 ─── 10 ─── 11    CHEEKS

              ┌── 49 ── 50 ── 51 ──┐            UPPER LIP
         44 ──┤                    ├── 45       MOUTH CORNERS
              └── 47 ── 46 ── 48 ──┘            LOWER LIP

                 6 ─── 7 ─── 8                  CHIN
```

### Keydot Quick Reference

| Keydot(s) | Region                    | Notes                                          |
| --------- | ------------------------- | ---------------------------------------------- |
| 0–2       | Forehead                  | Not commonly animated                          |
| 3, 4, 5   | Left cheek                | Pulled outward in smile                        |
| 6, 7, 8   | Chin                      | Drops with jaw in talking                      |
| 9, 10, 11 | Right cheek               | Mirror of left cheek                           |
| 12–14     | Nose                      | Not commonly animated                          |
| **15–18** | **Left eyebrow**          | 15=outer, 16=mid-outer, 17=mid-inner, 18=inner |
| **19–22** | **Right eyebrow**         | 19=inner, 20=mid-inner, 21=mid-outer, 22=outer |
| 23        | Left brow arch peak       | Used in surprised expression                   |
| 24        | Left eye outer corner     | Shifts during blink                            |
| 26        | Left eye inner corner     | Shifts during blink                            |
| 28        | Right brow arch peak      | Used in surprised expression                   |
| 29        | Right eye outer corner    | Shifts during blink                            |
| 31        | Right eye inner corner    | Shifts during blink                            |
| **44**    | **Left mouth corner**     | Key for spread, purse, smile, sad              |
| **45**    | **Right mouth corner**    | Mirror of 44                                   |
| **46**    | **Lower lip center**      | Drops for jaw opening                          |
| **47**    | **Lower lip left**        | Part of jaw open gesture                       |
| **48**    | **Lower lip right**       | Part of jaw open gesture                       |
| **49**    | **Upper lip left**        | Pushed forward in pursing                      |
| **50**    | **Upper lip center**      | Pushed forward in pursing                      |
| **51**    | **Upper lip right**       | Pushed forward in pursing                      |
| **53**    | **Left upper lid inner**  | Primary blink keydot (dy=-0.017)               |
| 54        | Left lower lid inner      | Rises slightly during blink                    |
| 55        | Left lower lid outer      | Counter-motion during blink                    |
| **56**    | **Left upper lid outer**  | Upper lid drops during blink                   |
| **57**    | **Right upper lid inner** | Right-side blink                               |
| 58        | Right lower lid inner     | Right-side blink                               |
| 59        | Right lower lid outer     | Right-side blink                               |
| **60**    | **Right upper lid outer** | Right-side blink                               |

---

## Expression Data Format

Each expression is a JavaScript object with two properties:

```javascript
{
  anim: [keydotA, keydotB, dx, dy, dz, ...],  // groups of 5
  traj: [0, 0, 0.5, 1, 1, 1, 0.8, ...]        // 64 easing values
}
```

### `anim[]` — Keydot Displacements (groups of 5)

| Index | Field   | Meaning                                                                                  |
| ----- | ------- | ---------------------------------------------------------------------------------------- |
| 0     | keydotA | Which landmark to move                                                                   |
| 1     | keydotB | Reference: positive = add offset relative to self; negative = mirror from `abs(keydotB)` |
| 2     | dx      | X offset at full strength (+ = right)                                                    |
| 3     | dy      | Y offset at full strength (+ = up, - = down)                                             |
| 4     | dz      | Z offset at full strength (+ = toward camera)                                            |

### `traj[]` — Trajectory / Easing Curve (64 values)

Values from 0.0 to 1.0 that control how the expression ramps up and down over one animation cycle. Written into `g.trajectory[]` at the channel's offset (`Fa` for pa, `ia` for S).

---

## Expression Data Objects

### `nb` — BLINK

Moves eyelid keydots to close the eyes.

| Keydot              | dx       | dy         | dz  | What it does                 |
| ------------------- | -------- | ---------- | --- | ---------------------------- |
| 53 (L upper inner)  | +0.002   | **-0.017** | 0   | Upper lid drops DOWN         |
| 24 (L eye corner)   | 0        | -0.022     | 0   | Corner shifts down           |
| 54 (L lower inner)  | -0.004   | -0.016     | 0   | Lower lid rises UP           |
| 56 (L upper outer)  | +0.003   | **+0.009** | 0   | Counter-rise (natural shape) |
| 26 (L inner corner) | -0.001   | +0.010     | 0   | Corner counter               |
| 55 (L lower outer)  | -0.002   | +0.004     | 0   | Counter-rise                 |
| 58–60, 29, 31       | (mirror) | (mirror)   | 0   | Right eye repeats left       |

### `tc` — SURPRISED

Opens jaw wide and raises eyebrows.

| Keydot                   | dy                   | Purpose          |
| ------------------------ | -------------------- | ---------------- |
| 46 (lower lip center)    | **-0.054**           | Jaw drops        |
| 47, 48 (lower lip sides) | -0.040               | Jaw drops        |
| 44, 45 (corners)         | -0.021               | Mouth opens wide |
| 6, 7, 8 (chin)           | -0.015               | Chin follows jaw |
| **15–22 (eyebrows)**     | **+0.021 to +0.035** | **Brows RAISE**  |
| 23, 28 (brow peaks)      | +0.025               | Arch peaks lift  |

### `talkAnim` — TALK (jaw-only subset of tc)

Same jaw/chin keydots as tc but **NO eyebrow keydots (15–22)**. This is used for mouth opening so that talking doesn't raise the eyebrows.

### `sc` — SMILE

Pulls mouth corners outward/upward, squints eyes.

| Keydot               | dx     | dy     | Purpose               |
| -------------------- | ------ | ------ | --------------------- |
| 44 (L corner)        | -0.026 | +0.012 | Corner pulls OUT + UP |
| 45 (R corner)        | +0.026 | +0.012 | Mirror                |
| 3, 5, 9, 11 (cheeks) | ±0.008 | +0.006 | Cheeks lift           |
| 53–60 (eyelids)      | ±small | ±small | Eye squint            |

### `uc` — SAD

Drops eyebrows and mouth corners.

| Keydot        | dy                   | Purpose           |
| ------------- | -------------------- | ----------------- |
| 15–22 (brows) | **-0.007 to -0.013** | Brows droop       |
| 44 (L corner) | -0.019               | Corner drops DOWN |
| 45 (R corner) | -0.019               | Corner drops DOWN |

---

## Mouth Animation — What Makes the Mouth Move

The mouth is driven by variable `S` (the mouth expression channel).

### `buildMouthAnim(openAmt, widthAmt)`

This function constructs a new expression object assigned to `S` every frame.

**Step 1 — Jaw Opening** (using `talkAnim` keydots):

- Scales talkAnim.anim entries by `openAmt` (0.0–0.38)
- Key movements at `openAmt = 0.30`:
  - Keydot 46 (lower lip center): dy = -0.054 × 0.30 = **-0.016** (jaw drops)
  - Keydot 44 (L corner): dy = -0.021 × 0.30 = -0.006 (corners follow)
  - Keydot 7 (chin center): dy = -0.015 × 0.30 = -0.005 (chin drops)

**Step 2 — Lip Spread** (widthAmt > 0, using `sc` keydots):

- Scales smile keydots 44, 45, 3, 5, 9, 11, 4, 10
- Multipliers: dx × 0.85, dy × 0.55, dz × 0.65
- Result: corners pull outward, cheeks lift slightly

**Step 3 — Lip Purse** (widthAmt < 0):

- See detailed section below

### Mouth Triangle Splicing

In addition to expression-driven vertex deformation, the mouth has a **physical opening mechanism**:

```javascript
// Open mouth:
var tri = g.triangles;
Wa = tri.splice(Ha, tri.length - Ha); // Remove lip-closure triangles
g.refreshTriangles(tri); // Update GPU

// Close mouth:
for (var i = 0; i < Wa.length; i++) tri.push(Wa[i]); // Push back
Wa = [];
g.refreshTriangles(tri);
```

`Ha = 120996` is the index in the triangle array where lip-closure triangles begin. Splicing them out reveals the mouth interior; pushing them back seals the lips.

---

## Lip Pursing — What Makes the Mouth Shrink

When `widthAmt` is **negative** (visemes like "OO", "OH", "W"), `buildMouthAnim()` creates an inward-pucker effect:

```
absW = Math.abs(widthAmt)  // e.g., 0.55 for V_OH

1. CORNERS INWARD (keydots 44, 45):
   dx = ∓0.032 × absW    ← 44 pushes RIGHT, 45 pushes LEFT
   Result: mouth corners squeeze toward center

2. UPPER LIP FORWARD (keydots 49, 50, 51):
   dz = +0.022 × absW    ← lips protrude toward camera
   Result: upper lip pouts forward

3. LOWER LIP FORWARD (keydots 46, 47, 48):
   dz = +0.018 × absW    ← smaller forward push
   Result: lower lip follows upper lip

4. CHEEK/CHIN INWARD (keydots 3, 5, 9, 11):
   dx = ∓0.008 × absW    ← cheeks pull toward center
   Result: face narrows around the mouth area
```

This creates the "oo" / "oh" lip shape — a visible shrinking/puckering.

### Example: "OO" sound (V_OO = [0.18, -0.65])

- `openAmt = 0.18` → jaw opens 18% (subtle)
- `widthAmt = -0.65` → max pursing:
  - Corners 44/45 push inward by ±0.021
  - Upper lip forward by 0.014
  - Lower lip forward by 0.012
  - Cheeks inward by ±0.005

---

## Lip Spreading — What Makes the Mouth Widen

When `widthAmt` is **positive** (visemes like "AH", "EE", "EH"), `buildMouthAnim()` uses the **smile expression (`sc`)** keydots:

- Keydots 44, 45 (corners): pulled outward (dx scaled × 0.85)
- Keydots 3, 5, 9, 11 (cheeks): lifted slightly (dy scaled × 0.55)
- Keydots 4, 10 (inner cheeks): subtle widening (dz scaled × 0.65)

### Example: "EE" sound (V_EE = [0.12, 0.50])

- `openAmt = 0.12` → jaw barely opens
- `widthAmt = 0.50` → wide spread:
  - Corner 44 dx = -0.026 × 0.50 × 0.85 = -0.011 (pulls LEFT)
  - Corner 45 dx = +0.026 × 0.50 × 0.85 = +0.011 (pulls RIGHT)
  - Result: wide grin-like shape

---

## Eye Blinks — What Makes the Eyes Blink

Blinks are driven by the `tgtLidClose` variable (0 = open, 1 = fully closed).

### How a Blink Works

1. `doSingleBlink()` sets `tgtLidClose = 1.0`
2. `smoothUpdate()` lerps `curLidClose` toward 1.0 at rate **0.38** (fast close)
3. After **110–140ms**, `tgtLidClose` is set back to `0`
4. `smoothUpdate()` lerps back at rate **0.14** (slower, natural open)
5. Total visible blink duration: ~180–300ms

### What Moves During a Blink

`buildEyeBrowAnim(curLidClose, curBrowRaise)` scales the `nb` (blink) expression:

| Keydot             | Movement at full close | Visual                             |
| ------------------ | ---------------------- | ---------------------------------- |
| 53 (L upper inner) | dy = -0.017            | Upper lid drops                    |
| 56 (L upper outer) | dy = +0.009            | Counter-rotation (natural lid arc) |
| 54 (L lower inner) | dy = -0.016            | Lower lid rises to meet upper      |
| 55 (L lower outer) | dy = +0.004            | Slight counter                     |
| 24, 26 (L corners) | dy = ±0.010–0.022      | Eye corners shift                  |
| 57–60, 29, 31      | (mirror of left)       | Right eye blinks in sync           |

### Blink Types and Distribution

| Type          | Probability | tgtLidClose | Duration   | Effect                |
| ------------- | ----------- | ----------- | ---------- | --------------------- |
| Full blink    | **65%**     | 1.0         | 110–140ms  | Complete eye closure  |
| Partial blink | **17%**     | 0.30–0.50   | 200–400ms  | "Almost blink"        |
| Eyelid narrow | **10%**     | 0.12–0.20   | 500–1000ms | Focusing/squinting    |
| Skip          | **8%**      | —           | —          | No action (variation) |

15% of full blinks trigger a **double-blink** (second blink 280–360ms later).

### Blink Frequency

- **Exponential distribution** (natural randomness)
- Mean interval: **3 seconds** (speaking), **4.5 seconds** (idle)
- Minimum gap: 1.8 seconds
- Maximum gap: 9 seconds
- First blink after activation: 0.8–2.3 seconds

---

## Eyebrow Movement — What Raises and Lowers the Brows

Eyebrows are driven by `tgtBrowRaise` (positive = raised, negative = frown, range ±0.30).

### How Brow Movement Works

1. `driftTick()` sets `tgtBrowRaise` to a random value
2. `smoothUpdate()` lerps `curBrowRaise` toward target at rate **0.06** (very slow)
3. Brows glide over ~0.5–1.0 seconds (silky smooth)
4. After 1.5–4 seconds, `tgtBrowRaise` returns to 0 (neutral)
5. Next drift scheduled 2.5–5s (speaking) or 4–8s (idle)

### What the Brows Move

**Brow RAISE** (positive `browScale`): uses `tc` (surprised) keydots 15–22:

| Keydot           | dy at full scale | Position                   |
| ---------------- | ---------------- | -------------------------- |
| 18 (L inner)     | +0.035           | Left inner brow lifts most |
| 17 (L mid-inner) | +0.035           | Mid-inner follows          |
| 16 (L mid-outer) | +0.025           | Slightly less lift         |
| 15 (L outer)     | +0.021           | Outer lifts least          |
| 19 (R inner)     | +0.035           | Right mirrors left         |
| 20 (R mid-inner) | +0.035           |                            |
| 21 (R mid-outer) | +0.025           |                            |
| 22 (R outer)     | +0.021           |                            |

The inner brows lift more than the outer brows, creating a natural "surprised" arch.

**Brow FROWN** (negative `browScale`): uses `uc` (sad) keydots 15–22:

| Keydot             | dy at full scale | Position              |
| ------------------ | ---------------- | --------------------- |
| 19 (R inner)       | -0.013           | Inner brows drop most |
| 17 (L mid-inner)   | -0.007           | Mid follows           |
| Other brow keydots | -0.004 to -0.009 | Graduated droop       |

### Drift Distribution

- **40%** → raise (positive)
- **20%** → frown (negative)
- **40%** → return to neutral (0)

Speaking range: base 0.12 ± 0.14 (can reach ±0.26)
Idle range: base 0.06 ± 0.08 (gentler, up to ±0.14)

---

## The Smooth Interpolation System

### Why LERP?

Previous versions (v1–v5) swapped expression objects (`pa`) **instantly** — e.g., setting `pa = nb` for a blink, then `pa = false` to open. This caused **visible glitching** because the renderer jumped between states in a single frame.

v6 solved this by using **per-frame linear interpolation (LERP)**:

```javascript
currentValue += (targetValue - currentValue) * lerpFactor;
```

Animation functions only set **targets**. The `smoothUpdate()` loop interpolates **all channels every frame** and rebuilds `pa` and `S` dynamically.

### The Unified Loop: `smoothUpdate()`

```javascript
function smoothUpdate() {
  // 1. MOUTH — lerp open and width
  curOpen += (tgtOpen - curOpen) * LERP_OPEN;
  curWidth += (tgtWidth - curWidth) * LERP_WIDTH;

  // 2. EYELIDS — asymmetric lerp (fast close, slow open)
  var lidLerp = tgtLidClose > curLidClose ? LERP_LID_CLOSE : LERP_LID_OPEN;
  curLidClose += (tgtLidClose - curLidClose) * lidLerp;

  // 3. EYEBROWS — very slow lerp for silky movement
  curBrowRaise += (tgtBrowRaise - curBrowRaise) * LERP_BROW;

  // 4. Build expressions from interpolated values
  S = buildMouthAnim(curOpen, curWidth);
  pa = buildEyeBrowAnim(curLidClose, curBrowRaise);

  // 5. Push to renderer
  safeT();

  requestAnimationFrame(smoothUpdate);
}
```

### LERP Factors (Tuned for Natural Feel)

| Constant         | Value | Speed     | Rationale                                |
| ---------------- | ----- | --------- | ---------------------------------------- |
| `LERP_OPEN_UP`   | 0.20  | Medium    | Mouth opens at natural pace              |
| `LERP_OPEN_DOWN` | 0.42  | Fast      | Mouth closes faster than opens (natural) |
| `LERP_WIDTH`     | 0.22  | Medium    | Width changes smoothly                   |
| `LERP_LID_CLOSE` | 0.38  | Fast      | Blinks snap shut quickly                 |
| `LERP_LID_OPEN`  | 0.14  | Slow      | Lids ease open naturally                 |
| `LERP_BROW`      | 0.06  | Very slow | Silky smooth brow motion                 |

---

## Text-to-Mouth Pipeline

### `processTextToMouth(text)`

Converts AI transcript text into a sequence of mouth shapes.

```
"Hello world" → tokenize → ["Hello", " ", "world"]
                                │
                  ┌─────────────┘
                  ▼
              For each word:
              H → V_DENTAL  [0.10, 0.25]  → 60ms
              e → V_EH      [0.22, 0.35]  → 90ms
              l → V_DENTAL  [0.10, 0.25]  → 60ms
              l → V_DENTAL  [0.10, 0.25]  → 60ms
              o → V_OH      [0.28, -0.55] → 90ms   ← pursing!
              " " → close   [0.0, 0.0]    → 70ms
              w → V_W_GLIDE [0.14, -0.50] → 60ms   ← pursing!
              ...
```

### Processing Steps

1. **Tokenize**: Split text into words, whitespace, punctuation
2. **Character iteration**: Left-to-right through each word
3. **Digraph detection**: "th", "sh", "ch", "wh", "ph" → single viseme
4. **Viseme lookup**: Map character to `[jawOpen, lipWidth]`
5. **Coarticulation**: Blend 75% current + 25% next viseme
6. **Random variation**: ±10–12% on both open and width
7. **Schedule**: `setTimeout(setMouthTarget, delay)`

### Timing Rules

| Token Type            | Duration  | Notes                             |
| --------------------- | --------- | --------------------------------- |
| Vowel (a, e, i, o, u) | 90–130ms  | Held longer for clarity           |
| Consonant             | 60–90ms   | Quick shapes                      |
| Bilabial (b, m, p)    | 55–80ms   | Snap to full closure, width=-0.10 |
| Whitespace            | 70–120ms  | Full mouth closure (word gap)     |
| Period / ! / ?        | 280–400ms | Long pause (sentence boundary)    |
| Comma / ;             | 160–220ms | Medium pause                      |

---

## Viseme Table

Each viseme maps a phoneme category to `[jawOpen, lipWidth]`:

| Viseme     | jawOpen | lipWidth  | Example Sounds | Visual         |
| ---------- | ------- | --------- | -------------- | -------------- |
| V_AH       | 0.32    | +0.30     | "ah", "a"      | Wide open      |
| V_OH       | 0.28    | **-0.55** | "oh", "o"      | Rounded/pursed |
| V_OO       | 0.18    | **-0.65** | "oo", "u"      | Max purse      |
| V_EE       | 0.12    | +0.50     | "ee", "i"      | Wide spread    |
| V_EH       | 0.22    | +0.35     | "eh", "e"      | Open spread    |
| V_DENTAL   | 0.10    | +0.25     | t, d, n, l     | Slightly open  |
| V_VELAR    | 0.06    | +0.10     | k, g, ng       | Minimal        |
| V_LABIO    | 0.05    | -0.30     | f, v           | Pursed slight  |
| V_PALATAL  | 0.08    | -0.15     | sh, ch, j, zh  | Slight purse   |
| V_W_GLIDE  | 0.14    | **-0.50** | w, wh          | Strong pursing |
| V_R        | 0.10    | -0.20     | r              | Slight purse   |
| V_BILABIAL | 0.0     | -0.10     | b, m, p        | Full closure   |
| V_IDLE     | 0.02    | 0.0       | rest           | Nearly closed  |

---

## Integration with ElevenLabs

### home.jsx — React Integration

The `home.jsx` page uses the `@elevenlabs/react` SDK's `useConversation` hook to manage the AI conversation. The hook provides callbacks that drive the animation API.

```javascript
const conversation = useConversation({
  onConnect: () => {
    // AI agent connected — ensure blinking is running
    window.aiAnimStartBlink();
  },
  onDisconnect: () => {
    // Session ended — stop everything
    window.aiAnimStopSpeaking();
    window.aiAnimStopBlink();
  },
  onMessage: ({ message }) => {
    // AI transcript arrives — extract NEW text only
    const fullText = message.content;
    const oldLen = lastTranscriptRef.current.length;
    if (fullText.length > oldLen) {
      const newText = fullText.slice(oldLen);
      window.aiAnimMouthText(newText); // Drive mouth shapes
    }
    lastTranscriptRef.current = fullText;
  },
});
```

### isSpeaking Effect

```javascript
useEffect(() => {
  if (conversation.isSpeaking) {
    window.aiAnimStartSpeaking(); // Start idle mouth + loop
    lastTranscriptRef.current = ""; // Reset for fresh extraction
  } else {
    window.aiAnimStopSpeaking(); // Close mouth, keep blinks
  }
}, [conversation.isSpeaking]);
```

### Text Deduplication

ElevenLabs sends the **full accumulated transcript** in each `onMessage` callback. The `lastTranscriptRef` tracks how much text we've already processed. Only the **incremental new portion** (`fullText.slice(oldLen)`) is fed to `aiAnimMouthText()`.

---

## Lifecycle / Call Flow

```
┌─ APP LOADS ─────────────────────────────────────────────────────────┐
│  1. PhotoAnim engine initializes                                    │
│  2. User's face photo loads into 3D mesh                           │
│  3. on3dFace() fires:                                              │
│     - pa = false (no eye expression)                               │
│     - S = false  (no mouth expression)                             │
│     - T() pushes neutral face to GPU                               │
│     - setTimeout → aiAnimStartBlink() after 600ms                  │
│       └─ startAIBlink() begins blink scheduler                     │
│       └─ startBrowDrift() begins random brow movement              │
│       └─ smoothUpdate loop starts (stays running)                  │
│  Result: Face blinks and moves brows while idle                    │
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─ USER CLICKS "SPEAK" ──────────────────────────────────────────────┐
│  toggleConversation() → conversation.startSession()                │
│  onConnect callback fires → aiAnimStartBlink() (safe, redundant)   │
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─ AI STARTS SPEAKING ────────────────────────────────────────────────┐
│  isSpeaking becomes true                                           │
│  useEffect → aiAnimStartSpeaking():                                │
│    - Sets isSpeaking flag                                          │
│    - Starts idleMouth fallback (subtle random mouth movement)      │
│    - Ensures smoothUpdate loop is running                          │
│  Meanwhile, onMessage callbacks arrive with transcript:            │
│    - Incremental text extracted → aiAnimMouthText(newText)         │
│    - processTextToMouth() schedules character-by-character shapes  │
│    - idleMouth stops when real text targets arrive                 │
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─ AI STOPS SPEAKING ─────────────────────────────────────────────────┐
│  isSpeaking becomes false                                          │
│  useEffect → aiAnimStopSpeaking():                                 │
│    - Sets targets to closed: tgtOpen=0, tgtWidth=0                 │
│    - Stops idle mouth timer                                        │
│    - Clears pending mouth shape timeouts                           │
│    - Blinks + brow drift CONTINUE (face stays alive)               │
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─ USER ENDS SESSION ─────────────────────────────────────────────────┐
│  toggleConversation() → conversation.endSession()                  │
│  onDisconnect fires:                                               │
│    - aiAnimStopSpeaking() — close mouth                            │
│    - aiAnimStopBlink() — stop ALL timers (blinks, brows, loop)     │
│  Face becomes static                                               │
└────────────────────────────────────────────────────────────────────┘
```

---

## Tuning Guide

### To make blinks more/less frequent

Change the mean interval in `startAIBlink()`:

- `3.0` seconds (speaking) — decrease for more blinks
- `4.5` seconds (idle) — decrease for more blinks
- Min gap `1.8` seconds — don't go below ~1.5s or it looks twitchy

### To make eyebrows move more/less

In `driftTick()`:

- `base` (0.12 speaking, 0.06 idle) — increase for more expressive brows
- `range` (0.14 speaking, 0.08 idle) — increase for wider range
- Clamp of `±0.30` — increase if you want dramatic raises

### To make mouth open more/less

In the viseme table:

- Increase `jawOpen` values (first number) for wider jaw
- Current max is 0.32 (V_AH) — try 0.40 for more dramatic talking

### To make mouth purse more/less

In `buildMouthAnim()` pursing section:

- `0.032` (corner push) — increase for stronger pucker
- `0.022` / `0.018` (lip forward) — increase for more protrusion
- `0.008` (cheek inward) — increase for more face narrowing

### To change animation speed

LERP factors in the state section:

- Closer to `1.0` = faster (snappier, less smooth)
- Closer to `0.0` = slower (smoother, more latent)
- Sweet spot for eyes: close=0.30–0.45, open=0.10–0.18
- Sweet spot for brows: 0.04–0.08

### To change lip spread intensity

In `buildMouthAnim()` spread section, the multipliers:

- `0.85` (dx) — scales horizontal spread
- `0.55` (dy) — scales vertical component
- `0.65` (dz) — scales depth component

---

## Lessons Learned

### 1. Never swap expression objects instantly

Setting `pa = nb` then `pa = false` causes a visible flash. Always **interpolate** between states using LERP with a smooth rAF loop.

### 2. Two channels are enough

The renderer supports two expression channels (`pa` and `S`). By dynamically rebuilding them each frame from interpolated scalar values, you can express complex facial poses.

### 3. Asymmetric lerp matters

Eyes close faster than they open (0.38 vs 0.14). This matches how real blinks work — the orbicularis oculi contracts quickly but relaxes slowly.

### 4. Coarticulation is critical for natural speech

Blending 25% of the _next_ viseme into the current one prevents mouth movements from looking robotic. Without it, each phoneme looks isolated.

### 5. Word boundaries need full closure

Without closing the mouth between words (visible lip press for bilabials, full closure for whitespace), the mouth looks like it's endlessly flapping.

### 6. Mouth triangle splicing is separate from expressions

The physical mouth opening (splicing triangles at `Ha`) is a coarse on/off mechanism. Fine control comes from the expression system (`S` channel).

### 7. Text arrives incrementally from ElevenLabs

The SDK sends the full accumulated transcript each time. You must track the last-seen length and extract only the new portion to avoid replaying old mouth shapes.

### 8. Start blinking before speech

Calling `aiAnimStartBlink()` in `on3dFace()` makes the face look alive immediately, even before a conversation starts. A static face with no blinks looks dead.

### 9. Brow movement should be subtle and slow

`LERP_BROW = 0.06` is intentionally very low. Fast brow movement looks twitchy and unnatural. The slow glide gives a contemplative, human quality.

### 10. The idle mouth fallback is essential

Audio from ElevenLabs can precede the text transcript. Without the idle mouth fallback (`startIdleMouth()`), the face appears frozen while clearly speaking audio plays.
