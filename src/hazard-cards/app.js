(function(){
  "use strict";
  var DRAFT = "pf2e-hazard-draft-v1", LIB_LOCAL = "pf2e-hazard-lib", SEL = "pf2e-hazard-sel";
  var $ = function(id){ return document.getElementById(id); };
  var cardbox = $("cardbox"), phFile = $("phFile");
  var ZOOMS = [.75, 1, 1.25, 1.5, 2, 2.5];
  var CARD_W = 187.2, CARD_H = 561.6, IMG_PAD = 4;
  var FIELDS = ["name","kicker","ac","hp","hardness","fort","ref","will","stealthDc","disableDc","reset"];
  var IRW = [["immune","Imm"],["resist","Res"],["weak","Weak"]];
  var MULTI = {reset:1};
  var COST_LABEL = {reaction:"Reaction", free:"Free action", "1":"One action", "2":"Two actions", "3":"Three actions"};
  var COSTS = [["reaction","R","Reaction"],["free","F","Free action"],["1","1","One action"],["2","2","Two actions"],["3","3","Three actions"]];
  var ATRAITS = ["move","attack","concentrate","manipulate","auditory","visual","interact"];
  var EFFECT_KEYWORDS = ["Requirement","Requirements","Frequency","Critical Success","Success","Failure","Critical Failure"];
  var ICON = {
    shield:'<svg class="ico" viewBox="0 0 36 40" aria-hidden="true"><path d="M18,1 C23,4 30,3 36,5 L36,20 C36,31 27,37 18,40 C9,37 0,31 0,20 L0,5 C6,3 13,4 18,1 Z"/></svg>',
    heart:'<svg class="ico" viewBox="0 0 40 38" aria-hidden="true"><path d="M20,37 C12,30 0,22 0,11 C0,5 4.5,1 10,1 C14.5,1 18,3.5 20,7.5 C22,3.5 25.5,1 30,1 C35.5,1 40,5 40,11 C40,22 28,30 20,37 Z"/></svg>',
    hex:'<svg class="ico" viewBox="0 0 40 40" aria-hidden="true"><path d="M12,2 L28,2 L38,20 L28,38 L12,38 L2,20 Z"/></svg>'
  };
  /* action-cost glyphs — the same marks as the item card: a diamond notched with a chevron,
     one more chevron per extra action; a hooked arrow for a reaction; a hollow diamond for free.
     Ported from item-cards.html, with its var(--paper) cutout swapped for a flat #fff — this
     card's paper is always white, unlike the item card's, which re-themes with the app. */
  var COST_ICON = (function(){
    var dot = '<polygon points="5,7.5 9.5,12 5,16.5 0.5,12" fill="currentColor"/>';
    var chev = function(x){ return '<polyline points="' + (x + 1) + ',3 ' + (x + 10) + ',12 ' + (x + 1) + ',21" fill="none" stroke="currentColor" stroke-width="5.2" stroke-linejoin="miter" stroke-linecap="butt"/>'; };
    var svg = function(w, body){ return '<svg viewBox="0 0 ' + w + ' 24" aria-hidden="true" focusable="false">' + body + '</svg>'; };
    var swoosh = (function(){
      var cx = 13, cy = 11.5, rx = 10, ry = 8.5, a0 = 215, a1 = 480, n = 48, outer = [], inner = [];
      var f = function(v){ return Math.round(v * 100) / 100; };
      for(var i = 0; i <= n; i++){
        var t = i / n, a = (a0 + (a1 - a0) * t) * Math.PI / 180, w = 0.6 + 4.6 * t;
        outer.push([f(cx + rx * Math.cos(a)), f(cy + ry * Math.sin(a))]);
        inner.unshift([f(cx + (rx - w) * Math.cos(a)), f(cy + (ry - w) * Math.sin(a))]);
      }
      var ah = a1 * Math.PI / 180, w1 = 0.6 + 4.6;
      var bx = cx + (rx - w1 / 2) * Math.cos(ah), by = cy + (ry - w1 / 2) * Math.sin(ah);
      var dx = -rx * Math.sin(ah), dy = ry * Math.cos(ah), L = Math.hypot(dx, dy); dx /= L; dy /= L;
      var px = -dy, py = dx, s = 4.6, len = 7;
      var body = outer.concat(inner);
      var head = [[f(bx + dx * len), f(by + dy * len)], [f(bx + px * s), f(by + py * s)], [f(bx - px * s), f(by - py * s)]];
      var pts = function(a){ return a.map(function(p){ return p.join(","); }).join(" "); };
      return '<polygon points="' + pts(body) + '" fill="currentColor"/><polygon points="' + pts(head) + '" fill="currentColor"/>';
    })();
    return {
      "1":svg(23, dot + chev(10)), "2":svg(34, dot + chev(10) + chev(21)), "3":svg(45, dot + chev(10) + chev(21) + chev(32)),
      free:svg(24, '<polygon points="12,0.5 23.5,12 12,23.5 0.5,12" fill="currentColor"/>' +
                  '<polygon points="7.5,8.5 11,12 7.5,15.5 4,12" fill="#fff"/>' +
                  '<polyline points="10.5,6 16.5,12 10.5,18" fill="none" stroke="#fff" stroke-width="3.4" stroke-linejoin="miter" stroke-linecap="butt"/>'),
      reaction:svg(24, swoosh)
    };
  })();
  function costGlyph(cost){ return cost && COST_ICON[cost] ? '<span class="glyph" title="' + esc(COST_LABEL[cost]) + '">' + COST_ICON[cost] + '</span>' : ""; }

  var EXAMPLE = {
    name:"Mindhammer Mushrooms", kicker:"Hazard 3 · Environmental Fungus · Simple",
    ac:"16", hp:"20", hardness:"", fort:"+10", ref:"+8", will:"",
    stealthDc:"20", disableDc:"20",
    actions:[{name:"Psychic Blast", cost:"reaction", traits:[],
      trigger:"A creature walks through the mushrooms",
      effect:"The mushrooms release a loud hum of psychic energy. The triggering creature takes 2d8+8 mental damage (DC 23 basic Will save). On a critical failure, the creature is fatigued."}],
    reset:"The mushrooms must rest for 24 hours before they can emit another Psychic Blast",
    immune:"critical hits, object immunities, precision damage", resist:"", weak:"fire 10",
    imgScale:100
  };

  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"]/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); }
  var SMALL = {not:1, and:1, or:1, of:1, to:1, from:1, except:1, the:1, a:1, an:1, in:1, with:1, vs:1};
  function titleCase(s){
    return String(s || "").replace(/[A-Za-z][A-Za-z'’.]*/g, function(w){
      return SMALL[w.toLowerCase()] ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1);
    });
  }
  /* keyword labels (Critical Success / Frequency / …) come out bold, the way a printed stat block sets them */
  function formatEffect(text){
    var s = esc(text);
    var re = new RegExp("(^|;\\s*|\\.\\s+)(" + EFFECT_KEYWORDS.map(function(w){ return w.replace(/ /g, "\\s+"); }).join("|") + ")\\b", "g");
    return s.replace(re, function(m, pre, kw){ return pre + "<b>" + kw + "</b>"; });
  }

  /* ---------------- the card as markup: editable in the editor, static elsewhere ---------------- */
  function cardHtml(d, edit, opts){
    opts = opts || {}; var flipped = !!opts.flip;
    d = d || {};
    var ce = edit ? ' contenteditable="true" spellcheck="false"' : '';
    var dash = function(v){ return edit ? (v || "") : (v || "—"); };
    var fld = function(name, cls, ph){
      return '<div class="fld ' + cls + '" data-f="' + name + '"' + ce + (edit && ph ? ' data-ph="' + ph + '"' : '') + '>' + esc(d[name]) + '</div>';
    };
    var src = d.image || (d.imageId ? "/_blob/" + d.imageId : "");
    var scale = (d.imgScale || 100) / 100;
    var boxes = [["AC","ac","shield"],["HP","hp","heart"],["Hardness","hardness","hex"]];
    var row3 = boxes.map(function(b){
      return '<div class="hz-box"><div class="hdr">' + b[0] + '</div><div class="icowrap">' + ICON[b[2]] +
        '<div class="val fld fit" data-f="' + b[1] + '"' + ce + '>' + esc(dash(d[b[1]])) + '</div></div></div>';
    }).join("");
    var saves = [["Fort","fort"],["Ref","ref"],["Will","will"]].map(function(q){
      return '<div class="hz-save"><span class="lbl">' + q[0] + '</span><span class="val fld fit" data-f="' + q[1] + '"' + ce + '>' + esc(dash(d[q[1]])) + '</span></div>';
    }).join("");
    var dcs = [["Stealth","stealthDc"],["Disable","disableDc"]].map(function(b){
      return '<div class="hz-box"><div class="hdr">' + b[0] + '</div><div class="val fld fit" data-f="' + b[1] + '"' + ce + (edit ? ' data-ph="—"' : '') + '>' + esc(dash(d[b[1]])) + '</div></div>';
    }).join("");
    return '<article class="card">' +
      '<div class="half top"><div class="photo' + (src ? " has-img" : "") + (flipped ? " flip" : "") + '"' + (edit ? ' id="photo"' : "") + ' style="--img-scale:' + scale + '"' + (edit ? ' tabindex="0" role="button" aria-label="Add a picture"' : '') + '>' +
        (src ? '<img alt="" src="' + esc(src) + '">' : '') +
        (edit ? '<span class="ph-hint">Drop picture<br>or tap</span>' : '') + '</div></div>' +
      '<div class="half stats"><div class="hzfit">' +
        fld("name", "c-name fit", "Hazard name") +
        fld("kicker", "hz-kicker", "Hazard 3 · Environmental · Simple") +
        '<div class="hz-rule"></div>' +
        '<div class="hz-row">' + row3 + '</div>' +
        '<div class="hz-saves">' + saves + '</div>' +
        '<div class="hz-row">' + dcs + '</div>' +
        '<div class="hz-actions"' + (edit ? ' id="actionsBlock"' : '') + '>' + actionsHtml(d.actions || [], edit) + '</div>' +
        '<div class="hz-reset"><b>Reset</b> ' + fld("reset", "", edit ? "—" : "") + '</div>' +
        '<div class="irw"><div class="irw-in">' + irwHtml(d) + '</div></div>' +
      '</div></div>' +
    '</article>';
  }
  /* ---------------- actions: any number of triggered abilities, one spare row while editing.
     Each is its own panel, titled with the ability's name and its action-cost glyph; traits (if
     any) sit on their own line under that; Trigger — when it has one — is its own boxed line;
     the effect write-up flows below, unlabelled, since the panel is already named for what it does. */
  function traitsText(traits){ return traits.length ? "(" + traits.join(", ") + ")" : ""; }
  function actRowHtml(a, i, edit, spare){
    a = a || {name:"", cost:"", traits:[], trigger:"", effect:""};
    var ce = edit ? ' contenteditable="true" spellcheck="false"' : '';
    var traits = a.traits || [];
    var traitsLine = (edit || traits.length) ? '<div class="hz-traits">' + esc(traitsText(traits)) + '</div>' : "";
    var showTrigger = edit || a.trigger;
    var triggerLine = showTrigger ? '<div class="hz-trigger"><span class="cap">Trigger</span><span class="fld actbody" data-f="a' + i + 't"' + ce + (edit ? ' data-ph="What sets it off"' : '') + '>' + esc(a.trigger) + '</span></div>' : "";
    var effectInner = edit ? esc(a.effect) : formatEffect(a.effect);
    return '<div class="hz-act' + (spare ? " spare" : "") + '" data-i="' + i + '" data-cost="' + esc(a.cost || "") + '" data-traits="' + esc(traits.join(",")) + '">' +
      '<div class="hz-act-name"><span class="fld actname" data-f="a' + i + 'n"' + ce + (edit ? ' data-ph="Name"' : '') + '>' + esc(a.name) + '</span>' + costGlyph(a.cost) + '</div>' +
      traitsLine + triggerLine +
      '<div class="fld actbody effect" data-f="a' + i + 'e"' + ce + (edit ? ' data-ph="Effect — what it does"' : '') + '>' + effectInner + '</div>' +
    '</div>';
  }
  function actionsHtml(list, edit){
    var out = list.map(function(a, i){ return actRowHtml(a, i, edit, false); });
    if(edit) out.push(actRowHtml({name:"", cost:"", traits:[], trigger:"", effect:""}, list.length, edit, true));
    return out.join("");
  }
  function readActions(){
    return Array.prototype.map.call(cardbox.querySelectorAll(".hz-act"), function(row){
      var trig = row.querySelector(".hz-trigger .actbody");
      return {
        name:textOf(row.querySelector(".actname")).trim(), cost:row.dataset.cost || "",
        traits:(row.dataset.traits || "").split(",").filter(Boolean),
        trigger:trig ? textOf(trig).trim() : "", effect:textOf(row.querySelector(".effect")).trim()
      };
    });
  }
  function renderActionsBlock(list){
    var box = cardbox.querySelector("#actionsBlock"); if(!box) return;
    box.innerHTML = actionsHtml(list, true);
  }
  /* once the last (spare) row gets text, a fresh spare opens after it — existing rows are untouched */
  function maybeAddSpare(){
    var rows = cardbox.querySelectorAll(".hz-act"); if(!rows.length) return;
    var last = rows[rows.length - 1];
    var trig = last.querySelector(".hz-trigger .actbody");
    var has = textOf(last.querySelector(".actname")).trim() || (trig && textOf(trig).trim()) || textOf(last.querySelector(".effect")).trim();
    if(!has) return;
    var div = document.createElement("div");
    div.innerHTML = actRowHtml({name:"", cost:"", traits:[], trigger:"", effect:""}, rows.length, true, true);
    cardbox.querySelector("#actionsBlock").appendChild(div.firstChild);
  }

  /* ---------------- Imm / Res / Weak: typed in the panel under the card; the strip always prints ---------------- */
  function irwHtml(d){
    return IRW.filter(function(q){ return String(d[q[0]] || "").trim(); }).map(function(q){
      return '<div class="irwl"><b>' + q[1] + '</b> <span class="iv">' + esc(titleCase(d[q[0]])) + '</span></div>';
    }).join("");
  }
  function readIrw(d){ IRW.forEach(function(q){ d[q[0]] = $(q[0] + "In").value.replace(/\s*\n+\s*/g, ", ").replace(/\s+/g, " ").trim(); }); return d; }
  function setIrw(d){ IRW.forEach(function(q){ var el = $(q[0] + "In"); el.value = d[q[0]] || ""; growField(el); }); renderIrw(d); }
  function renderIrw(d){ cardbox.querySelector(".irw-in").innerHTML = irwHtml(d); }
  function growField(el){ el.style.height = "auto"; el.style.height = (el.scrollHeight + 2) + "px"; }
  IRW.forEach(function(q){ $(q[0] + "In").addEventListener("input", function(){ growField(this); renderIrw(readIrw({})); fitCardBox(cardbox); saveDraft(); }); });
  window.addEventListener("resize", function(){ IRW.forEach(function(q){ growField($(q[0] + "In")); }); });

  /* ---------------- fit: short numeric fields shrink to stay on one line; the whole stat half
     shrinks together, via CSS zoom, if a long write-up doesn't fit at full size ---------------- */
  function fitElems(root){
    root.querySelectorAll(".fit").forEach(function(el){
      el.style.fontSize = "";
      var base = parseFloat(getComputedStyle(el).fontSize), sc = 1;
      while(el.scrollWidth > el.clientWidth + 0.5 && sc > 0.5){ sc -= 0.05; el.style.fontSize = (base * sc) + "px"; }
    });
  }
  function fitCardBox(box){
    fitElems(box);
    var wrap = box.querySelector(".hzfit"), half = box.querySelector(".half.stats");
    if(!wrap || !half) return;
    wrap.style.zoom = 1;
    var sc = 1, needed = wrap.scrollHeight, budget = half.clientHeight;
    /* text reflow shifts line counts in jumps, not smoothly, so step small to avoid overshooting */
    while(needed > budget + 0.5 && sc > 0.55){ sc -= 0.01; wrap.style.zoom = sc.toFixed(2); needed = wrap.scrollHeight; }
  }
  function fitRendered(root){ root.querySelectorAll(".cardbox").forEach(fitCardBox); }

  /* ---------------- editor state ---------------- */
  var zoom = 1, currentId = null;
  var img = {src:"", data:"", id:"", meta:"", dirty:false};
  var imgScale = 100, source = "";
  var cardEl = null, photo = null;

  function texts(){ return cardbox.querySelectorAll("[data-f]"); }
  function textOf(el){
    var h = el.innerHTML.replace(/<div>/gi, "\n").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "");
    var t = document.createElement("textarea"); t.innerHTML = h;
    return t.value.replace(/ /g, " ").replace(/\n+$/, "");
  }
  function field(name){ return cardbox.querySelector('[data-f="' + name + '"]'); }

  function collect(){
    var d = {imgScale:imgScale, source:source};
    FIELDS.forEach(function(f){ var el = field(f); d[f] = el ? textOf(el) : ""; });
    readIrw(d);
    d.actions = readActions().filter(function(a){ return a.name || a.trigger || a.effect; });
    return d;
  }
  function saveDraft(){
    var d = collect();
    d.id = currentId; d.zoom = zoom;
    d.image = img.data; d.imageId = img.id; d.imageSrc = img.src; d.imageMeta = img.meta; d.imageDirty = img.dirty;
    try{ localStorage.setItem(DRAFT, JSON.stringify(d)); }catch(e){}
  }
  function load(d){
    d = d || {};
    setIrw(d);
    FIELDS.forEach(function(f){ var el = field(f); if(el) el.innerText = d[f] == null ? "" : d[f]; });
    renderActionsBlock((d.actions || []).map(function(a){ return {name:a.name || "", cost:a.cost || "", traits:a.traits || [], trigger:a.trigger || "", effect:a.effect || ""}; }));
    currentId = d.id || null;
    setImage({src:d.imageSrc || d.image || (d.imageId ? "/_blob/" + d.imageId : ""),
              data:d.image || "", id:d.imageId || "", meta:d.imageMeta || "", dirty:!!d.imageDirty});
    setImgScale(d.imgScale || 100);
    setSource(d.source || "");
    if(d.zoom) setZoom(d.zoom);
    refresh();
  }
  function setSource(u){
    source = String(u || "").trim();
    var row = $("sourceRow"), a = $("sourceLink");
    row.hidden = !source;
    a.href = source; a.textContent = source.replace(/^https?:\/\/(www\.)?/, "");
  }
  function setZoom(z){
    zoom = z;
    document.documentElement.style.setProperty("--zoom", z);
    $("z-lvl").textContent = Math.round(z * 100) + "%";
  }
  function setImgScale(v){
    imgScale = Math.max(40, Math.min(100, Math.round(v / 5) * 5));
    $("imgScale").value = imgScale; $("imgScaleLbl").textContent = imgScale + "%";
    photo.style.setProperty("--img-scale", imgScale / 100);
  }
  function setImage(next){
    img = next;
    var el = photo.querySelector("img");
    if(img.src){
      if(!el){ el = document.createElement("img"); el.alt = ""; photo.insertBefore(el, photo.firstChild); }
      el.src = img.src;
      photo.classList.add("has-img");
    }else{
      if(el) el.remove();
      photo.classList.remove("has-img");
    }
    $("phMeta").textContent = img.meta || "Drop an image on the picture half, or paste one.";
  }
  function refresh(){
    fitCardBox(cardbox); renderActList();
    var n = readActions().filter(function(a){ return a.name || a.trigger || a.effect; }).length;
    $("cardNote").innerHTML = "2.6 &times; 7.8 in, folded at the middle &middot; <b>" + n + "</b> action" + (n === 1 ? "" : "s");
  }

  /* ---------------- actions side panel: cost + traits pickers, and remove; name/trigger/effect
     stay on the card itself ---------------- */
  function renderActList(){
    var box = $("actList"); box.innerHTML = "";
    readActions().forEach(function(a, i){
      var li = document.createElement("li"); li.dataset.i = i;
      var seg = document.createElement("div"); seg.className = "seg mini"; seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "Action cost");
      COSTS.forEach(function(c){
        var b = document.createElement("button"); b.type = "button"; b.dataset.cost = c[0]; b.title = c[2];
        b.textContent = c[1]; b.setAttribute("aria-pressed", (a.cost || "") === c[0] ? "true" : "false");
        seg.appendChild(b);
      });
      var name = document.createElement("span"); name.className = "aname"; name.textContent = a.name || "";
      li.appendChild(seg); li.appendChild(name);
      if(a.name || a.trigger || a.effect){
        var del = document.createElement("button"); del.type = "button"; del.className = "adel"; del.innerHTML = "&times;";
        del.title = "Remove action"; del.setAttribute("aria-label", "Remove action");
        li.appendChild(del);
      }
      var traitsRow = document.createElement("div"); traitsRow.className = "atraits";
      ATRAITS.forEach(function(t){
        var b = document.createElement("button"); b.type = "button"; b.className = "chip"; b.dataset.trait = t;
        b.textContent = t; b.setAttribute("aria-pressed", a.traits.indexOf(t) >= 0 ? "true" : "false");
        traitsRow.appendChild(b);
      });
      li.appendChild(traitsRow);
      box.appendChild(li);
    });
  }
  $("actList").addEventListener("click", function(e){
    var li = e.target.closest("li"); if(!li) return;
    var i = +li.dataset.i, rows = cardbox.querySelectorAll(".hz-act"), row = rows[i]; if(!row) return;
    if(e.target.classList.contains("adel")){
      var list = readActions(); list.splice(i, 1);
      renderActionsBlock(list.filter(function(a){ return a.name || a.trigger || a.effect; }));
      refresh(); saveDraft();
      return;
    }
    var traitBtn = e.target.closest("button[data-trait]");
    if(traitBtn){
      var t = traitBtn.dataset.trait, traits = (row.dataset.traits || "").split(",").filter(Boolean), idx = traits.indexOf(t);
      if(idx >= 0) traits.splice(idx, 1); else traits.push(t);
      row.dataset.traits = traits.join(",");
      var tdiv = row.querySelector(".hz-traits"); if(tdiv) tdiv.textContent = traitsText(traits);
      fitCardBox(cardbox); renderActList(); saveDraft();
      return;
    }
    var costBtn = e.target.closest("button[data-cost]"); if(!costBtn) return;
    var c = costBtn.dataset.cost, next = (row.dataset.cost || "") === c ? "" : c;
    row.dataset.cost = next;
    var nameDiv = row.querySelector(".hz-act-name"), oldGlyph = nameDiv.querySelector(".glyph");
    if(oldGlyph) oldGlyph.remove();
    var g = costGlyph(next); if(g) nameDiv.insertAdjacentHTML("beforeend", g);
    fitCardBox(cardbox); renderActList(); saveDraft();
  });

  /* ---------------- editor wiring ---------------- */
  cardbox.innerHTML = cardHtml({}, true);
  cardEl = cardbox.querySelector(".card"); photo = $("photo");

  document.addEventListener("input", function(e){
    if(!e.target || !e.target.isContentEditable) return;
    var f = (e.target.dataset && e.target.dataset.f) || "";
    if(/^a\d+[nte]$/.test(f)) maybeAddSpare();
    refresh(); saveDraft();
  });
  cardbox.addEventListener("keydown", function(e){
    var t = e.target; if(!t || !t.isContentEditable) return;
    if(e.key === "Enter"){
      e.preventDefault();
      var f = t.dataset.f || "", multi = MULTI[f] || /^a\d+[te]$/.test(f);
      if(multi) document.execCommand("insertText", false, "\n");
      else{ var all = Array.prototype.slice.call(texts()), i = all.indexOf(t); if(all[i + 1]) all[i + 1].focus(); }
    }
  });
  /* an action row emptied out (cleared by hand) is dropped once you leave it — but only rebuild
     when something actually needs pruning, so tabbing name -> trigger -> effect within one row
     doesn't yank focus out from under itself */
  cardbox.addEventListener("focusout", function(e){
    var t = e.target; if(!t || !t.dataset || !/^a\d+[nte]$/.test(t.dataset.f || "")) return;
    var raw = readActions();
    var needsPrune = raw.some(function(a, idx){ return idx < raw.length - 1 && !a.name && !a.trigger && !a.effect; });
    if(!needsPrune) return;
    renderActionsBlock(raw.filter(function(a){ return a.name || a.trigger || a.effect; }));
    refresh(); saveDraft();
  });
  function looksLikeHazardBlock(t){ return /\bHazard\s+-?\d+\b/i.test(t) && /\bAC\s+\d+/.test(t) && /\bHP\s+\d+/.test(t); }
  document.addEventListener("paste", function(e){
    if(!e.target || !e.target.isContentEditable) return;
    var items = (e.clipboardData || {}).items || [];
    for(var i = 0; i < items.length; i++){
      if(items[i].type && items[i].type.indexOf("image/") === 0){ e.preventDefault(); loadImage(items[i].getAsFile()); return; }
    }
    e.preventDefault();
    var txt = (e.clipboardData || window.clipboardData).getData("text/plain");
    if(looksLikeHazardBlock(txt)){ importText(txt, ""); return; }
    var f = e.target.dataset.f || "", multi = MULTI[f] || /^a\d+[te]$/.test(f);
    if(!multi) txt = txt.replace(/\s*\n\s*/g, " ");
    document.execCommand("insertText", false, txt);
  });
  photo.addEventListener("click", function(){ if(!img.src) phFile.click(); });
  photo.addEventListener("keydown", function(e){ if((e.key === "Enter" || e.key === " ") && !img.src){ e.preventDefault(); phFile.click(); } });
  $("phPick").addEventListener("click", function(){ phFile.click(); });
  phFile.addEventListener("change", function(){ loadImage(this.files[0]); this.value = ""; });
  $("phClear").addEventListener("click", function(){ setImage({src:"", data:"", id:"", meta:"", dirty:true}); refresh(); saveDraft(); });
  $("imgScale").addEventListener("input", function(){ setImgScale(+this.value); saveDraft(); });
  function hasFile(e){ var t = e.dataTransfer; return t && t.types && Array.prototype.indexOf.call(t.types, "Files") >= 0; }
  ["dragenter","dragover"].forEach(function(t){
    cardEl.addEventListener(t, function(e){ if(!hasFile(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; photo.classList.add("drop"); });
  });
  cardEl.addEventListener("dragleave", function(e){ if(!cardEl.contains(e.relatedTarget)) photo.classList.remove("drop"); });
  cardEl.addEventListener("drop", function(e){ if(!hasFile(e)) return; e.preventDefault(); photo.classList.remove("drop"); loadImage(e.dataTransfer.files[0]); });
  window.addEventListener("dragover", function(e){ if(hasFile(e)) e.preventDefault(); });
  window.addEventListener("drop", function(e){ if(hasFile(e)) e.preventDefault(); });

  /* ---------------- image processing (background knockout + trim) ---------------- */
  var bgToggle = $("bgToggle");
  try{ bgToggle.checked = localStorage.getItem("pf2e-hazard-bg") !== "off"; }catch(e){}
  bgToggle.addEventListener("change", function(){
    try{ localStorage.setItem("pf2e-hazard-bg", this.checked ? "on" : "off"); }catch(e){}
    toast(this.checked ? "Next picture: background removed" : "Next picture: left as is");
  });
  function knockout(cv){
    var w = cv.width, h = cv.height, ctx = cv.getContext("2d");
    var im = ctx.getImageData(0, 0, w, h), d = im.data;
    var corners = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + w - 1) * 4];
    if(corners.some(function(i){ return d[i + 3] < 24; })) return false;
    var bg = [0, 0, 0], spread = 0;
    for(var k = 0; k < 3; k++){
      var vals = corners.map(function(i){ return d[i + k]; });
      bg[k] = (vals[0] + vals[1] + vals[2] + vals[3]) / 4;
      spread = Math.max(spread, Math.max.apply(null, vals) - Math.min.apply(null, vals));
    }
    if(spread > 40) return false;
    var IN = 48, OUT = 150;
    function dist(p){ var i = p * 4; return Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]); }
    var seen = new Uint8Array(w * h), stack = [];
    function push(p){ if(!seen[p] && dist(p) < OUT){ seen[p] = 1; stack.push(p); } }
    for(var x = 0; x < w; x++){ push(x); push((h - 1) * w + x); }
    for(var y = 0; y < h; y++){ push(y * w); push(y * w + w - 1); }
    while(stack.length){
      var p = stack.pop(), px = p % w, py = (p - px) / w;
      if(px > 0) push(p - 1); if(px < w - 1) push(p + 1);
      if(py > 0) push(p - w); if(py < h - 1) push(p + w);
    }
    var n = 0;
    for(var q = 0; q < w * h; q++){
      if(!seen[q]) continue;
      var dd = dist(q), i = q * 4, a = dd <= IN ? 0 : Math.min(1, (dd - IN) / (OUT - IN));
      if(a <= 0){ d[i + 3] = 0; }
      else{
        for(var c = 0; c < 3; c++) d[i + c] = Math.max(0, Math.min(255, Math.round((d[i + c] - (1 - a) * bg[c]) / a)));
        d[i + 3] = Math.round(a * 255);
      }
      n++;
    }
    if(n) ctx.putImageData(im, 0, 0);
    return n > 0;
  }
  function trimBox(cv){
    var w = cv.width, h = cv.height, d = cv.getContext("2d").getImageData(0, 0, w, h).data;
    var corners = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + w - 1) * 4];
    var alphaMode = corners.some(function(i){ return d[i + 3] < 24; });
    var bg = [0, 0, 0];
    if(!alphaMode){
      var spread = 0;
      for(var k = 0; k < 3; k++){
        var vals = corners.map(function(i){ return d[i + k]; });
        bg[k] = (vals[0] + vals[1] + vals[2] + vals[3]) / 4;
        spread = Math.max(spread, Math.max.apply(null, vals) - Math.min.apply(null, vals));
      }
      if(spread > 40) return null;
    }
    var TOL = 34;
    function isBg(i){
      if(d[i + 3] < 24) return true;
      if(alphaMode) return false;
      return Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) < TOL * 3;
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
  }
  function loadImage(file, opts){
    opts = opts || {};
    if(!file) return;
    var isImage = /^image\//.test(file.type) || /\.(webp|png|jpe?g|gif|bmp|avif)$/i.test(file.name || "");
    if(!isImage) return;
    photo.classList.add("busy");
    var reader = new FileReader();
    reader.onload = function(){
      var im = new Image();
      im.onload = function(){
        var fw = im.width, fh = im.height, WORK = 1200;
        if(fw > WORK || fh > WORK){ var fs = Math.min(WORK / fw, WORK / fh); fw = Math.round(fw * fs); fh = Math.round(fh * fs); }
        var full = document.createElement("canvas"); full.width = fw; full.height = fh;
        full.getContext("2d").drawImage(im, 0, 0, fw, fh);
        function encode(src, sx, sy, sw, sh, asJpeg){
          var max = 900, w = sw, h = sh;
          if(w > max || h > max){ var s = Math.min(max / w, max / h); w = Math.round(w * s); h = Math.round(h * s); }
          var out = document.createElement("canvas"); out.width = w; out.height = h;
          out.getContext("2d").drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
          return {url:asJpeg ? out.toDataURL("image/jpeg", 0.88) : out.toDataURL("image/png"), w:w, h:h};
        }
        var isJpeg = /jpe?g/i.test(file.type), v;
        if(opts.bg === false ? false : bgToggle.checked){
          var cut = false, box = null;
          try{ cut = knockout(full); }catch(e){}
          try{ box = trimBox(full); }catch(e){}
          v = box ? encode(full, box.x, box.y, box.w, box.h, false) : encode(full, 0, 0, fw, fh, isJpeg && !cut);
          v.meta = (isJpeg && !cut && !box ? "JPG" : "PNG") + " · " + v.w + "×" + v.h + (cut ? " · background removed" : (box ? " · trimmed" : ""));
        }else{
          v = encode(full, 0, 0, fw, fh, isJpeg);
          v.meta = (isJpeg ? "JPG" : "PNG") + " · " + v.w + "×" + v.h;
        }
        setImage({src:v.url, data:v.url, id:"", meta:v.meta, dirty:true});
        photo.classList.remove("busy");
        refresh(); saveDraft();
      };
      im.onerror = function(){ photo.classList.remove("busy"); };
      im.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  /* ---------------- import: a pasted hazard stat block (Archives of Nethys, a PDF, a book) ---------------- */
  function parseHazardText(text){
    var t = String(text || "").replace(/\r/g, "").replace(/[–−]/g, "-");
    var lines = t.split("\n").map(function(l){ return l.trim(); }).filter(Boolean);
    var out = {actions:[]}, li = -1, m;
    for(var i = 0; i < lines.length; i++){ if((m = /^Hazard\s+(-?\d+)\s*$/i.exec(lines[i]))){ li = i; out.level = m[1]; break; } }
    if(li > 0) out.name = lines[li - 1];
    var typeLine = "";
    if(li >= 0 && lines[li + 1] && !/^(Source\b|Complexity\b|Stealth\b|Disable\b|AC\s+\d|Description\b)/i.test(lines[li + 1])) typeLine = lines[li + 1];
    var cLine = lines.filter(function(l){ return /^Complexity\s+/i.test(l); })[0];
    var complexity = cLine ? cLine.replace(/^Complexity\s+/i, "").trim() : "";
    if(li >= 0) out.kicker = ["Hazard " + (out.level || "?"), typeLine, complexity].filter(Boolean).join(" · ");
    var flat = lines.join("\n");
    if((m = /^Stealth\s+DC\s*(\d+)/im.exec(flat))) out.stealthDc = m[1];
    if((m = /^Disable\s+DC\s*(\d+)/im.exec(flat))) out.disableDc = m[1];
    if((m = /^Reset\s+(.+)$/im.exec(flat))) out.reset = m[1].trim();
    if((m = /\bAC\s+(\d+)/.exec(flat))) out.ac = m[1];
    if((m = /\bHardness\s+(\d+)/i.exec(flat))) out.hardness = m[1];
    var sm = function(re){ var r = re.exec(flat); return r ? r[1] + r[2] : ""; };
    var fort = sm(/\bFort\w*\s+([+-])\s*(\d+)/); if(fort) out.fort = fort;
    var ref = sm(/\bRef\w*\s+([+-])\s*(\d+)/); if(ref) out.ref = ref;
    var will = sm(/\bWill\s+([+-])\s*(\d+)/); if(will) out.will = will;
    if((m = /\bHP\s+(\d+)/.exec(flat))) out.hp = m[1];
    var abbr = function(s){
      return s.replace(/\s+/g, " ").trim()
        .replace(/bludgeoning/gi, "bludg.").replace(/piercing/gi, "pierc.").replace(/slashing/gi, "slash.")
        .replace(/electricity/gi, "elec.").replace(/precision/gi, "prec.").replace(/physical/gi, "phys.")
        .replace(/\bdamage\b/gi, "dmg");
    };
    var hpLine = lines.filter(function(l){ return /^HP\s+\d+/i.test(l); })[0] || flat;
    [["immune", /Immunities\s+([^;]+?)(?:,?\s*(?:Resistances|Weaknesses)\b|$)/i],
     ["resist", /Resistances\s+([^;]+?)(?:,?\s*(?:Immunities|Weaknesses)\b|$)/i],
     ["weak", /Weaknesses\s+([^;]+?)(?:,?\s*(?:Immunities|Resistances)\b|$)/i]].forEach(function(q){
      var mm = q[1].exec(hpLine); if(mm) out[q[0]] = abbr(mm[1]);
    });
    var costMap = {"reaction":"reaction","free action":"free","one action":"1","two actions":"2","three actions":"3","single action":"1"};
    var actionRe = /^(.*?)\s*\[([^\]]+)\]\s*(?:\(([^)]+)\)\s*)?(.*)$/;
    lines.forEach(function(l){
      var mm = actionRe.exec(l); if(!mm) return;
      var key = mm[2].trim().toLowerCase(); if(!(key in costMap)) return;
      var traits = mm[3] ? mm[3].split(",").map(function(s){ return s.trim().toLowerCase(); }).filter(Boolean) : [];
      var rest = mm[4].trim(), trigger = "", effect = rest;
      var tm = /^Trigger\s+(.*?);\s*Effect\s+(.*)$/is.exec(rest);
      if(tm){ trigger = tm[1].trim(); effect = tm[2].trim(); }
      else{
        var tm2 = /^Trigger\s+(.*)$/is.exec(rest);
        if(tm2){ trigger = tm2[1].trim(); effect = ""; }
        else{ var em = /^Effect\s+(.*)$/is.exec(rest); if(em) effect = em[1].trim(); }
      }
      out.actions.push({name:mm[1].trim(), cost:costMap[key], traits:traits, trigger:trigger, effect:effect});
    });
    return out;
  }
  function importText(text, link){
    var p = parseHazardText(text);
    var got = ["name","ac","hp","stealthDc","disableDc"].filter(function(f){ return p[f]; });
    if(!got.length && !p.actions.length){ toast("No hazard stat block found in that text", 4000); return false; }
    setIrw(p);
    FIELDS.forEach(function(f){ var el = field(f); if(el) el.innerText = p[f] || ""; });
    renderActionsBlock(p.actions.length ? p.actions : []);
    if(link) setSource(link);
    refresh(); saveDraft();
    var missing = ["name","ac","hp","stealthDc","disableDc"].filter(function(f){ return !p[f]; });
    toast(missing.length ? "Filled the card — still needs " + missing.join(", ") : "Filled the card from the stat block", 4000);
    return true;
  }
  var importPanel = $("importPanel");
  function openImport(){ $("importText").value = ""; $("importNote").textContent = ""; importPanel.hidden = false; $("scrim").hidden = false; $("importText").focus(); }
  function closeImport(){ importPanel.hidden = true; $("scrim").hidden = true; }
  $("importBtn").addEventListener("click", openImport);
  $("importClose").addEventListener("click", closeImport);
  function runImport(){
    var txt = $("importText").value;
    if(!txt.trim()){ $("importNote").textContent = "Paste the hazard's stat block text."; return; }
    if(importText(txt, "")) closeImport();
    else $("importNote").textContent = "That doesn't look like a PF2e hazard stat block (no Hazard N / AC / HP lines).";
  }
  $("importGo").addEventListener("click", runImport);
  $("importText").addEventListener("keydown", function(e){ if(e.key === "Enter" && (e.ctrlKey || e.metaKey)){ e.preventDefault(); runImport(); } });
  document.addEventListener("keydown", function(e){ if(e.key === "Escape" && !importPanel.hidden) closeImport(); });

  function stepZoom(dir){ var i = ZOOMS.indexOf(zoom); if(i < 0) i = 1; i = Math.min(ZOOMS.length - 1, Math.max(0, i + dir)); setZoom(ZOOMS[i]); refresh(); saveDraft(); }
  $("z-out").addEventListener("click", function(){ stepZoom(-1); });
  $("z-in").addEventListener("click", function(){ stepZoom(1); });
  $("example").addEventListener("click", function(){ var d = JSON.parse(JSON.stringify(EXAMPLE)); d.id = null; d.zoom = zoom; load(d); saveDraft(); });
  $("clear").addEventListener("click", function(){ load({id:currentId, zoom:zoom}); saveDraft(); field("name").focus(); });
  $("newCard").addEventListener("click", function(){ load({zoom:zoom}); saveDraft(); showView("editor"); field("name").focus(); });

  function fitZoom(){
    var room = Math.min(window.innerWidth - 40, 1100), best = ZOOMS[0];
    ZOOMS.forEach(function(z){ if(z <= 2 && 500 * z <= room) best = z; });
    return best;
  }

  var toastT = null;
  function toast(msg, ms){
    var t = $("toast"); t.textContent = msg; t.classList.remove("hide");
    clearTimeout(toastT);
    toastT = setTimeout(function(){ t.classList.add("hide"); }, ms || (/failed|not stored/i.test(msg) ? 6000 : 2200));
  }

  function renderCard(d, opts){
    var box = document.createElement("div"); box.className = "cardbox"; box.innerHTML = cardHtml(d, false, opts);
    return box;
  }

  /* ---------------- library store: this device only ---------------- */
  var Lib = {cards:[], listeners:[]};
  Lib.emit = function(){ Lib.listeners.forEach(function(f){ f(Lib.cards); }); };
  Lib.onChange = function(f){ Lib.listeners.push(f); f(Lib.cards); };
  Lib.readLocal = function(){ try{ return JSON.parse(localStorage.getItem(LIB_LOCAL)) || []; }catch(e){ return []; } };
  Lib.writeLocal = function(){ try{ localStorage.setItem(LIB_LOCAL, JSON.stringify(Lib.cards)); }catch(e){ toast("Storage full — picture too large to keep"); } };
  Lib.newId = function(){ return "h" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };
  Lib.save = function(card, id){
    var now = new Date().toISOString();
    id = id || Lib.newId();
    var i = Lib.cards.findIndex(function(c){ return c.id === id; });
    card.id = id; card.createdAt = i >= 0 ? Lib.cards[i].createdAt : now; card.updatedAt = now;
    if(i >= 0) Lib.cards[i] = card; else Lib.cards.push(card);
    Lib.writeLocal(); Lib.emit();
    return id;
  };
  Lib.remove = function(id){ Lib.cards = Lib.cards.filter(function(c){ return c.id !== id; }); Lib.writeLocal(); Lib.emit(); };
  Lib.start = function(){ Lib.cards = Lib.readLocal(); Lib.emit(); $("status").innerHTML = "Library: <b>this device</b>"; };

  /* Save opens a preview first — the same rendering the Library uses, not the editor's
     contenteditable one — so what gets saved is what you'll actually see there. */
  var previewModal = $("previewModal"), previewCard = $("previewCard");
  function cardForSave(){
    var card = collect();
    card.image = img.data || img.src || ""; card.imageMeta = img.meta || "";
    return card;
  }
  function openPreview(){
    previewCard.innerHTML = "";
    previewCard.appendChild(renderCard(cardForSave()));
    fitRendered(previewCard);
    previewModal.hidden = false; scrim.hidden = false;
    $("previewSave").focus();
  }
  function closePreview(){ previewModal.hidden = true; scrim.hidden = true; }
  $("saveCard").addEventListener("click", openPreview);
  $("previewCancel").addEventListener("click", closePreview);
  $("previewSave").addEventListener("click", function(){
    currentId = Lib.save(cardForSave(), currentId);
    saveDraft();
    closePreview();
    toast("Saved to library");
    showView("library");
  });

  /* ---------------- library view ---------------- */
  var sortMode = "created", selected = [];
  try{ selected = JSON.parse(localStorage.getItem(SEL)) || []; }catch(e){}
  function saveSel(){ try{ localStorage.setItem(SEL, JSON.stringify(selected)); }catch(e){} }
  function sorted(){
    var a = Lib.cards.slice();
    if(sortMode === "name") a.sort(function(x, y){ return (x.name || "~").localeCompare(y.name || "~"); });
    else if(sortMode === "edited") a.sort(function(x, y){ return (y.updatedAt || "").localeCompare(x.updatedAt || ""); });
    else a.sort(function(x, y){ return (y.createdAt || "").localeCompare(x.createdAt || ""); });
    return a;
  }
  function fmtDate(s){ if(!s) return "—"; var d = new Date(s); return isNaN(d) ? "—" : d.toLocaleDateString(undefined, {month:"short", day:"numeric"}); }
  function renderGallery(){
    var g = $("gallery"); g.innerHTML = "";
    var list = sorted();
    $("libEmpty").hidden = list.length > 0;
    selected = selected.filter(function(id){ return Lib.cards.some(function(c){ return c.id === id; }); });
    list.forEach(function(d){
      var w = document.createElement("div");
      w.className = "gcard" + (selected.indexOf(d.id) >= 0 ? " sel" : ""); w.tabIndex = 0; w.dataset.id = d.id;
      var cb = document.createElement("input"); cb.type = "checkbox"; cb.className = "gsel"; cb.checked = selected.indexOf(d.id) >= 0; cb.setAttribute("aria-label", "Select for the sheet");
      var del = document.createElement("button"); del.className = "gdel"; del.innerHTML = "&times;"; del.title = "Delete card";
      w.appendChild(cb); w.appendChild(del); w.appendChild(renderCard(d));
      var meta = document.createElement("div"); meta.className = "gmeta";
      meta.innerHTML = "<b>" + esc(d.name || "unnamed") + "</b><span>" + (sortMode === "edited" ? "edited " + fmtDate(d.updatedAt) : "made " + fmtDate(d.createdAt)) + "</span>";
      w.appendChild(meta);
      g.appendChild(w);
    });
    fitRendered(g);
    $("toSheet").textContent = "Sheet (" + selected.length + ")";
  }
  $("gallery").addEventListener("click", function(e){
    var w = e.target.closest(".gcard"); if(!w) return;
    var id = w.dataset.id;
    if(e.target.classList.contains("gsel")){
      var i = selected.indexOf(id);
      if(e.target.checked && i < 0) selected.push(id); else if(!e.target.checked && i >= 0) selected.splice(i, 1);
      w.classList.toggle("sel", e.target.checked); saveSel();
      $("toSheet").textContent = "Sheet (" + selected.length + ")";
      return;
    }
    if(e.target.classList.contains("gdel")){
      var d = Lib.cards.filter(function(c){ return c.id === id; })[0];
      if(confirm("Delete “" + (d && d.name || "this card") + "” from the library?")){
        Lib.remove(id); if(currentId === id){ currentId = null; saveDraft(); } toast("Deleted");
      }
      return;
    }
    var d2 = Lib.cards.filter(function(c){ return c.id === id; })[0];
    if(d2){ load(Object.assign({}, d2, {zoom:zoom})); saveDraft(); showView("editor"); }
  });
  $("gallery").addEventListener("keydown", function(e){ if(e.key === "Enter" && e.target.classList.contains("gcard")) e.target.click(); });
  document.querySelectorAll("[data-sort]").forEach(function(b){
    b.addEventListener("click", function(){
      sortMode = b.dataset.sort;
      document.querySelectorAll("[data-sort]").forEach(function(x){ x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      try{ localStorage.setItem("pf2e-hazard-sort", sortMode); }catch(e){}
      renderGallery();
    });
  });
  $("selAll").addEventListener("click", function(){ selected = sorted().map(function(c){ return c.id; }); saveSel(); renderGallery(); });
  $("selNone").addEventListener("click", function(){ selected = []; saveSel(); renderGallery(); });
  $("toSheet").addEventListener("click", function(){ showView("sheet"); });
  Lib.onChange(function(){ renderGallery(); if(!$("sheetView").hidden) renderSheet(); });

  /* ---------------- print sheet: 4 across landscape letter, borders shared ---------------- */
  var blankCount = 0;
  function renderSheet(){
    var wrap = $("pages"); wrap.innerHTML = "";
    var order = sorted().filter(function(c){ return selected.indexOf(c.id) >= 0; });
    var items = order.map(function(c){ return {d:c}; });
    for(var i = 0; i < blankCount; i++) items.push({d:{}});
    var z = Math.min(1, (window.innerWidth - 32) / 1056);
    document.documentElement.style.setProperty("--sheet-zoom", z.toFixed(3));
    for(var p = 0; p < items.length; p += 4){
      var page = document.createElement("div"); page.className = "page";
      items.slice(p, p + 4).forEach(function(it){
        var slot = document.createElement("div"); slot.className = "slot";
        slot.appendChild(renderCard(it.d, {flip:true})); page.appendChild(slot);
      });
      wrap.appendChild(page);
    }
    fitRendered(wrap);
    var n = items.length;
    $("sheetNote").textContent = n
      ? n + (n === 1 ? " card" : " cards") + " on " + Math.ceil(n / 4) + (n > 4 ? " letter pages" : " letter page") + " (landscape) · cut along the shared lines, fold at the middle"
      : "Nothing on the sheet yet. Tick hazards in the Library, or add a blank card.";
    $("print").disabled = n === 0;
  }
  $("addBlank").addEventListener("click", function(){ blankCount++; renderSheet(); });
  $("sheetClear").addEventListener("click", function(){ blankCount = 0; selected = []; saveSel(); renderSheet(); renderGallery(); });

  /* ---- the sheet, printed with the browser's own Print (Ctrl+P / ⌘P → Save as PDF), or opened
     as a standalone page — the same markup and stylesheet, so it prints exactly as it looks here ---- */
  var fontsCssText = "";
  fetch("fonts.css").then(function(r){ return r.ok ? r.text() : ""; }).then(function(t){ fontsCssText = t; }).catch(function(){});
  function fontsCssAbs(){
    var base = ""; try{ base = new URL(".", location.href).href; }catch(e){ return fontsCssText; }
    return fontsCssText.replace(/url\((['"]?)(?!data:|https?:)([^)'"]+)\1\)/g, function(m, q, p){ return "url(" + base + p + ")"; });
  }
  function imgDataUrl(el){
    try{
      var w = el.naturalWidth || el.width || 1, h = el.naturalHeight || el.height || 1;
      var cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      cv.getContext("2d").drawImage(el, 0, 0);
      return cv.toDataURL("image/png");
    }catch(e){ return null; }
  }
  function buildHtml(){
    var live = $("pages"), copy = live.cloneNode(true);
    var srcImgs = live.querySelectorAll("img");
    copy.querySelectorAll("img").forEach(function(im, i){ var v = srcImgs[i] && imgDataUrl(srcImgs[i]); if(v) im.src = v; });
    var n = copy.querySelectorAll(".page").length;
    return '<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1"><title>Hazard cards</title>' +
      '<style>' + fontsCssAbs() + '</style><style>' + $("cardCss").textContent + '</style>' +
      '<style>:root{--sheet-zoom:1;--shadow:0 12px 30px rgba(0,0,0,.12);--ink-3:#777}body{margin:0;padding:1.5rem 0 3rem;background:#D9D4C9;font-family:var(--font-body,Georgia,serif)}' +
      '.hint{text-align:center;font-style:italic;font-size:.9rem;color:#5A4F44;margin:0 0 1.2rem}' +
      '@media print{.hint{display:none}body{padding:0;background:#fff}}</style></head><body>' +
      '<p class="hint">' + n + (n === 1 ? " letter page" : " letter pages") + ', landscape &middot; print at 100% (Ctrl+P / &#8984;P), or choose &ldquo;Save as PDF&rdquo; in the print dialog.</p>' +
      '<section class="view" id="sheetView"><div class="sheet-wrap" id="pages">' + copy.innerHTML + '</div></section></body></html>';
  }
  var printModal = $("printModal"), scrim = $("scrim");
  function closePrintModal(){ printModal.hidden = true; scrim.hidden = true; }
  $("print").addEventListener("click", function(){
    if(this.disabled) return;
    renderSheet();
    printModal.hidden = false; scrim.hidden = false;
    $("printNow").focus();
  });
  $("printNow").addEventListener("click", function(){ closePrintModal(); setTimeout(function(){ window.print(); }, 60); });
  $("openHtml").addEventListener("click", function(){
    var html; try{ html = buildHtml(); }catch(e){ toast("Could not build the page — try Print instead", 5000); console.error("buildHtml", e); return; }
    var blob = new Blob([html], {type:"text/html"}), url = "", w = null;
    try{ url = URL.createObjectURL(blob); }catch(e){}
    if(url){ try{ w = window.open(url, "_blank"); }catch(e){} }
    if(w){ toast("Sheet opened in a new tab"); closePrintModal(); }
    else toast("Could not open a new tab here — try Print instead", 5000);
  });
  $("printModalClose").addEventListener("click", closePrintModal);
  scrim.addEventListener("click", function(){ closePrintModal(); closeImport(); closePreview(); });
  document.addEventListener("keydown", function(e){
    if(e.key !== "Escape") return;
    if(!printModal.hidden) closePrintModal();
    if(!previewModal.hidden) closePreview();
  });
  window.addEventListener("resize", function(){ if(!$("sheetView").hidden) renderSheet(); });
  window.addEventListener("beforeprint", renderSheet);

  /* ---------------- views ---------------- */
  function showView(name){
    ["editor","library","sheet"].forEach(function(v){
      $(v + "View").hidden = v !== name;
      document.querySelectorAll('.bar-group[data-for="' + v + '"]').forEach(function(g){ g.hidden = v !== name; });
    });
    document.querySelectorAll("[data-view]").forEach(function(b){ b.setAttribute("aria-pressed", b.dataset.view === name ? "true" : "false"); });
    if(name === "library") renderGallery();
    if(name === "sheet") renderSheet();
    if(name === "editor") refresh();
    try{ localStorage.setItem("pf2e-hazard-view", name); }catch(e){}
  }
  document.querySelectorAll("[data-view]").forEach(function(b){ b.addEventListener("click", function(){ showView(b.dataset.view); }); });

  /* ---------------- theme ---------------- */
  function setTheme(t){
    if(t) document.documentElement.setAttribute("data-theme", t); else document.documentElement.removeAttribute("data-theme");
    document.querySelectorAll("button[data-theme]").forEach(function(b){ b.setAttribute("aria-pressed", b.dataset.theme === (t || "") ? "true" : "false"); });
    try{ localStorage.setItem("pf2e-hazard-theme", t || ""); }catch(e){}
  }
  document.querySelectorAll("button[data-theme]").forEach(function(b){ b.addEventListener("click", function(){ setTheme(b.dataset.theme); }); });
  try{ setTheme(localStorage.getItem("pf2e-hazard-theme") || ""); }catch(e){}

  /* ---------------- start ---------------- */
  $("opts").open = window.innerWidth > 760;
  try{ sortMode = localStorage.getItem("pf2e-hazard-sort") || "created"; }catch(e){}
  document.querySelectorAll("[data-sort]").forEach(function(x){ x.setAttribute("aria-pressed", x.dataset.sort === sortMode ? "true" : "false"); });
  var draft = null;
  try{ draft = JSON.parse(localStorage.getItem(DRAFT)); }catch(e){}
  if(draft && (draft.name || draft.ac || draft.hp || draft.image || draft.imageId)){ if(!draft.zoom) draft.zoom = fitZoom(); load(draft); }
  else{ var ex = JSON.parse(JSON.stringify(EXAMPLE)); ex.zoom = fitZoom(); load(ex); }
  Lib.start();
  var lastView = "editor";
  try{ lastView = localStorage.getItem("pf2e-hazard-view") || "editor"; }catch(e){}
  showView(lastView === "sheet" ? "library" : lastView);
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ refresh(); });
})();

/* Toolbag tool switcher (site build): close on outside click or Escape. */
(function(){
  var sw = document.getElementById("toolSwitch"); if(!sw) return;
  document.addEventListener("click", function(e){ if(sw.open && !sw.contains(e.target)) sw.open = false; });
  document.addEventListener("keydown", function(e){ if(e.key === "Escape" && sw.open){ sw.open = false; sw.querySelector("summary").focus(); } });
})();
