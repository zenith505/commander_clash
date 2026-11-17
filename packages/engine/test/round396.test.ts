// Round 396 (Lane A): a permanent becoming a copy "for as long as" something stays so (CR 611.2b): Zygon Infiltrator's "for
// as long as that creature remains tapped", Blade of Shared Souls' "for as long as ~ remains attached to it" with another
// creature of yours, and Assimilation Aegis's the same with a creature card exiled with it.

import { describe, expect, it } from "vitest";
import { act, bear, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";
import { destroyPermanent, runStateBasedActions, untapPermanent } from "../src/game";
import { phaseIn, phaseOut } from "../src/phasing";

// Real card data (Scryfall).
const aegis = (): CardDef => ({"oracleId":"6d39d218-254a-4886-907a-89df605d7ce4","name":"Assimilation Aegis","manaCost":"{1}{W}{U}","cmc":3,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"When this Equipment enters, exile up to one target creature until this Equipment leaves the battlefield.\nWhenever this Equipment becomes attached to a creature, for as long as this Equipment remains attached to it, that creature becomes a copy of a creature card exiled with this Equipment.\nEquip {2}","colors":["U","W"],"colorIdentity":["U","W"],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/0/1/014bf3c6-e46f-48f8-902f-82deeba260b2.jpg?1783911798","artUrl":"https://cards.scryfall.io/art_crop/front/0/1/014bf3c6-e46f-48f8-902f-82deeba260b2.jpg?1783911798","commanderLegal":"legal","set":"otj","releasedAt":"2024-04-19","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const blade = (): CardDef => ({"oracleId":"bfecd486-8326-426b-ac2b-54946f6ae707","name":"Blade of Shared Souls","manaCost":"{2}{U}","cmc":3,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"For Mirrodin! (When this Equipment enters, create a 2/2 red Rebel creature token, then attach this to it.)\nWhenever this Equipment becomes attached to a creature, for as long as this Equipment remains attached to it, you may have that creature become a copy of another target creature you control.\nEquip {2}","colors":["U"],"colorIdentity":["U"],"keywords":["For Mirrodin!","Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/2/7/277aeb73-4c7c-4132-b9f9-55181d57e75d.jpg?1783918068","artUrl":"https://cards.scryfall.io/art_crop/front/2/7/277aeb73-4c7c-4132-b9f9-55181d57e75d.jpg?1783918068","commanderLegal":"legal","set":"one","releasedAt":"2023-02-10","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const zygon = (): CardDef => ({"oracleId":"693c071a-d6b5-4a96-8fe3-8c61fa9406bc","name":"Zygon Infiltrator","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Alien Shapeshifter Soldier","supertypes":[],"types":["Creature"],"subtypes":["Alien","Shapeshifter","Soldier"],"oracleText":"Body-print — {2}{U}: Tap another target creature and put a stun counter on it. This creature becomes a copy of that creature for as long as that creature remains tapped. Activate only as a sorcery. (If a permanent with a stun counter would become untapped, remove one from it instead.)","power":"3","toughness":"2","colors":["U"],"colorIdentity":["U"],"keywords":["Body-print"],"imageUrl":"https://cards.scryfall.io/normal/front/7/1/71b5538b-4561-4929-8e1c-9763e75cad0e.jpg?1783914664","artUrl":"https://cards.scryfall.io/art_crop/front/7/1/71b5538b-4561-4929-8e1c-9763e75cad0e.jpg?1783914664","commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const angel = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const panharmonicon = (): CardDef => ({"oracleId":"76678885-3674-443d-b9a2-2a460cf6aac0","name":"Panharmonicon","manaCost":"{4}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"If an artifact or creature entering causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/d/1d92b7dd-1f63-4f34-87ca-01a0eaa7b3a1.jpg?1783912343","artUrl":"https://cards.scryfall.io/art_crop/front/1/d/1d92b7dd-1f63-4f34-87ca-01a0eaa7b3a1.jpg?1783912343","commanderLegal":"legal","set":"pip","releasedAt":"2024-03-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const unsummon = (): CardDef => ({"oracleId":"837182db-1bf3-4a2c-bd01-1af9d9873561","name":"Unsummon","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Return target creature to its owner's hand.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddad9f16-52d5-49de-82b0-b1a5294a9c44.jpg?1789556722","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddad9f16-52d5-49de-82b0-b1a5294a9c44.jpg?1789556722","commanderLegal":"legal","set":"fra","releasedAt":"2026-10-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const _shatter = (): CardDef => ({"oracleId":"84d32e68-72b9-432d-a023-7bc6a26b8ad0","name":"Shatter","manaCost":"{1}{R}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target artifact.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/2/929a41f7-f52d-4190-a80c-5ceb3e368a31.jpg?1783935294","artUrl":"https://cards.scryfall.io/art_crop/front/9/2/929a41f7-f52d-4190-a80c-5ceb3e368a31.jpg?1783935294","commanderLegal":"legal","set":"rix","releasedAt":"2018-01-19","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const wurm = (): CardDef => ({"oracleId":"6a462a69-3e42-41de-a3aa-a488d9f38d69","name":"Craw Wurm","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Creature — Wurm","supertypes":[],"types":["Creature"],"subtypes":["Wurm"],"oracleText":"","power":"6","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","artUrl":"https://cards.scryfall.io/art_crop/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; questions are answered as the bots would, except `me`'s, where it stops. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const name = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!).name;
const pt = (s: GameState, id: ObjectId) => `${characteristics(s, s.objects[id]!).power}/${characteristics(s, s.objects[id]!).toughness}`;
const others = (s: GameState, ap: PlayerId) => s.turnOrder.filter((p) => p !== ap);
const play = (s: GameState, pid: PlayerId, def: CardDef) => putOnBattlefield(s, pid, def);
/** A card put into `pid`'s hand. */
const inHand = (s: GameState, pid: PlayerId, def: CardDef): ObjectId => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  return id;
};
/** The permanent destroyed (as Shatter would), then the state-based actions. */
const destroy = (s: GameState, id: ObjectId) => {
  destroyPermanent(s, s.objects[id]!, "destroyed");
  runStateBasedActions(s);
  return s;
};

describe("round 396: compiles", () => {
  it("every card of the round is fully supported", () => {
    for (const d of [aegis(), blade(), zygon()]) expect(isFullySupported(d), d.name).toBe(true);
  });
});

describe("Zygon Infiltrator", () => {
  const withZygon = () => {
    const { s, ap } = setup([]);
    const z = play(s, ap, zygon());
    const opp = others(s, ap)[0]!;
    const a = play(s, opp, angel());
    return { s, ap, z, a, opp };
  };

  it("taps another target creature, puts a stun counter on it and becomes a copy of it", () => {
    const { s: s0, ap, z, a } = withZygon();
    const s = settle(run(s0, planActivate(s0, ap, z, 0, [{ kind: "object", id: a }])), ap);
    expect(s.objects[a]!.tapped).toBe(true);
    expect(s.objects[a]!.counters.stun).toBe(1);
    expect(name(s, z)).toBe("Serra Angel");
    expect(pt(s, z)).toBe("4/4");
    expect(characteristics(s, s.objects[z]!).keywords).toContain("Flying");
  });

  it("can't target itself, and only as a sorcery", () => {
    const { s, ap, z } = withZygon();
    expect(planActivate(s, ap, z, 0, [{ kind: "object", id: z }])).toBeNull();
    // An opponent's turn: not as a sorcery.
    const opp = others(s, ap)[0]!;
    const theirs = play(s, opp, zygon());
    expect(planActivate(s, opp, theirs, 0, [{ kind: "object", id: z }])).toBeNull();
  });

  it("stays a copy while the stun counter keeps that creature tapped, and stops for good once it untaps", () => {
    const { s: s0, ap, z, a } = withZygon();
    let s = settle(run(s0, planActivate(s0, ap, z, 0, [{ kind: "object", id: a }])), ap);
    // Its untap step removes the stun counter instead (CR 122.1d): still tapped, still a copy.
    untapPermanent(s, s.objects[a]!);
    expect(s.objects[a]!.tapped).toBe(true);
    expect(s.objects[a]!.counters.stun ?? 0).toBe(0);
    expect(name(s, z)).toBe("Serra Angel");
    untapPermanent(s, s.objects[a]!);
    expect(s.objects[a]!.tapped).toBe(false);
    expect(name(s, z)).toBe("Zygon Infiltrator");
    expect(pt(s, z)).toBe("3/2");
    // Tapped again later: over for good (CR 611.2b).
    s.objects[a]!.tapped = true;
    runStateBasedActions(s);
    expect(name(s, z)).toBe("Zygon Infiltrator");
  });

  it("stops being a copy once that creature leaves the battlefield", () => {
    const { s: s0, ap, z, a } = withZygon();
    let s = settle(run(s0, planActivate(s0, ap, z, 0, [{ kind: "object", id: a }])), ap);
    expect(name(s, z)).toBe("Serra Angel");
    const u = inHand(s, ap, unsummon());
    s = settle(run(s, planCast(s, ap, u, [{ kind: "object", id: a }])), ap);
    expect(s.objects[a]!.zone).toBe("hand");
    expect(name(s, z)).toBe("Zygon Infiltrator");
  });

  it("that creature phasing out ends it for good: the effect can't see it any more (CR 702.26f)", () => {
    const { s: s0, ap, z, a } = withZygon();
    const s = settle(run(s0, planActivate(s0, ap, z, 0, [{ kind: "object", id: a }])), ap);
    phaseOut(s, [a]);
    runStateBasedActions(s);
    expect(name(s, z)).toBe("Zygon Infiltrator");
    phaseIn(s, [a]);
    runStateBasedActions(s);
    expect(s.objects[a]!.tapped).toBe(true);
    expect(name(s, z)).toBe("Zygon Infiltrator");
  });

  /** The bot's own main phase 2 (where it uses activated abilities) with an empty hand: does it activate Zygon on `def`? */
  const botUses = (def: CardDef) => {
    const { s: s0, ap } = setup([]);
    for (const id of s0.players[ap]!.hand) s0.objects[id]!.zone = "library";
    s0.players[ap]!.library.push(...s0.players[ap]!.hand);
    s0.players[ap]!.hand = [];
    const z = play(s0, ap, zygon());
    play(s0, others(s0, ap)[0]!, def);
    let s = passUntil(s0, "main2", ap);
    for (let i = 0; i < 20 && s.step === "main2" && s.activePlayer === ap; i++) {
      const acts = botActions(s, waitingOn(s)!);
      if (acts.some((a) => a.type === "activateAbility" && a.objectId === z)) return true;
      for (const a of acts) s = act(s, a);
    }
    return false;
  };

  it("a bot uses it on an opponent's creature bigger than it, not a smaller one", () => {
    expect(botUses(wurm())).toBe(true);
    expect(botUses(elves())).toBe(false);
  });

  it("copies only the copiable values: not the counters or other effects on that creature (rulings)", () => {
    const { s: s0, ap, z, a } = withZygon();
    s0.objects[a]!.counters["+1/+1"] = 2;
    const s = settle(run(s0, planActivate(s0, ap, z, 0, [{ kind: "object", id: a }])), ap);
    expect(pt(s, a)).toBe("6/6");
    expect(pt(s, z)).toBe("4/4");
  });
});

describe("Blade of Shared Souls", () => {
  /** Blade cast (For Mirrodin! creates the Rebel and attaches to it), with Hill Giant and a Grizzly Bears of ours. */
  const withBlade = () => {
    const { s, ap, ids } = setup([blade()]);
    const g = play(s, ap, giant());
    return { s, ap, b: ids[0]!, g };
  };
  const rebelOf = (s: GameState, ap: PlayerId) => s.battlefield.find((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap)!;

  it("the Rebel it's attached to may become a copy of another creature of yours, staying a token", () => {
    const { s: s0, ap, b, g } = withBlade();
    let s = settle(run(s0, planCast(s0, ap, b)), ap);
    // The trigger's target, then its "you may".
    while (s.pending) {
      const p = s.pending;
      if (p.player !== ap) s = settle(s, ap);
      else if (p.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: g }] });
      else if (p.kind === "chooseMay") s = act(s, { type: "chooseMay", player: ap, yes: true });
      else throw new Error(p.kind);
      s = settle(s, ap);
    }
    const r = rebelOf(s, ap);
    expect(s.objects[b]!.attachedTo).toBe(r);
    expect(name(s, r)).toBe("Hill Giant");
    expect(pt(s, r)).toBe("3/3");
    expect(s.objects[r]!.isToken).toBe(true);
  });

  /** Blade cast and resolved with the bots' answers for us (they copy Hill Giant, bigger than the 2/2 Rebel). */
  const bladed = () => {
    const { s: s0, ap, b, g } = withBlade();
    const s = settle(run(s0, planCast(s0, ap, b)));
    return { s, ap, b, g, r: rebelOf(s, ap) };
  };

  it("a bot copies a bigger creature of its own", () => {
    const { s, r } = bladed();
    expect(name(s, r)).toBe("Hill Giant");
  });

  it("can't target the creature it became attached to: with no other creature, no copy", () => {
    const { s: s0, ap, ids } = setup([blade()]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const r = rebelOf(s, ap);
    expect(s.objects[ids[0]!]!.attachedTo).toBe(r);
    expect(name(s, r)).toBe("Rebel Token");
    expect(s.stack).toHaveLength(0);
  });

  it("stops for good once it's attached to another creature, which may copy one in turn", () => {
    const { s: s0, ap, b, r } = bladed();
    const bearId = play(s0, ap, bear());
    let s = settle(run(s0, planActivate(s0, ap, b, 0, [{ kind: "object", id: bearId }])));
    expect(s.objects[b]!.attachedTo).toBe(bearId);
    expect(name(s, r)).toBe("Rebel Token");
    expect(pt(s, r)).toBe("2/2");
    // The bot copies Hill Giant again, now with the Grizzly Bears.
    expect(name(s, bearId)).toBe("Hill Giant");
  });

  it("stops once the Equipment leaves the battlefield", () => {
    const { s: s0, b, r } = bladed();
    expect(name(s0, r)).toBe("Hill Giant");
    const s = destroy(s0, b);
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(name(s, r)).toBe("Rebel Token");
  });

  it("the equipped creature phasing out (the Equipment with it) ends it for good (CR 702.26f, 702.26g)", () => {
    const { s, b, r } = bladed();
    phaseOut(s, [r]);
    expect(s.objects[b]!.zone).toBe("phasedOut");
    phaseIn(s, [r]);
    runStateBasedActions(s);
    expect(s.objects[b]!.attachedTo).toBe(r);
    expect(name(s, r)).toBe("Rebel Token");
  });

  it("declining the copy leaves the creature as it is", () => {
    const { s: s0, ap, b, g } = withBlade();
    let s = settle(run(s0, planCast(s0, ap, b)), ap);
    while (s.pending) {
      const p = s.pending;
      if (p.player !== ap) s = settle(s, ap);
      else if (p.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: g }] });
      else if (p.kind === "chooseMay") s = act(s, { type: "chooseMay", player: ap, yes: false });
      else throw new Error(p.kind);
      s = settle(s, ap);
    }
    expect(name(s, rebelOf(s, ap))).toBe("Rebel Token");
  });
});

