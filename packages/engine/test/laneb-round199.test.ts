// Lane B round B199: Nazahn, Revered Bladesmith ("When Nazahn enters, search your library for an Equipment card and reveal
// it. If you reveal a card named Hammer of Nazahn this way, put it onto the battlefield. Otherwise, put that card into your
// hand. Then shuffle."), Hall of Echoes ("{5}: This land becomes a copy of target creature you control until end of turn.
// The "legend rule" doesn't apply to permanents you control this turn."), Wall of Shadows ("This creature can't be the
// target of spells that can target only Walls or of abilities that can target only Walls."), Fraying Line ("At the
// beginning of each player's upkeep, that player may pay {2}. If they do, they put a rope counter on a creature they
// control. Otherwise, exile this artifact and each creature without a rope counter on it, then remove all rope counters
// from all creatures."), Meandering Towershell ("Whenever this creature attacks, exile it. Return it to the battlefield
// under your control tapped and attacking at the beginning of the declare attackers step on your next turn.") and Noctis,
// Heir Apparent ("Warp-Strike — {3}: Exile Noctis. Return it to the battlefield under its owner's control tapped and
// attacking at the beginning of that player's next declare attackers step. It can't be blocked that combat.").

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, compileCard, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const nazahn = (): CardDef => ({"oracleId":"a3a6c024-43de-4f5c-a1d6-c48a0c96a43b","name":"Nazahn, Revered Bladesmith","manaCost":"{4}{G}{W}","cmc":6,"typeLine":"Legendary Creature — Cat Artificer","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Cat","Artificer"],"oracleText":"When Nazahn enters, search your library for an Equipment card and reveal it. If you reveal a card named Hammer of Nazahn this way, put it onto the battlefield. Otherwise, put that card into your hand. Then shuffle.\nWhenever an equipped creature you control attacks, you may tap target creature defending player controls.","power":"5","toughness":"4","colors":["G","W"],"colorIdentity":["G","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/f/8f21a5b4-1cfa-466b-8a16-a8b11f20b818.jpg?1783935935","artUrl":"https://cards.scryfall.io/art_crop/front/8/f/8f21a5b4-1cfa-466b-8a16-a8b11f20b818.jpg?1783935935","commanderLegal":"legal","set":"c17","releasedAt":"2017-08-25","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const hammer = (): CardDef => ({"oracleId":"e3955573-3db5-490e-903e-65e0172a9202","name":"Hammer of Nazahn","manaCost":"{4}","cmc":4,"typeLine":"Legendary Artifact — Equipment","supertypes":["Legendary"],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Whenever Hammer of Nazahn or another Equipment you control enters, you may attach that Equipment to target creature you control.\nEquipped creature gets +2/+0 and has indestructible.\nEquip {4}","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/e/1/e1aae864-cad1-48b2-bb33-8c2dbb53f5ec.jpg?1783903189","artUrl":"https://cards.scryfall.io/art_crop/front/e/1/e1aae864-cad1-48b2-bb33-8c2dbb53f5ec.jpg?1783903189","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const hall = (): CardDef => ({"oracleId":"dc0a51d4-5b7e-4987-b1fe-349fd118a625","name":"Hall of Echoes","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{5}: This land becomes a copy of target creature you control until end of turn. The \"legend rule\" doesn't apply to permanents you control this turn.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/4/a/4a771010-b397-4849-ac9b-08e4dd5d6a72.jpg?1789644859","artUrl":"https://cards.scryfall.io/art_crop/front/4/a/4a771010-b397-4849-ac9b-08e4dd5d6a72.jpg?1789644859","commanderLegal":"legal","set":"fra","releasedAt":"2026-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const wallShadows = (): CardDef => ({"oracleId":"0e6ff89e-9ae7-4dc3-98b7-05401c5df266","name":"Wall of Shadows","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Creature — Wall","supertypes":[],"types":["Creature"],"subtypes":["Wall"],"oracleText":"Defender (This creature can't attack.)\nPrevent all damage that would be dealt to this creature by creatures it's blocking.\nThis creature can't be the target of spells that can target only Walls or of abilities that can target only Walls.","power":"0","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":["Defender"],"imageUrl":"https://cards.scryfall.io/normal/front/e/b/eb351900-cffd-4d23-b82f-5fb12a4874d9.jpg?1783948060","artUrl":"https://cards.scryfall.io/art_crop/front/e/b/eb351900-cffd-4d23-b82f-5fb12a4874d9.jpg?1783948060","commanderLegal":"legal","set":"leg","releasedAt":"1994-06-01","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const tunnel = (): CardDef => ({"oracleId":"80559618-9dd9-4987-b3bc-1a1b5537bbc5","name":"Tunnel","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target Wall. It can't be regenerated.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/2/b21ebc9f-a93e-4d18-b3e8-8459e3abbf31.jpg?1783948680","artUrl":"https://cards.scryfall.io/art_crop/front/b/2/b21ebc9f-a93e-4d18-b3e8-8459e3abbf31.jpg?1783948680","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const chaosCharm = (): CardDef => ({"oracleId":"b81e5dbd-47a5-4994-91b7-e2a50c8e098d","name":"Chaos Charm","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Choose one —\n• Destroy target Wall.\n• Chaos Charm deals 1 damage to target creature.\n• Target creature gains haste until end of turn.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/b/ebf8ccb8-57fb-491c-b07d-93348b33a765.jpg?1783947081","artUrl":"https://cards.scryfall.io/art_crop/front/e/b/ebf8ccb8-57fb-491c-b07d-93348b33a765.jpg?1783947081","commanderLegal":"legal","set":"mir","releasedAt":"1996-10-08","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const fraying = (): CardDef => ({"oracleId":"b69d2bd6-3e99-4c51-89af-0acedd48739e","name":"Fraying Line","manaCost":"{4}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"When this artifact enters, put a rope counter on target creature you control.\nAt the beginning of each player's upkeep, that player may pay {2}. If they do, they put a rope counter on a creature they control. Otherwise, exile this artifact and each creature without a rope counter on it, then remove all rope counters from all creatures.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/5/75bf7702-c97d-4b88-b815-769c4906e014.jpg?1783922674","artUrl":"https://cards.scryfall.io/art_crop/front/7/5/75bf7702-c97d-4b88-b815-769c4906e014.jpg?1783922674","commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const towershell = (): CardDef => ({"oracleId":"45154dc6-ff0a-4e99-8528-689757d1778e","name":"Meandering Towershell","manaCost":"{3}{G}{G}","cmc":5,"typeLine":"Creature — Turtle","supertypes":[],"types":["Creature"],"subtypes":["Turtle"],"oracleText":"Islandwalk (This creature can't be blocked as long as defending player controls an Island.)\nWhenever this creature attacks, exile it. Return it to the battlefield under your control tapped and attacking at the beginning of the declare attackers step on your next turn.","power":"5","toughness":"9","colors":["G"],"colorIdentity":["G"],"keywords":["Landwalk","Islandwalk"],"imageUrl":"https://cards.scryfall.io/normal/front/a/c/acf037a6-9004-49a3-b4a2-2c814fc63d1c.jpg?1783925906","artUrl":"https://cards.scryfall.io/art_crop/front/a/c/acf037a6-9004-49a3-b4a2-2c814fc63d1c.jpg?1783925906","commanderLegal":"legal","set":"sld","releasedAt":"2021-08-24","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const noctis = (): CardDef => ({"oracleId":"7abe351e-0889-4fc1-91ae-8372bcd28acb","name":"Noctis, Heir Apparent","manaCost":"{W}{U}{B}","cmc":3,"typeLine":"Legendary Creature — Human Noble","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Noble"],"oracleText":"Whenever a creature you control enters during combat, you may attach target Equipment you control to target creature you control.\nWarp-Strike — {3}: Exile Noctis. Return it to the battlefield under its owner's control tapped and attacking at the beginning of that player's next declare attackers step. It can't be blocked that combat.","power":"2","toughness":"3","colors":["B","U","W"],"colorIdentity":["B","U","W"],"keywords":["Warp-Strike"],"imageUrl":"https://cards.scryfall.io/normal/front/c/8/c8c69ad3-e999-4beb-85f5-527a00f482da.jpg?1783904650","artUrl":"https://cards.scryfall.io/art_crop/front/c/8/c8c69ad3-e999-4beb-85f5-527a00f482da.jpg?1783904650","commanderLegal":"legal","set":"fic","releasedAt":"2025-12-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const aliBaba = (): CardDef => ({"oracleId":"ef3fdfea-330d-4948-94ec-67e344b48086","name":"Ali Baba","manaCost":"{R}","cmc":1,"typeLine":"Creature — Human Rogue","supertypes":[],"types":["Creature"],"subtypes":["Human","Rogue"],"oracleText":"{R}: Tap target Wall.","power":"1","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/9/29cd7064-3703-43e0-8702-d1ba13703fd8.jpg?1783948384","artUrl":"https://cards.scryfall.io/art_crop/front/2/9/29cd7064-3703-43e0-8702-d1ba13703fd8.jpg?1783948384","commanderLegal":"legal","set":"arn","releasedAt":"1993-12-17","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const zoneOf = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const vanilla = (name: string, typeLine: string, p: number, t: number, extra: Partial<CardDef> = {}) => card(name, typeLine, "{1}", { cmc: 1, power: String(p), toughness: String(t), ...extra });
const nameOf = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!).name;
/** To `pid`'s declare attackers step, its question asked (or, with nothing able to attack, the step itself). */
const toAttacks = (s0: GameState, pid: PlayerId) => {
  let s = passUntil(s0, "declareAttackers", pid);
  for (let i = 0; i < 20 && s.pending?.kind !== "declareAttackers" && s.step !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Until the declare blockers question (or past combat), answering any "what does it attack" with `opp`. */
const toBlocks = (s0: GameState, opp: PlayerId) => {
  let s = s0;
  for (let i = 0; i < 60 && s.pending?.kind !== "declareBlockers" && (s.step === "beginCombat" || s.step === "declareAttackers"); i++) {
    const p = s.pending;
    if (p?.kind === "chooseOption" && p.what === "attackWhom") s = act(s, { type: "chooseOption", player: p.player, choice: String(opp) });
    else if (p) throw new Error(`unexpected question ${p.kind}`);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};

describe("Nazahn, Revered Bladesmith", () => {
  const sword = card("Test Sword", "Artifact — Equipment", "{2}", { cmc: 2, oracleText: "Equipped creature gets +1/+1.\nEquip {1}" });
  const castNazahn = () => {
    const { s: s0, ap, ids } = setup([nazahn()]);
    const h = into(s0, ap, hammer(), "library");
    const o = into(s0, ap, sword, "library");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    return { s, ap, h, o };
  };

  it("is fully supported", () => supported(nazahn(), hammer()));

  it("puts Hammer of Nazahn onto the battlefield (CR 201.2)", () => {
    const { s: s0, ap, h } = castNazahn();
    const s = act(s0, { type: "searchLibrary", player: ap, found: [h] });
    expect(zoneOf(s, h)).toBe("battlefield");
    expect(s.objects[h]!.controller).toBe(ap);
  });

  it("puts any other Equipment card found into your hand", () => {
    const { s: s0, ap, o, h } = castNazahn();
    const s = act(s0, { type: "searchLibrary", player: ap, found: [o] });
    expect(zoneOf(s, o)).toBe("hand");
    expect(zoneOf(s, h)).toBe("library");
  });

  it("finds only Equipment cards", () => {
    const { s: s0, ap } = castNazahn();
    const bear = s0.players[ap]!.library.find((id) => nameOf(s0, id) === "Grizzly Bears")!;
    expect(() => act(s0, { type: "searchLibrary", player: ap, found: [bear] })).toThrow();
  });
});

describe("Hall of Echoes", () => {
  const legend = () => card("Test Legend", "Legendary Creature — Human", "{2}", { cmc: 2, power: "3", toughness: "3" });
  const toCleanup = (s0: GameState) => {
    let s = s0;
    const turn = s.turn;
    for (let i = 0; i < 100 && s.turn === turn && !(s.pending?.kind === "chooseOption" && s.pending.what === "legend"); i++) {
      const p = s.pending;
      if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: p.player, attacks: [] });
      else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
      else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: p.player, objectIds: s.players[p.player]!.hand.slice(0, p.count) });
      else if (p) throw new Error(`unexpected question ${p.kind}`);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    return s;
  };

  it("is fully supported: a copy of your creature until end of turn, and no legend rule for your permanents this turn", () => {
    supported(hall());
    const { s: s0, ap, opp } = setup([]);
    const hallId = putOnBattlefield(s0, ap, hall());
    const l = putOnBattlefield(s0, ap, legend());
    let s = settle(run(s0, planActivate(s0, ap, hallId, 0, [tgt(l)])));
    expect(nameOf(s, hallId)).toBe("Test Legend");
    expect(characteristics(s, s.objects[hallId]!).types).toEqual(["Creature"]);
    // Two legendary permanents named Test Legend, both kept (CR 704.5j doesn't apply to them this turn).
    expect(zoneOf(s, l)).toBe("battlefield");
    expect(zoneOf(s, hallId)).toBe("battlefield");
    expect(s.pending).toBeNull();
    // A third one, put onto the battlefield later this turn, is kept too.
    const third = putOnBattlefield(s, ap, legend());
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(zoneOf(s, third)).toBe("battlefield");
    // Another player's legends: the rule applies as usual.
    putOnBattlefield(s, opp, legend());
    putOnBattlefield(s, opp, legend());
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "legend", player: opp });
  });

  it("the legend rule applies again in the cleanup step, as the copy effect ends (rulings, CR 514.2)", () => {
    const { s: s0, ap } = setup([]);
    const hallId = putOnBattlefield(s0, ap, hall());
    const l = putOnBattlefield(s0, ap, legend());
    let s = settle(run(s0, planActivate(s0, ap, hallId, 0, [tgt(l)])));
    const second = putOnBattlefield(s, ap, legend());
    s = toCleanup(s);
    expect(s.step).toBe("cleanup");
    // Hall of Echoes is a land again; the two Test Legends are a legend rule group.
    expect(nameOf(s, hallId)).toBe("Hall of Echoes");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "legend", player: ap });
    expect([...(s.pending as { options: string[] }).options].sort()).toEqual([l, second].sort());
    expect(s.players[ap]!.noLegendRuleTurn).toBeUndefined();
  });
});

