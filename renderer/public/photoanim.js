/*
	PhotoAnim - API V3.0

    Copyright (C) 2012-2024 Chris Deforeit
    CanvasMatrix4 class Copyright (C) 2009 Apple Inc.
	150306 - adapted for self-hosting
	150423 - fixed canvas relative coordinates on touch screen
	151021 - checked JSON parse errors
	151023 - clear canvas before resizing - workaround for firefox bug
	151029 - added optional property forcedtime - allows to play out of realtime
	151201 - added bnosmooth parameter to renderFast - bypass smooth rotation etc.
	151203 - added optional property vrphoto:{shoots:x, dangle:x, cols:x, texkw:x, texkh:x} in header for rendering of vrphoto	
	160106 - corrected bug padef undefined if restart fallback (old platforms with limited graphics)
	160118 - patch for hasanim when no trajectory, zrot after xrot, yrot
	160204 - fixed drawScene for vrphoto, added read-only property curframe in vrphoto
	160211 - vrphoto: added property curframe, optional callback onframechanged, split texture
			 optional rlc alpha array in mesh[5]
	160317 - mesh[5] can be dataurl png alpha, all rgb to 0 only alpha set 
	160613 - added property this.global.user.rotlimit - Limitate yrot/xrot to min/max + margin if pause.
	161226 - Check validity of mesh[5] (workaround ivideo bug)
	170207 - Shared vertex trajectories: -n,x,kx,ky,kz n=# of shared traj, x=index to shared traj sz,sz values
	170215 - Added bnosmooth parameter in renderFrame, fixed rotlimit
	170222 - Support replay animator this.main.replay = {duration:d, time:t, run:bool} 
			 Replay animator use is indicated by shared traj or obj traj pointing to traj size < 0
			 To add replay animator, use this.addReplay(duration).
			 Added KFPS=1 (smoothing for replay speed at 60 frames/sec). Set it to 60/fps for other frame rates
	170705 - added onended event and audio:dataurl on replay animator
	170825 - Added trajpos and trajzoom flags to animator -> allow to correct traj with animator startvalue.
	170908 - Allow user actions on replay animator when trajpos/trajzoom set
	171025 - Allow dummy call with canvasstr = false, just to parse padef.
	171102 - Implement WebGL extension OES_element_index_uint to allow more than 64k vertices, sets this.can32triangles
	171106 - Fixed bug replay animator time init
	171109 - Fixed glitch on background animation
	171113 - Fixed texture boundaries to avoid black lines on transparent textures
	171120 - Wait alpha loaded before setting texloaded
		   Added sync property to animator, i.e. sync:"cyrot" to sync animator on current cam yrot
	171207 - Fixed bug in fixTexCoords && compatibility bug when alpha coded rlc (deprecated)
			 allow restart with padef if preproc in header
	180103 - Added optional property vxtrajscale on header (affects kx,ky,kz from shared trajs)
	180219 - Added updateTriangles
	180426 - Fixed mouse and touch controls to always move scenery (not cam) without impacting animators...
	180514 - Do not fix tex coords for pipe app.
	180613 - Fixed touch bug when zoom not allowed
	180829 - Use preserveDrawingBuffer as some graphic cards under Win10 do not flush properly, resulting in blank or black thumbnail
	180909 - DrawScene called from outside and renderFast call gl.finish to be sure render is completed before reading gl canvas
	200331 - Added patch for kaleidoscope, animate texture[0] object kale on header {tx:{run, min, max}, ty:{run, min,max}}
	240126 - Added vr.ibook flag on vrphoto (use only by create, set to false when publish) and vr.aspect array to avoid image distorsion
	240202 - Added vr.xmovs, vr.ymovs, vr.zooms arrays to allow replay of frames with different scales and position
	240219 - Improved onclick for ibook
			 
Licensed under Creative Commons CC BY
You are free to:
    Share - copy and redistribute the material in any medium or format
    Adapt - remix, transform, and build upon the material
    for any purpose, even commercially. 

Under the following terms:
    Attribution - You must give appropriate credit and indicate if changes were made. You may do so in any reasonable manner, but not in any way that suggests the licensor endorses you or your use.
    No additional restrictions - You may not apply legal terms or technological measures that legally restrict others from doing anything the license permits.
*/
var PADEBUG = false;
var CanvasMatrix4 = function (m) {
  if (typeof m == "object")
    if ("length" in m && m.length >= 16) {
      this.load(
        m[0],
        m[1],
        m[2],
        m[3],
        m[4],
        m[5],
        m[6],
        m[7],
        m[8],
        m[9],
        m[10],
        m[11],
        m[12],
        m[13],
        m[14],
        m[15],
      );
      return;
    } else if (m instanceof CanvasMatrix4) {
      this.load(m);
      return;
    }
  this.makeIdentity();
};
CanvasMatrix4.prototype.getAsArray = function () {
  return [
    this.m11,
    this.m12,
    this.m13,
    this.m14,
    this.m21,
    this.m22,
    this.m23,
    this.m24,
    this.m31,
    this.m32,
    this.m33,
    this.m34,
    this.m41,
    this.m42,
    this.m43,
    this.m44,
  ];
};
CanvasMatrix4.prototype.makeIdentity = function () {
  this.m11 = 1;
  this.m12 = 0;
  this.m13 = 0;
  this.m14 = 0;
  this.m21 = 0;
  this.m22 = 1;
  this.m23 = 0;
  this.m24 = 0;
  this.m31 = 0;
  this.m32 = 0;
  this.m33 = 1;
  this.m34 = 0;
  this.m41 = 0;
  this.m42 = 0;
  this.m43 = 0;
  this.m44 = 1;
};
CanvasMatrix4.prototype.translate = function (x, y, z) {
  if (x == 0 && y == 0 && z == 0) return;
  var matrix = new CanvasMatrix4();
  matrix.m41 = x;
  matrix.m42 = y;
  matrix.m43 = z;
  this.multRight(matrix);
};
CanvasMatrix4.prototype.scale = function (x, y, z) {
  if (x == 1 && y == 1 && z == 1) return;
  var matrix = new CanvasMatrix4();
  matrix.m11 = x;
  matrix.m22 = y;
  matrix.m33 = z;
  this.multRight(matrix);
};
CanvasMatrix4.prototype.rotate = function (angle, x, y, z) {
  if (angle == 0) return;
  angle = (angle / 180) * Math.PI;
  angle = angle / 2;
  var sinA = Math.sin(angle);
  var cosA = Math.cos(angle);
  var sinA2 = sinA * sinA;
  var length = Math.sqrt(x * x + y * y + z * z);
  if (length == 0) {
    x = 0;
    y = 0;
    z = 1;
  } else if (length != 1) {
    x = x / length;
    y = y / length;
    z = z / length;
  }
  var mat = new CanvasMatrix4();
  if (x == 1 && y == 0 && z == 0) {
    mat.m11 = 1;
    mat.m12 = 0;
    mat.m13 = 0;
    mat.m21 = 0;
    mat.m22 = 1 - 2 * sinA2;
    mat.m23 = 2 * sinA * cosA;
    mat.m31 = 0;
    mat.m32 = -2 * sinA * cosA;
    mat.m33 = 1 - 2 * sinA2;
    mat.m14 = mat.m24 = mat.m34 = 0;
    mat.m41 = mat.m42 = mat.m43 = 0;
    mat.m44 = 1;
  } else if (x == 0 && y == 1 && z == 0) {
    mat.m11 = 1 - 2 * sinA2;
    mat.m12 = 0;
    mat.m13 = -2 * sinA * cosA;
    mat.m21 = 0;
    mat.m22 = 1;
    mat.m23 = 0;
    mat.m31 = 2 * sinA * cosA;
    mat.m32 = 0;
    mat.m33 = 1 - 2 * sinA2;
    mat.m14 = mat.m24 = mat.m34 = 0;
    mat.m41 = mat.m42 = mat.m43 = 0;
    mat.m44 = 1;
  } else if (x == 0 && y == 0 && z == 1) {
    mat.m11 = 1 - 2 * sinA2;
    mat.m12 = 2 * sinA * cosA;
    mat.m13 = 0;
    mat.m21 = -2 * sinA * cosA;
    mat.m22 = 1 - 2 * sinA2;
    mat.m23 = 0;
    mat.m31 = 0;
    mat.m32 = 0;
    mat.m33 = 1;
    mat.m14 = mat.m24 = mat.m34 = 0;
    mat.m41 = mat.m42 = mat.m43 = 0;
    mat.m44 = 1;
  } else {
    var x2 = x * x;
    var y2 = y * y;
    var z2 = z * z;
    mat.m11 = 1 - 2 * (y2 + z2) * sinA2;
    mat.m12 = 2 * (x * y * sinA2 + z * sinA * cosA);
    mat.m13 = 2 * (x * z * sinA2 - y * sinA * cosA);
    mat.m21 = 2 * (y * x * sinA2 - z * sinA * cosA);
    mat.m22 = 1 - 2 * (z2 + x2) * sinA2;
    mat.m23 = 2 * (y * z * sinA2 + x * sinA * cosA);
    mat.m31 = 2 * (z * x * sinA2 + y * sinA * cosA);
    mat.m32 = 2 * (z * y * sinA2 - x * sinA * cosA);
    mat.m33 = 1 - 2 * (x2 + y2) * sinA2;
    mat.m14 = mat.m24 = mat.m34 = 0;
    mat.m41 = mat.m42 = mat.m43 = 0;
    mat.m44 = 1;
  }
  this.multRight(mat);
};
CanvasMatrix4.prototype.multRight = function (mat) {
  var m11 =
    this.m11 * mat.m11 +
    this.m12 * mat.m21 +
    this.m13 * mat.m31 +
    this.m14 * mat.m41;
  var m12 =
    this.m11 * mat.m12 +
    this.m12 * mat.m22 +
    this.m13 * mat.m32 +
    this.m14 * mat.m42;
  var m13 =
    this.m11 * mat.m13 +
    this.m12 * mat.m23 +
    this.m13 * mat.m33 +
    this.m14 * mat.m43;
  var m14 =
    this.m11 * mat.m14 +
    this.m12 * mat.m24 +
    this.m13 * mat.m34 +
    this.m14 * mat.m44;
  var m21 =
    this.m21 * mat.m11 +
    this.m22 * mat.m21 +
    this.m23 * mat.m31 +
    this.m24 * mat.m41;
  var m22 =
    this.m21 * mat.m12 +
    this.m22 * mat.m22 +
    this.m23 * mat.m32 +
    this.m24 * mat.m42;
  var m23 =
    this.m21 * mat.m13 +
    this.m22 * mat.m23 +
    this.m23 * mat.m33 +
    this.m24 * mat.m43;
  var m24 =
    this.m21 * mat.m14 +
    this.m22 * mat.m24 +
    this.m23 * mat.m34 +
    this.m24 * mat.m44;
  var m31 =
    this.m31 * mat.m11 +
    this.m32 * mat.m21 +
    this.m33 * mat.m31 +
    this.m34 * mat.m41;
  var m32 =
    this.m31 * mat.m12 +
    this.m32 * mat.m22 +
    this.m33 * mat.m32 +
    this.m34 * mat.m42;
  var m33 =
    this.m31 * mat.m13 +
    this.m32 * mat.m23 +
    this.m33 * mat.m33 +
    this.m34 * mat.m43;
  var m34 =
    this.m31 * mat.m14 +
    this.m32 * mat.m24 +
    this.m33 * mat.m34 +
    this.m34 * mat.m44;
  var m41 =
    this.m41 * mat.m11 +
    this.m42 * mat.m21 +
    this.m43 * mat.m31 +
    this.m44 * mat.m41;
  var m42 =
    this.m41 * mat.m12 +
    this.m42 * mat.m22 +
    this.m43 * mat.m32 +
    this.m44 * mat.m42;
  var m43 =
    this.m41 * mat.m13 +
    this.m42 * mat.m23 +
    this.m43 * mat.m33 +
    this.m44 * mat.m43;
  var m44 =
    this.m41 * mat.m14 +
    this.m42 * mat.m24 +
    this.m43 * mat.m34 +
    this.m44 * mat.m44;
  this.m11 = m11;
  this.m12 = m12;
  this.m13 = m13;
  this.m14 = m14;
  this.m21 = m21;
  this.m22 = m22;
  this.m23 = m23;
  this.m24 = m24;
  this.m31 = m31;
  this.m32 = m32;
  this.m33 = m33;
  this.m34 = m34;
  this.m41 = m41;
  this.m42 = m42;
  this.m43 = m43;
  this.m44 = m44;
};
CanvasMatrix4.prototype.frustum = function (
  left,
  right,
  bottom,
  top,
  near,
  far,
) {
  var matrix = new CanvasMatrix4();
  var A = (right + left) / (right - left);
  var B = (top + bottom) / (top - bottom);
  var C = -(far + near) / (far - near);
  var D = -(2 * far * near) / (far - near);
  matrix.m11 = (2 * near) / (right - left);
  matrix.m12 = 0;
  matrix.m13 = 0;
  matrix.m14 = 0;
  matrix.m21 = 0;
  matrix.m22 = (2 * near) / (top - bottom);
  matrix.m23 = 0;
  matrix.m24 = 0;
  matrix.m31 = A;
  matrix.m32 = B;
  matrix.m33 = C;
  matrix.m34 = -1;
  matrix.m41 = 0;
  matrix.m42 = 0;
  matrix.m43 = D;
  matrix.m44 = 0;
  this.multRight(matrix);
};
CanvasMatrix4.prototype.perspective = function (fovy, aspect, zNear, zFar) {
  var top = Math.tan((fovy * Math.PI) / 360) * zNear;
  var bottom = -top;
  var left = aspect * bottom;
  var right = aspect * top;
  this.frustum(left, right, bottom, top, zNear, zFar);
};
CanvasMatrix4.prototype.ortho = function (left, right, bottom, top, near, far) {
  var tx = (left + right) / (right - left);
  var ty = (top + bottom) / (top - bottom);
  var tz = (far + near) / (far - near);
  var matrix = new CanvasMatrix4();
  matrix.m11 = 2 / (right - left);
  matrix.m12 = 0;
  matrix.m13 = 0;
  matrix.m14 = 0;
  matrix.m21 = 0;
  matrix.m22 = 2 / (top - bottom);
  matrix.m23 = 0;
  matrix.m24 = 0;
  matrix.m31 = 0;
  matrix.m32 = 0;
  matrix.m33 = -2 / (far - near);
  matrix.m34 = 0;
  matrix.m41 = tx;
  matrix.m42 = ty;
  matrix.m43 = tz;
  matrix.m44 = 1;
  this.multRight(matrix);
};
var vertexshader =
  "precision mediump float;\n" +
  "#define MAXOBJ %OBJSZ%\n" +
  "  attribute vec3 aPos;\n" +
  "  attribute float aObj;\n" +
  "  attribute vec3 aNorm;\n" +
  "  attribute vec2 aTexCoord;\n" +
  "  uniform mat4 mvMatrix;\n" +
  "  uniform mat4 lgMatrix;\n" +
  "  uniform mat4 prMatrix;\n" +
  "  uniform vec4 uLightPar; // x=shading, y=backlight, z=ambient, w=specular\n" +
  "  uniform vec3 uLightDir;\n" +
  "  uniform bool uShowBgrd;\n" +
  "  uniform float uAspect;\n" +
  "  uniform mat4 objMatrix[MAXOBJ];\n" +
  "  uniform vec4 uRgba[MAXOBJ];\n" +
  "  uniform vec4 uBchs[MAXOBJ];\n" +
  "  varying vec2 vTexCoord;\n" +
  "  varying vec4 khsa; varying vec4 rgbi;\n" +
  "void main(void) {\n" +
  "   float i, k, c;\n" +
  "   vec4 trj;\n" +
  "   vec4 rotNorm;\n" +
  "\tmat4 objlight;\n" +
  "   int x = int(aObj);\n" +
  "   vTexCoord = aTexCoord;\n" +
  "   if (aObj < 0.0) {\n" +
  "     if (!uShowBgrd) return;\n" +
  "     gl_Position = prMatrix * vec4(aPos.xy * 41.5, -50., 1.);\n" +
  "     if (uAspect > 1.) gl_Position.y *= uAspect;\n" +
  "     else gl_Position.x /= uAspect;\n" +
  "     khsa = vec4(1.,0.,0.,1.); rgbi = vec4(0.,0.,0.,1.);\n" +
  "     return; }\n" +
  "   gl_Position = prMatrix * mvMatrix * objMatrix[x] * vec4(aPos, 1.);\n" +
  "   if (uAspect > 1.) gl_Position.y *= uAspect;\n" +
  "   else gl_Position.x /= uAspect;\n" +
  "   objlight = objMatrix[x];\n" +
  "   objlight[2][0] = -objlight[2][0]; objlight[2][1] = -objlight[2][1]; objlight[0][2] = -objlight[0][2]; objlight[1][2] = -objlight[1][2];\n" +
  "   rotNorm = lgMatrix * objlight * vec4(aNorm, .0);\n" +
  "\trotNorm = normalize(rotNorm);\n" +
  "   i = dot(rotNorm, vec4(uLightDir, 1.));\n" +
  "   if (i<0.)\n" +
  "      i *= -uLightPar.y;\n" +
  "   i = uLightPar.x * i + (1. - uLightPar.x);\n" +
  "   i += uLightPar.w * pow(i, 80.) + uLightPar.z;\n" +
  "   k = i * (uBchs[x].y + 1.); c = -.5 * uBchs[x].y + uBchs[x].x;\n" +
  "   khsa = vec4(k, uBchs[x].z, uBchs[x].w, uRgba[x].a);\n" +
  "   rgbi = vec4(vec3(c,c,c) + uRgba[x].rgb, i);\n" +
  "}\n";
