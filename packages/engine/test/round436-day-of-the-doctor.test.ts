// Round 436 (Lane A): The Day of the Doctor (chapters I-III exile until a legendary card, playable while the Saga remains,
// the rest to the bottom at random, CR 611.2b, 400.7; chapter IV: up to three Doctors chosen, then all other creatures may
// be exiled for 13 damage, CR 608.2c-d, rulings).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real card data (Scryfall).
const day = (): CardDef => ({"oracleId":"c2ee17b2-6119-4ade-b806-1add64513c3a","name":"The Day of the Doctor","manaCost":"{3}{R}{W}","cmc":5,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after IV.)\nI, II, III — Exile cards from the top of your library until you exile a legendary card. You may play that card for as long as this Saga remains on the battlefield. Put the rest of those exiled cards on the bottom of your library in a random order.\nIV — Choose up to three Doctors. You may exile all other creatures. If you do, this Saga deals 13 damage to you.","colors":["R","W"],"colorIdentity":["R","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/7/9767f42c-df04-4426-929a-87e51aa2b8a5.jpg?1783914637","artUrl":"https://cards.scryfall.io/art_crop/front/9/7/9767f42c-df04-4426-929a-87e51aa2b8a5.jpg?1783914637","commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"saga","gameChanger":false} as CardDef);
const tenth = (): CardDef => ({"oracleId":"23af0a0a-1d12-47c7-b191-2bd3f84eea93","name":"The Tenth Doctor","manaCost":"{3}{U}{R}","cmc":5,"typeLine":"Legendary Creature — Time Lord Doctor","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Time Lord","Doctor"],"oracleText":"Allons-y! — Whenever you attack, exile cards from the top of your library until you exile a nonland card. Put three time counters on it. If it doesn't have suspend, it gains suspend.\nTimey-Wimey — {7}: Time travel three times. Activate only as a sorcery. (For each suspended card you own and each permanent you control with a time counter on it, you may add or remove a time counter. Then do it two more times.)","power":"3","toughness":"5","colors":["R","U"],"colorIdentity":["R","U"],"keywords":["Allons-y!","Time Travel","Timey-Wimey"],"imageUrl":"https://cards.scryfall.io/normal/front/f/1/f1499f49-793b-4265-9ad0-883a431941ab.jpg?1783914687","artUrl":"https://cards.scryfall.io/art_crop/front/f/1/f1499f49-793b-4265-9ad0-883a431941ab.jpg?1783914687","commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const healer = (): CardDef => ({"oracleId":"c51da69b-7fd7-43a3-be29-c44fc0c36130","name":"Cult Healer","manaCost":"{2}{W}","cmc":3,"typeLine":"Creature — Human Doctor","supertypes":[],"types":["Creature"],"subtypes":["Human","Doctor"],"oracleText":"Eerie — Whenever an enchantment you control enters and whenever you fully unlock a Room, this creature gains lifelink until end of turn.","power":"3","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":["Eerie"],"imageUrl":"https://cards.scryfall.io/normal/front/9/c/9c9b8fbe-8a5e-4b62-b53f-9ead8147bbbb.jpg?1783909514","artUrl":"https://cards.scryfall.io/art_crop/front/9/c/9c9b8fbe-8a5e-4b62-b53f-9ead8147bbbb.jpg?1783909514","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const supervisor = (): CardDef => ({"oracleId":"d151c8ed-58bf-4b82-a993-1d81f789aa0e","name":"Dominion Supervisor","manaCost":"{2}{G}","cmc":3,"typeLine":"Creature — Vorta Doctor","supertypes":[],"types":["Creature"],"subtypes":["Vorta","Doctor"],"oracleText":"When this creature enters, put a +1/+1 counter on target creature.\nCreatures you control with counters on them have trample.","power":"3","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/f/5fa76320-24c0-4294-8ae4-fb39e171fbe6.jpg?1785981577","artUrl":"https://cards.scryfall.io/art_crop/front/5/f/5fa76320-24c0-4294-8ae4-fb39e171fbe6.jpg?1785981577","commanderLegal":"not_legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const cradle = (): CardDef => ({"oracleId":"7c427c3d-ecd8-45ef-bebd-8f10f4a311db","name":"Gaea's Cradle","manaCost":"","cmc":0,"typeLine":"Legendary Land","supertypes":["Legendary"],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {G} for each creature you control.","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/9/a/9a3cccac-c826-41ad-b595-4d53db1ab8fa.jpg?1783946579","artUrl":"https://cards.scryfall.io/art_crop/front/9/a/9a3cccac-c826-41ad-b595-4d53db1ab8fa.jpg?1783946579","commanderLegal":"legal","set":"jgp","releasedAt":"1998-01-01","rarity":"rare","layout":"normal","gameChanger":true} as CardDef);
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false} as CardDef);

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; other players' questions as the bots would. Stops at any question of `me`'s. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) s = run(s, botActions(s, p.player));
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
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
/** Cards of `defs` owned by `pid` put on top of their library, the first on top. */
const onTop = (s: GameState, pid: PlayerId, defs: CardDef[]) => {
  const ids = defs.map((d) => {
    const id = putOnBattlefield(s, pid, d);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "library";
    return id;
  });
  s.players[pid]!.library.unshift(...ids);
  invalidateCharacteristics(s);
  return ids;
};
const ch = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!);
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;