describe("Wall of Shadows", () => {
  const wall = () => vanilla("Test Wall", "Creature — Wall", 0, 4);
  const zap = card("Test Zap", "Instant", "{R}", { cmc: 1, oracleText: "Test Zap deals 1 damage to target creature." });

  it("is fully supported; spells and abilities that can target only Walls can't target it (CR 115)", () => {
    supported(wallShadows(), tunnel(), chaosCharm(), aliBaba());
    const { s: s0, ap, opp, ids } = setup([tunnel(), zap]);
    const shadows = putOnBattlefield(s0, opp, wallShadows());
    const other = putOnBattlefield(s0, opp, wall());
    // Tunnel: "Destroy target Wall."
    expect(planCast(s0, ap, ids[0]!, [tgt(shadows)])).toBeNull();
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(other)])));
    expect(zoneOf(s, other)).toBe("graveyard");
    // A spell that can target any creature can target it.
    expect(planCast(s0, ap, ids[1]!, [tgt(shadows)])).not.toBeNull();
    // Its controller's own Wall-only spells can't target it either.
    const mine = setup([tunnel()]);
    const myWall = putOnBattlefield(mine.s, mine.ap, wallShadows());
    expect(planCast(mine.s, mine.ap, mine.ids[0]!, [tgt(myWall)])).toBeNull();
  });

  it("an activated ability that can target only Walls can't target it (Ali Baba)", () => {
    const { s: s0, ap, opp } = setup([]);
    const ali = putOnBattlefield(s0, ap, aliBaba());
    const shadows = putOnBattlefield(s0, opp, wallShadows());
    const other = putOnBattlefield(s0, opp, wall());
    expect(planActivate(s0, ap, ali, 0, [tgt(shadows)])).toBeNull();
    const s = settle(run(s0, planActivate(s0, ap, ali, 0, [tgt(other)])));
    expect(s.objects[other]!.tapped).toBe(true);
  });

  it("a modal spell with a mode that can target a non-Wall can target it, in the Wall mode too (rulings)", () => {
    const { s: s0, ap, opp, ids } = setup([chaosCharm()]);
    const shadows = putOnBattlefield(s0, opp, wallShadows());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(shadows)], [0])));
    expect(zoneOf(s, shadows)).toBe("graveyard");
  });

  it("only spells whose every target is a Wall are marked (TargetSpec.onlyWalls)", () => {
    expect(compileCard(tunnel()).spell!.targets[0]!.onlyWalls).toBe(true);
    expect(compileCard(chaosCharm()).spell!.modal!.modes[0]!.targets[0]!.onlyWalls).toBeUndefined();
    expect(compileCard(aliBaba()).activated[0]!.body.targets[0]!.onlyWalls).toBe(true);
    expect(compileCard(zap).spell!.targets[0]!.onlyWalls).toBeUndefined();
  });
});

