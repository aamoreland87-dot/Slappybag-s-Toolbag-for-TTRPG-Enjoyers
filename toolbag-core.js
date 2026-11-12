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

/* ======================= UI: tooltips, help panel, first-visit hint =======================
   One copy of the help text for all four tools. Tooltips show on hover, keyboard focus, and
   long-press (a plain title="" never shows on phones or to keyboard users). Any element with
   data-tip or title gets one; title is turned into data-tip the first time it's used. */
(function(w, d){
  "use strict";
  var TB = w.TB;
  var T = d.title || "";
  var TOOL = /Item/.test(T) ? "item" : /Feat/.test(T) ? "feat" : /Initiative/.test(T) ? "init" : /Hazard/.test(T) ? "hazard" : "";
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
    "#openHtml": "Open the sheet as a web page, to print from your browser."
  };

  var STEPS = "<ol class=\"tb-steps\"><li><b>Build</b> a card in the Editor.</li><li><b>Save</b> it to your Library.</li><li>Tick cards and <b>print</b> a sheet.</li></ol>";
  var HELP = {
    item: ["Cards are 4 × 5 in, two to a letter page.",
           "Text shrinks to fit the card. If it says text is cut off, shorten the write-up or shrink the picture.",
           "Pick an action icon to set an action's cost."],
    feat: ["Cards are 4 × 5 in, two to a letter page.",
           "Import fetches a feat by name from Demiplane, or reads a page you paste from Archives of Nethys or Demiplane.",
           "Grants rows list what the feat gives: skills, spells, proficiencies."],
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