var fragmentshader =
  "%HUESAT%\n" +
  "precision mediump float;\n" +
  "  uniform sampler2D uTexSamp;\n" +
  "  varying vec2 vTexCoord;\n" +
  "  varying vec4 khsa; varying vec4 rgbi;\n" +
  "#ifdef HUESAT\n" +
  "vec4 ApplyHSV(vec4 rgba, vec4 khsa)\n" +
  "{\n" +
  "float h=0., s=0., v;\n" +
  "float mn, delta, f, p, q, t; int i;\n" +
  "mn = min(min(rgba.r, rgba.g),rgba.b);\n" +
  "v = max(max(rgba.r, rgba.g),rgba.b);\n" +
  "delta = v-mn;\n" +
  "if (v == 0. || delta == 0.)\n" +
  "  return rgba;\n" +
  "s = clamp(delta/v + khsa.z, 0., 1.);\n" +
  "if (rgba.r == v) h = (rgba.g - rgba.b)/delta;\n" +
  "else if (rgba.g == v) h = 2. + (rgba.b - rgba.r)/delta;\n" +
  "else h = 4. + (rgba.r - rgba.g)/delta;\n" +
  "h += khsa.y;\n" +
  "h = (h<0.)?(h+6.):h;\n" +
  "h = (h>=6.)?(h-6.):h;\n" +
  "i = int(h); f=fract(h);\n" +
  "p = v * (1.-s); q = v *(1.-s*f); t = v * (1. - s*(1.-f));\n" +
  "if (i == 0) return vec4(v, t, p, rgba.a);\n" +
  "if (i == 1) return vec4(q, v, p, rgba.a);\n" +
  "if (i == 2) return vec4(p, v, t, rgba.a);\n" +
  "if (i == 3) return vec4(p, q, v, rgba.a);\n" +
  "if (i == 4) return vec4(t, p, v, rgba.a);\n" +
  "return vec4(v, p, q, rgba.a);\n" +
  "}\n" +
  "#endif\n" +
  "void main(void) {\n" +
  "   vec4 c = texture2D(uTexSamp, vTexCoord);\n" +
  "   vec3 hsv;\n" +
  "   float a;\n" +
  "#ifdef HUESAT\n" +
  "\tc = ApplyHSV(c, khsa);\n" +
  "#endif\n" +
  "   a = khsa.a;\n" +
  "   a *= c.a;\n" +
  "   if(a < .01) discard;\n" +
  "   gl_FragColor = vec4((c.rgb * khsa.x + rgbi.rgb) * rgbi.a, a);\n" +
  "}\n";