describe("Fraying Line", () => {
  const nextOf = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % s.turnOrder.length]!;
  /** Fraying Line cast by `ap` with its rope counter on `mine`; creatures for everyone; lands for the next two players. */
  const game = () => {
    const { s: s0, ap, opp, ids } = setup([fraying()]);
    const third = nextOf(s0, opp);
    const mine = putOnBattlefield(s0, ap, vanilla("Test Ox", "Creature — Ox", 2, 4));
    const spare = putOnBattlefield(s0, ap, vanilla("Test Goat", "Creature — Goat", 1, 1));
    const theirs = putOnBattlefield(s0, opp, vanilla("Test Wolf", "Creature — Wolf", 2, 2));
    const thirds = putOnBattlefield(s0, third, vanilla("Test Elk", "Creature — Elk", 3, 3));
    for (const pid of [opp, third]) for (let i = 0; i < 3; i++) putOnBattlefield(s0, pid, card(`Test Waste ${pid}${i}`, "Land", "", { oracleText: "{T}: Add {C}." }));
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s);
    // Its enters trigger targets a creature you control.
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(mine)] });
    s = settle(s);
    return { s, ap, opp, third, line: ids[0]!, mine, spare, theirs, thirds };
  };
  /** To `pid`'s upkeep, the question Fraying Line asks there. */
  const toUpkeep = (s0: GameState, pid: PlayerId) => {
    let s = passUntil(s0, "upkeep", pid);
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return s;
  };

  it("is fully supported; enters with a rope counter on a creature you control", () => {
    supported(fraying());
    const { s, line, mine } = game();
    expect(zoneOf(s, line)).toBe("battlefield");
    expect(s.objects[mine]!.counters.rope).toBe(1);
  });

  it("the upkeep's player may pay {2} and put a rope counter on a creature they control", () => {
    const g = game();
    let s = toUpkeep(g.s, g.opp);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "punisher", player: g.opp });
    expect((s.pending as { labels: string[] }).labels).toEqual(["Pay {2}", "Don't"]);
    s = act(s, { type: "chooseOption", player: g.opp, choice: "0" });
    expect(s.pending).toMatchObject({ kind: "payUnless", player: g.opp });
    s.players[g.opp]!.manaPool = { ...s.players[g.opp]!.manaPool, C: 2 };
    s = act(s, { type: "payUnless", player: g.opp, pay: true });
    // The creature isn't targeted: chosen among theirs as the counter is put; with only one, that one.
    for (let i = 0; i < 5 && s.pending; i++) {
      const p = s.pending;
      if (p.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: p.player, ids: [g.theirs] });
      else break;
    }
    s = settle(s);
    expect(s.objects[g.theirs]!.counters.rope).toBe(1);
    expect(zoneOf(s, g.line)).toBe("battlefield");
    expect(zoneOf(s, g.spare)).toBe("battlefield");
  });

  it("if they don't pay: ~ and each creature without a rope counter are exiled, then every rope counter is removed", () => {
    const g = game();
    let s = toUpkeep(g.s, g.opp);
    s = settle(act(s, { type: "chooseOption", player: g.opp, choice: "none" }));
    expect(zoneOf(s, g.line)).toBe("exile");
    // Anyone's creature without one, the paying player's too.
    expect([zoneOf(s, g.spare), zoneOf(s, g.theirs), zoneOf(s, g.thirds)]).toEqual(["exile", "exile", "exile"]);
    expect(zoneOf(s, g.mine)).toBe("battlefield");
    expect(s.objects[g.mine]!.counters.rope ?? 0).toBe(0);
  });

  it("bots answer it", () => {
    const g = game();
    const s = toUpkeep(g.s, g.opp);
    const acts = botActions(s, g.opp);
    expect(acts.length).toBeGreaterThan(0);
    let t = s;
    for (const a of acts) t = act(t, a);
    expect(t.pending?.kind === "chooseOption" && t.pending.what === "punisher").toBe(false);
  });
});

