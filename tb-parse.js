/* tb-parse.js — one reader for anything pasted from Archives of Nethys (or Demiplane, or a PDF).
   Load after toolbag-core.js. The artifact builds inline it.

   TB.parse(text) reads ANY Pathfinder 2e entry into one full record and keeps the original text:
     {raw, text, type, kind, name, level, cost, traits[], rarity, legacy,
      source:{book, page, text}, license:"ORC"|"OGL"|"", fields:{Label:value…}, body:[lines], tool}
   type is creature | hazard | item | spell | feat | "" (unknown); kind is the word the entry used
   (Creature, Cantrip, Focus, Ritual…). Each card tool then takes only the fields it prints — the
   record is the same whichever tool reads it, so the paste box works as a filter, not a form.

   TB.cleanPaste(text)    the text every tool's own parser reads: odd spaces and invisible
                          characters gone, site chrome above the title line dropped.
   TB.toolFor(type)       {tool, page, label} for a record type.
   TB.offerRoute(el, rec, here)
                          when a paste belongs to another tool, says so in el with a button
                          that carries the paste across (TB.handoff); returns true if it did.
   TB.handoff.send(text, page) / TB.handoff.take(tool)
                          one paste carried from one page to another (localStorage, 10 minutes).
   TB.licenseOf(book, legacy)  "ORC" for Remaster books, "OGL" for pre-Remaster ones, "" unknown. */
