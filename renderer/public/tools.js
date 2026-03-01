// (c) 2014 CCDSoft - 140407 - fixed compatibility issues with IE11
// 140505 - Touch control for sliders and switches
// 141103 - fixed touch control on ColorSel
// 141113 - encodeuri added on SendJSON
// 150414 - minor cosmetic fixes on touch button
// 150701 - fixed bug in toCanvas when control is in a scrollable div
// 150911 - Added UpdateJSON - do not send mesh/texture if not modified
// 151019 - https
// 170927 - added UpdateProfile
// 171113 - custom header gzip-Content-Length on AsyncReceive
// 171116 - modified updateAlpha to send only dataurl without useless JSON encoding
//          sendJSON uploads zipped animations, greatly improves upload time for avatar and maskeditor
//			needs jszip.js and upload.php
// 181101 - Do not zip with Internet Explorer because send blob results in error 404
// 181213 - Added AddReply (reply to comment)
// 190522 - fixed server bug zip type not accepted
// 230213 - remove zipped animations as zip is not always compatible

var BUTTONSCALE = 1,
  dbalert =
    "The database is currently unavailable or your session has expired.\nPlease try to login again.",
  isajaxsending = !1,
  isajaxreceiving = !1,
  ajsonstr = "",
  ajcancel = !1;
