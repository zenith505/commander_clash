// Round 415 (Lane A): copies of a spell or ability aimed at the other things it could target. Mischievous Quanar ("When ~
// is turned face up, copy target instant or sorcery spell. You may choose new targets for that copy."), Radiate and
// Radiant Performer ("Copy that spell (or ability) for each other permanent or player the spell could target. Each copy
// targets a different one of those permanents and players."), Agrus Kos, Eternal Soldier ("copy that ability for each
// other creature you control that ability could target") and Exterminator Magmarch ("choose one of those permanents.
// Copy that spell. The copy targets the chosen permanent."), CR 707.10.

import { describe, expect, it } from "vitest";
import { act, bear, island, mountain, putOnBattlefield, setup, swamp } from "./helpers";
import { invalidateCharacteristics } from "../src/layers";
import { applyAction, botActions, isFullySupported, parseManaCost, planActivate, planCast, planMana, planTurnFaceUp, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";
import { isLegalTarget } from "../src/effects/targeting";

// Real card data (Scryfall).
const quanar = (): CardDef => ({"oracleId":"30e3e48c-98dc-4d27-b7ea-e81d39f7d24e","name":"Mischievous Quanar","manaCost":"{4}{U}","cmc":5,"typeLine":"Creature — Beast","supertypes":[],"types":["Creature"],"subtypes":["Beast"],"oracleText":"{3}{U}{U}: Turn this creature face down.\nMorph {1}{U}{U} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)\nWhen this creature is turned face up, copy target instant or sorcery spell. You may choose new targets for that copy.","power":"3","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Morph"],"imageUrl":"https://cards.scryfall.io/normal/front/d/c/dc48c2db-f5b4-4c24-a5fa-00750b7ff56f.jpg?1783944885","artUrl":"https://cards.scryfall.io/art_crop/front/d/c/dc48c2db-f5b4-4c24-a5fa-00750b7ff56f.jpg?1783944885","commanderLegal":"legal","set":"scg","releasedAt":"2003-05-26","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const radiate = (): CardDef => ({"oracleId":"2e5163bd-9b8a-4d1e-9ba9-8666c7348dfd","name":"Radiate","manaCost":"{3}{R}{R}","cmc":5,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Choose target instant or sorcery spell that targets only a single permanent or player. Copy that spell for each other permanent or player the spell could target. Each copy targets a different one of those permanents and players.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/d/fd7a668b-d086-4212-8e64-5c42c1c32159.jpg?1783903505","artUrl":"https://cards.scryfall.io/art_crop/front/f/d/fd7a668b-d086-4212-8e64-5c42c1c32159.jpg?1783903505","commanderLegal":"legal","set":"sld","releasedAt":"2026-04-27","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const performer = (): CardDef => ({"oracleId":"ad16f918-5603-437b-b143-49c69ceae17d","name":"Radiant Performer","manaCost":"{3}{R}{R}","cmc":5,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"Flash\nWhen this creature enters, if you cast it from your hand, choose target spell or ability that targets only a single permanent or player. Copy that spell or ability for each other permanent or player the spell or ability could target. Each copy targets a different one of those permanents and players.","power":"2","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":["Flash"],"imageUrl":"https://cards.scryfall.io/normal/front/e/8/e8faedf4-1178-4f5d-8f46-7277dfe1ae2c.jpg?1783927591","artUrl":"https://cards.scryfall.io/art_crop/front/e/8/e8faedf4-1178-4f5d-8f46-7277dfe1ae2c.jpg?1783927591","commanderLegal":"legal","set":"c21","releasedAt":"2021-04-23","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const agrus = (): CardDef => ({"oracleId":"3d19823a-dbb8-4384-81f4-5c6818b7f46d","name":"Agrus Kos, Eternal Soldier","manaCost":"{3}{W}","cmc":4,"typeLine":"Legendary Creature — Spirit Soldier","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Spirit","Soldier"],"oracleText":"Vigilance\nWhenever Agrus Kos becomes the target of an ability that targets only it, you may pay {1}{R/W}. If you do, copy that ability for each other creature you control that ability could target. Each copy targets a different one of those creatures. ({R/W} can be paid with either {R} or {W}.)","power":"3","toughness":"4","colors":["W"],"colorIdentity":["R","W"],"keywords":["Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/e/a/ea531418-6c7c-4e23-b681-6bfdd4a3eb79.jpg?1783919197","artUrl":"https://cards.scryfall.io/art_crop/front/e/a/ea531418-6c7c-4e23-b681-6bfdd4a3eb79.jpg?1783919197","commanderLegal":"legal","set":"j22","releasedAt":"2022-12-02","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const magmarch = (): CardDef => ({"oracleId":"f42c0b5b-7a86-4f79-a5d3-859ec25ed870","name":"Exterminator Magmarch","manaCost":"{2}{B}{R}","cmc":4,"typeLine":"Artifact Creature — Phyrexian Construct","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Phyrexian","Construct"],"oracleText":"Whenever you cast an instant or sorcery spell that targets only a single nonland permanent an opponent controls, if another opponent controls one or more nonland permanents that spell could target, choose one of those permanents. Copy that spell. The copy targets the chosen permanent.\n{1}{B}: Regenerate this creature.","power":"5","toughness":"3","colors":["B","R"],"colorIdentity":["B","R"],"keywords":["Regenerate"],"imageUrl":"https://cards.scryfall.io/normal/front/f/3/f3c7f177-1a21-4e35-b3bb-88a7b63e6bbe.jpg?1783911417","artUrl":"https://cards.scryfall.io/art_crop/front/f/3/f3c7f177-1a21-4e35-b3bb-88a7b63e6bbe.jpg?1783911417","commanderLegal":"legal","set":"m3c","releasedAt":"2024-06-14","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const murder = (): CardDef => ({"oracleId":"938b4e2c-88d9-4637-bc00-e228920c9a78","name":"Murder","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target creature.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","artUrl":"https://cards.scryfall.io/art_crop/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const pyromancer = (): CardDef => ({"oracleId":"29b3cb3e-aeb1-43eb-8095-9f7881aa34bd","name":"Prodigal Pyromancer","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"{T}: This creature deals 1 damage to any target.","power":"1","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/7/97787109-408e-42d3-acc5-300f5f5bf2ff.jpg?1783943143","artUrl":"https://cards.scryfall.io/art_crop/front/9/7/97787109-408e-42d3-acc5-300f5f5bf2ff.jpg?1783943143","commanderLegal":"legal","set":"plc","releasedAt":"2007-02-02","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const growth = (): CardDef => ({"oracleId":"5748ebf1-24e3-499d-ab7c-c2cebd462a24","name":"Giant Growth","manaCost":"{G}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature gets +3/+3 until end of turn.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/d/fd1f95bf-48ea-455a-8a6c-0249b11c8900.jpg?1783902918","artUrl":"https://cards.scryfall.io/art_crop/front/f/d/fd1f95bf-48ea-455a-8a6c-0249b11c8900.jpg?1783902918","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const counterspell = (): CardDef => ({"oracleId":"cc187110-1148-4090-bbb8-e205694a39f5","name":"Counterspell","manaCost":"{U}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Counter target spell.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/c/0c9a7cb0-5bff-48ff-b620-2838816ac9b5.jpg?1783937618","artUrl":"https://cards.scryfall.io/art_crop/front/0/c/0c9a7cb0-5bff-48ff-b620-2838816ac9b5.jpg?1783937618","commanderLegal":"legal","set":"ema","releasedAt":"2016-06-10","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const naturalize = (): CardDef => ({"oracleId":"bdb3ca68-ec1f-4e16-81cc-d23f8f52c728","name":"Naturalize","manaCost":"{1}{G}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target artifact or enchantment.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/c/0c187d05-0df4-48b6-8e75-690e725b8bcf.jpg?1783935285","artUrl":"https://cards.scryfall.io/art_crop/front/0/c/0c187d05-0df4-48b6-8e75-690e725b8bcf.jpg?1783935285","commanderLegal":"legal","set":"rix","releasedAt":"2018-01-19","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty or a question comes up. */
const settle = (s: GameState) => {
  for (let i = 0; i < 400 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Like settle, answering every "which one does the next copy target" with the first offered. */
const settleCopies = (s: GameState) => {
  for (let i = 0; i < 60; i++) {
    s = settle(s);
    if (s.pending?.kind !== "chooseOption" || s.pending.what !== "copyOrder") return s;
    s = act(s, { type: "chooseOption", player: s.pending.player, choice: s.pending.options[0]! });
  }
  return s;
};
function inHand(s: GameState, pid: PlayerId, def: CardDef): ObjectId {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
}
const log = (s: GameState) => s.log.map((e) => e.text).join("\n");
const copies = (s: GameState, name: string) => s.stack.filter((x) => x.copy && x.description.startsWith(name));
/** The four players from the active one on, in turn order. */
const seats = (s: GameState, ap: PlayerId) => s.turnOrder.slice(s.turnOrder.indexOf(ap)).concat(s.turnOrder.slice(0, s.turnOrder.indexOf(ap))) as [PlayerId, PlayerId, PlayerId, PlayerId];

describe("round 415: the cards compile", () => {
  it("are fully supported", () => {
    for (const d of [quanar(), radiate(), performer(), agrus(), magmarch()]) expect(isFullySupported(d), d.name).toBe(true);
  });
});

describe("round 415: Radiate", () => {
  /** The active player has Murder and Radiate; each player controls a Grizzly Bears. */
  function game(extra: CardDef[] = []) {
    const { s, ap, ids } = setup([murder(), radiate(), ...extra]);
    const [, b, c, d] = seats(s, ap);
    const bears4 = [ap, b, c, d].map((p) => putOnBattlefield(s, p, bears()));
    invalidateCharacteristics(s);
    return { s, ap, b, c, d, ids, bears4 };
  }

  it("copies a spell for each other permanent it could target, each copy aimed at one, all the copier's (CR 707.10c)", () => {
    let { s, ap, b, ids, bears4 } = game();
    s = run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: bears4[1]! }]));
    const murderItem = s.stack[s.stack.length - 1]!;
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: murderItem.id }]));
    s = settle(s);
    // Three other creatures: the copies' order is the copier's choice (rulings).
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "copyOrder", player: ap });
    expect((s.pending as { options: string[] }).options.sort()).toEqual([bears4[0]!, bears4[2]!, bears4[3]!].sort());
    s = act(s, { type: "chooseOption", player: ap, choice: bears4[2]! });
    s = act(s, { type: "chooseOption", player: ap, choice: bears4[0]! });
    expect(copies(s, "Murder").map((x) => x.targets?.[0])).toMatchObject([{ id: bears4[2] }, { id: bears4[0] }, { id: bears4[3] }]);
    expect(copies(s, "Murder").every((x) => x.controller === ap)).toBe(true);
    s = settle(s);
    for (const id of bears4) expect(s.objects[id]!.zone).toBe("graveyard");
    expect(s.players[b]!.life).toBe(40);
  });

  it("a spell aimed at a player: a copy for each other player and each creature or planeswalker it could target", () => {
    let { s, ap, b, c, d, ids, bears4 } = game([bolt()]);
    s = run(s, planCast(s, ap, ids[2]!, [{ kind: "player", id: b }]));
    const boltItem = s.stack[s.stack.length - 1]!;
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: boltItem.id }]));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "copyOrder" });
    expect((s.pending as { options: string[]; labels: string[] }).options.sort()).toEqual([...bears4, `p${ap}`, `p${c}`, `p${d}`].sort());
    expect((s.pending as { labels: string[] }).labels).toContain(s.players[c]!.name);
    s = settleCopies(s);
    for (const p of [ap, b, c, d]) expect(s.players[p]!.life).toBe(37);
    for (const id of bears4) expect(s.objects[id]!.zone).toBe("graveyard");
  });

  it("only copies for what the copy could legally target: no hexproof creature of another player's, no player for Murder", () => {
    let { s, ap, b, c, ids, bears4 } = game();
    const shy = putOnBattlefield(s, c, bear({ name: "Shy Bear", oracleText: "Hexproof", keywords: ["Hexproof"] }));
    invalidateCharacteristics(s);
    s = run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: bears4[1]! }]));
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: s.stack[s.stack.length - 1]!.id }]));
    s = settle(s);
    expect((s.pending as { options: string[] }).options).not.toContain(shy);
    expect((s.pending as { options: string[] }).options.some((o) => /^p/.test(o))).toBe(false);
    s = settleCopies(s);
    expect(s.objects[shy]!.zone).toBe("battlefield");
    expect(s.players[b]!.life).toBe(40);
  });

  it("can't target a spell with no target, two different targets, or a target that isn't a permanent or player", () => {
    const { s, ap, ids, bears4 } = game([counterspell()]);
    let t = run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: bears4[1]! }]));
    const m = t.stack[t.stack.length - 1]!;
    t = run(t, planCast(t, ap, ids[2]!, [{ kind: "stack", id: m.id }]));
    const cs = t.stack[t.stack.length - 1]!;
    const spec = { kind: "spell" as const, types: ["Instant", "Sorcery"], notTypes: [], notColors: [], targetsOnlyPermanentOrPlayer: true as const, text: "x" };
    expect(isLegalTarget(t, spec, { kind: "stack", id: m.id }, ap)).toBe(true);
    // Counterspell targets a spell, not a permanent or player.
    expect(isLegalTarget(t, spec, { kind: "stack", id: cs.id }, ap)).toBe(false);
    // Two different targets.
    t.stack.find((x) => x.id === m.id)!.targets = [{ kind: "object", id: bears4[1]! }, { kind: "object", id: bears4[2]! }];
    expect(isLegalTarget(t, spec, { kind: "stack", id: m.id }, ap)).toBe(false);
    // The same one twice counts (rulings on Radiant Performer).
    t.stack.find((x) => x.id === m.id)!.targets = [{ kind: "object", id: bears4[1]! }, { kind: "object", id: bears4[1]! }];
    expect(isLegalTarget(t, spec, { kind: "stack", id: m.id }, ap)).toBe(true);
    t.stack.find((x) => x.id === m.id)!.targets = [];
    expect(isLegalTarget(t, spec, { kind: "stack", id: m.id }, ap)).toBe(false);
  });

  it("does nothing once the spell's target has left the battlefield (Radiate's target is illegal, CR 608.2b)", () => {
    let { s, ap, ids, bears4 } = game();
    s = run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: bears4[1]! }]));
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: s.stack[s.stack.length - 1]!.id }]));
    // The targeted Bears leaves before Radiate resolves.
    s.battlefield.splice(s.battlefield.indexOf(bears4[1]!), 1);
    s.objects[bears4[1]!]!.zone = "graveyard";
    s.objects[bears4[1]!]!.zoneChanges = (s.objects[bears4[1]!]!.zoneChanges ?? 0) + 1;
    invalidateCharacteristics(s);
    s = settle(s);
    expect(s.pending).toBeFalsy();
    expect(copies(s, "Murder").length).toBe(0);
    for (const id of [bears4[0]!, bears4[2]!, bears4[3]!]) expect(s.objects[id]!.zone).toBe("battlefield");
  });

  it("a bot answers an opponent's Murder at its own creature when the copies hit more of theirs", () => {
    const { s, ap, b, c, d, bears4 } = game();
    // b, a bot with Radiate and {3}{R}{R}, and Murder (cast by the active player) aimed at b's Bears; c and d have more.
    const rad = inHand(s, b, radiate());
    for (let i = 0; i < 5; i++) putOnBattlefield(s, b, mountain);
    putOnBattlefield(s, c, bears());
    putOnBattlefield(s, d, bears());
    invalidateCharacteristics(s);
    const m = s.players[ap]!.hand.find((id) => s.objects[id]!.cardId === murder().oracleId)!;
    let t = run(s, planCast(s, ap, m, [{ kind: "object", id: bears4[1]! }]));
    t = act(t, { type: "passPriority", player: ap });
    expect(waitingOn(t)).toBe(b);
    t.players[b]!.isBot = true;
    const acts = botActions(t, b);
    expect(acts[acts.length - 1]).toMatchObject({ type: "castSpell", objectId: rad });
  });
});