(function(w){
  "use strict";
  var TB = w.TB = w.TB || {};

  /* ---------------- which tool prints what ---------------- */
  var TOOLS = {
    creature:{tool:"init",   page:"initiative-cards.html", label:"Initiative Cards", noun:"creature"},
    hazard:  {tool:"hazard", page:"hazard-cards.html",     label:"Hazard Cards",     noun:"hazard"},
    item:    {tool:"item",   page:"item-cards.html",       label:"Item Cards",       noun:"item"},
    spell:   {tool:"spell",  page:"spell-cards.html",      label:"Spell Cards",      noun:"spell"},
    feat:    {tool:"feat",   page:"feat-cards.html",       label:"Feat Cards",       noun:"feat"}
  };
  TB.toolFor = function(type){ return TOOLS[type] || null; };
  var KIND_TYPE = {creature:"creature", npc:"creature", hazard:"hazard", item:"item", spell:"spell",
                   cantrip:"spell", focus:"spell", ritual:"spell", feat:"feat"};

  /* ---------------- licence by source book ----------------
     Remaster books are published under the ORC License; the books before the Remaster under the
     OGL 1.0a. Archives of Nethys marks the old ones "Legacy Content". Setting books (Lost Omens,
     Adventure Paths) carry Paizo's Reserved Material either way — rules text only. */
  /* Only books we're sure of. Anything else comes back "" and the card says "check the book's
     licence page" rather than guessing. Add titles here as they're confirmed. */
  var ORC_BOOKS = ["player core", "player core 2", "gm core", "monster core", "monster core 2", "npc core",
    "rage of elements", "howl of the wild", "war of immortals", "battlecry!", "battlecry"];
  var OGL_BOOKS = ["core rulebook", "bestiary", "bestiary 2", "bestiary 3", "advanced player's guide",
    "gamemastery guide", "secrets of magic", "guns & gears", "guns and gears", "dark archive",
    "book of the dead", "treasure vault", "lost omens world guide",
    "lost omens character guide", "lost omens gods & magic", "lost omens ancestry guide",
    "lost omens pathfinder society guide", "lost omens the mwangi expanse", "lost omens absalom",
    "lost omens monsters of myth", "lost omens firebrands", "lost omens highhelm", "lost omens impossible lands",
    "lost omens knights of lastwall", "lost omens travel guide", "lost omens grand bazaar", "lost omens legends"];
  TB.licenseOf = function(book, legacy){
    var b = String(book || "").toLowerCase().replace(/^pathfinder\s+/, "").replace(/\s+/g, " ").trim();
    if(legacy) return "OGL";
    if(!b) return "";
    if(ORC_BOOKS.indexOf(b) >= 0 || ORC_BOOKS.indexOf("pathfinder " + b) >= 0) return "ORC";
    if(OGL_BOOKS.indexOf(b) >= 0) return "OGL";
    if(/^bestiary\b|core rulebook|advanced player/.test(b)) return "OGL";
    if(/^(player|gm|monster|npc) core\b/.test(b)) return "ORC";
    return "";
  };
  /* What the licence asks for in a printed product. Copied once onto each printed sheet. */
  TB.ORC_NOTICE = "This product is licensed under the ORC License located at the Library of Congress at TX 9-307-067 " +
    "and available online at various locations including paizo.com/orclicense, azoralaw.com/orclicense, and others. " +
    "All warranties are disclaimed as set forth therein.";

  /* ---------------- cleaning a paste ---------------- */
  var TYPE_WORDS = "Creature|NPC|Hazard|Item|Spell|Cantrip|Focus|Ritual|Feat";
  var TITLE = new RegExp("^(.*?)\\s*\\b(" + TYPE_WORDS + ")\\s+(-?\\d+)\\+?\\s*$", "i");
  var TYPE_ONLY = new RegExp("^(" + TYPE_WORDS + ")\\s+(-?\\d+)\\+?$", "i");
  /* lines the sites put around an entry that are never part of it */
  var CHROME = /^(may contain spoilers|legacy content|remastered|there is a (?:remastered|legacy) version.*|click here.*|pfs note.*|note from .*|sort by.*|archives of nethys|demiplane|log ?in|sign ?in|share|print|bookmark|menu|search|home|skip to .*)$/i;

  TB.cleanPaste = function(text){
    var t = String(text || "")
      .replace(/\r\n?/g, "\n")
      .replace(/[     ]/g, " ")      /* odd spaces */
      .replace(/[​-‍﻿­]/g, "")           /* invisible characters */
      .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
      .replace(/\t/g, " ");
    var lines = t.split("\n").map(function(l){ return l.replace(/ {2,}/g, " ").trim(); });
    /* drop what comes before the title line (breadcrumbs, search boxes, notices) */
    var at = titleIndex(lines);
    if(at > 0){
      var keep = TYPE_ONLY.test(lines[at]) ? at - 1 : at;
      while(keep > 0 && !lines[keep]) keep--;
      lines = lines.slice(Math.max(0, keep));
    }
    return lines.filter(function(l, i, a){ return !(l === "" && a[i - 1] === ""); }).join("\n").trim();
  };
  function titleIndex(lines){
    for(var i = 0; i < lines.length; i++){
      if(TITLE.test(lines[i]) && !/^(heightened|source|level|type)\b/i.test(lines[i])){
        var m = TITLE.exec(lines[i]);
        /* "Spell 3" alone on a line belongs to the name above it */
        if(!m[1].trim() && i > 0) return i;
        return i;
      }
    }
    return -1;
  }

  /* ---------------- labelled lines ---------------- */
  var LABELS = ["Source","Traditions","Tradition","Cast","Range","Area","Targets","Target","Defense","Saving Throw",
    "Duration","Trigger","Requirements","Requirement","Prerequisites","Prerequisite","Frequency","Access","Price",
    "Usage","Bulk","Activate","Effect","Hands","Damage","Category","Group","Ammunition","Craft Requirements",
    "Perception","Languages","Skills","Items","AC","HP","Speed","Stealth","Disable","Routine","Reset","Cost",
    "Primary Check","Secondary Casters","Secondary Checks","Special","Type","Level","Hardness","Strength",
    "Check Penalty","Speed Penalty","Dex Cap","Spell List","Deities","Deity","Domain","Lesson","Mystery",
    "Patron Theme","Bloodline","Archetype","Mythic","Onset","Stage 1","Maximum Duration","Immunities","Weaknesses",
    "Resistances","Str","Recall Knowledge","Complexity","Description"];
  LABELS.sort(function(a, b){ return b.length - a.length; });
  function labelOf(piece){
    var low = piece.toLowerCase();
    for(var i = 0; i < LABELS.length; i++){
      var k = LABELS[i].toLowerCase();
      if(low === k || low.indexOf(k + " ") === 0 || low.indexOf(k + ":") === 0 || low.indexOf(k + "—") === 0)
        return {label:LABELS[i], rest:piece.slice(k.length).replace(/^\s*[:—–-]?\s*/, "").trim()};
    }
    return null;
  }

  /* ---------------- the full record ---------------- */
  TB.parse = function(text){
    var raw = String(text || "");
    var clean = TB.cleanPaste(raw);
    var lines = clean.split("\n").map(function(l){ return l.trim(); }).filter(Boolean);
    var rec = {raw:raw, text:clean, type:"", kind:"", name:"", level:"", cost:"", traits:[], rarity:"",
               legacy:/legacy content|\(legacy\)/i.test(raw), source:{book:"", page:"", text:""}, license:"",
               fields:{}, body:[], tool:null};
    if(!lines.length) return rec;

    /* the title line */
    var i = 0, m = TITLE.exec(lines[0]);
    if(!m && lines[1] && TYPE_ONLY.test(lines[1])){ var tw = lines[1].split(/\s+/); m = [null, lines[0], tw[0], tw[1]]; i = 1; }
    if(m){
      rec.kind = cap(m[2].toLowerCase() === "npc" ? "Creature" : m[2].toLowerCase());
      rec.type = KIND_TYPE[m[2].toLowerCase()] || "";
      rec.level = m[3];
      var title = m[1].trim();
      var ct = /\s*(\[(?:one-action|two-actions|three-actions|reaction|free-action|1-action|2-actions|3-actions)\]|[◆◇⬲]+)\s*/i.exec(title);
      if(ct){ rec.cost = costOf(ct[1]); title = title.replace(ct[0], " ").trim(); }
      rec.name = title;
      i++;
    }else if(!labelOf(lines[0])){
      rec.name = lines[0]; i = 1;
    }
    if(rec.name && rec.name === rec.name.toUpperCase() && /[A-Z]/.test(rec.name)) rec.name = titleCase(rec.name.toLowerCase());

    /* the trait line: short, no label, no sentence punctuation */
    if(lines[i] && !labelOf(lines[i]) && lines[i].split(/[\s,]+/).length <= 10 && !/[.;:]$/.test(lines[i]) && !/\d/.test(lines[i].replace(/\b\d+(st|nd|rd|th)\b/g, ""))){
      rec.traits = splitTraits(lines[i]); i++;
    }
    rec.traits.forEach(function(t){ if(/^(uncommon|rare|unique)$/i.test(t)) rec.rarity = t.toLowerCase(); });

    /* everything else: labelled pieces into fields, the rest into body */
    for(; i < lines.length; i++){
      var l = lines[i], parts = l.split(/;\s+/), first = labelOf(parts[0]);
      if(first && first.label !== "Description"){
        parts.forEach(function(p){
          var L = labelOf(p);
          if(L) put(rec.fields, L.label, L.rest);
          else if(first) put(rec.fields, first.label, p);   /* "Range 30 feet; Targets 1 creature" vs "AC 16; Fort +5" */
        });
        /* saves ride on the AC line as "Fort +5, Ref +7, Will +3" */
        var sv = /\bFort\w*\s+([+-]\s*\d+).*?\bRef\w*\s+([+-]\s*\d+).*?\bWill\s+([+-]\s*\d+)/i.exec(l);
        if(sv){ rec.fields.Fort = sv[1].replace(/\s/g, ""); rec.fields.Ref = sv[2].replace(/\s/g, ""); rec.fields.Will = sv[3].replace(/\s/g, ""); }
        continue;
      }
      if(first && first.label === "Description"){ if(first.rest) rec.body.push(first.rest); continue; }
      rec.body.push(l);
    }

    /* source: "Source Player Core pg. 330 2.0", "Source: Player Core, pg. 330" */
    var src = rec.fields.Source || "";
    if(!src){ var sl = /(?:^|\n)\s*Source:?\s+([^\n]+)/i.exec(clean); if(sl) src = sl[1]; }
    if(src){
      var sm = /^(.+?)[,\s]+(?:pg\.?|p\.|page)\s*(\d+)/i.exec(src);
      rec.source.book = (sm ? sm[1] : src.split(/[,;]/)[0]).replace(/\s+\d+(\.\d+)?$/, "").trim();
      rec.source.page = sm ? sm[2] : "";
      rec.source.text = rec.source.book + (rec.source.page ? " p. " + rec.source.page : "");
    }
    rec.license = TB.licenseOf(rec.source.book, rec.legacy);

    /* no title line: guess the type from what's there */
    if(!rec.type){
      var F = rec.fields;
      if(F.AC && F.HP && F.Perception) rec.type = "creature";
      else if(F.Stealth && (F.Disable || F.Routine || F.Reset)) rec.type = "hazard";
      else if(F.Traditions || F.Tradition || (F.Cast && (F.Range || F.Area || F.Targets || F.Duration || F.Defense))) rec.type = "spell";
      else if(F.Price || F.Bulk || F.Usage || F.Activate) rec.type = "item";
      else if(F.Prerequisites || F.Prerequisite || F.Archetype) rec.type = "feat";
    }
    /* a hazard's statblock reads like a creature's (AC, HP) but has Stealth DC and Disable */
    if(rec.type === "creature" && rec.fields.Disable && !rec.fields.Perception) rec.type = "hazard";
    rec.tool = TOOLS[rec.type] || null;
    return rec;
  };

  function put(f, k, v){ v = String(v || "").trim(); if(!v && f[k] !== undefined) return; f[k] = f[k] ? f[k] + "; " + v : v; }
  function cap(s){ s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); }
  function titleCase(s){ return String(s || "").replace(/\b([a-z])/g, function(c){ return c.toUpperCase(); }).replace(/\b(Of|The|A|An|And|In|On|To|With|For)\b/g, function(x, y, o){ return o ? x.toLowerCase() : x; }); }
  function costOf(tok){
    tok = String(tok || "").toLowerCase();
    if(/three|3-|◆◆◆/.test(tok)) return "a3";
    if(/two|2-|◆◆/.test(tok)) return "a2";
    if(/one|1-|◆/.test(tok)) return "a1";
    if(/reaction|⬲/.test(tok)) return "ar";
    if(/free|◇/.test(tok)) return "af";
    return "";
  }
  TB.costOf = costOf;
  /* "Consumable Healing Magical Potion" or "Concentrate, Fire, Manipulate" → words; two-word traits kept */
  var TWO_WORD = ["class archetype", "additive 1", "additive 2", "additive 3", "true neutral", "lawful good",
    "lawful neutral", "lawful evil", "neutral good", "neutral evil", "chaotic good", "chaotic neutral",
    "chaotic evil", "bottled breath", "critical fusion", "double barrel", "fatal aim", "free-hand",
    "ranged trip", "shield throw", "two-hand"];
  function splitTraits(line){
    if(/,/.test(line)) return line.split(",").map(function(t){ return cap(t.trim()); }).filter(Boolean);
    var wds = line.split(/\s+/).filter(Boolean), out = [];
    for(var i = 0; i < wds.length; i++){
      var two = (wds[i] + " " + (wds[i + 1] || "")).toLowerCase();
      if(wds[i + 1] && (TWO_WORD.indexOf(two) >= 0 || /^(versatile|deadly|fatal|thrown|reach|volley|jousting|capacity|scatter|two-hand|range increment|additive|entrench|unarmed)$/i.test(wds[i]) && /^(\d+|[bps]|d\d+|[\d-]+ft\.?)$/i.test(wds[i + 1]))){
        out.push(cap(wds[i]) + " " + wds[i + 1]); i++;
      }else out.push(cap(wds[i]));
    }
    return out;
  }
  TB.splitTraitWords = splitTraits;

  /* ---------------- carrying a paste to the tool that prints it ---------------- */
  var HK = "tb-handoff";
  TB.handoff = {
    send: function(text, page){
      try{ localStorage.setItem(HK, JSON.stringify({text:String(text || ""), at:Date.now()})); }catch(e){}
      w.location.href = page + "#import";
    },
    take: function(){
      if(!/#import\b/.test(w.location.hash || "")) return "";
      var v = null;
      try{ v = JSON.parse(localStorage.getItem(HK) || "null"); localStorage.removeItem(HK); }catch(e){}
      try{ history.replaceState(null, "", w.location.pathname + w.location.search); }catch(e){}
      return v && v.text && Date.now() - (v.at || 0) < 10 * 60 * 1000 ? v.text : "";
    }
  };
  /* A paste that belongs to another tool: say which, and offer to take it there. */
  TB.offerRoute = function(el, rec, here){
    if(!el || !rec || !rec.tool || rec.tool.tool === here) return false;
    el.innerHTML = "";
    el.appendChild(document.createTextNode("This looks like a" + (/^[aeiou]/.test(rec.tool.noun) ? "n " : " ") + rec.tool.noun +
      (rec.name ? " (" + rec.name + ")" : "") + ", not something this tool prints. "));
    var b = document.createElement("button");
    b.type = "button"; b.className = "btn solid"; b.textContent = "Open it in " + rec.tool.label;
    b.addEventListener("click", function(){ TB.handoff.send(rec.raw, rec.tool.page); });
    el.appendChild(b);
    return true;
  };

  /* ---------------- picture credits and the licence notice on printed sheets ----------------
     A picture found with the picture finder carries its credit in the card's imageMeta, after
     " · Credit: ". CC BY pictures need that credit wherever the card is printed, so each PDF page
     lists the credits of the cards on it, and the last page carries the ORC notice. */
  TB.creditOf = function(meta){
    var m = /(?:^|·)\s*Credit:\s*(.+)$/.exec(String(meta || ""));
    return m ? m[1].trim() : "";
  };
  /* pages: one array of card records (or imageMeta strings) per PDF page, in order.
     o: {top, bottom, left, width} in pt (every tool builds its PDF in pt), the free strip under the cards. */
  TB.pdfFooters = function(pdf, pages, o){
    try{
      var n = pdf.getNumberOfPages();
      for(var p = 1; p <= n; p++){
        var metas = (pages[p - 1] || []).map(function(c){ return typeof c === "string" ? c : (c && (c.imageMeta || "")) || ""; });
        var credits = [], seen = {};
        metas.forEach(function(m){ var c = TB.creditOf(m); if(c && !seen[c]){ seen[c] = 1; credits.push(c); } });
        var parts = [];
        if(credits.length) parts.push("Pictures: " + credits.join("; ") + ".");
        if(p === n) parts.push("Rules text © Paizo Inc., from the books named on each card. " + TB.ORC_NOTICE +
          " Pre-Remaster (legacy) material is used under the Open Game License 1.0a.");
        if(!parts.length) continue;
        pdf.setPage(p);
        pdf.setFont("helvetica", "normal"); pdf.setFontSize(5.5); pdf.setTextColor(110, 110, 110);
        var lh = 6.4, lines = pdf.splitTextToSize(parts.join(" "), o.width);
        var room = Math.max(1, Math.floor((o.bottom - o.top) / lh));
        if(lines.length > room){ lines = lines.slice(0, room); lines[room - 1] = lines[room - 1].replace(/.{0,3}$/, "..."); }
        lines.forEach(function(l, i){ pdf.text(l, o.left, o.top + lh * (i + 0.8)); });
      }
      pdf.setPage(n); pdf.setTextColor(0, 0, 0);
    }catch(e){ if(w.console) console.warn("pdf footer", e); }
  };


  /* ---------------- the filters: one full record → one kind of card ----------------
     The card tools pass in what only they know (their trait spellings and order); everything
     about reading the paste lives here, so a fix reaches the home page, the tool and Next Session. */
  TB.cards = TB.cards || {};
  function itemCategory(rec){
    var has = function(t){ return rec.traits.some(function(x){ return x.toLowerCase() === t; }); };
    var F = rec.fields, use = String(F.Usage || "").toLowerCase();
    if(has("artifact")) return "Artifacts";
    if(has("cursed")) return "Cursed Items";
    if(has("intelligent")) return "Intelligent Items";
    if(has("relic")) return "Relics";
    if(has("staff")) return "Staves";
    if(has("wand")) return "Wands";
    if(has("tattoo")) return "Tattoos";
    if(has("grimoire")) return "Grimoires";
    if(has("spellheart")) return "Spellhearts";
    if(has("snare")) return "Snares";
    if(has("apex")) return "Apex Items";
    if(has("alchemical") && (has("consumable") || has("bomb") || has("elixir") || has("mutagen") || has("poison"))) return "Alchemical Items";
    if(has("consumable") || has("potion") || has("scroll") || has("talisman") || has("oil") || has("ammunition")) return "Consumables";
    if(/etched onto|applied to/.test(use) || has("rune")) return "Runes";
    if(F.Hardness) return "Shields";
    if(F.Strength || F["Dex Cap"] || F["Check Penalty"]) return "Armor";
    if(F.Damage || F.Group || F.Hands) return "Weapons";
    if(/^worn/.test(use)) return "Worn Items";
    if(/^held|^carried/.test(use)) return "Held Items";
    return "";
  }
  var ACT_RE = /^Activate\b\s*(?:[—–-]\s*([^\[(◆◇⬲]+?))?\s*(\[[a-z0-9-]+\]|[◆◇⬲]+|\d+\s+(?:minutes?|hours?|days?|rounds?))?\s*(?:\(([^)]*)\))?\s*(.*)$/i;
  TB.cards.item = function(rec, h){
    h = h || {};
    var canonTrait = h.canonTrait || cap, orderTraits = h.orderTraits || function(a){ return a; };
    var ATRAITS = h.actionTraits || [], ATYPES = h.actionTypes || ["a1","a2","a3","ar","af"];
    var d = {name:rec.name, traits:orderTraits(rec.traits.map(canonTrait)), cat:itemCategory(rec), c:{}, chg:0, used:[],
             imgW:120, imgAr:1, passiveOn:true, actions:[], description:"", passive:"", value:"", note:""};
    var F = rec.fields;
    d.value = F.Price || "";
    var use = (F.Usage || "").replace(/\s*;.*$/, "");
    d.note = [rec.level !== "" ? "item " + rec.level : "", use].filter(Boolean).join(" · ");
    /* the body: the write-up, then activations (each gathers the lines under it), then variants */
    var desc = [], passive = [], cur = null;
    var lines = rec.text.split("\n").map(function(l){ return l.trim(); });
    /* Activate lines were labelled pieces; walk the text again so they keep their order */
    var start = lines.findIndex(function(l){ return /^(Price|Usage|Bulk|Source|Access)\b/i.test(l); });
    var bodyLines = lines.slice(start < 0 ? 1 : start).filter(function(l){
      return l && !/^(Source|Price|Usage|Bulk|Access|Hands|Damage|Category|Group|Ammunition|Strength|Check Penalty|Speed Penalty|Dex Cap|Hardness|Craft Requirements)\b/i.test(l) && l !== rec.traits.join(" ");
    });
    bodyLines.forEach(function(l){
      var m = ACT_RE.exec(l);
      if(m){
        var cost = TB.costOf(m[2] || "");
        var tr = String(m[3] || "").split(",").map(function(t){ return t.trim().toLowerCase(); }).filter(Boolean);
        var keep = tr.filter(function(t){ return ATRAITS.indexOf(t) >= 0; }), rest = tr.filter(function(t){ return ATRAITS.indexOf(t) < 0; });
        var lead = (m[1] ? m[1].trim() + " — " : "") + (!cost && m[2] ? m[2].trim() + ". " : "") + (rest.length ? "(" + rest.join(", ") + ") " : "");
        cur = {type:ATYPES.indexOf(cost) >= 0 ? cost : "", text:(lead + (m[4] || "")).trim(), range:"", traits:keep};
        d.actions.push(cur); return;
      }
      /* only the activation's own labelled lines belong to it; a plain paragraph after an
         Activate line is the item's write-up (that's how Archives of Nethys lays out potions) */
      if(cur && /^(Frequency|Trigger|Requirements|Effect|Critical Success|Success|Failure|Critical Failure)\b/.test(l)){ cur.text += (cur.text ? "\n" : "") + l; return; }
      cur = null;
      if(/^Type\b/i.test(l)){ passive.push(l.replace(/^Type\s+/i, "")); return; }
      (desc.length ? passive : desc).push(l);
    });
    /* AoN puts the look and the effect in one paragraph: the first goes on the card's Description */
    d.description = desc.join("\n");
    d.passive = passive.join("\n");
    d.actions.forEach(function(a){ var r = /\bRange\s+([^;.]+)/.exec(a.text); if(r) a.range = r[1].trim(); });
    return d;
  };

  TB.cards.hazard = function(text, h){
    h = h || {};
    var isTrait = h.isTrait || function(){ return false; }, traitName = h.traitName || function(w){ return titleCase(w); };
    var t = String(text || "").replace(/\r/g, "").replace(/[–−]/g, "-");
    var lines = t.split("\n").map(function(l){ return l.trim(); }).filter(Boolean);
    var out = {actions:[]}, li = -1, m;
    /* "Hazard 3" on its own line under the name (Demiplane, the books), or "Hidden Pit Hazard 0" on one
       line (Archives of Nethys) */
    for(var i = 0; i < lines.length; i++){ if((m = /^(.*?)\s*\bHazard\s+(-?\d+)\s*$/i.exec(lines[i]))){ li = i; out.level = m[2]; if(m[1].trim()) out.name = m[1].trim(); break; } }
    if(li > 0 && !out.name) out.name = lines[li - 1];
    var typeLine = "";
    if(li >= 0 && lines[li + 1] && !/^(Source\b|Complexity\b|Stealth\b|Disable\b|AC\s+\d|Description\b)/i.test(lines[li + 1])) typeLine = lines[li + 1];
    var cLine = lines.filter(function(l){ return /^Complexity\s+/i.test(l); })[0];
    var complexity = cLine ? cLine.replace(/^Complexity\s+/i, "").trim() : "";
    /* the trait line(s) under "Hazard N": when every word is a trait we know, they go on the trait
       line rather than the kicker; Complex / Simple stay with the kicker as the complexity */
    out.traits = [];
    for(var k = li + 1; li >= 0 && k < lines.length; k++){
      var words = lines[k].split(/[\s,]+/).filter(Boolean);
      if(!words.length || !words.every(function(w){ return isTrait(w) || /^(complex|simple|common)$/i.test(w); })) break;
      words.forEach(function(w){
        if(/^(complex|simple)$/i.test(w)){ if(!complexity) complexity = titleCase(w); }
        else if(!/^common$/i.test(w)) out.traits.push(traitName(w));
      });
      if(k === li + 1) typeLine = "";
    }
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
    /* the HP line, which may start with the part's name ("Trapdoor HP 12 (BT 6); Immunities …");
       the defences stop at the end of their line */
    var hpLine = lines.filter(function(l){ return /^HP\s+\d+/i.test(l); })[0] || lines.filter(function(l){ return /\bHP\s+\d+/.test(l) && /Immunities|Resistances|Weaknesses/i.test(l); })[0] || flat;
    [["immune", /Immunities\s+([^;\n]+?)(?:,?\s*(?:Resistances|Weaknesses)\b|$)/im],
     ["resist", /Resistances\s+([^;\n]+?)(?:,?\s*(?:Immunities|Weaknesses)\b|$)/im],
     ["weak", /Weaknesses\s+([^;\n]+?)(?:,?\s*(?:Immunities|Resistances)\b|$)/im]].forEach(function(q){
      var mm = q[1].exec(hpLine); if(mm) out[q[0]] = abbr(mm[1]);
    });
    var costMap = {"reaction":"reaction","free action":"free","one action":"1","two actions":"2","three actions":"3","single action":"1",
                   "free-action":"free","one-action":"1","two-actions":"2","three-actions":"3","1-action":"1","2-actions":"2","3-actions":"3"};
    var actionRe = /^(.*?)\s*\[([^\]]+)\]\s*(?:\(([^)]+)\)\s*)?(.*)$/;
    lines.forEach(function(l){
      var mm = actionRe.exec(l); if(!mm) return;
      var key = mm[2].trim().toLowerCase(); if(!(key in costMap)) return;
      var traits = mm[3] ? mm[3].split(",").map(function(s){ return s.trim().toLowerCase(); }).filter(Boolean) : [];
      var rest = mm[4].trim(), trigger = "", effect = rest;
      /* "Trigger …; Effect …" (books) or "Trigger …. Effect …" (Archives of Nethys) */
      var tm = /^Trigger\s+(.*?)[;.]?\s+Effect\s+(.*)$/is.exec(rest);
      if(tm){ trigger = tm[1].trim(); effect = tm[2].trim(); }
      else{
        var tm2 = /^Trigger\s+(.*)$/is.exec(rest);
        if(tm2){ trigger = tm2[1].trim(); effect = ""; }
        else{ var em = /^Effect\s+(.*)$/is.exec(rest); if(em) effect = em[1].trim(); }
      }
      out.actions.push({name:mm[1].trim(), cost:costMap[key], traits:traits, trigger:trigger, effect:effect});
    });
    return out;
  };

  /* ---------------- the source line printed on a card ---------------- */
  TB.sourceLine = function(rec){
    if(!rec || !rec.source || !rec.source.book) return "";
    return rec.source.book + (rec.source.page ? " p. " + rec.source.page : "");
  };
})(window);
