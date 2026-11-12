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
  /* Brings a draft's pictures back; apply(pic) puts them on the editor. */
  TB.restorePic = function(key, d, apply){
    if(!d || !d.picStored) return;
    TB.store.get(key + ".pic").then(function(pic){
      if(!pic) return;
      lastPic[key] = pic;
      apply(pic);
    });
  };
})(window);
