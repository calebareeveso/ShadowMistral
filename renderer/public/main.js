// Expose common globals
window.gtype = "standard";
window.ya_touch = "ontouchstart" in window;
if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent))
  window.gtype = "touch";

window.gbrowser = (function () {
  var ua = navigator.userAgent;
  if (ua.indexOf("Edge") > -1) return "Edge";
  if (ua.indexOf("Trident") > -1 || ua.indexOf("MSIE") > -1) return "IE";
  if (ua.indexOf("Safari") > -1 && ua.indexOf("Chrome") === -1) return "Safari";
  if (ua.indexOf("Firefox") > -1) return "Firefox";
  if (ua.indexOf("Chrome") > -1) return "Chrome";
  return "";
})();

window.glogged = false;
window.guser = "";
window.onLoginDlg = function () {
  alert(
    "Login is not available in standalone mode.\nPublishing requires a backend server.",
  );
};
window.loginreload = false;

// Attach existing inline functions from HTML to window

// Browser & platform detection
var gtype = "standard";
var ya_touch = "ontouchstart" in window;
if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent))
  gtype = "touch";

var gbrowser = (function () {
  var ua = navigator.userAgent;
  if (ua.indexOf("Edge") > -1) return "Edge";
  if (ua.indexOf("Trident") > -1 || ua.indexOf("MSIE") > -1) return "IE";
  if (ua.indexOf("Safari") > -1 && ua.indexOf("Chrome") === -1) return "Safari";
  if (ua.indexOf("Firefox") > -1) return "Firefox";
  if (ua.indexOf("Chrome") > -1) return "Chrome";
  return "";
})();

// Auth stubs - not available in standalone mode
var glogged = false;
var guser = "";
function onLoginDlg() {
  alert(
    "Login is not available in standalone mode.\nPublishing requires a backend server.",
  );
}
var loginreload = false;

(function () {
  var dropzone = document.getElementById("dropzone");
  var fileInput = document.getElementById("file");

  // Click-to-upload
  dropzone.addEventListener("click", function () {
    fileInput.click();
  });

  // Drag-and-drop
  dropzone.addEventListener("dragenter", function (e) {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.add("dragover");
  });
  dropzone.addEventListener("dragover", function (e) {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.add("dragover");
  });
  dropzone.addEventListener("dragleave", function (e) {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove("dragover");
  });
  dropzone.addEventListener("drop", function (e) {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove("dragover");
    var files = e.dataTransfer.files;
    if (files && files.length > 0 && files[0].type.match(/image.*/)) {
      // Trigger the same path as the file input
      fileInput.files = files;
      var evt = new Event("change", { bubbles: true });
      fileInput.dispatchEvent(evt);
    }
  });
})();

// (c) Chris Deforeit 2017-2018
// 170214 - Initial release
// 170218 - Fixed nose area
// 170224 - Added face contour point, background luminosity = 0, transparency support
// 170403 - Fixed precision difference between browsers
// 170707 - Fixed IE and Edge compatibility problem, like always!!!
// 171106 - Special Xmas issue :)
// 171109 - Fixed audio sync
// 171120 - Eyes move follow head rotate, eyes move on by default
// 171215 - Function wrapper
// 171221 - Added manual detect
// 180103 - Added crop controls on manual detect
// 180108 - Fixed touch when scrolling
// 180601 - Fixed mouth opening in playsong + minor cosmetics
// 180924 - Fixed bug Do not allow Back if song playing
// 181212 - More red inside mouth
// 190208 - Set app = avatar in header if song playing
// 191196 - Fixed wrong user agent provided by ios13

/* ═══════════════════════════════════════════════════════════════════
 *  ARCHITECTURE OVERVIEW
 * ═══════════════════════════════════════════════════════════════════
 *
 *  This script implements a 2.5-D photo-portrait tool.  The user
 *  uploads a photo, the app auto-detects (or manually selects)
 *  71 facial landmarks, builds a deformable 3-D mesh (via WebGL),
 *  and lets the user apply expressions, eye effects, and camera
 *  animations in real time.
 *
 *  PIPELINE
 *  -------
 *  1. IMAGE LOAD   — J.onload fires when the user picks a photo.
 *  2. DETECTION     — clmtrackr finds 71 landmarks (r[]).
 *  3. MESH BUILD    — Na() deforms the base mesh (padef) to match
 *                     the detected landmarks.
 *  4. TEXTURE MAP   — Da() projects the photo onto the mesh UVs.
 *  5. WebGL RENDER  — PhotoAnim (g) renders the textured mesh.
 *  6. INTERACTION   — Expressions, eye FX, camera, song replay.
 *
 *  KEY (OBFUSCATED) VARIABLE MAP
 *  ─────────────────────────────
 *  DOM / Canvas
 *    t ............. #canvas  (image canvas element)
 *    E ............. t.getContext('2d')
 *    l ............. #ovcanvas  (overlay canvas for contour lines)
 *    p ............. l.getContext('2d')
 *    na ............ #work  (off-screen work canvas)
 *    $a ............ na.getContext('2d')
 *    Db ............ #canvas3d  (WebGL canvas)
 *    ua ............ #texcanvas  (texture source canvas)
 *    Ca ............ ua.getContext('2d')
 *    J ............. <Image> — the user's photo
 *
 *  Geometry / Model
 *    g ............. PhotoAnim instance (WebGL renderer)
 *    O ............. g.vertices  (flat Float32Array, 7 floats/vert)
 *    P ............. base vertex positions (padef[1][0] copy)
 *    L ............. keydot indices  (padef[4].keydots)
 *    sa ............ binding weights (padef[4].keybind)
 *    Ha ............ mouth triangle-start index
 *    la, U ......... eye vertex ranges
 *    Wa ............ mouth triangle sub-array
 *    wa ............ copy of initial vertices after mesh setup
 *
 *  Landmarks / Contour
 *    r ............. raw clmtrackr positions (71×[x,y])
 *    m ............. normalised landmarks (71×[x,y,z])
 *    W ............. contour-group point indices
 *    pc ............ contour-group arc-length hints
 *    qc ............ full contour-point lists
 *    yb ............ JSON-stringified landmark state
 *
 *  View / Interaction
 *    B ............. current zoom level (px)
 *    N ............. base canvas dimension (px)
 *    ba, ca ........ pan offset (x, y)
 *    Q ............. detection crop size
 *    H, I .......... cursor position (canvas coords)
 *    M ............. index of landmark being dragged (-1 = none)
 *    R ............. true when overlay is in "edit" mode
 *    G ............. true when in eye-crop mode
 *    X ............. detection rotation attempt index
 *
 *  Expressions / Effects
 *    F ............. current expression index (-1 = none)
 *    Pa ............ [gb, va, jb, lb] — expression toggle fns
 *    y ............. current "look" effect index (-1 = none)
 *    Ea ............ [$b, ac, bc, cc] — look-effect toggle fns
 *    oa ............ current eye movement mode (0 = follow)
 *    da ............ current eye-open effect index (-1 = none)
 *    pa ............ active blink animation data
 *    S ............. true when blink animation is running
 *
 *  Song / Replay
 *    w ............. true when a song/animation is playing
 *    ea ............ current song data object
 *    hc ............ expression state saved before song
 *
 *  FUNCTION REFERENCE (main helpers)
 *  ─────────────────────────────────
 *    Fb() .......... wait for padef then init geometry data
 *    Za() .......... size canvas to loaded image
 *    Gb()/Hb() ..... show detection / manual-detect phases
 *    Ka() .......... run clmtrackr auto-detection
 *    Mb() .......... process detected landmarks → normalise
 *    Ob() .......... draw smooth Bézier contour overlays
 *    bb() .......... detection failed → fall back to manual
 *    Na(flip,build)  deform base mesh to match landmarks
 *    Da() .......... generate UV texture coords from mesh
 *    fb() .......... start/resume camera rotation (play)
 *    T() ........... master refresh (recalc all anim params)
 *    ec()/fc() ..... compute per-frame animation deltas
 *    gc() .......... start song/animation replay
 *    ha(s,dx,dy) ... zoom / pan helper
 *    db() .......... redraw contour overlay at current zoom
 *    Ba(sx,sy) ..... screen → canvas coordinate transform
 *    Pb(idx,x,y) ... drag landmark point
 *    Rb(x,y) ....... find nearest landmark for dragging
 *    gb/va/jb/lb ... expression toggles (smile/surprised/sad/angry)
 *    Wb/Yb/Zb/rb ... eye toggles (blink/wink/squint/tennis)
 *    $b/ac/bc/cc ... look effects (statue/alien/toon/terminator)
 *    dc() .......... apply eye texture replacement
 *    qa(a,b) ....... compute UV bbox for vertex range [a..b)
 *    q(obj,val) .... shorthand camera property setter
 * ═══════════════════════════════════════════════════════════════════ */

var dimmer = getStyle("dimmer"),
  logindlg = getStyle("logindlg"),
  loginreload,
  newaccountdlg = getStyle("newaccountdlg"),
  lostuserdlg = getStyle("lostuserdlg"),
  publishdlg = getStyle("publishdlg");