describe("round 415: Radiant Performer", () => {
  function game() {
    const { s, ap, ids } = setup([murder(), performer()]);
    const [, b, c, d] = seats(s, ap);
    const bears4 = [ap, b, c, d].map((p) => putOnBattlefield(s, p, bears()));
    invalidateCharacteristics(s);
    return { s, ap, b, c, d, ids, bears4 };
  }

  it("cast from hand in response: its enters trigger copies the spell for each other creature", () => {
    let { s, ap, ids, bears4 } = game();
    s = run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: bears4[1]! }]));
    const m = s.stack[s.stack.length - 1]!;
    s = run(s, planCast(s, ap, ids[1]!));
    s = settle(s);
    // The trigger's one legal target (Murder) is chosen as it's put on the stack (CR 603.3d).
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "stack", id: m.id }] });
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "copyOrder" });
    // The Performer itself is a creature now, so a copy targets it too.
    const perf = ids[1]!;
    expect((s.pending as { options: string[] }).options.sort()).toEqual([bears4[0]!, bears4[2]!, bears4[3]!, perf].sort());
    s = settleCopies(s);
    for (const id of [...bears4, perf]) expect(s.objects[id]!.zone).toBe("graveyard");
  });

  it("copies an activated ability too, each copy controlled by the Performer's controller (CR 707.10c)", () => {
    let { s, ap, b, c, d, ids } = game();
    // b's Prodigal Pyromancer aims 1 damage at c.
    const pyro = putOnBattlefield(s, b, pyromancer());
    invalidateCharacteristics(s);
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(b);
    s = run(s, planActivate(s, b, pyro, 0, [{ kind: "player", id: c }]));
    // b passes, the active player responds with the Performer (flash).
    s = act(s, { type: "passPriority", player: b });
    for (let i = 0; i < 4 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(waitingOn(s)).toBe(ap);
    const ability = s.stack[s.stack.length - 1]!;
    s = run(s, planCast(s, ap, ids[1]!));
    s = settle(s);
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "stack", id: ability.id }] });
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "copyOrder", player: ap });
    const options = (s.pending as { options: string[] }).options;
    expect(options).toEqual(expect.arrayContaining([`p${ap}`, `p${b}`, `p${d}`, pyro]));
    expect(options).not.toContain(`p${c}`);
    s = act(s, { type: "chooseOption", player: ap, choice: `p${d}` });
    const made = s.stack.filter((x) => x.copy && x.kind === "ability");
    expect(made.length).toBeGreaterThan(0);
    expect(made.every((x) => x.controller === ap)).toBe(true);
    s = settleCopies(s);
    for (const p of [ap, b, c, d]) expect(s.players[p]!.life).toBe(39);
  });

  it("put onto the battlefield without being cast: no trigger (an intervening if, CR 603.4)", () => {
    let { s, ap, ids, bears4 } = game();
    s = run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: bears4[1]! }]));
    putOnBattlefield(s, ap, performer());
    invalidateCharacteristics(s);
    s = settle(s);
    expect(copies(s, "Murder").length).toBe(0);
    expect(s.objects[bears4[1]!]!.zone).toBe("graveyard");
    expect(s.objects[bears4[2]!]!.zone).toBe("battlefield");
  });
});

