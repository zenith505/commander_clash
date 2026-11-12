// Lane B round B181: Winter, Cursed Rider ("Exile X artifact cards from your graveyard" with no {X} to pay), Shackles of
// Treachery (a granted "destroy target Equipment attached to it"), Cosmium Confluence ("a Cave you control ... It becomes a
// 0/0 Elemental creature with haste. It's still a land."), Silver Surfer, Galactus's Herald ("until the end of your next
// turn, target creature attacks that player each combat if able"), The Five Doctors (up to five cards from library and/or
// graveyard, kicked onto the battlefield), Qasali Ambusher (free and as though it had flash while attacked) and
// Michelangelo's Technique ("up to two creature cards with total mana value 6 or less").

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup } from "./helpers";
import { botActions, castProblem, characteristics, compileCard, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real card data (Scryfall).
const winter = (): CardDef => ({"oracleId":"343833c1-19fd-4e8f-b82e-0f20903caaff","name":"Winter, Cursed Rider","manaCost":"{U}{B}","cmc":2,"typeLine":"Legendary Creature — Human Warlock","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Warlock"],"oracleText":"Ward—Pay 2 life.\nArtifacts you control have \"Ward—Pay 2 life.\"\nExhaust — {2}{U}{B}, {T}, Exile X artifact cards from your graveyard: Each other nonartifact creature gets -X/-X until end of turn. (Activate each exhaust ability only once.)","power":"3","toughness":"2","colors":["B","U"],"colorIdentity":["B","U"],"keywords":["Exhaust","Ward"],"imageUrl":"https://cards.scryfall.io/normal/front/0/2/02d46d0e-3161-45b5-a49e-5cd592c67ddd.jpg?1783907852","artUrl":"https://cards.scryfall.io/art_crop/front/0/2/02d46d0e-3161-45b5-a49e-5cd592c67ddd.jpg?1783907852","commanderLegal":"legal","set":"dft","releasedAt":"2025-02-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const shackles = (): CardDef => ({"oracleId":"3466e0be-3e59-4f5e-812e-3250c8bf19aa","name":"Shackles of Treachery","manaCost":"{2}{R}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Gain control of target creature until end of turn. Untap that creature. Until end of turn, it gains haste and \"Whenever this creature deals damage, destroy target Equipment attached to it.\"","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/b/db743c6e-1385-468e-921a-7a525b88a1b6.jpg?1783928223","artUrl":"https://cards.scryfall.io/art_crop/front/d/b/db743c6e-1385-468e-921a-7a525b88a1b6.jpg?1783928223","commanderLegal":"legal","set":"khm","releasedAt":"2021-02-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const confluence = (): CardDef => ({"oracleId":"798aaf78-16d9-474b-a963-f5e9c39aae6e","name":"Cosmium Confluence","manaCost":"{4}{G}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Choose three. You may choose the same mode more than once.\n• Search your library for a Cave card, put it onto the battlefield tapped, then shuffle.\n• Put three +1/+1 counters on a Cave you control. It becomes a 0/0 Elemental creature with haste. It's still a land.\n• Destroy target enchantment.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/f/1f8f827d-300a-4d75-b894-c6dd2e5997ce.jpg?1783913679","artUrl":"https://cards.scryfall.io/art_crop/front/1/f/1f8f827d-300a-4d75-b894-c6dd2e5997ce.jpg?1783913679","commanderLegal":"legal","set":"lci","releasedAt":"2023-11-17","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const surfer = (): CardDef => ({"oracleId":"be02005c-0e37-4dba-ac8e-3c69d06bbec2","name":"Silver Surfer, Galactus's Herald","manaCost":"{5}","cmc":5,"typeLine":"Legendary Creature — Alien Hero","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Alien","Hero"],"oracleText":"Flying\nWhen Silver Surfer enters, you may search your library for a card named Galactus, Devourer of Worlds, reveal it, put it into your hand, then shuffle.\nWhenever Silver Surfer deals combat damage to a player, until the end of your next turn, target creature attacks that player each combat if able.","power":"4","toughness":"5","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/b/4/b463462f-8044-4e57-b96e-408a9f4e0974.jpg?1783903299","artUrl":"https://cards.scryfall.io/art_crop/front/b/4/b463462f-8044-4e57-b96e-408a9f4e0974.jpg?1783903299","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const doctors = (): CardDef => ({"oracleId":"dbdd93d2-f2c6-43f9-93e6-2185c7df83bc","name":"The Five Doctors","manaCost":"{5}{G}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Kicker {5} (You may pay an additional {5} as you cast this spell.)\nSearch your library and/or graveyard for up to five Doctor cards, reveal them, and put them into your hand. If you search your library this way, shuffle. If this spell was kicked, put those cards onto the battlefield instead of putting them into your hand.","colors":["G"],"colorIdentity":["G"],"keywords":["Kicker"],"imageUrl":"https://cards.scryfall.io/normal/front/a/d/ada5e97f-c079-445c-8071-1c2a6dd00001.jpg?1783914645","artUrl":"https://cards.scryfall.io/art_crop/front/a/d/ada5e97f-c079-445c-8071-1c2a6dd00001.jpg?1783914645","commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const qasali = (): CardDef => ({"oracleId":"cbd106fb-c9c5-4c5e-8801-619b7c8ff5a6","name":"Qasali Ambusher","manaCost":"{1}{G}{W}","cmc":3,"typeLine":"Creature — Cat Warrior","supertypes":[],"types":["Creature"],"subtypes":["Cat","Warrior"],"oracleText":"Reach\nIf a creature is attacking you and you control a Forest and a Plains, you may cast this creature without paying its mana cost and as though it had flash.","power":"2","toughness":"3","colors":["G","W"],"colorIdentity":["G","W"],"keywords":["Reach"],"imageUrl":"https://cards.scryfall.io/normal/front/b/e/be4e1284-eea2-4fc4-99e4-ed53176939ba.jpg?1783942541","artUrl":"https://cards.scryfall.io/art_crop/front/b/e/be4e1284-eea2-4fc4-99e4-ed53176939ba.jpg?1783942541","commanderLegal":"legal","set":"ala","releasedAt":"2008-10-03","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const technique = (): CardDef => ({"oracleId":"42f12942-9ac1-497e-a8b7-9f66a5afd0ae","name":"Michelangelo's Technique","manaCost":"{4}{G}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Sneak {3}{G} (You may cast this spell for {3}{G} if you also return an unblocked attacker you control to hand during the declare blockers step.)\nLook at the top eight cards of your library. Put up to two creature cards with total mana value 6 or less from among them onto the battlefield and the rest on the bottom of your library in a random order.","colors":["G"],"colorIdentity":["G"],"keywords":["Sneak"],"imageUrl":"https://cards.scryfall.io/normal/front/3/a/3a63c06a-7c59-4b72-b916-e5b6ad78c684.jpg?1783904086","artUrl":"https://cards.scryfall.io/art_crop/front/3/a/3a63c06a-7c59-4b72-b916-e5b6ad78c684.jpg?1783904086","commanderLegal":"legal","set":"tmt","releasedAt":"2026-03-06","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bonesplitter = (): CardDef => ({"oracleId":"452e3f5f-ce17-4682-966b-5cc100210aee","name":"Bonesplitter","manaCost":"{1}","cmc":1,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +2/+0.\nEquip {1}","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/a/e/ae31d513-7412-4467-b497-a7183ff29a42.jpg?1783944980","artUrl":"https://cards.scryfall.io/art_crop/front/a/e/ae31d513-7412-4467-b497-a7183ff29a42.jpg?1783944980","commanderLegal":"legal","set":"pal03","releasedAt":"2003-01-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const savannah = (): CardDef => ({"oracleId":"703243f0-8cb3-420f-958f-5fd4bde30293","name":"Savannah","manaCost":"","cmc":0,"typeLine":"Land — Forest Plains","supertypes":[],"types":["Land"],"subtypes":["Forest","Plains"],"oracleText":"({T}: Add {G} or {W}.)","colors":[],"colorIdentity":["G","W"],"keywords":[],"producedMana":["G","W"],"imageUrl":"https://cards.scryfall.io/normal/front/9/4/94f7e24c-2546-41b6-81ad-5e920b07e64e.jpg?1783948659","artUrl":"https://cards.scryfall.io/art_crop/front/9/4/94f7e24c-2546-41b6-81ad-5e920b07e64e.jpg?1783948659","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const pacifism = (): CardDef => ({"oracleId":"5f5e0b10-c8cf-450c-bfd3-bcb0528ec330","name":"Pacifism","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const captivatingCave = (): CardDef => ({"oracleId":"4c77767a-8133-43bc-b7a5-09a73259d354","name":"Captivating Cave","manaCost":"","cmc":0,"typeLine":"Land — Cave","supertypes":[],"types":["Land"],"subtypes":["Cave"],"oracleText":"{T}: Add {C}.\n{1}, {T}: Add one mana of any color.\n{4}, {T}, Sacrifice this land: Put two +1/+1 counters on target creature. Activate only as a sorcery.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["B","C","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/1/d/1d1a645e-85c7-4044-b817-6e24744d245e.jpg?1783913718","artUrl":"https://cards.scryfall.io/art_crop/front/1/d/1d1a645e-85c7-4044-b817-6e24744d245e.jpg?1783913718","commanderLegal":"legal","set":"lci","releasedAt":"2023-11-17","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const healer = (): CardDef => ({"oracleId":"c51da69b-7fd7-43a3-be29-c44fc0c36130","name":"Cult Healer","manaCost":"{2}{W}","cmc":3,"typeLine":"Creature — Human Doctor","supertypes":[],"types":["Creature"],"subtypes":["Human","Doctor"],"oracleText":"Eerie — Whenever an enchantment you control enters and whenever you fully unlock a Room, this creature gains lifelink until end of turn.","power":"3","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":["Eerie"],"imageUrl":"https://cards.scryfall.io/normal/front/9/c/9c9b8fbe-8a5e-4b62-b53f-9ead8147bbbb.jpg?1783909514","artUrl":"https://cards.scryfall.io/art_crop/front/9/c/9c9b8fbe-8a5e-4b62-b53f-9ead8147bbbb.jpg?1783909514","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes (no attacks, no blocks; a bot answers anything else) until `done` holds. */
const passTill = (s: GameState, done: (s: GameState) => boolean) => {
  for (let i = 0; i < 4000 && !done(s); i++) {
    const pid = waitingOn(s)!;
    if (s.pending?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (s.pending?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, s.pending.count) });
    else if (s.pending) s = run(s, botActions(s, pid));
    else s = act(s, { type: "passPriority", player: pid });
  }
  if (!done(s)) throw new Error("never got there");
  return s;
};
const settled = (x: GameState) => !x.stack.length && !x.triggerQueue.length && !x.pending;
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
/** A card of `def` owned by `pid`, put into `where` (on top of the library). */
const place = (s: GameState, pid: PlayerId, def: CardDef, where: "graveyard" | "library" | "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  return id;
};
const pt = (s: GameState, id: ObjectId) => { const c = characteristics(s, s.objects[id]!); return `${c.power}/${c.toughness}`; };

describe("Lane B round B181: cards", () => {
  it("compile", () => supported(winter(), shackles(), confluence(), surfer(), doctors(), qasali(), technique()));
});

describe("Winter, Cursed Rider: Exile X artifact cards from your graveyard", () => {
  const scene = () => {
    const { s, ap, opp } = setup([]);
    const w = putOnBattlefield(s, ap, winter());
    const yard = [place(s, ap, ornithopter(), "graveyard"), place(s, ap, bonesplitter(), "graveyard"), place(s, ap, ornithopter(), "graveyard")];
    const nonArtifact = place(s, ap, bears(), "graveyard");
    const theirBears = putOnBattlefield(s, opp, bears());
    const theirThopter = putOnBattlefield(s, opp, ornithopter());
    const mine = putOnBattlefield(s, ap, bears());
    return { s, ap, opp, w, yard, nonArtifact, theirBears, theirThopter, mine };
  };

  it("X is announced as it's activated and that many artifact cards are exiled; each other nonartifact creature gets -X/-X", () => {
    const { s: s0, ap, w, yard, theirBears, theirThopter, mine } = scene();
    let s = run(s0, planActivate(s0, ap, w, 0, undefined, undefined, undefined, 2, { exileCards: [yard[0]!, yard[1]!] }));
    expect(zone(s, yard[0]!)).toBe("exile");
    expect(zone(s, yard[1]!)).toBe("exile");
    expect(zone(s, yard[2]!)).toBe("graveyard");
    s = passTill(s, settled);
    // Both Bears die (-2/-2); the artifact creature and Winter itself aren't affected.
    expect(zone(s, theirBears)).toBe("graveyard");
    expect(zone(s, mine)).toBe("graveyard");
    expect(zone(s, theirThopter)).toBe("battlefield");
    expect(pt(s, theirThopter)).toBe("0/2");
    expect(pt(s, w)).toBe("3/2");
  });

  it("only artifact cards, exactly X of them, and only once (exhaust)", () => {
    const { s: s0, ap, w, yard, nonArtifact } = scene();
    expect(planActivate(s0, ap, w, 0, undefined, undefined, undefined, 2, { exileCards: [yard[0]!, nonArtifact] })).toBeNull();
    expect(planActivate(s0, ap, w, 0, undefined, undefined, undefined, 4)).toBeNull();
    expect(compileCard(winter()).activated[0]!.onceEver).toBe(true);
    let s = run(s0, planActivate(s0, ap, w, 0, undefined, undefined, undefined, 1, { exileCards: [yard[2]!] }));
    s = passTill(s, settled);
    s.objects[w]!.tapped = false;
    expect(planActivate(s, ap, w, 0, undefined, undefined, undefined, 1, { exileCards: [yard[0]!] })).toBeNull();
  });

  it("the -X/-X lasts until end of turn, for the creatures there as it resolved", () => {
    const { s: s0, ap, opp, w, yard } = scene();
    let s = run(s0, planActivate(s0, ap, w, 0, undefined, undefined, undefined, 1, { exileCards: [yard[0]!] }));
    s = passTill(s, settled);
    const later = putOnBattlefield(s, opp, bears());
    expect(pt(s, later)).toBe("2/2");
  });

  it("a bot exhausts it when it kills more of its opponents' creatures than its own", () => {
    const { s: s0, ap, opp, w, theirBears } = scene();
    const more = putOnBattlefield(s0, opp, bears());
    // The bot's turn, in its second main phase (its creatures may attack first), nothing else in hand.
    s0.players[ap]!.hand = [];
    let s = passTill(s0, (x) => x.step === "main2" && waitingOn(x) === ap && settled(x));
    let used = false;
    for (let i = 0; i < 10 && !used && s.step === "main2" && waitingOn(s) === ap; i++) {
      const plan = botActions(s, ap);
      used = plan.some((x) => x.type === "activateAbility" && x.objectId === w);
      s = passTill(run(s, plan), settled);
    }
    expect(used).toBe(true);
    expect(s.players[ap]!.graveyard.filter((x) => s.objects[x]!.cardId === ornithopter().oracleId)).toHaveLength(0);
    expect(zone(s, theirBears)).toBe("graveyard");
    expect(zone(s, more)).toBe("graveyard");
  });
});

describe("Winter, Cursed Rider: bots", () => {
  it("a bot keeps it when it would kill more of its own creatures than its opponents'", () => {
    const { s: s0, ap, w } = (() => {
      const { s, ap, opp } = setup([]);
      const w = putOnBattlefield(s, ap, winter());
      for (let i = 0; i < 3; i++) place(s, ap, ornithopter(), "graveyard");
      putOnBattlefield(s, opp, bears());
      putOnBattlefield(s, ap, bears());
      putOnBattlefield(s, ap, bears());
      return { s, ap, w };
    })();
    s0.players[ap]!.hand = [];
    let s = passTill(s0, (x) => x.step === "main2" && waitingOn(x) === ap && settled(x));
    for (let i = 0; i < 10 && s.step === "main2" && waitingOn(s) === ap; i++) {
      const plan = botActions(s, ap);
      expect(plan.some((x) => x.type === "activateAbility" && x.objectId === w)).toBe(false);
      s = passTill(run(s, plan), settled);
    }
  });
});

describe("Shackles of Treachery: \"Whenever this creature deals damage, destroy target Equipment attached to it\"", () => {
  it("the stolen creature's Equipment is destroyed when it deals damage, whoever controls the Equipment", () => {
    const { s: s0, ap, opp, ids } = setup([shackles()]);
    const third = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    const theirs = putOnBattlefield(s0, opp, bears());
    const blade = putOnBattlefield(s0, opp, bonesplitter());
    s0.objects[blade]!.attachedTo = theirs;
    s0.objects[theirs]!.tapped = true;
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: theirs }]));
    s = passTill(s, settled);
    expect(s.objects[theirs]!.tapped).toBe(false);
    const c = characteristics(s, s.objects[theirs]!);
    expect(c.controller).toBe(ap);
    expect(c.keywords).toContain("Haste");
    // Gaining control of it doesn't take the Equipment (rulings).
    expect(s.objects[blade]!.controller).toBe(opp);
    expect(pt(s, theirs)).toBe("4/2");
    s = passTill(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: theirs, defender: third }] });
    s = passTill(s, (x) => x.step === "main2" && settled(x));
    expect(s.players[third]!.life).toBe(36);
    expect(zone(s, blade)).toBe("graveyard");
    // Until end of turn: back to its owner.
    s = passTill(s, (x) => x.activePlayer === opp && x.step === "upkeep");
    expect(characteristics(s, s.objects[theirs]!).controller).toBe(opp);
    expect(compileCard(shackles()).spell!.effects.some((e) => e.type === "continuous" && e.mods.some((m) => m.kind === "addAbility"))).toBe(true);
  });

  it("with no Equipment attached as it deals damage, the trigger has no target and does nothing", () => {
    const { s: s0, ap, opp, ids } = setup([shackles()]);
    const third = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    const theirs = putOnBattlefield(s0, opp, bears());
    const blade = putOnBattlefield(s0, opp, bonesplitter());
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: theirs }]));
    s = passTill(s, settled);
    s = passTill(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: theirs, defender: third }] });
    s = passTill(s, (x) => x.step === "main2" && settled(x));
    expect(s.players[third]!.life).toBe(38);
    expect(zone(s, blade)).toBe("battlefield");
  });
});

