// Lane B round B242: Magnetic Web (an attack requirement on creatures with magnet counters once one attacks, CR 508.1d,
// and a blocking requirement for each magnetized attacker, CR 509.1c), Blaster, Combat DJ (modular 1 granted to other
// nontoken artifact creatures and Vehicles, CR 702.43a, 614.12; its back face moving X counters, then converting) and
// Last Light of Durin's Day (six quest counters, then a Dragon from your hand and/or library, CR 701.23).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, controllerOf, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";
import { faceDef } from "../src/faces";

// Real card data (Scryfall).
const web = (): CardDef => ({"oracleId":"c62c8006-5650-43cb-8247-da097aa42376","name":"Magnetic Web","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"If a creature with a magnet counter on it attacks, all creatures with magnet counters on them attack if able.\nWhenever a creature with a magnet counter on it attacks, all creatures with magnet counters on them block that creature this turn if able.\n{1}, {T}: Put a magnet counter on target creature.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/f/9f3c7309-4efb-49ce-a9cc-a8f7b04c1a15.jpg?1783946602","artUrl":"https://cards.scryfall.io/art_crop/front/9/f/9f3c7309-4efb-49ce-a9cc-a8f7b04c1a15.jpg?1783946602","commanderLegal":"legal","set":"tmp","releasedAt":"1997-10-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const blaster = (): CardDef => ({"oracleId":"59c2af34-a2e5-4c67-af2d-a782e41a8e1e","name":"Blaster, Combat DJ // Blaster, Morale Booster","manaCost":"{3}{R}{G}","cmc":5,"typeLine":"Legendary Artifact Creature — Robot // Legendary Artifact","supertypes":["Legendary"],"types":["Artifact","Creature"],"subtypes":["Robot"],"oracleText":"More Than Meets the Eye {1}{R}{G} (You may cast this card converted for {1}{R}{G}.)\nOther nontoken artifact creatures and Vehicles you control have modular 1. (They enter with an additional +1/+1 counter on them. When they die, you may put their +1/+1 counters on target artifact creature.)\nWhenever you put one or more +1/+1 counters on Blaster, convert it.","power":"3","toughness":"3","colors":["G","R"],"colorIdentity":["G","R"],"keywords":["Modular","Convert","More Than Meets the Eye"],"imageUrl":"https://cards.scryfall.io/normal/front/b/2/b2f8d457-ca4d-4b7d-83ed-17c2ba11ec0e.jpg?1783919903","artUrl":"https://cards.scryfall.io/art_crop/front/b/2/b2f8d457-ca4d-4b7d-83ed-17c2ba11ec0e.jpg?1783919903","commanderLegal":"legal","set":"bot","releasedAt":"2022-11-18","rarity":"mythic","layout":"transform","gameChanger":false,"faces":[{"name":"Blaster, Combat DJ","manaCost":"{3}{R}{G}","typeLine":"Legendary Artifact Creature — Robot","supertypes":["Legendary"],"types":["Artifact","Creature"],"subtypes":["Robot"],"oracleText":"More Than Meets the Eye {1}{R}{G} (You may cast this card converted for {1}{R}{G}.)\nOther nontoken artifact creatures and Vehicles you control have modular 1. (They enter with an additional +1/+1 counter on them. When they die, you may put their +1/+1 counters on target artifact creature.)\nWhenever you put one or more +1/+1 counters on Blaster, convert it.","power":"3","toughness":"3","colors":["G","R"],"imageUrl":"https://cards.scryfall.io/normal/front/b/2/b2f8d457-ca4d-4b7d-83ed-17c2ba11ec0e.jpg?1783919903","artUrl":"https://cards.scryfall.io/art_crop/front/b/2/b2f8d457-ca4d-4b7d-83ed-17c2ba11ec0e.jpg?1783919903"},{"name":"Blaster, Morale Booster","manaCost":"","typeLine":"Legendary Artifact","supertypes":["Legendary"],"types":["Artifact"],"subtypes":[],"oracleText":"Modular 3\n{X}, {T}: Move X +1/+1 counters from Blaster onto another target artifact. That artifact gains haste until end of turn. If Blaster has no +1/+1 counters on it, convert it. Activate only as a sorcery.","colors":["G","R"],"colorIndicator":["G","R"],"imageUrl":"https://cards.scryfall.io/normal/back/b/2/b2f8d457-ca4d-4b7d-83ed-17c2ba11ec0e.jpg?1783919903","artUrl":"https://cards.scryfall.io/art_crop/back/b/2/b2f8d457-ca4d-4b7d-83ed-17c2ba11ec0e.jpg?1783919903"}]}) as CardDef;
const lastLight = (): CardDef => ({"oracleId":"539583f4-21c8-4b61-a2c5-f612fadc3ffa","name":"Last Light of Durin's Day","manaCost":"{1}{R}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever a Mountain you control enters, put a quest counter on this enchantment. If it has six or more quest counters on it, sacrifice it. If you do, search your hand and/or library for a Dragon card and put it onto the battlefield. If you search your library this way, shuffle.\nMountaincycling {2} ({2}, Discard this card: Search your library for a Mountain card, reveal it, put it into your hand, then shuffle.)","colors":["R"],"colorIdentity":["R"],"keywords":["Mountaincycling","Landcycling","Typecycling","Cycling"],"imageUrl":"https://cards.scryfall.io/normal/front/d/f/df29484b-de4b-4bab-995a-7605745780d9.jpg?1784798201","artUrl":"https://cards.scryfall.io/art_crop/front/d/f/df29484b-de4b-4bab-995a-7605745780d9.jpg?1784798201","commanderLegal":"legal","set":"hob","releasedAt":"2026-08-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const shivan = (): CardDef => ({"oracleId":"711eea87-0fa3-46e0-a42b-fa5a86455f04","name":"Shivan Dragon","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Creature — Dragon","supertypes":[],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Flying\n{R}: This creature gets +1/+0 until end of turn.","power":"5","toughness":"5","colors":["R"],"colorIdentity":["R"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/2/9/294ca89d-549a-4302-9284-df5b4e833a69.jpg?1789446860","artUrl":"https://cards.scryfall.io/art_crop/front/2/9/294ca89d-549a-4302-9284-df5b4e833a69.jpg?1789446860","commanderLegal":"legal","set":"sld","releasedAt":"2026-08-31","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const copter = (): CardDef => ({"oracleId":"49136bdc-bc50-49a2-999a-1ef9c16ea130","name":"Smuggler's Copter","manaCost":"{2}","cmc":2,"typeLine":"Artifact — Vehicle","supertypes":[],"types":["Artifact"],"subtypes":["Vehicle"],"oracleText":"Flying\nWhenever this Vehicle attacks or blocks, you may draw a card. If you do, discard a card.\nCrew 1 (Tap any number of creatures you control with total power 1 or more: This Vehicle becomes an artifact creature until end of turn.)","power":"3","toughness":"3","colors":[],"colorIdentity":[],"keywords":["Flying","Crew"],"imageUrl":"https://cards.scryfall.io/normal/front/7/8/7832abb5-5107-4603-904e-491b221bd3e3.jpg?1783937147","artUrl":"https://cards.scryfall.io/art_crop/front/7/8/7832abb5-5107-4603-904e-491b221bd3e3.jpg?1783937147","commanderLegal":"legal","set":"kld","releasedAt":"2016-09-30","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const murder = (): CardDef => ({"oracleId":"938b4e2c-88d9-4637-bc00-e228920c9a78","name":"Murder","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target creature.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","artUrl":"https://cards.scryfall.io/art_crop/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const memnite = (): CardDef => ({"oracleId":"7663ac7c-1de3-4250-b96a-fae9dbd66a27","name":"Memnite","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Construct","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Construct"],"oracleText":"","power":"1","toughness":"1","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/6/469cc4e0-49c0-4009-97ea-28e44addec69.jpg?1783941703","artUrl":"https://cards.scryfall.io/art_crop/front/4/6/469cc4e0-49c0-4009-97ea-28e44addec69.jpg?1783941703","commanderLegal":"legal","set":"som","releasedAt":"2010-10-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const vaults = (): CardDef => ({"oracleId":"1e9c473e-bd65-4e1f-b2ab-cac58dc581c9","name":"Open the Vaults","manaCost":"{4}{W}{W}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Return all artifact and enchantment cards from all graveyards to the battlefield under their owners' control. (Auras with nothing to enchant remain in graveyards.)","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/7/1727b15d-2918-489f-a5b8-8ac3ca86d670.jpg?1783912077","artUrl":"https://cards.scryfall.io/art_crop/front/1/7/1727b15d-2918-489f-a5b8-8ac3ca86d670.jpg?1783912077","commanderLegal":"legal","set":"pip","releasedAt":"2024-03-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const hill = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty or a question is asked; bots answer the questions of anyone but `me`. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && me !== undefined && p.player === me) return s;
    if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const name = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;
const next = (s: GameState, p: PlayerId, n = 1) => s.turnOrder[(s.turnOrder.indexOf(p) + n) % 4]!;
/** A card put into `pid`'s `where` (the top of a library, the hand). */
const into = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  return id;
};
const magnetize = (s: GameState, ...ids: string[]) => ids.forEach((id) => (s.objects[id]!.counters.magnet = 1));
/** Passes priority until `pred` holds; declares the given blocks (the rest none) when blockers are asked for. */
const until = (s: GameState, pred: (s: GameState) => boolean, blocks: { blocker: string; attacker: string }[] = []) => {
  for (let i = 0; i < 300 && !pred(s); i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: blocks.filter((b) => controllerOf(s, s.objects[b.blocker]!) === p.player) });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const atBlockers = (x: GameState) => x.pending?.kind === "declareBlockers";

describe("Lane B round B242", () => {
  it("are fully supported, both faces of Blaster", () => {
    supported(web(), blaster(), lastLight());
    supported(faceDef(blaster(), 0), faceDef(blaster(), 1));
  });
});

describe("Lane B round B242: Magnetic Web", () => {
  it("its {1}, {T} puts a magnet counter on target creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const w = putOnBattlefield(s0, ap, web());
    const b = putOnBattlefield(s0, opp, bears());
    const s = settle(run(s0, planActivate(s0, ap, w, 0, [tgt(b)])));
    expect(s.objects[b]!.counters.magnet).toBe(1);
    expect(s.objects[w]!.tapped).toBe(true);
  });

  it("once a creature with a magnet counter attacks, the attacking player's other magnetized creatures have to, whoever controls the Web", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, web());
    const a = putOnBattlefield(s0, ap, bears());
    const b = putOnBattlefield(s0, ap, hill());
    const plain = putOnBattlefield(s0, ap, bears());
    const sick = putOnBattlefield(s0, ap, bears(), { sick: true });
    magnetize(s0, a, b, sick);
    const s = passUntil(s0, "declareAttackers", ap);
    expect(() => applyAction(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] })).toThrow(/Hill Giant has to attack too/);
    // Not a requirement while no magnetized creature attacks; the creature without a counter can stay home; the
    // summoning-sick one can't attack, so it isn't required to (CR 508.1d); each may attack a different player.
    expect(() => applyAction(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: plain, defender: opp }] })).not.toThrow();
    expect(() => applyAction(s, { type: "declareAttackers", player: ap, attacks: [] })).not.toThrow();
    const t = applyAction(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }, { attacker: b, defender: next(s, ap, 2) }] });
    expect(t.objects[b]!.attacking).toBe(next(s, ap, 2));
    // Without a Web, no requirement.
    const { s: u0, ap: ap2, opp: opp2 } = setup([]);
    const c = putOnBattlefield(u0, ap2, bears());
    const d = putOnBattlefield(u0, ap2, hill());
    magnetize(u0, c, d);
    const u = passUntil(u0, "declareAttackers", ap2);
    expect(() => applyAction(u, { type: "declareAttackers", player: ap2, attacks: [{ attacker: c, defender: opp2 }] })).not.toThrow();
  });

  it("a bot attacking with one magnetized creature brings the others", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, web());
    const a = putOnBattlefield(s0, ap, hill());
    const b = putOnBattlefield(s0, ap, bears());
    magnetize(s0, a, b);
    let s = passUntil(s0, "declareAttackers", ap);
    const acts = botActions(s, ap);
    const decl = acts.find((x) => x.type === "declareAttackers");
    if (decl?.type === "declareAttackers" && decl.attacks.some((x) => x.attacker === a || x.attacker === b)) {
      expect(decl.attacks.map((x) => x.attacker).sort()).toEqual(expect.arrayContaining([a, b].sort()));
    }
    for (const x of acts) s = act(s, x);
  });

  it("the defending player's magnetized creatures must block a magnetized attacker this turn if able", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, web());
    const a = putOnBattlefield(s0, ap, hill());
    const blocker = putOnBattlefield(s0, opp, bears());
    const free = putOnBattlefield(s0, opp, bears());
    const elsewhere = putOnBattlefield(s0, next(s0, ap, 2), bears());
    magnetize(s0, a, blocker, elsewhere);
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] });
    s = until(s, atBlockers);
    expect(s.log.some((l) => l.text === "Grizzly Bears must block Hill Giant this turn if able.")).toBe(true);
    expect(s.pending).toMatchObject({ kind: "declareBlockers", player: opp });
    // Only the magnetized one is bound; blocking with the other alone doesn't obey it.
    expect(() => applyAction(s, { type: "declareBlockers", player: opp, blocks: [] })).toThrow();
    expect(() => applyAction(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: free, attacker: a }] })).toThrow();
    const t = applyAction(s, { type: "declareBlockers", player: opp, blocks: [{ blocker, attacker: a }] });
    expect(t.objects[blocker]!.blocking).toContain(a);
  });

  it("with two magnetized attackers, a magnetized blocker obeys by blocking either one (CR 509.1c)", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, web());
    const a = putOnBattlefield(s0, ap, hill());
    const b = putOnBattlefield(s0, ap, bears());
    const blocker = putOnBattlefield(s0, opp, bears());
    magnetize(s0, a, b, blocker);
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }, { attacker: b, defender: opp }] });
    s = until(s, atBlockers);
    expect(() => applyAction(s, { type: "declareBlockers", player: opp, blocks: [] })).toThrow();
    expect(() => applyAction(s, { type: "declareBlockers", player: opp, blocks: [{ blocker, attacker: a }] })).not.toThrow();
    expect(() => applyAction(s, { type: "declareBlockers", player: opp, blocks: [{ blocker, attacker: b }] })).not.toThrow();
    // A bot defender blocks with it.
    const bot = botActions(s, opp).find((x) => x.type === "declareBlockers");
    expect(bot?.type === "declareBlockers" && bot.blocks.some((x) => x.blocker === blocker)).toBe(true);
  });
});