describe("round 415: Mischievous Quanar", () => {
  it("turned face up: copies target instant or sorcery spell, and its controller may choose new targets for that copy", () => {
    const { s: s0, ap, ids } = setup([bolt()]);
    const [, b, c] = seats(s0, ap);
    const q = putOnBattlefield(s0, b, quanar());
    s0.objects[q]!.faceDown = "morph";
    for (const l of [island, island, island]) putOnBattlefield(s0, b, l);
    invalidateCharacteristics(s0);
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: b }]));
    const boltItem = s.stack[s.stack.length - 1]!;
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(b);
    s = run(s, planTurnFaceUp(s, b, q));
    expect(s.objects[q]!.faceDown).toBeFalsy();
    for (let i = 0; i < 8 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: b, targets: [{ kind: "stack", id: boltItem.id }] });
    for (let i = 0; i < 8 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "copyTargets", player: b });
    s = act(s, { type: "copyTargets", player: b, targets: [{ kind: "player", id: c }] });
    expect(copies(s, "Lightning Bolt")[0]).toMatchObject({ controller: b, targets: [{ kind: "player", id: c }] });
    s = settle(s);
    expect(s.players[b]!.life).toBe(37);
    expect(s.players[c]!.life).toBe(37);
  });
});

describe("round 415: Agrus Kos, Eternal Soldier", () => {
  /** The active player controls Agrus Kos and two Grizzly Bears; b controls Prodigal Pyromancer. */
  function game() {
    const { s, ap, ids } = setup([bolt()]);
    const [, b] = seats(s, ap);
    const ag = putOnBattlefield(s, ap, agrus());
    const mine = [putOnBattlefield(s, ap, bears()), putOnBattlefield(s, ap, bears())];
    const theirs = putOnBattlefield(s, b, bears());
    const pyro = putOnBattlefield(s, b, pyromancer());
    invalidateCharacteristics(s);
    return { s, ap, b, ids, ag, mine, theirs, pyro };
  }
  /** b activates the Pyromancer at `t`, then everyone passes until a question comes up. */
  function ping(s: GameState, ap: PlayerId, b: PlayerId, pyro: ObjectId, t: ObjectId) {
    s = act(s, { type: "passPriority", player: ap });
    s = run(s, planActivate(s, b, pyro, 0, [{ kind: "object", id: t }]));
    for (let i = 0; i < 8 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return s;
  }

  it("an ability that targets only it: you may pay {1}{R/W} to copy it for each other creature you control it could target", () => {
    let { s, ap, b, ag, mine, theirs, pyro } = game();
    s = ping(s, ap, b, pyro, ag);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap, pay: { mana: "{1}{R/W}" } });
    const p = s.pending as { pay: { mana: string } };
    s = run(s, [...planMana(s, ap, parseManaCost(p.pay.mana))!, { type: "chooseMay", player: ap, yes: true }]);
    s = settleCopies(s);
    // The copies are the active player's (CR 707.10c), one at each other creature they control, none at b's.
    expect(log(s)).toMatch(new RegExp(`${s.players[ap]!.name} copies Prodigal Pyromancer`));
    for (const id of mine) expect(s.objects[id]!.damage ?? 0).toBe(1);
    expect(s.objects[theirs]!.damage ?? 0).toBe(0);
    expect(s.objects[ag]!.damage ?? 0).toBe(1);
  });

  it("declined: no copies", () => {
    let { s, ap, b, ag, mine, pyro } = game();
    s = ping(s, ap, b, pyro, ag);
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    s = settle(s);
    for (const id of mine) expect(s.objects[id]!.damage ?? 0).toBe(0);
  });

  it("doesn't trigger for a spell, nor for an ability aimed at another creature", () => {
    let { s, ap, b, ids, ag, mine, pyro } = game();
    let t = run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: ag }]));
    t = settle(t);
    expect(t.pending).toBeFalsy();
    expect(t.objects[ag]!.damage).toBe(3);
    expect(t.objects[mine[0]!]!.damage ?? 0).toBe(0);
    s = ping(s, ap, b, pyro, mine[0]!);
    expect(s.pending).toBeFalsy();
  });

  it("a bot pays only when the copies help it: not for an opponent's damage", () => {
    let { s, ap, b, ag, pyro } = game();
    s = ping(s, ap, b, pyro, ag);
    s.players[ap]!.isBot = true;
    expect(botActions(s, ap)).toEqual([{ type: "chooseMay", player: ap, yes: false }]);
  });
});