describe("Cosmium Confluence: a Cave you control becomes a 0/0 Elemental creature with haste", () => {
  it("search for a Cave, animate that same Cave, and destroy an enchantment, in the order written", () => {
    const { s: s0, ap, opp, ids } = setup([confluence()]);
    const cave = place(s0, ap, captivatingCave(), "library");
    const aura = putOnBattlefield(s0, opp, pacifism());
    s0.objects[aura]!.attachedTo = putOnBattlefield(s0, opp, bears());
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: aura }], [0, 1, 2]));
    s = passTill(s, settled);
    expect(zone(s, cave)).toBe("battlefield");
    expect(s.objects[cave]!.tapped).toBe(true);
    expect(s.objects[cave]!.counters["+1/+1"]).toBe(3);
    const c = characteristics(s, s.objects[cave]!);
    expect(c.types).toEqual(expect.arrayContaining(["Land", "Creature"]));
    expect(c.subtypes).toEqual(expect.arrayContaining(["Cave", "Elemental"]));
    expect(c.keywords).toContain("Haste");
    expect(pt(s, cave)).toBe("3/3");
    expect(zone(s, aura)).toBe("graveyard");
    // For the rest of the game.
    s = passTill(s, (x) => x.activePlayer === opp && x.step === "upkeep");
    expect(pt(s, cave)).toBe("3/3");
  });

  it("the same mode three times: the Cave chosen each time as it resolves", () => {
    const { s: s0, ap, ids } = setup([confluence()]);
    const cave = putOnBattlefield(s0, ap, captivatingCave());
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, [1, 1, 1]));
    s = passTill(s, settled);
    expect(pt(s, cave)).toBe("9/9");
  });

  it("with no Cave, that mode does nothing", () => {
    const { s: s0, ap, ids } = setup([confluence()]);
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, [1, 1, 1]));
    s = passTill(s, settled);
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(s.battlefield.some((x) => characteristics(s, s.objects[x]!).subtypes.includes("Elemental"))).toBe(false);
  });
});