describe("Meandering Towershell", () => {
  it("is fully supported; exiled as it attacks, back tapped and attacking at your next declare attackers step (CR 508.4)", () => {
    supported(towershell());
    const { s: s0, ap, opp } = setup([]);
    const t = putOnBattlefield(s0, ap, towershell());
    let s = toAttacks(s0, ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: t, defender: opp }] }));
    expect(zoneOf(s, t)).toBe("exile");
    // Not back this turn.
    s = passUntil(s, "end", ap);
    expect(zoneOf(s, t)).toBe("exile");
    // Nothing else can attack on your next turn: the step still begins for it (CR 508.1, 508.8).
    s = toAttacks(s, ap);
    expect(s.step).toBe("declareAttackers");
    const life = s.players[opp]!.life;
    s = toBlocks(s, opp);
    expect(zoneOf(s, t)).toBe("battlefield");
    expect(s.objects[t]!.tapped).toBe(true);
    expect(s.objects[t]!.attacking).toBe(opp);
    // It never attacked: its own trigger doesn't exile it again, raid doesn't count it (rulings).
    expect(s.objects[t]!.attacked?.turn === s.turn).toBe(false);
    expect(s.pending).toMatchObject({ kind: "declareBlockers" });
    for (let i = 0; i < 40 && s.step !== "main2"; i++) {
      const p = s.pending;
      s = p?.kind === "declareBlockers" ? act(s, { type: "declareBlockers", player: p.player, blocks: [] }) : act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.players[opp]!.life).toBe(life - 5);
    expect(zoneOf(s, t)).toBe("battlefield");
  });

  it("you choose what it attacks as it returns, after the attackers you declare", () => {
    const { s: s0, ap, opp } = setup([]);
    const t = putOnBattlefield(s0, ap, towershell());
    const other = s0.turnOrder[(s0.turnOrder.indexOf(opp) + 1) % 4]!;
    let s = toAttacks(s0, ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: t, defender: opp }] }));
    s = passUntil(s, "end", ap);
    const bear = putOnBattlefield(s, ap, vanilla("Test Bear", "Creature — Bear", 2, 2));
    s = toAttacks(s, ap);
    expect(s.pending).toMatchObject({ kind: "declareAttackers", player: ap });
    expect(zoneOf(s, t)).toBe("exile");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: bear, defender: opp }] });
    for (let i = 0; i < 20 && !(s.pending?.kind === "chooseOption" && s.pending.what === "attackWhom"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "attackWhom", player: ap });
    s = toBlocks(act(s, { type: "chooseOption", player: ap, choice: String(other) }), opp);
    expect(s.objects[t]!.attacking).toBe(other);
    expect(s.objects[bear]!.attacking).toBe(opp);
  });

  it("a token exiled this way doesn't come back (CR 111.8)", () => {
    const { s: s0, ap, opp } = setup([]);
    const t = putOnBattlefield(s0, ap, towershell());
    s0.objects[t]!.isToken = true;
    let s = toAttacks(s0, ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: t, defender: opp }] }));
    expect((s.delayed ?? []).some((d) => d.when === "playersNextDeclareAttackers")).toBe(false);
  });
});

