// Round 411 (Lane A): Guff Rewrites History (a required target for each player, CR 601.2c, shuffled into its owner's
// library, CR 701.24; then each player who controlled one exiles until a nonland card and may cast it for free as it
// resolves, CR 608.2g, 118.9) and Mysterious Stranger (a target in each graveyard with an instant or sorcery card, then a
// copy of one of the exiled cards at random, cast for free, CR 707.12).

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup } from "./helpers";
import { invalidateCharacteristics } from "../src/layers";
import { applyAction, botActions, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const guff = (): CardDef => ({"oracleId":"7ff7af5f-e4e3-40af-8882-756564bfa479","name":"Guff Rewrites History","manaCost":"{2}{R}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"For each player, choose target nonenchantment, nonland permanent that player controls. Those permanents' owners shuffle them into their libraries. Each player who controlled one of those permanents exiles cards from the top of their library until they exile a nonland card, then puts the rest on the bottom of their library in a random order. Each player may cast the nonland card they exiled without paying its mana cost.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/5/4511a6f6-1cdf-4bff-abea-d43b257e6d50.jpg?1783915470","artUrl":"https://cards.scryfall.io/art_crop/front/4/5/4511a6f6-1cdf-4bff-abea-d43b257e6d50.jpg?1783915470","commanderLegal":"legal","set":"cmm","releasedAt":"2023-08-04","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const stranger = (): CardDef => ({"oracleId":"4cd2e1c2-5f14-4ac9-9c88-899af6ad9f80","name":"Mysterious Stranger","manaCost":"{2}{R}{R}","cmc":4,"typeLine":"Creature — Human Rogue","supertypes":[],"types":["Creature"],"subtypes":["Human","Rogue"],"oracleText":"Flash\nWhen this creature enters, for each graveyard with an instant or sorcery card in it, exile target instant or sorcery card from that graveyard. If two or more cards are exiled this way, choose one of them at random and copy it. You may cast the copy without paying its mana cost.","power":"3","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":["Flash"],"imageUrl":"https://cards.scryfall.io/normal/front/3/a/3ad3fb9e-ec2e-4ac5-ba77-7052ebc3a2ab.jpg?1783912116","artUrl":"https://cards.scryfall.io/art_crop/front/3/a/3ad3fb9e-ec2e-4ac5-ba77-7052ebc3a2ab.jpg?1783912116","commanderLegal":"legal","set":"pip","releasedAt":"2024-03-08","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false} as CardDef);

const land = (name: string) => card(name, "Land");
const bear = (name = "Grizzly Bears") => card(name, "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });
const ench = (name: string) => card(name, "Enchantment", "{1}{W}");

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: ObjectId): TargetChoice => ({ kind: "object", id });
/** Everyone passes until the stack is empty or a question comes up. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Puts `defs` into `pid`'s zone (a library is replaced by them, the first on top). */
function place(s: GameState, pid: PlayerId, zone: "library" | "graveyard" | "hand", defs: CardDef[]) {
  const ids = defs.map((def) => {
    const id = putOnBattlefield(s, pid, def);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = zone;
    return id;
  });
  if (zone === "library") {
    for (const id of s.players[pid]!.library) delete s.objects[id];
    s.players[pid]!.library = ids;
  } else s.players[pid]![zone].push(...ids);
  invalidateCharacteristics(s);
  return ids;
}
const zone = (s: GameState, id: ObjectId) => s.objects[id]?.zone;
const others = (s: GameState, ap: PlayerId) => [1, 2, 3].map((k) => s.turnOrder[(s.turnOrder.indexOf(ap) + k) % 4]!);
const logSince = (s: GameState, n: number) => s.log.slice(n).map((l) => l.text).join("\n");
type Pending<K extends string> = Extract<NonNullable<GameState["pending"]>, { kind: K }>;
const pend = <K extends NonNullable<GameState["pending"]>["kind"]>(s: GameState, kind: K) => {
  expect(s.pending?.kind).toBe(kind);
  return s.pending as Pending<K>;
};

describe("round 411: the cards compile", () => {
  it("are fully supported", () => {
    for (const d of [guff(), stranger()]) expect(isFullySupported(d), d.name).toBe(true);
  });
});

describe("round 411: Guff Rewrites History", () => {
  /** A creature for each player (the caster's a Hill Giant), and libraries of lands with one nonland card for some. */
  function board() {
    const { s, ap, ids } = setup([guff()]);
    const [o1, o2, o3] = others(s, ap);
    const mine = putOnBattlefield(s, ap, giant());
    const theirs = [o1, o2, o3].map((p, i) => putOnBattlefield(s, p!, bear(`Bear ${i}`)));
    // The caster's library: lands only, so the Giant shuffled in is the nonland card found.
    const myLib = place(s, ap, "library", [land("Land A"), land("Land B"), land("Land C")]);
    // The first opponent's: lands and a Divination (and the Bear shuffled in).
    const lib1 = place(s, o1!, "library", [land("Land D"), divination()]);
    // The second's: lands only.
    const lib2 = place(s, o2!, "library", [land("Land E")]);
    // The third's: a Lightning Bolt on top.
    const lib3 = place(s, o3!, "library", [bolt(), land("Land F")]);
    return { s, ap, guffId: ids[0]!, o1: o1!, o2: o2!, o3: o3!, mine, theirs, myLib, lib1, lib2, lib3 };
  }

  it("one target for each player, the caster first; with none for a player it can't be cast", () => {
    const { s, ap, guffId, mine, theirs, o2 } = board();
    expect(planCast(s, ap, guffId, [tgt(mine), tgt(theirs[0]!), tgt(theirs[1]!)])).toBeNull();
    expect(planCast(s, ap, guffId, [tgt(theirs[0]!), tgt(mine), tgt(theirs[1]!), tgt(theirs[2]!)])).toBeNull();
    expect(planCast(s, ap, guffId, [tgt(mine), ...theirs.map(tgt)])).not.toBeNull();
    // The second opponent's only permanents: a land and an enchantment, neither of which it can target.
    const bare = board();
    const gone = bare.s.objects[bare.theirs[1]!]!;
    bare.s.battlefield.splice(bare.s.battlefield.indexOf(gone.id), 1);
    delete bare.s.objects[gone.id];
    putOnBattlefield(bare.s, bare.o2, ench("Some Enchantment"));
    putOnBattlefield(bare.s, bare.o2, land("Their Land"));
    invalidateCharacteristics(bare.s);
    expect(planCast(bare.s, bare.ap, bare.guffId)).toBeNull();
    expect(planCast(bare.s, bare.ap, bare.guffId, [tgt(bare.mine), tgt(bare.theirs[0]!), { kind: "none" }, tgt(bare.theirs[2]!)])).toBeNull();
    expect(o2).toBeDefined();
  });

  it("each target is shuffled into its owner's library; each of those players exiles until a nonland card, the rest on the bottom, then each may cast theirs for free in turn order", () => {
    const { s: s0, ap, guffId, o1, o2, o3, mine, theirs, myLib, lib1, lib2, lib3 } = board();
    const before = s0.log.length;
    let s = settle(run(s0, planCast(s0, ap, guffId, [tgt(mine), ...theirs.map(tgt)])));
    // The caster first: the Giant, found among lands.
    let p = pend(s, "castFree");
    expect(p.player).toBe(ap);
    expect(p.objectId).toBe(mine);
    expect(zone(s, mine)).toBe("exile");
    // The lands exiled before it are on the bottom of the library again; none stay exiled.
    for (const id of myLib) expect(zone(s, id)).toBe("library");
    s = run(s, planCast(s, ap, mine));
    expect(zone(s, mine)).toBe("stack");
    // Then the first opponent: the Bear or the Divination, whichever came first.
    p = pend(s, "castFree");
    expect(p.player).toBe(o1);
    expect([theirs[0], lib1[1]]).toContain(p.objectId);
    const first = p.objectId;
    s = act(s, { type: "chooseMay", player: o1, yes: false });
    expect(zone(s, first)).toBe("exile");
    // The other nonland card is still in the library (or was put back on the bottom if it was exiled).
    expect(zone(s, first === theirs[0] ? lib1[1]! : theirs[0]!)).toBe("library");
    expect(zone(s, lib1[0]!)).toBe("library");
    // The second opponent: its Bear.
    p = pend(s, "castFree");
    expect(p.player).toBe(o2);
    expect(p.objectId).toBe(theirs[1]);
    s = run(s, planCast(s, o2, theirs[1]!));
    // The third opponent: the Bolt or its Bear.
    p = pend(s, "castFree");
    expect(p.player).toBe(o3);
    expect([theirs[2], lib3[0]]).toContain(p.objectId);
    s = settle(act(s, { type: "chooseMay", player: o3, yes: false }));
    expect(s.pending).toBeNull();
    expect(zone(s, mine)).toBe("battlefield");
    expect(s.objects[mine]!.controller).toBe(ap);
    expect(zone(s, theirs[1]!)).toBe("battlefield");
    expect(s.objects[theirs[1]!]!.controller).toBe(o2);
    expect(zone(s, lib2[0]!)).toBe("library");
    expect(zone(s, guffId)).toBe("graveyard");
    expect(logSince(s, before)).toContain("shuffles Hill Giant into its owner's library");
  });

  it("a permanent you control but don't own goes to its owner's library, and you exile from your own", () => {
    const { s: s0, ap, guffId, o1, mine, theirs, myLib } = board();
    // The caster has stolen the first opponent's Bear; its own Giant is gone, so the Bear is its target.
    const g = s0.objects[mine]!;
    s0.battlefield.splice(s0.battlefield.indexOf(g.id), 1);
    delete s0.objects[g.id];
    s0.objects[theirs[0]!]!.controller = ap;
    const extra = putOnBattlefield(s0, o1, bear("Other Bear"));
    invalidateCharacteristics(s0);
    const before = s0.log.length;
    const s = settle(run(s0, planCast(s0, ap, guffId, [tgt(theirs[0]!), tgt(extra), tgt(theirs[1]!), tgt(theirs[2]!)])));
    // Both Bears went to their owner's library (one may since have been the card that player exiled).
    for (const id of [theirs[0]!, extra]) expect(s.players[o1]!.library.includes(id) || s.players[o1]!.exile.includes(id)).toBe(true);
    // The caster, who controlled the stolen Bear, exiles from their own library: only lands, all put back, nothing to cast.
    for (const id of myLib) expect(zone(s, id)).toBe("library");
    const caster = s.players[ap]!.name;
    expect(logSince(s, before)).toContain(`${caster} exiles 3 cards from the top of their library (Land A, Land B, Land C), finding no nonland card.`);
    const p = pend(s, "castFree");
    expect(p.player).toBe(o1);
  });

  it("a commander goes to the command zone instead (CR 903.9b), and its controller still exiles", () => {
    const { s: s0, ap, guffId, o2, mine, theirs, lib2 } = board();
    const cmd = putOnBattlefield(s0, o2, bear("Their Commander"), { commander: true });
    let s = settle(run(s0, planCast(s0, ap, guffId, [tgt(mine), tgt(theirs[0]!), tgt(cmd), tgt(theirs[2]!)])));
    expect(zone(s, cmd)).toBe("command");
    // Their library is the land and the Bear that stayed on the battlefield isn't in it: all lands, so nothing for them.
    expect(zone(s, theirs[1]!)).toBe("battlefield");
    expect(zone(s, lib2[0]!)).toBe("library");
    for (let i = 0; i < 6 && s.pending?.kind === "castFree"; i++) {
      expect(s.pending.player).not.toBe(o2);
      s = settle(act(s, { type: "chooseMay", player: s.pending.player, yes: false }));
    }
    expect(s.pending).toBeNull();
    expect(s.log.map((l) => l.text).join("\n")).toContain(`${s.players[o2]!.name} exiles 1 card from the top of their library (Land E), finding no nonland card.`);
  });

  it("a target gone by the time it resolves isn't affected, and its controller doesn't exile", () => {
    const { s: s0, ap, guffId, o3, mine, theirs, lib3 } = board();
    let s = run(s0, planCast(s0, ap, guffId, [tgt(mine), ...theirs.map(tgt)]));
    // The third opponent's Bear goes back to its hand in response.
    const b = s.objects[theirs[2]!]!;
    s.battlefield.splice(s.battlefield.indexOf(b.id), 1);
    b.zone = "hand";
    s.players[o3]!.hand.push(b.id);
    invalidateCharacteristics(s);
    s = settle(s);
    for (let i = 0; i < 6 && s.pending?.kind === "castFree"; i++) {
      expect(s.pending.player).not.toBe(o3);
      s = settle(act(s, { type: "chooseMay", player: s.pending.player, yes: false }));
    }
    expect(s.pending).toBeNull();
    expect(lib3.map((id) => zone(s, id))).toEqual(["library", "library"]);
    expect(s.players[o3]!.library[0]).toBe(lib3[0]);
  });

  it("a bot casting it targets its own least useful permanent and the opponents' best", () => {
    const { s, ap, guffId, mine, theirs, o1 } = board();
    const small = putOnBattlefield(s, ap, card("Memnite", "Artifact Creature — Construct", "{0}", { power: "1", toughness: "1" }));
    const big = putOnBattlefield(s, o1, card("Big Wurm", "Creature — Wurm", "{6}{G}{G}", { power: "8", toughness: "8" }));
    invalidateCharacteristics(s);
    s.players[ap]!.command = [];
    // Only Guff in hand.
    for (const id of s.players[ap]!.hand) if (id !== guffId) delete s.objects[id];
    s.players[ap]!.hand = [guffId];
    // The bot plays a land first, then casts Guff.
    let cur = s;
    let targets: TargetChoice[] | undefined;
    for (let i = 0; i < 10 && !targets; i++) {
      const a = botActions(cur, ap)[0];
      if (!a) break;
      if (a.type === "castSpell" && a.objectId === guffId) targets = a.targets;
      else cur = act(cur, a);
    }
    expect(targets?.[0]).toEqual(tgt(small));
    expect(targets?.[1]).toEqual(tgt(big));
    expect(mine).toBeDefined();
    expect(theirs.length).toBe(3);
  });

  it("a bot answers its free cast", () => {
    const { s: s0, ap, guffId, o2, mine, theirs } = board();
    let s = settle(run(s0, planCast(s0, ap, guffId, [tgt(mine), ...theirs.map(tgt)])));
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    s = act(s, { type: "chooseMay", player: s.pending!.player, yes: false });
    expect(pend(s, "castFree").player).toBe(o2);
    s = act(s, botActions(s, o2)[0]!);
    expect(s.pending?.kind === "castFree" ? s.pending.player : undefined).not.toBe(o2);
  });
});

describe("round 411: Mysterious Stranger", () => {
  /** Stranger in hand, an instant in the caster's graveyard and a sorcery in the second opponent's. */
  function yards() {
    const { s, ap, ids } = setup([stranger()]);
    const [o1, o2, o3] = others(s, ap);
    const [mine] = place(s, ap, "graveyard", [bolt()]);
    const [theirs] = place(s, o2!, "graveyard", [divination()]);
    place(s, o1!, "graveyard", [land("Yard Land")]);
    return { s, ap, id: ids[0]!, o1: o1!, o2: o2!, o3: o3!, mine: mine!, theirs: theirs! };
  }

  it("one target in each graveyard with an instant or sorcery card, none for the others", () => {
    const { s: s0, ap, id, o2 } = yards();
    const s = settle(run(s0, planCast(s0, ap, id)));
    const p = pend(s, "chooseTargets");
    expect(p.player).toBe(ap);
    expect(p.specs.map((x) => [x.controlledBy, !!x.skip])).toEqual([[ap, false], [others(s, ap)[0], true], [o2, false], [others(s, ap)[2], true]]);
  });

  it("two exiled: one of them at random is copied, and the copy may be cast for free; both cards stay exiled", () => {
    const { s: s0, ap, id, mine, theirs } = yards();
    let s = settle(run(s0, planCast(s0, ap, id)));
    const before = s.log.length;
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(mine), { kind: "none" }, tgt(theirs), { kind: "none" }] }));
    expect(zone(s, mine)).toBe("exile");
    expect(zone(s, theirs)).toBe("exile");
    expect(logSince(s, before)).toMatch(/is chosen at random to copy/);
    // Only the card chosen at random is offered.
    const p = pend(s, "chooseOption");
    expect(p.what).toBe("castFromAmong");
    expect(p.options.length).toBe(2);
    expect([mine, theirs]).toContain(p.options[0]);
    expect(p.options[1]).toBe("none");
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "none" }));
    expect(s.pending).toBeNull();
    expect(zone(s, mine)).toBe("exile");
    expect(zone(s, theirs)).toBe("exile");
  });

  it("only one exiled (the other target gone): no copy", () => {
    const { s: s0, ap, id, o2, mine, theirs } = yards();
    let s = settle(run(s0, planCast(s0, ap, id)));
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(mine), { kind: "none" }, tgt(theirs), { kind: "none" }] });
    // The Divination leaves the graveyard in response.
    const d = s.objects[theirs]!;
    s.players[o2]!.graveyard.splice(s.players[o2]!.graveyard.indexOf(theirs), 1);
    d.zone = "hand";
    s.players[o2]!.hand.push(theirs);
    invalidateCharacteristics(s);
    const before = s.log.length;
    s = settle(s);
    expect(s.pending).toBeNull();
    expect(zone(s, mine)).toBe("exile");
    expect(zone(s, theirs)).toBe("hand");
    expect(logSince(s, before)).toMatch(/fewer than 2 cards were exiled this way/);
  });

  it("the cast copy resolves", () => {
    const { s: s0, ap, id, mine, theirs } = yards();
    let s = settle(run(s0, planCast(s0, ap, id)));
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(mine), { kind: "none" }, tgt(theirs), { kind: "none" }] }));
    const chosen = pend(s, "chooseOption").options[0]!;
    s = act(s, { type: "chooseOption", player: ap, choice: chosen });
    const p = pend(s, "castFree");
    // A copy, not the card itself, which stays exiled.
    expect(p.objectId).not.toBe(chosen);
    const hand = s.players[ap]!.hand.length;
    const life = s.turnOrder.map((q) => s.players[q]!.life);
    s = run(s, planCast(s, ap, p.objectId, [{ kind: "player", id: others(s, ap)[0]! }]) ?? planCast(s, ap, p.objectId));
    s = settle(s);
    const drew = s.players[ap]!.hand.length - hand;
    const lost = s.turnOrder.map((q, i) => life[i]! - s.players[q]!.life);
    if (chosen === mine) expect(lost).toContain(3);
    else expect(drew).toBe(2);
    expect(zone(s, chosen)).toBe("exile");
  });

  it("with no instant or sorcery card in any graveyard, the trigger has no targets and does nothing", () => {
    const { s: s0, ap, ids } = setup([stranger()]);
    const id = ids[0]!;
    const s = settle(run(s0, planCast(s0, ap, id)));
    expect(s.pending).toBeNull();
    expect(zone(s, id)).toBe("battlefield");
  });
});