describe("Silver Surfer, Galactus's Herald: target creature attacks that player each combat until the end of your next turn", () => {
  it("another player's creature has to attack the player Silver Surfer hit, until the end of its controller's next turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const third = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    const surf = putOnBattlefield(s0, ap, surfer());
    const theirs = putOnBattlefield(s0, third, bears());
    let s = passTill(s0, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: surf, defender: opp }] });
    // The trigger: the bot (us) picks a target; take the third player's Bears.
    for (let i = 0; i < 200 && s.step !== "main2"; i++) {
      const pid = waitingOn(s)!;
      if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
      else if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: pid, targets: [{ kind: "object", id: theirs }] });
      else if (s.pending) s = run(s, botActions(s, pid));
      else s = act(s, { type: "passPriority", player: pid });
    }
    expect(s.players[opp]!.life).toBe(36);
    expect(characteristics(s, s.objects[theirs]!).mustAttack).toEqual([opp]);
    // The third player's turn: their Bears has to attack the player hit, not someone else.
    s = passTill(s, (x) => x.activePlayer === third && x.pending?.kind === "declareAttackers");
    expect(() => act(s, { type: "declareAttackers", player: third, attacks: [] })).toThrow();
    expect(() => act(s, { type: "declareAttackers", player: third, attacks: [{ attacker: theirs, defender: ap }] })).toThrow();
    s = act(s, { type: "declareAttackers", player: third, attacks: [{ attacker: theirs, defender: opp }] });
    // Through Silver Surfer's controller's next turn, then not.
    s = passTill(s, (x) => x.activePlayer === ap && x.step === "main2");
    expect(characteristics(s, s.objects[theirs]!).mustAttack).toEqual([opp]);
    s = passTill(s, (x) => x.activePlayer !== ap);
    expect(characteristics(s, s.objects[theirs]!).mustAttack).toEqual([]);
  });
});