publishflag = !1;
var popuptop, pubhandle;
(function (D) {
  /* ╔═══════════════════════════════════════════════════════════════════════╗
   * ║                 3D FACE SYSTEM — KNOWLEDGE BASE                      ║
   * ║  Comprehensive reference for the mesh, landmarks, expressions,      ║
   * ║  textures, mouth interior, and animation pipeline.                  ║
   * ╚═══════════════════════════════════════════════════════════════════════╝
   *
   * ── MESH STRUCTURE (padef) ────────────────────────────────────────────
   *
   *   padef[1][0] = vertex positions    (Float array, 7 values per vertex:
   *                                      x, y, z, trajectorySlot, nx, ny, nz)
   *   padef[1][1] = UV texcoords        (Float array, 2 values per vertex: u, v)
   *   padef[1][2] = triangle indices     (flat array of vertex indices, 3 per triangle)
   *   padef[1][3] = trajectory data      (animation interpolation curves)
   *   padef[3]    = object definitions   (objs array with center/scale/rotation per object)
   *   padef[4]    = metadata             (keydots, binding, texdark, mouthtristart, etc.)
   *
   *   There are 4 objects in the scene:
   *     Object 0 = BACKGROUND (4 vertices, a flat quad behind everything)
   *     Object 1 = FACE MESH  (vertices 4..14929, ~14,926 verts)
   *                Contains the full face surface + mouth cavity tube
   *     Object 2 = RIGHT EYE  (vertices 14930..17856, a separate 3D eyeball)
   *     Object 3 = LEFT EYE   (vertices 17857+, a separate 3D eyeball)
   *
   *   Total triangle indices: 121,014 (= 40,338 triangles)
   *   Ha = padef[4].mouthtristart = 120,996
   *   After Ha: 18 indices = 6 triangles = LIP-CLOSURE triangles
   *   These 6 lip-closure tris are saved in Wa[] and spliced in/out
   *   to open/close the mouth.
   *
   * ── COORDINATE SYSTEM ─────────────────────────────────────────────────
   *
   *   Origin (0,0,0) is at the CENTER of the face.
   *   X: left/right  (-0.5 = left edge, +0.5 = right edge)
   *   Y: up/down     (+0.5 = top, -0.5 = bottom)
   *       Mouth region:  y ≈ -0.17 to -0.33
   *       Eye region:    y ≈ -0.02 to +0.04
   *       Forehead:      y ≈ +0.10 to +0.20
   *   Z: depth         (face surface z ≈ 0.22, cavity z ≈ 0.10..0.18,
   *                     eyes behind face)
   *
   * ── TEXTURE ATLAS (512×512 canvas, id="texcanvas") ───────────────────
   *
   *   (0,0) to (480,480)   = photo face texture (drawn from uploaded photo)
   *   (480,0) to (512,128) = mouth interior image (mouth-interior.png)
   *   (508,508) 4×4 block  = transparent pixels (for invisible cavity UVs)
   *   Other right-strip areas are used for solid-color patches (texdark etc.)
   *
   *   The texture is created on a 2D canvas (Ca = ua.getContext('2d'))
   *   and uploaded to WebGL via g.updateTexture(ua).
   *
   * ── LANDMARK KEYDOTS (L[] = padef[4].keydots) ────────────────────────
   *
   *   L[i] gives the vertex index for keydot i. Keydots are the control
   *   points — moving a keydot propagates to surrounding vertices via
   *   the binding weight matrix (sa = padef[4].binding).
   *
   *   KEYDOT MAP (approximate, based on animation data analysis):
   *
   *   ┌─ FOREHEAD / EYEBROWS ────────────────────────────────────┐
   *   │  15 = left eyebrow inner       19 = right eyebrow inner │
   *   │  16 = left eyebrow mid-inner   20 = right eyebrow mid   │
   *   │  17 = left eyebrow mid-outer   21 = right eyebrow mid   │
   *   │  18 = left eyebrow outer       22 = right eyebrow outer │
   *   │  23 = left brow arch           28 = right brow arch     │
   *   └─────────────────────────────────────────────────────────┘
   *
   *   ┌─ EYES ──────────────────────────────────────────────────┐
   *   │  UPPER LIDS:  53, 56 (left), 58, 59 (right)            │
   *   │  LOWER LIDS:  54, 55 (left), 57, 60 (right)            │
   *   │  CORNERS:     24, 26 (left), 29, 31 (right)            │
   *   └─────────────────────────────────────────────────────────┘
   *
   *   ┌─ NOSE ──────────────────────────────────────────────────┐
   *   │  33 = nose tip    52 = nose bridge                     │
   *   │  41 = nose midpoint                                    │
   *   └─────────────────────────────────────────────────────────┘
   *
   *   ┌─ MOUTH ─────────────────────────────────────────────────┐
   *   │  44 = left mouth corner   (vertex 1620, y ≈ -0.216)    │
   *   │  45 = right mouth corner  (vertex 3742, y ≈ -0.216)    │
   *   │  46 = lower lip center    (vertex 2266, y ≈ -0.220)    │
   *   │  47 = lower lip left      (vertex 188,  y ≈ -0.225)    │
   *   │  48 = lower lip right     (vertex 4335, y ≈ -0.219)    │
   *   │  49 = upper lip right     (mirror of 48)               │
   *   │  50 = upper lip left      (mirror of 47)               │
   *   │  51 = upper lip center    (mirror of 46)               │
   *   └─────────────────────────────────────────────────────────┘
   *   NOTE: Keydots 46-48 use NEGATIVE binding (anim col[1] < 0)
   *   which means they are mirrored from keydots 49-51.  When the
   *   lower lip drops, the upper lip stays via this mirror trick.
   *
   *   ┌─ CHIN / JAW ────────────────────────────────────────────┐
   *   │  6  = chin left   (vertex 7572,  y ≈ -0.347)           │
   *   │  7  = chin center (vertex 7793,  y ≈ -0.369)           │
   *   │  8  = chin right  (vertex 12591, y ≈ -0.347)           │
   *   └─────────────────────────────────────────────────────────┘
   *
   *   ┌─ CHEEKS / FACE CONTOUR ─────────────────────────────────┐
   *   │  3, 4, 5 = left cheek/jaw contour                      │
   *   │  9, 10, 11 = right cheek/jaw contour                   │
   *   └─────────────────────────────────────────────────────────┘
   *
   * ── LIP-CLOSURE VERTICES ──────────────────────────────────────────────
   *
   *   The 6 lip-closure triangles use these 8 vertices:
   *   [188, 1620, 2162, 2194, 2266, 3742, 4245, 4335]
   *   All sit at y ≈ -0.21 to -0.225 (the lip line).
   *   When these triangles are spliced OUT (c.splice(Ha, ...)),
   *   the mouth "opens" — the cavity behind becomes visible.
   *   When pushed back (c.push(Wa[e])), the mouth "closes".
   *
   * ── MOUTH CAVITY MESH (~1,700 vertices) ──────────────────────────────
   *
   *   The cavity is a tube-shaped mesh BEHIND the face surface.
   *   All cavity vertices originally share the same UV texel
   *   (u=0.953, v=0.016) — a dark-red patch on the texture.
   *
   *   Cavity vertices are identified by computeMouthInterior():
   *   - Build a surface-z grid from ALL face verts
   *   - Select verts in mouth region: |x| < 0.09, -0.33 < y < -0.17
   *   - Keep only those whose z is > 0.02 behind the surface z
   *   Result: ~1,700 true cavity verts (stored in mouthInteriorVerts Set)
   *
   *   These verts have their UVs remapped to a transparent texel
   *   at (510/512, 510/512) so the shader discards them (alpha < 0.01).
   *   Fully-cavity triangles are also made degenerate.
   *
   * ── MOUTH INTERIOR RENDERING (flat quad approach) ─────────────────────
   *
   *   Instead of texturing the cavity mesh (which distorts due to its
   *   tube topology), a FLAT QUAD is drawn behind the face each frame:
   *
   *   - 4 vertices at fixed positions (x: -0.10 to 0.10, y: -0.15 to -0.28)
   *   - z = 0.12 (behind face surface z ≈ 0.22)
   *   - Textured with mouth-interior.png drawn at (480,0,32,128) on texcanvas
   *   - Uses object index 1 (face) so it rotates with the head
   *   - The face depth buffer naturally clips the quad to the mouth opening
   *   - NEVER deforms → ZERO distortion/stretching regardless of expression
   *   - Only drawn when mouth is open (g.triangles.length <= Ha)
   *
   *   The quad is drawn by drawMouthQuad() called after g.renderFrame()
   *   every frame in the Tb() animation loop.
   *
   * ── EYES (Objects 2 & 3) ──────────────────────────────────────────────
   *
   *   Each eye is a separate 3D mesh (not part of the face mesh).
   *   They are positioned BEHIND the face surface. Visible through the
   *   face mesh via WebGL depth testing — where the face mesh's eye
   *   region has sparse or thin geometry, the eye meshes show through.
   *   Right eye = object 2 (verts 14930..17856)
   *   Left eye  = object 3 (verts 17857+)
   *
   * ── EXPRESSION ANIMATIONS ─────────────────────────────────────────────
   *
   *   Each expression is an object { anim: [...], traj: [...] }.
   *
   *   anim[] format: groups of 5 values [keydotA, keydotB, dx, dy, dz]
   *     - keydotA = which keydot to move
   *     - keydotB = reference keydot (positive = own base, negative = mirror)
   *     - dx, dy, dz = offset to apply when expression is at full strength
   *
   *   traj[] = 64-element normalized curve (0→1→0) controlling the
   *   animation easing over time. Used by the PhotoAnim trajectory system.
   *
   *   EXPRESSION DATA:
   *     sc   = SMILE        — mouth corners (44,45) pull up+out, eyes squint slightly
   *     tc   = SURPRISED    — jaw drops (keydots 44-48, dy≈-0.05), eyebrows UP (15-22, dy≈+0.025-0.035)
   *                           Also splices out lip-closure tris to show open mouth.
   *     uc   = SAD          — eyebrows pull down (15-22, dy≈-0.006 to -0.013),
   *                           mouth corners droop (44,45 dy≈-0.019)
   *     vc   = ANGRY        — eyebrows pull together and down, face goes red (green/blue -0.1)
   *     talkAnim = TALK     — jaw-only subset of tc: keydots 46-48 (lower lip, dy≈-0.054),
   *                           44-45 (corners, dy≈-0.021), 6-8 (chin, dy≈-0.015).
   *                           EXCLUDES eyebrow keydots 15-22 so brows don't move during Talk.
   *     nb   = BLINK        — upper eyelid keydots (53,56,58,59) drop, lower lids (54,55,57,60) rise
   *     wc   = EYE CLOSE    — similar to blink but with mouth corner movement (keydot 44)
   *
   *   JAW-DROP OFFSETS (at full expression, from talkAnim/tc):
   *     Keydot 46 (lower lip center): dy = -0.05371  (~5.4% of face height)
   *     Keydot 47 (lower lip left):   dy = -0.05176
   *     Keydot 48 (lower lip right):  dy = -0.05566
   *     Keydot 44 (left corner):      dy = -0.02051  (corners drop half as much)
   *     Keydot 45 (right corner):     dy = -0.02246
   *     Keydot 7  (chin center):      dy = -0.02367  (chin follows jaw)
   *     Keydot 6  (chin left):        dy = -0.015
   *     Keydot 8  (chin right):       dy = -0.015
   *
   *   EYEBROW-RAISE OFFSETS (from tc, surprised):
   *     Keydot 15: dy = +0.02148     Keydot 19: dy = +0.02539
   *     Keydot 16: dy = +0.02539     Keydot 20: dy = +0.02539
   *     Keydot 17: dy = +0.03516     Keydot 21: dy = +0.03027
   *     Keydot 18: dy = +0.03516     Keydot 22: dy = +0.02441
   *
   * ── HOW MOUTH OPENS/CLOSES ────────────────────────────────────────────
   *
   *   1. Set S = talkAnim (or tc for surprised)
   *   2. Splice out lip-closure tris: g.triangles.splice(Ha, length - Ha)
   *      This reveals the hole in the face mesh where the mouth was sealed.
   *   3. Call T() — master refresh pushes trajectory offsets to all vertices
   *   4. The flat mouth-interior quad is drawn behind the face via drawMouthQuad()
   *      (only when g.triangles.length <= Ha, i.e., lips are open)
   *   5. To CLOSE: set S = false, push Wa[] tris back, call T()
   *
   *   talkingToggle() cycles open/close every 320ms for the "Talk" effect.
   *   va() does a single open for the "Surprised" expression.
   *
   * ── KEY VARIABLES QUICK REFERENCE ─────────────────────────────────────
   *
   *   g   = PhotoAnim instance (WebGL renderer)
   *   P   = base vertex positions (rest pose, never modified)
   *   O   = current animated vertex positions (rebuilt each T() call)
   *   wa  = working vertex array (modified by landmark fitting)
   *   Vb  = g.texcoord = padef[1][1] (same reference, UV array)
   *   Ca  = texcanvas 2D context (512×512)
   *   ua  = texcanvas DOM element
   *   Ha  = 120996 (mouthtristart — index into triangle array)
   *   Wa  = saved lip-closure triangle indices (18 values = 6 tris)
   *   L   = keydot → vertex index mapping
   *   sa  = binding weight matrix (5 values per vertex: 3 ref indices + 2 weights)
   *   m   = keydot positions array (m[i] = [x, y, z])
   *   S   = active expression animation data (or false if none)
   *   F   = current expression index (-1=none, 0=smile, 1=surprised, 2=sad, 3=angry, 4=talk)
   *   Pa  = [gb, va, jb, lb, talkingToggle] — expression toggle function array
   *   la  = right-eye vertex start index (14930)
   *   U   = left-eye vertex start index (17857)
   *
   * ── RENDER PIPELINE (per frame) ───────────────────────────────────────
   *
   *   Tb() — requestAnimationFrame loop:
   *     1. g.renderFrame()     — PhotoAnim updates vertices via trajectories,
   *                              applies camera rotation, uploads to GPU, draws face
   *     2. drawMouthQuad()     — draws flat mouth quad behind face (if mouth open)
   *
   *   T() — master refresh (called when expression changes):
   *     1. O = wa.slice(0)     — copy working vertices
   *     2. dc()                — calls Da() to project UVs, then eye functions,
   *                              then g.refreshTexCoord()
   *     3. Compute trajectory offsets via ec()/fc() for active expression (S)
   *     4. Push trajectories into g.trajectory[], set g.padef[1][0] = e
   *     5. g.refreshVertices(e), g.oldtime = -1, g.refresh = true
   *
   *   Da() — UV projection:
   *     For each face vertex (not in mouthInteriorVerts), project its
   *     (x,y) model position to photo UV: u = 480*(x+0.5)/512, v = 480*(0.5-y)/512
   *     Skips texdark verts and mouthInteriorVerts (which have transparent UVs).
   *
   * ══════════════════════════════════════════════════════════════════════
   */

  /* ═══════════════════════════════════════════════════════════════
   *  SECTION 1 — INITIALISATION & IMAGE LOADING
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * Fb() — Wait for the face-model definition (padef) to be loaded
   * by the external facemodel.js, then cache key geometry arrays.
   *   P  = base vertex positions (copy)
   *   Ha = triangle index where mouth geometry starts
   *   Wa = mouth-only triangles (for swapping during expression)
   *   L  = key-dot vertex indices (landmarks → vertices)
   *   sa = per-vertex binding weights
   *   la, U = right-eye / left-eye vertex start indices
   */
  function Fb() {
    if ("object" != typeof padef) window.setTimeout(Fb, 500);
    else {
      P = padef[1][0].slice(0);
      /* Ha = mouthtristart: index 120,996 into the triangle array.
       * Everything after Ha is the 6 lip-closure triangles (18 indices).
       * Wa saves a copy so we can splice them out and push them back. */
      Ha = padef[4].mouthtristart;
      Wa = padef[1][2].slice(Ha);
      /* L = keydots array: L[i] gives the vertex index for landmark i.
       * There are ~61 keydots controlling face deformation. */
      L = padef[4].keydots;
      Xa = new Float32Array(L.length);
      /* sa = binding weight matrix (5 values per vertex):
       *   [refKeydotA, refKeydotB, refKeydotC, weightA, weightB]
       * Each vertex is influenced by up to 3 keydots. */
      sa = padef[4].binding;
      /* la = right eye mesh vertex start index (14930)
       * U  = left eye mesh vertex start index (17857)
       * The eyes are separate 3D objects (objects 2 and 3) that sit
       * behind the face mesh and show through via depth testing. */
      la = padef[4].reyestart;
      U = padef[4].leyestart;
      var a = padef[1][3];
      a.length = Ya;
      for (var b = 0; b < Ya; b++) a[b] = 0;
    }
  }

  /**
   * Za() — Resize the 2-D canvas (t) and overlay (l) to fit the
   * loaded image while respecting the detection crop size Q.
   * Handles image rotation (X) for photos taken in portrait mode.
   */
  function Za() {
    var a = J.height / J.width,
      b = Q,
      c = b * a;
    c > Q && ((c = Q), (b = c / a));
    t.width = l.width = b;
    t.height = l.height = c;
    t.style.height = l.style.height = t.style.width = l.style.width = "";
    E.drawImage(J, 0, 0, b, c);
    t.style.display = "block";
    l.style.display = "block";
    X &= 3;
    0 != X &&
      ((a = t.width),
      (b = t.height),
      E.save(),
      2 == X || a == b
        ? (E.translate(a / 2, b / 2),
          E.rotate((X * ma) / 2),
          E.drawImage(t, -a / 2, -b / 2))
        : ((na.width = a),
          (na.height = b),
          $a.drawImage(t, 0, 0),
          (t.width = l.width = b),
          (t.height = l.height = a),
          E.translate(b / 2, a / 2),
          E.rotate((X * ma) / 2),
          E.drawImage(na, -a / 2, -b / 2)),
      E.restore());
  }
  /* ═══════════════════════════════════════════════════════════════
   *  SECTION 2 — FACE DETECTION & LANDMARK EDITING
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * Gb() — Toggle eye-crop / manual-landmark mode.
   * Shows/hides crop controls and sets the overlay to editable.
   */
  function Gb() {
    G = !G;
    Y = 0;
    ta = 5;
    xa.setPos(0);
    Ia.setPos(5);
    G
      ? ((getId("manualdone").disabled = !0),
        (getId("findface").disabled = !0),
        (getStyle("facem").display = "block"),
        (getStyle("contour").overflow = "visible"),
        (getStyle("facemenu").height = "164px"),
        (R = !0),
        Ia.enable(!1),
        xa.setRange(0, t.height / 2),
        xa.enable(!1),
        Hb())
      : ((getId("findface").disabled = !1),
        (getStyle("facem").display = "none"),
        (getStyle("contour").overflow = "hidden"),
        (getStyle("facemenu").height = "64px"),
        (R = !1),
        p.clearRect(0, 0, l.width, l.height));
  }
  /**
   * Hb() — Animation loop for the eye-crop overlay.
   * Draws the crop rectangle and guide boxes while in crop mode.
   */
  function Hb() {
    G &&
      (window.requestAnimationFrame(Hb),
      p.clearRect(0, 0, l.width, l.height),
      (p.strokeStyle = "green"),
      -1 != x[0] && ab(x),
      -1 != u[0] && ab(u),
      nc(),
      -1 == C[0] ||
        (Z.value && -1 != x[0] && C[0] < x[0] + 16) ||
        (!Z.value && -1 != u[0] && C[0] > u[0] - 16) ||
        ((p.strokeStyle = "red"),
        ab(C),
        (p.font = "12px Arial"),
        (p.fillStyle = "white"),
        p.fillText(Z.value ? "Right eye" : "Left eye", C[0] + 4, C[1] - 4)));
  }
  /** ab(pos) — Draw a small crosshair at the given [x,y] position. */
  function ab(a) {
    p.beginPath();
    p.moveTo(a[0] - 32, a[1]);
    p.lineTo(a[0] + 32, a[1]);
    p.moveTo(a[0], a[1] - 32);
    p.lineTo(a[0], a[1] + 32);
    p.stroke();
  }
  /**
   * nc() — Layout the manual-detect crop rectangle from the two
   * eye positions (x[], u[]) and the crop-size / position sliders.
   * Computes four corner points z[0..3] used by the mesh builder.
   */
  function nc() {
    function a(a, b, c) {
      var d = a[0],
        e = a[1];
      a[0] = d * c - e * b;
      a[1] = d * b + e * c;
    }
    if (-1 == x[0] || -1 == u[0]) return !1;
    getId("manualdone").disabled = !1;
    var b = x[0],
      c = x[1],
      e = u[0],
      d = u[1],
      f = (b + e) / 2,
      v = (c + d) / 2,
      h = Math.atan2(c - d, b - e),
      g = Math.sin(h);
    h = Math.cos(h);
    b = ta * Math.sqrt((b - e) * (b - e) + (c - d) * (c - d));
    c = [-b / 2, -b / 2];
    a(c, g, h);
    z[0] = [c[0] + f, c[1] + v + Y];
    c = [b / 2, -b / 2];
    a(c, g, h);
    z[1] = [c[0] + f, c[1] + v + Y];
    c = [-b / 2, b / 2];
    a(c, g, h);
    z[2] = [c[0] + f, c[1] + v + Y];
    c = [b / 2, b / 2];
    a(c, g, h);
    z[3] = [c[0] + f, c[1] + v + Y];
    p.strokeStyle = "white";
    p.beginPath();
    p.moveTo(z[0][0], z[0][1]);
    p.lineTo(z[1][0], z[1][1]);
    p.lineTo(z[3][0], z[3][1]);
    p.lineTo(z[2][0], z[2][1]);
    p.lineTo(z[0][0], z[0][1]);
    p.stroke();
    Ia.enable(!0);
    xa.enable(!0);
  }
  /** Ib(a) — Eye-selection radio callback; updates the label text. */
  function Ib(a) {
    a
      ? (getId("eyesel").innerHTML = "MARK RIGHT EYE PUPIL")
      : (getId("eyesel").innerHTML = "MARK LEFT EYE PUPIL");
    return !0;
  }
  /** Jb() — Commit the latest eye-pupil click (after crop mode tap). */
  function Jb() {
    (Z.value && -1 != x[0] && C[0] < x[0] + 16) ||
      (!Z.value && -1 != u[0] && C[0] > u[0] - 16) ||
      (Z.value ? ((u[0] = H), (u[1] = I)) : ((x[0] = H), (x[1] = I)),
      (C[0] = -1),
      Z.setState(1),
      Ib(1));
  }
  /** Kb() — Kick off auto-detection (transition face1 → face2). */
  function Kb() {
    Q = oc;
    getStyle("face1").display = "none";
    getStyle("face2").display = "inline";
    window.setTimeout(Ka, 100);
  }
  /** Lb() — Draw the clmtrackr live-tracking overlay while detecting. */
  function Lb() {
    fa ||
      (requestAnimationFrame(Lb),
      p.clearRect(0, 0, l.width, l.height),
      K.getCurrentPosition() && K.draw(l));
  }
  /** Ka() — Reset clmtrackr and start face detection on the image canvas. */
  function Ka() {
    fa = !1;
    Za();
    K.reset();
    K.start(t);
    Lb();
  }
  /**
   * Mb(isManual) — Process the detected (or manually placed)
   * landmarks.  Normalises the 71 points into the m[] array
   * (coords in [-0.5..0.5]), computes Z-depth from face width,
   * and transitions the UI to the contour-editing phase (face4).
   */
  function Mb(a) {
    getStyle("face2").display = "none";
    getStyle("face4").display = "inline";
    getStyle("contour").overflow = "hidden";
    getStyle("facemenu").height = "64px";
    var b =
      "standard" != gtype || ya
        ? "Double tap or pinch to zoom in/out<br>"
        : "Double click or right button drag to zoom in/out<br>";
    getId("mousehint").innerHTML = b;
    if (a) var c = La;
    else
      ((a = K.getCurrentParameters()),
        (c = ma / 2 - Math.atan((a[0] + 1) / a[1])),
        c > ma / 2 && (c -= ma));
    a = r;
    var e = a[33][0],
      d = a[33][1];
    b = a[32][0] - a[27][0];
    var f = a[32][1] - a[27][1],
      v = ta * Math.sqrt(b * b + f * f),
      h = t.width,
      g = t.height;
    b = e - v / 2;
    f = d - v / 2 + Y;
    var k = J.width / h;
    switch (X) {
      case 0:
        var n = b;
        var m = f;
        break;
      case 1:
        n = f;
        m = h - e - v / 2;
        k = J.height / h;
        break;
      case 2:
        n = h - e - v / 2;
        m = g - d - v / 2;
        break;
      case 3:
        ((n = g - d - v / 2), (m = b), (k = J.height / h));
    }
    t.width = t.height = l.width = l.height = na.width = na.height = 1024;
    p.clearRect(0, 0, 1024, 1024);
    if ("Safari" == gbrowser || "IE" == gbrowser || "Edge" == gbrowser) {
      e = J;
      n *= k;
      m *= k;
      d = v * k;
      k *= v;
      h = $a;
      var Ja = (g = 0),
        q = e.width,
        Nb = e.height;
      if (0 <= n && 0 <= m && n + d <= q && m + k <= Nb)
        h.drawImage(e, n, m, d, k, g, Ja, 1024, 1024);
      else {
        h.clearRect(g, Ja, 1024, 1024);
        var Ma = n,
          x = m,
          u = d,
          w = k,
          A = 1024 / d,
          y = 1024 / k;
        0 > m && ((x = 0), (Ja = -m * y));
        x + k > Nb && (w = Nb - x);
        0 > n && ((Ma = 0), (g = -n * A));
        Ma + d > q && (u = q - Ma);
        h.drawImage(e, Ma, x, u, w, g, Ja, u * A, w * y);
      }
    } else $a.drawImage(J, n * k, m * k, v * k, v * k, 0, 0, 1024, 1024);
    E.save();
    E.translate(512, 512);
    E.rotate((X * ma) / 2 - c);
    E.drawImage(na, -512, -512);
    E.restore();
    k = 1024 / v;
    u = Math.sin(c);
    v = Math.cos(c);
    for (e = 0; e < a.length; e++)
      ((w = (a[e][0] - b) * k),
        (c = (a[e][1] - f) * k),
        (a[e][0] = (w - 512) * v + (c - 512) * u + 512),
        (a[e][1] = -(w - 512) * u + (c - 512) * v + 512));
    a = r;
    b = [45, 46, 47, 48, 49, 51, 52, 53, 54, 55];
    for (f = b.length - 1; 0 <= f; f--) a.splice(b[f], 1);
    b = 2 * a[33][1];
    a.push([a[0][0], 0.9 * (b - a[1][1])]);
    a.push([a[3][0], b - a[3][1]]);
    a.push([a[5][0], 1.1 * (b - a[5][1])]);
    a.push([a[7][0], 1.25 * (b - a[7][1])]);
    a.push([a[9][0], 1.1 * (b - a[9][1])]);
    a.push([a[11][0], b - a[11][1]]);
    a.push([a[14][0], 0.9 * (b - a[13][1])]);
    aa = !0;
    Ob();
    za = new Uint8Array(r.length);
    a = [
      0, 7, 14, 15, 18, 19, 22, 23, 25, 28, 30, 33, 34, 40, 44, 45, 61, 64, 67,
    ];
    for (b = 0; b < a.length; b++) za[a[b]] = 1;
    R = !0;
    window.onresize();
  }
  /**
   * Ob() — Render the smooth facial-contour overlay using
   * cubic Bézier curves.  Runs in a requestAnimationFrame loop
   * and redraws only when aa (dirty flag) is set.
   * Each contour group in W[] is interpolated as a smooth spline
   * with arc-length parameterisation from pc[].
   */
  function Ob() {
    window.requestAnimationFrame(Ob);
    if (aa && R && !Aa) {
      aa = !1;
      var a = r,
        b,
        c,
        e = [];
      p.clearRect(0, 0, 1024, 1024);
      p.strokeStyle = "rgb(130,255,50)";
      p.lineWidth = 2;
      p.beginPath();
      for (b = 0; b < W.length; b++) {
        e.length = 0;
        var d = W[b];
        var f = pc[b];
        if (1 != d.length) {
          for (c = 0; c < d.length; c++) e.push([a[d[c]][0], a[d[c]][1], f[c]]);
          c = e;
          if (3 == c.length) {
            var v = [];
            var h = c[1][2];
            var g = c[2][2];
            var k = h * h;
            var n = g * g;
            var m = 1 / (h * n - g * k);
            f = c[0][0];
            var l = c[1][0];
            var q = c[2][0];
            d = c[0][1];
            var u = c[1][1];
            var t = c[2][1];
            c = -m * (l * g - q * h - f * (g - h));
            h = -m * (u * g - t * h - d * (g - h));
            q = m * (l * n - q * k - f * (n - k));
            k = m * (u * n - t * k - d * (n - k));
            for (n = 0; n <= g; n++)
              ((m = c * n * n + q * n + f),
                (u = h * n * n + k * n + d),
                v.push([m, u]));
            d = v;
          } else {
            u = [];
            for (d = 0; d < c.length - 1; d++) {
              g = c[d][0];
              var w = c[d + 1][0];
              f = c[d][1];
              t = c[d + 1][1];
              h = c[d][2];
              v = c[d + 1][2];
              if (d == c.length - 2) {
                m = v + 1;
                k = w;
                var x = t;
              } else ((m = c[d + 2][2]), (k = c[d + 2][0]), (x = c[d + 2][1]));
              if (0 == d) {
                n = h - 1;
                var y = g;
                l = f;
              } else ((n = c[d - 1][2]), (y = c[d - 1][0]), (l = c[d - 1][1]));
              n = h - n;
              q = v - h;
              m -= h;
              var A = n / q;
              var z = m / q;
              n = (1 / (2 * A)) * (g - y) + (1 / (2 * z)) * (k - w) + g - w;
              m = (1 / (2 * A)) * (f - l) + (1 / (2 * z)) * (x - t) + f - t;
              k =
                (-1 / A) * (g - y) -
                (1 / (2 * z)) * (k - w) -
                1.5 * g +
                1.5 * w;
              x =
                (-1 / A) * (f - l) -
                (1 / (2 * z)) * (x - t) -
                1.5 * f +
                1.5 * t;
              w = 0.5 * (w - g) + (1 / (2 * A)) * (g - y);
              t = 0.5 * (t - f) + (1 / (2 * A)) * (f - l);
              q = 1 / q;
              for (l = 0; l < v - h; l++)
                ((A = l * q),
                  (y = n * A * A * A + k * A * A + w * A + g),
                  (A = m * A * A * A + x * A * A + t * A + f),
                  u.push([y, A]));
              d == c.length - 2 && u.push([c[d + 1][0], c[d + 1][1]]);
            }
            d = u;
          }
          p.moveTo(d[0][0], d[0][1]);
          for (c = 1; c < d.length; c++) p.lineTo(d[c][0], d[c][1]);
          f = qc[b];
          for (c = 0; c < d.length; c += 10) a[f[c / 10]] = [d[c][0], d[c][1]];
        }
      }
      p.stroke();
      e = -3;
      f = 7;
      "standard" != gtype && ((e = -7), (f = 15));
      for (b = 0; b < W.length; b++)
        for (d = W[b], c = 0; c < d.length; c++)
          ((p.fillStyle = M == d[c] ? "white" : "red"),
            p.fillRect(a[d[c]][0] + e, a[d[c]][1] + e, f, f));
    }
  }
  /** bb() — Auto-detection failed; offer to try manual placement. */
  function bb() {
    getStyle("face2").display = "none";
    getStyle("face3").display = "inline";
  }
  /**
   * ha(scale, dx, dy) — Zoom and pan the 2-D canvas view.
   *   scale > 1 = zoom in,  scale < 1 = zoom out,  scale=1 = pan only.
   *   dx, dy = pixel drag deltas for panning.
   */
  function ha(a, b, c) {
    ba += c;
    ca += b;
    b = B;
    B *= a;
    B < N && (B = N);
    B > 5 * N && (B = 5 * N);
    ca -= (B - b) / 2;
    0 < ca && (ca = 0);
    ca + B < N && (ca = N - B);
    ba -= (B - b) / 2;
    0 < ba && (ba = 0);
    ba + B < N && (ba = N - B);
    t.style.width = l.style.width = t.style.height = l.style.height = B + "px";
    t.style.maxWidth = l.style.maxWidth = "10000px";
    t.style.top = l.style.top = ba + "px";
    t.style.left = l.style.left = ca + "px";
  }
  /**
   * Pb(idx, x, y) — Drag landmark point idx to new canvas
   * position (x, y).  Clamps to image bounds and updates both
   * the raw landmarks r[] and the normalised array m[].
   */
  function Pb(a, b, c) {
    cb = !0;
    if (Aa)
      ((m[a] = [b / 1024 - 0.5, 0.5 - c / 1024, g.vertices[7 * L[a] + 2]]),
        Na(g.vertices),
        g.refreshVertices(g.vertices));
    else {
      var e,
        d,
        f = !1;
      for (e = 0; e < W.length; e++) {
        for (d = 0; d < W[e].length; d++)
          if (W[e][d] == a) {
            f = !0;
            break;
          }
        if (f) break;
      }
      f = b - r[a][0];
      var v = c - r[a][1],
        h = d;
      e = W[e];
      var V = f,
        k = v;
      for (d = h + 1; d < e.length; d++) {
        var n = e[d];
        if (za[n]) break;
        V *= 0.75;
        k *= 0.75;
        r[n][0] += V;
        r[n][1] += k;
        db(n);
      }
      V = f;
      k = v;
      for (d = h - 1; 0 <= d; d--) {
        n = e[d];
        if (za[n]) break;
        V *= 0.75;
        k *= 0.75;
        r[n][0] += V;
        r[n][1] += k;
        db(n);
      }
      r[a] = [b, c];
      db(a);
      za[a] = 1;
      Qb(23, 25, 24, 26, 27);
      Qb(30, 28, 29, 31, 32);
    }
    aa = !0;
  }
  /**
   * db(forceRedraw) — Redraw the image + contour overlay at
   * the current zoom level B and pan offsets (ba, ca).
   */
  function db(a) {
    var b = [24, 29, 51, 50, 49],
      c = [26, 31, 46, 47, 48],
      e = r[a][0],
      d = r[a][1],
      f;
    for (f = 0; f < b.length; f++)
      if (b[f] == a) {
        f = r[c[f]];
        f[0] = e;
        f[1] < d && (f[1] = d);
        break;
      }
    for (f = 0; f < c.length; f++)
      if (c[f] == a) {
        f = r[b[f]];
        f[0] = e;
        f[1] > d && (f[1] = d);
        break;
      }
  }
  /** Qb(x,y,w,h,pts) — Hit-test a point against the bounding box of contour points. */
  function Qb(a, b, c, e, d) {
    r[d][0] = (r[a][0] + r[b][0]) / 2;
    r[d][1] = (r[c][1] + r[e][1]) / 2;
  }
  /** Rb(x,y) — Find the nearest landmark to cursor and begin dragging it. */
  function Rb(a, b) {
    if (Aa) {
      var c;
      a: {
        for (c = 0; c < m.length; c++) {
          var e = m[c][0];
          var d = m[c][1];
          e = 1024 * (e + 0.5);
          d = 1024 * (0.5 - d);
          if (3 > Math.abs(e - a) && 3 > Math.abs(d - b)) break a;
        }
        c = -1;
      }
      return c;
    }
    var f = 3;
    if ("standard" != gtype || ya) f = 16;
    for (c = 0; c < W.length; c++)
      for (d = W[c], e = 0; e < d.length; e++) {
        var g = r[d[e]][0];
        var h = r[d[e]][1];
        if (Math.abs(g - a) <= f && Math.abs(h - b) <= f) return d[e];
      }
    return -1;
  }
  /** Ba(screenX, screenY) — Convert screen coordinates to canvas coordinates accounting for zoom and pan. */
  function Ba(a, b) {
    for (
      var c = l,
        e = a - c.clientLeft - c.offsetLeft,
        d = b - c.clientTop - c.offsetTop,
        f = c.offsetParent;
      f;
    ) {
      e = e - f.offsetLeft + f.scrollLeft;
      d = d - f.offsetTop + f.scrollTop;
      if (!f.offsetParent) break;
      f = f.offsetParent;
    }
    ya || ((e += window.pageXOffset), (d += window.pageYOffset));
    c = c.width / c.clientWidth;
    e = Math.round(e * c);
    d = Math.round(d * c);
    return { x: e, y: d };
  }
  /** Sb() — Tear down the 3-D view and free the WebGL renderer. */
  function Sb() {
    var a;
    m = Array(r.length);
    for (a = 0; a < r.length; a++) {
      var b = r[a][0] / 1024 - 0.5;
      var c = 0.5 - r[a][1] / 1024;
      m[a] = [b, c];
    }
  }
  /**
   * paintMouthTexture(open) — Paint mouth interior imagery into the
   * WebGL texture atlas.  The mouth cavity’s 4 270 triangles all use
   * UVs that map to the 16×16-px patch at (480,48) on the 512×512
   * texture canvas.  We composite the teeth / tongue / throat images
   * into that same region so the 3-D mouth cavity renders them
   * automatically — just like the eyeballs are 3-D objects behind
   * the face mesh.
   *
   * ‘open’ true  → draw teeth + tongue + dark throat
   * ‘open’ false → restore original dark-red solid
   */
  var mouthImgLoaded = false;
  var mouthImg = new Image();
  mouthImg.src = "/3d/mouth/mouth-interior.png";
  var mouthUVsRemapped = false;
  var mouthTexture = null; /* dedicated GL texture for mouth quad (full-res) */

  /** createMouthTexture() — Upload mouth-interior.png as its own
   *  WebGL texture at FULL resolution (1154×868) instead of
   *  cramming it into a 32×128 strip on the 512×512 atlas.
   *  This gives ~244× more pixel detail to the mouth interior. */
  function createMouthTexture() {
    if (mouthTexture || !g || !mouthImgLoaded) return;
    var gl = g.gl;
    mouthTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, mouthTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      mouthImg,
    );
    // Restore face atlas binding
    gl.bindTexture(gl.TEXTURE_2D, g.texture);
  }

  mouthImg.onload = function () {
    mouthImgLoaded = true;
    if (g) {
      createMouthTexture();
      paintMouthRegion();
      g.updateTexture(ua);
    }
  };

  /** paintMouthRegion() — Fill the atlas mouth strip with dark red
   *  (fallback) and clear transparent block at (508,508) for cavity UVs.
   *  The mouth quad now uses its own full-res texture, so the atlas
   *  strip only matters as a fallback if mouthTexture hasn't loaded. */
  function paintMouthRegion() {
    Ca.fillStyle = "#1a0000";
    Ca.fillRect(480, 0, 32, 128);
    if (mouthImgLoaded) {
      Ca.drawImage(mouthImg, 480, 0, 32, 128);
    }
    // Transparent 4x4 block for cavity vertex UVs
    Ca.clearRect(508, 508, 4, 4);
  }

  /**
   * computeMouthInterior() — Identify mouth-interior vertices using
   * a z-buffer depth test: for each vertex in the mouth region, build
   * a surface-z map from ALL face-mesh vertices, then select only
   * those whose z is significantly BEHIND the surface at the same
   * (x,y) cell.  This correctly separates cavity verts (~2,400) from
   * surface verts that happen to share the same UV.
   */
  var mouthInteriorVerts = null;
  function computeMouthInterior() {
    if (mouthInteriorVerts) return mouthInteriorVerts;
    if (!P) return null;
    var vtx = P;
    // Build surface-z grid from ALL face-mesh vertices
    var gridRes = 0.01;
    var surfZ = {};
    for (var i = 4; i < 14930; i++) {
      var x = vtx[7 * i],
        y = vtx[7 * i + 1],
        z = vtx[7 * i + 2];
      var gx = Math.round(x / gridRes),
        gy = Math.round(y / gridRes);
      var key = gx + "," + gy;
      if (!surfZ[key] || z > surfZ[key]) surfZ[key] = z;
    }
    // Select interior vertices: tighter bounds to avoid nose/corner leaks
    var interior = new Set();
    var depthThresh = 0.02;
    for (var i = 4; i < 14930; i++) {
      var x = vtx[7 * i],
        y = vtx[7 * i + 1],
        z = vtx[7 * i + 2];
      if (Math.abs(x) > 0.09 || y < -0.33 || y > -0.17) continue;
      var gx = Math.round(x / gridRes),
        gy = Math.round(y / gridRes);
      var maxZ = surfZ[gx + "," + gy] || 0;
      if (maxZ - z > depthThresh) interior.add(i);
    }
    mouthInteriorVerts = interior;
    return interior;
  }

  /**
   * remapMouthUVs() — One-time setup:
   *  1. Map all cavity vertex UVs to a transparent texel so cavity
   *     mesh becomes invisible (shader discards alpha<0.01 fragments).
   *  2. Make fully-cavity triangles degenerate (zero area → not drawn).
   *  3. Init the flat mouth-interior quad GL buffers.
   */
  var mouthQuadReady = false;
  var mouthQuadVB, mouthQuadTB, mouthQuadOB, mouthQuadIB;
  function remapMouthUVs() {
    if (mouthUVsRemapped || !g || !P) return;
    var ids = computeMouthInterior();
    if (!ids || ids.size === 0) return;
    mouthUVsRemapped = true;

    // 1. Map all cavity vertex UVs to transparent texel at (510/512, 510/512)
    var texc = g.texcoord;
    var transU = 510 / 512,
      transV = 510 / 512;
    ids.forEach(function (vi) {
      texc[2 * vi] = transU;
      texc[2 * vi + 1] = transV;
    });
    g.updateTexcoord(texc);

    // 2. Make fully-cavity triangles degenerate
    var tris = g.triangles;
    for (var i = 0; i < Ha; i += 3) {
      if (ids.has(tris[i]) && ids.has(tris[i + 1]) && ids.has(tris[i + 2])) {
        tris[i] = tris[i + 1] = tris[i + 2] = 4; // degenerate
      }
    }
    g.updateTriangles(tris);

    // 3. Init the mouth-interior quad
    initMouthQuad();
  }

  /**
   * initMouthQuad() — Create GL buffers for a flat textured quad
   * positioned behind the face at the mouth opening.  Uses the same
   * shader as the face (object index 1) so it rotates with the head.
   * The quad never deforms → zero distortion.
   */
  function initMouthQuad() {
    if (mouthQuadReady) return;
    var gl = g.gl;

    // Quad corners in model space (behind face surface at z≈0.22)
    // Covers the full mouth opening area including jaw-drop
    var x0 = -0.09,
      x1 = 0.11;
    var y0 = -0.15,
      y1 = -0.3;
    var z = 0.12;
    // Normal facing camera
    var nx = 0,
      ny = 0,
      nz = 1;

    // Vertex buffer: 4 verts × 7 floats [x,y,z, traj=0, nx,ny,nz]
    var verts = new Float32Array([
      x0,
      y0,
      z,
      0,
      nx,
      ny,
      nz, // top-left
      x1,
      y0,
      z,
      0,
      nx,
      ny,
      nz, // top-right
      x0,
      y1,
      z,
      0,
      nx,
      ny,
      nz, // bottom-left
      x1,
      y1,
      z,
      0,
      nx,
      ny,
      nz, // bottom-right
    ]);
    mouthQuadVB = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, mouthQuadVB);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

    // Texcoord buffer: UVs covering full mouth texture (0,0)→(1,1)
    // The quad now uses its own dedicated GL texture at full resolution
    // instead of the 32×128 strip on the 512×512 atlas.
    var tcs = new Float32Array([
      0,
      0, // top-left
      1,
      0, // top-right
      0,
      1, // bottom-left
      1,
      1, // bottom-right
    ]);
    mouthQuadTB = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, mouthQuadTB);
    gl.bufferData(gl.ARRAY_BUFFER, tcs, gl.STATIC_DRAW);

    // Object buffer: all verts belong to object 1 (face)
    var objs = new Float32Array([1, 1, 1, 1]);
    mouthQuadOB = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, mouthQuadOB);
    gl.bufferData(gl.ARRAY_BUFFER, objs, gl.STATIC_DRAW);

    // Index buffer: 2 triangles
    var indices = new Uint16Array([0, 2, 1, 1, 2, 3]);
    mouthQuadIB = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mouthQuadIB);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    // Restore the face element buffer binding
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g._elemBuf);

    mouthQuadReady = true;
  }

  /**
   * drawMouthQuad() — Draw the flat mouth-interior quad using the
   * same shader and camera state as the face.  Called after renderFrame()
   * each frame.  Only draws when the mouth is open (lip-closure tris
   * have been spliced out).
   */
  function drawMouthQuad() {
    if (!mouthQuadReady || !g) return;
    // Only draw when mouth is open (lip-closure tris removed)
    if (g.triangles.length > Ha) return;
    var gl = g.gl;
    var prog = g.prog;

    // Bind the dedicated full-resolution mouth texture
    // (instead of the 512×512 face atlas where it was only 32×128 px)
    if (mouthTexture) {
      gl.bindTexture(gl.TEXTURE_2D, mouthTexture);
    }

    // Bind quad vertex buffer (position + normal, stride=28)
    var posloc = gl.getAttribLocation(prog, "aPos");
    var normloc = gl.getAttribLocation(prog, "aNorm");
    gl.bindBuffer(gl.ARRAY_BUFFER, mouthQuadVB);
    gl.vertexAttribPointer(posloc, 3, gl.FLOAT, false, 28, 0);
    gl.vertexAttribPointer(normloc, 3, gl.FLOAT, false, 28, 16);

    // Bind quad texcoord buffer
    var texloc = gl.getAttribLocation(prog, "aTexCoord");
    gl.bindBuffer(gl.ARRAY_BUFFER, mouthQuadTB);
    gl.vertexAttribPointer(texloc, 2, gl.FLOAT, false, 8, 0);

    // Bind quad object buffer
    var objloc = gl.getAttribLocation(prog, "aObj");
    gl.bindBuffer(gl.ARRAY_BUFFER, mouthQuadOB);
    gl.vertexAttribPointer(objloc, 1, gl.FLOAT, false, 4, 0);

    // Bind quad index buffer and draw
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mouthQuadIB);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

    // Restore the face atlas texture binding
    gl.bindTexture(gl.TEXTURE_2D, g.texture);

    // Restore face buffer bindings for next frame's renderFrame()
    gl.bindBuffer(gl.ARRAY_BUFFER, g.vertexbuffer);
    gl.vertexAttribPointer(posloc, 3, gl.FLOAT, false, 28, 0);
    gl.vertexAttribPointer(normloc, 3, gl.FLOAT, false, 28, 16);
    if (g._texBuf) {
      gl.bindBuffer(gl.ARRAY_BUFFER, g._texBuf);
      gl.vertexAttribPointer(texloc, 2, gl.FLOAT, false, 8, 0);
    }
    if (g._objBuf) {
      gl.bindBuffer(gl.ARRAY_BUFFER, g._objBuf);
      gl.vertexAttribPointer(objloc, 1, gl.FLOAT, false, 4, 0);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g._elemBuf);
  }

  /** rc() — WebGL texture-ready callback; uploads the photo as GL texture. */
  function rc() {
    Ca.drawImage(g.image, 0, 0);
    Ca.clearRect(0, 0, 480, 480);
    Ca.drawImage(t, 0, 0, t.width, t.height, 0, 0, 480, 480);
    paintMouthRegion();
    g.updateTexture(ua);
    createMouthTexture(); /* ensure full-res mouth texture is created once g exists */
    remapMouthUVs();
  }
  /**
   * Tb() — Main requestAnimationFrame loop for the 3-D view.
   * Calls PhotoAnim.render() each frame and handles expression
   * animation (blink, eye movement, look effects) via ec()/fc().
   */
  function Tb() {
    if (void 0 != g) {
      var a = g.main.replay,
        b = getId("audio");
      a &&
        a.audio &&
        !b.paused &&
        ((b = b.currentTime),
        a.offset && (b += a.offset),
        (b /= a.duration),
        1 >= b && (a.time = b));
      g.renderFrame();
      drawMouthQuad();
      if (Aa && aa) {
        aa = !1;
        p.clearRect(0, 0, t.width, t.height);
        p.strokeStyle = "blue";
        p.lineWidth = 1;
        p.beginPath();
        var c = g.triangles,
          e = c.length / 3;
        for (a = 0; a < e; a++) {
          b = c[3 * a];
          var d = c[3 * a + 1];
          var f = c[3 * a + 2];
          4 > b || b >= la || (eb(b, d), eb(d, f), eb(f, b));
        }
        p.stroke();
        p.fillStyle = "red";
        for (a = 0; a < m.length; a++)
          ((b = m[a][0]),
            (d = m[a][1]),
            (b = 1024 * (b + 0.5)),
            (d = 1024 * (0.5 - d)),
            p.fillRect(b - 2, d - 2, 5, 5));
        p.fillStyle = "white";
        -1 != M &&
          ((b = m[M][0]),
          (d = m[M][1]),
          p.fillRect(1024 * (b + 0.5) - 2, 1024 * (0.5 - d) - 2, 5, 5));
      }
      window.requestAnimationFrame(Tb);
    }
  }
  /* ═══════════════════════════════════════════════════════════════
   *  SECTION 3 — 3-D MESH CONSTRUCTION & TEXTURE
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * Na(doFlip, rebuild) — Deform the base mesh so that each key-dot
   * vertex aligns with its corresponding detected landmark.  Uses the
   * binding-weight matrix (sa) to smoothly propagate landmark offsets
   * to all surrounding vertices.  If `doFlip` is true the mesh is
   * mirrored on the X axis (for rotated faces).
   */
  function Na(a, b) {
    a || (a = O);
    var c = m,
      e = a.length / 7,
      d = new Uint8Array(e),
      f = new Float32Array(3 * e),
      g;
    b && ((m[33][2] *= 0.95), (m[41][2] = (m[33][2] + m[52][2]) / 2));
    for (g = 0; g < c.length; g++) {
      var h = c[g][0];
      var V = c[g][1];
      var k = c[g][2];
      var n = L[g];
      d[n] = 1;
      var l = h - a[7 * n];
      var q = V - a[7 * n + 1];
      var r = k - a[7 * n + 2];
      f[3 * n] = l;
      f[3 * n + 1] = q;
      f[3 * n + 2] = r;
      a[7 * n] = h;
      a[7 * n + 1] = V;
      a[7 * n + 2] = k;
    }
    for (g = c.length; g < L.length; g++) d[L[g]] = 1;
    for (g = 4; g < e; g++)
      if (!d[g]) {
        l = sa[5 * g];
        var p = sa[5 * g + 1];
        k = sa[5 * g + 2];
        c = sa[5 * g + 3];
        n = sa[5 * g + 4];
        h = f[3 * l];
        V = f[3 * l + 1];
        r = f[3 * l + 2];
        l = f[3 * p];
        q = f[3 * p + 1];
        var t = f[3 * p + 2];
        p = f[3 * k];
        var u = f[3 * k + 1];
        k = f[3 * k + 2];
        a[7 * g] += h * (1 - c - n) + l * c + p * n;
        a[7 * g + 1] += V * (1 - c - n) + q * c + u * n;
        a[7 * g + 2] += r * (1 - c - n) + t * c + k * n;
      }
    e = padef[3].objs;
    Ub(e[2], la, U);
    Ub(e[3], U, O.length / 7);
  }
  /**
   * Ub(base, eyeStart, eyeCount) — Build extra geometry for the
   * eye regions (duplicate verts + inner mouth triangles).
   */
  function Ub(a, b, c) {
    var e = 100,
      d = -100,
      f = 100,
      g = -100,
      h = 100,
      m = -100,
      k,
      n = O;
    for (k = b; k < c; k++) {
      b = n[7 * k];
      var l = n[7 * k + 1];
      var p = n[7 * k + 2];
      b < e && (e = b);
      b > d && (d = b);
      l < f && (f = l);
      l > g && (g = l);
      p < h && (h = p);
      p > m && (m = p);
    }
    a.center[0] = (e + d) / 2;
    a.center[1] = (f + g) / 2;
    a.center[2] = (h + m) / 2;
  }
  /**
   * Da() — Generate UV texture coordinates by projecting the
   * deformed mesh back onto the 2-D photo.  Each vertex (x,y) in
   * model space maps to a pixel in the original photo, which is then
   * drawn onto the texcanvas for WebGL upload.
   */
  function Da() {
    var a = O,
      b = Vb,
      c = padef[4].texdark[0],
      e = padef[4].texdark[1],
      d = a.length / 7,
      f;
    var mouthSet = mouthInteriorVerts;
    for (f = 0; f < d; f++) {
      if (mouthSet && mouthSet.has(f))
        continue; // preserve fixed UVs
      else if (b[2 * f] != c || b[2 * f + 1] != e) {
        b[2 * f] = (480 * (a[7 * f] + 0.5)) / 512;
        b[2 * f + 1] = (480 * (0.5 - a[7 * f + 1])) / 512;
      }
    }
  }
  /** fb() — Start (or resume) camera auto-rotation / idle animation. */
  function fb() {
    if (!w) {
      getStyle("play").display = "none";
      getStyle("pause").display = "inline";
      var a = g.global.camera;
      a.yrot.speed = 10;
      a.yrot.min = -20;
      a.yrot.max = 20;
      a.xrot.speed = 2;
      a.xrot.min = -20;
      a.xrot.max = 20;
    }
  }
  /** Oa() — Reset camera rotation limits and speed after user interaction. */
  function Oa() {
    var a = g.objects[1];
    1 != y && (q(a.red, 0), q(a.green, 0), q(a.blue, 0));
  }
  /* ═══════════════════════════════════════════════════════════════
   *  SECTION 4 — EXPRESSION & EYE EFFECT TOGGLES
   *  Each toggle function is wired to a toolbar Button. When
   *  activated, the function writes per-vertex trajectory offsets
   *  into g.vertices[7*i+3] and calls T() to refresh.
   *
   *  Expression index F: -1=none, 0=smile, 1=surprised, 2=sad, 3=angry, 4=talk
   *  Pa[F] = toggle function: [gb, va, jb, lb, talkingToggle]
   *
   *  gb(on) → SMILE:      S = sc.  Mouth corners pull outward+up.
   *                       Does NOT open the mouth (no tri splice).
   *  va(on) → SURPRISED:  S = tc.  Jaw drops wide + eyebrows raise.
   *                       OPENS mouth: splices out lip-closure tris.
   *  jb(on) → SAD:        S = uc.  Eyebrows droop + corners down.
   *                       Does NOT open the mouth.
   *  lb(on) → ANGRY:      S = vc.  Eyebrows pull together+down, face reddens.
   *                       Does NOT open the mouth.
   *  talkingToggle(on) →  S = talkAnim. Jaw-only, no eyebrows.
   *                       OPENS mouth: splices tris, cycles open/close at 320ms.
   *
   *  Only Surprised and Talk actually OPEN the mouth (splice lip-closure tris).
   *  Smile, Sad, Angry only deform the face surface.
   * ═══════════════════════════════════════════════════════════════ */

  /** gb(on) — Toggle SMILE expression. */
  function gb(a) {
    if (w) hb.force(!1);
    else {
      if (a && -1 != F) Pa[F](!1);
      F = a ? 0 : -1;
      hb.force(a);
      S = a ? sc : !1;
      T();
    }
  }
  /** va(on, silent) — Toggle SURPRISED expression (open mouth + raised brows). */
  function va(a, b) {
    if (w) ib.force(!1);
    else {
      if (a && -1 != F) Pa[F](!1);
      F = a ? 1 : -1;
      b || ib.force(a);
      S = a ? tc : !1;
      var c = g.triangles;
      if (a) c.splice(Ha, c.length - Ha);
      else for (var e = 0; e < Wa.length; e++) c.push(Wa[e]);
      T();
      b || -1 != y || q(g.global.light.shading, a ? 0.2 : 0.05);
    }
  }
  /** talkingToggle(on) — Toggle TALKING expression (mouth opens and closes repeatedly). */
  var talkingInterval = null;
  function talkingToggle(a) {
    if (w) {
      talkingBtn.force(!1);
      return;
    }
    if (a && -1 != F) Pa[F](!1);
    F = a ? 4 : -1;
    talkingBtn.force(a);
    if (a) {
      // Open mouth — use jaw-only deformation (no eyebrows)
      S = talkAnim;
      var c = g.triangles;
      c.splice(Ha, c.length - Ha);
      T();
      var mouthOpen = true;
      talkingInterval = setInterval(function () {
        if (!g) {
          clearInterval(talkingInterval);
          talkingInterval = null;
          return;
        }
        var c = g.triangles;
        if (mouthOpen) {
          // Close mouth
          S = !1;
          for (var e = 0; e < Wa.length; e++) c.push(Wa[e]);
          mouthOpen = false;
        } else {
          // Open mouth
          S = talkAnim;
          c.splice(Ha, c.length - Ha);
          mouthOpen = true;
        }
        T();
      }, 320);
    } else {
      // Stop talking
      if (talkingInterval) {
        clearInterval(talkingInterval);
        talkingInterval = null;
      }
      S = !1;
      var c = g.triangles;
      if (c.length <= Ha) {
        for (var e = 0; e < Wa.length; e++) c.push(Wa[e]);
      }
      T();
    }
  }
  /** jb(on) — Toggle SAD expression. */
  function jb(a) {
    if (w) kb.force(!1);
    else {
      if (a && -1 != F) Pa[F](!1);
      F = a ? 2 : -1;
      kb.force(a);
      S = a ? uc : !1;
      T();
    }
  }
  /** lb(on) — Toggle ANGRY expression. */
  function lb(a) {
    if (w) mb.force(!1);
    else {
      if (a && -1 != F) Pa[F](!1);
      F = a ? 3 : -1;
      mb.force(a);
      S = a ? vc : !1;
      T();
      if (-1 == y) {
        var b = g.objects[1];
        q(b.red, 0);
        q(b.green, a ? -0.1 : 0);
        q(b.blue, a ? -0.1 : 0);
      }
    }
  }
  /** Wb(on) — Toggle BLINK animation (both eyes close). */
  function Wb(a) {
    if (w) Qa.force(!a);
    else {
      if (a && -1 != oa) Xb[oa](!1);
      oa = a ? 0 : -1;
      Qa.force(a);
      pa = a ? nb : !1;
      T();
    }
  }
  /** Yb(on) — Toggle WINK animation (one eye closes). */
  function Yb(a) {
    if (w) ob.force(!a);
    else {
      if (a && -1 != oa) Xb[oa](!1);
      oa = a ? 1 : -1;
      ob.force(a);
      pa = a ? wc : !1;
      T();
    }
  }
  /** Zb(on) — Toggle SQUINT eye movement (narrow eyes). */
  function Zb(a) {
    if (w) pb.force(!a);
    else {
      if (a && -1 != da) qb[da](!1);
      da = a ? 0 : -1;
      pb.force(a);
      var b = g.objects[2].yrot,
        c = g.objects[3].yrot;
      b.min = -20;
      b.max = 0;
      c.min = 0;
      c.max = 20;
      b.speed = a ? -20 : 0;
      c.speed = a ? 20 : 0;
      q(b, 0);
      q(c, 0);
    }
  }
  /** rb(on) — Toggle TENNIS-BALL eye tracking animation. */
  function rb(a) {
    if (w) sb.force(!a);
    else {
      if (a && -1 != da) qb[da](!1);
      da = a ? 1 : -1;
      sb.force(a);
      var b = g.objects[2].yrot,
        c = g.objects[3].yrot;
      b.min = -20;
      b.max = 20;
      c.min = -20;
      c.max = 20;
      b.speed = a ? 30 : 0;
      c.speed = a ? 30 : 0;
      q(b, 0);
      q(c, 0);
      b.sync = a ? (c.sync = "yrot") : (c.sync = !1);
    }
  }
  /** $b(on) — Toggle STATUE look effect (stone-like shading). */
  function $b(a) {
    if (w) tb.force(!a);
    else {
      if (a && -1 != y) Ea[y](!1);
      y = a ? 0 : -1;
      tb.force(a);
      ub(a ? 0 : 2);
      q(g.global.light.shading, a ? 0.8 : 0.05);
      q(g.global.light.specular, a ? 0.8 : 0);
      a && Oa();
    }
  }
  /** ac(on) — Toggle ALIEN look effect (texture colour shift). */
  function ac(a) {
    if (w) vb.force(!a);
    else {
      if (a && -1 != y) Ea[y](!1);
      y = a ? 1 : -1;
      vb.force(a);
      a ? (qa(la, U), qa(U, g.vertices.length / 7)) : Da();
      g.refreshTexCoord();
      var b = g.objects[2].brightness,
        c = g.objects[3].brightness;
      q(b, a ? -0.5 : 0);
      q(c, a ? -0.5 : 0);
      b.min = c.min = -0.5;
      b.max = c.max = a ? -0.2 : 0;
      b.speed = c.speed = a ? 0.5 : 0;
      b = g.objects[2].hue;
      c = g.objects[3].hue;
      q(b, a ? -0.5 : 0);
      q(c, a ? -0.5 : 0);
      b.min = c.min = -0.5;
      b.max = c.max = 0.5;
      b.speed = c.speed = a ? 1 : 0;
      b = g.objects[1];
      c = g.objects[0];
      q(b.red, a ? -0.1 : 0);
      b.red.min = -1;
      q(c.red, a ? -0.1 : 0);
      T();
      a && Oa();
    }
  }
  /** bc(on) — Toggle TOON look effect (posterised cel-shading). */
  function bc(a) {
    if (w) wb.force(!a);
    else {
      if (a && -1 != y) Ea[y](!1);
      y = a ? 2 : -1;
      wb.force(a);
      a ? (qa(la, U), qa(U, g.vertices.length / 7)) : Da();
      g.refreshTexCoord();
      var b = g.objects[2].zmov,
        c = g.objects[3].zmov;
      b.min = c.min = -0.02;
      b.max = c.max = 0.15;
      b.speed = c.speed = 0;
      var e = g.objects[3].brightness;
      q(g.objects[2].brightness, a ? -0.25 : 0);
      q(e, a ? -0.25 : 0);
      q(g.global.light.shading, a ? 0.3 : 0.05);
      q(g.global.light.specular, a ? 0.3 : 0);
      ub(a ? 0 : 2);
      T();
      a
        ? (b.trajx = c.trajx = Ra)
        : (q(b, 0), q(c, 0), delete b.trajx, delete c.trajx);
      a && Oa();
    }
  }
  /** cc(on) — Toggle TERMINATOR look effect (metallic red-eye). */
  function cc(a) {
    if (w) xb.force(!a);
    else {
      if (a && -1 != y) Ea[y](!1);
      y = a ? 3 : -1;
      xb.force(a);
      a ? qa(la, U) : Da();
      g.refreshTexCoord();
      q(g.global.light.shading, a ? 0.8 : 0.05);
      q(g.global.light.specular, a ? 0.8 : 0);
      var b = g.objects[2].zmov;
      b.min = 0;
      b.max = 0.04;
      b.speed = a ? 0.01 : 0;
      q(b, 0);
      b = g.objects[2];
      q(b.contrast, a ? 0.8 : 0);
      q(b.hue, a ? 0.75 : 0);
      q(b.brightness, a ? -0.3 : 0);
      ub(a ? 5 : 2);
      T();
      a && Oa();
    }
  }
  /** dc() — Apply the current eye-texture replacement for the active look effect. */
  function dc() {
    Da();
    1 <= y && qa(la, U);
    (1 != y && 2 != y) || qa(U, g.vertices.length / 7);
    g.refreshTexCoord();
  }
  /* ═══════════════════════════════════════════════════════════════
   *  SECTION 5 — MASTER REFRESH & ANIMATION ENGINE
   *  T() is the central "apply all" function.  ec()/fc() compute
   *  per-frame deltas for expressions and blink/eye effects.
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * T() — Master refresh / render pipeline.
   *
   * THIS IS THE SINGLE BOTTLENECK THAT PUSHES EVERYTHING TO THE GPU.
   * Called by smoothUpdate() ~60 times/sec during animation.
   *
   * What it does:
   * 1. Copies base vertex positions: O = wa.slice(0)
   * 2. Resets g.trajectory to length Ya
   * 3. If pa (eye/brow channel) is set:
   *    - Applies keydot displacements via ec(pa, e)
   *    - Computes per-vertex deltas via fc(e, b)
   *    - Writes pa.traj[] into g.trajectory[] at offset Fa
   * 4. If S (mouth channel) is set:
   *    - Applies keydot displacements via ec(S, e)
   *    - Computes per-vertex deltas via fc(e, c)
   *    - Writes S.traj[] into g.trajectory[] at offset ia
   * 5. Blends b[] and c[] into final vertex offsets
   * 6. Calls g.refreshVertices() to upload to WebGL
   *
   * Variables:
   *   O, wa = vertex position arrays (7 floats per vertex: x,y,z + normals + uv)
   *   Fa = trajectory array offset for pa (eye/brow) channel
   *   ia = trajectory array offset for S (mouth) channel
   *   ec() = applies expression anim keydot offsets to vertex array
   *   fc() = converts keydot offsets to per-vertex float deltas
   *   m = JSON.parse(yb) = keydot binding weights
   *
   * IMPORTANT: pa and S are the ONLY two expression channels.
   * The AI animation system builds these dynamically each frame:
   *   pa = buildEyeBrowAnim(curLidClose, curBrowRaise)
   *   S  = buildMouthAnim(curOpen, curWidth)
   */
  function T() {
    O = wa.slice(0);
    g.trajectory.length = Ya;
    g.refreshVertices(O);
    dc();
    var a = wa.length / 7,
      b = new Float32Array(3 * a),
      c = new Float32Array(3 * a);
    var e = wa.slice(0);
    pa && ((O = wa.slice(0)), (m = JSON.parse(yb)), ec(pa, e), fc(e, b));
    if (S) {
      O = wa.slice(0);
      m = JSON.parse(yb);
      if (S) {
        var d = S.anim;
        var f;
        var v = !1;
        for (f = 0; f < d.length / 5; f++) {
          var h = d[5 * f + 1];
          0 <= h ||
            ((h = -h),
            (v = d[5 * f]),
            (m[h][0] = m[v][0]),
            (m[h][1] = m[v][1]),
            (m[h][2] = m[v][2]),
            (v = !0));
        }
        v ? (Na(!1, !0), dc(), (d = !0)) : (d = !1);
      } else d = void 0;
      d && (e = O.slice(0));
      ec(S, e);
      fc(e, c);
    }
    d = g.trajectory;
    if (pa)
      for (h = pa.traj, d[Fa] = h.length, f = 0; f < h.length; f++)
        d[Fa + f + 1] = h[f];
    if (S) {
      h = S.traj;
      d[ia] = h.length;
      for (f = 0; f < h.length; f++) d[ia + f + 1] = h[f];
      zb[0] = h.length;
      zb[1] = h[0];
      zb[2] = h[1];
      xc || ((d[ia] = 2), (d[ia + 1] = 1), (d[ia + 2] = 1));
    }
    for (f = 4; f < a; f++) {
      h = b[3 * f];
      var l = b[3 * f + 1];
      var k = b[3 * f + 2];
      v = c[3 * f];
      var n = c[3 * f + 1];
      var p = c[3 * f + 2];
      if (0 != h || 0 != l || 0 != k || 0 != v || 0 != n || 0 != p)
        ((e[7 * f + 3] = d.length),
          0 == h && 0 == l && 0 == k
            ? (d.push(-1), d.push(ia), d.push(v), d.push(n), d.push(p))
            : 0 == v && 0 == n && 0 == p
              ? (d.push(-1), d.push(Fa), d.push(h), d.push(l), d.push(k))
              : (d.push(-2),
                d.push(Fa),
                d.push(h),
                d.push(l),
                d.push(k),
                d.push(ia),
                d.push(v),
                d.push(n),
                d.push(p)));
    }
    g.padef[1][0] = e;
    g.refreshVertices(e);
    g.oldtime = -1;
    e = g.main.main;
    e.value = 0;
    e.reverse = !1;
    g.refresh = !0;
  }
  /**
   * ec(animData, traj) — Compute the per-vertex animation delta
   * for one animation channel.  Reads the anim[] keyframes and
   * traj[] curve, then writes offset values into g.vertices[7*i+3]
   * (the trajectory slot).
   */
  function ec(a, b) {
    var c = a.anim,
      e;
    for (e = 0; e < c.length / 5; e++) {
      var d = c[5 * e];
      var f = L[d];
      var g = c[5 * e + 1];
      if (0 > g)
        ((g = m[44][1]),
          (m[d][0] += c[5 * e + 2]),
          (m[d][1] = g + Xa[d] + c[5 * e + 3]),
          (m[d][2] += c[5 * e + 4]));
      else if (g == d)
        ((m[d][0] += c[5 * e + 2]),
          (m[d][1] += c[5 * e + 3]),
          (m[d][2] += c[5 * e + 4]));
      else {
        var h = L[g];
        var l = P[7 * f] - P[7 * h];
        var k = P[7 * f + 1] - P[7 * h + 1];
        g = P[7 * f + 2] - P[7 * h + 2];
        var n = b[7 * f] - b[7 * h];
        var p = b[7 * f + 1] - b[7 * h + 1];
        f = b[7 * f + 2] - b[7 * h + 2];
        l =
          0.001 > Math.abs(l) || !((0 <= l && 0 <= n) || (0 > l && 0 > n))
            ? 1
            : n / l;
        k =
          0.001 > Math.abs(k) || !((0 <= k && 0 <= p) || (0 > k && 0 > p))
            ? 1
            : p / k;
        g =
          0.001 > Math.abs(g) || !((0 <= g && 0 <= f) || (0 > g && 0 > f))
            ? 1
            : f / g;
        m[d][0] += c[5 * e + 2] * l;
        m[d][1] += c[5 * e + 3] * k;
        m[d][2] += c[5 * e + 4] * g;
      }
    }
    Na(!1, !0);
  }
  /**
   * fc(animData, traj) — Alternate per-frame delta calculator
   * used for head-direction-based animations (eye following, etc.).
   */
  function fc(a, b) {
    var c = O,
      e,
      d = c.length / 7;
    for (e = 4; e < d; e++)
      if (
        !(
          1e-4 > Math.abs(c[7 * e] - a[7 * e]) &&
          1e-4 > Math.abs(c[7 * e + 1] - a[7 * e + 1]) &&
          1e-4 > Math.abs(c[7 * e + 2] - a[7 * e + 2])
        )
      ) {
        var f = c[7 * e] - a[7 * e];
        var g = c[7 * e + 1] - a[7 * e + 1];
        var h = c[7 * e + 2] - a[7 * e + 2];
        b[3 * e] = f;
        b[3 * e + 1] = g;
        b[3 * e + 2] = h;
      }
  }
  /**
   * qa(startVert, endVert) — Recompute UV bounding-box for a
   * range of vertices and remap their texture coordinates into
   * the [0..1] range.  Used after eye-texture replacement.
   */
  function qa(a, b) {
    var c = 100,
      e = -100,
      d = 100,
      f = -100,
      m = g.vertices,
      h;
    for (h = a; h < b; h++) {
      var l = m[7 * h];
      var k = -m[7 * h + 1];
      l < c && (c = l);
      l > e && (e = l);
      k < d && (d = k);
      k > f && (f = k);
    }
    e = 1 / (e - c);
    c *= -e;
    f = 1 / (f - d);
    d *= -f;
    var n = g.texcoord;
    for (h = a; h < b; h++)
      ((l = m[7 * h]),
        (k = -m[7 * h + 1]),
        (l = e * l + c),
        (k = f * k + d),
        (l *= 0.0625),
        (k = 0.0625 * k + 0.9375),
        (n[2 * h] = l),
        (n[2 * h + 1] = k));
  }
  /** eb(a,b) — Draw a wireframe edge between vertex a and vertex b. */
  function eb(a, b) {
    var c = g.vertices,
      e = g.texcoord,
      d = padef[4].texdark[0];
    if (e[2 * a] != d && e[2 * b] != d) {
      e = c[7 * a];
      d = c[7 * a + 1];
      var f = c[7 * b];
      c = c[7 * b + 1];
      f = 1024 * (f + 0.5);
      c = 1024 * (0.5 - c);
      p.moveTo(1024 * (e + 0.5), 1024 * (0.5 - d));
      p.lineTo(f, c);
    }
  }
  /** ub(idx) — Set the scene light direction from a predefined list. */
  function ub(a) {
    g.global.light.vector = [
      [0.408, -0.408, 0.816],
      [-0.408, -0.408, 0.816],
      [0, 0, 1],
      [0.408, 0.408, 0.816],
      [-0.408, 0.408, 0.816],
      [0, 0.6, 0.8],
    ][a];
    g.updateLight();
    g.refresh = !0;
  }
  /** q(prop, val) — Shorthand to set both .value and .startvalue on a camera property. */
  function q(a, b) {
    a.value = a.startvalue = b;
  }
  /* ═══════════════════════════════════════════════════════════════
   *  SECTION 6 — SONG / ANIMATION REPLAY
   *  gc() sets up the camera + mesh trajectories and starts the
   *  PhotoAnim replay timer.  The onended callback restores all
   *  saved state.
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * gc() — Start or stop song/animation replay.
   *  - Saves expression & camera state
   *  - Replaces mesh trajectory + per-vertex trajx with song data
   *  - Assigns camera trajectory curves (xrot, yrot, zoom, etc.)
   *  - Calls g.addReplay(duration) and g.pause = false to begin
   *  - On completion, onended callback restores everything.
   */
  function gc() {
    if (w) ((g.main.replay.time = 2), getId("audio").pause());
    else {
      hc = F;
      va(!0, !0);
      var a = getId("audio"),
        b,
        c = g.vertices,
        e = c.length / 7,
        d = Array(e);
      for (b = 0; b < e; b++)
        ((d[b] = c[7 * b + 3]), (c[7 * b + 3] = ea.trajx[b]));
      var f = g.triangles.slice(0),
        m = g.trajectory.slice(0);
      g.padef[1][3] = g.mesh[3] = g.trajectory = ea.traj;
      var h = g.global.camera,
        l = ea.camera,
        k = h.xmov.value,
        n = h.ymov.value;
      h.xmov.trajx = l.xmov;
      h.ymov.trajx = l.ymov;
      h.xmov.trajpos = h.ymov.trajpos = !0;
      var p = h.xrot.value,
        q = h.yrot.value,
        r = h.zrot.value,
        t = h.xrot.startvalue,
        u = h.yrot.startvalue,
        x = h.zrot.startvalue;
      h.xrot.trajx = l.xrot;
      h.yrot.trajx = l.yrot;
      h.zrot.trajx = l.zrot;
      h.xrot.trajpos = h.yrot.trajpos = !0;
      h.xrot.startvalue = -15;
      h.yrot.startvalue = h.zrot.startvalue = 0;
      var y = h.zoom.value,
        z = h.zoom.startvalue;
      h.zoom.trajx = l.zoom;
      h.zoom.trajzoom = !0;
      h.zoom.startvalue = 1.3;
      g.addReplay(ea.replay.duration);
      l = g.main.replay;
      l.run = !0;
      l.audio = ea.replay.audio;
      l.offset = 0.3;
      void 0 !== ea.replay.offset && (l.offset = ea.replay.offset);
      l.onended = function () {
        for (b = 0; b < e; b++) c[7 * b + 3] = d[b];
        g.padef[1][2] = g.mesh[2] = g.triangles = f;
        g.padef[1][3] = g.mesh[3] = g.trajectory = m;
        h.xmov.trajx = h.ymov.trajx = void 0;
        h.xrot.trajx = h.yrot.trajx = h.zrot.trajx = void 0;
        h.zoom.trajx = void 0;
        h.xmov.value = k;
        h.ymov.value = n;
        h.xrot.value = p;
        h.yrot.value = q;
        h.zrot.value = r;
        h.xrot.startvalue = t;
        h.yrot.startvalue = u;
        h.zrot.startvalue = x;
        h.zoom.value = y;
        h.zoom.startvalue = z;
        g.padef[3].replay = g.main.replay = void 0;
        w = !1;
        ea = null;
        Sa = "3dface";
        getId("songselect").selectedIndex = 0;
        getStyle("playbutton").display = "none";
        switch (hc) {
          case -1:
            va(!1);
            break;
          case 0:
            gb(!0);
            break;
          case 1:
            va(!0);
            break;
          case 2:
            jb(!0);
            break;
          case 3:
            lb(!0);
        }
        T();
      };
      a.src = l.audio;
      g.pause = !0;
      "standard" == gtype
        ? a.play()
        : (getStyle("playbutton").display = "inline");
      Sa = "avatar";
      w = !0;
      a.onplaying = function () {
        g.oldtime = -1;
        g.main.replay.time = 0;
        g.pause = !1;
      };
    }
  }
  /** ic() — Fast-forward the current replay to the end. */
  function ic() {
    w && ((g.main.replay.time = 2), (g.pause = !1));
  }
  /** Ta() — Cancel/close the publish dialog, stop any pending upload. */
  function Ta() {
    if (isajaxsending)
      if (confirm("Cancel publication?")) ra.CancelSend();
      else return;
    publishflag = !1;
    dimmer.display = publishdlg.display = "none";
    "undefined" != typeof ic && ic();
  }
  /** yc(loaded, total) — Upload progress callback — update the % display. */
  function yc(a, b) {
    var c = Math.floor((a / b) * 100);
    c = 0 == c ? "" : c + "%";
    getId("progress").innerHTML = "sending... " + c;
  }
  /** zc(response) — Upload complete callback — store handle and show link. */
  function zc(a) {
    if (isajaxsending)
      if (((isajaxsending = !1), "ok" != a))
        (alert("Something went wrong, please try again later..."), Ta());
      else {
        a = pubhandle;
        var b = padef[0];
        if (
          ra.StoreHandle(
            a,
            "animation",
            b.privacy,
            b.category,
            b.title,
            b.description,
            Sa,
          )
        ) {
          displayId("uploading", !1);
          displayId("link", !0);
          b = "player.htm?h=" + a;
          getId("handle1").href = b;
          getId("handle2").value = "player.htm?h=" + a;
          try {
            (sessionStorage.clear(), (sessionStorage[pubhandle] = ajsonstr));
          } catch (c) {}
          cb = ra = !1;
          Ac.enable(!1);
        } else onEndPublish();
      }
  }
  function Bc() {
    var a = getId("vigcanvas"),
      b = a.getContext("2d"),
      c = g.canvas,
      e = c.width,
      d = c.height;
    var f = Math.floor((3 * e) / 4);
    if (f <= d) var m = e;
    else ((m = Math.floor((4 * d) / 3)), (f = d));
    e = (e - m) / 2;
    g.DrawScene();
    b.drawImage(c, e, 0, m, f, 0, 0, 240, 180);
    return a;
  }
  /** Cc() — Upload error fallback. */
  function Cc() {
    isajaxsending &&
      (alert("Something went wrong, please try again later..."), Ta());
  }

  /* ═══════════════════════════════════════════════════════════════
   *  SECTION 7 — EVENT HANDLER DELEGATION
   *  D = window (the IIFE parameter).  Each D.onXxx is called by
   *  the corresponding onclick / onchange in the HTML.
   * ═══════════════════════════════════════════════════════════════ */

  /** Rotate the photo 90° and re-draw. */
  D.onRotate = function () {
    X++;
    Za();
  };
  D.onStartDetect = Kb;
  D.onFaceCancel = function () {
    window.location.reload();
  };
  D.onManualSelect0 = function () {
    J.onload();
    getStyle("contour").overflow = "visible";
    getStyle("facemenu").height = "164px";
    var a = getStyle("canvas");
    a.top = a.left = "0px";
    a = getStyle("ovcanvas");
    a.top = a.left = "0px";
    C[0] = x[0] = u[0] = -1;
    Z.setState(0);
    G = !1;
    Gb();
  };
  D.onManualSelect = Gb;
  D.onManualDone = function () {
    if (-1 != x[0] && -1 != u[0]) {
      G = R = !1;
      getStyle("facem").display = "none";
      getStyle("face1").display = "none";
      var a = new Float32Array(24);
      a[0] = 0;
      a[1] = 1e-7;
      a[2] = 0;
      a[3] = 0;
      r = K.calculatePositions(a);
      var b = u[0] - x[0],
        c = u[1] - x[1];
      a = Math.sqrt(b * b + c * c) / (r[32][0] - r[27][0]);
      var e = (r[32][0] + r[27][0]) / 2,
        d = (r[32][1] + r[27][1]) / 2,
        f = (u[0] + x[0]) / 2,
        g = (u[1] + x[1]) / 2;
      La = Math.atan2(c, b);
      var h = Math.cos(La),
        m = Math.sin(La);
      for (b = 0; b < r.length; b++) {
        c = r[b][0] - e;
        var k = r[b][1] - d;
        r[b][0] = (c * h - k * m) * a + f;
        r[b][1] = (c * m + k * h) * a + g;
      }
      Mb(!0);
    }
  };
  /**
   * D.on3dFace() — THE MAIN TRANSITION from 2-D editing to 3-D.
   * 1. Copies base geometry and applies landmark deformation (Na)
   * 2. Generates UV texture mapping (Da)
   * 3. Creates the PhotoAnim WebGL renderer
   * 4. Sets up camera, lighting, and default blink animation
   * 5. Hides 2-D UI and shows the 3-D view
   */
  D.on3dFace = function () {
    if ("object" != typeof padef || "undefined" == typeof P)
      alert("Still waiting for resources to load... Please wait...");
    else {
      // ==== SAVE DATA TO LOCAL STORAGE ====
      // Also cache the cropped texture 
      try {
        let croppedTexture = null;
        if (typeof t !== "undefined" && t.toDataURL) {
           croppedTexture = t.toDataURL("image/jpeg", 0.6);
        } else if (typeof J !== "undefined" && J.src) {
           croppedTexture = J.src; 
        }
        
        let currentParams = null;
        if (typeof K !== "undefined" && K.getCurrentParameters) {
           let p = K.getCurrentParameters();
           if (p) currentParams = Array.from(p); // Convert TypedArray to normal array
        }
        
        const dataToSave = {
          faceCropped: croppedTexture,
          landmarks: m,
          rawLandmarks: r,
          params: currentParams,
          rotParams: { X: X, Q: Q, La: La, ta: ta, mx: m && m[0] ? m[0][0] : 0 } // minimal stuff needed
        };
        const strData = JSON.stringify(dataToSave);
        console.log("Saving face data length:", strData.length);
        localStorage.setItem("savedFaceData", strData);
      } catch (err) {
        console.error("Failed to save 3D face data to local storage:", err);
      }
      
      O = padef[1][0] = P.slice(0);
      Vb = padef[1][1];
      for (var a = P[7 * L[44] + 1], b = 46; 48 >= b; b++)
        Xa[b] = P[7 * L[b] + 1] - a;
      a = padef[1][3];
      a[Ra] = Ab.length;
      for (b = 0; b < Ab.length; b++) a[Ra + b + 1] = 0.11 * Ab[b];
      Sb();
      a = K.getCurrentParameters();
      b = O;
      var c = L,
        e = m[7][0],
        d = m[7][1],
        f = m[33][0],
        l = m[33][1],
        h = b[7 * c[7]],
        p = b[7 * c[7] + 1],
        k = b[7 * c[33]],
        n = b[7 * c[33] + 1],
        q = m[47][0],
        rr = m[47][1],
        tt = b[7 * c[47]],
        u = b[7 * c[47] + 1];
      e = Math.sqrt(
        (Math.sqrt((e - f) * (e - f) + (d - l) * (d - l)) /
          Math.sqrt((h - k) * (h - k) + (p - n) * (p - n))) *
          (Math.sqrt((q - f) * (q - f) + (rr - l) * (rr - l)) /
            Math.sqrt((tt - k) * (tt - k) + (u - n) * (u - n))),
      );
      padef[0].vxtrajscale = e;
      d = m[0][0];
      h = m[0][1];
      p = m[14][0];
      q = m[14][1];
      rr = b[7 * c[0]];
      tt = b[7 * c[0] + 1];
      u = b[7 * c[14]];
      var w = b[7 * c[14] + 1],
        x = m[3][0],
        z = m[3][1],
        B = m[11][0],
        A = m[11][1],
        C = b[7 * c[3]],
        DD = b[7 * c[3] + 1],
        E = b[7 * c[11]];
      c = b[7 * c[11] + 1];
      c = Math.sqrt(
        (Math.sqrt((d - p) * (d - p) + (h - q) * (h - q)) /
          Math.sqrt((rr - u) * (rr - u) + (tt - w) * (tt - w))) *
          (Math.sqrt((x - B) * (x - B) + (z - A) * (z - A)) /
            Math.sqrt((C - E) * (C - E) + (DD - c) * (DD - c))),
      );
      d = Math.sqrt(c * e);
      l = n - l;
      n = k - f;
      f = b.length / 7;
      for (k = 4; k < f; k++)
        ((b[7 * k] *= c),
          (b[7 * k] -= n),
          (b[7 * k + 1] *= e),
          (b[7 * k + 1] -= l),
          (b[7 * k + 2] *= d));
      k = (-a[4] * ma) / 180;
      a = 3 * (Math.atan2(m[50][1], m[50][0]) - Math.atan2(m[52][1], m[52][0]));
      Math.abs(a) < Math.abs(k) && (k = a);
      if (0.22 < Math.abs(k))
        for (
          jc &&
            (alert("Face seems to be rotated... \nExpect strange results..."),
            (jc = !1)),
            a = Math.sin(k),
            l = Math.cos(k),
            k = 4;
          k < f;
          k++
        )
          ((n = b[7 * k]),
            (c = b[7 * k + 2]),
            (b[7 * k] = n * l - c * a),
            (b[7 * k + 2] = n * a + c * l));
      for (k = 0; k < m.length; k++) m[k][2] = b[7 * L[k] + 2];
      yb = JSON.stringify(m);
      Na(!1, !0);
      Da();
      getStyle("face2d").display = "none";
      getStyle("face3d").display = "block";
      window.scrollTo(0, 64);
      g = new PhotoAnim("canvas3d", padef, null, rc);
      g.updateBgrdColor(1.0, 1.0, 1.0, 1.0);
      wa = g.vertices.slice(0);
      b = g.global.camera;
      b.yrot.startvalue = b.yrot.value = 0;
      b.xrot.startvalue = b.xrot.value = 0;
      b.xrot.alternate = b.yrot.alternate = !0;
      /* Auto-pause: don't call fb(), start paused */
      getStyle("play").display = "inline";
      getStyle("pause").display = "none";
      b.yrot.speed = b.xrot.speed = 0;
      b.yrot.min = b.xrot.min = -60;
      b.yrot.max = b.xrot.max = 60;
      /* Hide controlblock by default via CSS class */
      getId("controlblock").classList.add("ai-hidden");
      b = g.global.light;
      b.shading.startvalue = b.shading.value = 0.05;
      b.back.startvalue = b.back.value = 0;
      g.global.user.rotlimit = !0;
      g.main.main.alternate = !1;
      g.main.main.speed = 0.2;
      g.global.duration = 5;
      if (talkingInterval) {
        clearInterval(talkingInterval);
        talkingInterval = null;
      }
      b = [hb, ib, kb, mb, talkingBtn, Qa, ob, pb, sb, tb, vb, wb, xb];
      for (a = 0; a < b.length; a++) b[a].force(!1);
      /* Only TENNIS selected by default — NOT blink */
      if (-1 != y) Ea[y](!1);
      if (-1 != da) qb[da](!1);
      F = da = y = -1;
      oa = -1;
      /* FACE INIT: Clear both expression channels so the face
       * starts in a neutral pose. pa=false means no eye/brow
       * expression; S=!1 means no mouth expression.
       * These will be set by the AI animation system later. */
      pa = false;
      S = !1;
      rb(!0);
      T();
      window.requestAnimationFrame(Tb);
      window.onresize();
      /* START IDLE ANIMATION: After 600ms (so face has finished
       * loading and rendering), start the blink + brow drift
       * system. This makes the face look alive even before the
       * user starts a conversation with the AI agent.
       * aiAnimStartBlink() begins the blink scheduling timer
       * and the brow drift timer inside the Section 10 IIFE. */
      setTimeout(function () {
        if (D.aiAnimStartBlink) D.aiAnimStartBlink();
      }, 600);
    }
  };
  D.onSplash = function (a, b) {
    if (
      2 != b ||
      confirm(
        "The face on this image is rotated...\nExpect bad results!!!\nContinue anyway?",
      )
    )
      ((J.src = a), (Ua = b), (getStyle("face41").display = "none"));
  };
  D.onBack = function () {
    if (talkingInterval) {
      clearInterval(talkingInterval);
      talkingInterval = null;
    }
    w
      ? alert("Please wait til end of song...")
      : (1 == F && va(!1),
        4 == F && talkingToggle(!1),
        (g = void 0),
        Sb(),
        (getStyle("face2d").display = "block"),
        (getStyle("face3d").display = "none"),
        (B = N),
        (ba = ca = 0),
        ha(1, 0, 0));
  };
  D.onPlay = fb;
  D.onPause = function () {
    if (!w) {
      getStyle("play").display = "inline";
      getStyle("pause").display = "none";
      var a = g.global.camera;
      a.yrot.speed = a.xrot.speed = 0;
      a.yrot.min = a.xrot.min = -60;
      a.yrot.max = a.xrot.max = 60;
    }
  };
  /* ────────────────────────────────────────────────────────────────
   * D.onSong — Triggered when user selects an animation from the
   *   dropdown. Builds a demo animation inline (no server fetch).
   *   The demo creates smooth camera rotation/zoom and generates a
   *   short silent audio data-URI so the replay system can start.
   * ──────────────────────────────────────────────────────────────── */
  D.onSong = function (a) {
    kc = a;
    lc = a.selectedIndex;
    a = a.value;
    w && gc();
    setTimeout(function () {
      kc.selectedIndex = lc;
    }, 500);
    if (a === "demo" && g) {
      /* --- Build a silent WAV data-URI (~1 KB) for audio trigger --- */
      var sr = 8000,
        dur = 1,
        nS = sr * dur,
        buf = new ArrayBuffer(44 + nS),
        v = new DataView(buf),
        wr = function (o, s) {
          for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
        };
      wr(0, "RIFF");
      v.setUint32(4, 36 + nS, !0);
      wr(8, "WAVE");
      wr(12, "fmt ");
      v.setUint32(16, 16, !0);
      v.setUint16(20, 1, !0);
      v.setUint16(22, 1, !0);
      v.setUint32(24, sr, !0);
      v.setUint32(28, sr, !0);
      v.setUint16(32, 1, !0);
      v.setUint16(34, 8, !0);
      wr(36, "data");
      v.setUint32(40, nS, !0);
      for (var si = 0; si < nS; si++) v.setUint8(44 + si, 128);
      var bytes = new Uint8Array(buf),
        bin = "";
      for (si = 0; si < bytes.length; si++)
        bin += String.fromCharCode(bytes[si]);
      var silentAudio = "data:audio/wav;base64," + btoa(bin);

      /* --- Copy current mesh trajectory (no mesh deformation) --- */
      var c = g.vertices,
        numV = c.length / 7,
        trajxArr = new Array(numV);
      for (var i = 0; i < numV; i++) trajxArr[i] = c[7 * i + 3];

      /* --- Camera animation keyframes (64-frame curves) --- */
      var N = 64,
        xm = [],
        ym = [],
        xr = [],
        yr = [],
        zr = [],
        zm = [];
      for (var i = 0; i < N; i++) {
        var t = i / (N - 1);
        xm.push(0.015 * Math.sin(t * Math.PI * 4));
        ym.push(0.01 * Math.sin(t * Math.PI * 2));
        xr.push(-15 + 12 * Math.sin(t * Math.PI * 2));
        yr.push(35 * Math.sin(t * Math.PI * 3));
        zr.push(5 * Math.sin(t * Math.PI * 4));
        zm.push(1.3 + 0.15 * Math.sin(t * Math.PI * 2));
      }

      /* --- Assemble song data object --- */
      ea = {
        replay: { duration: 8, audio: silentAudio, offset: 0 },
        traj: g.trajectory.slice(0),
        trajx: trajxArr,
        camera: {
          xmov: xm,
          ymov: ym,
          xrot: xr,
          yrot: yr,
          zrot: zr,
          zoom: zm,
        },
      };
      getStyle("ajaxsong").display = "none";
      getId("songprogress").innerHTML = "";
      gc();
    }
  };
  D.onSongPlay = function () {
    getId("audio").play();
  };
  D.onEndpublish = Ta;
  D.onSubmitpublish = function (a) {
    var b = g.padef,
      c = a.title.value;
    if (4 > c.length)
      return (alert("Please enter a title (min 4 characters)"), !1);
    displayId("pubsubmit", !1);
    displayId("uploading", !0);
    getId("progress").innerHTML = "Contacting server...";
    var e = ra.GetHandle();
    if ("failed" == e)
      return (
        alert("There is a problem with the server, please try again later"),
        Ta(),
        !1
      );
    getId("progress").innerHTML = "Starting transfer...";
    ra.SendVignette(e, Bc());
    pubhandle = e;
    var d = getRadioValue(a.privacy),
      f = a.description.value;
    a = a.category.value;
    var l = b[0];
    l.privacy = d;
    l.title = escape(c);
    l.description = escape(f);
    l.category = a;
    l.owner = guser;
    l.width = 1024;
    l.height = 1024;
    l.app = "3D Face";
    "avatar" == Sa && (l.app = "Avatar");
    fb();
    b[1][4] = ua;
    c = JSON.stringify(b[4]);
    b[4] = {};
    d = b[1][4];
    "string" != typeof d && (b[1][4] = d.toDataURL("image/jpeg"));
    l = ua.width;
    var h = ua.height;
    f = document.createElement("canvas");
    f.width = l;
    f.height = h;
    a = f.getContext("2d");
    a.drawImage(ua, 0, 0);
    l = a.getImageData(0, 0, l, h);
    h = l.data;
    var m = !1,
      k;
    for (k = 0; k < h.length; k += 4)
      (255 != h[4 * k + 3] && (m = !0), (h[k] = h[k + 1] = h[k + 2] = 0));
    m ? (a.putImageData(l, 0, 0), (f = f.toDataURL("image/png"))) : (f = !1);
    f && (b[1][5] = f);
    ra.SendJSON(e, b, yc, zc, Cc);
    b[4] = JSON.parse(c);
    b[1][4] = d;
    return !1;
  };
  /* ═══════════════════════════════════════════════════════════════
   *  SECTION 8 — RUNTIME STATE & ANIMATION DATA
   *  Variable declarations for app mode, song state, and the
   *  preset blink / eye-movement / expression animation curves.
   *
   *  ANIMATION FORMAT:
   *  Each expression object has:
   *    anim[] = flat array, groups of 5: [keydotA, keydotB, dx, dy, dz]
   *      - keydotA: which landmark to move
   *      - keydotB: reference landmark (positive=add to self, negative=mirror from abs(keydotB))
   *      - dx, dy, dz: positional offset at full expression strength
   *    traj[] = 64-element easing curve (values 0..1), controls how
   *      the expression ramps up and down over the animation cycle.
   *
   *  EXPRESSION DATA REFERENCE:
   *    nb = BLINK — upper eyelids drop (keydots 53,56,58,59), lower lids rise (54,55,57,60)
   *    wc = EYE CLOSE — like blink + slight mouth corner shift (keydot 44)
   *    tc = SURPRISED — jaw+eyebrows: keydots 46-48 (lip dy≈-0.054),
   *         44-45 (corners dy≈-0.021), 15-22 (brows dy≈+0.025), 6-8 (chin dy≈-0.015)
   *    talkAnim = TALK — jaw-only subset of tc (keydots 44-48, 6-8, NO brows 15-22)
   *    sc = SMILE — corners (44,45) pull out, eyes squint (53-60), cheeks (3-5,9-11)
   *    uc = SAD — brows down (15-22 dy≈-0.007), corners droop (44,45 dy≈-0.019)
   *    vc = ANGRY — brows down+together, eyes narrow, face reddens (separate color change)
   * ═══════════════════════════════════════════════════════════════ */

  var Sa =
      "3dface" /* current app identity ("3dface" or "avatar" during song) */,
    w = !1 /* true while a song/animation is playing */,
    ea /* song data object (replay, traj, trajx, camera) */,
    g /* PhotoAnim WebGL renderer instance */,
    Ua = -1 /* splash-sample index (-1 = user photo) */,
    /* --- nb: default blink/idle animation data ---
     * Controls automatic blinking by moving upper eyelids DOWN
     * and lower eyelids slightly UP.
     *   keydot 53 (left upper lid inner):   dy=-0.017 (drops DOWN)
     *   keydot 24 (left eye corner outer):  dy=-0.022
     *   keydot 54 (left lower lid inner):   dy=-0.016 (rises into close)
     *   keydot 56 (left upper lid outer):   dy=+0.009 (slight counter-move)
     *   keydot 26 (left eye corner inner):  dy=+0.010
     *   keydot 55 (left lower lid outer):   dy=+0.004
     *   keydots 58,29,57,59,31,60: RIGHT eye mirror of the above
     * The traj has fast peaks (full close in ~3 frames) with long pauses.
     */
    nb = {
      anim: [
        53, 56, 0.00195, -0.0166, 0, 24, 26, 0, -0.02247, 0, 54, 55, -0.00391,
        -0.01563, 0, 56, 53, 0.00293, 0.00879, 0, 26, 24, -9.8e-4, 0.00977, 0,
        55, 54, -0.00195, 0.00391, 0, 58, 59, 0.00195, -0.01465, 0, 29, 31,
        0.00293, -0.02051, 0, 57, 60, 9.8e-4, -0.01563, 0, 59, 58, -9.8e-4,
        0.00293, 0, 31, 29, -0.00195, 0.00586, 0, 60, 57, -0.00195, 0.00684, 0,
      ],
      traj: [
        0.00781, 0.99213, 0.50394, 0.01575, 0.01496, 0.01417, 0.01339, 0.0126,
        0.01181, 0.01102, 0.01024, 0.00945, 0.00866, 0.00787, 0.98425, 0.00787,
        0.00722, 0.00656, 0.00591, 0.00525, 0.00459, 0.00394, 0.00328, 0.00262,
        0.00197, 0.00131, 6.6e-4, 0, 0.98425, 0.00787, 0.00787, 0.00787,
        0.00787, 0.00787, 0.00787, 0.00787, 0.00787, 0.00787, 0.9685, 0.49606,
        0.02362, 0.02067, 0.01772, 0.01476, 0.01181, 0.00886, 0.00591, 0.00295,
        0, 0.48425, 0.9685, 0.48425, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      ],
    },
    wc = {
      /* wc = EYE CLOSE expression (half-blink + mouth adjustment).
       * Similar to nb but includes keydot 44 (left mouth corner,
       * dy=+0.01 = slight upward twitch during eye close).
       * LEFT EYE: keydots 56,26,55 (lid open), 53,24,54 (lid close)
       * Used for the "look" effect when combined with eye movement.
       */
      anim: [
        56, 53, 0, 0.0127, 0, 26, 24, 9.8e-4, 0.01758, 0, 55, 54, 9.8e-4,
        0.0127, 0, 53, 56, 0.00195, -0.01074, 0, 24, 26, 0.00293, -0.01465, 0,
        54, 55, -9.8e-4, -0.00879, 0, 44, 44, -0.00488, 0.01, 0,
      ],
      traj: [
        0.00781, 0.99213, 0.85264, 0.71316, 0.57368, 0.4342, 0.29471, 0.15523,
        0.01575, 0.01522, 0.0147, 0.01417, 0.01365, 0.01312, 0.0126, 0.01207,
        0.01155, 0.01102, 0.0105, 0.00997, 0.00945, 0.00892, 0.0084, 0.00787,
        0.49213, 0.97638, 0.81496, 0.65354, 0.49213, 0.33071, 0.16929, 0.00787,
        0.00787, 0.00787, 0.00787, 0.00787, 0.00787, 0.00787, 0.00787, 0.00787,
        0.00787, 0.00787, 0.00787, 0.00787, 0.00787, 0.98425, 0.82021, 0.65617,
        0.49213, 0.32808, 0.16404, 0, 6.1e-4, 0.00121, 0.00182, 0.00242,
        0.00303, 0.00363, 0.00424, 0.00485, 0.00545, 0.00606, 0.00666, 0.00727,
      ],
    },
    tc = {
      /* tc = SURPRISED expression.
       * Opens mouth wide + raises eyebrows.
       * anim groups of 5: [keydotA, keydotB, dx, dy, dz]
       *   keydot 46 (lower lip center, negative -51 = mirror upper lip): dy=-0.054 (jaw drops)
       *   keydot 47 (lower lip left,  negative -50 = mirror):           dy=-0.052
       *   keydot 48 (lower lip right, negative -49 = mirror):           dy=-0.056
       *   keydot 44 (left mouth corner):  dx=+0.019 (widen), dy=-0.021 (drop)
       *   keydot 45 (right mouth corner): dx=-0.011, dy=-0.022
       *   keydots 19-22 (right eyebrow): dy=+0.024 to +0.030 (RAISE)
       *   keydots 15-18 (left eyebrow):  dy=+0.021 to +0.035 (RAISE)
       *   keydot 7  (chin center): dy=-0.024 (chin drops with jaw)
       *   keydots 6,8 (chin sides): dy=-0.015
       *   keydots 24,29 (eye corners): slight shift
       */
      anim: [
        46, -51, 0.00586, -0.05371, 0, 47, -50, -0.00196, -0.05176, 0, 48, -49,
        -0.00196, -0.05566, 0, 44, 44, 0.01855, -0.02051, 0, 45, 45, -0.01074,
        -0.02246, 0, 19, 19, -0.00195, 0.02539, 0, 20, 20, -9.8e-4, 0.02539, 0,
        21, 21, 0.00195, 0.03027, 0, 22, 22, 0.00684, 0.02441, 0, 18, 18,
        9.7e-4, 0.03516, 0, 17, 17, 0.00781, 0.03516, 0, 16, 16, 0.00977,
        0.02539, 0, 15, 15, 0.00684, 0.02148, 0, 7, 7, 0, -0.02367, 0, 8, 8,
        0.00586, -0.015, 0, 6, 6, -0.00488, -0.015, 0, 24, 26, 0, 0.00391, 0,
        29, 31, 0.00488, 0.00195, 0,
      ],
      traj: [
        0.00781, 0.09049, 0.17318, 0.25586, 0.33854, 0.42122, 0.50391, 0.58659,
        0.66927, 0.75195, 0.83464, 0.91732, 1, 0.99954, 0.99907, 0.99861,
        0.99815, 0.99768, 0.99722, 0.99676, 0.99629, 0.99583, 0.99537, 0.99491,
        0.99444, 0.99398, 0.99352, 0.99305, 0.99259, 0.99213, 0.96295, 0.93377,
        0.90459, 0.87541, 0.84623, 0.81704, 0.78786, 0.75868, 0.7295, 0.70032,
        0.67114, 0.64196, 0.61278, 0.5836, 0.55442, 0.52524, 0.49606, 0.46688,
        0.4377, 0.40852, 0.37934, 0.35016, 0.32098, 0.2918, 0.26262, 0.23344,
        0.20426, 0.17508, 0.1459, 0.11672, 0.08754, 0.05836, 0.02918, 0,
      ],
    },
    /* talkAnim — jaw-only animation: lip/jaw keydots 44-48 and
             chin keydots 6-8, WITHOUT eyebrow keydots 15-22 or nose 24/29.
             This is a SUBSET of tc with eyebrow entries removed so that
             Talk mode doesn't raise/lower the eyebrows.
             
             anim breakdown:
               keydot 46 (lower lip center): dy=-0.054  ← jaw drops
               keydot 47 (lower lip left):  dy=-0.052
               keydot 48 (lower lip right): dy=-0.056
               keydot 44 (left corner):  dx=+0.019, dy=-0.021
               keydot 45 (right corner): dx=-0.011, dy=-0.022
               keydot 7  (chin center): dy=-0.024
               keydot 8  (chin right):  dy=-0.015
               keydot 6  (chin left):   dy=-0.015
          */
    talkAnim = {
      anim: [
        46, -51, 0.00586, -0.05371, 0, 47, -50, -0.00196, -0.05176, 0, 48, -49,
        -0.00196, -0.05566, 0, 44, 44, 0.01855, -0.02051, 0, 45, 45, -0.01074,
        -0.02246, 0, 7, 7, 0, -0.02367, 0, 8, 8, 0.00586, -0.015, 0, 6, 6,
        -0.00488, -0.015, 0,
      ],
      traj: [
        0.00781, 0.09049, 0.17318, 0.25586, 0.33854, 0.42122, 0.50391, 0.58659,
        0.66927, 0.75195, 0.83464, 0.91732, 1, 0.99954, 0.99907, 0.99861,
        0.99815, 0.99768, 0.99722, 0.99676, 0.99629, 0.99583, 0.99537, 0.99491,
        0.99444, 0.99398, 0.99352, 0.99305, 0.99259, 0.99213, 0.96295, 0.93377,
        0.90459, 0.87541, 0.84623, 0.81704, 0.78786, 0.75868, 0.7295, 0.70032,
        0.67114, 0.64196, 0.61278, 0.5836, 0.55442, 0.52524, 0.49606, 0.46688,
        0.4377, 0.40852, 0.37934, 0.35016, 0.32098, 0.2918, 0.26262, 0.23344,
        0.20426, 0.17508, 0.1459, 0.11672, 0.08754, 0.05836, 0.02918, 0,
      ],
    },
    sc = {
      /* sc = SMILE expression.
       * Pulls mouth corners outward and upward, squints eyes slightly,
       * lifts cheeks. Does NOT open the mouth (no lip-closure splice).
       *   keydot 44 (left corner):  dx=-0.013 (inward), dy=+0.013 (UP), dz=-0.015
       *   keydot 45 (right corner): dx=+0.013, dy=+0.018, dz=-0.015
       *   keydots 51,46 (upper/lower lip center): slight shift
       *   keydots 49,48 (lip sides): slight shift
       *   keydots 56,53,26,24 (left eye corners/lids): squint
       *   keydots 59,58,31,29 (right eye corners/lids): squint
       *   keydots 3,4,5 (left cheek/jaw): lift
       *   keydots 9,10,11 (right cheek/jaw): lift
       */
      anim: [
        44, 44, -0.013, 0.0127, -0.015, 45, 45, 0.013, 0.01758, -0.015, 51, 46,
        -0.005, 9.8e-4, -0.0025, 46, 51, -0.005, 0, -0.0025, 49, 48, 0.005,
        0.00391, -0.0025, 48, 49, 0.005, 0.00391, -0.0025, 56, 53, 9.8e-4,
        0.00684, 0, 26, 24, -9.8e-4, 0.00879, 0, 55, 54, 9.8e-4, 0.00586, 0, 59,
        58, 9.8e-4, 0.00586, 0, 31, 29, -9.8e-4, 0.00976, 0, 60, 57, 0, 0.00781,
        0, 3, 3, -0.00684, -9.8e-4, 0, 4, 4, -0.00684, -0.00391, 0, 10, 10, 0,
        0, 0, 11, 11, 0.00684, 9.8e-4, 0, 5, 5, -0.00684, -0.00586, 0, 9, 9,
        0.00293, -0.00488, 0,
      ],
      traj: [
        0.00781, 0.07868, 0.14955, 0.22042, 0.29129, 0.36217, 0.43304, 0.50391,
        0.57478, 0.64565, 0.71652, 0.78739, 0.85826, 0.92913, 1, 0.99961,
        0.99921, 0.99882, 0.99843, 0.99803, 0.99764, 0.99724, 0.99685, 0.99646,
        0.99606, 0.99567, 0.99528, 0.99488, 0.99449, 0.99409, 0.9937, 0.99331,
        0.99291, 0.99252, 0.99213, 0.92598, 0.85984, 0.7937, 0.72756, 0.66142,
        0.61417, 0.56693, 0.51969, 0.47244, 0.4252, 0.40157, 0.37795, 0.35433,
        0.33071, 0.30709, 0.28346, 0.25984, 0.23307, 0.2063, 0.17953, 0.15276,
        0.12598, 0.10866, 0.09134, 0.07402, 0.05669, 0.03937, 0.02756, 0.01575,
      ],
    },
    uc = {
      /* uc = SAD expression.
       * Eyebrows droop, mouth corners pull down. Does NOT open the mouth.
       *   keydots 19-22 (right eyebrow): dy = -0.005 to -0.013 (DOWN)
       *   keydots 15-18 (left eyebrow):  dy = -0.004 to -0.008 (DOWN)
       *   keydots 23,28 (brow arch): dy = -0.010 to -0.012 (strong droop)
       *   keydot 44 (left corner):  dx=+0.014, dy=-0.019 (corners pull DOWN)
       *   keydot 45 (right corner): dx=-0.008, dy=-0.019
       *   keydots 53-60 (eye area): slight narrowing
       */
      anim: [
        19, 19, 9.8e-4, -0.0127, 0, 20, 20, 0.00195, -0.00488, 0, 21, 21, 0,
        -0.00586, 0, 22, 22, -0.00391, -0.00586, 0, 18, 18, 0.00195, -0.00391,
        0, 17, 17, 0.00293, -0.00684, 0, 16, 16, 0.00293, -0.00781, 0, 15, 15,
        -9.8e-4, -0.00781, 0, 23, 23, 9.8e-4, -0.01172, 0, 28, 28, -0.00195,
        -0.00977, 0, 44, 44, 0.01368, -0.01855, 0, 45, 45, -0.00781, -0.01855,
        0, 56, 53, 0, 0.00391, 0, 26, 24, -9.8e-4, 0.00879, 0, 55, 54, -9.8e-4,
        0.00293, 0, 59, 58, 9.8e-4, 0.00488, 0, 31, 29, 0, 0.00879, 0, 60, 57,
        -9.8e-4, 0.00488, 0,
      ],
      traj: [
        0.00781, 0.08353, 0.15925, 0.23496, 0.31068, 0.38639, 0.46211, 0.53783,
        0.61354, 0.68926, 0.76498, 0.84069, 0.91641, 0.99213, 0.99213, 0.99213,
        0.99213, 0.99213, 0.99213, 0.99213, 0.99213, 0.99213, 0.99213, 0.99213,
        0.99213, 0.99213, 0.99213, 0.99213, 0.99213, 0.94151, 0.89089, 0.84027,
        0.78965, 0.73903, 0.68841, 0.6378, 0.60742, 0.57705, 0.54668, 0.51631,
        0.48594, 0.45557, 0.4252, 0.38058, 0.33596, 0.29134, 0.27362, 0.25591,
        0.23819, 0.22047, 0.20585, 0.19123, 0.1766, 0.16198, 0.14736, 0.13273,
        0.11811, 0.10236, 0.08661, 0.07087, 0.05512, 0.03675, 0.01837, 0,
      ],
    },
    vc = {
      /* vc = ANGRY expression.
       * Eyebrows pull together (furrowed) and down strongly.
       * Eyes narrow. Mouth corners tighten. Does NOT open the mouth.
       * lb() also applies a RED tint by reducing green/blue channels
       * in the texture (separate from the anim data).
       *   keydots 19-22 (right eyebrow): dy = -0.010 to -0.030 (DOWN, strong)
       *   keydots 15-18 (left eyebrow):  dy = -0.012 to -0.030 (DOWN, strong)
       *   keydots 23,28 (brow arch): dy = +0.003 to +0.006 (slight corrugation)
       *   keydot 44 (left corner):  dx=+0.022, dy=-0.010 (tighten)
       *   keydot 45 (right corner): dx=-0.021, dy=-0.010
       *   keydots 53-60 (eye area): squint/narrow
       */
      anim: [
        19, 19, 0.00196, -0.00977, 0, 20, 20, 9.7e-4, -0.01758, 0, 21, 21,
        -0.00293, -0.02344, 0, 22, 22, 0.00195, -0.03027, 0, 18, 18, -0.00782,
        -0.03028, 0, 17, 17, 0.00391, -0.01954, 0, 16, 16, 0, -0.0166, 0, 15,
        15, -9.8e-4, -0.01172, 0, 23, 23, 0.00781, 0.00293, 0, 28, 28, -0.00781,
        0.00586, 0, 44, 44, 0.02247, -0.00976, 0, 45, 45, -0.02148, -0.00976, 0,
        56, 53, 0, 0.00879, 0, 26, 24, -0.00489, 0.00879, 0, 55, 54, -0.00684,
        0.00391, 0, 59, 58, -0.00195, 0.00293, 0, 31, 29, 0, 0.00684, 0, 60, 57,
        -9.8e-4, 0.00683, 0,
      ],
      traj: [
        0.00781, 0.08353, 0.15925, 0.23496, 0.31068, 0.38639, 0.46211, 0.53783,
        0.61354, 0.68926, 0.76498, 0.84069, 0.91641, 0.99213, 0.99213, 0.99213,
        0.99213, 0.99213, 0.99213, 0.99213, 0.99213, 0.99213, 0.99213, 0.99213,
        0.99213, 0.99213, 0.99213, 0.99213, 0.99213, 0.94151, 0.89089, 0.84027,
        0.78965, 0.73903, 0.68841, 0.6378, 0.60742, 0.57705, 0.54668, 0.51631,
        0.48594, 0.45557, 0.4252, 0.38058, 0.33596, 0.29134, 0.27362, 0.25591,
        0.23819, 0.22047, 0.20585, 0.19123, 0.1766, 0.16198, 0.14736, 0.13273,
        0.11811, 0.10236, 0.08661, 0.07087, 0.05512, 0.03675, 0.01837, 0,
      ],
    },
    Ab = [
      0.00781, 0.25586, 0.50391, 0.75195, 1, 0.91601, 0.83202, 0.74803, 0.6378,
      0.52756, 0.48294, 0.43832, 0.3937, 0.33858, 0.28346, 0.22835, 0.18635,
      0.14436, 0.10236, 0.07612, 0.04987, 0.02362, 0.02307, 0.02252, 0.02197,
      0.02142, 0.02088, 0.02033, 0.01978, 0.01923, 0.01868, 0.01813, 0.01758,
      0.01703, 0.01648, 0.01593, 0.01538, 0.01483, 0.01428, 0.01373, 0.01318,
      0.01264, 0.01209, 0.01154, 0.01099, 0.01044, 0.00989, 0.00934, 0.00879,
      0.00824, 0.00769, 0.00714, 0.00659, 0.00604, 0.00549, 0.00494, 0.00439,
      0.00385, 0.0033, 0.00275, 0.0022, 0.00165, 0.0011, 5.5e-4,
    ],
    ma = Math.PI,
    mc = window.URL || window.webkitURL,
    J = new Image() /* the user-uploaded photo (raw, pre-crop) */,
    t = getId("canvas") /* 2D detection canvas for face-landmark detection */,
    E = t.getContext("2d") /* 2D context for detection canvas */,
    l = getId("ovcanvas") /* overlay canvas for drawing landmark dots */,
    p = l.getContext("2d") /* overlay canvas context */,
    ya = !1 /* true once face detection has succeeded */,
    B /* face-detection result object */,
    ba = 0,
    ca = 0,
    N,
    ja = 0,
    ka = 0,
    Bb,
    Cb = 0,
    Ga = !1,
    na = getId("work") /* off-screen work canvas for image processing */,
    $a = na.getContext("2d"),
    Db = getId("canvas3d") /* WebGL canvas element (800×800) */,
    ua = getId("texcanvas") /* texture atlas canvas (512×512) */,
    Ca = ua.getContext("2d"); /* texture atlas 2D context */

  /* ═══════════════════════════════════════════════════════════════
   *  SECTION 9 — DOM SETUP, FILE INPUT & BUTTON CONSTRUCTION
   *  Wire up the file-upload input, create all toolbar Button /
   *  Slider / RadioButton instances, and define the contour-group
   *  index arrays (W, pc, qc).
   * ═══════════════════════════════════════════════════════════════ */

  getId("file").value = "";
  getId("file").addEventListener(
    "change",
    function (a) {
      a.stopPropagation();
      a.preventDefault();
      a = a.target.files;
      if (a && a[0]) {
        var file = a[0];
        // Read file to save to local storage as dataURL
        var reader = new FileReader();
        reader.onload = function (e) {
          var dataURL = e.target.result;
          
          // Try to resize image to fit in local storage (usually 5MB limit)
          var img = new Image();
          img.onload = function() {
            var canvas = document.createElement("canvas");
            var maxDim = 800; // <--- Reduced from 1024 to 800 to guarantee it fits alongside the 3D generation payload in localStorage
            var width = img.width;
            var height = img.height;
            if (width > maxDim || height > maxDim) {
              if (width > height) {
                height = Math.round((height *= maxDim / width));
                width = maxDim;
              } else {
                width = Math.round((width *= maxDim / height));
                height = maxDim;
              }
            }
            canvas.width = width;
            canvas.height = height;
            var ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, width, height);
            
            var resizedDataURL = canvas.toDataURL("image/jpeg", 0.7);
            try {
              localStorage.setItem("savedFaceOriginal", resizedDataURL);
            } catch (err) {
              console.warn("Image too large to save to localStorage:", err);
            }
            
            // Proceed with loading
            J.src = resizedDataURL;
          };
          img.src = dataURL;
        };
        reader.readAsDataURL(file);
      }
    },
    !1,
  );
  document.onselectstart = function () {
    return !1;
  };
  var jc = !0,
    X = 0,
    oc = 192,
    Q = 648,
    r,
    m,
    yb,
    fa = !1,
    K,
    R = !1,
    cb = !1,
    aa = !1,
    Va = !1,
    za,
    H,
    I,
    M = -1;

  /* ────────────────────────────────────────────────────────────────
   * _btnIcon(label) — Generates a self-contained SVG data-URI that
   *   serves as a button thumbnail.  Eliminates the need for any
   *   external image files (the originals lived on a remote CDN).
   * ──────────────────────────────────────────────────────────────── */
  function _btnIcon(label) {
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48">' +
      '<rect width="48" height="48" rx="4" fill="#2a2a3a"/>' +
      '<text x="24" y="28" text-anchor="middle" fill="#ccc" ' +
      'font-size="9" font-family="sans-serif" font-weight="bold">' +
      label +
      "</text></svg>";
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  var Dc,
    Ec,
    Z,
    hb,
    ib,
    kb,
    mb,
    talkingBtn,
    Qa,
    ob,
    pb,
    sb,
    tb,
    vb,
    wb,
    xb,
    Pa,
    F,
    ia,
    zb,
    xc,
    Xb,
    Fa,
    oa,
    qb,
    da,
    Ea,
    Ra,
    y,
    pa,
    S,
    Ya,
    O,
    Vb,
    P,
    Ha,
    Wa,
    L,
    Xa,
    sa,
    la,
    U,
    wa;

  Dc = new Button("blefteye", _btnIcon("L\u00a0EYE"));
  Ec = new Button("brighteye", _btnIcon("R\u00a0EYE"));
  Z = new RadioButton(Dc, Ec, Ib);
  hb = new Button("bsmile", _btnIcon("SMILE"), "check", gb);
  ib = new Button("bsurprised", _btnIcon("SURPRISE"), "check", va);
  kb = new Button("bsad", _btnIcon("SAD"), "check", jb);
  mb = new Button("bangry", _btnIcon("ANGRY"), "check", lb);
  Qa = new Button("bblink", _btnIcon("BLINK"), "check", Wb);
  ob = new Button("bwink", _btnIcon("WINK"), "check", Yb);
  pb = new Button("bsquint", _btnIcon("SQUINT"), "check", Zb);
  sb = new Button("btennis", _btnIcon("TENNIS"), "check", rb);
  tb = new Button("bstatue", _btnIcon("STATUE"), "check", $b);
  vb = new Button("balien", _btnIcon("ALIEN"), "check", ac);
  wb = new Button("btoon", _btnIcon("TOON"), "check", bc);
  xb = new Button("bterminator", _btnIcon("TERMIN."), "check", cc);
  talkingBtn = new Button("btalking", _btnIcon("TALK"), "check", talkingToggle);
  Pa = [gb, va, jb, lb, talkingToggle];
  F = -1;
  ia = 1;
  zb = Array(3);
  xc = !0;
  Xb = [Wb, Yb];
  Fa = ia + 65;
  oa = 0;
  qb = [Zb, rb];
  da = -1;
  Ea = [$b, ac, bc, cc];
  Ra = Fa + 65;
  y = -1;
  pa = nb;
  S = !1;
  Ya = Ra + 65;
  Fb();
  var Ac = new Button("bpublish", _btnIcon("PUBLISH"), "button", function () {
    if (-1 != Ua)
      (alert("Please use your own face pic to publish"),
        (document.cookie = "splash:true"),
        window.location.reload());
    else {
      w && ((g.pause = !0), getId("audio").pause());
      var a = g.padef[1][0],
        b = g.padef[1][1],
        c = g.padef[1][3],
        e;
      for (e = 0; e < a.length; e++) a[e] = Number(new Number(a[e]).toFixed(6));
      for (e = 0; e < b.length; e++) b[e] = Number(new Number(b[e]).toFixed(6));
      for (e = 0; e < c.length; e++) c[e] = Number(new Number(c[e]).toFixed(6));
      glogged
        ? ((publishdlg.top = popuptop + window.pageYOffset + "px"),
          (dimmer.display = publishdlg.display = "block"),
          (publishflag = !0),
          displayId("pubsubmit", !0),
          displayId("uploading", !1),
          displayId("link", !1),
          (ra = new Ajax()))
        : onLoginDlg();
    }
  });
  new Button("bsnapshot", _btnIcon("SNAP"), "button", function () {
    g.renderFast();
    var a = getId("snapshot"),
      b = getId("snapshota");
    a.width = 128;
    a.height = 128;
    Db.toBlob
      ? Db.toBlob(function (c) {
          b.href = a.src = mc.createObjectURL(c);
        })
      : (a.src = Db.toDataURL());
  });
  var Aa = !1,
    G = !1,
    x = [-1, -1],
    u = [-1, -1],
    C = [-1, -1],
    La,
    ta = 5,
    Y = 0,
    z = Array(4),
    Ia = new Slider("scrop", 3, 20, 5, "Crop Size", function (a) {
      Math.min(z[2][1], z[3][1]) >= Math.min(x[1], u[1]) - (u[0] - x[0]) &&
      a <= ta
        ? Ia.setPos(ta)
        : (ta = a);
    }),
    xa = new Slider("scroppos", 0, 100, 0, "Crop Position", function (a) {
      Math.min(z[2][1], z[3][1]) >= Math.min(x[1], u[1]) - (u[0] - x[0]) &&
      a >= Y
        ? xa.setPos(Y)
        : (Y = a);
    }),
    W = [
      [0, 2, 4, 5, 7, 9, 10, 12, 14],
      [61, 62, 63, 64, 65, 66, 67],
      [15, 16, 18],
      [19, 20, 22],
      [23, 24, 25],
      [23, 26, 25],
      [28, 29, 30],
      [28, 31, 30],
      [34, 35, 36, 37, 38, 39, 40],
      [33, 52],
      [44, 51, 50, 49, 45],
      [44, 46, 47, 48, 45],
    ],
    pc = [
      [0, 20, 40, 50, 70, 90, 100, 120, 140],
      [0, 10, 20, 30, 40, 50, 60],
      [0, 10, 30],
      [0, 10, 30],
      [0, 20, 40],
      [0, 20, 40],
      [0, 20, 40],
      [0, 20, 40],
      [0, 10, 20, 40, 60, 70, 80],
      [0, 20],
      [0, 10, 20, 30, 40],
      [0, 10, 20, 30, 40],
    ],
    qc = [
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
      [61, 62, 63, 64, 65, 66, 67],
      [15, 16, 17, 18],
      [19, 20, 21, 22],
      [23, 53, 24, 54, 25],
      [23, 56, 26, 55, 25],
      [28, 57, 29, 58, 30],
      [28, 60, 31, 59, 30],
      [34, 35, 36, 42, 37, 43, 38, 39, 40],
      [33, 41, 52],
      [44, 51, 50, 49, 45],
      [44, 46, 47, 48, 45],
    ];

  /* ═══════════════════════════════════════════════════════════════
   *  SECTION 10 — LIFECYCLE & GLOBAL EVENT LISTENERS
   *  Splash screen, window.onload, J.onload (Image ready),
   *  clmtrackr events, mouse / touch / resize handlers, and
   *  the PhotoAnim prototype extension for UV refresh.
   * ═══════════════════════════════════════════════════════════════ */

  /* Show splash overlay on first visit (cookie check). */
  -1 == document.cookie.indexOf("splash", 0) &&
    (getStyle("splash").display = "block");
  window.onbeforeunload = function () {
    if (cb && -1 == Ua) return "Leaving without Publish...";
  };
  window.onload = function () {
    window.setTimeout("window.scrollTo(0,0);", 500);
  };
  /**
   * J.onload — Fires when the user's photo finishes loading.
   * Waits for clmtrackr (clm) to be ready, creates a tracker,
   * initialises the face model, and transitions to the detection
   * phase (face1 → visible).
   */
  J.onload = function () {
    "object" != typeof clm
      ? window.setTimeout(J.onload, 500)
      : ((K = new clm.tracker({ stopOnConvergence: !0 })),
        K.init(pModel),
        (getStyle("splash").display = "none"),
        (getStyle("startface").display = "none"),
        (getStyle("face0").display = "none"),
        (getStyle("face1").display = "block"), (typeof window.setCurrentScreen === "function" && window.setCurrentScreen(1)),
        (getStyle("face2").display =
          getStyle("face3").display =
          getStyle("face4").display =
            "none"),
        (Q = 648),
        (X = 0),
        Za(),
        -1 != Ua && (!window.isRestoring) && Kb());
  };
  document.addEventListener(
    "clmtrackrNotFound",
    function (a) {
      K.stop();
      fa ||
        ((fa = !0), (Q *= 1.5), 648 < Q ? bb() : window.setTimeout(Ka, 100));
    },
    !1,
  );
  document.addEventListener(
    "clmtrackrLost",
    function (a) {
      K.stop();
      fa ||
        ((fa = !0), (Q *= 1.5), 648 < Q ? bb() : window.setTimeout(Ka, 100));
    },
    !1,
  );
  document.addEventListener(
    "clmtrackrConverged",
    function (a) {
      K.stop();
      fa ||
        ((fa = !0),
        (a = K.getCurrentPosition()),
        71 != a.length
          ? ((Q *= 1.5), 648 < Q ? bb() : window.setTimeout(Ka, 100))
          : ((r = a), Mb()));
    },
    !1,
  );
  l.onmousemove = function (a) {
    if (!ya && R) {
      a.preventDefault();
      a.stopPropagation();
      var b = a.clientX,
        c = a.clientY,
        e = b - ja,
        d = c - ka;
      ja = b;
      ka = c;
      b = Ba(b, c);
      H = b.x;
      I = b.y;
      G
        ? ((C[0] = H), (C[1] = I))
        : ((aa = !0),
          Va
            ? 2 == a.buttons || a.shiftKey
              ? ha(0 < d ? 0.99 : 1.01, 0, 0)
              : -1 == M
                ? ha(1, e, d)
                : Pb(M, H, I)
            : (M = Rb(H, I)));
    }
  };
  l.oncontextmenu = function (a) {
    a.preventDefault();
  };
  l.onmousedown = function (a) {
    Va = !0;
    ja = a.clientX;
    ka = a.clientY;
    G && Jb();
  };
  l.onmouseup = function (a) {
    Va = !1;
    M = -1;
    aa = !0;
  };
  l.onmouseout = function (a) {
    Va = !1;
    M = -1;
    aa = !0;
  };
  var Eb = !1;
  l.ontouchstart = function (a) {
    ya = !0;
    if (R) {
      a.preventDefault();
      a.stopPropagation();
      Cb = 0;
      var b = a.touches;
      1 != b.length
        ? 2 == b.length &&
          ((a = b[1].pageX),
          (b = b[1].pageY),
          (Bb = (a - ja) * (a - ja) + (b - ka) * (b - ka)))
        : Ga ||
          ((a = b[0].pageX),
          (b = b[0].pageY),
          (ja = a),
          (ka = b),
          G
            ? ((a = Ba(a, b - 48)),
              (H = a.x),
              (I = a.y),
              (C[0] = H),
              (C[1] = I),
              Z.value ? (u[0] = -1) : (x[0] = -1))
            : ((a = Ba(a, b)), (H = a.x), (I = a.y), (M = Rb(H, I))));
    }
  };
  l.ontouchend = function (a) {
    a.preventDefault();
    a.stopPropagation();
    if (G) Jb();
    else if ((0 == a.touches.length && (Ga = !1), !(4 < Cb || Ga)))
      if (Eb) l.ondblclick(a);
      else
        ((Eb = !0),
          window.setTimeout(function () {
            Eb = !1;
          }, 500));
  };
  l.ontouchmove = function (a) {
    if (R) {
      a.preventDefault();
      a.stopPropagation();
      var b = a.touches;
      if (G)
        ((a = Ba(b[0].pageX, b[0].pageY - 48)),
          (H = a.x),
          (I = a.y),
          (C[0] = H),
          (C[1] = I));
      else {
        Cb++;
        a = b[0].pageX;
        var c = b[0].pageY;
        if (1 != b.length) {
          if (2 == b.length) {
            Ga = !0;
            var e = b[1].pageX;
            b = b[1].pageY;
            a = (e - a) * (e - a) + (b - c) * (b - c);
            c = a > Bb ? 1.01 : 0.99;
            Bb = a;
            ha(c, 0, 0);
          }
        } else if (!Ga) {
          e = a - ja;
          var d = c - ka;
          ja = a;
          ka = c;
          a = Ba(b[0].pageX, b[0].pageY);
          H = a.x;
          I = a.y;
          -1 != M ? Pb(M, H, I) : ha(1, e, d);
        }
      }
    }
  };
  l.ondblclick = function (a) {
    R &&
      !G &&
      (a.preventDefault(),
      a.stopPropagation(),
      B == N ? ha(2, 0, 0) : ((B = N), (ba = ca = 0), ha(1, 0, 0)));
  };
  l.onwheel = function (a) {
    R &&
      !G &&
      (a.preventDefault(),
      a.stopPropagation(),
      ha(0 < a.deltaY ? 0.9 : 1.1, 0, 0));
  };
  window.onresize = function () {
    if (!Aa) {
      var a = window.innerWidth,
        b = window.innerHeight,
        c = getId("header").offsetWidth,
        e = 800 < a ? 800 : a;
      N = B = e - 16;
      R && !G
        ? (getStyle("contour").width = getStyle("contour").height = e + "px")
        : (getStyle("contour").height = t.height + "px");
      e = getStyle("login");
      var d = getStyle("logged");
      glogged ? (d.display = "block") : (e.display = "block");
      logindlg.left =
        newaccountdlg.left =
        lostuserdlg.left =
        publishdlg.left =
          Math.floor(a / 2 - 170) + "px";
      popuptop = Math.floor(b / 2 - 216);
      0 > popuptop && (popuptop = 0);
      e = getStyle("glcontainer");
      d = getStyle("controlblock");
      a > b
        ? ((e["float"] = "left"),
          (a = c - 336),
          800 < a && (a = 800),
          (e.width = a - 32 + "px"),
          (d.width = "320px"))
        : ((e["float"] = ""), (e.width = a - 16 + "px"), (d.width = a + "px"));
    }
  };
  window.onresize();
  PhotoAnim.prototype.refreshTexCoord = function () {
    var a = this.gl,
      b = new Float32Array(this.texcoord),
      c = a.getAttribLocation(this.prog, "aTexCoord");
    a.enableVertexAttribArray(c);
    if (!this._texBuf) this._texBuf = a.createBuffer();
    a.bindBuffer(a.ARRAY_BUFFER, this._texBuf);
    a.bufferData(a.ARRAY_BUFFER, b, a.DYNAMIC_DRAW);
    a.vertexAttribPointer(c, 2, a.FLOAT, !1, 8, 0);
  };
  Button.prototype.force = function (a) {
    this.setState(a);
    this.on = a;
    this.oncolor = "rgba(0,255,0,0.5)";
  };
  var kc, lc, hc, ra;

  /* ═══════════════════════════════════════════════════════════════
   *  SECTION 10 — AI AGENT ANIMATION API  (v6 – smooth interpolation)
   *
   *  HOW THIS WORKS (ARCHITECTURE OVERVIEW)
   *  ──────────────────────────────────────
   *  This IIFE creates the entire system that makes the 3D face talk,
   *  blink, and emote when driven by the ElevenLabs AI agent.
   *
   *  There are THREE facial channels animated simultaneously:
   *
   *  ┌──────────────┬──────────────────────────────────────────────┐
   *  │ CHANNEL      │ HOW IT WORKS                                 │
   *  ├──────────────┼──────────────────────────────────────────────┤
   *  │ MOUTH        │ Variable `S` — expression anim object.       │
   *  │ (S channel)  │ Built by buildMouthAnim(openAmt, widthAmt).  │
   *  │              │ Controls jaw open + lip width (spread/purse). │
   *  │              │ Mouth-opening splices out lip-closure tris    │
   *  │              │ at index Ha from g.triangles; closing pushes  │
   *  │              │ them back from Wa[].                          │
   *  ├──────────────┼──────────────────────────────────────────────┤
   *  │ EYES/BROWS   │ Variable `pa` — expression anim object.      │
   *  │ (pa channel) │ Built by buildEyeBrowAnim(lidScale, browScale)│
   *  │              │ every frame from interpolated values.         │
   *  │              │ Eyelid closure scales nb (blink) keydots.     │
   *  │              │ Brow raise scales tc (surprised) keydots.     │
   *  │              │ Brow frown scales uc (sad) keydots.           │
   *  ├──────────────┼──────────────────────────────────────────────┤
   *  │ TEXT→MOUTH   │ processTextToMouth(text) tokenizes words,     │
   *  │              │ maps each char to a viseme [jawOpen, lipWidth],│
   *  │              │ applies coarticulation, and schedules targets  │
   *  │              │ via setMouthTarget().                          │
   *  └──────────────┴──────────────────────────────────────────────┘
   *
   *  SMOOTH INTERPOLATION (KEY TO NATURAL LOOK)
   *  ───────────────────────────────────────────
   *  Everything uses per-frame linear interpolation (lerp):
   *    currentValue += (targetValue - currentValue) * lerpFactor
   *
   *  A single requestAnimationFrame loop (smoothUpdate) runs ~60fps
   *  and interpolates ALL channels simultaneously:
   *    - curOpen    → tgtOpen    (mouth openness)
   *    - curWidth   → tgtWidth   (lip spread/purse)
   *    - curLidClose → tgtLidClose (0=open, 1=shut)
   *    - curBrowRaise → tgtBrowRaise (+ve=raised, -ve=frown)
   *
   *  Animation functions just SET TARGETS; the loop does the rest.
   *  This eliminates glitchy instant-swap artifacts.
   *
   *  LERP FACTORS (tuned for natural feel):
   *    LERP_LID_CLOSE = 0.38 — fast snap down (blinks are quick)
   *    LERP_LID_OPEN  = 0.14 — slow ease open (natural lid lift)
   *    LERP_BROW      = 0.06 — very slow (silky smooth brow glide)
   *    LERP_OPEN_UP   = 0.20 — mouth opens moderately fast
   *    LERP_OPEN_DOWN = 0.42 — mouth closes faster than it opens
   *    LERP_WIDTH     = 0.22 — lip width changes at medium speed
   *
   *  KEYDOT REFERENCE (used in this section):
   *  ──────────────────────────────────────────
   *  Face is defined by 71 landmark points (keydots 0-70).
   *  Each keydot maps to a mesh vertex via array L[keydotIndex].
   *  Moving a keydot deforms surrounding vertices via binding weights.
   *
   *    EYELIDS:   53-56 (left eye), 57-60 (right eye)
   *      53 = left upper lid inner    56 = left upper lid outer
   *      54 = left lower lid inner    55 = left lower lid outer
   *      57 = right upper lid inner   60 = right upper lid outer
   *      58 = right lower lid inner   59 = right lower lid outer
   *
   *    EYE CORNERS: 24, 26 (left), 29, 31 (right)
   *
   *    EYEBROWS:  15-18 (left brow), 19-22 (right brow)
   *      15 = left outer    16 = left mid-outer
   *      17 = left mid-inner  18 = left inner
   *      19 = right inner   20 = right mid-inner
   *      21 = right mid-outer  22 = right outer
   *      23, 28 = brow arch peaks
   *
   *    MOUTH:     44-51
   *      44 = left corner    45 = right corner
   *      46 = lower lip center  47 = lower lip left  48 = lower lip right
   *      49 = upper lip left    50 = upper lip center 51 = upper lip right
   *
   *    CHIN:      6, 7, 8
   *    CHEEKS:    3, 4, 5 (left), 9, 10, 11 (right)
   *
   *  EXPRESSION DATA OBJECTS USED:
   *    nb       = BLINK — moves keydots 53-60, 24, 26, 29, 31
   *    tc       = SURPRISED — keydots 15-22 (brows UP), 44-48 (jaw OPEN)
   *    uc       = SAD — keydots 15-22 (brows DOWN), 44-45 (corners DOWN)
   *    sc       = SMILE — keydots 44-45 (corners OUT+UP), 3-5, 9-11 (cheeks)
   *    talkAnim = TALK — keydots 44-48, 6-8 (jaw only, NO brows)
   *
   *  PUBLIC API (exposed on window via D = this):
   *    aiAnimStartSpeaking() — called when AI starts talking
   *    aiAnimStopSpeaking()  — called when AI stops talking
   *    aiAnimMouthText(text) — feed text to drive mouth shapes
   *    aiAnimStartBlink()    — start blink + brow timers
   *    aiAnimStopBlink()     — stop all eye/brow animation
   *    aiAnimIsReady()       — check if face is loaded
   *    aiToggleControls()    — show/hide expression control panel
   * ═══════════════════════════════════════════════════════════════ */
  (function () {
    var aiBlinkTimer = null;
    var aiSpeaking = false;
    var aiAnimFrame = null; /* unified rAF handle */
    var aiBrowTimer = null;
    var aiBrowClearTimer = null;
    var aiIdleMouthTimer = null;
    var aiTextActive = false;
    var eyeBrowActive = false; /* true when eye/brow system is running */

    /* ── Mouth state (interpolated each frame) ── */
    var curOpen = 0,
      curWidth = 0;
    var tgtOpen = 0,
      tgtWidth = 0;

    /* ── Eye/brow state (interpolated each frame) ── */
    var curLidClose = 0; /* 0 = open, 1 = fully shut */
    var tgtLidClose = 0;
    var curBrowRaise = 0; /* +ve = raised (surprised), -ve = frown */
    var tgtBrowRaise = 0;

    /* ── Lerp factors ── */
    var LERP_OPEN_UP = 0.2;
    var LERP_OPEN_DOWN = 0.42;
    var LERP_WIDTH = 0.22;
    var LERP_LID_CLOSE = 0.38; /* fast close for snappy blink */
    var LERP_LID_OPEN = 0.14; /* slower open — natural, not glitchy */
    var LERP_BROW = 0.06; /* very slow = silky smooth brow movement */
    var EPSILON = 0.003;
    var LID_EPS = 0.008;
    var BROW_EPS = 0.004;

    /* ────────────────────────────────────────────────────
     *  VISEME TABLE — Maps phonemes to mouth shapes
     *  Each viseme is [jawOpen, lipWidth]:
     *    jawOpen:  0.0 = closed, 0.38 = max open
     *    lipWidth: -0.65 = max purse (shrink), +0.50 = max spread
     *
     *  WHAT MAKES THE MOUTH SHRINK:
     *    Negative lipWidth values (V_OH, V_OO, V_W_GLIDE, V_BILABIAL,
     *    V_PALATAL) cause buildMouthAnim() to push keydots 44-45
     *    (mouth corners) INWARD, keydots 49-51 (upper lip) FORWARD,
     *    and keydots 46-48 (lower lip) FORWARD — creating a pucker.
     *    Cheek keydots 3,5,9,11 also pull inward for visible shrink.
     *
     *  WHAT MAKES THE MOUTH SPREAD:
     *    Positive lipWidth values (V_AH, V_EH, V_EE) use the smile
     *    expression (sc) keydots scaled by widthAmt — pulling corners
     *    44-45 outward and cheeks up, like a smile shape.
     * ──────────────────────────────────────────────────── */
    var V_REST = [0.0, 0.0];
    var V_BILABIAL = [0.0, -0.12];
    var V_LABDENT = [0.04, 0.05];
    var V_DENTAL = [0.06, 0.1];
    var V_ALVEOLAR = [0.08, 0.07];
    var V_PALATAL = [0.09, -0.12];
    var V_VELAR = [0.12, 0.0];
    var V_GLOTTAL = [0.14, 0.05];
    var V_AH = [0.32, 0.3];
    var V_EH = [0.22, 0.35];
    var V_EE = [0.12, 0.5];
    var V_OH = [0.28, -0.55];
    var V_OO = [0.18, -0.65];
    var V_W_GLIDE = [0.14, -0.5];
    var V_Y_GLIDE = [0.1, 0.3];

    var visemeOf = {
      a: V_AH,
      e: V_EH,
      i: V_EE,
      o: V_OH,
      u: V_OO,
      b: V_BILABIAL,
      p: V_BILABIAL,
      m: V_BILABIAL,
      f: V_LABDENT,
      v: V_LABDENT,
      t: V_ALVEOLAR,
      d: V_ALVEOLAR,
      n: V_ALVEOLAR,
      l: V_ALVEOLAR,
      s: V_ALVEOLAR,
      z: V_ALVEOLAR,
      r: V_PALATAL,
      j: V_PALATAL,
      k: V_VELAR,
      g: V_VELAR,
      h: V_GLOTTAL,
      w: V_W_GLIDE,
      y: V_Y_GLIDE,
      c: V_VELAR,
      q: V_VELAR,
      x: V_ALVEOLAR,
      " ": V_REST,
      ".": V_REST,
      ",": V_REST,
      "!": V_REST,
      "?": V_REST,
      "-": V_REST,
      "'": V_REST,
      '"': V_REST,
      ":": V_REST,
      ";": V_REST,
    };
    var digraphViseme = {
      th: V_DENTAL,
      sh: V_PALATAL,
      ch: V_PALATAL,
      ng: V_VELAR,
      wh: V_W_GLIDE,
      oo: V_OO,
      ee: V_EE,
      ou: V_OH,
      ow: V_OH,
      ai: V_EH,
      ea: V_EE,
      ie: V_EE,
      oa: V_OH,
    };

    /* ── safeT() ── */
    function safeT() {
      if (g && g.trajectory && wa && typeof Ya !== "undefined") {
        try {
          T();
        } catch (e) {}
      }
    }

    /* ── flat trajectory helper ── */
    function flatTraj() {
      var t = [];
      for (var j = 0; j < 64; j++) t.push(1.0);
      return t;
    }
    var _flatTraj = flatTraj(); /* cache one copy */

    /* ────────────────────────────────────────────────────
     *  buildMouthAnim(openAmt, widthAmt) → expression object or null
     *
     *  THIS IS WHAT MAKES THE MOUTH MOVE.
     *  Constructs an expression anim object assigned to variable S.
     *
     *  Three stages:
     *  1) JAW OPENING: scales talkAnim keydots (44-48 mouth, 6-8 chin)
     *     by openAmt. talkAnim.anim has keydot 46 dy=-0.054 at full
     *     scale, so openAmt=0.32 → effective dy=-0.017 (moderate open).
     *
     *  2) LIP SPREAD (widthAmt > 0): scales smile (sc) keydots
     *     44,45 (corners), 3,5,9,11,4,10 (cheeks) to pull mouth wide.
     *     Multipliers: dx*0.85, dy*0.55, dz*0.65.
     *
     *  3) LIP PURSING (widthAmt < 0): pushes corners 44,45 INWARD
     *     (dx=±0.032*abs), upper lip 49-51 FORWARD (dz=0.022*abs),
     *     lower lip 46-48 FORWARD (dz=0.018*abs), cheeks 3,5,9,11
     *     INWARD (dx=±0.008*abs). This creates visible lip shrink.
     * ──────────────────────────────────────────────────── */
    function buildMouthAnim(openAmt, widthAmt) {
      var dst = [];
      if (talkAnim && openAmt > 0.005) {
        var src = talkAnim.anim;
        for (var i = 0; i < src.length; i += 5) {
          dst.push(
            src[i],
            src[i + 1],
            src[i + 2] * openAmt,
            src[i + 3] * openAmt,
            src[i + 4] * openAmt,
          );
        }
      }
      if (sc && widthAmt > 0.01) {
        var smSrc = sc.anim;
        for (var i = 0; i < smSrc.length; i += 5) {
          var kd = smSrc[i];
          if (
            kd === 44 ||
            kd === 45 ||
            kd === 3 ||
            kd === 5 ||
            kd === 9 ||
            kd === 11 ||
            kd === 4 ||
            kd === 10
          ) {
            dst.push(
              smSrc[i],
              smSrc[i + 1],
              smSrc[i + 2] * widthAmt * 0.85,
              smSrc[i + 3] * widthAmt * 0.55,
              smSrc[i + 4] * widthAmt * 0.65,
            );
          }
        }
      }
      if (widthAmt < -0.01) {
        var absW = Math.abs(widthAmt);
        dst.push(44, 44, 0.032 * absW, 0.012 * absW, 0.014 * absW);
        dst.push(45, 45, -0.032 * absW, 0.012 * absW, 0.014 * absW);
        dst.push(49, 49, 0, 0.006 * absW, 0.022 * absW);
        dst.push(50, 50, 0, 0.006 * absW, 0.022 * absW);
        dst.push(51, 51, 0, 0.006 * absW, 0.022 * absW);
        dst.push(46, 46, 0, -0.004 * absW, 0.018 * absW);
        dst.push(47, 47, 0, -0.004 * absW, 0.018 * absW);
        dst.push(48, 48, 0, -0.004 * absW, 0.018 * absW);
        dst.push(3, 3, 0.008 * absW, 0, 0);
        dst.push(5, 5, -0.008 * absW, 0, 0);
        dst.push(9, 9, 0.006 * absW, 0, 0);
        dst.push(11, 11, -0.006 * absW, 0, 0);
      }
      if (dst.length === 0) return null;
      return { anim: dst, traj: _flatTraj };
    }

    /* ────────────────────────────────────────────────────
     *  buildEyeBrowAnim(lidScale, browScale) → expression object or false
     *
     *  THIS IS WHAT MAKES BLINKS & BROWS SMOOTH.
     *  Called EVERY FRAME by smoothUpdate(). Constructs the pa
     *  expression object from current interpolated values.
     *
     *  EYELID CLOSURE (lidScale 0..1):
     *    Scales all nb.anim keydots (53-60 eyelids, 24/26/29/31
     *    eye corners) by lidScale. At lidScale=1.0 the displacement
     *    matches a full blink. At 0.3 it's a partial "almost-blink".
     *    Key movements: keydot 53 dy=-0.017*scale (upper lid drops),
     *    keydot 56 dy=+0.009*scale (counter-rise for natural shape).
     *
     *  EYEBROW MOVEMENT (browScale -0.3..+0.3):
     *    Positive: scales tc (surprised) brow keydots 15-22.
     *      At browScale=0.25: keydot 18 dy=+0.035*0.25=+0.009 (raises)
     *    Negative: scales uc (sad) brow keydots 15-22.
     *      At browScale=-0.15: keydot 19 dy=-0.013*0.15=-0.002 (lowers)
     *    Only keydots 15-22 are extracted (no mouth/chin from tc/uc).
     * ──────────────────────────────────────────────────── */
    function buildEyeBrowAnim(lidScale, browScale) {
      var dst = [];

      /* Eyelid closure — scale nb keydots by current lidScale */
      if (lidScale > 0.01 && nb) {
        var src = nb.anim;
        for (var i = 0; i < src.length; i += 5) {
          dst.push(
            src[i],
            src[i + 1],
            src[i + 2] * lidScale,
            src[i + 3] * lidScale,
            src[i + 4] * lidScale,
          );
        }
      }

      /* Brow raise (positive browScale → tc/surprised brow keydots)
         or frown (negative browScale → uc/sad brow keydots) */
      if (Math.abs(browScale) > 0.005) {
        var browExpr = browScale > 0 ? tc : uc;
        if (browExpr) {
          var s = Math.abs(browScale);
          var bSrc = browExpr.anim;
          for (var i = 0; i < bSrc.length; i += 5) {
            if (bSrc[i] >= 15 && bSrc[i] <= 22) {
              dst.push(
                bSrc[i],
                bSrc[i + 1],
                bSrc[i + 2] * s,
                bSrc[i + 3] * s,
                bSrc[i + 4] * s,
              );
            }
          }
        }
      }

      if (dst.length === 0) return false;
      return { anim: dst, traj: _flatTraj };
    }

    /* ────────────────────────────────────────────────────
     *  smoothUpdate() — THE CORE ANIMATION LOOP
     *  Runs via requestAnimationFrame at ~60fps.
     *  Interpolates ALL facial channels simultaneously:
     *
     *  1. MOUTH: lerp curOpen→tgtOpen, curWidth→tgtWidth
     *     Then splice mouth triangles and set S = buildMouthAnim()
     *
     *  2. EYELIDS: lerp curLidClose→tgtLidClose
     *     Close lerp=0.38 (fast snap), open lerp=0.14 (slow ease)
     *
     *  3. EYEBROWS: lerp curBrowRaise→tgtBrowRaise
     *     Lerp=0.06 (very slow for silky smooth movement)
     *
     *  4. BUILD pa = buildEyeBrowAnim(curLidClose, curBrowRaise)
     *
     *  5. Call safeT() → T() to push all changes to WebGL
     *
     *  Loop stays alive while any channel is still moving OR
     *  the face is in speaking/active mode.
     * ──────────────────────────────────────────────────── */
    function smoothUpdate() {
      if (!g || !g.trajectory) {
        aiAnimFrame = null;
        return;
      }

      /* ── MOUTH interpolation ── */
      var dOpen = tgtOpen - curOpen;
      var dWidth = tgtWidth - curWidth;
      var openLerp = dOpen < 0 ? LERP_OPEN_DOWN : LERP_OPEN_UP;
      if (Math.abs(dOpen) > EPSILON) curOpen += dOpen * openLerp;
      else curOpen = tgtOpen;
      if (Math.abs(dWidth) > EPSILON) curWidth += dWidth * LERP_WIDTH;
      else curWidth = tgtWidth;
      curOpen = Math.max(0, Math.min(0.38, curOpen));
      curWidth = Math.max(-0.7, Math.min(0.55, curWidth));

      var tri = g.triangles;
      if (curOpen > 0.012) {
        if (tri.length > Ha) tri.splice(Ha, tri.length - Ha);
        S = buildMouthAnim(curOpen, curWidth);
      } else {
        S = false;
        if (tri.length <= Ha) {
          for (var e = 0; e < Wa.length; e++) tri.push(Wa[e]);
        }
      }

      /* ── EYELID interpolation ── */
      var dLid = tgtLidClose - curLidClose;
      var lidLerp = dLid > 0 ? LERP_LID_CLOSE : LERP_LID_OPEN;
      if (Math.abs(dLid) > LID_EPS) curLidClose += dLid * lidLerp;
      else curLidClose = tgtLidClose;
      curLidClose = Math.max(0, Math.min(1.0, curLidClose));

      /* ── BROW interpolation ── */
      var dBrow = tgtBrowRaise - curBrowRaise;
      if (Math.abs(dBrow) > BROW_EPS) curBrowRaise += dBrow * LERP_BROW;
      else curBrowRaise = tgtBrowRaise;
      curBrowRaise = Math.max(-0.3, Math.min(0.3, curBrowRaise));

      /* ── BUILD pa from interpolated eye+brow ── */
      pa = buildEyeBrowAnim(curLidClose, curBrowRaise);

      safeT();

      /* Keep loop alive while anything is animating or active */
      var mouthMoving = Math.abs(dOpen) > EPSILON || Math.abs(dWidth) > EPSILON;
      var lidMoving = Math.abs(dLid) > LID_EPS;
      var browMoving = Math.abs(dBrow) > BROW_EPS;
      if (
        aiSpeaking ||
        eyeBrowActive ||
        mouthMoving ||
        lidMoving ||
        browMoving
      ) {
        aiAnimFrame = requestAnimationFrame(smoothUpdate);
      } else {
        aiAnimFrame = null;
      }
    }

    /* ── Ensure the animation loop is running ── */
    function ensureLoop() {
      if (!aiAnimFrame && g && g.trajectory) {
        aiAnimFrame = requestAnimationFrame(smoothUpdate);
      }
    }

    function setMouthTarget(open, width) {
      tgtOpen = open;
      tgtWidth = width;
      ensureLoop();
    }
    function closeMouth() {
      setMouthTarget(0, 0);
    }

    /* ────────────────────────────────────────────────────
     *  BLINKS — WHAT MAKES THE EYES BLINK
     *
     *  HOW A BLINK WORKS:
     *  1. doSingleBlink() sets tgtLidClose = 1.0
     *  2. smoothUpdate() lerps curLidClose toward 1.0 at rate 0.38
     *     → lid closes in ~3-4 frames (~50-70ms)
     *  3. After 110-140ms, tgtLidClose is set back to 0
     *  4. smoothUpdate() lerps back at rate 0.14 (slower open)
     *     → lid opens in ~8-10 frames (~130-170ms)
     *  5. Total blink duration: ~180-300ms (natural range)
     *
     *  WHAT THE BLINK MOVES:
     *  buildEyeBrowAnim passes curLidClose as scale to nb.anim:
     *    Keydot 53 (L upper lid inner): dy = -0.017 * scale  (drops)
     *    Keydot 56 (L upper lid outer): dy = +0.009 * scale  (counter)
     *    Keydot 54 (L lower lid inner): dy = -0.016 * scale  (rises)
     *    Keydot 55 (L lower lid outer): dy = +0.004 * scale  (counter)
     *    Keydots 57-60: mirror for right eye
     *    Keydots 24,26,29,31: eye corners shift during closure
     *
     *  BLINK TYPES:
     *    65% — Full blink (tgtLidClose=1.0)
     *    17% — Partial blink (tgtLidClose=0.3-0.5, looks like thinking)
     *    10% — Eyelid narrow (tgtLidClose=0.12-0.20, like focusing)
     *     8% — Skip (natural variation, no action)
     *    15% of full blinks get a double-blink 280-360ms later
     *
     *  FREQUENCY:
     *    Exponential distribution, mean 3s (speaking) / 4.5s (idle)
     *    Min gap: 1.8s, max gap: 9s
     *    First blink: 0.8-2.3s after activation (so user sees it)
     * ──────────────────────────────────────────────────── */
    function doSingleBlink() {
      if (!g || !g.trajectory) return;
      tgtLidClose = 1.0;
      ensureLoop();
      /* Start opening after lid has closed (~110ms at 0.38 lerp) */
      setTimeout(
        function () {
          tgtLidClose = 0;
        },
        110 + Math.random() * 30,
      );
    }

    function doPartialBlink() {
      if (!g || !g.trajectory) return;
      /* Lids drop 30-50% — NOT a full blink, looks like thinking */
      var target = 0.3 + Math.random() * 0.2;
      tgtLidClose = target;
      ensureLoop();
      /* Hold partially closed for 200-400ms then reopen */
      setTimeout(
        function () {
          tgtLidClose = 0;
        },
        200 + Math.random() * 200,
      );
    }

    function doEyelidNarrow() {
      if (!g || !g.trajectory) return;
      /* Very subtle 12-20% drop — like focusing */
      tgtLidClose = 0.12 + Math.random() * 0.08;
      ensureLoop();
      /* Hold for 500-1000ms */
      setTimeout(
        function () {
          tgtLidClose = 0;
        },
        500 + Math.random() * 500,
      );
    }

    function startAIBlink() {
      if (aiBlinkTimer) return;
      eyeBrowActive = true;
      function scheduleNext() {
        /* MORE frequent: mean 3s speaking, 4.5s idle */
        var mean = aiSpeaking ? 3000 : 4500;
        var gap = -mean * Math.log(Math.random() + 0.001);
        gap = Math.max(1800, Math.min(9000, gap));
        aiBlinkTimer = setTimeout(function () {
          aiBlinkTimer = null;
          var r = Math.random();
          if (r < 0.65) {
            doSingleBlink(); /* 65%: normal blink */
          } else if (r < 0.82) {
            doPartialBlink(); /* 17%: partial (almost-blink) */
          } else if (r < 0.92) {
            doEyelidNarrow(); /* 10%: narrow/squint */
          }
          /* 8%: nothing (skip) — natural variation */

          /* 15% chance of double-blink */
          if (r < 0.65 && Math.random() < 0.15) {
            setTimeout(
              function () {
                doSingleBlink();
              },
              280 + Math.random() * 80,
            );
          }
          scheduleNext();
        }, gap);
      }
      /* First blink quickly so user sees it */
      aiBlinkTimer = setTimeout(
        function () {
          aiBlinkTimer = null;
          doSingleBlink();
          scheduleNext();
        },
        800 + Math.random() * 1500,
      );
      ensureLoop();
    }

    function stopAIBlink() {
      if (aiBlinkTimer) {
        clearTimeout(aiBlinkTimer);
        aiBlinkTimer = null;
      }
      eyeBrowActive = false;
      tgtLidClose = 0;
    }

    /* ────────────────────────────────────────────────────
     *  EYEBROW DRIFT — WHAT MAKES EYEBROWS MOVE UP AND DOWN
     *
     *  HOW IT WORKS:
     *  1. driftTick() sets tgtBrowRaise to a random value
     *  2. smoothUpdate() lerps curBrowRaise toward target at rate 0.06
     *     → eyebrows glide over ~0.5-1.0 seconds (very smooth)
     *  3. After 1.5-4s, tgtBrowRaise returns to 0 (neutral)
     *  4. Next drift scheduled 2.5-5s (speaking) or 4-8s (idle)
     *
     *  WHAT THE BROWS MOVE:
     *  buildEyeBrowAnim uses browScale to pick expression:
     *    Positive (raise): tc.anim keydots 15-22 (surprised brow data)
     *      Keydot 18 (L inner brow): dy = +0.035 * scale (rises)
     *      Keydot 17 (L mid-inner):  dy = +0.035 * scale
     *      Keydot 16 (L mid-outer):  dy = +0.025 * scale
     *      Keydot 15 (L outer brow): dy = +0.021 * scale
     *      Keydots 19-22: right brow mirror
     *    Negative (frown): uc.anim keydots 15-22 (sad brow data)
     *      Keydot 19 (R inner brow): dy = -0.013 * scale (drops)
     *      Keydot 17 (L mid-inner):  dy = -0.007 * scale
     *
     *  RANGE:
     *    Speaking: base=0.12 ± 0.14 (can reach 0.26 raise)
     *    Idle:    base=0.06 ± 0.08 (gentler, up to 0.14)
     *    40% raise, 20% frown, 40% return to neutral
     *    Clamped to ±0.30 maximum
     * ──────────────────────────────────────────────────── */
    function startBrowDrift() {
      if (aiBrowTimer) return;
      function driftTick() {
        if (!g || !g.trajectory) {
          aiBrowTimer = null;
          return;
        }

        var r = Math.random();
        /* Stronger while speaking, gentler idle */
        var base = aiSpeaking ? 0.12 : 0.06;
        var range = aiSpeaking ? 0.14 : 0.08;

        if (r < 0.4) {
          /* Raise brows */
          tgtBrowRaise = base + Math.random() * range;
        } else if (r < 0.6) {
          /* Lower/frown brows */
          tgtBrowRaise = -(base * 0.6 + Math.random() * range * 0.5);
        } else {
          /* Return to neutral */
          tgtBrowRaise = 0;
        }
        ensureLoop();

        /* Auto-return to neutral after 1.5-4s */
        if (aiBrowClearTimer) clearTimeout(aiBrowClearTimer);
        aiBrowClearTimer = setTimeout(
          function () {
            aiBrowClearTimer = null;
            tgtBrowRaise = 0;
            ensureLoop();
          },
          1500 + Math.random() * 2500,
        );

        /* Next drift: 2.5-5s speaking, 4-8s idle */
        var gap = aiSpeaking
          ? 2500 + Math.random() * 2500
          : 4000 + Math.random() * 4000;
        aiBrowTimer = setTimeout(driftTick, gap);
      }
      aiBrowTimer = setTimeout(driftTick, 1200 + Math.random() * 1500);
    }

    function stopBrowDrift() {
      if (aiBrowTimer) {
        clearTimeout(aiBrowTimer);
        aiBrowTimer = null;
      }
      if (aiBrowClearTimer) {
        clearTimeout(aiBrowClearTimer);
        aiBrowClearTimer = null;
      }
      tgtBrowRaise = 0;
      ensureLoop();
    }

    /* ────────────────────────────────────────────────────
     *  FALLBACK IDLE MOUTH — subtle movement when audio plays
     *  but no text has arrived yet. Prevents a static mouth
     *  while the AI audio is audible. Opens 0.06-0.20 with
     *  random width ±0.10 every 250-450ms, then closes.
     * ──────────────────────────────────────────────────── */
    function startIdleMouth() {
      if (aiIdleMouthTimer) return;
      function idleTick() {
        if (!aiSpeaking || aiTextActive) {
          aiIdleMouthTimer = null;
          return;
        }
        var open = 0.06 + Math.random() * 0.14;
        var width = (Math.random() - 0.5) * 0.2;
        setMouthTarget(open, width);
        setTimeout(
          function () {
            if (aiSpeaking && !aiTextActive) setMouthTarget(0.02, 0);
          },
          120 + Math.random() * 80,
        );
        aiIdleMouthTimer = setTimeout(idleTick, 250 + Math.random() * 200);
      }
      aiIdleMouthTimer = setTimeout(idleTick, 300);
    }
    function stopIdleMouth() {
      if (aiIdleMouthTimer) {
        clearTimeout(aiIdleMouthTimer);
        aiIdleMouthTimer = null;
      }
    }

    /* ────────────────────────────────────────────────────
     *  TEXT-TO-MOUTH — WHAT MAKES MOUTH SHAPE WORDS
     *
     *  processTextToMouth(text) receives AI transcript text and:
     *  1. Tokenizes into words, whitespace, and punctuation
     *  2. For each word, iterates characters left-to-right
     *  3. Maps each char (or digraph like "th","sh") to a viseme
     *  4. Applies coarticulation: blends 25% of NEXT viseme shape
     *  5. Adds ±10-12% random variation for organic feel
     *  6. Sets mouth target via setMouthTarget(open, width)
     *
     *  TIMING:
     *    Vowels hold 90-130ms, consonants 60-90ms
     *    Bilabials (b/m/p) snap shut with width=-0.10 for 55-80ms
     *    Whitespace → full closure for 70-120ms (word boundary)
     *    Periods/excl/question → 280-400ms pause (sentence break)
     *    Commas/semicolons → 160-220ms pause
     *
     *  When text runs out but AI is still speaking, falls back
     *  to startIdleMouth() for subtle random movement.
     * ──────────────────────────────────────────────────── */
    var activeTextTimer = null;

    function getViseme(ch, nextCh) {
      if (nextCh) {
        var pair = (ch + nextCh).toLowerCase();
        if (digraphViseme[pair]) return { v: digraphViseme[pair], skip: true };
      }
      return { v: visemeOf[ch.toLowerCase()] || V_ALVEOLAR, skip: false };
    }

    function processTextToMouth(text) {
      if (!g || !g.trajectory || !text) return;
      if (activeTextTimer) {
        clearTimeout(activeTextTimer);
        activeTextTimer = null;
      }

      aiTextActive = true;
      stopIdleMouth();

      var tokens = text.match(/[a-zA-Z']+|[^a-zA-Z'\s]+|\s+/g);
      if (!tokens) {
        aiTextActive = false;
        startIdleMouth();
        return;
      }

      var tIdx = 0;

      function processToken() {
        if (tIdx >= tokens.length || !aiSpeaking) {
          setMouthTarget(0, 0);
          activeTextTimer = null;
          aiTextActive = false;
          if (aiSpeaking) startIdleMouth();
          return;
        }

        var token = tokens[tIdx];
        tIdx++;

        if (/^\s+$/.test(token)) {
          setMouthTarget(0, 0);
          activeTextTimer = setTimeout(processToken, 70 + Math.random() * 50);
          return;
        }

        if (/^[^a-zA-Z']+$/.test(token)) {
          setMouthTarget(0, 0);
          var pMs = 100;
          if (
            token.indexOf(".") >= 0 ||
            token.indexOf("!") >= 0 ||
            token.indexOf("?") >= 0
          )
            pMs = 280 + Math.random() * 120;
          else if (token.indexOf(",") >= 0 || token.indexOf(";") >= 0)
            pMs = 160 + Math.random() * 60;
          activeTextTimer = setTimeout(processToken, pMs);
          return;
        }

        var chars = token.split("");
        var cIdx = 0;

        function processChar() {
          if (cIdx >= chars.length || !aiSpeaking) {
            processToken();
            return;
          }

          var ch = chars[cIdx];
          var nextCh = cIdx < chars.length - 1 ? chars[cIdx + 1] : null;
          var info = getViseme(ch, nextCh);
          var shape = info.v;

          var finalOpen = shape[0];
          var finalWidth = shape[1];

          var lookAhead = info.skip ? cIdx + 2 : cIdx + 1;
          if (lookAhead < chars.length) {
            var nextInfo = getViseme(
              chars[lookAhead],
              lookAhead + 1 < chars.length ? chars[lookAhead + 1] : null,
            );
            finalOpen = finalOpen * 0.75 + nextInfo.v[0] * 0.25;
            finalWidth = finalWidth * 0.75 + nextInfo.v[1] * 0.25;
          }

          finalOpen *= 0.9 + Math.random() * 0.2;
          finalWidth *= 0.88 + Math.random() * 0.24;
          finalOpen = Math.min(finalOpen, 0.35);

          var lch = ch.toLowerCase();
          if (lch === "b" || lch === "m" || lch === "p") {
            setMouthTarget(0, -0.1);
            cIdx += info.skip ? 2 : 1;
            activeTextTimer = setTimeout(processChar, 55 + Math.random() * 25);
            return;
          }

          setMouthTarget(finalOpen, finalWidth);
          cIdx += info.skip ? 2 : 1;

          var isVowel = "aeiou".indexOf(lch) >= 0;
          var delay = isVowel
            ? 90 + Math.random() * 40
            : 60 + Math.random() * 30;
          activeTextTimer = setTimeout(processChar, delay);
        }
        processChar();
      }
      processToken();
    }

    /* ────────────────────────────────────────────────────
     *  PUBLIC API — called from home.jsx via window.aiAnim*()
     *
     *  Lifecycle (driven by ElevenLabs useConversation hook):
     *  1. Face loads → on3dFace calls aiAnimStartBlink() after 600ms
     *     → starts blinking + brow drift immediately
     *  2. User clicks Speak → toggleConversation() → startSession()
     *     → onConnect fires → aiAnimStartBlink() (redundant, safe)
     *  3. AI starts speaking → isSpeaking=true → aiAnimStartSpeaking()
     *     → starts idle mouth + ensures loop running
     *  4. AI transcript arrives → onMessage → aiAnimMouthText(newText)
     *     → processTextToMouth() drives character-by-character shapes
     *  5. AI stops speaking → isSpeaking=false → aiAnimStopSpeaking()
     *     → closes mouth, stops idle; blinks+brows continue idle
     *  6. User ends session → onDisconnect → aiAnimStopBlink()
     *     → all timers cleared, face goes static
     * ──────────────────────────────────────────────────── */
    D.aiAnimStartSpeaking = function () {
      if (!g || !g.trajectory) return;
      aiSpeaking = true;
      if (talkingInterval) {
        clearInterval(talkingInterval);
        talkingInterval = null;
      }
      if (F === 4) talkingToggle(false);
      startAIBlink();
      startBrowDrift();
      startIdleMouth();
      ensureLoop();
    };

    D.aiAnimStopSpeaking = function () {
      aiSpeaking = false;
      aiTextActive = false;
      if (activeTextTimer) {
        clearTimeout(activeTextTimer);
        activeTextTimer = null;
      }
      closeMouth();
      stopIdleMouth();
      /* Blinks + brow drift keep running idle */
    };

    D.aiAnimMouthText = function (text) {
      if (aiSpeaking && g && g.trajectory) processTextToMouth(text);
    };

    D.aiAnimSetMouth = function (openness) {
      setMouthTarget(openness, 0);
    };

    D.aiAnimStartBlink = function () {
      if (g && g.trajectory) {
        startAIBlink();
        startBrowDrift();
      }
    };

    D.aiAnimStopBlink = function () {
      stopAIBlink();
      stopBrowDrift();
    };

    D.aiAnimIsReady = function () {
      return !!(g && g.trajectory);
    };

    D.aiToggleControls = function () {
      if (!g) return;
      getId("controlblock").classList.toggle("ai-hidden");
    };
  })();

  // ==========================================
  // AUTO-RESTORE LOGIC
  // ==========================================
  setTimeout(function() {
    try {
      var savedDataStr = localStorage.getItem("savedFaceData");
      var savedOriginal = localStorage.getItem("savedFaceOriginal");
      
      if (savedDataStr && savedOriginal) {
        console.log("Found 3D Face data, auto-restoring...");
        var savedData = JSON.parse(savedDataStr);
        
        // We will let the normal J.onload fire but intercept it slightly to fast-forward
        var originalOnLoad = J.onload;
        window.isRestoring = true; // flag to prevent clmtrackr from actually running
        
        J.onload = function() {
           // Call the original onload to do basic setup (canvas sizing, UI reveal)
           if (originalOnLoad) originalOnLoad.call(J);
           
           // Stop the tracker immediately since we don't need it to re-detect
           if (K) K.stop();
           fa = true; // prevent fallback logic from firing
           
           console.log("J.onload fired, now fast forwarding to 3D view");
           
           // Restore basic params
           m = savedData.landmarks;
           r = savedData.rawLandmarks;
           
           if (savedData.rotParams) {
              X = savedData.rotParams.X !== undefined ? savedData.rotParams.X : 0;
              Q = savedData.rotParams.Q || 648;
              La = savedData.rotParams.La || 0;
              ta = savedData.rotParams.ta || 5;
           }
           
           if (savedData.params) {
              var realGet = K.getCurrentParameters;
              K.getCurrentParameters = function() {
                 return savedData.params || (realGet ? realGet.call(K) : []);
              };
           }
           
           // Draw cropped texture to canvases
           var img = new Image();
           img.onload = function() {
             t.width = img.width;
             t.height = img.height;
             l.width = img.width;
             l.height = img.height;
             E.drawImage(img, 0, 0);
             
             // Advance UI state precisely as Mb() does
             if (typeof window.setCurrentScreen === "function") {
                window.setCurrentScreen(3);
             }
             getStyle("splash").display = "none";
             getStyle("startface").display = "none";
             getStyle("face0").display = "none";
             getStyle("face1").display = "none";
             getStyle("face2").display = "none";
             getStyle("face3").display = "none";
             getStyle("face4").display = "inline";
             getStyle("contour").overflow = "hidden";
             getStyle("facemenu").height = "64px";
             
             // Ensure padef geometry is cached properly
             Fb();
             
             // Build 3D face
             D.on3dFace();
             window.isRestoring = false;
           };
           img.src = savedData.faceCropped || savedOriginal;
        };
        
        // Trigger the load
        J.src = savedOriginal;
        
      } else if (savedOriginal) {
        console.log("Found original image, auto-loading to screen 1...");
        J.src = savedOriginal; // J.onload will trigger normally to move to screen 1
      }
    } catch(e) {
      console.error("Auto-restore failed:", e);
      window.isRestoring = false;
    }
  }, 100);
})(this);
