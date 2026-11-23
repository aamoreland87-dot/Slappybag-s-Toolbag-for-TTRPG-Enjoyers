/* toolbag-core.js — shared helpers for every tool page. Load it before the page's own script.
   The artifact builds inline this file (they can't load files beside themselves).

   TB.firstFit   binary search for the largest size that fits (replaces the step-down loops)
   TB.debounce   run once things go quiet; .flush() runs a pending call now
   TB.perFrame   run at most once per animation frame
   TB.onLeave    run when the page is hidden or closed (flush pending saves)
   TB.store      key/value store in IndexedDB, falling back to localStorage where IndexedDB is
                 unavailable (some sandboxes). Values are stored as-is, not as JSON. The first read
                 of a key that only exists in localStorage moves it across.
   TB.splitPics / TB.putPic / TB.restorePic
                 keep a draft's pictures (data: URLs) out of localStorage: the draft text stays
                 there, the pictures go to TB.store and are written only when they change. */
(function(w){
  "use strict";
  var TB = w.TB = w.TB || {};

  /* ---------------- fitting ---------------- */
  /* Sizes are steps 0..n: step 0 is full size, each step smaller, step n the floor. Finds the first
     (largest) step at which fits() holds, assuming a smaller size never fits worse, and leaves it
     applied. apply(n) is the floor and is never tested. About log2(n) layouts instead of up to n. */
  TB.firstFit = function(n, apply, fits){
    var a = 0, b = n;
    while(a < b){
      var m = (a + b) >> 1;
      apply(m);
      if(fits()) b = m; else a = m + 1;
    }
    apply(a);
    return a;
  };

  /* ---------------- PDF ---------------- */
  /* jsPDF, pinned with Subresource Integrity: the browser refuses the file if the CDN copy ever
     changes. The hash matches dist/jspdf.umd.min.js at the v4.2.1 tag on github.com/parallax/jsPDF.
     To upgrade: change both lines together. */
  TB.JSPDF = {
    url:"https://cdnjs.cloudflare.com/ajax/libs/jspdf/4.2.1/jspdf.umd.min.js",
    sri:"sha384-qovJwSBbRDPP5cEjCp8S0UP66wrvnjaa60XMOGzTNanrThcrGfXfnZkvgY8N1KT3"
  };
  /* A canvas as a data: URL for the PDF: JPEG when every pixel is opaque (photos and painted art
     come out several times smaller), PNG when anything is transparent (knocked-out backgrounds). */
  TB.canvasData = function(cv){
    var px = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
    for(var i = 3; i < px.length; i += 4) if(px[i] < 255) return cv.toDataURL("image/png");
    return cv.toDataURL("image/jpeg", 0.9);
  };
  /* Saving a file on the website: the same save({filename, data}) shape as the claude.ai artifact's
     downloads, done with an ordinary download link. Without it the site built the PDF but hid the
     Save button (it only appeared inside the artifact). */
  TB.downloads = {
    save: function(o){
      return new Promise(function(res){
        var url = URL.createObjectURL(o.data), a = document.createElement("a");
        a.href = url; a.download = o.filename; a.rel = "noopener";
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function(){ URL.revokeObjectURL(url); }, 60000);
        res();
      });
    }
  };
  TB.imgFormat = function(u){ return /^data:image\/jpe?g/i.test(u || "") ? "JPEG" : "PNG"; };

  /* ---------------- timing ---------------- */
  TB.debounce = function(fn, ms){
    var t = 0;
    var run = function(){ clearTimeout(t); t = setTimeout(function(){ t = 0; fn(); }, ms); };
    run.flush = function(){ if(t){ clearTimeout(t); t = 0; fn(); } };
    return run;
  };
  TB.perFrame = function(fn){
    var id = 0;
    return function(){
      if(id) return;
      var go = function(){ id = 0; fn(); };
      id = w.requestAnimationFrame ? w.requestAnimationFrame(go) : setTimeout(go, 16);
    };
  };
  TB.onLeave = function(fn){
    w.addEventListener("pagehide", fn);
    document.addEventListener("visibilitychange", function(){ if(document.visibilityState === "hidden") fn(); });
  };

  /* ---------------- store ---------------- */
  var dbp = null;
  function openDb(){
    if(!dbp) dbp = new Promise(function(res, rej){
      var r;
      try{ r = w.indexedDB.open("toolbag", 1); }catch(e){ return rej(e); }
      r.onupgradeneeded = function(){ r.result.createObjectStore("kv"); };
      r.onsuccess = function(){ res(r.result); };
      r.onerror = function(){ rej(r.error); };
    });
    return dbp;
  }
  function run(mode, fn){
    return openDb().then(function(db){
      return new Promise(function(res, rej){
        var t = db.transaction("kv", mode), q = fn(t.objectStore("kv"));
        t.oncomplete = function(){ res(q.result); };
        t.onerror = t.onabort = function(){ rej(t.error || new Error("store transaction aborted")); };
      });
    });
  }
  function lsGet(k){ try{ var s = localStorage.getItem(k); return s == null ? undefined : JSON.parse(s); }catch(e){ return undefined; } }

  TB.store = {
    get: function(k){
      return run("readonly", function(s){ return s.get(k); }).then(function(v){
        if(v !== undefined) return v;
        var old = lsGet(k);
        if(old === undefined) return undefined;
        /* moved out of localStorage on first read; the old copy goes once the new one is safe */
        return run("readwrite", function(s){ return s.put(old, k); })
          .then(function(){ try{ localStorage.removeItem(k); }catch(e){} return old; }, function(){ return old; });
      }, function(){ return lsGet(k); });
    },
    /* Rejects when the value can't be kept (quota), so callers can say so. */
    set: function(k, v){
      return run("readwrite", function(s){ return s.put(v, k); }).catch(function(e){
        return openDb().then(function(){ throw e; }, function(){ localStorage.setItem(k, JSON.stringify(v)); });
      });
    },
    del: function(k){
      return run("readwrite", function(s){ return s.delete(k); }).catch(function(){ try{ localStorage.removeItem(k); }catch(e){} });
    }
  };

  /* ---------------- draft pictures ---------------- */
  var lastPic = {};
  function samePic(a, b){
    if(!a || !b) return a === b;
    var ka = Object.keys(a), kb = Object.keys(b);
    if(ka.length !== kb.length) return false;
    for(var i = 0; i < ka.length; i++) if(a[ka[i]] !== b[ka[i]]) return false;
    return true;
  }
  /* Takes every top-level data: URL out of d (left as "") and returns them, or null if none. */
  TB.splitPics = function(d){
    var pic = null;
    Object.keys(d).forEach(function(k){
      var v = d[k];
      if(typeof v === "string" && v.slice(0, 5) === "data:"){ (pic = pic || {})[k] = v; d[k] = ""; }
    });
    if(pic) d.picStored = true;
    return pic;
  };
  /* Stores the draft's pictures under key + ".pic", only when they differ from the last write. */
  TB.putPic = function(key, pic){
    if(samePic(lastPic[key], pic)) return;
    lastPic[key] = pic;
    (pic ? TB.store.set(key + ".pic", pic) : TB.store.del(key + ".pic")).catch(function(){});
  };
  /* ---------------- export hook (Next Session) ----------------
     session-prep.html loads a tool page in a hidden iframe and asks it for printed cards:
     TBExport.pdf(ids) resolves with the tool's own sheet for those library cards, exactly as its
     Print / PDF button makes it — a PDF Blob, or for tools that print through the browser
     {images:[{data, w, h}]} (one picture per letter page, w/h in inches). The tool supplies
       ready()    resolves once its library has loaded
       show(ids)  lays those cards out on its sheet; returns a function that puts the sheet back
       pages()    the element holding the laid-out pages
       build()    makes the output from what's laid out
     Calls run one at a time; the user's own print selection is never saved over. */
  TB.imagesReady = function(root){
    var imgs = root ? root.querySelectorAll("img") : [];
    return Promise.all(Array.prototype.map.call(imgs, function(im){
      if(im.complete) return 0;
      return new Promise(function(r){ im.addEventListener("load", r); im.addEventListener("error", r); setTimeout(r, 8000); });
    }));
  };
  TB.libReady = function(Lib){
    return new Promise(function(res){ if(Lib.ready) return res(); Lib.onChange(function(){ if(Lib.ready) res(); }); });
  };
  TB.exportApi = function(o){
    var q = Promise.resolve();
    w.TBExport = {
      kind: o.kind,
      ready: o.ready,
      pdf: function(ids){
        var job = q.then(function(){ return o.ready(); }).then(function(){
          var undo = o.show((ids || []).slice());
          var done = function(){ try{ if(undo) undo(); }catch(e){} };
          return TB.imagesReady(o.pages())
            .then(function(){ return d.fonts && d.fonts.ready; })
            .then(function(){ return new Promise(function(r){ setTimeout(r, 50); }); })
            .then(function(){ return o.build(); })
            .then(function(v){ done(); return v; }, function(e){ done(); throw e; });
        });
        q = job.catch(function(){});
        return job;
      }
    };
  };
  var d = w.document;

  /* Letter pages laid out in HTML, as pictures for a PDF (for tools whose sheet prints through the
     browser). Each page is drawn into an SVG <foreignObject> with the stylesheet and every typeface
     inlined, then onto a canvas at `scale` px per CSS px (3 ≈ 288 dpi). */
  var fontCssInline = null;
  TB.inlineFontsCss = function(){
    if(fontCssInline) return fontCssInline;
    var base = new URL(".", w.location.href).href;
    fontCssInline = fetch("fonts.css").then(function(r){ return r.ok ? r.text() : ""; }).then(function(css){
      var urls = [], re = /url\((['"]?)(?!data:)([^)'"]+)\1\)/g, m;
      while((m = re.exec(css))) if(urls.indexOf(m[2]) < 0) urls.push(m[2]);
      return Promise.all(urls.map(function(u){
        return fetch(new URL(u, base).href).then(function(r){ return r.ok ? r.blob() : null; }).then(function(b){
          if(!b) return null;
          return new Promise(function(res){ var fr = new FileReader(); fr.onload = function(){ res(fr.result); }; fr.onerror = function(){ res(null); }; fr.readAsDataURL(b); });
        }).catch(function(){ return null; });
      })).then(function(datas){
        urls.forEach(function(u, i){ if(datas[i]) css = css.split(u).join(datas[i].replace(/^data:[^;]*;/, "data:font/" + (/\.woff2$/.test(u) ? "woff2" : /\.woff$/.test(u) ? "woff" : "ttf") + ";")); });
        return css;
      });
    }).catch(function(){ return ""; });
    return fontCssInline;
  };
  TB.rasterPages = function(pageEls, o){
    var W = o.w * 96, H = o.h * 96, scale = o.scale || 3;
    return TB.inlineFontsCss().then(function(fontCss){
      var css = fontCss + "\n" + (o.css || "");
      var chain = Promise.resolve(), out = [];
      Array.prototype.forEach.call(pageEls, function(pg){
        chain = chain.then(function(){
          var copy = pg.cloneNode(true);
          copy.querySelectorAll("[contenteditable]").forEach(function(e){ e.removeAttribute("contenteditable"); });
          var imgs = pg.querySelectorAll("img"), cimgs = copy.querySelectorAll("img");
          cimgs.forEach(function(im, i){
            try{
              var s = imgs[i], cv = d.createElement("canvas");
              cv.width = s.naturalWidth || 1; cv.height = s.naturalHeight || 1;
              cv.getContext("2d").drawImage(s, 0, 0);
              im.setAttribute("src", TB.canvasData(cv));
            }catch(e){ im.removeAttribute("src"); }
          });
          copy.style.margin = "0"; copy.style.zoom = "1"; copy.style.boxShadow = "none";
          var xhtml = new XMLSerializer().serializeToString(copy);
          var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W * scale + '" height="' + H * scale + '">' +
            '<foreignObject x="0" y="0" width="' + W + '" height="' + H + '" transform="scale(' + scale + ')">' +
            '<div xmlns="http://www.w3.org/1999/xhtml" data-theme="light" style="width:' + W + 'px;height:' + H + 'px;background:#fff;overflow:hidden">' +
            '<style>' + css.replace(/<\/style/gi, "<\\/style") + '\n:root{--sheet-zoom:1}</style>' + xhtml + '</div></foreignObject></svg>';
          return new Promise(function(res, rej){
            var im = new Image();
            im.onload = function(){
              /* the first decode can come back before the inlined typefaces are applied */
              setTimeout(function(){
                try{
                  var cv = d.createElement("canvas"); cv.width = W * scale; cv.height = H * scale;
                  var g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(im, 0, 0);
                  out.push({data:cv.toDataURL("image/jpeg", 0.92), w:o.w, h:o.h});
                  res();
                }catch(e){ rej(e); }
              }, 120);
            };
            im.onerror = function(){ rej(new Error("couldn't draw the sheet")); };
            im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
          });
        });
      });
      return chain.then(function(){ return {images:out}; });
    });
  };

  /* Brings a draft's pictures back; apply(pic) puts them on the editor. */
  TB.restorePic = function(key, d, apply){
    if(!d || !d.picStored) return;
    TB.store.get(key + ".pic").then(function(pic){
      if(!pic) return;
      lastPic[key] = pic;
      apply(pic);
    });
  };

  /* =====================================================================================
     THE SHARED ENGINE: everything a card tool does that isn't about how its card looks.
     One copy here, so a fix reaches every tool. Each tool keeps only its card: markup,
     editor fields, collect()/load(), renderCard() and the jsPDF drawCard().

       TB.esc / TB.fmtDate / TB.errText / TB.cors / TB.hasFile / TB.dataUrlToBlob / TB.toast
       TB.img.read(file, o)       a dropped or found picture, decoded, background knocked out
                                  and trimmed (o.bg), scaled and encoded; credit kept in meta
       TB.saveDraft(key, d, img)  the editor's draft: text in localStorage, pictures in TB.store
       TB.library(o)              the card library: this device (IndexedDB), the claude.ai
                                  artifact database, or the cloud account (paid tier, cloud.js)
       TB.saveToLibrary(Lib, card, img, id)
                                  saving a card, uploading its picture first where it's hosted
       TB.pdf.sheet(o)            a print sheet as a PDF: jsPDF, the typefaces, pages of cards
                                  laid out by o.at(k), credits and the ORC notice underneath
     ===================================================================================== */
  TB.esc = function(s){ return String(s == null ? "" : s).replace(/[&<>"]/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); };
  TB.fmtDate = function(s){ if(!s) return "—"; var t = new Date(s); return isNaN(t) ? "—" : t.toLocaleDateString(undefined, {month:"short", day:"numeric"}); };
  TB.errText = function(e){ if(!e) return "unknown"; return (e.code ? e.code + " " : "") + (e.message || ""); };
  TB.cors = function(src){ return /^https?:/i.test(src) ? ' crossorigin="anonymous"' : ""; };
  TB.hasFile = function(e){ var t = e.dataTransfer; return !!(t && t.types && Array.prototype.indexOf.call(t.types, "Files") >= 0); };
  /* A data: URL back into a Blob without fetch(), which the artifact sandbox blocks. */
  TB.dataUrlToBlob = function(u){
    var m = /^data:([^;,]+)(;base64)?,(.*)$/.exec(u || "");
    if(!m) return null;
    var raw = m[2] ? atob(m[3]) : decodeURIComponent(m[3]), bytes = new Uint8Array(raw.length);
    for(var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return new Blob([bytes], {type:m[1]});
  };
  var toastT = null;
  TB.toast = function(msg, ms){
    var t = d.getElementById("toast"); if(!t) return;
    t.textContent = msg; t.classList.remove("hide");
    clearTimeout(toastT);
    toastT = setTimeout(function(){ t.classList.add("hide"); }, ms || (/failed|not stored/i.test(msg) ? 6000 : 2200));
  };

  /* ---------------- pictures ---------------- */
  TB.img = {};
  TB.img.isImage = function(file){
    return !!file && (/^image\//.test(file.type) || /\.(webp|png|jpe?g|gif|bmp|avif)$/i.test(file.name || ""));
  };
  /* Knock out a plain background: flood-fill from the edges through pixels close to the corners'
     colour, with a soft edge. False when the corners disagree (a busy background) or are already clear. */
  TB.img.knockout = function(cv){
    var w = cv.width, h = cv.height, ctx = cv.getContext("2d");
    var im = ctx.getImageData(0, 0, w, h), px = im.data;
    var corners = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + w - 1) * 4];
    if(corners.some(function(i){ return px[i + 3] < 24; })) return false;
    var bg = [0, 0, 0], spread = 0;
    for(var k = 0; k < 3; k++){
      var vals = corners.map(function(i){ return px[i + k]; });
      bg[k] = (vals[0] + vals[1] + vals[2] + vals[3]) / 4;
      spread = Math.max(spread, Math.max.apply(null, vals) - Math.min.apply(null, vals));
    }
    if(spread > 40) return false;
    var IN = 48, OUT = 150;
    function dist(p){ var i = p * 4; return Math.abs(px[i] - bg[0]) + Math.abs(px[i + 1] - bg[1]) + Math.abs(px[i + 2] - bg[2]); }
    var seen = new Uint8Array(w * h), stack = [];
    function push(p){ if(!seen[p] && dist(p) < OUT){ seen[p] = 1; stack.push(p); } }
    for(var x = 0; x < w; x++){ push(x); push((h - 1) * w + x); }
    for(var y = 0; y < h; y++){ push(y * w); push(y * w + w - 1); }
    while(stack.length){
      var p = stack.pop(), qx = p % w, qy = (p - qx) / w;
      if(qx > 0) push(p - 1); if(qx < w - 1) push(p + 1);
      if(qy > 0) push(p - w); if(qy < h - 1) push(p + w);
    }
    var n = 0;
    for(var q = 0; q < w * h; q++){
      if(!seen[q]) continue;
      var dd = dist(q), i = q * 4, a = dd <= IN ? 0 : Math.min(1, (dd - IN) / (OUT - IN));
      if(a <= 0){ px[i + 3] = 0; }
      else{
        for(var c = 0; c < 3; c++) px[i + c] = Math.max(0, Math.min(255, Math.round((px[i + c] - (1 - a) * bg[c]) / a)));
        px[i + 3] = Math.round(a * 255);
      }
      n++;
    }
    if(n) ctx.putImageData(im, 0, 0);
    return n > 0;
  };
  /* The box around the subject: clear pixels, or pixels near the corners' colour, are background. */
  TB.img.trimBox = function(cv){
    var w = cv.width, h = cv.height, px = cv.getContext("2d").getImageData(0, 0, w, h).data;
    var corners = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + w - 1) * 4];
    var alphaMode = corners.some(function(i){ return px[i + 3] < 24; });
    var bg = [0, 0, 0];
    if(!alphaMode){
      var spread = 0;
      for(var k = 0; k < 3; k++){
        var vals = corners.map(function(i){ return px[i + k]; });
        bg[k] = (vals[0] + vals[1] + vals[2] + vals[3]) / 4;
        spread = Math.max(spread, Math.max.apply(null, vals) - Math.min.apply(null, vals));
      }
      if(spread > 40) return null;
    }
    var TOL = 34;
    function isBg(i){
      if(px[i + 3] < 24) return true;
      if(alphaMode) return false;
      return Math.abs(px[i] - bg[0]) + Math.abs(px[i + 1] - bg[1]) + Math.abs(px[i + 2] - bg[2]) < TOL * 3;
    }
    var top = -1, bottom = -1, left = w, right = -1;
    for(var y = 0; y < h; y++){
      var rowHas = false;
      for(var x = 0; x < w; x++){
        if(!isBg((y * w + x) * 4)){ rowHas = true; if(x < left) left = x; if(x > right) right = x; }
      }
      if(rowHas){ if(top < 0) top = y; bottom = y; }
    }
    if(top < 0) return null;
    var pad = Math.round(Math.max(w, h) * 0.02);
    left = Math.max(0, left - pad); top = Math.max(0, top - pad);
    right = Math.min(w - 1, right + pad); bottom = Math.min(h - 1, bottom + pad);
    var bw = right - left + 1, bh = bottom - top + 1;
    if(bw * bh > w * h * 0.92) return null;
    return {x:left, y:top, w:bw, h:bh};
  };
  /* A picture file → {url, w, h, meta}. o: {work, max (px on the long side), bg (knock out and
     trim), credit (picture finder), from (where it came from)}. Resolves null if it isn't a picture. */
  TB.img.read = function(file, o){
    o = o || {};
    if(!TB.img.isImage(file)) return Promise.resolve(null);
    var WORK = o.work || 1200, MAX = o.max || 900;
    return new Promise(function(res, rej){
      var reader = new FileReader();
      reader.onerror = function(){ rej(new Error("couldn't read the file")); };
      reader.onload = function(){
        var im = new Image();
        im.onerror = function(){ rej(new Error("couldn't read the picture")); };
        im.onload = function(){
          var fw = im.width, fh = im.height;
          if(fw > WORK || fh > WORK){ var fs = Math.min(WORK / fw, WORK / fh); fw = Math.round(fw * fs); fh = Math.round(fh * fs); }
          var full = d.createElement("canvas"); full.width = fw; full.height = fh;
          full.getContext("2d").drawImage(im, 0, 0, fw, fh);
          var encode = function(sx, sy, sw, sh, asJpeg){
            var ow = sw, oh = sh;
            if(ow > MAX || oh > MAX){ var s = Math.min(MAX / ow, MAX / oh); ow = Math.round(ow * s); oh = Math.round(oh * s); }
            var out = d.createElement("canvas"); out.width = ow; out.height = oh;
            out.getContext("2d").drawImage(full, sx, sy, sw, sh, 0, 0, ow, oh);
            return {url:asJpeg ? out.toDataURL("image/jpeg", 0.88) : out.toDataURL("image/png"), w:ow, h:oh};
          };
          var isJpeg = /jpe?g/i.test(file.type), v;
          if(o.bg){
            var cut = false, box = null;
            try{ cut = TB.img.knockout(full); }catch(e){}
            try{ box = TB.img.trimBox(full); }catch(e){}
            v = box ? encode(box.x, box.y, box.w, box.h, false) : encode(0, 0, fw, fh, isJpeg && !cut);
            v.meta = (isJpeg && !cut && !box ? "JPG" : "PNG") + " · " + v.w + "×" + v.h + (cut ? " · background removed" : (box ? " · trimmed" : ""));
          }else{
            v = encode(0, 0, fw, fh, isJpeg);
            v.meta = (isJpeg ? "JPG" : "PNG") + " · " + v.w + "×" + v.h;
          }
          if(o.from) v.meta += " · from " + o.from;
          if(o.credit) v.meta += " · Credit: " + o.credit;   /* picture finder: who made it, and the licence */
          res(v);
        };
        im.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  };

  /* ---------------- the editor's draft ---------------- */
  TB.saveDraft = function(key, dr, img){
    dr.image = img.data; dr.imageId = img.id; dr.imageSrc = img.src; dr.imageMeta = img.meta; dr.imageDirty = img.dirty;
    var pic = TB.splitPics(dr);   /* pictures go to TB.store, and only when they change */
    try{ localStorage.setItem(key, JSON.stringify(dr)); }catch(e){}
    TB.putPic(key, pic);
  };

  /* ---------------- the card library ----------------
     o: {key (TB.store key), kind (cloud collection: creatures, items, feats, spells, hazards),
         idPrefix, status (element for "Saved on this device"), account (element for sign-in)}
     Three homes, one shape: this device (default; IndexedDB through TB.store), the claude.ai
     artifact's database (claude.use("db")), or the cloud account (cloud.js, for a paid tier with
     unlimited storage; off until firebase-config.js is filled in). Every call returns a Promise. */
  TB.library = function(o){
    var Lib = {mode:"local", cards:[], listeners:[], db:null, assets:null, ready:false, kind:o.kind};
    var status = function(html){ if(o.status) o.status.innerHTML = html; };
    Lib.emit = function(){ Lib.listeners.forEach(function(f){ f(Lib.cards); }); };
    Lib.onChange = function(f){ Lib.listeners.push(f); f(Lib.cards); };
    /* loaded once at start; a card saved before that finishes is kept and merged in */
    Lib.loadLocal = function(){
      Lib.mode = "local"; Lib.cards = []; Lib.ready = false;
      return TB.store.get(o.key).then(null, function(){ return null; }).then(function(v){
        if(Lib.mode !== "local" || Lib.ready) return;
        var early = Lib.cards, ids = {};
        early.forEach(function(c){ ids[c.id] = 1; });
        Lib.cards = (Array.isArray(v) ? v : []).filter(function(c){ return !ids[c.id]; }).concat(early);
        Lib.ready = true;
        if(early.length) Lib.writeLocal();
        Lib.emit();
      });
    };
    Lib.writeLocal = function(){ if(Lib.ready) TB.store.set(o.key, Lib.cards).catch(function(){ TB.toast("Storage full — picture too large to keep"); }); };
    Lib.newId = function(){ return (o.idPrefix || "c") + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };
    Lib.save = function(card, id){
      var now = new Date().toISOString();
      if(Lib.mode === "db"){
        var ref = Lib.db.collection("cards").doc(id || Lib.newId());
        var existing = Lib.cards.filter(function(c){ return c.id === ref.id; })[0];
        card.createdAt = existing ? existing.createdAt : now; card.updatedAt = now;
        return ref.set(card).then(function(){ return ref.id; });
      }
      id = id || Lib.newId();
      var i = Lib.cards.findIndex(function(c){ return c.id === id; });
      card.createdAt = i >= 0 ? Lib.cards[i].createdAt : now; card.updatedAt = now;
      if(Lib.mode === "cloud") return w.Cloud.save(id, card).then(function(){ return id; });
      card.id = id;
      if(i >= 0) Lib.cards[i] = card; else Lib.cards.push(card);
      Lib.writeLocal(); Lib.emit();
      return Promise.resolve(id);
    };
    Lib.remove = function(id){
      if(Lib.mode === "db") return Lib.db.collection("cards").doc(id).delete();
      if(Lib.mode === "cloud") return w.Cloud.remove(id);
      Lib.cards = Lib.cards.filter(function(c){ return c.id !== id; });
      Lib.writeLocal(); Lib.emit();
      return Promise.resolve();
    };
    Lib.start = function(){
      Lib.loadLocal();
      status("Saved on <b>this device</b>");
      if(w.Cloud && w.Cloud.available){
        w.Cloud.init({kind:o.kind, mount:o.account,
          onStatus:status,
          onCards:function(cards){
            if(cards){ Lib.mode = "cloud"; Lib.cards = cards; Lib.ready = true; }
            else{ Lib.loadLocal(); status("Saved on <b>this device</b>"); }
            Lib.emit();
          }});
        return;
      }
      var tries = 0;
      (function wait(){
        if(w.claude && w.claude.use) return Lib.connect();
        if(++tries < 40) setTimeout(wait, 250);
      })();
    };
    Lib.connect = function(){
      Promise.all([w.claude.use("db"), w.claude.use("assets")]).then(function(r){
        var db = r[0]; Lib.assets = r[1];
        if(!db) return;
        Lib.db = db; Lib.mode = "db"; Lib.ready = true;
        status("Library: <b>synced</b>");
        db.collection("cards").onSnapshot(function(snap){
          Lib.cards = snap.docs.map(function(s){ var c = Object.assign({}, s.data()); c.id = s.id; return c; });
          Lib.emit();
        }, function(e){ status("Library: <b>sync lost</b> — " + TB.esc(e.code)); });
      }).catch(function(){});
    };
    return Lib;
  };

  /* Saving the editor's card. img is the editor's picture state {data, src, id, meta, dirty} and is
     updated in place once a picture is uploaded. Resolves {id, note}; rejects with {full:true} when
     the cloud plan is full, or the error. */
  TB.saveToLibrary = function(Lib, card, img, id){
    var note = "", p = Promise.resolve(), isNew = false;
    if(Lib.mode === "db"){
      if(img.dirty && img.data){
        if(!Lib.assets) note = " (picture not stored: uploads unavailable here)";
        else{
          var blob = TB.dataUrlToBlob(img.data);
          p = Lib.assets.upload(blob, {type:blob.type || "image/png"})
            .then(function(res){ img.id = res.id; img.src = res.url; img.data = ""; img.dirty = false; },
                  function(e){ note = " (picture not stored: " + TB.errText(e) + ")"; });
        }
      }else if(img.dirty && !img.src){ img.id = ""; img.dirty = false; }
      p = p.then(function(){ card.imageId = img.id || ""; card.imageMeta = img.meta || ""; });
    }else if(Lib.mode === "cloud"){
      /* the picture lives in Storage under the card's id, so a new card gets its id before the upload */
      isNew = !Lib.cards.some(function(c){ return c.id === id; });
      if(isNew && w.Cloud.full()) return Promise.reject({full:true, message:w.Cloud.fullMessage()});
      id = isNew ? Lib.newId() : id;
      if(img.dirty && img.data){
        p = w.Cloud.upload(id, TB.dataUrlToBlob(img.data))
          .then(function(url){ img.src = url; img.data = ""; img.dirty = false; },
                function(e){ note = " (picture not stored: " + TB.errText(e) + ")"; });
      }else if(img.dirty && !img.src){ w.Cloud.removeArt(id); img.dirty = false; }
      p = p.then(function(){ card.imageUrl = img.src || ""; card.imageMeta = img.meta || ""; });
    }else{
      card.image = img.data || img.src || ""; card.imageMeta = img.meta || "";
    }
    return p.then(function(){ return Lib.save(card, id); })
      .then(function(newId){ return {id:newId, note:note}; },
            function(e){ if(Lib.mode === "cloud" && isNew) w.Cloud.removeArt(id); if(e && typeof e === "object") e.newCard = isNew; throw e; });
  };

  /* ---------------- the print sheet as a PDF ---------------- */
  TB.pdf = {};
  var scripts = {};
  TB.pdf.loadScript = function(src, sri){
    if(scripts[src]) return scripts[src];
    scripts[src] = new Promise(function(res, rej){
      var s = d.createElement("script"); s.src = src; s.onload = res;
      s.onerror = function(){ delete scripts[src]; rej(new Error("could not load " + src)); };
      if(sri){ s.integrity = sri; s.crossOrigin = "anonymous"; }
      d.head.appendChild(s);
    });
    return scripts[src];
  };
  TB.pdf.libs = function(){ return w.jspdf ? Promise.resolve() : TB.pdf.loadScript(TB.JSPDF.url, TB.JSPDF.sri); };
  /* The TrueType twins of the site's typefaces, base64, for jsPDF. The artifact copies carry them in
     a #pdfFonts JSON block; the site fetches them from fonts/. Cached per file. */
  TB.FONT_FILES = {
    body:"ebgaramond-400.ttf", bodyBold:"ebgaramond-600.ttf", bodyItalic:"ebgaramond-400i.ttf", bodyBoldItalic:"ebgaramond-600.ttf",   /* the set has no 600 italic: bold italic prints bold */
    title:"eczar-700.ttf", sub:"teko-700.ttf", caps:"tauri-400.ttf"
  };
  var fontCache = {};
  TB.pdf.fonts = function(files){
    files = files || TB.FONT_FILES;
    var raw = d.getElementById("pdfFonts"), inline = null;
    if(raw){ try{ inline = JSON.parse(raw.textContent); }catch(e){} }
    var keys = Object.keys(files);
    return Promise.all(keys.map(function(k){
      if(inline && inline[k]) return inline[k];
      var f = files[k];
      if(!fontCache[f]) fontCache[f] = fetch("fonts/" + f).then(function(r){ if(!r.ok) throw new Error(r.status + " " + f); return r.arrayBuffer(); })
        .then(function(buf){ var b = new Uint8Array(buf), out = "", CH = 0x8000; for(var i = 0; i < b.length; i += CH) out += String.fromCharCode.apply(null, b.subarray(i, i + CH)); return btoa(out); })
        .catch(function(e){ delete fontCache[f]; throw e; });
      return fontCache[f];
    })).then(function(list){ var out = {}; keys.forEach(function(k, i){ out[k] = list[i]; }); return out; });
  };
  /* Registers the faces under the names every drawCard uses: Sans (body; bold, and italic where the
     tool asks for it), Serif (titles), Sub (subtitles), Caps (labels; one weight, so bold = normal). */
  TB.pdf.register = function(pdf, F, files){
    files = files || TB.FONT_FILES;
    var add = function(k, name, style){ if(!F[k]) return; pdf.addFileToVFS(files[k], F[k]); pdf.addFont(files[k], name, style); };
    add("body", "Sans", "normal"); add("bodyBold", "Sans", "bold");
    add("bodyItalic", "Sans", "italic"); add("bodyBoldItalic", "Sans", "bolditalic");
    add("title", "Serif", "bold");
    add("sub", "Sub", "bold");
    add("caps", "Caps", "normal"); add("caps", "Caps", "bold");
  };
  /* A laid-out <img> as {data, w, h} for jsPDF (flip: upside down, for tent cards). null if it can't be read. */
  TB.pdf.imgData = function(el, flip){
    try{
      var iw = el.naturalWidth || el.width || 1, ih = el.naturalHeight || el.height || 1;
      var cv = d.createElement("canvas"); cv.width = iw; cv.height = ih;
      var ctx = cv.getContext("2d");
      if(flip){ ctx.translate(iw, ih); ctx.rotate(Math.PI); }
      ctx.drawImage(el, 0, 0);
      return {data:TB.canvasData(cv), w:iw, h:ih};
    }catch(e){ return null; }
  };
  /* The whole print pass. o: {
       orientation  "portrait" | "landscape" (letter, pt)
       items        [{d, img, ...}] in print order
       perPage      cards per page (default 4)
       at(k)        → {x, y} of the k-th card on a page
       draw(pdf, item, x, y)        the tool's own card
       fonts        which font files (default TB.FONT_FILES)
       onFonts(ok)  told whether the typefaces registered (the tool falls back to Helvetica if not)
       footer       {top, bottom, left, width}: the strip for picture credits and the ORC notice }
     Resolves a PDF Blob. */
  TB.pdf.sheet = function(o){
    var per = o.perPage || 4, F = null;
    return TB.pdf.libs()
      .then(function(){ return TB.pdf.fonts(o.fonts).then(function(f){ F = f; }, function(e){ if(w.console) console.warn("fonts", e); }); })
      .then(function(){
        var pdf = new w.jspdf.jsPDF({unit:"pt", format:"letter", orientation:o.orientation || "portrait", compress:true});
        var ok = false;
        if(F){ try{ TB.pdf.register(pdf, F, o.fonts); ok = true; }catch(e){ if(w.console) console.warn("fonts", e); } }
        if(o.onFonts) o.onFonts(ok);
        var pages = [];
        o.items.forEach(function(it, i){
          var p = Math.floor(i / per), k = i % per;
          if(k === 0 && p > 0) pdf.addPage("letter", o.orientation || "portrait");
          (pages[p] = pages[p] || []).push(it.d);
          var at = o.at(k);
          o.draw(pdf, it, at.x, at.y);
        });
        if(o.footer && TB.pdfFooters) TB.pdfFooters(pdf, pages, o.footer);
        return pdf.output("blob");
      });
  };
})(window);

/* ======================= UI: tooltips, help panel, first-visit hint =======================
   One copy of the help text for all four tools. Tooltips show on hover, keyboard focus, and
   long-press (a plain title="" never shows on phones or to keyboard users). Any element with
   data-tip or title gets one; title is turned into data-tip the first time it's used. */
(function(w, d){
  "use strict";
  var TB = w.TB;
  var T = d.title || "";
  var TOOL = /Item/.test(T) ? "item" : /Feat/.test(T) ? "feat" : /Spell/.test(T) ? "spell" : /Initiative/.test(T) ? "init" : /Hazard/.test(T) ? "hazard" : "";
  TB.tool = TOOL;

  var PDF_TIP = "Build the sheet as a PDF to save or print.";
  var TIPS = {
    "#toolSwitch > summary": "Switch to another card builder. Your work here is saved automatically.",
    '[data-view="editor"]': "Build and edit one card.",
    '[data-view="library"]': "Every card you've saved. Tick cards to put them on the print sheet.",
    '[data-view="sheet"]': "Lay out the ticked cards on letter-size pages, then print or save a PDF.",
    "#newCard": "Start a blank card. Cards you've saved stay in your library.",
    "#saveCard": "Save this card to your library. Unsaved changes are kept as a draft in this browser.",
    "#blanks": "Show every field, and print empty ones as blanks to fill in by hand.",
    "#selAll": "Tick every card in the library.",
    "#selNone": "Untick every card.",
    "#toSheet": "Go to the print sheet with the ticked cards.",
    "#addBlank": "Add an empty card to the sheet, to fill in by hand.",
    "#sheetClear": "Take every card off the sheet. Your library isn't touched.",
    "#print": TOOL === "hazard" ? "Opens your browser's Print dialog. Choose “Save as PDF” there to get a file." : PDF_TIP,
    "#z-out": "Zoom the preview out. Printing is always actual size.",
    "#z-in": "Zoom the preview in. Printing is always actual size.",
    '[data-theme=""]': "Follow your device's light or dark setting.",
    "#example": "Load an example card to see how the fields fill in.",
    "#clear": "Empty every field on this card.",
    "#status": "Where your library is kept. On this device, clearing the browser's site data deletes it — save a PDF or sign in to keep a copy.",
    "#phPick": "Choose a picture file, or drop one on the card.",
    "#phClear": "Remove the picture.",
    "#phBg": "Cuts out a plain background and trims to the subject when you add a picture. Works best on art with a solid-colour backdrop.",
    "#phGrip": "Drag to resize the picture.",
    "#imgScale": "Shrink the picture to make room for text.",
    "#chgMinus": "Fewer charge dots.",
    "#chgPlus": "More charge dots.",
    "#cardCount": "Whether the text fits. The printed card looks exactly like this preview.",
    "#traitBtn": "Pick traits from the full list.",
    "#senseBtn": "Add senses such as darkvision or tremorsense.",
    "#spdList": "Tick each way the creature moves; each gets its own icon on the card.",
    "#immuneIn": "Printed in short form to save space.",
    "#resistIn": "Printed in short form to save space.",
    "#weakIn": "Printed in short form to save space.",
    "#saveSheet": "Download the sheet as a PDF.",
    "#openHtml": "Open the sheet as a web page, to print from your browser.",
    "#findPic": "Search free pictures by this card's name: icons, classic paintings, or Openverse. Each keeps its credit, which prints under the cards."
  };

  var STEPS = "<ol class=\"tb-steps\"><li><b>Build</b> a card in the Editor.</li><li><b>Save</b> it to your Library.</li><li>Tick cards and <b>print</b> a sheet.</li></ol>";
  var HELP = {
    item: ["Cards are 4 × 5 in, two to a letter page.",
           "Import reads an item you paste from Archives of Nethys or Demiplane, from the title line down.",
           "Text shrinks to fit the card. If it says text is cut off, shorten the write-up or shrink the picture.",
           "Pick an action icon to set an action's cost."],
    feat: ["Cards are 4 × 5 in, two to a letter page.",
           "Import fetches a feat by name from Demiplane, or reads a page you paste from Archives of Nethys or Demiplane.",
           "Grants rows list what the feat gives: skills, spells, proficiencies.",
           "Under the card, Area and Save fill the Area and Defense lines. The source line (book and page) prints small in the bottom corner."],
    spell: ["Cards are 4 × 5 in, two to a letter page.",
            "Import fetches a spell by name from Demiplane, or reads a page you paste from Archives of Nethys or Demiplane.",
            "The spell type (Spell, Cantrip, Focus, Ritual) sets the word before the rank. Heightened rows list what changes at higher ranks."],
    init: ["Cards are 2.6 × 7.8 in and fold in the middle to stand like a tent.",
           "Import takes a Demiplane link or a creature's name, or a page you paste from Archives of Nethys.",
           "Recall Knowledge is worked out from the creature's traits, level and rarity."],
    hazard: ["Import reads a hazard page you paste from Archives of Nethys.",
             "Printing opens your browser's Print dialog; choose “Save as PDF” there to get a file."]
  };

  function css(){
    var s = d.createElement("style"); s.id = "tb-ui-css";
    s.textContent =
      ".tb-tip{position:fixed;z-index:1000;max-width:260px;padding:6px 10px;border-radius:4px;background:var(--ink,#16181D);color:var(--paper,#fff);" +
        "font:14px/1.35 var(--sans,Georgia,serif);letter-spacing:0;text-transform:none;pointer-events:none;box-shadow:0 4px 14px rgba(0,0,0,.18)}" +
      ".tb-help-btn{min-width:2.1em}" +
      ".tb-intro{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem .9rem;padding:.45rem .7rem;border:1px solid var(--rule,#ccc);background:var(--ground,#eee);" +
        "border-radius:2px;font-size:.95rem;color:var(--ink-2,#444)}" +
      ".tb-intro .tb-grow{flex:1 1 1rem}" +
      ".tb-intro ol{display:flex;flex-wrap:wrap;gap:.2rem 1.2rem;margin:0;padding-left:1.1rem}" +
      ".tb-panel{position:fixed;z-index:999;top:0;right:0;bottom:0;width:min(380px,100%);overflow:auto;background:var(--paper,#fff);color:var(--ink,#111);" +
        "border-left:1px solid var(--rule,#ccc);box-shadow:var(--shadow,0 12px 30px rgba(0,0,0,.2));padding:1.1rem 1.2rem 2rem;font-size:16px;line-height:1.5}" +
      ".tb-panel h2{font-family:var(--serif,Georgia,serif);font-size:1.3rem;margin:0 0 .6rem}" +
      ".tb-panel h3{font-family:var(--caps,system-ui,sans-serif);font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3,#888);margin:1.1rem 0 .3rem;font-weight:400}" +
      ".tb-panel ul,.tb-panel ol{margin:.2rem 0;padding-left:1.2rem}.tb-panel li{margin:.25rem 0}" +
      ".tb-panel .tb-close{position:absolute;top:.8rem;right:.9rem}" +
      ".tb-tip[hidden],.tb-panel[hidden]{display:none!important}" +
      "@media print{.tb-tip,.tb-panel,.tb-intro{display:none!important}}";
    d.head.appendChild(s);
  }

  /* ---------- tooltips ---------- */
  var tip, timer = 0, owner = null;
  function tipOf(el){
    if(el.title){ el.dataset.tip = el.title; if(!el.getAttribute("aria-label") && !el.textContent.trim()) el.setAttribute("aria-label", el.title); el.removeAttribute("title"); }
    return el.dataset.tip;
  }
  function target(e){ var el = e.target && e.target.closest ? e.target.closest("[data-tip],[title]") : null; return el && tipOf(el) ? el : null; }
  function show(el){
    owner = el; tip.textContent = el.dataset.tip; tip.hidden = false;
    el.setAttribute("aria-describedby", "tb-tip");
    var r = el.getBoundingClientRect(), t = tip.getBoundingClientRect();
    var x = Math.min(Math.max(8, r.left + r.width / 2 - t.width / 2), w.innerWidth - t.width - 8);
    var y = r.bottom + 8 + t.height > w.innerHeight ? r.top - t.height - 8 : r.bottom + 8;
    tip.style.left = x + "px"; tip.style.top = Math.max(4, y) + "px";
  }
  function hide(){ clearTimeout(timer); timer = 0; if(tip) tip.hidden = true; if(owner){ owner.removeAttribute("aria-describedby"); owner = null; } }
  function tooltips(){
    tip = d.createElement("div"); tip.className = "tb-tip"; tip.id = "tb-tip"; tip.setAttribute("role", "tooltip"); tip.hidden = true;
    d.body.appendChild(tip);
    Object.keys(TIPS).forEach(function(sel){
      d.querySelectorAll(sel).forEach(function(el){ if(!el.dataset.tip){ el.dataset.tip = TIPS[sel]; el.removeAttribute("title"); } });
    });
    d.addEventListener("mouseover", function(e){
      var el = target(e); if(!el || el === owner) return;
      hide(); timer = setTimeout(function(){ show(el); }, 400);
    });
    d.addEventListener("mouseout", function(e){
      var el = target(e); if(el && (!e.relatedTarget || !el.contains(e.relatedTarget))) hide();
    });
    d.addEventListener("focusin", function(e){ var el = target(e); if(el && e.target.matches(":focus-visible")) show(el); });
    d.addEventListener("focusout", hide);
    d.addEventListener("touchstart", function(e){ var el = target(e); hide(); if(el) timer = setTimeout(function(){ show(el); }, 500); }, {passive:true});
    d.addEventListener("touchend", function(){ clearTimeout(timer); if(owner) setTimeout(hide, 2000); });
    d.addEventListener("keydown", function(e){ if(e.key === "Escape") hide(); });
    w.addEventListener("scroll", hide, true);
  }

  /* ---------- help panel ---------- */
  var panel = null, helpBtn = null;
  function openHelp(){
    if(!panel){
      panel = d.createElement("aside"); panel.className = "tb-panel"; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Help");
      panel.innerHTML =
        "<button class=\"btn tb-close\" type=\"button\">Close</button>" +
        "<h2>How this tool works</h2>" + STEPS +
        (HELP[TOOL] ? "<h3>Tips</h3><ul>" + HELP[TOOL].map(function(s){ return "<li>" + s + "</li>"; }).join("") + "</ul>" : "") +
        "<h3>Where your cards are saved</h3><p>In this browser, on this device. Clearing the browser's site data deletes them, so save a PDF of anything you want to keep." +
        (d.getElementById("account") ? " Sign in from Options to sync cards between devices." : "") + "</p>" +
        "<h3>Printing</h3><p>" + (TOOL === "hazard" ? "Print opens your browser's Print dialog; choose “Save as PDF” there for a file." : "Print builds a PDF of the sheet to download, or opens it as a web page to print.") +
        " Print at 100% (actual size) so cards come out the right size.</p>" +
        "<h3>Pictures</h3><p><b>Picture</b> searches free icons, public-domain paintings and Openverse by the card's name. Choose which source each kind of card starts with on the home page. Credits print under the cards.</p>" +
        "<h3>Importing</h3><p>Paste anything from Archives of Nethys. If it's a different kind of entry (a spell in the feat tool, say), Import offers to open it in the right tool. The home page has a Paste anything box too.</p>" +
        "<h3>Hints</h3><p>Hover over, or long-press, any button to see what it does. Esc closes panels.</p>";
      d.body.appendChild(panel);
      panel.querySelector(".tb-close").addEventListener("click", closeHelp);
    }
    panel.hidden = false; helpBtn && helpBtn.setAttribute("aria-expanded", "true");
    panel.querySelector(".tb-close").focus();
    dismissIntro();
  }
  function closeHelp(){ if(panel && !panel.hidden){ panel.hidden = true; helpBtn && helpBtn.setAttribute("aria-expanded", "false"); helpBtn && helpBtn.focus(); } }
  TB.openHelp = openHelp;

  /* ---------- first-visit hint ---------- */
  var INTRO_KEY = "tb-intro-" + TOOL, intro = null;
  function dismissIntro(){ if(intro){ intro.remove(); intro = null; } try{ localStorage.setItem(INTRO_KEY, "1"); }catch(e){} }

  function init(){
    if(!TOOL) return;
    css(); tooltips();
    var row = d.querySelector(".bar .bar-row");
    if(row){
      helpBtn = d.createElement("button");
      helpBtn.type = "button"; helpBtn.className = "btn tb-help-btn"; helpBtn.textContent = "?";
      helpBtn.setAttribute("aria-label", "Help"); helpBtn.setAttribute("aria-expanded", "false");
      helpBtn.dataset.tip = "How this tool works";
      helpBtn.addEventListener("click", function(){ if(panel && !panel.hidden) closeHelp(); else openHelp(); });
      row.appendChild(helpBtn);
      var seen = false; try{ seen = !!localStorage.getItem(INTRO_KEY); }catch(e){}
      if(!seen){
        intro = d.createElement("div"); intro.className = "tb-intro"; intro.setAttribute("role", "note");
        intro.innerHTML = "<span><b>New here?</b></span>" + STEPS + "<span class=\"tb-grow\"></span>" +
          "<button class=\"btn\" type=\"button\" data-act=\"help\">More help</button><button class=\"btn\" type=\"button\" data-act=\"x\" aria-label=\"Dismiss\">Got it</button>";
        intro.addEventListener("click", function(e){
          var a = e.target.closest("[data-act]"); if(!a) return;
          if(a.dataset.act === "help") openHelp(); else dismissIntro();
        });
        row.parentNode.insertBefore(intro, row.nextSibling);
      }
    }
    d.addEventListener("keydown", function(e){ if(e.key === "Escape") closeHelp(); });
  }
  if(d.readyState === "loading") d.addEventListener("DOMContentLoaded", init); else init();
})(window, document);