describe("The Five Doctors: up to five Doctor cards from your library and/or graveyard", () => {
  const scene = () => {
    const { s, ap, ids } = setup([doctors()]);
    const fromLib = place(s, ap, healer(), "library");
    const fromYard = place(s, ap, healer(), "graveyard");
    const notDoctor = place(s, ap, bears(), "graveyard");
    return { s, ap, ids, fromLib, fromYard, notDoctor };
  };
  /** Resolves it: the library searched too, and every Doctor card offered taken. */
  const resolve = (s: GameState, ap: PlayerId, offered: (ids: ObjectId[]) => void) => {
    for (let i = 0; i < 200 && !settled(s); i++) {
      const pid = waitingOn(s)!;
      const pend = s.pending;
      if (pend?.kind === "chooseOption" && pend.what === "searchZones") s = act(s, { type: "chooseOption", player: pid, choice: "both" });
      else if (pend?.kind === "searchLibrary" && pid === ap) {
        offered(pend.cards);
        s = act(s, { type: "searchLibrary", player: pid, found: pend.cards.slice(0, pend.max) });
      } else if (pend) s = run(s, botActions(s, pid));
      else s = act(s, { type: "passPriority", player: pid });
    }
    return s;
  };

  it("not kicked: Doctor cards from both zones into your hand, revealed", () => {
    const { s: s0, ap, ids, fromLib, fromYard, notDoctor } = scene();
    let offered: ObjectId[] = [];
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = resolve(s, ap, (c) => (offered = c));
    expect(offered).toEqual(expect.arrayContaining([fromLib, fromYard]));
    expect(offered).not.toContain(notDoctor);
    expect(zone(s, fromLib)).toBe("hand");
    expect(zone(s, fromYard)).toBe("hand");
    expect(zone(s, notDoctor)).toBe("graveyard");
  });

  it("kicked: onto the battlefield instead", () => {
    const { s: s0, ap, ids, fromLib, fromYard } = scene();
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { kicks: [0] }));
    expect(s.stack.length).toBe(1);
    s = resolve(s, ap, () => {});
    expect(zone(s, fromLib)).toBe("battlefield");
    expect(zone(s, fromYard)).toBe("battlefield");
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });
});

