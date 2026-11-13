// Round 339 (Lane A): Kadena's Silencer ("counter all abilities your opponents control" as it's turned face up), Strict
// Proctor (a triggered ability a permanent entering caused, countered unless its controller pays {2}), Reservoir Kraken
// ("any opponent may tap an untapped creature they control. If they do, ..."), Kusari-Gama (damage to a blocking creature,
// then to each other creature defending player controls), Godsend (exiling one of the creatures blocking or blocked by the
// equipped creature, and its name ban) and Hellish Rebuke (a granted trigger about the player who cast it).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, planTurnFaceUp, waitingOn, type Action, type CardDef, type GameState, type ManaType, type PendingDecision, type PlayerId } from "../src";
import { addMana } from "../src/spend";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; other players' questions as the bots would. Stops at any question of `me`'s. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Passes priority until `pid` has it (the stack unchanged by the others). */
const toPriority = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 8 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(waitingOn(s)).toBe(pid);
  return s;
};
const pend = <K extends PendingDecision["kind"]>(s: GameState, kind: K) => {
  expect(s.pending?.kind).toBe(kind);
  return s.pending as Extract<PendingDecision, { kind: K }>;
};
const name = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;
const toHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
const attach = (s: GameState, eq: string, to: string) => {
  s.objects[eq]!.attachedTo = to;
  invalidateCharacteristics(s);
};
/** Declares `attacks`; each defending player's `blocks`; stops in the declare blockers step once blocks are made and the stack is empty, or at a question of `me`'s. */
const toBlocks = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[], blocks: { blocker: string; attacker: string }[], me?: PlayerId) => {
  s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks });
  for (let i = 0; i < 300; i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: blocks.filter((b) => s.objects[b.blocker]!.controller === p.player) });
    else if (p && p.player === me) return s;
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (s.step === "declareBlockers" && !s.stack.length && !s.triggerQueue.length) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  throw new Error("never reached blocks");
};