describe("Noctis, Heir Apparent", () => {
  it("is fully supported; Warp-Strike in your main phase: back attacking this combat, unblockable (rulings)", () => {
    supported(noctis());
    const { s: s0, ap, opp } = setup([]);
    const n = putOnBattlefield(s0, ap, noctis());
    putOnBattlefield(s0, opp, vanilla("Test Wall", "Creature — Wall", 0, 8, { oracleText: "Defender", keywords: ["Defender"] }));
    let s = settle(run(s0, planActivate(s0, ap, n, 0, [])));
    expect(zoneOf(s, n)).toBe("exile");
    // No other creature: the declare attackers step begins for it anyway (rulings: it returns even with no attackers declared).
    s = toAttacks(s, ap);
    const life = s.players[opp]!.life;
    s = toBlocks(s, opp);
    expect(zoneOf(s, n)).toBe("battlefield");
    expect(s.objects[n]!.attacking).toBe(opp);
    expect(s.objects[n]!.tapped).toBe(true);
    expect(s.pending).toMatchObject({ kind: "declareBlockers", player: opp });
    const wall = s.battlefield.find((id) => nameOf(s, id) === "Test Wall")!;
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: wall, attacker: n }] })).toThrow();
    for (let i = 0; i < 40 && s.step !== "main2"; i++) {
      const p = s.pending;
      s = p?.kind === "declareBlockers" ? act(s, { type: "declareBlockers", player: p.player, blocks: [] }) : act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.players[opp]!.life).toBe(life - 2);
  });

  it("activated after its owner's declare attackers step began: back on their next turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const n = putOnBattlefield(s0, ap, noctis());
    let s = passUntil(s0, "main2", ap);
    s = settle(run(s, planActivate(s, ap, n, 0, [])));
    expect(zoneOf(s, n)).toBe("exile");
    // Not on another player's turn.
    s = passUntil(s, "main2", opp);
    expect(zoneOf(s, n)).toBe("exile");
    s = toAttacks(s, ap);
    s = toBlocks(s, opp);
    expect(zoneOf(s, n)).toBe("battlefield");
    expect(s.objects[n]!.attacking).toBe(opp);
  });

  it("with no attackers declared and nothing returned, there's no declare blockers step (CR 508.8)", () => {
    const { s: s0, ap } = setup([]);
    const n = putOnBattlefield(s0, ap, noctis());
    let s = settle(run(s0, planActivate(s0, ap, n, 0, [])));
    // The card leaves exile before the step: its delayed trigger does nothing.
    const card = s.objects[n]!;
    s.players[ap]!.exile.splice(s.players[ap]!.exile.indexOf(n), 1);
    card.zone = "graveyard";
    card.zoneChanges = (card.zoneChanges ?? 0) + 1;
    s.players[ap]!.graveyard.push(n);
    s = toAttacks(s, ap);
    for (let i = 0; i < 20 && s.step === "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.step).toBe("endCombat");
  });
});