describe("Qasali Ambusher: free and as though it had flash while a creature is attacking you", () => {
  const scene = (onWalker = false) => {
    const { s: s0, ap, opp, ids } = setup([qasali()]);
    // The opponent's turn; they attack us with a Bears.
    const attacker = putOnBattlefield(s0, opp, bears());
    let s = passTill(s0, (x) => x.activePlayer === opp && x.pending?.kind === "declareAttackers");
    const walker = onWalker ? putOnBattlefield(s, ap, { ...card("Test Walker", "Legendary Planeswalker — Test", "{3}"), loyalty: "5" } as CardDef) : undefined;
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker, defender: ap, ...(walker ? { planeswalker: walker } : {}) }] });
    s = passTill(s, (x) => waitingOn(x) === ap && settled(x) && x.step === "declareAttackers");
    return { s, ap, opp, ids, attacker };
  };

  it("cast for free in the declare attackers step, then it can block", () => {
    const { s: s0, ap, ids, attacker } = scene();
    expect(castProblem(s0, ap, ids[0]!)).not.toBeNull();
    const plan = planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { alt: "alternative" });
    expect(plan?.filter((a) => a.type === "activateMana")).toHaveLength(0);
    let s = passTill(run(s0, plan), (x) => x.pending?.kind === "declareBlockers");
    expect(zone(s, ids[0]!)).toBe("battlefield");
    s = act(s, { type: "declareBlockers", player: ap, blocks: [{ blocker: ids[0]!, attacker }] });
    s = passTill(s, (x) => x.step === "main2");
    expect(zone(s, attacker)).toBe("graveyard");
  });

  it("not while creatures attack only a planeswalker of yours, nor without a Forest and a Plains", () => {
    const { s: s0, ap, ids } = scene(true);
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { alt: "alternative" })).not.toBeNull();
    const { s: s1, ap: ap1, ids: ids1 } = scene();
    for (const id of [...s1.battlefield]) if (s1.objects[id]!.controller === ap1 && /^(Forest|Plains)$/.test(s1.cards[s1.objects[id]!.cardId]!.name)) s1.battlefield.splice(s1.battlefield.indexOf(id), 1), (s1.objects[id]!.zone = "graveyard");
    expect(castProblem(s1, ap1, ids1[0]!, undefined, undefined, undefined, undefined, undefined, { alt: "alternative" })).not.toBeNull();
    // One land with both types is enough (rulings).
    putOnBattlefield(s1, ap1, savannah());
    expect(castProblem(s1, ap1, ids1[0]!, undefined, undefined, undefined, undefined, undefined, { alt: "alternative" })).toBeNull();
  });

  it("in your own main phase, with nothing attacking you, only for its mana cost", () => {
    const { s, ap, ids } = setup([qasali()]);
    expect(castProblem(s, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { alt: "alternative" })).not.toBeNull();
    expect(planCast(s, ap, ids[0]!)).not.toBeNull();
  });
});

describe("Michelangelo's Technique: up to two creature cards with total mana value 6 or less", () => {
  it("only cards that keep the total at 6 or less; the rest on the bottom", () => {
    const { s: s0, ap, ids } = setup([technique()]);
    const big = place(s0, ap, surfer(), "library");
    const b1 = place(s0, ap, bears(), "library");
    const b2 = place(s0, ap, healer(), "library");
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 50 && s.pending?.kind !== "searchLibrary"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const pend = s.pending!;
    if (pend.kind !== "searchLibrary") throw new Error("no pick");
    expect(pend.max).toBe(2);
    expect(pend.cards).toEqual(expect.arrayContaining([big, b1, b2]));
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [big, b1] })).toThrow(/total mana value 6 or less/);
    s = act(s, { type: "searchLibrary", player: ap, found: [b1, b2] });
    s = passTill(s, settled);
    expect(zone(s, b1)).toBe("battlefield");
    expect(zone(s, b2)).toBe("battlefield");
    expect(zone(s, big)).toBe("library");
    expect(s.players[ap]!.library.indexOf(big)).toBeGreaterThan(s.players[ap]!.library.length - 7);
  });
});