function unEscape(a) {
  return unescape(unescape(a));
}
function SpecialHTML(a) {
  for (a = unEscape(a); -1 != a.indexOf("<"); ) a = a.replace("<", "&lt;");
  for (; -1 != a.indexOf(">"); ) a = a.replace(">", "&gt;");
  for (; -1 != a.indexOf('"'); ) a = a.replace('"', "&quot;");
  for (; -1 != a.indexOf("'"); ) a = a.replace("'", "&apos;");
  for (; -1 != a.indexOf("\n"); ) a = a.replace("\n", "<br>");
  return a;
}
function Capitalize(a) {
  if (void 0 !== a) return a.substring(0, 1).toUpperCase() + a.substring(1);
}
function Short(a) {
  a = a.toString();
  if (-1 != a.indexOf("e-", 0)) return 0;
  var b = a.split(".");
  1 != b.length && 4 < b[1].length && (a = b[0] + "." + b[1].substring(0, 4));
  return Number(a);
}
function getRadioValue(a) {
  for (var b = 0; b < a.length; b++) if (a[b].checked) return a[b].value;
}
function setRadioValue(a, b) {
  for (var c = 0; c < a.length; c++) a[c].checked = c == b ? !0 : !1;
}
function getId(a) {
  return document.getElementById(a) || { style: {}, display: "none" };
}
function getStyle(a) {
  var el = document.getElementById(a);
  return el ? el.style : {};
}
function displayId(a, b) {
  var el = document.getElementById(a);
  if (el) el.style.display = b ? "inline" : "none";
}
function displayStyle(a, b) {
  a.display = b ? "inline" : "none";
}
function deflateJSON(a) {
  a = a.replace(/,0,/g, ",,");
  a = a.replace(/,0,/g, ",,");
  a = a.replace(/-0\./g, "-.");
  return (a = a.replace(/,0\./g, ",."));
}
function inflateJSON(a) {
  a = a.replace(/,,/g, ",0,");
  a = a.replace(/,,/g, ",0,");
  a = a.replace(/-\./g, "-0.");
  return (a = a.replace(/,\./g, ",0."));
}
function WaitCursor(a) {
  document.body.style.cursor = a ? "progress" : "auto";
}
var Ajax = function () {
  this.ajax = new XMLHttpRequest();
  this.server = "pajax.php";
};
Ajax.prototype.Stat = function (a) {
  return this.SyncSend("stat?" + a);
};
Ajax.prototype.Echo = function (a) {
  return this.SyncSend("echo?" + a);
};
Ajax.prototype.UserAgent = function () {
  return this.SyncSend("useragent?");
};
Ajax.prototype.Login = function (a, b) {
  var c = this.SyncSend("login?" + a + "&" + b);
  return "failed" == c
    ? ((c = this.SyncSend("dbstatus?")), "failed" == c && alert(dbalert), !1)
    : !0;
};
Ajax.prototype.Logout = function () {
  this.SyncSend("logout?");
};
Ajax.prototype.GetUser = function () {
  var a = this.SyncSend("getsession?");
  if ("failed" != a) return a;
};
Ajax.prototype.GetAdult = function (a) {
  return "ok" == this.SyncSend("getadult?" + a);
};
Ajax.prototype.GetHandle = function () {
  return this.SyncSend("gethandle?");
};
Ajax.prototype.Like = function (a) {
  return this.SyncSend("like?" + a);
};
Ajax.prototype.SendVignette = function (a, b) {
  var c = b.toDataURL("image/jpeg");
  c = c.split(",");
  return this.SyncSend("sendvignette?" + a + "&" + c[1]);
};
Ajax.prototype.SendTmpCanvas = function (a, b, c) {
  a = a.toDataURL("image/jpeg");
  a = a.split(",");
  this.AsyncSend("sendtmp?" + a[1], null, b, c);
};
Ajax.prototype.SendJSON = function (a, b, c, e, d) {
  ajsonstr = JSON.stringify(b);
  ajsonstr = deflateJSON(ajsonstr);
  b = navigator.userAgent;
  -1 != b.indexOf("MSIE") || b.indexOf("Trident");
  b = encodeURIComponent(ajsonstr);
  this.AsyncSend("sendJSON?" + a + "&" + b, c, e, d);
};
Ajax.prototype.sendAnim = function (a, b, c, e, d) {
  function f() {
    k
      ? m("alpha", k, c, g, d)
      : h
        ? m("audio", h, c, z, d)
        : m("jszip", r, c, x, d);
  }
  function g() {
    h ? m("audio", h, c, z, d) : m("jszip", r, c, x, d);
  }
  function z() {
    m("jszip", r, c, x, d);
  }
  function x() {
    b[1][4] = p;
    k && (b[1][5] = k);
    h && (b[3].replay.audio = h);
    e("ok");
    isajaxsending = !1;
  }
  function m(q, t, A, C, n) {
    var l = new XMLHttpRequest();
    l.onreadystatechange = function (y) {
      4 == l.readyState &&
        ("ok" != l.responseText
          ? n()
          : ((u = "string" == typeof t ? u + t.length : u + t.size), C()));
    };
    l.upload.onprogress = function (y) {
      ajcancel
        ? (l.abort(),
          (ajcancel = isjaxsending = !1),
          (b[1][4] = p),
          k && (b[1][5] = k),
          h && (b[3].replay.audio = h),
          n && n())
        : A && A(y.loaded + u, v);
    };
    l.onerror = function () {
      n && n();
    };
    l.open("POST", "upload.php?type=" + q + "&h=" + a, !0);
    try {
      l.send(t);
    } catch (y) {
      (alert(
        "Operation not supported\nPlease switch to a modern browser like Chrome or Firefox",
      ),
        n && n());
    }
  }
  if (!isajaxsending) {
    isajaxsending = !0;
    ajcancel = !1;
    var p = b[1][4];
    if (0 != p.indexOf("data:image/") && d) d("Texture is not a data url");
    else {
      b[1][4] = "data:texplaceholder";
      if (6 == b[1].length) {
        var k = b[1][5];
        if (0 != k.indexOf("data:image/") && d) {
          d("Alpha is not a data url");
          return;
        }
        b[1][5] = "data:alphaplaceholder";
      }
      if (
        b[3].replay &&
        b[3].replay.audio &&
        0 == b[3].replay.audio.indexOf("data:audio/")
      ) {
        var h = b[3].replay.audio;
        b[3].replay.audio = "data:audioplaceholder";
      }
      var w = JSON.stringify(b),
        D = w.length;
      w = deflateJSON(w);
      var B = new JSZip();
      B.file("dummy.txt", w);
      B.generateAsync({ type: "blob", compression: "DEFLATE" }).then(
        function (q) {
          console.log("Compression factor: " + D / q.size);
          r = new Blob([q], { type: "image/jpeg" });
          v = p.length + q.size;
          k && (v += k.length);
          h && (v += h.length);
          m("texture", p, c, f, d);
        },
      );
      var v,
        u = 0,
        r;
    }
  }
};
Ajax.prototype.UpdateJSON = function (a, b, c, e, d) {
  var f = Array(3);
  f[0] = b[0];
  f[1] = b[2];
  f[2] = b[3];
  ajsonstr = JSON.stringify(f);
  ajsonstr = deflateJSON(ajsonstr);
  b = encodeURIComponent(ajsonstr);
  this.AsyncSend("updateJSON?" + a + "&" + b, c, e, d);
};
Ajax.prototype.UpdateAlpha = function (a, b, c, e, d) {
  ajsonstr = b;
  this.AsyncSend("updateAlpha?" + a + "&" + b, c, e, d);
};
Ajax.prototype.GetJSON = function (a, b, c, e) {
  this.AsyncReceive("?h=" + a, b, c, e);
};
Ajax.prototype.GetSize = function (a) {
  return this.SyncSend("getsize?" + a);
};
Ajax.prototype.UserExists = function (a) {
  if ("guest" == a.toLowerCase()) return !0;
  a = this.SyncSend("userexists?" + a);
  if ("ok" == a) return !0;
  a = this.SyncSend("dbstatus?");
  return "failed" == a ? (alert(dbalert), !0) : !1;
};
Ajax.prototype.AddUser = function (a, b, c, e) {
  a = this.SyncSend("adduser?" + a + "&" + b + "&" + c + "&" + e);
  if ("ok" == a) return !0;
  a = this.SyncSend("dbstatus?");
  "failed" == a && alert(dbalert);
  return !1;
};
Ajax.prototype.UpdateAdult = function (a) {
  return "ok" == this.SyncSend("updateadult?" + a) ? !0 : !1;
};
Ajax.prototype.UpdatePass = function (a) {
  return "ok" == this.SyncSend("updatepass?" + a) ? !0 : !1;
};
Ajax.prototype.UpdateMail = function (a) {
  return "ok" == this.SyncSend("updatemail?" + a) ? !0 : !1;
};
Ajax.prototype.UpdateProfile = function (a) {
  a = escape(a);
  return "ok" == this.SyncSend("updateprofile?" + a) ? !0 : !1;
};
Ajax.prototype.Recover = function (a) {
  "ok" == this.SyncSend("recover?" + a)
    ? alert("An e.mail has been sent to " + a)
    : alert("We could not find your e.mail address in our data base");
};
Ajax.prototype.StoreHandle = function (a, b, c, e, d, f, g) {
  d = escape(d);
  f = escape(f);
  return "ok" !=
    this.SyncSend(
      "storehandle?" +
        a +
        "&" +
        b +
        "&" +
        c +
        "&" +
        e +
        "&" +
        d +
        "&" +
        f +
        "&" +
        g,
    )
    ? (alert(dbalert), !1)
    : !0;
};
Ajax.prototype.UpdateHandle = function (a, b, c, e, d, f, g) {
  e = escape(e);
  d = escape(d);
  f = escape(f);
  g = escape(g);
  return "ok" !=
    this.SyncSend(
      "updatehandle?" +
        a +
        "&" +
        b +
        "&" +
        c +
        "&" +
        e +
        "&" +
        d +
        "&" +
        f +
        "&" +
        g,
    )
    ? (alert(dbalert), !1)
    : !0;
};
Ajax.prototype.GetHandleInfo = function (a) {
  a = this.SyncSend("viewhandle?" + a);
  if ("failed" != a) {
    if ("private" == a) return a;
    a = JSON.parse(a);
    void 0 !== a &&
      ((a[0].title = unEscape(a[0].title)),
      (a[0].description = unEscape(a[0].description)),
      (a[0].soundfile = unEscape(a[0].soundfile)),
      (a[0].copyright = unEscape(a[0].copyright)));
    return a;
  }
};
Ajax.prototype.KillHandle = function (a) {
  return "failed" == this.SyncSend("killhandle?" + a) ? !1 : !0;
};
Ajax.prototype.DeleteAccount = function () {
  return "ok" != this.SyncSend("deleteaccount?") ? !1 : !0;
};
Ajax.prototype.GetRecent = function (a) {
  a = this.SyncSend("viewrecent?" + a);
  if ("failed" != a) {
    a = JSON.parse(a);
    if (void 0 !== a) {
      var b;
      for (b = 0; b < a.length; b++) {
        a[b][3] = SpecialHTML(a[b][3]);
        a[b][4] = SpecialHTML(a[b][4]);
        var c = a[b][6];
        c = c.split(" ");
        a[b][6] = c[0];
      }
    }
    return a;
  }
};
Ajax.prototype.GetPublic = function (a, b, c, e) {
  switch (b) {
    case "Recent":
      var d = "0";
      break;
    case "Popular":
      d = "1";
      break;
    case "Most liked":
      d = "2";
      break;
    case "Random":
      d = "3";
  }
  a = this.SyncSend("viewpublic?" + a + "&" + d + "&" + c + "&" + e);
  if ("failed" != a) {
    a = JSON.parse(a);
    if (void 0 !== a)
      for (b = 0; b < a.length; b++)
        ((a[b][3] = SpecialHTML(a[b][3])),
          (a[b][4] = SpecialHTML(a[b][4])),
          (c = a[b][6]),
          (c = c.split(" ")),
          (a[b][6] = c[0]));
    return a;
  }
};
Ajax.prototype.GetUserHandles = function (a, b) {
  var c = this.SyncSend("viewlist?" + a + "&" + b);
  if ("failed" != c) {
    c = JSON.parse(c);
    if (void 0 !== c) {
      var e;
      for (e = 0; e < c.length; e++) {
        c[e][3] = SpecialHTML(c[e][3]);
        c[e][4] = SpecialHTML(c[e][4]);
        var d = c[e][6];
        d = d.split(" ");
        c[e][6] = d[0];
      }
    }
    return c;
  }
};
Ajax.prototype.GetSounds = function () {
  var a = this.SyncSend("viewsounds?");
  if ("failed" != a) return (a = JSON.parse(a));
};
Ajax.prototype.AddComment = function (a, b, c) {
  c = escape(c);
  return 0 == c.length
    ? !1
    : "ok" == this.SyncSend("addcomment?" + a + "&" + b + "&" + c);
};
Ajax.prototype.AddReply = function (a, b) {
  b = escape(b);
  if (0 == b.length) return !1;
  this.SyncSend("addreply?" + a + "&" + b);
};
Ajax.prototype.GetComments = function (a) {
  a = this.SyncSend("getcomments?" + a);
  if ("failed" != a) {
    a = JSON.parse(a);
    if (void 0 !== a) {
      var b;
      for (b = 0; b < a.length; b++) a[b][3] = SpecialHTML(a[b][3]);
    }
    return a;
  }
};
Ajax.prototype.RemoveComment = function (a) {
  return "ok" == this.SyncSend("removecomment?" + a);
};
Ajax.prototype.WebImage = function (a, b, c) {
  this.AsyncSend("webimage?" + a, null, b, c);
};
Ajax.prototype.KillTemp = function (a) {
  this.SyncSend("killtemp?" + a);
};
Ajax.prototype.SyncSend = function (a) {
  this.Cancel();
  WaitCursor(!0);
  this.ajax.open("POST", this.server, !1);
  try {
    this.ajax.send(a);
  } catch (b) {
    return (WaitCursor(!1), "failed");
  }
  WaitCursor(!1);
  return 200 !== this.ajax.status ? "failed" : this.ajax.responseText;
};
Ajax.prototype.AsyncSend = function (a, b, c, e) {
  this.Cancel();
  null != b &&
    this.ajax.upload.addEventListener(
      "progress",
      function (f) {
        isajaxsending && f.lengthComputable && b(f.loaded, f.total);
      },
      !1,
    );
  var d = this.ajax;
  this.ajax.addEventListener(
    "readystatechange",
    function (f) {
      4 == d.readyState &&
        isajaxsending &&
        (WaitCursor(!1), c(d.responseText), (isajaxsending = !1));
    },
    !1,
  );
  this.ajax.upload.addEventListener(
    "error",
    function (f) {
      isajaxsending && (WaitCursor(!1), e(!1), (isajaxsending = !1));
    },
    !1,
  );
  WaitCursor(!0);
  this.ajax.open("POST", this.server, !0);
  this.ajax.send(a);
  isajaxsending = !0;
};
Ajax.prototype.CancelSend = function () {
  WaitCursor(!1);
  if (!isajaxsending) return !1;
  ajcancel = !0;
  this.ajax.abort();
  isajaxsending = !1;
  return !0;
};
Ajax.prototype.AsyncReceive = function (a, b, c, e) {
  this.Cancel();
  var d = this.ajax;
  d.addEventListener(
    "progress",
    function (f) {
      if (isajaxreceiving && b) {
        var g = this.getResponseHeader("gzip-Content-Length");
        g && b(f.loaded, g);
      }
    },
    !1,
  );
  d.addEventListener(
    "readystatechange",
    function (f) {
      isajaxreceiving &&
        4 == d.readyState &&
        ((isajaxreceiving = !1), c && c(d.responseText, !1));
    },
    !1,
  );
  d.addEventListener(
    "error",
    function (f) {
      isajaxreceiving && ((isajaxreceiving = !1), e && e(!1));
    },
    !1,
  );
  isajaxreceiving = !0;
  d.open("GET", this.server + a, !0);
  d.send(null);
};
Ajax.prototype.CancelReceive = function () {
  WaitCursor(!1);
  if (!isajaxreceiving) return !1;
  this.ajax.abort();
  isajaxreceiving = !1;
  return !0;
};
Ajax.prototype.Cancel = function () {
  this.CancelSend();
  this.CancelReceive();
};
var Button = function (a, b, c, e) {
  this.hastouch = !1;
  this.scale = BUTTONSCALE;
  this.radius = 6;
  this.oncolor = this.overcolor = "rgba(0,255,0,0.2)";
  this.idstr = a;
  if ((this.canvas = document.getElementById(a)))
    ((this.canvas.style.borderRadius = "4px"),
      (this.canvas.style.border = "1px solid white"),
      (this.context = this.canvas.getContext("2d")),
      (this.type = c),
      (this.callback = e),
      (this.on = !1),
      (this.en = !0),
      (this.w = this.h = 24 * this.scale),
      (this.h0 = this.w0 = 24),
      (this.index = !1),
      (this.image = new Image()),
      initButtonHandlers(this),
      "string" == typeof b
        ? (this.image.src = b)
        : ((this.image = gbutton),
          (this.index = 32 * b),
          (this.canvas.width = 24 * this.scale),
          (this.canvas.height = 24 * this.scale),
          this.setState(!1)));
};
Button.prototype.enable = function (a, b) {
  if (!this.context) return;
  if (this.en != a || b)
    if ((this.en = a)) this.setState(this.on);
    else {
      var c = this.context;
      c.fillStyle = "rgba(0,0,0,.25)";
      c.fillRect(0, 0, this.w, this.h);
    }
};
Button.prototype.enableEx = function (a) {
  if (!this.canvas) return;
  this.en == a
    ? a || (this.canvas.style.border = "1px solid white")
    : this.enable(a);
};
Button.prototype.setState = function (a) {
  if (!this.context) return;
  var b = this.context,
    c = this.w,
    e = this.h;
  b.clearRect(0, 0, c, e);
  c--;
  e--;
  var d = 0,
    f = 0;
  a && (f = d = 1);
  b.drawImage(this.image, this.index, 0, this.w0, this.h0, d, f, c, e);
  b.globalCompositeOperation = "source-over";
  a
    ? ((b.fillStyle = this.oncolor),
      b.fillRect(0, 0, c, e),
      this.en && (this.canvas.style.border = "1px solid green"))
    : (this.canvas.style.border = "1px solid white");
  this.en || this.enable(!1);
};
Button.prototype.setRadio = function (a) {
  this.radio = a;
};
function initButtonHandlers(a) {
  a.index ||
    (a.image.onload = function () {
      a.onLoad();
    });
  var b = a.canvas;
  b.onmouseover = function (c) {
    a.onMouseover(c);
  };
  b.onmousedown = function (c) {
    a.onMousedown(c);
  };
  b.onmouseup = function (c) {
    a.onMouseup(c);
  };
  b.onmouseout = function (c) {
    a.onMouseout(c);
  };
  b.addEventListener(
    "touchstart",
    function (c) {
      a.onStartTouch(c);
      c.preventDefault();
    },
    !1,
  );
  b.addEventListener(
    "touchmove",
    function (c) {
      c.preventDefault();
    },
    !1,
  );
  b.addEventListener(
    "touchend",
    function (c) {
      c.preventDefault();
    },
    !1,
  );
}
Button.prototype.onLoad = function () {
  this.index ||
    ((this.w0 = this.image.width),
    (this.h0 = this.image.height),
    (this.w = this.w0 * this.scale),
    (this.h = this.h0 * this.scale),
    (this.canvas.width = this.w),
    (this.canvas.height = this.h),
    (this.index = 0),
    this.setState(this.on),
    this.enable(this.en, !0));
};
Button.prototype.onMouseover = function (a) {
  this.on ||
    !this.en ||
    this.hastouch ||
    (this.canvas.style.border = "1px solid black");
};
Button.prototype.onMousedown = function (a) {
  if (this.en) {
    if (this.radio) this.radio.onclick(this.idstr);
    this.setState(!0);
  }
};
Button.prototype.onMouseup = function (a) {
  if (this.en && !this.hastouch && !this.radio)
    if ("check" == this.type) {
      this.on = !this.on;
      this.setState(this.on);
      if (!this.on) this.onMouseover();
      this.callback(this.on);
    } else (this.setState(!1), this.onMouseover(), this.callback(!0));
};
Button.prototype.onStartTouch = function (a) {
  if (this.en)
    if (((this.hastouch = !0), this.radio)) this.radio.onclick(this.idstr);
    else if ("check" == this.type) {
      this.on = !this.on;
      this.setState(this.on);
      if (!this.on) this.onMouseover();
      this.callback(this.on);
    } else (this.setState(!1), this.callback(!0));
};
Button.prototype.onMouseout = function (a) {
  this.hastouch ||
    ((this.canvas.style.border = "1px solid white"),
    this.en && this.setState(this.on));
};
var RadioButton = function () {
  this.buttons = [];
  for (var a = 0; a < arguments.length - 1; a++)
    ((this.buttons[a] = arguments[a]), this.buttons[a].setRadio(this));
  this.clickfunc = arguments[a];
  this.value = 0;
  this.buttons[0].setState(!0);
  this.buttons[0].on = !0;
  this.en = !1;
};
RadioButton.prototype.invalidate = function () {
  for (var a = 0; a < this.buttons.length; a++)
    (this.buttons[a].setState(!1), (this.buttons[a].bon = !1));
  this.value = -1;
};
RadioButton.prototype.enable = function (a) {
  if (a != this.en) {
    for (var b = 0; b < this.buttons.length; b++) this.buttons[b].enable(a);
    this.en = a;
  }
};
RadioButton.prototype.setState = function (a) {
  for (var b = 0; b < this.buttons.length; b++)
    (this.buttons[b].setState(b == a), (this.buttons[b].on = b == a));
  this.value = a;
};
RadioButton.prototype.onclick = function (a) {
  for (var b = 0; b < this.buttons.length && this.buttons[b].idstr != a; b++);
  if (b == this.value) this.buttons[b].setState(!0);
  else if (this.clickfunc(b))
    for (this.value = b, b = 0; b < this.buttons.length; b++)
      (this.buttons[b].setState(b == this.value),
        (this.buttons[b].on = b == this.value));
  else (this.buttons[b].setState(!1), (this.buttons[b].on = !1));
};
var Slider = function (a, b, c, e, d, f) {
  this.en = !0;
  this.canvas = a = document.getElementById(a);
  if (!a) return;
  a.width = 148;
  a.height = 48;
  this.context = this.canvas.getContext("2d");
  this.min = b;
  this.max = c;
  this.follow = !0;
  this.init = this.pos = e;
  this.label = d;
  this.callback = f;
  this.bgrd = new Image();
  this.cursor = new Image();
  this.isloaded = 0;
  this.drag = this.hastouch = !1;
  this.ka = 96 / (c - b);
  this.kb = 4 - (96 * b) / (c - b);
  initSliderHandlers(this);
  this.bgrd.src = Slider._bgSrc || (Slider._bgSrc = Slider._makeBg());
  this.cursor.src = Slider._curSrc || (Slider._curSrc = Slider._makeCur());
};
Slider._makeBg = function () {
  var c = document.createElement("canvas");
  c.width = 148;
  c.height = 48;
  var x = c.getContext("2d");
  var g = x.createLinearGradient(0, 0, 0, 48);
  g.addColorStop(0, "#3a3a4a");
  g.addColorStop(1, "#1a1a2a");
  x.fillStyle = g;
  x.fillRect(0, 0, 148, 48);
  x.fillStyle = "#555";
  x.fillRect(4, 13, 100, 3);
  return c.toDataURL();
};
Slider._makeCur = function () {
  var c = document.createElement("canvas");
  c.width = 48;
  c.height = 16;
  var x = c.getContext("2d");
  x.fillStyle = "#777";
  x.fillRect(0, 0, 48, 16);
  x.strokeStyle = "#aaa";
  x.lineWidth = 1;
  x.strokeRect(0.5, 0.5, 47, 15);
  return c.toDataURL();
};
Slider.prototype.enable = function (a) {
  if (!this.canvas || !this.context) return;
  this.en != a &&
    ((this.en = a),
    this.Draw(),
    a ||
      ((a = this.context),
      (a.fillStyle = "rgba(255,255,255,.45)"),
      a.fillRect(0, 0, 148, 48)));
};
Slider.prototype.setPos = function (a) {
  if (!this.canvas || !this.context) return;
  a < this.min && (a = this.min);
  a > this.max && (a = this.max);
  this.pos = a;
  this.Draw();
};
Slider.prototype.setRange = function (a, b) {
  if (!this.canvas || !this.context) return;
  this.min = a;
  this.max = b;
  this.ka = 96 / (b - a);
  this.kb = 4 - (96 * a) / (b - a);
  this.Draw();
};
Slider.prototype.Draw = function () {
  if (!this.context) return;
  var a = this.context;
  a.drawImage(
    this.bgrd,
    0,
    0,
    this.bgrd.width,
    this.bgrd.height,
    0,
    0,
    this.canvas.width,
    this.canvas.height,
  );
  this.cursorleft = this.ka * this.pos + this.kb;
  a.drawImage(this.cursor, this.cursorleft, 6);
  a.fillStyle = "rgb(255,255,255)";
  a.textAlign = "center";
  a.font = "16px Arial";
  a.fillText(this.label, 74, 40);
};
function initSliderHandlers(a) {
  a.bgrd.onload = function () {
    a.onLoadbgrd();
  };
  a.cursor.onload = function () {
    a.onLoadcursor();
  };
  var b = a.canvas;
  b.onmousemove = function (c) {
    a.onMousemove(c);
  };
  b.onmousedown = function (c) {
    a.onMousedown(c);
  };
  b.onmouseup = function (c) {
    a.onMouseup(c);
  };
  b.onmouseout = function (c) {
    a.onMouseout(c);
  };
  b.addEventListener(
    "touchstart",
    function (c) {
      a.onStartTouch(c);
      c.preventDefault();
    },
    !1,
  );
  b.addEventListener(
    "touchmove",
    function (c) {
      a.onContinueTouch(c);
      c.preventDefault();
    },
    !1,
  );
  b.addEventListener(
    "touchend",
    function (c) {
      a.onStopTouch(c);
    },
    !1,
  );
}
Slider.prototype.toCanvas = function (a, b) {
  var c = this.canvas,
    e = a - c.clientLeft - c.offsetLeft,
    d = b - c.clientTop - c.offsetTop;
  for (c = c.offsetParent; c; ) {
    e = e - c.offsetLeft + c.scrollLeft;
    d = d - c.offsetTop + c.scrollTop;
    if (!c.offsetParent) break;
    c = c.offsetParent;
  }
  return this.hastouch
    ? { x: e, y: d }
    : { x: e + window.pageXOffset, y: d + window.pageYOffset };
};
Slider.prototype.isInCursor = function (a) {
  var b = a.x;
  a = a.y;
  var c = this.cursorleft;
  return b >= c && b <= c + 47 && 6 <= a && 22 >= a;
};
Slider.prototype.onLoadbgrd = function () {
  this.isloaded++;
  2 <= this.isloaded && (this.Draw(), this.enable(!0));
};
Slider.prototype.onLoadcursor = function () {
  this.isloaded++;
  2 <= this.isloaded && (this.Draw(), this.enable(!0));
};
Slider.prototype.onMousemove = function (a) {
  !this.hastouch &&
    this.drag &&
    this.en &&
    ((a = this.toCanvas(a.clientX, a.clientY)),
    (this.pos += (a.x - this.start.x) / this.ka),
    this.pos < this.min && (this.pos = this.min),
    this.pos > this.max && (this.pos = this.max),
    this.Draw(),
    (this.start = a),
    this.follow && this.callback(this.pos));
};
Slider.prototype.onMousedown = function (a) {
  if (!this.hastouch && this.en) {
    var b = this.toCanvas(a.clientX, a.clientY);
    70 <= b.x &&
      78 > b.x &&
      ((this.pos = this.init), this.Draw(), this.callback(this.pos));
    this.drag = !0;
    this.start = this.toCanvas(a.clientX, a.clientY);
  }
};
Slider.prototype.onMouseup = function (a) {
  this.hastouch ||
    (this.drag && !this.follow && this.callback(this.pos), (this.drag = !1));
};
Slider.prototype.onMouseout = function (a) {
  this.hastouch ||
    (this.drag && !this.follow && this.callback(this.pos), (this.drag = !1));
};
Slider.prototype.onStartTouch = function (a) {
  this.hastouch = !0;
  if (this.en) {
    var b = a.touches[0].pageX;
    a = a.touches[0].pageY;
    this.drag = !0;
    this.start = this.toCanvas(b, a);
  }
};
Slider.prototype.onContinueTouch = function (a) {
  this.drag &&
    this.en &&
    ((a = this.toCanvas(a.touches[0].pageX, a.touches[0].pageY)),
    (this.pos += (a.x - this.start.x) / this.ka),
    this.pos < this.min && (this.pos = this.min),
    this.pos > this.max && (this.pos = this.max),
    this.Draw(),
    (this.start = a),
    this.callback(this.pos));
};
Slider.prototype.onStopTouch = function (a) {
  this.drag = 0;
};
var ColorSel = function (a, b) {
  this.hastouch = !1;
  this.canvas = document.getElementById(a);
  if (!this.canvas) return;
  this.w = 190;
  this.h = 48;
  this.canvas.width = this.w;
  this.canvas.height = this.h;
  this.ctx = this.canvas.getContext("2d");
  this.image = new Image();
  this.callback = b;
  this.en = !0;
  this.drag = this.loaded = !1;
  initColorSelHandlers(this);
  this.image.src = "images/palette.jpg";
};
ColorSel.prototype.enable = function (a) {
  if (!this.ctx) return;
  this.loaded &&
    ((this.en = a),
    this.Draw(),
    a ||
      ((a = this.ctx),
      (a.fillStyle = "rgba(0,0,0,.45)"),
      a.fillRect(0, 0, this.w, this.h)));
};
ColorSel.prototype.Draw = function () {
  if (!this.ctx) return;
  this.ctx.drawImage(this.image, 0, 0);
};
ColorSel.prototype.onLoad = function () {
  this.loaded = !0;
  this.Draw();
  this.enable(!0);
};
ColorSel.prototype.onMousemove = function (a) {
  if (this.drag && !this.hastouch) this.onClick(a);
};
ColorSel.prototype.onMousedown = function (a) {
  this.hastouch || (this.drag = !0);
};
ColorSel.prototype.onMouseup = function (a) {
  this.hastouch || (this.drag = !1);
};
ColorSel.prototype.onMouseout = function (a) {
  this.drag = !1;
};
ColorSel.prototype.onStartTouch = function (a) {
  this.hastouch = !0;
  this.onClick(a);
  this.drag = !0;
};
ColorSel.prototype.onContinueTouch = function (a) {
  if (this.drag) this.onClick(a);
};
ColorSel.prototype.onStopTouch = function (a) {
  this.drag = 0;
};
ColorSel.prototype.onClick = function (a) {
  if (this.loaded && this.en) {
    var b = this.hastouch
      ? this.toCanvas(a.touches[0].pageX, a.touches[0].pageY)
      : this.toCanvas(a.clientX, a.clientY);
    a = b.x;
    var c = b.y;
    0 > a && (a = 0);
    a >= this.w && (a = this.w - 1);
    0 > c && (c = 0);
    c >= this.h && (c = this.h - 1);
    b = this.ctx.getImageData(0, 0, this.w, this.h).data;
    a = 4 * (c * this.w + a);
    this.callback(b[a] / 255, b[a + 1] / 255, b[a + 2] / 255);
  }
};
ColorSel.prototype.toCanvas = function (a, b) {
  var c = this.canvas,
    e = a - c.clientLeft - c.offsetLeft + c.scrollLeft,
    d = b - c.clientTop - c.offsetTop + c.scrollTop;
  for (c = c.offsetParent; c; ) {
    e -= c.offsetLeft;
    d -= c.offsetTop;
    if (!c.offsetParent) break;
    c = c.offsetParent;
  }
  e = Math.floor(e);
  d = Math.floor(d);
  return this.hastouch
    ? { x: e, y: d }
    : { x: e + window.pageXOffset, y: d + window.pageYOffset };
};
function initColorSelHandlers(a) {
  a.image.onload = function () {
    a.onLoad();
  };
  var b = a.canvas;
  b.onclick = function (c) {
    a.onClick(c);
  };
  b.onmousemove = function (c) {
    a.onMousemove(c);
  };
  b.onmousedown = function (c) {
    a.onMousedown(c);
  };
  b.onmouseup = function (c) {
    a.onMouseup(c);
  };
  b.onmouseout = function (c) {
    a.onMouseout(c);
  };
  b.addEventListener(
    "touchstart",
    function (c) {
      a.onStartTouch(c);
      c.preventDefault();
    },
    !1,
  );
  b.addEventListener(
    "touchmove",
    function (c) {
      a.onContinueTouch(c);
      c.preventDefault();
    },
    !1,
  );
  b.addEventListener(
    "touchend",
    function (c) {
      a.onStopTouch(c);
    },
    !1,
  );
}