// Real oracle text (Scryfall).
const kadenasSilencer = (): CardDef => ({"oracleId":"02095128-82cd-4531-b47e-471307746f81","name":"Kadena's Silencer","manaCost":"{1}{U}","cmc":2,"typeLine":"Creature — Snake Wizard","supertypes":[],"types":["Creature"],"subtypes":["Snake","Wizard"],"oracleText":"When this creature is turned face up, counter all abilities your opponents control.\nMegamorph {1}{U} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its megamorph cost and put a +1/+1 counter on it.)","power":"2","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":["Megamorph"],"imageUrl":"https://cards.scryfall.io/normal/front/c/f/cfe101fc-0c3d-461b-8c46-bb1bef97e739.jpg?1783932813","artUrl":"https://cards.scryfall.io/art_crop/front/c/f/cfe101fc-0c3d-461b-8c46-bb1bef97e739.jpg?1783932813","commanderLegal":"legal","set":"c19","releasedAt":"2019-08-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const strictProctor = (): CardDef => ({"oracleId":"b967870d-9773-4ad5-bf06-c3be5465dab9","name":"Strict Proctor","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Spirit Cleric","supertypes":[],"types":["Creature"],"subtypes":["Spirit","Cleric"],"oracleText":"Flying\nWhenever a permanent entering causes a triggered ability to trigger, counter that ability unless its controller pays {2}.","power":"1","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/9/5/95f1e36a-6838-49de-b7dc-697cbcd1e892.jpg?1783927383","artUrl":"https://cards.scryfall.io/art_crop/front/9/5/95f1e36a-6838-49de-b7dc-697cbcd1e892.jpg?1783927383","commanderLegal":"legal","set":"stx","releasedAt":"2021-04-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const reservoirKraken = (): CardDef => ({"oracleId":"42e4d4d8-e4e0-4cf8-a6d0-887a17513280","name":"Reservoir Kraken","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Creature — Kraken","supertypes":[],"types":["Creature"],"subtypes":["Kraken"],"oracleText":"Trample, ward {2}\nAt the beginning of each combat, if this creature is untapped, any opponent may tap an untapped creature they control. If they do, tap this creature and create a 1/1 blue Fish creature token with \"This token can't be blocked.\"","power":"6","toughness":"6","colors":["U"],"colorIdentity":["U"],"keywords":["Trample","Ward"],"imageUrl":"https://cards.scryfall.io/normal/front/0/1/01479b8a-b5a4-4d45-9073-5d24becad45b.jpg?1783922988","artUrl":"https://cards.scryfall.io/art_crop/front/0/1/01479b8a-b5a4-4d45-9073-5d24becad45b.jpg?1783922988","commanderLegal":"legal","set":"snc","releasedAt":"2022-04-29","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const kusariGama = (): CardDef => ({"oracleId":"b5585eb5-4df3-4ae2-8c39-a8e7a9706dc2","name":"Kusari-Gama","manaCost":"{3}","cmc":3,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature has \"{2}: This creature gets +1/+0 until end of turn.\"\nWhenever equipped creature deals damage to a blocking creature, this Equipment deals that much damage to each other creature defending player controls.\nEquip {3} ({3}: Attach to target creature you control. Equip only as a sorcery.)","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/c/6/c6a700bd-6424-4a0c-b055-e8b64cf430ec.jpg?1783944277","artUrl":"https://cards.scryfall.io/art_crop/front/c/6/c6a700bd-6424-4a0c-b055-e8b64cf430ec.jpg?1783944277","commanderLegal":"legal","set":"chk","releasedAt":"2004-10-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const godsend = (): CardDef => ({"oracleId":"dd91f4f2-ea46-48c5-8a80-0dc4ae5b79c4","name":"Godsend","manaCost":"{1}{W}{W}","cmc":3,"typeLine":"Legendary Artifact — Equipment","supertypes":["Legendary"],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +3/+3.\nWhenever equipped creature blocks or becomes blocked by one or more creatures, you may exile one of those creatures.\nYour opponents can't cast spells with the same name as a card exiled with Godsend.\nEquip {3}","colors":["W"],"colorIdentity":["W"],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/2/d/2dcf3975-7f81-4bdd-810d-476f46444b7a.jpg?1783939460","artUrl":"https://cards.scryfall.io/art_crop/front/2/d/2dcf3975-7f81-4bdd-810d-476f46444b7a.jpg?1783939460","commanderLegal":"legal","set":"jou","releasedAt":"2014-05-02","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const hellishRebuke = (): CardDef => ({"oracleId":"5d307515-6ea1-4b1f-8e4b-49bfebfbdfcc","name":"Hellish Rebuke","manaCost":"{2}{B}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Until end of turn, permanents your opponents control gain \"When this permanent deals damage to the player who cast Hellish Rebuke, sacrifice this permanent. You lose 2 life.\"","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/4/b4b558cf-8754-4c4f-87f1-8e6d84b93658.jpg?1783926248","artUrl":"https://cards.scryfall.io/art_crop/front/b/4/b4b558cf-8754-4c4f-87f1-8e6d84b93658.jpg?1783926248","commanderLegal":"legal","set":"afc","releasedAt":"2021-07-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const elvishVisionary = (): CardDef => ({"oracleId":"c6a3a882-a127-4590-93d7-679ef4313efe","name":"Elvish Visionary","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Elf Shaman","supertypes":[],"types":["Creature"],"subtypes":["Elf","Shaman"],"oracleText":"When this creature enters, draw a card.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/9/69f570b5-1629-4b10-8f66-ed9b4355a0a4.jpg?1783908825","artUrl":"https://cards.scryfall.io/art_crop/front/6/9/69f570b5-1629-4b10-8f66-ed9b4355a0a4.jpg?1783908825","commanderLegal":"legal","set":"j25","releasedAt":"2024-11-15","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const prodigalPyromancer = (): CardDef => ({"oracleId":"29b3cb3e-aeb1-43eb-8095-9f7881aa34bd","name":"Prodigal Pyromancer","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"{T}: This creature deals 1 damage to any target.","power":"1","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/7/97787109-408e-42d3-acc5-300f5f5bf2ff.jpg?1783943143","artUrl":"https://cards.scryfall.io/art_crop/front/9/7/97787109-408e-42d3-acc5-300f5f5bf2ff.jpg?1783943143","commanderLegal":"legal","set":"plc","releasedAt":"2007-02-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const mindStone = (): CardDef => ({"oracleId":"c97361b5-af16-4a7b-af85-a429dbaf4ad2","name":"Mind Stone","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/7/f/7fdef0b6-a3b9-4752-bce6-53c0140a1693.jpg?1783906237","artUrl":"https://cards.scryfall.io/art_crop/front/7/f/7fdef0b6-a3b9-4752-bce6-53c0140a1693.jpg?1783906237","commanderLegal":"legal","set":"fic","releasedAt":"2025-06-13","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const mountainCard = (): CardDef => ({ oracleId: "r339-mountain", name: "Mountain", manaCost: "", cmc: 0, typeLine: "Basic Land — Mountain", supertypes: ["Basic"], types: ["Land"], subtypes: ["Mountain"], oracleText: "({T}: Add {R}.)", colors: [], colorIdentity: ["R"], keywords: [] }) as CardDef;

describe("round 339: compiles", () => {
  it("every card of the round", () => supported(kadenasSilencer(), strictProctor(), reservoirKraken(), kusariGama(), godsend(), hellishRebuke()));
});

describe("round 339: Kadena's Silencer", () => {
  it("turned face up: counters each ability an opponent controls on the stack, not their spells nor your own abilities", () => {
    const { s: s0, ap, ids, opp } = setup([kadenasSilencer()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { faceDown: true })));
    expect(s.objects[ids[0]!]!.faceDown).toBeTruthy();
    const mine = putOnBattlefield(s, ap, prodigalPyromancer());
    const theirs = putOnBattlefield(s, opp, prodigalPyromancer());
    putOnBattlefield(s, opp, mountainCard());
    const bolt = toHand(s, opp, lightningBolt());
    s = run(s, planActivate(s, ap, mine, 0, [{ kind: "player", id: opp }]));
    s = toPriority(s, opp);
    s = run(s, planActivate(s, opp, theirs, 0, [{ kind: "player", id: ap }]));
    s = run(s, planCast(s, opp, bolt, [{ kind: "player", id: ap }]));
    expect(s.stack.length).toBe(3);
    s = toPriority(s, ap);
    s = run(s, planTurnFaceUp(s, ap, ids[0]!));
    // Its trigger resolves first: the opponent's ability is countered; their Bolt and your ability stay.
    for (let i = 0; i < 20 && s.stack.length + s.triggerQueue.length > 2; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.stack.map((x) => x.kind)).toEqual(["ability", "spell"]);
    expect(s.stack[0]!.controller).toBe(ap);
    expect(s.stack[1]!.controller).toBe(opp);
    const life = s.players[ap]!.life;
    s = settle(s);
    // The Bolt (3) still hits you; the countered ping doesn't.
    expect(s.players[ap]!.life).toBe(life - 3);
  });
});

describe("round 339: Strict Proctor", () => {
  it("an enters trigger is countered unless its controller pays {2}; paying lets it resolve", () => {
    const { s: s0, ap, ids } = setup([elvishVisionary(), elvishVisionary()]);
    let s = s0;
    putOnBattlefield(s, ap, strictProctor());
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, ids[0]!)), ap);
    // Proctor's trigger resolves first (it's above the Visionary's), asking the Visionary's controller.
    const p = pend(s, "payUnless");
    expect(p.player).toBe(ap);
    expect(p.cost).toBe("{2}");
    s = settle(act(s, { type: "payUnless", player: ap, pay: false }), ap);
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    s = settle(run(s, planCast(s, ap, ids[1]!)), ap);
    pend(s, "payUnless");
    addMana(s, ap, ["C", "C"] as ManaType[], {});
    s = settle(act(s, { type: "payUnless", player: ap, pay: true }), ap);
    // Paid: the second Visionary's draw happens.
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
  });
  it("an opponent's Proctor asks too, each Proctor once; a permanent whose entering triggers nothing isn't asked about", () => {
    const { s: s0, ap, ids, opp } = setup([grizzlyBears(), elvishVisionary()]);
    let s = s0;
    putOnBattlefield(s, opp, strictProctor());
    putOnBattlefield(s, ap, strictProctor());
    s = settle(run(s, planCast(s, ap, ids[0]!)), ap);
    expect(s.pending).toBeNull();
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, ids[1]!)), ap);
    // Two Proctors: two triggers about the same Visionary trigger. Paying the first, then not the second, counters it.
    pend(s, "payUnless");
    addMana(s, ap, ["C", "C"] as ManaType[], {});
    s = settle(act(s, { type: "payUnless", player: ap, pay: true }), ap);
    pend(s, "payUnless");
    s = settle(act(s, { type: "payUnless", player: ap, pay: false }), ap);
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
  });
});