/** The Day of the Doctor cast from hand: chapter I has resolved. */
const castDay = (top: CardDef[]) => {
  const { s: s0, ap, ids } = setup([day()]);
  let s = s0;
  const lib = onTop(s, ap, top);
  s = settle(run(s, planCast(s, ap, ids[0]!)), ap);
  return { s, ap, saga: ids[0]!, lib };
};

describe("The Day of the Doctor", () => {
  it("is fully supported", () => {
    expect(isFullySupported(day())).toBe(true);
  });

  it("chapter I exiles down to a legendary card, playable while the Saga remains; the rest go to the bottom", () => {
    let { s, ap, saga, lib } = castDay([bears(), healer(), tenth(), bears()]);
    const [b1, h, ten, b2] = lib;
    expect(zone(s, saga!)).toBe("battlefield");
    expect(s.objects[saga!]!.counters.lore).toBe(1);
    // Stopped at The Tenth Doctor: exiled, playable; the two before it on the bottom, the one after it untouched.
    expect(zone(s, ten!)).toBe("exile");
    expect(s.objects[ten!]!.mayPlay).toMatchObject({ player: ap, until: "source", source: { id: saga } });
    expect(zone(s, b1!)).toBe("library");
    expect(zone(s, h!)).toBe("library");
    const library = s.players[ap]!.library;
    expect(library[0]).toBe(b2);
    expect(library.slice(-2).sort()).toEqual([b1!, h!].sort());
    // Cast from exile with its usual cost and timing.
    s = settle(run(s, planCast(s, ap, ten!)), ap);
    expect(zone(s, ten!)).toBe("battlefield");
  });

  it("the permission ends when the Saga leaves; a legendary land stops it too and is played as a land; no legendary card puts all of them back", () => {
    let { s, ap, saga, lib } = castDay([tenth()]);
    const [ten] = lib;
    expect(zone(s, ten!)).toBe("exile");
    // The Saga leaves: no more playing it (CR 611.2b, 400.7).
    s.battlefield.splice(s.battlefield.indexOf(saga!), 1);
    s.objects[saga!]!.zone = "graveyard";
    s.objects[saga!]!.zoneChanges = (s.objects[saga!]!.zoneChanges ?? 0) + 1;
    s.players[ap]!.graveyard.push(saga!);
    invalidateCharacteristics(s);
    expect(planCast(s, ap, ten!)).toBeNull();

    let r = castDay([bears(), cradle()]);
    const [, cr] = r.lib;
    expect(zone(r.s, cr!)).toBe("exile");
    expect(r.s.objects[cr!]!.mayPlay?.castOnly).toBeUndefined();
    r.s = act(r.s, { type: "playLand", player: r.ap, objectId: cr! });
    expect(zone(r.s, cr!)).toBe("battlefield");

    // No legendary card at all: every card exiled, then all put back on the bottom.
    const { s: s2, ap: ap2, ids } = setup([day()]);
    for (const id of s2.players[ap2]!.library) if ((ch(s2, id).supertypes ?? []).includes("Legendary")) throw new Error("legendary in library");
    const size = s2.players[ap2]!.library.length;
    const s3 = settle(run(s2, planCast(s2, ap2, ids[0]!)), ap2);
    expect(s3.players[ap2]!.library).toHaveLength(size);
    expect(s3.log.some((l) => /finding no legendary card/.test(l.text))).toBe(true);
  });

  /** The Saga with three lore counters and these creatures, on to its chapter IV next turn. */
  const toChapterIV = (mine: CardDef[], theirs: CardDef[]) => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const saga = putOnBattlefield(s, ap, day());
    s.objects[saga]!.counters.lore = 3;
    const my = mine.map((d) => putOnBattlefield(s, ap, d));
    const their = theirs.map((d) => putOnBattlefield(s, opp, d));
    s = passTill(s, (x) => x.turn > s0.turn && x.activePlayer === ap && x.step === "main1" && !!x.stack.length);
    s = settle(s, ap);
    return { s, ap, opp, saga, my, their };
  };

  it("chapter IV: up to three Doctors (anyone's) kept, all other creatures exiled, 13 damage", () => {
    let { s, ap, saga, my, their } = toChapterIV([healer(), bears()], [supervisor(), bears()]);
    const [myHealer, myBears] = my;
    const [theirSup, theirBears] = their;
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "choose", count: 2, min: 0 });
    expect([...(s.pending as { options: string[] }).options].sort()).toEqual([myHealer!, theirSup!].sort());
    s = act(s, { type: "pickPermanents", player: ap, ids: [myHealer!, theirSup!] });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    const life = s.players[ap]!.life;
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(zone(s, myHealer!)).toBe("battlefield");
    expect(zone(s, theirSup!)).toBe("battlefield");
    expect(zone(s, myBears!)).toBe("exile");
    expect(zone(s, theirBears!)).toBe("exile");
    expect(s.players[ap]!.life).toBe(life - 13);
    // Sacrificed after IV (CR 714.4).
    expect(zone(s, saga)).toBe("graveyard");
  });

  it("chapter IV: no Doctors chosen and the exile taken exiles every creature; declined, nothing happens", () => {
    let { s, ap, my, their } = toChapterIV([healer()], [bears()]);
    s = act(s, { type: "pickPermanents", player: ap, ids: [] });
    const life = s.players[ap]!.life;
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(zone(s, my[0]!)).toBe("exile");
    expect(zone(s, their[0]!)).toBe("exile");
    expect(s.players[ap]!.life).toBe(life - 13);

    let r = toChapterIV([healer()], [bears()]);
    r.s = act(r.s, { type: "pickPermanents", player: r.ap, ids: [] });
    const life2 = r.s.players[r.ap]!.life;
    r.s = settle(act(r.s, { type: "chooseMay", player: r.ap, yes: false }), r.ap);
    expect(zone(r.s, r.their[0]!)).toBe("battlefield");
    expect(r.s.players[r.ap]!.life).toBe(life2);
  });

  it("a bot keeps only its own Doctors and exiles the rest only when the opponents lose clearly more", () => {
    let { s, ap, my, their } = toChapterIV([healer(), bears()], [supervisor(), bears(), bears(), bears()]);
    expect(botActions(s, ap)).toEqual([{ type: "pickPermanents", player: ap, ids: [my[0]!] }]);
    s = run(s, botActions(s, ap));
    // Ours lost: 2 power; theirs: 2 + 6.
    expect(botActions(s, ap)).toEqual([{ type: "chooseMay", player: ap, yes: true }]);
    expect(their).toHaveLength(4);

    let r = toChapterIV([healer(), bears(), bears()], [bears()]);
    r.s = run(r.s, botActions(r.s, r.ap));
    expect(botActions(r.s, r.ap)).toEqual([{ type: "chooseMay", player: r.ap, yes: false }]);
  });
});

describe("The Day of the Doctor with no Doctors", () => {
  it("asks no Doctor question, only whether to exile every creature", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const saga = putOnBattlefield(s, ap, day());
    s.objects[saga]!.counters.lore = 3;
    const b = putOnBattlefield(s, opp, bears());
    s = passTill(s, (x) => x.turn > s0.turn && x.activePlayer === ap && x.step === "main1" && !!x.stack.length);
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(zone(s, b)).toBe("exile");
  });
});