describe("Lane B round B242: Blaster, Combat DJ", () => {
  it("other nontoken artifact creatures and Vehicles you control enter with a +1/+1 counter; not Blaster, a Bear or another player's", () => {
    const { s: s0, ap, ids, opp } = setup([ornithopter(), copter(), bears()]);
    const bl = putOnBattlefield(s0, ap, blaster());
    let s = s0;
    for (const id of ids) s = settle(run(s, planCast(s, ap, id)));
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[ids[1]!]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[ids[2]!]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.objects[bl]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(name(s, bl)).toBe("Blaster, Combat DJ");
    expect(characteristics(s, s.objects[ids[0]!]!).keywords).toContain("Modular");
    // An opponent's Ornithopter gets nothing.
    const o2 = putOnBattlefield(s, opp, ornithopter());
    expect(characteristics(s, s.objects[o2]!).keywords).not.toContain("Modular");
  });

  it("an artifact creature entering at the same time as Blaster doesn't get the counter (CR 614.12, rulings)", () => {
    const { s: s0, ap, ids } = setup([vaults()]);
    const bl = into(s0, ap, blaster(), "graveyard");
    const orn = into(s0, ap, ornithopter(), "graveyard");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[bl]!.zone).toBe("battlefield");
    expect(s.objects[orn]!.zone).toBe("battlefield");
    expect(s.objects[orn]!.counters["+1/+1"] ?? 0).toBe(0);
    // It has modular 1 now, though: dying, it moves its (no) counters, and one entering later gets the counter.
    expect(characteristics(s, s.objects[orn]!).keywords).toContain("Modular");
    const later = putOnBattlefield(s, ap, memnite());
    s.battlefield.splice(s.battlefield.indexOf(later), 1);
    s.objects[later]!.zone = "hand";
    s.players[ap]!.hand.push(later);
    s = settle(run(s, planCast(s, ap, later)));
    expect(s.objects[later]!.counters["+1/+1"]).toBe(1);
  });

  it("the granted modular's dies trigger moves the counters onto target artifact creature, even when Blaster dies with it (rulings)", () => {
    const wrath = card("Test Wrath", "Sorcery", "{2}", { oracleText: "Destroy all creatures." });
    const { s: s0, ap, ids } = setup([ornithopter(), wrath]);
    putOnBattlefield(s0, ap, blaster());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(1);
    // An opponent's artifact creature survives the wrath with indestructible to take the counter.
    const keep = putOnBattlefield(s, next(s, ap), card("Test Indestructible Golem", "Artifact Creature — Golem", "{3}", { power: "1", toughness: "1", oracleText: "Indestructible", keywords: ["Indestructible"] }));
    s = run(s, planCast(s, ap, ids[1]!));
    for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "chooseTargets" || (p && p.player === ap && p.kind !== "chooseMay")) {
        for (const a of botActions(s, p.player)) s = act(s, a);
      } else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: true });
      else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.log.some((l) => /Modular/.test(l.text) || /\+1\/\+1 counter/.test(l.text))).toBe(true);
    expect(s.objects[keep]!.counters["+1/+1"]).toBe(1);
  });

  it("cast converted, Blaster, Morale Booster enters with modular's three counters; X moved (all of them if fewer), haste, then it converts back", () => {
    const { s: s0, ap, ids } = setup([blaster()]);
    const id = ids[0]!;
    const mem = putOnBattlefield(s0, ap, memnite());
    let s = settle(run(s0, planCast(s0, ap, id, undefined, undefined, "auto", undefined, { alt: "convert" })));
    expect(name(s, id)).toBe("Blaster, Morale Booster");
    expect(s.objects[id]!.counters["+1/+1"]).toBe(3);
    // Memnite didn't enter while Blaster, Combat DJ was there: no counter of its own.
    expect(s.objects[mem]!.counters["+1/+1"] ?? 0).toBe(0);
    s = settle(run(s, planActivate(s, ap, id, 0, [tgt(mem)], undefined, undefined, 2)));
    expect(s.objects[mem]!.counters["+1/+1"]).toBe(2);
    expect(characteristics(s, s.objects[mem]!).keywords).toContain("Haste");
    expect(s.objects[id]!.counters["+1/+1"]).toBe(1);
    expect(name(s, id)).toBe("Blaster, Morale Booster");
    // Next turn: X = 5 with one counter left moves it, and with none left it converts (and gets no modular counters).
    s = passUntil(passUntil(s, "upkeep", next(s, ap)), "main1", ap);
    s = settle(run(s, planActivate(s, ap, id, 0, [tgt(mem)], undefined, undefined, 5)));
    expect(s.objects[mem]!.counters["+1/+1"]).toBe(3);
    expect(name(s, id)).toBe("Blaster, Combat DJ");
    expect(s.objects[id]!.counters["+1/+1"] ?? 0).toBe(0);
  });
});