describe("round 339: Reservoir Kraken", () => {
  const toCombat = (s: GameState, ap: PlayerId) => {
    s = passUntil(s, "beginCombat", ap);
    for (let i = 0; i < 20 && !s.pending && (s.stack.length || s.triggerQueue.length || waitingOn(s) !== undefined) && !(s.pending as PendingDecision | null); i++) {
      if (s.stack.some((x) => x.description.startsWith("Reservoir Kraken")) || s.pending) break;
      s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    return s;
  };
  it("each opponent in turn order may tap a creature; one Fish however many did, and the Kraken tapped", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const kraken = putOnBattlefield(s, ap, reservoirKraken());
    const [o1, o2, o3] = [1, 2, 3].map((k) => s.turnOrder[(s.turnOrder.indexOf(ap) + k) % 4]!);
    const a = putOnBattlefield(s, o1!, grizzlyBears());
    const a2 = putOnBattlefield(s, o1!, grizzlyBears());
    const b = putOnBattlefield(s, o2!, grizzlyBears());
    s = toCombat(s, ap);
    s = settle(s, o1);
    let p = pend(s, "chooseOption");
    expect(p.player).toBe(o1);
    expect(p.labels).toEqual(["Tap an untapped creature you control", "Don't"]);
    s = act(s, { type: "chooseOption", player: o1!, choice: "0" });
    // Two of them: which one.
    const pick = pend(s, "pickPermanents");
    expect(pick.action).toBe("tap");
    expect([...pick.options].sort()).toEqual([a, a2].sort());
    s = settle(act(s, { type: "pickPermanents", player: o1!, ids: [a2] }), o2);
    p = pend(s, "chooseOption");
    expect(p.player).toBe(o2);
    expect(p.prompt).toContain("someone already has");
    s = act(s, { type: "chooseOption", player: o2!, choice: "0" });
    // o3 has no creature: not asked.
    s = settle(s, o3);
    expect(s.objects[a2]!.tapped).toBe(true);
    expect(s.objects[a]!.tapped).toBe(false);
    expect(s.objects[b]!.tapped).toBe(true);
    expect(s.objects[kraken]!.tapped).toBe(true);
    const fish = s.battlefield.filter((id) => s.objects[id]!.isToken && name(s, id) === "Fish Token");
    expect(fish.length).toBe(1);
    expect(s.objects[fish[0]!]!.controller).toBe(ap);
  });
  it("no one taps: nothing happens; a tapped Kraken doesn't trigger at all", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const kraken = putOnBattlefield(s, ap, reservoirKraken());
    const o1 = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    putOnBattlefield(s, o1, grizzlyBears());
    s = settle(toCombat(s, ap), o1);
    s = settle(act(s, { type: "chooseOption", player: o1, choice: "none" }), o1);
    expect(s.objects[kraken]!.tapped).toBe(false);
    expect(s.battlefield.some((id) => s.objects[id]!.isToken)).toBe(false);
    const { s: t0, ap: ap2 } = setup([]);
    let t = t0;
    const k2 = putOnBattlefield(t, ap2, reservoirKraken());
    t.objects[k2]!.tapped = true;
    const q1 = t.turnOrder[(t.turnOrder.indexOf(ap2) + 1) % 4]!;
    putOnBattlefield(t, q1, grizzlyBears());
    t = settle(toCombat(t, ap2), q1);
    expect(t.pending).toBeNull();
  });
  it("a bot opponent taps its weakest creature on the turn of the Kraken's controller (it would attack)", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const kraken = putOnBattlefield(s, ap, reservoirKraken());
    const o1 = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    const small = putOnBattlefield(s, o1, grizzlyBears());
    const big = putOnBattlefield(s, o1, { ...grizzlyBears(), oracleId: "r339-big-bears", name: "Big Bears", power: "5", toughness: "5" } as CardDef);
    s = settle(toCombat(s, ap));
    expect(s.objects[kraken]!.tapped).toBe(true);
    expect(s.objects[small]!.tapped).toBe(true);
    expect(s.objects[big]!.tapped).toBe(false);
  });
});