describe("round 415: Exterminator Magmarch", () => {
  /** The active player controls the Magmarch and casts Murder at b's Bears; c and d each control creatures. */
  function game(extra: CardDef[] = []) {
    const { s, ap, ids } = setup([murder(), ...extra]);
    const [, b, c, d] = seats(s, ap);
    putOnBattlefield(s, ap, magmarch());
    const bBears = [putOnBattlefield(s, b, bears()), putOnBattlefield(s, b, bears())];
    const cBear = putOnBattlefield(s, c, bears());
    const cBird = putOnBattlefield(s, c, ornithopter());
    const dBear = putOnBattlefield(s, d, bears());
    const myBear = putOnBattlefield(s, ap, bears());
    invalidateCharacteristics(s);
    return { s, ap, b, c, d, ids, bBears, cBear, cBird, dBear, myBear };
  }

  it("copies the spell at a nonland permanent another opponent controls, the one its controller chooses", () => {
    let { s, ap, ids, bBears, cBear, cBird, dBear, myBear } = game();
    s = run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: bBears[0]! }]));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "copyOrder", player: ap });
    // Not b's other Bears, not the active player's own: c's and d's creatures Murder could target.
    expect((s.pending as { options: string[] }).options.sort()).toEqual([cBear, cBird, dBear].sort());
    s = act(s, { type: "chooseOption", player: ap, choice: dBear });
    expect(copies(s, "Murder")[0]).toMatchObject({ controller: ap, targets: [{ id: dBear }] });
    s = settle(s);
    expect(s.objects[dBear]!.zone).toBe("graveyard");
    expect(s.objects[bBears[0]!]!.zone).toBe("graveyard");
    for (const id of [bBears[1]!, cBear, cBird, myBear]) expect(s.objects[id]!.zone).toBe("battlefield");
  });

  it("doesn't trigger when no other opponent controls a permanent the spell could target (an intervening if)", () => {
    let { s, ap, ids, bBears, cBear, cBird, dBear } = game();
    for (const id of [cBear, cBird, dBear]) {
      s.battlefield.splice(s.battlefield.indexOf(id), 1);
      s.objects[id]!.zone = "graveyard";
    }
    invalidateCharacteristics(s);
    s = run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: bBears[0]! }]));
    expect(s.triggerQueue.length + s.stack.filter((x) => x.kind === "ability").length).toBe(0);
    s = settle(s);
    expect(s.pending).toBeFalsy();
  });

  it("the copy is made even if the spell has been countered (rulings)", () => {
    let { s, ap, b, ids, bBears, dBear } = game();
    s = run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: bBears[0]! }]));
    const m = s.stack.find((x) => x.description.startsWith("Murder"))!;
    // b counters Murder while the Magmarch's trigger waits above it.
    const cs = inHand(s, b, counterspell());
    for (const l of [island, island]) putOnBattlefield(s, b, l);
    invalidateCharacteristics(s);
    for (let i = 0; i < 4 && waitingOn(s) !== b; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.stack[s.stack.length - 1]!.kind).toBe("ability");
    s = run(s, planCast(s, b, cs, [{ kind: "stack", id: m.id }]));
    s = settle(s);
    expect(s.objects[m.objectId!]!.zone).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "copyOrder" });
    s = act(s, { type: "chooseOption", player: ap, choice: dBear });
    s = settle(s);
    expect(s.objects[dBear]!.zone).toBe("graveyard");
    expect(s.objects[bBears[0]!]!.zone).toBe("battlefield");
  });

  it("a bot picks the most valuable of those permanents", () => {
    let { s, ap, ids, bBears, cBear } = game();
    const big = putOnBattlefield(s, ap === 0 ? 2 : seats(s, ap)[2], { ...bears(), name: "Big Bear", power: "6", toughness: "6", oracleId: "big-bear" } as CardDef);
    invalidateCharacteristics(s);
    s = run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: bBears[0]! }]));
    s = settle(s);
    s.players[ap]!.isBot = true;
    expect(botActions(s, ap)).toEqual([{ type: "chooseOption", player: ap, choice: big }]);
    expect(cBear).toBeDefined();
  });
});