describe("Assimilation Aegis", () => {
  /** Aegis cast, exiling an opponent's Serra Angel, with a Grizzly Bears and a Hill Giant of ours to equip. */
  const withAegis = (extra: (s: GameState, ap: PlayerId) => void = () => {}) => {
    const { s: s0, ap, ids } = setup([aegis()]);
    const opp = others(s0, ap)[0]!;
    const a = play(s0, opp, angel());
    const bearId = play(s0, ap, bear());
    const g = play(s0, ap, giant());
    extra(s0, ap);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, ap);
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: a }] }), ap);
    return { s, ap, e: ids[0]!, a, bearId, g, opp };
  };

  it("exiles the target until it leaves, and the creature it's equipped to becomes a copy of that card", () => {
    const { s: s0, ap, e, a, bearId } = withAegis();
    expect(s0.objects[a]!.zone).toBe("exile");
    s0.objects[bearId]!.counters["+1/+1"] = 1;
    const s = settle(run(s0, planActivate(s0, ap, e, 0, [{ kind: "object", id: bearId }])), ap);
    expect(s.objects[e]!.attachedTo).toBe(bearId);
    expect(name(s, bearId)).toBe("Serra Angel");
    // Its counters still apply (rulings).
    expect(pt(s, bearId)).toBe("5/5");
  });

  it("moved to another creature: the first stops being a copy, the second becomes one", () => {
    const { s: s0, ap, e, bearId, g } = withAegis();
    let s = settle(run(s0, planActivate(s0, ap, e, 0, [{ kind: "object", id: bearId }])), ap);
    s = settle(run(s, planActivate(s, ap, e, 0, [{ kind: "object", id: g }])), ap);
    expect(name(s, bearId)).toBe("Grizzly Bears");
    expect(name(s, g)).toBe("Serra Angel");
  });

  it("with no creature card exiled with it, nothing becomes a copy", () => {
    const { s: s0, ap, ids } = setup([aegis()]);
    const bearId = play(s0, ap, bear());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "none" }] }), ap);
    s = settle(run(s, planActivate(s, ap, ids[0]!, 0, [{ kind: "object", id: bearId }])), ap);
    expect(s.objects[ids[0]!]!.attachedTo).toBe(bearId);
    expect(name(s, bearId)).toBe("Grizzly Bears");
  });

  it("with two creature cards exiled with it (Panharmonicon), you choose one each time", () => {
    let second: ObjectId = "";
    const { s: s0, ap, e, a, bearId, opp } = withAegis((s, ap) => {
      play(s, ap, panharmonicon());
      second = play(s, others(s, ap)[1]!, giant());
    });
    let s = s0;
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: second }] }), ap);
    expect(opp).toBeDefined();
    expect(s.objects[a]!.zone).toBe("exile");
    expect(s.objects[second]!.zone).toBe("exile");
    s = settle(run(s, planActivate(s, ap, e, 0, [{ kind: "object", id: bearId }])), ap);
    const p = s.pending;
    expect(p?.kind).toBe("chooseOption");
    if (p?.kind !== "chooseOption") return;
    expect(p.what).toBe("aegisCopy");
    expect(p.labels!.sort()).toEqual(["Hill Giant", "Serra Angel"]);
    // A bot would take the bigger one.
    expect(botActions(s, ap)[0]).toMatchObject({ type: "chooseOption", choice: a });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: second }), ap);
    expect(name(s, bearId)).toBe("Hill Giant");
  });

  it("leaving the battlefield returns the exiled card, and the creature stops being a copy", () => {
    const { s: s0, ap, e, a, bearId } = withAegis();
    let s = settle(run(s0, planActivate(s0, ap, e, 0, [{ kind: "object", id: bearId }])), ap);
    expect(name(s, bearId)).toBe("Serra Angel");
    s = settle(destroy(s, e), ap);
    expect(s.objects[a]!.zone).toBe("battlefield");
    expect(name(s, bearId)).toBe("Grizzly Bears");
  });
});