(function () {
  var requestAnimationFrame =
    window.requestAnimationFrame ||
    window.mozRequestAnimationFrame ||
    window.webkitRequestAnimationFrame ||
    window.msRequestAnimationFrame ||
    function (callback) {
      window.setTimeout(callback, 1e3 / 60);
    };
  window.requestAnimationFrame = requestAnimationFrame;
})();
var can32triangles;
function CanUseSite(checkfilereader) {
  var nocanvas = "No HTML5 Canvas Support";
  var nowebgl =
    "No WebGL Support or WebGL not enabled\nPlease check http://get.webgl.org";
  var nofilereader = "No HTML5 FileReader Support";
  var canvas = document.createElement("canvas");
  if (canvas === undefined) return nocanvas;
  if (canvas.getContext === undefined) return nocanvas;
  try {
    var ctx = canvas.getContext("2d");
  } catch (e) {
    return nocanvas + footer;
  }
  if (ctx == undefined || ctx == null) return nocanvas;
  if (ctx.getImageData == undefined || ctx.getImageData == null)
    return nocanvas;
  if (canvas.toDataURL == undefined || canvas.toDataURL == null)
    return nocanvas;
  if (
    window.WebGLRenderingContext == null ||
    window.WebGLRenderingContext == undefined
  )
    return nowebgl;
  var glcanvas = document.createElement("canvas");
  try {
    var glctx =
      glcanvas.getContext("webgl") || glcanvas.getContext("experimental-webgl");
  } catch (e) {
    return nowebgl;
  }
  if (glctx === undefined || glctx == null) return nowebgl;
  var ext = glctx.getExtension("OES_element_index_uint");
  can32triangles = ext ? true : false;
  if (!checkfilereader) return "ok";
  if (FileReader == undefined || FileReader == null) return nofilereader;
  var f = new FileReader();
  if (f.readAsDataURL == undefined || f.readAsDataURL == null)
    return nofilereader;
  return "ok";
}
var shaderproblem = false;
var NONE = 0;
var ONLOAD = 1;
var ONCLICK = 2;
var ONOVER = 3;
var ROTATE = 1;
var TRANSLATE = 2;
var ZOOM = 3;
var INFO = 4;
var gphotoanim = null;
function PhotoAnim(canvasstr, padef, onmouse, ontexloaded) {
  gphotoanim = this;
  padef = this.getPadef(padef);
  if (!padef) return this;
  this.padef = padef;
  var pads = padef;
  if (padef[0].preproc && padef[1].length == 2) {
    var pp = padef[0].preproc;
    switch (pp[0]) {
      case "xtrude":
        var xtrude = new PA_Grid_Mesh(padef);
        padef = xtrude.par;
        this.triangles = padef[1][2];
        this.calcNormals(padef[1][0]);
        this.padef = padef;
        break;
    }
  }
  if (!canvasstr) return this;
  this.error = false;
  this.hasanim = 0;
  this.hastrigger = false;
  this.pause = false;
  this.oldtime = -1;
  this.refresh = true;
  this.mouseAction = {
    drag: ROTATE,
    dragshift: TRANSLATE,
    dragctrl: ZOOM,
    wheel: ZOOM,
    touch1: ROTATE,
    touch2pinch: ZOOM,
    touch2pan: TRANSLATE,
    click: INFO,
    hover: INFO,
  };
  this.canvas = document.getElementById(canvasstr);
  this.header = padef[0];
  this.mesh = padef[1];
  this.global = padef[2];
  this.main = padef[3];
  this.objects = padef[3].objs;
  this.vertices = this.mesh[0];
  this.texcoord = this.mesh[1];
  this.triangles = this.mesh[2];
  this.trajectory = this.mesh[3];
  this.KFPS = 1;
  if (PADEBUG) this.padefCheck();
  this.fixTexCoords();
  this.onmouse = onmouse;
  this.ontexloaded = ontexloaded;
  this.hastouch = false;
  this.w = this.canvas.width;
  this.h = this.canvas.height;
  this.canvascolor = this.header.bgrdcolor;
  this.meshdata = new Float32Array(this.vertices);
  var teximage = this.mesh[4];
  this.vertexbuffer = undefined;
  this.vxsz = this.vertices.length / 7;
  var aspect = this.w / this.h;
  if (this.header.aspect !== undefined) aspect = aspect * this.header.aspect;
  this.time = 0;
  this.gl = undefined;
  this.prog = undefined;
  this.canvas.width = this.w;
  this.canvas.height = this.h;
  if (!window.WebGLRenderingContext) {
    this.error =
      "Your browser does not support WebGL. See http://get.webgl.org";
    return this;
  }
  this.gl =
    this.canvas.getContext("webgl", {
      depth: true,
      preserveDrawingBuffer: true,
    }) || this.canvas.getContext("experimental-webgl");
  if (!this.gl) {
    this.error =
      "Your browser supports WebGL, but WebGL is not enabled. See http://get.webgl.org";
    return this;
  }
  var gl = this.gl;
  var ext = gl.getExtension("OES_element_index_uint");
  this.can32triangles = ext ? true : false;
  this.objsz = this.objects.length;
  var uni = gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS);
  var maxobj = Math.floor((uni - 16) / 12);
  if (this.objsz > maxobj) {
    this.error =
      "Too many objects! Requested: " + this.objsz + " Maximum: " + maxobj;
    this.objsz = maxobj;
  }
  this.objmxdata = new Float32Array(this.objsz * 16);
  this.gbgrd = this.global.bgrd;
  this.gcamera = this.global.camera;
  this.glight = this.global.light;
  this.guser = this.global.user;
  this.initDefaults();
  this.initAnimators();
  this.xmove = this.gcamera.xmov;
  this.ymove = this.gcamera.ymov;
  this.xrotate = this.gcamera.xrot;
  this.yrotate = this.gcamera.yrot;
  this.zrotate = this.gcamera.zrot;
  this.zoom = this.gcamera.zoom;
  gl.viewport(0, 0, this.w, this.h);
  this.texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, this.texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  this.texloaded = false;
  this.image = new Image();
  PA_InitHandlers(this);
  this.prog = gl.createProgram();
  var prog = this.prog;
  var shader = gl.createShader(gl.VERTEX_SHADER);
  var vxss = new String(vertexshader);
  vxss = vxss.replace("%OBJSZ%", this.objsz);
  gl.shaderSource(shader, vxss);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) == 0) {
    this.error =
      "Graphic card problem, vertex shader: " + gl.getShaderInfoLog(shader);
    return this;
  }
  gl.attachShader(prog, shader);
  shader = gl.createShader(gl.FRAGMENT_SHADER);
  var fs = fragmentshader;
  if (shaderproblem) fs = fs.replace("%HUESAT%", "");
  else fs = fs.replace("%HUESAT%", "#define HUESAT");
  gl.shaderSource(shader, fs);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) == 0) {
    this.error =
      "Graphic card problem, fragment shader: " + gl.getShaderInfoLog(shader);
    return this;
  }
  gl.attachShader(prog, shader);
  gl.linkProgram(prog);
  gl.useProgram(prog);
  var texcoordloc = gl.getAttribLocation(prog, "aTexCoord");
  if (texcoordloc < 0) {
    if (shaderproblem) {
      this.error = "Graphic card problem";
      return this;
    }
    shaderproblem = true;
    return new PhotoAnim(canvasstr, pads, onmouse, ontexloaded);
  }
  var posloc = gl.getAttribLocation(prog, "aPos");
  var data = this.meshdata;
  gl.enableVertexAttribArray(posloc);
  this.vertexbuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexbuffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
  gl.vertexAttribPointer(posloc, 3, gl.FLOAT, false, 28, 0);
  var normloc = gl.getAttribLocation(prog, "aNorm");
  gl.enableVertexAttribArray(normloc);
  gl.vertexAttribPointer(normloc, 3, gl.FLOAT, false, 28, 16);
  data = new Float32Array(this.vxsz);
  this.objmatrix = new Array(this.objsz);
  var objmxdata = this.objmxdata;
  this.objbchs = new Float32Array(this.objsz * 4);
  this.objrgba = new Float32Array(this.objsz * 4);
  this.InitObjects(data, objmxdata);
  var objloc = gl.getAttribLocation(prog, "aObj");
  gl.enableVertexAttribArray(objloc);
  this._objBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, this._objBuf);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  gl.vertexAttribPointer(objloc, 1, gl.FLOAT, false, 4, 0);
  data = new Float32Array(this.texcoord);
  var texloc = gl.getAttribLocation(prog, "aTexCoord");
  gl.enableVertexAttribArray(texloc);
  this._texBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, this._texBuf);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  gl.vertexAttribPointer(texloc, 2, gl.FLOAT, false, 8, 0);
  this._elemBuf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._elemBuf);
  var tri = this.can32triangles
    ? new Uint32Array(this.triangles)
    : new Uint16Array(this.triangles);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, tri, gl.STATIC_DRAW);
  gl.uniform1i(gl.getUniformLocation(prog, "uTexSamp"), 0);
  this.updateProjection();
  this.rotmat = new CanvasMatrix4();
  this.mvmatloc = gl.getUniformLocation(prog, "mvMatrix");
  this.lightmat = new CanvasMatrix4();
  this.lgmatloc = gl.getUniformLocation(prog, "lgMatrix");
  this.aspectloc = gl.getUniformLocation(prog, "uAspect");
  gl.uniform1f(this.aspectloc, aspect);
  this.bgrdloc = gl.getUniformLocation(prog, "uShowBgrd");
  if (this.gbgrd) gl.uniform1i(this.bgrdloc, this.gbgrd.show);
  else gl.uniform1i(this.bgrdloc, 0);
  var lightdir = new Float32Array(this.glight.vector);
  this.lightdirloc = gl.getUniformLocation(prog, "uLightDir");
  gl.uniform3fv(this.lightdirloc, lightdir);
  this.lightparloc = gl.getUniformLocation(prog, "uLightPar");
  gl.uniform4f(
    this.lightparloc,
    this.glight.shading.value,
    this.glight.back.value,
    this.glight.ambient.value,
    this.glight.specular.value,
  );
  this.objmatrixloc = gl.getUniformLocation(prog, "objMatrix");
  gl.uniformMatrix4fv(this.objmatrixloc, false, objmxdata);
  this.bchsloc = gl.getUniformLocation(prog, "uBchs");
  gl.uniform4fv(this.bchsloc, this.objbchs);
  this.rgbaloc = gl.getUniformLocation(prog, "uRgba");
  gl.uniform4fv(this.rgbaloc, this.objrgba);
  gl.enable(gl.BLEND);
  gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.clearDepth(1);
  gl.clearColor(
    this.canvascolor[0],
    this.canvascolor[1],
    this.canvascolor[2],
    this.canvascolor[3],
  );
  this.xoffs = 0;
  this.yoffs = 0;
  this.drag = 0;
  this.button = 0;
  this.overflag = false;
  this.touchradius = 1;
  this.touchangle = 0;
  this.touchid = null;
  this.xrot = this.xrotate.value;
  this.yrot = this.yrotate.value;
  this.zrot = this.zrotate.value;
  this.xmov = this.xmove.value;
  this.ymov = this.ymove.value;
  this.transl = this.zoom.value;
  this.cxrot = this.xrot;
  this.cyrot = this.yrot;
  this.czrot = this.zrot;
  this.cxmov = this.xmov;
  this.cymov = this.ymov;
  this.ctransl = this.transl;
  this.cbgrdx = this.cbgrdy = 1e3;
  this.curframe = -1;
  this.xlgrot = this.glight.xrot.value;
  this.ylgrot = this.glight.yrot.value;
  this.countimage = 0;
  this.teximage = teximage;
  if (typeof teximage == "string") this.image.src = teximage;
  else if (teximage.teximg) this.loadTextures(teximage);
  else this.updateTexture(teximage);
}
PhotoAnim.prototype.getPadef = function (padef) {
  if (typeof padef == "string") {
    if (padef.indexOf("paJSON") === 0) {
      var paJSON;
      eval(padef);
      padef = paJSON;
    }
    var h = padef.substring(0, 1);
    padef = this.inflateJSON(padef);
    if (h == "/") {
      var pawebgl_header;
      var pawebgl_vertices;
      var pawebgl_texcoord;
      var pawebgl_triangles;
      var pawebgl_trajectory;
      var pawebgl_mesh;
      var pawebgl_bgrd;
      var pawebgl_camera;
      var pawebgl_light;
      var pawebgl_user;
      var pawebgl_global;
      var pawebgl_objects;
      try {
        eval(padef);
      } catch (e) {
        this.error = "Corrupted JSON";
        return false;
      }
      this.fromphotoanim = true;
    } else {
      try {
        padef = JSON.parse(padef);
      } catch (e) {
        this.error = "Corrupted JSON";
        return false;
      }
      this.fromphotoanim = false;
    }
  }
  return padef;
};
PhotoAnim.prototype.padefCheck = function () {
  if (typeof this.header != "object")
    console.log("PhotoAnim ERROR: Invalid Header");
  if (
    typeof this.header.bgrdcolor != "object" ||
    this.header.bgrdcolor.length != 4
  )
    console.log(
      "PhotoAnim ERROR: bgrdcolor property is mandatory and should be a length=4 array",
    );
  if (typeof this.mesh != "object" || this.mesh.length != 5)
    console.log("PhotoAnim ERROR: mesh should be a length=5 array");
  if (typeof this.vertices != "object")
    console.log("PhotoAnim ERROR: vertices should be an array");
  var sz = this.vertices.length;
  if (sz < 21)
    console.log(
      "PhotoAnim ERROR: at least 3 vertices should be defined, each vertex being 7 numbers",
    );
  if (sz % 7 != 0)
    console.log("PhotoAnim ERROR: vertices length should be a multiple of 7");
  if (typeof this.texcoord != "object")
    console.log("PhotoAnim ERROR: texcoord should be an array");
  var sz1 = this.texcoord.length;
  if (sz / 7 != sz1 / 2)
    console.log(
      "PhotoAnim ERROR: texcoord length does not match vertices length",
    );
  if (typeof this.triangles != "object")
    console.log("PhotoAnim ERROR: triangles should be an array");
  sz = this.triangles.length;
  if (sz < 3 || sz % 3 != 0)
    console.log("PhotoAnim ERROR: triangles size should be a multiple of 3");
  if (
    typeof this.trajectory != "object" ||
    this.trajectory.length < 1 ||
    this.trajectory[0] != 0
  )
    console.log(
      "PhotoAnim ERROR: vxobjtraj should be an array with minimum size 1 and first entry = 0",
    );
  if (typeof this.global != "object")
    console.log("PhotoAnim ERROR: global should be an object");
  if (typeof this.global.camera != "object")
    console.log("PhotoAnim ERROR: global.camera should be defined");
  if (typeof this.global.light != "object")
    console.log("PhotoAnim ERROR: global.light should be defined");
  if (typeof this.global.user != "object")
    console.log("PhotoAnim ERROR: global.user should be defined");
  if (typeof this.objects != "object" || this.objects.length < 1)
    console.log(
      "PhotoAnim ERROR: At least one object should be defined in objects.obj[]",
    );
  var i = 0;
  for (; i < this.objects.length; i++) {
    var obj = this.objects[i];
    if (typeof obj.center != "object" || obj.center.length != 3)
      console.log(
        "PhotoAnim ERROR: Missing or invalid center declaration in object " + i,
      );
    if (typeof obj.vxstart != "number")
      console.log(
        "PhotoAnim ERROR: Missing or invalid vxstart declaration in object " +
          i,
      );
  }
};
PhotoAnim.prototype.fixTexCoords = function () {
  function inBound(v) {
    var bounding = [
      [0, 0.001],
      [1 / 16 - 0.001, 1 / 16 + 0.001],
      [1 / 8 - 0.001, 1 / 8 + 0.001],
      [1 / 4 - 0.001, 1 / 4 + 0.001],
      [1 / 2 - 0.001, 1 / 2 + 0.001],
      [1 - 0.001, 1 + 0.001],
    ];
    var i = 0;
    for (; i < bounding.length; i++)
      if (v >= bounding[i][0] && v <= bounding[i][1]) return true;
    return false;
  }
  if (this.header.href) return;
  var tc = this.texcoord;
  var objs = this.objects;
  var w;
  var h;
  var i;
  var istart;
  var iend;
  var j;
  var minx;
  var maxx;
  var miny;
  var maxy;
  var x0;
  var x1;
  var y0;
  var y1;
  j = 0;
  for (; j < objs.length; j++) {
    minx = 10;
    maxx = -1;
    miny = 10;
    maxy = -1;
    istart = objs[j].vxstart;
    if (j != objs.length - 1) iend = objs[j + 1].vxstart;
    else iend = tc.length / 2;
    i = istart;
    for (; i < iend; i++) {
      if (tc[2 * i] < minx) minx = tc[2 * i];
      if (tc[2 * i] > maxx) maxx = tc[2 * i];
      if (tc[2 * i + 1] < miny) miny = tc[2 * i + 1];
      if (tc[2 * i + 1] > maxy) maxy = tc[2 * i + 1];
    }
    w = maxx - minx;
    h = maxy - miny;
    x0 = minx;
    x1 = maxx;
    y0 = miny;
    y1 = maxy;
    if (inBound(minx)) x0 = x0 + w / 1e3;
    if (inBound(maxx)) x1 = x1 - w / 1e3;
    if (inBound(miny)) y0 = y0 + w / 1e3;
    if (inBound(maxy)) y1 = y1 - w / 1e3;
    i = istart;
    for (; i < iend; i++) {
      if (tc[2 * i] < x0) tc[2 * i] = x0;
      else if (tc[2 * i] > x1) tc[2 * i] = x1;
      if (tc[2 * i + 1] < y0) tc[2 * i + 1] = y0;
      else if (tc[2 * i + 1] > y1) tc[2 * i + 1] = y1;
    }
  }
};
PhotoAnim.prototype.inflateJSON = function (s) {
  s = s.replace(/,,/g, ",0,");
  s = s.replace(/,,/g, ",0,");
  s = s.replace(/-\./g, "-0.");
  s = s.replace(/,\./g, ",0.");
  return s;
};
PhotoAnim.prototype.updateCanvas = function (bforce) {
  if (!bforce && this.header.width == this.canvas.width) {
    this.refresh = true;
    return;
  }
  this.w = this.canvas.width = this.header.width;
  this.h = this.canvas.height = this.header.height;
  var aspect = this.w / this.h;
  if (this.header.aspect !== undefined) {
    aspect = aspect * this.header.aspect;
    this.gl.uniform1f(this.aspectloc, aspect);
  }
  this.gl.viewport(0, 0, this.w, this.h);
  this.refresh = true;
};
PhotoAnim.prototype.updateLight = function () {
  var lightdir = new Float32Array(this.glight.vector);
  this.gl.uniform3fv(this.lightdirloc, lightdir);
  this.refresh = true;
};
PhotoAnim.prototype.resizeCanvas = function () {
  var gl = this.gl;
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.flush();
  this.w = this.canvas.width;
  this.h = this.canvas.height;
  this.header.width = this.w;
  this.header.height = this.h;
  var aspect = this.w / this.h;
  if (this.header.aspect !== undefined) aspect = aspect * this.header.aspect;
  gl.uniform1f(this.aspectloc, aspect);
  gl.viewport(0, 0, this.w, this.h);
  this.refresh = true;
};
PhotoAnim.prototype.updateProjection = function () {
  var gl = this.gl;
  var prog = this.prog;
  var prmatrix = new CanvasMatrix4();
  var proj = this.header.projection;
  if (proj.perspective) {
    var persp = proj.perspective;
    prmatrix.perspective(persp[0], persp[1], persp[2], persp[3]);
  } else if (proj.ortho) {
    var ortho = proj.ortho;
    prmatrix.ortho(ortho[0], ortho[1], ortho[2], ortho[3], ortho[4], ortho[5]);
  }
  gl.uniformMatrix4fv(
    gl.getUniformLocation(prog, "prMatrix"),
    false,
    new Float32Array(prmatrix.getAsArray()),
  );
  this.refresh = true;
};
PhotoAnim.prototype.updateBgrdShow = function () {
  if (!this.gbgrd) return;
  var s = this.gbgrd.show ? 1 : 0;
  this.gl.uniform1i(this.bgrdloc, s);
  this.refresh = true;
};
PhotoAnim.prototype.initDefaults = function () {
  function initDefault(obj, $prop, start, min, max) {
    if (obj[$prop] === undefined) obj[$prop] = {};
    var prop = obj[$prop];
    if (prop.startvalue === undefined) prop.startvalue = start;
    prop.value = prop.startvalue;
    if (prop.min === undefined) prop.min = min === undefined ? -1e100 : min;
    if (prop.max === undefined) prop.max = max === undefined ? 1e100 : max;
  }
  this.anobjlist = [
    "xmov",
    "ymov",
    "zmov",
    "scale",
    "inflate",
    "aspect",
    "xrot",
    "yrot",
    "zrot",
    "brightness",
    "contrast",
    "hue",
    "saturation",
    "red",
    "green",
    "blue",
    "opacity",
  ];
  var header = this.header;
  if (!header.projection) header.projection = {};
  var proj = header.projection;
  if (!proj.ortho && !proj.perspective) proj.perspective = [45, 1, 0.1, 100];
  if (!this.global.duration) this.global.duration = 10;
  var bgrd = this.gbgrd;
  var cam = this.gcamera;
  var light = this.glight;
  var user = this.guser;
  var main = this.main;
  this.animlist = new Array();
  var al = this.animlist;
  if (bgrd) {
    if (bgrd.show === undefined) bgrd.show = true;
    if (bgrd.zoom === undefined) bgrd.zoom = 1;
    if (bgrd.start === undefined) bgrd.start = NONE;
    if (bgrd.followcam === undefined) bgrd.followcam = false;
    if (bgrd.followamount === undefined) bgrd.followamount = 1;
    initDefault(bgrd, "xmov", 0);
    initDefault(bgrd, "ymov", 0);
    al.push(bgrd.xmov);
    al.push(bgrd.ymov);
  }
  if (cam.start === undefined) cam.start = ONLOAD;
  if (cam.movecamera === undefined) cam.movecamera = true;
  initDefault(cam, "xmov", 0, -1, 1);
  initDefault(cam, "ymov", 0, -1, 1);
  initDefault(cam, "zmov", 0, -1, 1);
  initDefault(cam, "xrot", 0, -180, 180);
  initDefault(cam, "yrot", 0, -180, 180);
  initDefault(cam, "zrot", 0, -180, 180);
  initDefault(cam, "zoom", 0.8, 0.1, 10);
  al.push(cam.xmov);
  al.push(cam.ymov);
  al.push(cam.zmov);
  al.push(cam.xrot);
  al.push(cam.yrot);
  al.push(cam.zrot);
  al.push(cam.zoom);
  if (light.start === undefined) light.start = ONLOAD;
  if (!light.vector) light.vector = [0, 0, 1];
  if (light.followcam === undefined) light.followcam = true;
  initDefault(light, "xrot", 0, -180, 180);
  initDefault(light, "yrot", 0, -180, 180);
  initDefault(light, "shading", 0, 0, 1.5);
  initDefault(light, "ambient", 0, -1, 1);
  initDefault(light, "back", 0.5, 0, 1);
  initDefault(light, "specular", 0, 0, 1);
  al.push(light.xrot);
  al.push(light.yrot);
  al.push(light.shading);
  al.push(light.ambient);
  al.push(light.back);
  al.push(light.specular);
  if (user.rot === undefined) user.rot = true;
  if (user.mov === undefined) user.mov = true;
  if (user.zoom === undefined) user.zoom = true;
  if (main.start === undefined) main.start = ONLOAD;
  initDefault(main, "main", 0, 0, 1);
  if (main.main.speed === undefined) main.main.speed = 1 / this.global.duration;
  al.push(main.main);
  var i = 0;
  for (; i < this.objsz; i++) {
    var obj = this.objects[i];
    initDefault(obj, "xmov", 0);
    initDefault(obj, "ymov", 0);
    initDefault(obj, "zmov", 0);
    initDefault(obj, "scale", 1);
    initDefault(obj, "inflate", 1);
    initDefault(obj, "aspect", 1);
    initDefault(obj, "xrot", 0);
    initDefault(obj, "yrot", 0);
    initDefault(obj, "zrot", 0);
    initDefault(obj, "brightness", 0, -1, 1);
    initDefault(obj, "contrast", 0, -1, 1);
    initDefault(obj, "hue", 0, -1, 1);
    initDefault(obj, "saturation", 0, -1, 1);
    initDefault(obj, "red", 0, -1, 1);
    initDefault(obj, "green", 0, -1, 1);
    initDefault(obj, "blue", 0, -1, 1);
    initDefault(obj, "opacity", 1, 0, 1);
    al.push(obj.xmov);
    al.push(obj.ymov);
    al.push(obj.zmov);
    al.push(obj.scale);
    al.push(obj.inflate);
    al.push(obj.aspect);
    al.push(obj.xrot);
    al.push(obj.yrot);
    al.push(obj.zrot);
    al.push(obj.brightness);
    al.push(obj.contrast);
    al.push(obj.hue);
    al.push(obj.saturation);
    al.push(obj.red);
    al.push(obj.green);
    al.push(obj.blue);
    al.push(obj.opacity);
  }
};
PhotoAnim.prototype.initAnimators = function () {
  var al = this.animlist;
  var i = 0;
  for (; i < al.length; i++) {
    var an = al[i];
    an.run = true;
    an.time = 0;
    an.rndspeed = 0;
    an.reverse = false;
    an.value = an.startvalue;
    if (an.delay === undefined) an.delay = 0;
    if (an.speed === undefined) an.speed = 0;
    if (an.random === undefined) an.random = 0;
    if (an.alternate === undefined) an.alternate = true;
    if (an.loop === undefined) an.loop = true;
    if (an.trajx !== undefined) an.value = this.trajectory[an.trajx + 1];
    if (an.speed != 0 || an.random != 0) this.hasanim++;
  }
  if (this.main.replay) {
    this.main.replay.time = 0;
    al.push(this.main.replay);
  }
  if (
    (this.gbgrd !== undefined &&
      (this.gbgrd.start == ONCLICK || this.gbgrd.start == ONOVER)) ||
    this.gcamera.start == ONCLICK ||
    this.gcamera.start == ONOVER ||
    this.glight.start == ONCLICK ||
    this.glight.start == ONOVER ||
    this.main.start == ONCLICK ||
    this.main.start == ONOVER
  )
    this.hastrigger = true;
  if (
    this.hasanim == 1 &&
    this.main.main.speed != 0 &&
    this.trajectory.length < 3
  )
    this.hasanim = 0;
};
PhotoAnim.prototype.addReplay = function (d) {
  if (this.main.replay) {
    this.main.replay.duration = d;
    this.main.replay.run = false;
    return;
  }
  this.main.replay = { duration: d, time: 0, run: false };
  this.animlist.push(this.main.replay);
};
PhotoAnim.prototype.updateBgrdColor = function (r, g, b, a) {
  this.header.bgrdcolor = [r, g, b, a];
  this.gl.clearColor(r, g, b, a);
  this.refresh = true;
};
PhotoAnim.prototype.refreshVertices = function (vertices) {
  this.padef[1][0] = this.mesh[0] = this.vertices = vertices;
  var gl = this.gl;
  this.meshdata = new Float32Array(vertices);
  gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexbuffer);
  gl.bufferData(gl.ARRAY_BUFFER, this.meshdata, gl.DYNAMIC_DRAW);
  this.refresh = true;
};
PhotoAnim.prototype.updateTexture = function (texcanvas) {
  if (typeof texcanvas == "string") {
    this.image.src = texcanvas;
    return;
  }
  var gl = this.gl;
  gl.bindTexture(gl.TEXTURE_2D, this.texture);
  try {
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      texcanvas,
    );
  } catch (e) {
    alert("Could not upload texture image to graphic card");
    this.error = true;
    return false;
  }
  this.texloaded = true;
  this.refresh = true;
};
PhotoAnim.prototype.loadTextures = function (texobj) {
  this.countimage = 0;
  this.image.src = texobj.teximg[0].url;
  this.texcanvas = document.createElement("canvas");
  this.texcanvas.width = texobj.width;
  this.texcanvas.height = texobj.height;
  this.texctx = this.texcanvas.getContext("2d");
};
PhotoAnim.prototype.updateTexcoord = function (texcoord) {
  this.padef[1][1] = this.mesh[1] = this.texcoord = texcoord;
  var prog = this.prog;
  var gl = this.gl;
  var data = new Float32Array(texcoord);
  var texloc = gl.getAttribLocation(prog, "aTexCoord");
  gl.enableVertexAttribArray(texloc);
  if (!this._texBuf) this._texBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, this._texBuf);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  gl.vertexAttribPointer(texloc, 2, gl.FLOAT, false, 8, 0);
  this.refresh = true;
};
PhotoAnim.prototype.updateTriangles = function (tri) {
  this.padef[1][2] = this.mesh[2] = this.triangles = tri;
  if (this.can32triangles) tri = new Uint32Array(tri);
  else tri = new Uint16Array(tri);
  var gl = this.gl;
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, tri, gl.STATIC_DRAW);
  this.refresh = true;
};
PhotoAnim.prototype.InitObjects = function (data, objmxdata) {
  this.bgrdw = this.bgrdh = 0;
  var n = -1;
  var i;
  var j;
  if (this.gbgrd) {
    this.bgrdw = Math.abs(this.vertices[7] - this.vertices[0]);
    this.bgrdh = Math.abs(this.vertices[15] - this.vertices[8]);
  }
  i = 0;
  for (; i < this.vxsz; i++) {
    if (n < this.objsz - 1) if (i == this.objects[n + 1].vxstart) n++;
    data[i] = n;
  }
  var m;
  i = 0;
  for (; i < this.objsz; i++) {
    j = 0;
    for (; j < 4; j++) {
      this.objbchs[4 * i + j] = 0;
      this.objrgba[4 * i + j] = 0;
      if (j == 3) this.objrgba[4 * i + j] = 1;
    }
    this.objmatrix[i] = new CanvasMatrix4();
    m = this.objmatrix[i].getAsArray();
    j = 0;
    for (; j < 16; j++) objmxdata[16 * i + j] = m[j];
  }
};
PhotoAnim.prototype.OnLoadImage = function () {
  if (this != gphotoanim) return;
  if (this.teximage.teximg) {
    var tx = this.teximage.teximg[this.countimage];
    var img = this.image;
    this.texctx.drawImage(img, tx.x, tx.y);
    this.countimage++;
    if (this.countimage < this.teximage.teximg.length) {
      img.src = this.teximage.teximg[this.countimage].url;
      return;
    }
    this.image = this.texcanvas;
  }
  var gl = this.gl;
  gl.bindTexture(gl.TEXTURE_2D, this.texture);
  if (this.mesh[5] && this.mesh[5].length > 20) this.processAlpha();
  else {
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      this.image,
    );
    this.texloaded = true;
    this.refresh = true;
    if (this.ontexloaded) this.ontexloaded();
  }
};
PhotoAnim.prototype.OnErrorImage = function () {
  if (this != gphotoanim) return;
  getId("test").innerHTML = "Load image error";
  var date = new Date();
  this.image = this.teximage + "?" + date.getTime();
};
PhotoAnim.prototype.processAlpha = function () {
  var gl = this.gl;
  var a = this.mesh[5];
  var canvas;
  var ctx;
  var w;
  var h;
  if (this.texcanvas) {
    canvas = this.texcanvas;
    ctx = this.texctx;
    w = canvas.width;
    h = canvas.height;
  } else {
    canvas = document.createElement("canvas");
    w = this.image.width;
    h = this.image.height;
    canvas.width = w;
    canvas.height = h;
    ctx = canvas.getContext("2d");
    ctx.drawImage(this.image, 0, 0);
  }
  if (typeof a == "string") {
    this.alphactx = ctx;
    this.alphacnv = canvas;
    var aimg = new Image();
    this.alphaimg = aimg;
    aimg.onload = function () {
      var g = gphotoanim;
      g.alphactx.globalCompositeOperation = "destination-in";
      g.alphactx.drawImage(g.alphaimg, 0, 0);
      var gl = g.gl;
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        g.alphacnv,
      );
      g.alphacnv.width = g.alphacnv.height = 0;
      delete g.alphactx;
      delete g.alphacnv;
      delete g.alphaimg;
      g.texloaded = true;
      g.refresh = true;
      if (g.ontexloaded) g.ontexloaded();
    };
    aimg.src = a;
    return;
  } else {
    var imdata = ctx.getImageData(0, 0, w, h);
    var data = imdata.data;
    var i = 3;
    var sz = w * h * 4;
    var j;
    var k;
    var r;
    var v;
    j = 0;
    for (; j < a.length; j++) {
      r = a[j];
      if (r <= 1) {
        data[i] = r * 255;
        i = i + 4;
        continue;
      } else {
        v = a[++j] * 255;
        k = 0;
        for (; k < r; k++) {
          data[i] = v;
          i = i + 4;
        }
      }
    }
    ctx.putImageData(imdata, 0, 0);
    this.texloaded = true;
    this.refresh = true;
    if (this.ontexloaded) this.ontexloaded();
  }
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  canvas.width = canvas.height = 0;
};
PhotoAnim.prototype.OnMouseMove = function (ev) {
  function Restart(an, traj) {
    if (an.run) return;
    an.run = true;
    an.time = 0;
    if (!an.loop && an.value == an.max) an.value = an.min;
    if (an.trajx !== undefined) an.value += traj[an.trajx + 1];
  }
  function RestartObjs(objects, anobjlist, traj) {
    var i = 0;
    for (; i < objects.length; i++) {
      var j = 0;
      for (; j < anobjlist.length; j++) Restart(objects[i][anobjlist[j]], traj);
    }
  }
  if (this != gphotoanim) return;
  if (this.hastouch) return;
  var traj = this.trajectory;
  var brender = false;
  if (this.main.start == ONOVER) {
    Restart(this.main.main, traj);
    RestartObjs(this.objects, this.anobjlist, traj);
    brender = true;
  }
  if (this.gcamera.start == ONOVER) {
    Restart(this.xrotate, traj);
    Restart(this.yrotate, traj);
    Restart(this.zrotate, traj);
    Restart(this.xmove, traj);
    Restart(this.ymove, traj);
    Restart(this.zoom, traj);
    brender = true;
  }
  if (this.glight.start == ONOVER) {
    Restart(this.glight.xrot, traj);
    Restart(this.glight.yrot, traj);
    brender = true;
  }
  if (this.gbgrd)
    if (this.gbgrd.start == ONOVER && this.gbgrd.show) {
      Restart(this.gbgrd.xmov, traj);
      Restart(this.gbgrd.ymov, traj);
      brender = true;
    }
  if (
    this.ontrigger &&
    !this.overflag &&
    (this.main.start == ONOVER || this.gcamera.start == ONOVER)
  ) {
    this.ontrigger();
    this.overflag = true;
  }
  if (this.drag == 0) {
    if (brender) this.refresh = true;
    if (this.onmouse && this.mouseAction.hover == INFO) {
      var evt = new Object();
      evt.action = INFO;
      var dot = this.toCanvas(ev.clientX, ev.clientY);
      evt.x = dot.x;
      evt.y = dot.y;
      this.onmouse(evt);
    }
    return;
  }
  var dx = ev.clientX - this.xoffs;
  var dy = -ev.clientY + this.yoffs;
  if (this.onmouse) {
    evt = new Object();
    evt.action = NONE;
    if (this.button == 2 || ev.ctrlKey)
      switch (this.mouseAction.dragctrl) {
        case ZOOM:
          evt.action = ZOOM;
          evt.kzoom = dy < 0 ? 0.99 : 1.01;
          break;
        case TRANSLATE:
          evt.action = TRANSLATE;
          evt.dx = dx / this.w / this.zoom.value / 1.5;
          evt.dy = dy / this.h / this.zoom.value / 1.5;
          dot = this.toCanvas(ev.clientX, ev.clientY);
          evt.x = dot.x;
          evt.y = dot.y;
          break;
        case ROTATE:
          evt.action = ROTATE;
          evt.dx = -dy / 3;
          evt.dy = dx / 3;
          break;
      }
    else if (ev.shiftKey)
      switch (this.mouseAction.dragshift) {
        case ZOOM:
          evt.action = ZOOM;
          evt.kzoom = dy < 0 ? 0.99 : 1.01;
          break;
        case TRANSLATE:
          evt.action = TRANSLATE;
          evt.dx = dx / this.w / this.zoom.value / 1.5;
          evt.dy = dy / this.h / this.zoom.value / 1.5;
          dot = this.toCanvas(ev.clientX, ev.clientY);
          evt.x = dot.x;
          evt.y = dot.y;
          break;
        case ROTATE:
          evt.action = ROTATE;
          evt.dx = -dy / 3;
          evt.dy = dx / 3;
          break;
      }
    else
      switch (this.mouseAction.drag) {
        case ZOOM:
          evt.action = ZOOM;
          evt.kzoom = dy < 0 ? 0.99 : 1.01;
          break;
        case TRANSLATE:
          evt.action = TRANSLATE;
          evt.dx = dx / this.w / this.zoom.value / 1.5;
          evt.dy = dy / this.h / this.zoom.value / 1.5;
          dot = this.toCanvas(ev.clientX, ev.clientY);
          evt.x = dot.x;
          evt.y = dot.y;
          break;
        case ROTATE:
          evt.action = ROTATE;
          evt.dx = -dy / 3;
          evt.dy = dx / 3;
          break;
      }
    if (this.onmouse(evt)) {
      this.xoffs = ev.clientX;
      this.yoffs = ev.clientY;
      this.refresh = true;
      return;
    }
  }
  if (this.button == 2) {
    if (this.guser.zoom) {
      var del = 1.01;
      var ds = dy < 0 ? 1 / del : del;
      if (this.zoom.trajzoom) {
        var z = this.zoom;
        z.startvalue *= ds;
        if (z.startvalue > z.max) z.startvalue = z.max;
        else if (z.startvalue < z.min) z.startvalue = z.min;
      }
      this.zoom.value *= ds;
    }
  } else if (ev.shiftKey || !this.guser.rot)
    if (ev.ctrlKey && this.guser.zoom) {
      del = 1.01;
      ds = dy < 0 ? 1 / del : del;
      if (this.zoom.trajzoom) {
        z = this.zoom;
        z.startvalue *= ds;
        if (z.startvalue > z.max) z.startvalue = z.max;
        else if (z.startvalue < z.min) z.startvalue = z.min;
      }
      this.zoom.value *= ds;
    } else {
      if (this.guser.mov) {
        var deltax = dx / this.w / this.zoom.value / 1.5;
        var deltay = dy / this.h / this.zoom.value / 1.5;
        if (this.gcamera.movecamera) {
          deltax = -deltax;
          deltay = -deltay;
        }
        if (this.xmove.trajpos) {
          this.xmove.startvalue -= deltax;
          this.ymove.startvalue -= deltay;
          this.xmove.value -= deltax;
          this.ymove.value -= deltay;
        } else {
          this.xmove.value += deltax;
          this.ymove.value += deltay;
        }
      }
    }
  else if (ev.ctrlKey) {
    if (this.guser.zoom) {
      del = 1.01;
      ds = dy < 0 ? 1 / del : del;
      if (this.zoom.trajzoom) {
        z = this.zoom;
        z.startvalue *= ds;
        if (z.startvalue > z.max) z.startvalue = z.max;
        else if (z.startvalue < z.min) z.startvalue = z.min;
      }
      this.zoom.value *= ds;
    }
  } else if (this.guser.rot) {
    if (this.gcamera.movecamera || this.header.vrphoto) dx = -dx;
    if (this.gcamera.movecamera) dy = -dy;
    this.yrotate.value += dx / 3;
    this.xrotate.value -= dy / 3;
    if (this.xrotate.trajpos) {
      var xr = this.xrotate;
      var yr = this.yrotate;
      xr.startvalue -= dy / 3;
      yr.startvalue += dx / 3;
      if (xr.startvalue > xr.max) xr.startvalue = xr.max;
      else if (xr.startvalue < xr.min) xr.startvalue = xr.min;
      if (yr.startvalue > yr.max) yr.startvalue = yr.max;
      else if (yr.startvalue < yr.min) yr.startvalue = yr.min;
    }
  }
  this.xoffs = ev.clientX;
  this.yoffs = ev.clientY;
  this.refresh = true;
};
PhotoAnim.prototype.OnMouseDown = function (ev) {
  function Restart(an, traj) {
    if (an.run) an.run = false;
    else {
      an.run = true;
      an.time = 0;
      an.value = an.startvalue;
      if (an.trajx !== undefined) an.value += traj[an.trajx + 1];
    }
  }
  function RestartObjs(objects, anobjlist, traj) {
    var i = 0;
    for (; i < objects.length; i++) {
      var j = 0;
      for (; j < anobjlist.length; j++) Restart(objects[i][anobjlist[j]], traj);
    }
  }
  if (this != gphotoanim) return;
  if (this.hastouch) return;
  this.drag = 1;
  this.button = ev.button;
  this.xoffs = ev.clientX;
  this.yoffs = ev.clientY;
  if (this.button != 0) return;
  if (this.onmouse && this.mouseAction.click == INFO) {
    var evt = new Object();
    evt.action = INFO;
    var dot = this.toCanvas(ev.clientX, ev.clientY);
    evt.x = dot.x;
    evt.y = dot.y;
    this.onmouse(evt);
  }
  var brender = false;
  var traj = this.trajectory;
  if (this.main.start == ONCLICK) {
    Restart(this.main.main, traj);
    RestartObjs(this.objects, this.anobjlist, traj);
    brender = true;
  }
  if (this.gcamera.start == ONCLICK) {
    Restart(this.xrotate, traj);
    Restart(this.zrotate, traj);
    Restart(this.xmove, traj);
    Restart(this.ymove, traj);
    Restart(this.zoom, traj);
    if (this.header.vrphoto) this.yrotate.run = !this.yrotate.run;
    else Restart(this.yrotate, traj);
    brender = true;
  }
  if (this.glight.start == ONCLICK) {
    Restart(this.glight.xrot, traj);
    Restart(this.glight.yrot, traj);
    brender = true;
  }
  if (this.gbgrd)
    if (this.gbgrd.start == ONCLICK && this.gbgrd.show) {
      Restart(this.gbgrd.xmov, traj);
      Restart(this.gbgrd.ymov, traj);
      brender = true;
    }
  if (brender) this.refresh = true;
};
PhotoAnim.prototype.OnMouseUp = function (ev) {
  if (this != gphotoanim) return;
  if (this.hastouch) return;
  this.drag = 0;
  this.button = 0;
  this.xoffs = ev.clientX;
  this.yoffs = ev.clientY;
  if (
    this.ontrigger &&
    (this.main.start == ONCLICK || this.gcamera.start == ONCLICK)
  )
    this.ontrigger();
};
PhotoAnim.prototype.OnMouseOut = function () {
  function StopObjs(objects, anobjlist) {
    var i = 0;
    for (; i < objects.length; i++) {
      var j = 0;
      for (; j < anobjlist.length; j++) objects[i][anobjlist[j]].run = false;
    }
  }
  if (this != gphotoanim) return;
  this.overflag = false;
  if (this.hastouch) return;
  this.drag = 0;
  this.button = 0;
  if (this.main.start == ONOVER && this.main.main.loop) {
    this.main.main.run = false;
    StopObjs(this.objects, this.anobjlist);
  }
  if (this.gcamera.start == ONOVER) {
    if (this.xrotate.loop) this.xrotate.run = false;
    if (this.yrotate.loop) this.yrotate.run = false;
    if (this.zrotate.loop) this.zrotate.run = false;
    if (this.xmove.loop) this.xmove.run = false;
    if (this.ymove.loop) this.ymove.run = false;
    if (this.zoom.loop) this.zoom.run = false;
  }
  if (this.glight.start == ONOVER) {
    if (this.glight.xrot.loop) this.glight.xrot.run = false;
    if (this.glight.yrot.loop) this.glight.yrot.run = false;
  }
  if (this.gbgrd)
    if (this.gbgrd.start == ONOVER && this.gbgrd.show) {
      if (this.gbgrd.xmov.loop) this.gbgrd.xmov.run = false;
      if (this.gbgrd.ymov.loop) this.gbgrd.ymov.run = false;
    }
};
PhotoAnim.prototype.OnWheel = function (ev) {
  if (this != gphotoanim) return;
  if (this.hastouch) return;
  if (this.onmouse) {
    var evt = new Object();
    evt.action = NONE;
    switch (this.mouseAction.wheel) {
      case ZOOM:
        evt.action = ZOOM;
        evt.kzoom = (ev.detail || ev.wheelDelta) > 0 ? 0.95 : 1.05;
        break;
      case TRANSLATE:
        evt.action = TRANSLATE;
        evt.dy = (ev.detail || ev.wheelDelta) > 0 ? -5 : +5;
        evt.dx = 0;
        break;
      case ROTATE:
        evt.action = ROTATE;
        evt.dx = (ev.detail || ev.wheelDelta) > 0 ? -5 : +5;
        evt.dy = 0;
        break;
    }
    if (this.onmouse(evt)) {
      this.refresh = true;
      ev.preventDefault();
      return;
    }
  }
  if (!this.guser.zoom) return;
  var del = 1.02;
  var ds = (ev.detail || ev.wheelDelta) > 0 ? 1 / del : del;
  if (this.zoom.trajzoom) {
    var z = this.zoom;
    z.startvalue *= ds;
    if (z.startvalue > z.max) z.startvalue = z.max;
    else if (z.startvalue < z.min) z.startvalue = z.min;
  }
  this.zoom.value *= ds;
  this.refresh = true;
  ev.preventDefault();
};
PhotoAnim.prototype.OnStartTouch = function (ev) {
  function Restart(an, traj) {
    if (an.run) an.run = false;
    else {
      an.run = true;
      an.time = 0;
      an.value = an.startvalue;
      if (an.trajx !== undefined) an.value += traj[an.trajx + 1];
    }
  }
  function RestartObjs(objects, anobjlist, traj) {
    var i = 0;
    for (; i < objects.length; i++) {
      var j = 0;
      for (; j < anobjlist.length; j++) Restart(objects[i][anobjlist[j]], traj);
    }
  }
  if (this != gphotoanim) return;
  this.hastouch = true;
  var brender = false;
  var traj = this.trajectory;
  if (this.main.start == ONCLICK) {
    Restart(this.main.main, traj);
    RestartObjs(this.objects, this.anobjlist, traj);
    brender = true;
  }
  if (this.gcamera.start == ONCLICK) {
    Restart(this.xrotate, traj);
    Restart(this.zrotate, traj);
    Restart(this.xmove, traj);
    Restart(this.ymove, traj);
    Restart(this.zoom, traj);
    if (this.header.vrphoto) this.yrotate.run = !this.yrotate.run;
    else Restart(this.yrotate, traj);
    brender = true;
  }
  if (this.glight.start == ONCLICK) {
    Restart(this.glight.xrot, traj);
    Restart(this.glight.yrot, traj);
    brender = true;
  }
  if (this.gbgrd)
    if (this.gbgrd.start == ONCLICK && this.gbgrd.show) {
      Restart(this.gbgrd.xmov, traj);
      Restart(this.gbgrd.ymov, traj);
      brender = true;
    }
  this.refresh = true;
  if (
    this.ontrigger &&
    (this.main.start == ONOVER ||
      this.main.start == ONCLICK ||
      this.gcamera.start == ONOVER ||
      this.gcamera.start == ONCLICK)
  )
    this.ontrigger();
  var evlist = ev.touches;
  this.xoffs = evlist[0].pageX;
  this.yoffs = evlist[0].pageY;
  if (this.onmouse && this.mouseAction.click == INFO) {
    var evt = new Object();
    evt.action = INFO;
    var dot = this.toCanvas(this.xoffs, this.yoffs);
    evt.x = dot.x;
    evt.y = dot.y;
    this.onmouse(evt);
  }
  this.touchradius = -1;
  this.drag = 2;
};
PhotoAnim.prototype.OnContinueTouch = function (ev) {
  if (this != gphotoanim) return;
  var x;
  var y;
  var dx;
  var dy;
  var r = -1;
  var evlist = ev.touches;
  x = evlist[0].pageX;
  y = evlist[0].pageY;
  if (this.drag != 2) return;
  if (this.onmouse) {
    var evt = new Object();
    evt.action = NONE;
    if (evlist.length == 1) {
      dx = x - this.xoffs;
      dy = -y + this.yoffs;
      switch (this.mouseAction.touch1) {
        case ROTATE:
          evt.action = ROTATE;
          evt.dx = -dy / 3;
          evt.dy = dx / 3;
          break;
        case TRANSLATE:
          evt.action = TRANSLATE;
          var dot = this.toCanvas(x, y);
          evt.x = dot.x;
          evt.y = dot.y;
          evt.dx = dx / this.w / this.zoom.value / 1.5;
          evt.dy = dy / this.h / this.zoom.value / 1.5;
          break;
        case ZOOM:
          evt.action = ZOOM;
          evt.kzoom = dy < 0 ? 0.99 : 1.01;
          break;
      }
      if (this.onmouse(evt)) {
        this.xoffs = x;
        this.yoffs = y;
        this.refresh = true;
        return;
      }
    } else if (evlist.length == 2) {
      dx = evlist[1].pageX - evlist[0].pageX;
      dy = evlist[1].pageY - evlist[0].pageY;
      r = Math.sqrt(dx * dx + dy * dy);
      if (this.touchradius != -1 && this.mouseAction.touch2pinch == ZOOM) {
        evt.action = ZOOM;
        evt.kzoom = r / this.touchradius;
        this.onmouse(evt);
      }
      dx = x - this.xoffs;
      dy = y - this.yoffs;
      switch (this.mouseAction.touch2pan) {
        case ROTATE:
          evt.action = ROTATE;
          evt.dx = dy / 3;
          evt.dy = dx / 3;
          break;
        case TRANSLATE:
          evt.action = TRANSLATE;
          evt.dx = dx / this.w / this.zoom.value / 1.5;
          evt.dy = -dy / this.h / this.zoom.value / 1.5;
          break;
        case ZOOM:
          evt.action = ZOOM;
          evt.kzoom = dy < 0 ? 0.99 : 1.01;
          break;
      }
      if (this.onmouse(evt)) {
        this.touchradius = r;
        this.xoffs = x;
        this.yoffs = y;
        this.refresh = true;
        return;
      }
    }
  }
  if (evlist.length == 1) {
    dx = x - this.xoffs;
    dy = -y + this.yoffs;
    if (!this.gcamera.movecamera && !this.header.vrphoto) {
      dx = -dx;
      dy = -dy;
    }
    if (this.guser.rot) {
      this.yrotate.value -= dx / 3;
      this.xrotate.value += dy / 3;
      if (this.xrotate.trajpos) {
        var xr = this.xrotate;
        var yr = this.yrotate;
        xr.startvalue += dy / 3;
        yr.startvalue -= dx / 3;
        if (xr.startvalue > xr.max) xr.startvalue = xr.max;
        else if (xr.startvalue < xr.min) xr.startvalue = xr.min;
        if (yr.startvalue > yr.max) yr.startvalue = yr.max;
        else if (yr.startvalue < yr.min) yr.startvalue = yr.min;
      }
    } else if (this.guser.mov) {
      var deltax = (x - this.xoffs) / this.w / this.zoom.value / 2;
      var deltay = (y - this.yoffs) / this.h / this.zoom.value / 2;
      if (this.xmove.trajpos) {
        this.xmove.startvalue += deltax;
        this.ymove.startvalue -= deltay;
      }
      this.xmove.value += deltax;
      this.ymove.value -= deltay;
    }
  } else if (evlist.length == 2) {
    dx = evlist[1].pageX - evlist[0].pageX;
    dy = evlist[1].pageY - evlist[0].pageY;
    r = Math.sqrt(dx * dx + dy * dy);
    var phi;
    if (this.touchid == evlist[0].identifier) phi = Math.atan2(dy, dx);
    else phi = Math.atan2(-dy, -dx);
    if (this.guser.zoom)
      if (this.touchradius != -1) {
        this.zoom.value *= r / this.touchradius;
        if (this.zoom.trajzoom) {
          var z = this.zoom;
          z.startvalue *= r / this.touchradius;
          if (z.startvalue > z.max) z.startvalue = z.max;
          else if (z.startvalue < z.min) z.startvalue = z.min;
        }
      }
    if (this.guser.rot && this.touchradius != -1)
      if (
        this.header.aspect == undefined ||
        Math.abs(this.header.aspect - 1) < 0.2
      )
        this.zrotate.value += ((this.touchangle - phi) * 180) / Math.PI;
    if (this.guser.mov && this.guser.rot) {
      dx = (x - this.xoffs) / this.w / this.zoom.value;
      dy = (y - this.yoffs) / this.h / this.zoom.value;
      if (this.header.vrphoto) {
        this.xmove.value += dx;
        this.ymove.value -= dy;
      } else {
        if (!this.gcamera.movecamera) {
          dx = -dx;
          dy = -dy;
        }
        this.xmove.value -= dx / 2;
        this.ymove.value += dy / 2;
        if (this.xmove.trajpos) {
          this.xmove.startvalue -= dx / 2;
          this.ymove.startvalue += dy / 2;
        }
      }
    }
    this.touchradius = r;
    this.touchangle = phi;
  }
  this.xoffs = x;
  this.yoffs = y;
  this.refresh = true;
};
PhotoAnim.prototype.OnStopTouch = function (ev) {
  if (this != gphotoanim) return;
  this.overflag = false;
  this.drag = 0;
};
PhotoAnim.prototype.OnContextMenu = function (ev) {
  if (this != gphotoanim) return;
  return !this.guser.zoom;
};
PhotoAnim.prototype.DrawScene = function (bnosmooth) {
  this.DrawSceneW(bnosmooth);
  this.gl.finish();
};
PhotoAnim.prototype.DrawSceneW = function (bnosmooth) {
  if (this != gphotoanim) return;
  if (!this.texloaded) return;
  this.rotmat.makeIdentity();
  this.lightmat.makeIdentity();
  var xrot;
  var yrot;
  var zrot;
  var xmov;
  var ymov;
  var transl;
  if (this.global.user.rotlimit) {
    if (this.xrot < this.xrotate.min - 10)
      this.xrot = this.xrotate.value = this.xrotate.min - 10;
    else if (this.xrot > this.xrotate.max + 10)
      this.xrot = this.xrotate.value = this.xrotate.max + 10;
    if (this.yrot < this.yrotate.min - 10)
      this.yrot = this.yrotate.value = this.yrotate.min - 10;
    else if (this.yrot > this.yrotate.max + 10)
      this.yrot = this.yrotate.value = this.yrotate.max + 10;
  }
  if (bnosmooth || this.header.vrphoto) {
    xrot = this.xrot;
    yrot = this.yrot;
    zrot = this.zrot;
    xmov = this.xmov;
    ymov = this.ymov;
    transl = this.transl;
  } else {
    var dxrot = this.xrot - this.cxrot;
    var dyrot = this.yrot - this.cyrot;
    var dzrot = this.zrot - this.czrot;
    var dxmov = this.xmov - this.cxmov;
    var dymov = this.ymov - this.cymov;
    if (dxrot > 180) {
      dxrot = dxrot - 360;
      this.cxrot += 360;
    } else if (dxrot < -180) {
      dxrot = dxrot + 360;
      this.cxrot -= 360;
    }
    if (dyrot > 180) {
      dyrot = dyrot - 360;
      this.cyrot += 360;
    } else if (dyrot < -180) {
      dyrot = dyrot + 360;
      this.cyrot -= 360;
    }
    if (dzrot > 180) {
      dzrot = dzrot - 360;
      this.czrot += 360;
    } else if (dzrot < -180) {
      dzrot = dzrot + 360;
      this.czrot -= 360;
    }
    var dtransl = this.transl - this.ctransl;
    if (
      Math.abs(dxrot) < 1 &&
      Math.abs(dyrot) < 1 &&
      Math.abs(dzrot) < 1 &&
      Math.abs(dxmov) < 0.01 &&
      Math.abs(dymov) < 0.01 &&
      Math.abs(dtransl) < 0.01
    )
      this.refresh = false;
    var kfps = this.KFPS;
    this.cxrot += (dxrot / 10) * kfps;
    this.cyrot += (dyrot / 10) * kfps;
    this.czrot += (dzrot / 10) * kfps;
    this.cxmov += (dxmov / 10) * kfps;
    this.cymov += (dymov / 10) * kfps;
    this.ctransl += (dtransl / 10) * kfps;
    xrot = this.cxrot;
    yrot = this.cyrot;
    zrot = this.czrot;
    xmov = this.cxmov;
    ymov = this.cymov;
    transl = this.ctransl;
  }
  if (this.gcamera.movecamera && !this.header.vrphoto) {
    xrot = -xrot;
    yrot = -yrot;
    xmov = -xmov;
    ymov = -ymov;
  }
  if (this.header.vrphoto) {
    var vr = this.header.vrphoto;
    var min = this.yrotate.min;
    var max = this.yrotate.max;
    if (yrot < 0 && min < 0) {
      if (vr.ibook) yrot = 0;
      else yrot = (vr.shoots - 1) * vr.dangle;
      this.yrot = this.cyrot = this.yrotate.value = yrot;
    }
    if (yrot < min) yrot = this.yrot = this.cyrot = this.yrotate.value = min;
    if (yrot > max) yrot = this.yrot = this.cyrot = this.yrotate.value = max;
    var frame = Math.trunc(yrot / vr.dangle);
    if (min >= 0 && frame >= vr.shoots) frame = vr.shoots - 1;
    if (vr.ibook && frame >= vr.shoots) {
      frame = 0;
      yrot = this.yrot = this.cyrot = this.yrotate.value = 0;
    }
    frame = frame % vr.shoots;
    var f = this.curframe;
    if (f == -1) f = this.curframe = frame;
    else {
      if (min >= 0) f = f + (frame - f) / 4;
      else f = frame;
      if (Math.abs(f - this.curframe) < 0.5) this.refresh = false;
      this.curframe = f;
      f = Math.round(f);
    }
    if (vr.curframe != f && !vr.ibook && vr.xmovs) {
      var cam = this.global.camera;
      cam.xmov.value = vr.xmovs[f];
      cam.ymov.value = vr.ymovs[f];
      cam.zoom.value = vr.zooms[f];
    }
    if (vr.curframe != f && vr.onframechanged) {
      vr.curframe = f;
      vr.onframechanged(f);
    }
    vr.curframe = f;
    var row = Math.floor(f / vr.cols);
    var col = f % vr.cols;
    var txm = vr.texkw * 0.005;
    var tym = vr.texkh * 0.005;
    var tx = col * vr.texkw;
    var ty = row * vr.texkh;
    var t = this.texcoord;
    var ts = this.objects[0].vxstart * 2;
    t[ts] = t[ts + 6] = tx + txm;
    t[ts + 1] = t[ts + 3] = ty + tym;
    t[ts + 2] = t[ts + 4] = tx + vr.texkw - txm;
    t[ts + 5] = t[ts + 7] = ty + vr.texkh - tym;
    this.updateTexcoord(t);
    if (vr.aspects) {
      xrot = this.xrot = this.cxrot = this.xrotate.value = 0;
      var obj = this.objects[0];
      var asp = vr.aspects[vr.curframe];
      var asp0 = this.header.aspect;
      obj.aspect.value = asp / asp0;
      var scale;
      if (asp > asp0) obj.scale.value = asp0 / asp;
      else obj.scale.value = 1;
    } else if (xrot > 10)
      xrot = this.xrot = this.cxrot = this.xrotate.value = 10;
    else if (xrot < -10)
      xrot = this.xrot = this.cxrot = this.xrotate.value = -10;
  } else {
    this.rotmat.rotate(yrot, 0, 1, 0);
    if (this.glight.followcam) {
      this.lightmat.rotate(-yrot, 0, 1, 0);
      this.lightmat.rotate(-xrot, 1, 0, 0);
      this.lightmat.rotate(zrot, 0, 0, 1);
    } else {
      this.lightmat.rotate(this.ylgrot, 0, 1, 0);
      this.lightmat.rotate(this.xlgrot, 1, 0, 0);
    }
  }
  this.rotmat.rotate(xrot, 1, 0, 0);
  this.rotmat.rotate(zrot, 0, 0, 1);
  this.rotmat.translate(xmov, ymov, -1 / transl);
  var gl = this.gl;
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.uniformMatrix4fv(
    this.mvmatloc,
    false,
    new Float32Array(this.rotmat.getAsArray()),
  );
  gl.uniformMatrix4fv(
    this.lgmatloc,
    false,
    new Float32Array(this.lightmat.getAsArray()),
  );
  var lightdir = new Float32Array(this.glight.vector);
  gl.uniform3fv(this.lightdirloc, lightdir);
  gl.uniform4f(
    this.lightparloc,
    this.glight.shading.value,
    this.glight.back.value,
    this.glight.ambient.value,
    this.glight.shading.value * this.glight.specular.value,
  );
  var type = this.can32triangles ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
  gl.drawElements(gl.TRIANGLES, this.triangles.length, type, 0);
  gl.flush();
};
PhotoAnim.prototype.drawFrame = function (frame) {
  if (this != gphotoanim || !this.header.vrphoto) return;
  var gl = this.gl;
  this.UpdateObjects();
  var m;
  var i;
  var j;
  var objmxdata = this.objmxdata;
  i = 0;
  for (; i < this.objsz; i++) {
    m = this.objmatrix[i].getAsArray();
    j = 0;
    for (; j < 16; j++) objmxdata[16 * i + j] = m[j];
  }
  gl.uniformMatrix4fv(this.objmatrixloc, false, objmxdata);
  gl.uniform4fv(this.bchsloc, this.objbchs);
  gl.uniform4fv(this.rgbaloc, this.objrgba);
  this.rotmat.makeIdentity();
  this.lightmat.makeIdentity();
  this.rotmat.rotate(this.xrotate.value, 1, 0, 0);
  this.rotmat.rotate(this.zrotate.value, 0, 0, 1);
  this.rotmat.translate(
    this.xmove.value,
    this.ymove.value,
    -1 / this.zoom.value,
  );
  var vr = this.header.vrphoto;
  frame = Math.round(frame);
  if (frame < 0) frame = 0;
  else if (frame >= vr.shoots) frame = vr.shoots - 1;
  var row = Math.floor(frame / vr.cols);
  var col = frame % vr.cols;
  var tx = col * vr.texkw;
  var ty = row * vr.texkh;
  var t = this.texcoord;
  var ts = this.objects[0].vxstart * 2;
  t[ts] = t[ts + 6] = tx;
  t[ts + 1] = t[ts + 3] = ty;
  t[ts + 2] = t[ts + 4] = tx + vr.texkw;
  t[ts + 5] = t[ts + 7] = ty + vr.texkh;
  this.updateTexcoord(t);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.uniformMatrix4fv(
    this.mvmatloc,
    false,
    new Float32Array(this.rotmat.getAsArray()),
  );
  gl.uniformMatrix4fv(
    this.lgmatloc,
    false,
    new Float32Array(this.lightmat.getAsArray()),
  );
  var lightdir = new Float32Array(this.glight.vector);
  gl.uniform3fv(this.lightdirloc, lightdir);
  gl.uniform4f(
    this.lightparloc,
    this.glight.shading.value,
    this.glight.back.value,
    this.glight.ambient.value,
    this.glight.shading.value * this.glight.specular.value,
  );
  var type = this.can32triangles ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
  gl.drawElements(gl.TRIANGLES, this.triangles.length, type, 0);
  gl.flush();
  gl.finish();
};
PhotoAnim.prototype.updateNormals = function (data) {
  var i;
  i = 0;
  for (; i < this.objsz; i++) {
    var faces = this.objects[i].faces;
    if (faces == undefined) continue;
    if (faces.rtnormals == undefined) continue;
    if (faces.rtnormals[0]) {
      this.calcNormals(data);
      return;
    }
  }
};
PhotoAnim.prototype.calcNormals = function (vertices) {
  var triangles = this.triangles;
  var sz = vertices.length;
  var tab = new Float32Array(sz * 3);
  var tn = new Uint32Array(sz);
  var ntri = triangles.length / 3;
  var x0;
  var y0;
  var z0;
  var x1;
  var y1;
  var z1;
  var x2;
  var y2;
  var z2;
  var vx0;
  var vx1;
  var vx2;
  var i;
  var j;
  var u;
  var v;
  var w;
  var m;
  i = 0;
  for (; i < ntri; i++) {
    vx0 = triangles[3 * i] * 7;
    vx1 = triangles[3 * i + 1] * 7;
    vx2 = triangles[3 * i + 2] * 7;
    x0 = vertices[vx0];
    y0 = vertices[vx0 + 1];
    z0 = vertices[vx0 + 2];
    x1 = vertices[vx1] - x0;
    y1 = vertices[vx1 + 1] - y0;
    z1 = vertices[vx1 + 2] - z0;
    x2 = vertices[vx2] - x0;
    y2 = vertices[vx2 + 1] - y0;
    z2 = vertices[vx2 + 2] - z0;
    u = y1 * z2 - y2 * z1;
    v = z1 * x2 - z2 * x1;
    w = x1 * y2 - x2 * y1;
    if (tn[vx0] < 7) {
      tab[3 * (vx0 + tn[vx0])] = u;
      tab[3 * (vx0 + tn[vx0]) + 1] = v;
      tab[3 * (vx0 + tn[vx0]) + 2] = w;
      tn[vx0]++;
    }
    if (tn[vx1] < 7) {
      tab[3 * (vx1 + tn[vx1])] = u;
      tab[3 * (vx1 + tn[vx1]) + 1] = v;
      tab[3 * (vx1 + tn[vx1]) + 2] = w;
      tn[vx1]++;
    }
    if (tn[vx2] < 7) {
      tab[3 * (vx2 + tn[vx2])] = u;
      tab[3 * (vx2 + tn[vx2]) + 1] = v;
      tab[3 * (vx2 + tn[vx2]) + 2] = w;
      tn[vx2]++;
    }
  }
  i = 0;
  for (; i < sz; i = i + 7) {
    u = v = w = 0;
    j = 0;
    for (; j < tn[i]; j++) {
      u = u + tab[3 * (i + j)];
      v = v + tab[3 * (i + j) + 1];
      w = w + tab[3 * (i + j) + 2];
    }
    m = Math.sqrt(u * u + v * v + w * w);
    if (Math.abs(m) < 1e-7) {
      u = v = 0;
      w = 1;
    } else {
      u = u / m;
      v = v / m;
      w = w / m;
    }
    vertices[i + 4] = -u;
    vertices[i + 5] = -v;
    vertices[i + 6] = w;
  }
};
PhotoAnim.prototype.updateVertices = function (data, bforce) {
  function Interp(v0, v1, k) {
    return v0 * (1 - k) + v1 * k;
  }
  if (this != gphotoanim) return;
  var isbgrd = this.gbgrd !== undefined && this.gbgrd.show;
  var isanim = this.trajectory.length >= 8 && this.main.main.run;
  if (bforce === true) isanim = true;
  if (!isbgrd && !isanim) return;
  var t = this.main.main.value;
  if (t < 0) t = 0;
  if (t > 1) t = 1;
  var tr = 0;
  if (this.main.replay) tr = this.main.replay.time;
  var tscale = 1;
  if (this.header.vxtrajscale) tscale = this.header.vxtrajscale;
  var i;
  if (isbgrd) {
    var bgrdx;
    var bgrdy;
    var bgrdzoom;
    if (this.gbgrd.followcam) {
      var dxrot = -this.yrot * 0.004 * this.gbgrd.followamount;
      var dyrot = this.xrot * 0.004 * this.gbgrd.followamount;
      bgrdx = this.xmov * this.gbgrd.followamount + dxrot;
      bgrdy = this.ymov * this.gbgrd.followamount + dyrot;
      for (; bgrdx > this.bgrdw / 2; ) bgrdx = bgrdx - this.bgrdw;
      for (; bgrdx < -this.bgrdw / 2; ) bgrdx = bgrdx + this.bgrdw;
      for (; bgrdy > this.bgrdh / 2; ) bgrdy = bgrdy - this.bgrdh;
      for (; bgrdy < -this.bgrdh / 2; ) bgrdy = bgrdy + this.bgrdh;
    } else {
      bgrdx = this.gbgrd.xmov.value;
      bgrdy = this.gbgrd.ymov.value;
      if (bgrdx > this.bgrdw / 2) bgrdx = bgrdx - this.bgrdw;
      else if (bgrdx < -this.bgrdw / 2) bgrdx = bgrdx + this.bgrdw;
      if (bgrdy > this.bgrdh / 2) bgrdy = bgrdy - this.bgrdh;
      else if (bgrdy < -this.bgrdh / 2) bgrdy = bgrdy + this.bgrdh;
    }
    this.gbgrd.xmov.value = bgrdx;
    this.gbgrd.ymov.value = bgrdy;
    if (this.cbgrdx == 1e3) this.cbgrdx = bgrdx;
    if (Math.abs(bgrdx - this.cbgrdx) >= this.bgrdw / 2)
      bgrdx - this.cbgrdx < 0
        ? (this.cbgrdx -= this.bgrdw)
        : (this.cbgrdx += this.bgrdw);
    this.cbgrdx += (bgrdx - this.cbgrdx) / 10;
    if (this.cbgrdy == 1e3) this.cbgrdy = bgrdy;
    if (Math.abs(bgrdy - this.cbgrdy) >= this.bgrdh / 2)
      bgrdy - this.cbgrdy < 0
        ? (this.cbgrdy -= this.bgrdh)
        : (this.cbgrdy += this.bgrdh);
    this.cbgrdy += (bgrdy - this.cbgrdy) / 10;
    bgrdzoom = this.gbgrd.zoom;
  }
  i = 0;
  for (; i < this.vxsz; i++) {
    var vx = 7 * i;
    var v;
    var x = this.vertices[vx + 3];
    if (x < 0) {
      if (this.gbgrd == undefined || !this.gbgrd.show) continue;
      data[vx] = (this.vertices[vx] + this.cbgrdx) * bgrdzoom;
      data[vx + 1] = (this.vertices[vx + 1] + this.cbgrdy) * bgrdzoom;
      continue;
    }
    if (this.trajectory.length < 4)
      if (isbgrd) break;
      else return;
    if (x == 0) continue;
    var sz = this.trajectory[x++];
    var j;
    var jint;
    var k;
    if (sz < 0) {
      var n = -sz;
      var y;
      var nn;
      var kx;
      var ky;
      var kz;
      data[vx] = this.vertices[vx];
      data[vx + 1] = this.vertices[vx + 1];
      data[vx + 2] = this.vertices[vx + 2];
      nn = 0;
      for (; nn < n; nn++) {
        y = this.trajectory[x++];
        kx = this.trajectory[x++] * tscale;
        ky = this.trajectory[x++] * tscale;
        kz = this.trajectory[x++] * tscale;
        sz = this.trajectory[y++];
        if (sz < 0) {
          sz = -sz;
          j = tr * (sz - 1);
        } else j = t * (sz - 1);
        jint = Math.floor(j);
        k = j - jint;
        if (jint >= sz - 1) v = this.trajectory[y + sz - 1];
        else
          v = Interp(
            this.trajectory[y + jint],
            this.trajectory[y + jint + 1],
            k,
          );
        data[vx] += kx * v;
        data[vx + 1] += ky * v;
        data[vx + 2] += kz * v;
      }
      vx = vx + 3;
    } else {
      j = t * (sz - 1);
      jint = Math.floor(j);
      k = j - jint;
      if (jint >= sz - 1) {
        x = x + 3 * (sz - 1);
        data[vx] = this.vertices[vx++] + this.trajectory[x++];
        data[vx] = this.vertices[vx++] + this.trajectory[x++];
        data[vx] = this.vertices[vx++] + this.trajectory[x++];
      } else {
        x = x + 3 * jint;
        data[vx] =
          this.vertices[vx++] +
          Interp(this.trajectory[x], this.trajectory[x++ + 3], k);
        data[vx] =
          this.vertices[vx++] +
          Interp(this.trajectory[x], this.trajectory[x++ + 3], k);
        data[vx] =
          this.vertices[vx++] +
          Interp(this.trajectory[x], this.trajectory[x + 3], k);
      }
    }
  }
  this.updateNormals(data);
  var gl = this.gl;
  gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexbuffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
};
PhotoAnim.prototype.ObjTrajValue = function (x, t) {
  var sz = this.trajectory[x++];
  if (sz < 0) {
    sz = -sz;
    t = this.main.replay.time;
  }
  var j = t * (sz - 1);
  var jint = Math.floor(j);
  var k = j - jint;
  if (jint >= sz - 1) return this.trajectory[x + sz - 1];
  else
    return (
      this.trajectory[x + jint] * (1 - k) + this.trajectory[x + jint + 1] * k
    );
};
PhotoAnim.prototype.UpdateObject = function (n) {
  var obj = this.objects[n];
  var centerx = obj.center[0];
  var centery = obj.center[1];
  var centerz = obj.center[2];
  if (this.objmatrix === undefined || this.objmatrix[n] === undefined) return;
  this.objmatrix[n].makeIdentity();
  var s = obj.scale.value;
  var xr = obj.xrot.value;
  var yr = obj.yrot.value;
  var zr = obj.zrot.value;
  var x = obj.xmov.value;
  var y = obj.ymov.value;
  var z = obj.zmov.value;
  var inflate = obj.inflate.value;
  var aspect = obj.aspect.value;
  if (s == 1 && inflate == 1 && aspect == 1 && xr == 0 && yr == 0 && zr == 0)
    this.objmatrix[n].translate(x, y, z);
  else {
    this.objmatrix[n].translate(-centerx, -centery, -centerz);
    this.objmatrix[n].rotate(zr, 0, 0, 1);
    this.objmatrix[n].rotate(yr, 0, 1, 0);
    this.objmatrix[n].rotate(xr, 1, 0, 0);
    this.objmatrix[n].scale(s, s * aspect, s * inflate);
    this.objmatrix[n].translate(centerx + x, centery + y, centerz + z);
  }
  this.objbchs[4 * n] = obj.brightness.value;
  this.objbchs[4 * n + 1] = obj.contrast.value;
  this.objbchs[4 * n + 2] = obj.hue.value * 3.14;
  this.objbchs[4 * n + 3] = obj.saturation.value;
  this.objrgba[4 * n] = obj.red.value;
  this.objrgba[4 * n + 1] = obj.green.value;
  this.objrgba[4 * n + 2] = obj.blue.value;
  this.objrgba[4 * n + 3] = obj.opacity.value;
};
PhotoAnim.prototype.UpdateObjects = function () {
  var i;
  i = 0;
  for (; i < this.objsz; i++) this.UpdateObject(i);
};
PhotoAnim.prototype.updateAnimators = function (dtime) {
  if (this.pause) return;
  var i;
  i = 0;
  for (; i < this.animlist.length; i++)
    this.updateAnimator(this.animlist[i], dtime);
};
PhotoAnim.prototype.updateAnimator = function (an, dtime) {
  var delta;
  var time;
  if (!an.run) return;
  if (an == this.main.replay) {
    delta = dtime / an.duration;
    an.time += delta;
    if (an.time > 1) {
      an.time = 0;
      if (an.onended) an.onended();
    }
    return;
  }
  if (an == this.main.main) {
    delta = dtime / this.global.duration;
    time = an.reverse ? an.time - delta : an.time + delta;
    if (time > 1) {
      time = 1;
      if (an.alternate) an.reverse = !an.reverse;
      else if (an.loop) time = 0;
      else an.run = false;
    } else if (time < 0) {
      time = 0;
      if (an.alternate) an.reverse = !an.reverse;
      if (!an.loop) {
        an.reverse = false;
        an.run = false;
      }
    }
    an.time = an.value = time;
    return;
  }
  if (an.trajx !== undefined) {
    time = this.main.main.time;
    an.value = this.ObjTrajValue(an.trajx, time);
    an.run = this.main.main.run;
    if (an.trajpos) an.value += an.startvalue;
    else if (an.trajzoom) an.value *= an.startvalue;
    return;
  }
  if (an.sync) an.value = this[an.sync];
  if (an.value < an.min) an.value = an.min;
  if (an.value > an.max) an.value = an.max;
  if (an.random == 0) an.rndspeed = 0;
  an.time += dtime;
  if (an.time < an.delay) return;
  delta = (an.speed + an.rndspeed) * dtime;
  var value = an.value;
  value = an.reverse ? value - delta : value + delta;
  if (value > an.max) {
    value = an.max;
    if (an.alternate) an.reverse = !an.reverse;
    else if (an.loop) value = an.min;
    else an.run = false;
  } else if (value < an.min) {
    value = an.min;
    if (an.alternate) an.reverse = !an.reverse;
    if (an.loop) {
      if (!an.alternate) value = an.max;
    } else {
      an.reverse = false;
      an.run = false;
    }
  }
  if (an.run) {
    var r = an.rndspeed + (Math.random() - 0.5) * an.random;
    if (Math.abs(r) < 2 * Math.abs(an.random)) an.rndspeed = r;
  }
  an.value = value;
};
PhotoAnim.prototype.resetAnimator = function (an, start) {
  an.reverse = false;
  an.time = 0;
  an.rndspeed = 0;
  an.run = start == ONLOAD;
  an.value = an.startvalue;
  if (an.trajx !== undefined) an.value += this.trajectory[an.trajx + 1];
};
PhotoAnim.prototype.renderFrameEx = function (bnosmooth) {
  this.renderFrame(bnosmooth);
  this.gl.finish();
};
PhotoAnim.prototype.renderFrame = function (bnosmooth) {
  function StopObjs(objects, anobjlist) {
    var i = 0;
    for (; i < objects.length; i++) {
      var j = 0;
      for (; j < anobjlist.length; j++) objects[i][anobjlist[j]].run = false;
    }
  }
  if (this != gphotoanim) return;
  if (this.pause && !this.refresh) return;
  var firstrender = false;
  var curtime;
  if (this.forcedtime !== undefined) curtime = this.forcedtime;
  else curtime = new Date().getTime();
  var dtime = 0;
  if (this.oldtime != -1) dtime = (curtime - this.oldtime) / 1e3;
  else {
    this.time = 0;
    firstrender = true;
    if (this.main.start != ONLOAD) {
      this.main.main.run = false;
      StopObjs(this.objects, this.anobjlist);
    }
    if (this.gcamera.start != ONLOAD) {
      if (this.xmove.run) this.xmove.run = false;
      if (this.ymove.run) this.ymove.run = false;
      if (this.xrotate.run) this.xrotate.run = false;
      if (this.yrotate.run) this.yrotate.run = false;
      if (this.zrotate.run) this.zrotate.run = false;
      if (this.zoom.run) this.zoom.run = false;
    }
    if (this.glight.start != ONLOAD) {
      if (this.glight.xrot.run) this.glight.xrot.run = false;
      if (this.glight.yrot.run) this.glight.yrot.run = false;
    }
    if (this.gbgrd)
      if (this.gbgrd.start != ONLOAD && this.gbgrd.show) {
        if (this.gbgrd.xmov.run) this.gbgrd.xmov.run = false;
        if (this.gbgrd.ymov.run) this.gbgrd.ymov.run = false;
      }
  }
  if (this.guser.rot || this.guser.zoom || this.guser.mov)
    this.canvas.style.cursor = "move";
  else this.canvas.style.cursor = "";
  if (this.main.start == ONCLICK || this.gcamera.start == ONCLICK)
    this.canvas.style.cursor = "pointer";
  this.oldtime = curtime;
  this.time += dtime;
  this.updateAnimators(dtime);
  this.xrot = this.xrotate.value;
  this.yrot = this.yrotate.value;
  this.zrot = this.zrotate.value;
  this.xmov = this.xmove.value;
  this.ymov = this.ymove.value;
  this.transl = this.zoom.value;
  this.xlgrot = this.glight.xrot.value;
  this.ylgrot = this.glight.yrot.value;
  if (this.yrotate.stereo) {
    var v = (this.yrot + 10) / 20;
    if (v < 0) v = 0;
    if (v > 1) v = 1;
    this.objects[1].opacity.value = v;
  }
  var data = this.meshdata;
  this.updateVertices(data, firstrender);
  var kale = this.header.kale;
  if (kale && (kale.tx.run || kale.ty.run)) {
    v = this.main.main.value;
    var texx = this.vertices[3] == -1 ? 72 : 0;
    if (kale.tx.run)
      this.texcoord[texx] = kale.tx.max * v + kale.tx.min * (1 - v);
    if (kale.ty.run)
      this.texcoord[texx + 1] = kale.ty.max * v + kale.ty.min * (1 - v);
    this.updateTexcoord(this.texcoord);
  }
  var gl = this.gl;
  this.UpdateObjects();
  var m;
  var i;
  var j;
  var objmxdata = this.objmxdata;
  i = 0;
  for (; i < this.objsz; i++) {
    m = this.objmatrix[i].getAsArray();
    j = 0;
    for (; j < 16; j++) objmxdata[16 * i + j] = m[j];
  }
  gl.uniformMatrix4fv(this.objmatrixloc, false, objmxdata);
  gl.uniform4fv(this.bchsloc, this.objbchs);
  gl.uniform4fv(this.rgbaloc, this.objrgba);
  this.DrawSceneW(bnosmooth);
};
PhotoAnim.prototype.renderFast = function (bnosmooth) {
  if (this != gphotoanim) return;
  this.xrot = this.xrotate.value;
  this.yrot = this.yrotate.value;
  this.zrot = this.zrotate.value;
  this.xmov = this.xmove.value;
  this.ymov = this.ymove.value;
  this.transl = this.zoom.value;
  this.DrawScene(bnosmooth);
};
PhotoAnim.prototype.toCanvas = function (ix, iy) {
  var canvas = this.canvas;
  var x = ix - canvas.clientLeft - canvas.offsetLeft;
  var y = iy - canvas.clientTop - canvas.offsetTop;
  var parent = canvas.offsetParent;
  for (; parent; ) {
    x = x - parent.offsetLeft;
    y = y - parent.offsetTop;
    if (!parent.offsetParent) break;
    parent = parent.offsetParent;
  }
  if (!this.hastouch) {
    x = x + window.pageXOffset;
    y = y + window.pageYOffset;
  }
  x = x - canvas.width / 2;
  x = x / canvas.width;
  y = y - canvas.height / 2;
  y = y / -canvas.width;
  return { x: x, y: y };
};
PhotoAnim.prototype.getMaxObjects = function () {
  var gl = this.gl;
  var uni = gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS);
  return Math.floor((uni - 16) / 12);
};
function PA_InitHandlers(model) {
  var image = model.image;
  var onLoad = function () {
    model.OnLoadImage();
  };
  var onError = function () {
    model.OnErrorImage();
  };
  image.addEventListener("load", onLoad, false);
  image.addEventListener("error", onError, false);
  var canvas = model.canvas;
  var wheelHandler = function (ev) {
    model.OnWheel(ev);
    ev.preventDefault();
  };
  var mouseDown = function (ev) {
    model.OnMouseDown(ev);
  };
  var mouseUp = function (ev) {
    model.OnMouseUp(ev);
  };
  var mouseMove = function (ev) {
    model.OnMouseMove(ev);
  };
  var mouseOut = function (ev) {
    model.OnMouseOut();
  };
  var contextMenu = function (ev) {
    if (!model.OnContextMenu()) ev.preventDefault();
  };
  var startTouch = function (ev) {
    model.OnStartTouch(ev);
    ev.preventDefault();
  };
  var continueTouch = function (ev) {
    model.OnContinueTouch(ev);
    ev.preventDefault();
  };
  var stopTouch = function (ev) {
    model.OnStopTouch(ev);
  };
  canvas.addEventListener("DOMMouseScroll", wheelHandler, false);
  canvas.addEventListener("mousewheel", wheelHandler, false);
  canvas.addEventListener("mousedown", mouseDown, false);
  canvas.addEventListener("mouseup", mouseUp, false);
  canvas.addEventListener("mousemove", mouseMove, false);
  canvas.addEventListener("mouseout", mouseOut, false);
  canvas.addEventListener("contextmenu", contextMenu, false);
  canvas.addEventListener("touchstart", startTouch, false);
  canvas.addEventListener("touchmove", continueTouch, false);
  canvas.addEventListener("touchend", stopTouch, false);
}
function PA_Grid_Mesh(padef) {
  this.par = new Array(4);
  this.par[0] = padef[0];
  this.par[1] = new Array(5);
  this.par[2] = padef[2];
  this.par[3] = padef[3];
  var pp = padef[0].preproc;
  if (pp[0] != "xtrude") return undefined;
  this.meshsz = pp[1];
  this.texw = pp[2];
  this.texh = pp[3];
  this.teximw = pp[4];
  this.teximh = pp[5];
  this.CalcVertices(padef[1][1]);
  this.UnpackZ(padef[1][0]);
}
PA_Grid_Mesh.prototype.CalcVertices = function (texture) {
  var nb = this.meshsz;
  var vertices = new Float32Array(nb * nb * 7);
  var texcoord = new Float32Array(nb * nb * 2);
  var triangles = new Float32Array(3 * 2 * (nb - 1) * (nb - 1));
  var div = this.teximw;
  if (this.teximh < this.teximw) div = this.teximh;
  var dx = this.teximw / div / (nb - 1);
  var dy = this.teximh / div / (nb - 1);
  var dtx = this.teximw / this.texw / (nb - 1);
  var dty = this.teximh / this.texh / (nb - 1);
  var x = -this.teximw / div / 2;
  var y = this.teximh / div / 2;
  var tx = 0;
  var ty = 0;
  var i;
  var j;
  var k;
  j = 0;
  for (; j < nb; j++) {
    i = 0;
    for (; i < nb; i++) {
      k = 7 * (j * nb + i);
      vertices[k] = x;
      vertices[k + 1] = y;
      vertices[k + 2] = vertices[k + 3] = vertices[k + 4] = vertices[k + 5] = 0;
      vertices[k + 6] = 1;
      k = 2 * (j * nb + i);
      texcoord[k] = tx;
      texcoord[k + 1] = ty;
      x = x + dx;
      tx = tx + dtx;
    }
    x = -this.teximw / div / 2;
    tx = 0;
    y = y - dy;
    ty = ty + dty;
  }
  j = 0;
  for (; j < nb - 1; j++) {
    i = 0;
    for (; i < nb - 1; i++) {
      k = 6 * ((nb - 1) * j + i);
      triangles[k] = j * nb + i;
      triangles[k + 1] = triangles[k + 4] = (j + 1) * nb + i;
      triangles[k + 2] = triangles[k + 3] = j * nb + i + 1;
      triangles[k + 5] = (j + 1) * nb + i + 1;
    }
  }
  var mesh = this.par[1];
  mesh[0] = vertices;
  mesh[1] = texcoord;
  mesh[2] = triangles;
  mesh[3] = [0];
  mesh[4] = texture;
};
PA_Grid_Mesh.prototype.UnpackZ = function (zvx) {
  var nb = this.meshsz * this.meshsz;
  var i;
  var j;
  var x = 0;
  var r;
  var v;
  var vtx = this.par[1][0];
  i = 0;
  for (; i < zvx.length; i++) {
    r = zvx[i];
    if (r < 100) vtx[7 * x++ + 2] = r;
    else {
      v = zvx[++i];
      j = 0;
      for (; j < r - 100; j++) vtx[7 * x++ + 2] = v;
    }
  }
};