describe("round 339: Kusari-Gama", () => {
  it("combat damage to a blocking creature: that much to each other creature the defending player controls", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const bears = putOnBattlefield(s, ap, grizzlyBears());
    const kg = putOnBattlefield(s, ap, kusariGama());
    attach(s, kg, bears);
    const blocker = putOnBattlefield(s, opp, { ...grizzlyBears(), oracleId: "r339-wall", name: "Big Wall", power: "0", toughness: "5" } as CardDef);
    const other1 = putOnBattlefield(s, opp, grizzlyBears());
    const other2 = putOnBattlefield(s, opp, { ...grizzlyBears(), oracleId: "r339-tough", name: "Tough Bears", power: "2", toughness: "4" } as CardDef);
    const third = s.turnOrder[(s.turnOrder.indexOf(opp) + 1) % 4]!;
    const elsewhere = putOnBattlefield(s, third, grizzlyBears());
    s = toBlocks(s, ap, [{ attacker: bears, defender: opp }], [{ blocker, attacker: bears }]);
    s = settle(passUntil(s, "endCombat", ap));
    expect(s.objects[blocker]!.damage).toBe(2);
    expect(s.objects[other1]!.zone).toBe("graveyard");
    expect(s.objects[other2]!.damage).toBe(2);
    expect(s.objects[elsewhere]!.damage).toBe(0);
    expect(s.objects[bears]!.damage).toBe(0);
  });
  it("noncombat damage from an equipped creature that isn't attacking: its controller chooses the defending player", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const [o1, o2] = [1, 2].map((k) => s.turnOrder[(s.turnOrder.indexOf(ap) + k) % 4]!);
    const atk1 = putOnBattlefield(s, ap, grizzlyBears());
    const atk2 = putOnBattlefield(s, ap, grizzlyBears());
    const pyro = putOnBattlefield(s, ap, prodigalPyromancer());
    const kg = putOnBattlefield(s, ap, kusariGama());
    attach(s, kg, pyro);
    const blocker = putOnBattlefield(s, o1!, { ...grizzlyBears(), oracleId: "r339-wall2", name: "Big Wall", power: "0", toughness: "5" } as CardDef);
    const o1other = putOnBattlefield(s, o1!, { ...grizzlyBears(), oracleId: "r339-one-one", name: "Small Bears", power: "1", toughness: "1" } as CardDef);
    const o2c = putOnBattlefield(s, o2!, { ...grizzlyBears(), oracleId: "r339-one-one-b", name: "Small Bears", power: "1", toughness: "1" } as CardDef);
    s = toBlocks(s, ap, [{ attacker: atk1, defender: o1! }, { attacker: atk2, defender: o2! }], [{ blocker, attacker: atk1 }]);
    s = toPriority(s, ap);
    s = settle(run(s, planActivate(s, ap, pyro, 0, [{ kind: "object", id: blocker }])), ap);
    const p = pend(s, "chooseOption");
    expect(p.what).toBe("defendingPlayer");
    expect([...p.options].sort()).toEqual([String(o1), String(o2)].sort());
    s = settle(act(s, { type: "chooseOption", player: ap, choice: String(o2) }), ap);
    expect(s.objects[o2c]!.zone).toBe("graveyard");
    expect(s.objects[o1other]!.zone).toBe("battlefield");
    expect(s.objects[blocker]!.damage).toBe(1);
  });
  it("damage to a creature that isn't blocking doesn't trigger it", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const pyro = putOnBattlefield(s, ap, prodigalPyromancer());
    const kg = putOnBattlefield(s, ap, kusariGama());
    attach(s, kg, pyro);
    const a = putOnBattlefield(s, opp, grizzlyBears());
    const b = putOnBattlefield(s, opp, { ...grizzlyBears(), oracleId: "r339-one-one-c", name: "Small Bears", power: "1", toughness: "1" } as CardDef);
    s = settle(run(s, planActivate(s, ap, pyro, 0, [{ kind: "object", id: a }])), ap);
    expect(s.pending).toBeNull();
    expect(s.objects[a]!.damage).toBe(1);
    expect(s.objects[b]!.zone).toBe("battlefield");
  });
});

