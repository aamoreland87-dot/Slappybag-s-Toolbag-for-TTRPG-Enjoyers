/* tb-images.js — the picture finder. Site pages only (it needs the network; artifacts have none).
   Load after toolbag-core.js; each tool calls TB.pictures.register({...}) once its editor is up.

   Three free sources, all fine to print and sell (pictures that need share-alike or forbid
   commercial use are filtered out):
     icons      game-icons.net — 4,000+ black-and-white game icons, CC BY 3.0 (a few CC0). The list of
                names is data/game-icons.json; the SVGs come from jsDelivr's copy of the GitHub repo.
     paintings  Wikimedia Commons — public-domain paintings, engravings and illustrations.
     openverse  Openverse — millions of openly licensed pictures (CC0, public domain mark, CC BY).

   The finder searches with the card's name, then single words of it, then its traits, and the
   picture goes through the tool's own loader (same trimming and sizing as a dropped file) with its
   credit attached; the credit prints under the cards on the PDF (TB.pdfFooters in tb-parse.js).

   Which source opens first: a default per card type (Options on the home page, or "Make default"
   in the finder), unless the card's current picture came from another source — that card keeps
   its own. */
(function(w, d){
  "use strict";
  var TB = w.TB = w.TB || {};

  var SOURCES = {
    icons:{label:"Icons", long:"Icons (game-icons.net)", note:"Black-and-white game icons. Credit: CC BY 3.0."},
    paintings:{label:"Classic art", long:"Classic paintings (Wikimedia Commons)", note:"Public-domain paintings and engravings."},
    openverse:{label:"Openverse", long:"Openverse (open photos and art)", note:"CC0, public domain and CC BY pictures from many sites."}
  };
  var KINDS = {item:"Item cards", feat:"Feat cards", spell:"Spell cards", init:"Initiative cards", hazard:"Hazard cards"};
  var DEFAULTS = {item:"icons", feat:"icons", spell:"icons", init:"paintings", hazard:"paintings"};
  var PREF = "tb-pic-defaults";
  function prefs(){ var p = {}; try{ p = JSON.parse(localStorage.getItem(PREF) || "{}") || {}; }catch(e){} return p; }
  function defaultFor(kind){ var p = prefs(); return SOURCES[p[kind]] ? p[kind] : (DEFAULTS[kind] || "icons"); }
  function setDefault(kind, src){ var p = prefs(); p[kind] = src; try{ localStorage.setItem(PREF, JSON.stringify(p)); }catch(e){} }
  /* the source a card's current picture came from, read from its credit */
  function sourceOfMeta(meta){
    var c = TB.creditOf ? TB.creditOf(meta) : "";
    if(/game-icons/i.test(c)) return "icons";
    if(/Wikimedia/i.test(c)) return "paintings";
    if(/Openverse/i.test(c)) return "openverse";
    return "";
  }

  /* ---------------- search words ---------------- */
  var STOP = ["the","of","a","an","and","or","to","in","on","with","for","minor","lesser","moderate","greater","major","true",
    "type","i","ii","iii","iv","v","+1","+2","+3","striking","rune","dedication","legacy","creature","item","spell","feat","hazard"];
  var SKIP_TRAITS = ["common","uncommon","rare","unique","tiny","small","medium","large","huge","gargantuan","magical",
    "consumable","invested","concentrate","manipulate","general","skill","archetype","class","cantrip","focus","trap",
    "lg","ng","cg","ln","n","cn","le","ne","ce"];
  function words(s){
    return String(s || "").toLowerCase().replace(/\([^)]*\)/g, " ").split(/[^a-z'-]+/)
      .map(function(x){ return x.replace(/^'+|'+$/g, ""); }).filter(function(x){ return x.length > 1 && STOP.indexOf(x) < 0; });
  }
  /* PF2e words → the words game-icons uses */
  var SYN = {fire:"fire flame burning", flame:"flame fire", cold:"ice frozen snowflake", ice:"ice frozen", electricity:"lightning electric",
    lightning:"lightning", acid:"acid", sonic:"sound", force:"energy", vitality:"heal heart", void:"death skull", healing:"heal heart",
    heal:"heal heart", potion:"potion flask", elixir:"flask potion", scroll:"scroll", wand:"wand", staff:"staff wizard",
    bomb:"bomb", poison:"poison vial", toxin:"poison", armor:"armor breastplate", shield:"shield", weapon:"sword", sword:"sword",
    longsword:"sword", shortsword:"sword", greatsword:"sword", rapier:"rapier", dagger:"dagger", dogslicer:"dagger", bow:"bow",
    shortbow:"bow", longbow:"bow", crossbow:"crossbow", axe:"axe", hammer:"hammer", spear:"spear", mace:"mace", whip:"whip",
    goblin:"goblin", kobold:"lizard", orc:"orc", dragon:"dragon", undead:"skull zombie", zombie:"zombie", skeleton:"skeleton",
    ghost:"ghost", ghoul:"ghoul", vampire:"vampire", humanoid:"person", beast:"beast wolf", animal:"paw", fiend:"devil demon",
    demon:"demon", devil:"devil", celestial:"angel", angel:"angel", construct:"robot golem", golem:"golem", elemental:"elemental",
    fey:"fairy", aberration:"tentacle", ooze:"slime", plant:"plant vine", fungus:"mushroom", spirit:"ghost", haunt:"ghost",
    mental:"brain", emotion:"heart brain", fear:"terror", illusion:"eye", detection:"eye", scrying:"crystal-ball eye",
    teleportation:"portal", light:"sun light", darkness:"moon", ring:"ring", amulet:"necklace", necklace:"necklace", cloak:"cape",
    boots:"boot", gloves:"gauntlet", gauntlets:"gauntlet", belt:"belt", helm:"helmet", hat:"hat", key:"key", book:"book",
    grimoire:"spell-book", tome:"book", lockpick:"lockpicks", rope:"rope", lantern:"lantern", torch:"torch", talisman:"amulet",
    rune:"rune", wolf:"wolf", bear:"bear", spider:"spider", snake:"snake", rat:"rat", bat:"bat", bird:"bird", eagle:"eagle",
    giant:"giant", troll:"troll", ogre:"ogre", pit:"hole pit", spikes:"spikes", blade:"blade", arrow:"arrow", dart:"dart",
    mist:"fog", fog:"fog", wind:"wind", water:"water drop", earth:"rock", air:"wind", metal:"metal", wood:"wood",
    summon:"magic portal", charm:"heart", sleep:"sleep", invisibility:"invisible", shield_:"shield", missile:"missile",
    gold:"coins", coin:"coins", gem:"gem", bag:"bag", chest:"chest", trap:"trap"};
  var KIND_FALLBACK = {item:"chest", feat:"skills", spell:"magic", init:"monster", hazard:"trap"};

  /* ---------------- icons ---------------- */
  var iconIndex = null;
  function loadIcons(){
    if(!iconIndex) iconIndex = fetch("data/game-icons.json").then(function(r){ if(!r.ok) throw new Error("icon list missing (" + r.status + ")"); return r.json(); })
      .then(function(j){
        var list = [];
        Object.keys(j.icons).forEach(function(a){ j.icons[a].split(" ").forEach(function(n){ if(n) list.push({a:a, n:n, t:n.split("-")}); }); });
        return {sha:j.sha, authors:j.authors, cc0:j.cc0 || [], list:list};
      })
      .catch(function(e){ iconIndex = null; throw e; });
    return iconIndex;
  }
  function iconUrl(ix, ic){ return "https://cdn.jsdelivr.net/gh/game-icons/icons@" + ix.sha + "/" + ic.a + "/" + ic.n + ".svg"; }
  function searchIcons(q, ctx){
    return loadIcons().then(function(ix){
      /* the card's name counts most, then its traits; a word also brings its synonyms at half weight */
      var weighted = [];
      var add = function(list, wt){
        list.forEach(function(x){
          weighted.push([x, wt]);
          (SYN[x] || "").split(" ").filter(Boolean).forEach(function(s){ s.split("-").forEach(function(p){ weighted.push([p, wt / 2]); }); });
          if(/s$/.test(x)) weighted.push([x.replace(/s$/, ""), wt]);
        });
      };
      add(words(q), 3);
      if(ctx && ctx.useTraits) add(ctx.traits || [], 1);
      var scored = [];
      ix.list.forEach(function(ic){
        var sc = 0;
        weighted.forEach(function(p){
          var x = p[0];
          for(var i = 0; i < ic.t.length; i++){
            var t = ic.t[i];
            if(t === x){ sc += p[1] * 2; break; }
            if(x.length >= 4 && t.length >= 4 && (t.indexOf(x) === 0 || x.indexOf(t) === 0)){ sc += p[1]; break; }
          }
        });
        if(sc > 0) scored.push({ic:ic, sc:sc - ic.t.length * 0.05});
      });
      scored.sort(function(a, b){ return b.sc - a.sc; });
      return scored.slice(0, 30).map(function(s){
        var ic = s.ic, who = ix.authors[ic.a] || ic.a, cc0 = ix.cc0.indexOf(ic.a) >= 0;
        return {thumb:iconUrl(ix, ic), full:iconUrl(ix, ic), title:ic.n.replace(/-/g, " "), svg:true,
                credit:"Icon by " + who + ", game-icons.net, " + (cc0 ? "CC0" : "CC BY 3.0"), page:"https://game-icons.net/"};
      });
    });
  }
  /* game-icons SVGs are a white icon on a black square: drop the square, draw the icon black on clear */
  function iconFile(url, name){
    return fetch(url).then(function(r){ if(!r.ok) throw new Error("icon " + r.status); return r.text(); }).then(function(svg){
      svg = svg.replace(/<path d="M0 0h512v512H0z"\s*\/>/, "").replace(/fill="#fff"/gi, 'fill="#000"')
        .replace(/<svg /, '<svg width="768" height="768" ');
      return new Promise(function(res, rej){
        var im = new Image();
        im.onload = function(){
          var cv = d.createElement("canvas"); cv.width = 768; cv.height = 768;
          cv.getContext("2d").drawImage(im, 0, 0, 768, 768);
          cv.toBlob(function(b){ b ? res(new File([b], name + ".png", {type:"image/png"})) : rej(new Error("couldn't draw the icon")); }, "image/png");
        };
        im.onerror = function(){ rej(new Error("couldn't read the icon")); };
        im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      });
    });
  }

  /* ---------------- Wikimedia Commons ---------------- */
  var OK_LICENSE = /^(pd|cc0|public domain|cc-?by-\d|cc by \d|cc-by$|attribution)/i;
  var NOT_OK = /sa|nc|nd|gfdl|fair use|non-?free/i;
  function strip(html){ var t = d.createElement("div"); t.innerHTML = String(html || ""); return (t.textContent || "").replace(/\s+/g, " ").trim(); }
  function commons(query){
    var u = "https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=30" +
      "&gsrsearch=" + encodeURIComponent(query) + "&prop=imageinfo&iiprop=url|extmetadata|mime&iiurlwidth=900" +
      "&iiextmetadatafilter=" + encodeURIComponent("LicenseShortName|License|Artist|ObjectName");
    return fetch(u).then(function(r){ if(!r.ok) throw new Error("Wikimedia answered " + r.status); return r.json(); }).then(function(j){
      var pages = j && j.query && j.query.pages ? Object.keys(j.query.pages).map(function(k){ return j.query.pages[k]; }) : [];
      pages.sort(function(a, b){ return (a.index || 0) - (b.index || 0); });
      return pages.map(function(p){
        var ii = p.imageinfo && p.imageinfo[0]; if(!ii || !/^image\/(jpeg|png|webp|gif)/.test(ii.mime || "")) return null;
        var md = ii.extmetadata || {}, lic = strip((md.LicenseShortName || {}).value || (md.License || {}).value || "");
        var code = strip((md.License || {}).value || "");
        if(!OK_LICENSE.test(code || lic) || NOT_OK.test(code) || NOT_OK.test(lic.replace(/public domain/i, ""))) return null;
        var who = strip((md.Artist || {}).value || "") || "Unknown artist";
        if(who.length > 60) who = who.slice(0, 57) + "...";
        var title = strip((md.ObjectName || {}).value || "") || p.title.replace(/^File:/, "").replace(/\.\w+$/, "");
        return {thumb:ii.thumburl || ii.url, full:ii.thumburl || ii.url, title:title, page:ii.descriptionurl,
                credit:who + ", via Wikimedia Commons, " + (/^pd|public domain/i.test(code || lic) ? "public domain" : lic)};
      }).filter(Boolean);
    });
  }
  function searchPaintings(q){
    /* public domain first (Commons' structured "copyright status: public domain"), then any free licence */
    return commons(q + " haswbstatement:P6216=Q19652 filetype:bitmap").then(function(list){
      if(list.length >= 6) return list;
      return commons(q + " filetype:bitmap").then(function(more){
        var seen = {}; list.forEach(function(x){ seen[x.full] = 1; });
        return list.concat(more.filter(function(x){ return !seen[x.full]; }));
      }, function(){ return list; });
    });
  }

  /* ---------------- Openverse ---------------- */
  var OV_LIC = {cc0:"CC0", pdm:"public domain", by:"CC BY"};
  function searchOpenverse(q){
    var u = "https://api.openverse.org/v1/images/?q=" + encodeURIComponent(q) + "&license=cc0,pdm,by&page_size=30&mature=false";
    return fetch(u).then(function(r){
      if(r.status === 429) throw new Error("Openverse is busy — wait a minute and try again");
      if(!r.ok) throw new Error("Openverse answered " + r.status);
      return r.json();
    }).then(function(j){
      return (j.results || []).map(function(x){
        var lic = (OV_LIC[x.license] || String(x.license || "").toUpperCase()) + (x.license === "by" && x.license_version ? " " + x.license_version : "");
        var who = x.creator ? String(x.creator).slice(0, 50) : "Unknown creator";
        return {thumb:x.thumbnail || x.url, full:x.thumbnail || x.url, alt:x.url, title:x.title || "", page:x.foreign_landing_url,
                credit:(x.title ? "“" + String(x.title).slice(0, 50) + "” by " : "") + who + ", " + lic + ", via Openverse"};
      });
    });
  }

  var SEARCH = {icons:searchIcons, paintings:searchPaintings, openverse:searchOpenverse};

  /* name first, then single words of it (longest first), then traits, then a word for the card type */
  function queries(ctx){
    var title = String(ctx.title || "").replace(/\([^)]*\)/g, "").trim(), out = [];
    var wds = words(title).sort(function(a, b){ return b.length - a.length; });
    if(title) out.push(title);
    wds.forEach(function(x){ if(out.indexOf(x) < 0 && x !== title.toLowerCase()) out.push(x); });
    (ctx.traits || []).map(function(t){ return String(t).toLowerCase(); }).filter(function(t){ return SKIP_TRAITS.indexOf(t) < 0; })
      .forEach(function(t){ if(out.indexOf(t) < 0) out.push(t); });
    if(KIND_FALLBACK[ctx.kind]) out.push(KIND_FALLBACK[ctx.kind]);
    return out;
  }
  function find(src, ctx, typed){
    if(src === "icons"){
      /* icons are matched locally, so the name and the traits go in together */
      var q = typed || ctx.title || "";
      return searchIcons(q, {useTraits:!typed, traits:ctx.traits}).then(function(list){
        return list.length ? {q:q, list:list} : searchIcons(KIND_FALLBACK[ctx.kind] || "magic", {}).then(function(l2){ return {q:KIND_FALLBACK[ctx.kind], list:l2}; });
      });
    }
    var qs = typed ? [typed] : queries(ctx), i = 0, best = null;
    var next = function(){
      if(i >= qs.length || i >= 5) return Promise.resolve(best || {q:qs[0] || "", list:[]});
      var q = qs[i++];
      return SEARCH[src](q).then(function(list){
        if(!best || list.length > best.list.length) best = {q:q, list:list};
        return list.length >= 4 ? {q:q, list:list} : next();
      });
    };
    return next();
  }

  /* ---------------- the finder dialog ---------------- */
  function css(){
    if(d.getElementById("tb-pic-css")) return;
    var s = d.createElement("style"); s.id = "tb-pic-css";
    s.textContent =
      ".tb-pic{position:fixed;z-index:60;inset:5vh 0 auto;margin:0 auto;width:min(720px,calc(100% - 24px));max-height:90vh;display:flex;flex-direction:column;" +
        "background:var(--paper,#fff);color:var(--ink,#111);border:1px solid var(--rule,#ccc);border-radius:4px;box-shadow:0 18px 50px rgba(0,0,0,.3);font-size:15px}" +
      ".tb-pic[hidden],.tb-pic-scrim[hidden]{display:none!important}" +
      ".tb-pic-scrim{position:fixed;inset:0;z-index:59;background:rgba(0,0,0,.3)}" +
      ".tb-pic header{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;padding:.8rem .9rem .6rem;border-bottom:1px solid var(--rule,#ccc)}" +
      ".tb-pic h3{margin:0 .4rem 0 0;font-family:var(--serif,Georgia,serif);font-size:1.15rem}" +
      ".tb-pic .grow{flex:1 1 1rem}" +
      ".tb-pic .row{display:flex;gap:.4rem;width:100%}" +
      ".tb-pic input[type=search]{flex:1 1 auto;min-width:0;font:inherit;padding:.4rem .55rem;border:1px solid var(--rule,#ccc);border-radius:2px;background:var(--chip,#fff);color:inherit}" +
      ".tb-pic .srcs{display:flex;flex-wrap:wrap;gap:0;border:1px solid var(--rule,#ccc);border-radius:2px;overflow:hidden}" +
      ".tb-pic .srcs button{font:inherit;font-size:.88rem;padding:.35rem .7rem;border:0;border-right:1px solid var(--rule,#ccc);background:transparent;color:inherit;cursor:pointer}" +
      ".tb-pic .srcs button:last-child{border-right:0}" +
      ".tb-pic .srcs button[aria-pressed=true]{background:var(--accent,#333);color:var(--on-accent,#fff)}" +
      ".tb-pic .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:.5rem;padding:.8rem .9rem;overflow:auto;min-height:8rem}" +
      ".tb-pic .grid button{position:relative;display:block;aspect-ratio:1;padding:4px;border:1px solid var(--rule,#ccc);border-radius:3px;background:#fff;cursor:pointer;overflow:hidden}" +
      ".tb-pic .grid button:hover,.tb-pic .grid button:focus-visible{outline:2px solid var(--accent,#333);outline-offset:1px}" +
      ".tb-pic .grid img{width:100%;height:100%;object-fit:contain;display:block}" +
      ".tb-pic .grid img.inv{filter:invert(1)}" +
      ".tb-pic .grid .cap{position:absolute;left:0;right:0;bottom:0;padding:1px 4px;font-size:10px;line-height:1.3;color:#333;background:rgba(255,255,255,.85);" +
        "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left}" +
      ".tb-pic .msg{grid-column:1/-1;color:var(--ink-2,#555);font-style:italic;padding:1rem 0}" +
      ".tb-pic footer{display:flex;flex-wrap:wrap;gap:.5rem .8rem;align-items:center;padding:.6rem .9rem .8rem;border-top:1px solid var(--rule,#ccc);font-size:.85rem;color:var(--ink-2,#555)}" +
      ".tb-pic footer select{font:inherit;padding:.2rem .3rem;border:1px solid var(--rule,#ccc);background:var(--paper,#fff);color:var(--ink,#111)}" +
      ".tb-pic .btn{font:inherit}" +
      ".ph-find{position:absolute;left:4px;bottom:4px;z-index:3;font:600 11px/1 var(--caps,system-ui,sans-serif);letter-spacing:.04em;padding:4px 7px;" +
        "border:1px solid var(--rule,#999);border-radius:2px;background:var(--paper,#fff);color:var(--ink,#111);cursor:pointer;opacity:.92}" +
      ".ph-find:hover{opacity:1;outline:1px solid var(--accent,#333)}" +
      "@media print{.ph-find,.tb-pic,.tb-pic-scrim{display:none!important}}";
    d.head.appendChild(s);
  }

  var hook = null, box = null, scrim = null, cur = "icons", ctx = null, busy = 0;
  function build(){
    css();
    scrim = d.createElement("div"); scrim.className = "tb-pic-scrim"; scrim.hidden = true;
    box = d.createElement("section"); box.className = "tb-pic"; box.hidden = true;
    box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Find a picture");
    box.innerHTML =
      "<header><h3>Find a picture</h3><div class=\"srcs\" role=\"group\" aria-label=\"Where to look\"></div><span class=\"grow\"></span>" +
        "<button class=\"btn\" type=\"button\" data-x>Close</button>" +
        "<form class=\"row\"><input type=\"search\" aria-label=\"Search for\" placeholder=\"Search for…\"><button class=\"btn solid\" type=\"submit\">Search</button></form></header>" +
      "<div class=\"grid\" aria-live=\"polite\"></div>" +
      "<footer><span class=\"note\"></span><span class=\"grow\"></span>" +
        "<label>Default for " + esc(KINDS[hook.kind] || "this tool") + " <select aria-label=\"Default picture source\"></select></label></footer>";
    d.body.appendChild(scrim); d.body.appendChild(box);
    var srcs = box.querySelector(".srcs"), sel = box.querySelector("footer select");
    Object.keys(SOURCES).forEach(function(k){
      var b = d.createElement("button"); b.type = "button"; b.dataset.src = k; b.textContent = SOURCES[k].label; b.title = SOURCES[k].long;
      b.addEventListener("click", function(){ cur = k; run(box.querySelector("input").value.trim() === (ctx && ctx.title) ? "" : box.querySelector("input").value.trim()); });
      srcs.appendChild(b);
      var o = d.createElement("option"); o.value = k; o.textContent = SOURCES[k].label; sel.appendChild(o);
    });
    sel.addEventListener("change", function(){ setDefault(hook.kind, sel.value); });
    box.querySelector("[data-x]").addEventListener("click", close);
    scrim.addEventListener("click", close);
    box.querySelector("form").addEventListener("submit", function(e){ e.preventDefault(); run(box.querySelector("input").value.trim()); });
    d.addEventListener("keydown", function(e){ if(e.key === "Escape" && !box.hidden) close(); });
    box.querySelector(".grid").addEventListener("click", function(e){
      var b = e.target.closest("button[data-i]"); if(!b) return;
      pick(lastList[+b.dataset.i], b);
    });
  }
  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"]/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); }
  var lastList = [];
  function open(){
    if(!hook) return;
    if(!box) build();
    ctx = {title:hook.title ? hook.title() : "", traits:hook.traits ? hook.traits() : [], kind:hook.kind};
    /* this card's own source wins over the type's default */
    cur = sourceOfMeta(hook.meta ? hook.meta() : "") || defaultFor(hook.kind);
    box.querySelector("footer select").value = defaultFor(hook.kind);
    box.querySelector("input").value = ctx.title;
    box.hidden = false; scrim.hidden = false;
    run("");
  }
  function close(){ if(box){ box.hidden = true; scrim.hidden = true; } }
  function run(typed){
    var my = ++busy, grid = box.querySelector(".grid");
    box.querySelectorAll(".srcs button").forEach(function(b){ b.setAttribute("aria-pressed", b.dataset.src === cur ? "true" : "false"); });
    box.querySelector(".note").textContent = SOURCES[cur].note;
    grid.innerHTML = "<p class=\"msg\">Looking" + (typed || ctx.title ? " for “" + esc(typed || ctx.title) + "”" : "") + "…</p>";
    if(!typed && !ctx.title && !(ctx.traits || []).length){ grid.innerHTML = "<p class=\"msg\">Give the card a name first, or type what to look for above.</p>"; return; }
    find(cur, ctx, typed).then(function(res){
      if(my !== busy) return;
      lastList = res.list;
      if(!res.list.length){ grid.innerHTML = "<p class=\"msg\">Nothing found. Try another word, or another source.</p>"; return; }
      if(!typed && res.q && res.q !== ctx.title) box.querySelector("input").value = res.q;
      grid.innerHTML = res.list.map(function(x, i){
        return "<button type=\"button\" data-i=\"" + i + "\" title=\"" + esc(x.title + " — " + x.credit) + "\">" +
          "<img alt=\"" + esc(x.title) + "\" loading=\"lazy\" referrerpolicy=\"no-referrer\"" + (x.svg ? " class=\"inv\"" : "") + " src=\"" + esc(x.thumb) + "\">" +
          "<span class=\"cap\">" + esc(x.title) + "</span></button>";
      }).join("");
    }).catch(function(e){
      if(my !== busy) return;
      grid.innerHTML = "<p class=\"msg\">Couldn't search " + esc(SOURCES[cur].long) + ": " + esc(e && e.message || e) + "</p>";
    });
  }
  function pick(x, btn){
    if(!x) return;
    btn.style.opacity = ".5";
    var name = (ctx.title || "picture").replace(/[^\w-]+/g, "-").slice(0, 40);
    var got = x.svg ? iconFile(x.full, name) :
      fetch(x.full, {referrerPolicy:"no-referrer"}).then(function(r){ if(!r.ok) throw new Error(r.status); return r.blob(); })
        .catch(function(e){ if(x.alt && x.alt !== x.full) return fetch(x.alt).then(function(r){ if(!r.ok) throw e; return r.blob(); }); throw e; })
        .then(function(b){ return new File([b], name + "." + ((b.type.split("/")[1] || "jpg").replace("jpeg", "jpg")), {type:b.type || "image/jpeg"}); });
    got.then(function(file){
      /* icons are already clean-edged on clear; leave them as they are */
      hook.load(file, {credit:x.credit, bg:x.svg ? false : undefined});
      close();
    }).catch(function(){
      btn.style.opacity = "";
      box.querySelector(".note").textContent = "That picture's site won't hand it over to other pages. Pick another one.";
    });
  }

  TB.pictures = {
    SOURCES:SOURCES, KINDS:KINDS, DEFAULTS:DEFAULTS, defaultFor:defaultFor, setDefault:setDefault, open:open,
    /* {load(file, {credit, bg}), title(), traits(), meta(), anchor: the photo box or the Choose button} */
    register:function(h){
      hook = h; hook.kind = h.kind || TB.tool || "item";
      css();
      var a = h.anchor; if(!a) return;
      var b = d.createElement("button"); b.type = "button";
      b.textContent = "Find picture"; b.dataset.tip = "Search free pictures by this card's name: icons, classic paintings, or Openverse.";
      if(a.classList && a.classList.contains("photo")){
        b.className = "ph-find screen-only";
        b.addEventListener("click", function(e){ e.stopPropagation(); e.preventDefault(); open(); });
        a.appendChild(b);
        /* the photo box hides on a filled card with no picture, so the toolbar gets one too */
        var nb = d.getElementById("newCard");
        if(nb){
          var t = d.createElement("button"); t.type = "button"; t.className = "btn"; t.id = "findPic";
          t.textContent = "Picture"; t.dataset.tip = b.dataset.tip;
          t.addEventListener("click", open);
          nb.parentNode.insertBefore(t, nb);
        }
      }else{
        b.className = "btn";
        b.addEventListener("click", open);
        a.parentNode.insertBefore(b, a.nextSibling);
      }
    }
  };
})(window, document);