describe("Lane B round B242: Last Light of Durin's Day", () => {
  /** Last Light with `n` quest counters, a Mountain to play, Shivan Dragon in your hand and another on top of your library. */
  const game = (n: number) => {
    const { s, ap, ids } = setup([card("Mountain", "Basic Land — Mountain"), shivan()]);
    const ll = putOnBattlefield(s, ap, lastLight());
    s.objects[ll]!.counters.quest = n;
    const libDragon = into(s, ap, shivan(), "library");
    return { s, ap, ll, mountain: ids[0]!, handDragon: ids[1]!, libDragon };
  };

  it("a Mountain entering adds a quest counter; below six nothing else happens", () => {
    const { s: s0, ap, ll, mountain } = game(3);
    const s = settle(act(s0, { type: "playLand", player: ap, objectId: mountain }), ap);
    expect(s.objects[ll]!.counters.quest).toBe(4);
    expect(s.objects[ll]!.zone).toBe("battlefield");
  });

  it("at six it's sacrificed and you search your hand only, then put the Dragon onto the battlefield without shuffling", () => {
    const { s: s0, ap, ll, mountain, handDragon } = game(5);
    const libBefore = [...s0.players[ap]!.library];
    let s = settle(act(s0, { type: "playLand", player: ap, objectId: mountain }), ap);
    expect(s.objects[ll]!.zone).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "searchZones", labels: ["Hand and library", "Hand only"] });
    s = act(s, { type: "chooseOption", player: ap, choice: "graveyard" });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, cards: [handDragon] });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [handDragon] }), ap);
    expect(s.objects[handDragon]!.zone).toBe("battlefield");
    expect(s.players[ap]!.library).toEqual(libBefore);
    expect(s.log.map((l) => l.text).filter((t) => /searches/.test(t))).toEqual([`${s.players[ap]!.name} searches their hand, finds a card (Shivan Dragon).`]);
  });

  it("searching the library too finds the Dragon there, and shuffles", () => {
    const { s: s0, ap, mountain, handDragon, libDragon } = game(5);
    let s = settle(act(s0, { type: "playLand", player: ap, objectId: mountain }), ap);
    s = act(s, { type: "chooseOption", player: ap, choice: "both" });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    expect(s.pending?.kind === "searchLibrary" && [...s.pending.cards].sort()).toEqual([handDragon, libDragon].sort());
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [libDragon] }), ap);
    expect(s.objects[libDragon]!.zone).toBe("battlefield");
    expect(s.objects[handDragon]!.zone).toBe("hand");
    expect(s.log.some((l) => /searches their hand and library, finds a card \(Shivan Dragon\), and shuffles\./.test(l.text))).toBe(true);
  });

  it("if it's gone before the trigger resolves, there's no sacrifice and no search (CR 608.2c)", () => {
    const { s: s0, ap, ll, mountain } = game(5);
    let s = act(s0, { type: "playLand", player: ap, objectId: mountain });
    expect(s.triggerQueue.length + s.stack.length).toBeGreaterThan(0);
    // Bounce it in response: a new object in hand (CR 400.7).
    s.battlefield.splice(s.battlefield.indexOf(ll), 1);
    s.objects[ll]!.zone = "hand";
    s.objects[ll]!.zoneChanges = (s.objects[ll]!.zoneChanges ?? 0) + 1;
    s.players[ap]!.hand.push(ll);
    s = settle(s, ap);
    expect(s.pending).toBeFalsy();
    expect(s.objects[ll]!.zone).toBe("hand");
  });
});