describe("round 339: Godsend", () => {
  it("blocked by two creatures: one trigger, you exile one of them, and opponents can't cast spells with its name", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const bears = putOnBattlefield(s, ap, grizzlyBears());
    const gs = putOnBattlefield(s, ap, godsend());
    attach(s, gs, bears);
    expect(characteristics(s, s.objects[bears]!).power).toBe(5);
    const b1 = putOnBattlefield(s, opp, elvishVisionary());
    const b2 = putOnBattlefield(s, opp, grizzlyBears());
    const vis = toHand(s, opp, elvishVisionary());
    for (let k = 0; k < 2; k++) putOnBattlefield(s, opp, { ...mountainCard(), oracleId: "r339-forest", name: "Forest", typeLine: "Basic Land — Forest", subtypes: ["Forest"], oracleText: "({T}: Add {G}.)" } as CardDef);
    s = toBlocks(s, ap, [{ attacker: bears, defender: opp }], [{ blocker: b1, attacker: bears }, { blocker: b2, attacker: bears }], ap);
    const p = pend(s, "pickPermanents");
    expect(p.player).toBe(ap);
    expect(p.action).toBe("exile");
    expect(p.min).toBe(0);
    expect([...p.options].sort()).toEqual([b1, b2].sort());
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [b1] }), ap);
    expect(s.pending).toBeNull();
    expect(s.objects[b1]!.zone).toBe("exile");
    expect(s.objects[b2]!.zone).toBe("battlefield");
    // Opponents can't cast Elvish Visionary now; you could.
    s = passUntil(s, "main1", opp);
    expect(planCast(s, opp, vis)).toBeNull();
  });
  it("blocking: exiles the attacker; a bot takes the opponent's creature", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const att = putOnBattlefield(s, ap, grizzlyBears());
    const wall = putOnBattlefield(s, opp, grizzlyBears());
    const gs = putOnBattlefield(s, opp, godsend());
    attach(s, gs, wall);
    s = toBlocks(s, ap, [{ attacker: att, defender: opp }], [{ blocker: wall, attacker: att }]);
    expect(s.objects[att]!.zone).toBe("exile");
  });
});

