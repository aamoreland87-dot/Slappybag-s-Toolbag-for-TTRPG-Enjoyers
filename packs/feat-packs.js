/* Card packs for the Feat Cards tool: ready-made feats a user adds to their library in one go.
   Each entry's `text` is the feat in the shape the Import box reads ("Name [cost] Feat N", traits,
   labelled lines, paragraphs, "Special …"), so parseFeat builds the card; the other keys (tier,
   areaSize/areaShape, save/saveBasic, damage, related, note, page) fill the structured fields.
   Ids are fixed ("pk-<pack>-<slug>"), so adding a pack again updates those cards instead of
   making copies, and leaves the user's own cards alone.

   Upgraded versions are whole cards: the feat as it reads once the upgrade is gained, with a
   tier label. Same name + different tier = one stack in the Library.

   Text: Gatewalkers Player's Guide © 2022 Paizo Inc. (Open Game Content under OGL 1.0a).
   Printed typos fixed: "sweep trails" → traits, "bone spears" → spikes, "A enemy" → An enemy.
   The awakening names in the tiers ("Eye Beams", "Venom Grooves"…) are ours; the book leaves them unnamed. */
(function(){
  /* Backlash, short: the check is the same for every deviation, the effects differ by classification. */
  var BL = {
    dragon:{k:"Backlash", text:"Energetic Meltdown. Mild: damage = your level. Moderate: weakness to your energy (1/3 level). Severe: 1d6/level to all within 30 ft (basic Fort; you take full)."},
    troll:{k:"Backlash", text:"Strained Metabolism. Mild: enfeebled 1, clumsy 1 until you eat. Moderate: also fatigued until a full meal. Severe: sickened 2, fatigued until you rest."},
    wraith:{k:"Backlash", text:"Encroaching Presence. Mild: frightened 3. Moderate: everyone concealed to you, 10 min. Severe: doomed 1, drained 2 until daily preparations."}
  };
  var CHECK = {k:"Note", text:"DC 5 flat check each use (+5 per success, max 20); fail = backlash. Severe ends uses for the day."};
  var DRAGON_TYPE = {k:"Note", text:"Damage type: cold, electricity, fire, or sonic, chosen when you gain the deviation."};
  var rel = function(cls, lvl, awakened){
    var out = [BL[cls]];
    if(!awakened){ out.push(CHECK); if(cls === "dragon") out.push(DRAGON_TYPE); out.push({k:"Leads to", text:(lvl <= 4 ? "Awakened Power" : "Greater Awakened Power") + ": one Awakening (stacked behind this card)."}); }
    else out.push({k:"Follows", text:lvl <= 4 ? "Awakened Power" : "Greater Awakened Power"});
    return out;
  };

  var E = [];
  var add = function(o){ E.push(o); };

  /* ---------------- universal ---------------- */
  add({slug:"awakened-power", page:9, related:[{k:"Leads to", text:"Greater Awakened Power at 10th level"}, {k:"Note", text:"Each awakening is its own card, stacked under its feat in the Library: print the one you picked."}], text:
`Awakened Power Feat 4
Rare, Deviant
Your power spontaneously evolves or reconfigures itself. You gain one awakening benefit for a deviant feat of 4th level or lower.
Special You can take this feat multiple times. Each time you do, choose a different deviant feat of 4th level or lower, and gain one of its awakening benefits.`});

  add({slug:"greater-awakened-power", page:9, related:[{k:"Follows", text:"Awakened Power"}, {k:"Note", text:"Each awakening is its own card, stacked under its feat in the Library: print the one you picked."}], text:
`Greater Awakened Power Feat 10
Rare, Deviant
Your power undergoes yet another awakening. You gain one awakening benefit for a deviant feat of 10th level or lower.
Special You can take this feat multiple times. Each time you do, choose a different deviant feat of 10th level or lower, and gain one of its awakening benefits.`});

  /* ---------------- dragon ---------------- */
  var BB_HEAD = "Blasting Beams [one-action] Feat 2\nRare, Attack, Deviant, Evocation, Magical\n";
  var BB_BASE = "A directed beam of heat or an arc of lightning is one of the simplest ways to project energy. You fire a blast or beam from one hand. Make an attack roll against a creature within 30 feet. If you succeed, the beam deals 1d6 damage for every 2 levels you have to the target, or double damage on a critical success.";
  add({slug:"blasting-beams", note:"Dragon", page:9, damage:"1d6 per 2 levels", related:rel("dragon", 2), text:
BB_HEAD + "Requirements You have a free hand.\n" + BB_BASE});
  add({slug:"blasting-beams-a1", note:"Dragon", page:9, tier:"Awakened: Piercing Beam", areaSize:"60-foot", areaShape:"line", save:"Reflex", saveBasic:true, damage:"1d6 per 2 levels", related:rel("dragon", 2, true), text:
BB_HEAD + "Requirements You have a free hand.\n" + BB_BASE + "\nYour beams blast through targets. Instead of making an attack roll against a single creature, you can use Blasting Beams as a 2-action activity to damage all creatures in a 60-foot line, with a basic Reflex save."});
  add({slug:"blasting-beams-a2", note:"Dragon", page:9, tier:"Awakened: Eye Beams", damage:"1d6 per 2 levels (d4s from the eyes)", related:rel("dragon", 2, true), text:
BB_HEAD + "Requirements You have a free hand, or your eyes are uncovered.\n" + BB_BASE + "\nYou can choose to launch smaller, quicker beams from your eyes instead. These deal d4s instead of d6s, but the attack has the agile trait, and you don't need a hand free to make it, though your eyes must be uncovered."});

  var CE_HEAD = "Consume Energy [reaction] Feat 2\nRare, Abjuration, Deviant, Magical\nTrigger An enemy within 60 feet uses an ability that has the trait corresponding to your deviation damage type.\n";
  var CE_BASE = "Your connection to energy is so much stronger than the offending display in front of you, allowing you to claim it for yourself. Attempt a counteract check against the triggering effect as you draw it into your body. If you successfully counteract the ability, you gain temporary Hit Points equal to double the counteract level of the ability, which last for 1 minute.";
  add({slug:"consume-energy", note:"Dragon", page:9, related:rel("dragon", 2), text:CE_HEAD + CE_BASE});
  add({slug:"consume-energy-a1", note:"Dragon", page:9, tier:"Awakened: Empowering", related:rel("dragon", 2, true), text:
CE_HEAD + CE_BASE + "\nThe energy you consume helps empower your abilities. The next ability from the dragon classification that you use increases its range by 30 feet if it has a range, or increases its area by 10 feet if it's a cone or line. If you don't use this benefit within 1 minute, it fades."});
  add({slug:"consume-energy-a2", note:"Dragon", page:9, tier:"Awakened: Charged Strikes", damage:"+1d6 of the consumed energy", related:rel("dragon", 2, true), text:
CE_HEAD + CE_BASE + "\nYou channel some of the seized energy into your next attack. Choose one of your weapons or unarmed attacks. Until the end of your next turn, Strikes with the chosen weapon or unarmed attack deal an additional 1d6 damage of a type matching the energy you consumed."});

  var SB_HEAD = "Storming Breath [two-actions] Feat 6\nRare, Deviant, Evocation, Magical\n";
  var SB_BASE = "You spit out a freezing breath or sonic scream. You deal 4d6 damage, plus 1d6 damage for every level you have beyond 6th, to all creatures in a 30-foot cone, with a basic Reflex save.";
  var SB = {areaSize:"30-foot", areaShape:"cone", save:"Reflex", saveBasic:true, damage:"4d6 +1d6 per level above 6th"};
  add(Object.assign({slug:"storming-breath", note:"Dragon", page:9, related:rel("dragon", 6), text:SB_HEAD + SB_BASE}, SB));
  add(Object.assign({slug:"storming-breath-a1", note:"Dragon", page:9, tier:"Awakened: Battering", related:rel("dragon", 6, true), text:
SB_HEAD + SB_BASE + "\nYour blast powerfully batters your foes. A creature that critically fails its save is knocked prone."}, SB));
  add(Object.assign({slug:"storming-breath-a2", note:"Dragon", page:9, tier:"Awakened: Recoil", related:rel("dragon", 6, true), text:
SB_HEAD + SB_BASE + "\nThe kickback of your blast helps you make a speedy escape. When you use this ability, you Fly backward 15 feet in a straight line directly opposite your blast. This movement doesn't trigger reactions based on movement."}, SB));

  var PL_HEAD = "Propulsive Leap [one-action] Feat 10\nRare, Deviant, Evocation, Magical\n";
  var PL_BASE = "By expelling flames from your feet or levitating through electrical repulsion, you propel yourself through the air. For 1 minute, you gain a fly Speed equal to your Speed or 20 feet, whichever is greater. If you aren't on solid ground at the end of your turn, you must attempt another backlash check for your deviation, though you remain airborne even if you fail your check unless the damage from the check renders you unconscious.";
  add({slug:"propulsive-leap", note:"Dragon", page:9, related:rel("dragon", 10), text:PL_HEAD + PL_BASE});
  add({slug:"propulsive-leap-a1", note:"Dragon", page:10, tier:"Awakened: Swift Flight", related:rel("dragon", 10, true), text:
PL_HEAD + PL_BASE + "\nYou blast through the air at great speed, gaining a +15-foot status bonus to your fly Speed from Propulsive Leap."});
  add({slug:"propulsive-leap-a2", note:"Dragon", page:10, tier:"Awakened: Blast-Off", save:"Reflex", saveBasic:true, damage:"1d4 per 2 levels, adjacent creatures", related:rel("dragon", 10, true), text:
PL_HEAD + PL_BASE + "\nYou can use your propulsion as a makeshift weapon. The first time each round you Fly starting from the ground, all creatures adjacent to you take 1d4 damage for every 2 levels you have, with a basic Reflex save."});

  /* ---------------- troll ---------------- */
  var BS_HEAD = "Bone Spikes [one-action] Feat 2\nRare, Deviant, Evocation, Magical\n";
  var BS_BASE = "Sharp shards of bone tear forth from your elbows, wrists, or other parts of your body. For 1 minute, you can make bone spike unarmed Strikes, which deal 1d6 piercing damage and have the versatile S and sweep traits. When you take the Bone Spikes action, you can choose one weapon on your person and duplicate its weapon runes onto your bone spikes (with the exception of any runes that couldn't apply to the bone spikes).";
  add({slug:"bone-spikes", note:"Troll", page:10, damage:"1d6 piercing", related:rel("troll", 2), text:BS_HEAD + BS_BASE});
  add({slug:"bone-spikes-a1", note:"Troll", page:10, tier:"Awakened: Lashing Spikes", damage:"1d6 piercing", related:rel("troll", 2, true), text:
BS_HEAD + BS_BASE + "\nYour bones grow longer, lashing flexibly at range. While you have bone spikes, you can Interact to give your bone spikes reach 10 feet until the end of the current turn."});
  add({slug:"bone-spikes-a2", note:"Troll", page:10, tier:"Awakened: Venom Grooves", damage:"1d6 piercing + 1d4 persistent poison", related:rel("troll", 2, true), text:
BS_HEAD + BS_BASE + "\nGrooves in your bone spikes form a channel for venom. Your bone spikes deal 1d4 persistent poison damage, which increases to 2d4 at 10th level and 3d4 at 18th level."});

  var TS_HEAD = "Titan Swing [two-actions] Feat 2\nRare, Deviant, Magical, Transmutation\n";
  var TS_BASE = "Your limbs tense as you deliver a mighty swing. Make a melee Strike. If it hits, you deal an extra die of weapon damage and push the target back by 5 feet. If you're at least 10th level, increase this to two extra dice and push the target by 10 feet, and if you're at least 18th level, increase it to three extra dice and push the target by 15 feet.";
  add({slug:"titan-swing", note:"Troll", page:10, damage:"+1 weapon die (2 at 10th, 3 at 18th)", related:rel("troll", 2), text:TS_HEAD + TS_BASE});
  add({slug:"titan-swing-a1", note:"Troll", page:10, tier:"Awakened: Toppling", damage:"+1 weapon die (2 at 10th, 3 at 18th)", related:rel("troll", 2, true), text:
TS_HEAD + TS_BASE + "\nOn a critical hit, you push the target back double the normal distance and knock it prone."});
  add({slug:"titan-swing-a2", note:"Troll", page:10, tier:"Awakened: Rending", damage:"+1 weapon die and 1d6 persistent bleed", related:rel("troll", 2, true), text:
TS_HEAD + TS_BASE + "\nOn a hit, you also deal 1d6 persistent bleed damage. This increases to 2d6 at 10th level and 3d6 at 18th level."});

  var HR_TRAITS = "Rare, Deviant, Healing, Magical, Necromancy\n";
  var HR_BASE = "Your wounds knit together with barely a thought. You regain Hit Points equal to double your level. When you gain this deviation, the GM secretly selects one type of energy damage or precious material, such as fire or cold iron. When you take damage of that type, your wound smokes until the end of your next turn, preventing you from using High-Speed Regeneration.";
  add({slug:"high-speed-regeneration", note:"Troll", page:10, related:rel("troll", 6), text:
"High-Speed Regeneration [free-action] Feat 6\n" + HR_TRAITS + "Trigger Your turn begins.\n" + HR_BASE});
  add({slug:"high-speed-regeneration-a1", note:"Troll", page:10, tier:"Awakened: Last Stand", related:rel("troll", 6, true), text:
"High-Speed Regeneration [free-action] Feat 6\n" + HR_TRAITS + "Trigger Your turn begins; or, once per day, your Hit Points would be reduced to 0.\n" + HR_BASE + "\nYour regeneration can automatically save you from the brink of death. Once per day, you can use High-Speed Regeneration when your Hit Points would be reduced to 0 instead of the usual trigger. You avoid being knocked out and remain at the number of HP you regained."});
  add({slug:"high-speed-regeneration-a2", note:"Troll", page:10, tier:"Awakened: Invigorating", related:rel("troll", 6, true), text:
"High-Speed Regeneration [free-action] Feat 6\n" + HR_TRAITS + "Trigger Your turn begins.\n" + HR_BASE + "\nRegrowth invigorates you. When you regain Hit Points this way, you also gain a +10-foot status bonus to your Speed until the end of your turn."});

  var TK_HEAD = "Tectonic Stomp [two-actions] Feat 10\nRare, Deviant, Evocation, Magical\n";
  var TK_BASE = "You cause minor tremors that topple your enemies. All creatures in a 30-foot emanation who are standing on the ground take 1d6 bludgeoning damage for every 2 levels you have, with a basic Reflex save. A creature that fails its save also falls prone.";
  var TK = {areaSize:"30-foot", areaShape:"emanation", save:"Reflex", saveBasic:true, damage:"1d6 bludgeoning per 2 levels"};
  add(Object.assign({slug:"tectonic-stomp", note:"Troll", page:10, related:rel("troll", 10), text:TK_HEAD + TK_BASE}, TK));
  add(Object.assign({slug:"tectonic-stomp-a1", note:"Troll", page:10, tier:"Awakened: Upheaval", related:rel("troll", 10, true), text:
TK_HEAD + TK_BASE + "\nYour stomp also ejects large fragments from the ground. You raise up to three stone chunks in unoccupied squares in the emanation; they can't be adjacent to one another. The chunks are 5 feet tall, block movement, and are large enough to Take Cover behind. They have AC 10, Hardness 8, and Hit Points equal to your level, and are immune to critical hits and precision damage. A chunk crumbles at 0 Hit Points, and all of them crumble after 1 minute or when you use Tectonic Stomp again."}, TK));
  add(Object.assign({slug:"tectonic-stomp-a2", note:"Troll", page:10, tier:"Awakened: Rattling", related:rel("troll", 10, true), text:
TK_HEAD + TK_BASE + " A creature that critically fails its save is also stunned 1."}, TK));

  /* ---------------- wraith ---------------- */
  var EF_HEAD = "Eerie Flicker [reaction] Feat 2\nRare, Conjuration, Deviant, Magical\nTrigger An enemy's Strike would hit you and you weren't already concealed, hidden, or undetected by that enemy.\n";
  var EF_BASE = "Your body flickers momentarily into the Ethereal Plane. You become concealed for 1 round, and the flat check for concealment applies to the Strike that would have hit you. If the flat check fails, the Strike misses you.";
  add({slug:"eerie-flicker", note:"Wraith", page:11, related:rel("wraith", 2), text:EF_HEAD + EF_BASE});
  add({slug:"eerie-flicker-a1", note:"Wraith", page:11, tier:"Awakened: Terrifying Form", related:rel("wraith", 2, true), text:
EF_HEAD + EF_BASE + "\nWhen your body flickers, you momentarily assume a terrifying form. If a creature fails the flat check against concealment from your Eerie Flicker, it becomes frightened 1, and it doesn't reduce the frightened condition from this effect at the end of the same turn it gained the condition."});
  add({slug:"eerie-flicker-a2", note:"Wraith", page:11, tier:"Awakened: Compressed Flicker", related:rel("wraith", 2, true), text:
EF_HEAD + EF_BASE + "\nYou can choose to compress your flickering movement into a single moment instead. If you do, the flat check for concealment against the triggering attack increases to DC 9, but the concealment affects only the triggering Strike."});

  var GG_HEAD = "Ghostly Grasp [one-action] Feat 2\nRare, Deviant, Evocation, Magical\n";
  var GG_BASE = "An invisible arm extends from you to grab and manipulate objects. The arm reaches up to 15 feet, grabs an unattended object of 1 Bulk or less, and immediately deposits it in one of your free hands or at your feet. Alternatively, it reaches up to 15 feet and performs a simple Interact action like pushing open a window, though it can't perform actions that require significant mechanical dexterity. For every 5 levels you have, the amount the hand can lift increases by 1 Bulk, and the arm's range increases by 15 feet. Being ghostly, the arm can affect ghosts, spirits, and other incorporeal entities, though in most cases, you need an awakening for this to be useful.";
  add({slug:"ghostly-grasp", note:"Wraith", page:11, related:rel("wraith", 2), text:GG_HEAD + GG_BASE});
  add({slug:"ghostly-grasp-a1", note:"Wraith", page:11, tier:"Awakened: Grabbing Hand", related:rel("wraith", 2, true), text:
GG_HEAD + GG_BASE + "\nYour invisible arm can grab on to an unsuspecting target. You can instead target 1 creature within range: make an attack roll against its Fortitude DC, and the action gains the attack trait. On a success, the target is grabbed by the arm (restrained on a critical success) for 1 round or until it Escapes."});
  add({slug:"ghostly-grasp-a2", note:"Wraith", page:11, tier:"Awakened: Shoving Hands", related:rel("wraith", 2, true), text:
GG_HEAD + GG_BASE + "\nYou summon additional ghostly arms that entwine together to push targets. You can instead target 1 creature within range: make an attack roll against its Fortitude DC, and the action gains the attack trait. On a success, you move the target 5 feet in any direction (10 feet on a critical success)."});

  var EW_HEAD = "Enervating Wail [two-actions] Feat 6\nRare, Auditory, Deviant, Magical, Necromancy\n";
  var EW_BASE = "You release a terrible wail that tears at the spirits of all nearby. All living creatures in a 20-foot emanation take negative damage with a basic Fortitude save. The damage is 4d6, plus 1d6 for every level you have beyond 6th.";
  var EW = {areaSize:"20-foot", areaShape:"emanation", save:"Fortitude", saveBasic:true, damage:"4d6 negative +1d6 per level above 6th"};
  add(Object.assign({slug:"enervating-wail", note:"Wraith", page:11, related:rel("wraith", 6), text:EW_HEAD + EW_BASE}, EW));
  add(Object.assign({slug:"enervating-wail-a1", note:"Wraith", page:11, tier:"Awakened: Psychic Wail", damage:"4d6 negative or mental +1d6 per level above 6th", related:rel("wraith", 6, true), text:
EW_HEAD + EW_BASE + "\nYour scream echoes in the mind. You can choose to emit a silent psychic wail instead, which changes the damage type to mental, changes the save to a Will save, removes the auditory trait, and adds the mental trait."}, EW, {damage:"4d6 negative or mental +1d6 per level above 6th"}));
  add(Object.assign({slug:"enervating-wail-a2", note:"Wraith", page:11, tier:"Awakened: Sapping Wail", related:rel("wraith", 6, true), text:
EW_HEAD + EW_BASE + "\nYour wail saps your foes' strength. Living creatures in the area are also enfeebled 1 for 1 round on a success (but not a critical success), enfeebled 1 for 1 minute on a failure, and enfeebled 2 for 1 minute on a critical failure."}, EW));

  var DW_HEAD = "Distant Wandering [one-action] Feat 10\nRare, Deviant, Evocation, Magical\n";
  var DW_BASE = "Your body falls unconscious and your spirit projects out of it. While in spirit form, you can't consciously move your body, and you are invisible and inaudible, though a creature still might notice the signs of your presence and passing, just like for an invisible creature affected by silence, or a prying eye. You can freely move about, though you can't touch or move anything, cast spells, attack, or otherwise affect anything around you. Despite your ghostly form, you are not incorporeal and can't pass through barriers you couldn't in your body. Most effects can't harm your spirit form, though some spells, like spirit blast and spirit song, explicitly damage a creature's spirit.\nYou can return to your body as a free action. If you are in spirit form at the beginning of your turn, you must attempt another backlash check for your deviation, returning to your body if you fail.";
  add({slug:"distant-wandering", note:"Wraith", page:11, related:rel("wraith", 10), text:DW_HEAD + DW_BASE});
  add({slug:"distant-wandering-a1", note:"Wraith", page:12, tier:"Awakened: Swift Spirit", related:rel("wraith", 10, true), text:
DW_HEAD + DW_BASE + "\nYour spirit moves at the speed of thought. You gain a fly Speed and a +20-foot status bonus to your Speed while in spirit form."});
  add({slug:"distant-wandering-a2", note:"Wraith", page:12, tier:"Awakened: Slowed Time", related:rel("wraith", 10, true), text:
DW_HEAD + DW_BASE + "\nTime seems to pass more slowly while you are projecting your spirit. When you enter spirit form, you can Recall Knowledge or Seek. You are quickened while in spirit form and can use the extra action only to Recall Knowledge or Seek."});

  (window.TB_PACKS = window.TB_PACKS || {}).feat = (window.TB_PACKS.feat || []).concat([{
    id: "gw-deviant",
    name: "Gatewalkers — Deviant feats",
    source: "Gatewalkers Player's Guide",
    blurb: "All 14 deviant feats (the two Awakened Power feats, then the dragon, troll and wraith classifications), plus each Awakening as its own upgraded card, stacked under its feat. Backlash is on every card.",
    entries: E
  }]);
})();
