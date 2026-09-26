/* Slappybag's Toolbag — cloud library.
   A third library mode beside "this device" (localStorage) and the claude.ai artifact db: cards live in
   Firestore under users/{uid}/{kind}/{id}, art in Storage under users/{uid}/{kind}/{id}, Google sign-in.
   Signed out, nothing here runs and the page keeps its local library. Site pages only (not the artifact).

   The page calls Cloud.init({kind, mount, onCards, onStatus}) once:
     kind      "creatures" | "items" — the collection, also the per-user counter checked by the rules
     mount     element that receives the sign-in / sign-out button
     onCards   called with the synced array on every change, or null when signed out (→ go local)
     onStatus  called with a short HTML string for the status line
   Then Cloud.save(id, data), Cloud.remove(id), Cloud.upload(id, blob) → url, Cloud.removeArt(id), Cloud.full().

   The free cap (Cloud.LIMITS) is enforced in firestore.rules by per-user counters written in the same
   batch as the card; the check here is only to give a friendly message before the rules refuse. */
window.Cloud = (function(){
  var SDK = "https://www.gstatic.com/firebasejs/10.14.1/";
  var PARTS = ["firebase-app-compat.js", "firebase-auth-compat.js", "firebase-firestore-compat.js", "firebase-storage-compat.js"];
  var LIMITS = {free:4, pro:500};

  var C = {LIMITS:LIMITS, user:null, plan:"free", count:0, kind:"", cards:[], available:!!window.FIREBASE_CONFIG};
  var opts = {}, db = null, store = null, auth = null, unsubUser = null, unsubCards = null, btn = null;

  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function status(html){ if(opts.onStatus) opts.onStatus(html); }
  function limit(){ return LIMITS[C.plan] || LIMITS.free; }
  function userRef(){ return db.collection("users").doc(C.user.uid); }
  function cardRef(id){ return userRef().collection(C.kind).doc(id); }
  function artRef(id){ return store.ref("users/" + C.user.uid + "/" + C.kind + "/" + id); }

  function loadScript(src){
    return new Promise(function(res, rej){
      var s = document.createElement("script"); s.src = src; s.async = false;
      s.onload = res; s.onerror = function(){ rej(new Error("could not load " + src)); };
      document.head.appendChild(s);
    });
  }
  function loadSdk(){
    if(window.firebase && firebase.firestore) return Promise.resolve();
    return PARTS.reduce(function(p, f){ return p.then(function(){ return loadScript(SDK + f); }); }, Promise.resolve());
  }

  /* ---- the button in the toolbar ---- */
  function renderButton(){
    if(!btn) return;
    if(C.user){
      var name = C.user.displayName || C.user.email || "Signed in";
      btn.innerHTML = "<span class=\"who\">" + esc(name) + "</span> &middot; Sign out";
      btn.title = "Signed in as " + (C.user.email || name) + ". Sign out to go back to this device's library.";
    }else{
      btn.textContent = "Sign in to sync";
      btn.title = "Keep your library in the cloud and open it on any device";
    }
    btn.disabled = false;
  }
  function onClick(){
    btn.disabled = true;
    if(C.user){ auth.signOut().catch(function(){ btn.disabled = false; }); return; }
    var provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(function(e){
      if(e && (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment")) return auth.signInWithRedirect(provider);
      btn.disabled = false;
      if(!e || e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request") return;
      status("Sign-in failed: <b>" + esc(e.code || e.message) + "</b>");
    });
  }

  /* ---- per-user record: plan + counters, created on first sign-in ---- */
  function ensureUser(u){
    var ref = userRef();
    return ref.get().then(function(snap){
      if(snap.exists) return;
      return ref.set({plan:"free", creatures:0, items:0, last_creatures:"", last_items:"",
                      email:u.email || "", createdAt:new Date().toISOString()});
    });
  }
  function watch(){
    unsubUser = userRef().onSnapshot(function(snap){
      var d = snap.data() || {};
      C.plan = d.plan || "free"; C.count = d[C.kind] || 0;
      status("Library: <b>synced</b> &middot; " + C.count + "/" + limit() + (C.plan === "pro" ? " &middot; pro" : ""));
    }, function(e){ status("Library: <b>sync lost</b> &mdash; " + esc(e.code)); });
    unsubCards = userRef().collection(C.kind).onSnapshot(function(snap){
      C.cards = snap.docs.map(function(s){ var d = Object.assign({}, s.data()); d.id = s.id; return d; });
      if(opts.onCards) opts.onCards(C.cards);
    }, function(e){ status("Library: <b>sync lost</b> &mdash; " + esc(e.code)); });
  }
  function unwatch(){
    if(unsubUser) unsubUser(); if(unsubCards) unsubCards();
    unsubUser = unsubCards = null; C.cards = []; C.count = 0; C.plan = "free";
  }

  C.init = function(o){
    opts = o || {}; C.kind = opts.kind;
    if(!C.available) return false;
    if(opts.mount){
      btn = document.createElement("button"); btn.type = "button"; btn.className = "btn account"; btn.disabled = true;
      btn.textContent = "Sign in to sync"; btn.addEventListener("click", onClick);
      opts.mount.appendChild(btn);
    }
    loadSdk().then(function(){
      if(!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
      auth = firebase.auth(); db = firebase.firestore(); store = firebase.storage();
      auth.onAuthStateChanged(function(u){
        unwatch();
        C.user = u || null;
        renderButton();
        if(!u){ if(opts.onCards) opts.onCards(null); return; }
        status("Library: <b>connecting</b>&hellip;");
        ensureUser(u).then(watch, function(e){ status("Library: <b>sign-in ok, sync failed</b> &mdash; " + esc(e.code || e.message)); });
      });
    }).catch(function(e){
      if(btn) btn.hidden = true;
      console.error("cloud", e);
    });
    return true;
  };

  C.full = function(){ return C.count >= limit(); };
  C.fullMessage = function(){
    var what = C.kind === "items" ? "items" : "creatures";
    return "Your synced library is full (" + limit() + " " + what + "). Delete one to make room" +
           (C.plan === "free" ? ", or sign out to keep more on this device." : ".");
  };

  /* A card create or delete and its counter move, in one batch — the rules insist on it. The counter is
     written as a plain number (what the rules compare), so a stale count from another tab is refused;
     one re-read and retry covers that before we call the library full. */
  function step(id, card, dir, retried){
    var b = db.batch(), u = {}; u[C.kind] = C.count + dir; u["last_" + C.kind] = id;
    if(card) b.set(cardRef(id), card); else b.delete(cardRef(id));
    b.update(userRef(), u);
    return b.commit().catch(function(e){
      if(!e || e.code !== "permission-denied") throw e;
      return userRef().get().then(function(snap){
        var d = snap.data() || {}; C.plan = d.plan || "free"; C.count = d[C.kind] || 0;
        if(!retried && (dir < 0 || !C.full())) return step(id, card, dir, true);
        throw new Error(dir > 0 ? C.fullMessage() : "Delete refused (" + e.code + ")");
      });
    });
  }
  C.save = function(id, data){
    if(!C.user) return Promise.reject(new Error("not signed in"));
    var exists = C.cards.some(function(c){ return c.id === id; });
    var card = Object.assign({}, data); delete card.id;
    if(exists) return cardRef(id).set(card);
    if(C.full()) return Promise.reject(new Error(C.fullMessage()));
    return step(id, card, +1);
  };
  C.remove = function(id){
    if(!C.user) return Promise.reject(new Error("not signed in"));
    return step(id, null, -1).then(function(){ C.removeArt(id); });
  };

  /* One picture per card, stored at the card's id; returns the URL the card keeps. */
  C.upload = function(id, blob){
    if(!C.user) return Promise.reject(new Error("not signed in"));
    var ref = artRef(id);
    return ref.put(blob, {contentType:blob.type || "image/png", cacheControl:"public, max-age=31536000"})
      .then(function(){ return ref.getDownloadURL(); });
  };
  C.removeArt = function(id){
    if(!C.user) return Promise.resolve();
    return artRef(id).delete().catch(function(){});
  };

  return C;
})();