describe("round 339: Hellish Rebuke", () => {
  it("an opponent's permanent that deals damage to the player who cast it: sacrificed, its controller loses 2 life", () => {
    const { s: s0, ap, ids, opp } = setup([hellishRebuke()]);
    let s = s0;
    const pyro = putOnBattlefield(s, opp, prodigalPyromancer());
    const third = s.turnOrder[(s.turnOrder.indexOf(opp) + 1) % 4]!;
    const pyro2 = putOnBattlefield(s, third, prodigalPyromancer());
    const mine = putOnBattlefield(s, ap, prodigalPyromancer());
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    // The other opponent's pings someone else: nothing.
    s = toPriority(act(s, { type: "passPriority", player: ap }), third);
    s = settle(run(s, planActivate(s, third, pyro2, 0, [{ kind: "player", id: opp }])));
    expect(s.objects[pyro2]!.zone).toBe("battlefield");
    // Your own permanent didn't get it.
    s = run(s, planActivate(s, ap, mine, 0, [{ kind: "player", id: ap }]));
    s = settle(s);
    expect(s.objects[mine]!.zone).toBe("battlefield");
    // The opponent's pings you: its ability triggers.
    const life = s.players[opp]!.life;
    s = toPriority(act(s, { type: "passPriority", player: ap }), opp);
    s = settle(run(s, planActivate(s, opp, pyro, 0, [{ kind: "player", id: ap }])));
    expect(s.objects[pyro]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(life - 2);
  });
  it("its granted ability names the caster: shown as the player who cast it; it's gone at end of turn", () => {
    const { s: s0, ap, ids, opp } = setup([hellishRebuke()]);
    let s = s0;
    const pyro = putOnBattlefield(s, opp, prodigalPyromancer());
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    const granted = characteristics(s, s.objects[pyro]!).grantedAbilities;
    expect(granted.length).toBe(1);
    expect(granted[0]).toContain(`⟪caster ${ap}|Hellish Rebuke⟫`);
    s = passUntil(s, "upkeep", opp);
    expect(characteristics(s, s.objects[pyro]!).grantedAbilities.length).toBe(0);
  });
});
