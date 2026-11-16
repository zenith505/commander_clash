// Round 389: The Pandorica's "Untap another target nonland permanent, then it phases out. It can't phase in for as long as
// ~ remains tapped. When ~ becomes untapped or leaves the battlefield, that permanent phases in." (CR 702.26, 611.2b,
// 603.7c); Over the Top's reveal for every player, the permanent cards among them entering at once (CR 110.4a, 303.4f);
// and Barroom Brawl's fight with a creature the opponent to your left controls, which that player may copy (CR 707.10).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { phaseOut } from "../src/phasing";
import { botActions, invalidateCharacteristics, isFullySupported, moveObject, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const pandorica = (): CardDef => ({"oracleId":"94d5c904-6504-4df2-b242-daf88a988475","name":"The Pandorica","manaCost":"{2}{W}","cmc":3,"typeLine":"Legendary Artifact","supertypes":["Legendary"],"types":["Artifact"],"subtypes":[],"oracleText":"You may choose not to untap The Pandorica during your untap step.\n{1}{W}, {T}: Untap another target nonland permanent, then it phases out. It can't phase in for as long as The Pandorica remains tapped. When The Pandorica becomes untapped or leaves the battlefield, that permanent phases in. Activate only as a sorcery.","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const overTheTop = (): CardDef => ({"oracleId":"b82d8bdf-e292-490a-aee7-d830cc2c29df","name":"Over the Top","manaCost":"{5}{R}{R}","cmc":7,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Each player reveals a number of cards from the top of their library equal to the number of nonland permanents they control, puts all permanent cards they revealed this way onto the battlefield, and puts the rest into their graveyard.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"bro","releasedAt":"2022-11-18","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const brawl = (): CardDef => ({"oracleId":"d1ce7fcf-42f8-4b35-9ba1-55033c65c43e","name":"Barroom Brawl","manaCost":"{1}{G}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target creature you control fights target creature the opponent to your left controls. Then that player may copy this spell and may choose new targets for the copy.","colors":["G"],"colorIdentity":["G"],"keywords":["Fight"],"commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const twiddle = (): CardDef => ({"oracleId":"773ad2ef-5acc-49ea-8d85-056330e87039","name":"Twiddle","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"You may tap or untap target artifact, creature, or land.","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const disenchant = (): CardDef => ({"oracleId":"a7e97fa9-4b72-4548-b854-5be5f18a6f1a","name":"Disenchant","manaCost":"{1}{W}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target artifact or enchantment.","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","set":"bro","releasedAt":"2022-11-18","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const pacifism = (): CardDef => ({"oracleId":"5f5e0b10-c8cf-450c-bfd3-bcb0528ec330","name":"Pacifism","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const ogre = (): CardDef => ({"oracleId":"83c8a3a6-2e1a-4e26-8847-6d066f42d906","name":"Gray Ogre","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Ogre","supertypes":[],"types":["Creature"],"subtypes":["Ogre"],"oracleText":"","power":"2","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const crawWurm = (): CardDef => ({"oracleId":"6a462a69-3e42-41de-a3aa-a488d9f38d69","name":"Craw Wurm","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Creature — Wurm","supertypes":[],"types":["Creature"],"subtypes":["Wurm"],"oracleText":"","power":"6","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const serra = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const disciple = (): CardDef => ({"oracleId":"2e5440ef-6887-4c79-98f5-49db82406d71","name":"Disciple of Caelus Nin","manaCost":"{4}{W}","cmc":5,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"When this creature enters, starting with you, each player chooses up to five permanents they control. All permanents other than this creature that weren't chosen this way phase out.\nPermanents can't phase in.","power":"3","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","set":"brc","releasedAt":"2022-11-18","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
const target = (id: string): TargetChoice => ({ kind: "object", id });
const opps = (s: GameState, ap: PlayerId) => [1, 2, 3].map((i) => s.turnOrder[(s.turnOrder.indexOf(ap) + i) % 4]!) as [PlayerId, PlayerId, PlayerId];
const named = (s: GameState, name: string) => Object.values(s.objects).filter((o) => s.cards[o.cardId]?.name === name).map((o) => o.id);
/** Pass, and let bots answer every other choice, until the stack and trigger queue are empty; `answer` gives the test's own answer. */
function settle(s: GameState, answer?: (s: GameState) => Action | Action[] | undefined) {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const pid = waitingOn(s)!;
    const mine = answer?.(s);
    if (mine) for (const a of Array.isArray(mine) ? mine : [mine]) s = act(s, a);
    else if (s.pending) s = act(s, botActions(s, pid)[0]!);
    else s = act(s, { type: "passPriority", player: pid });
  }
  return s;
}
/**
 * Plays on (no attacks or blocks, other questions answered as bots) until `done`; `me`'s "keep tapped" question in their
 * untap step is answered with `keep` (the ids kept tapped).
 */
function playUntil(s: GameState, me: PlayerId, keep: (s: GameState) => string[], done: (s: GameState) => boolean, max = 3000) {
  for (let i = 0; i < max; i++) {
    if (done(s)) return s;
    const pid = waitingOn(s)!;
    const p = s.pending;
    if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (p?.kind === "pickPermanents" && p.action === "keepTapped" && pid === me) s = act(s, { type: "pickPermanents", player: pid, ids: keep(s).filter((id) => p.options.includes(id)) });
    else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, p.count) });
    else if (p) s = act(s, botActions(s, pid)[0]!);
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error("never done");
}
/** A card of `pid`'s on top of their library (`at` from the top). */
function onTop(s: GameState, pid: PlayerId, def: CardDef, at = 0) {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.splice(at, 0, id);
  invalidateCharacteristics(s);
  return id;
}
/** A card of `pid`'s in their hand. */
function inHand(s: GameState, pid: PlayerId, def: CardDef) {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
}
const zone = (s: GameState, id: string) => s.objects[id]!.zone;

describe("round 389 cards compile", () => {
  it("The Pandorica, Over the Top and Barroom Brawl are fully supported", () => {
    for (const d of [pandorica(), overTheTop(), brawl()]) expect(isFullySupported(d), d.name).toBe(true);
  });
});

describe("The Pandorica", () => {
  /** Ap's Pandorica activated on b1's tapped Serra Angel, resolved. */
  function locked() {
    const { s: s0, ap } = setup([]);
    const [b1, b2] = opps(s0, ap);
    const box = putOnBattlefield(s0, ap, pandorica());
    const angel = putOnBattlefield(s0, b1, serra());
    s0.objects[angel]!.tapped = true;
    const s = settle(run(s0, planActivate(s0, ap, box, 0, [target(angel)])));
    return { s, ap, b1, b2, box, angel };
  }

  it("untaps the target, then it phases out; it stays phased out while The Pandorica stays tapped", () => {
    let { s, ap, b1, box, angel } = locked();
    expect(zone(s, angel)).toBe("phasedOut");
    expect(s.objects[angel]!.tapped).toBe(false);
    expect(s.objects[box]!.tapped).toBe(true);
    // b1's untap step: the Angel would phase in (CR 702.26a), but can't while The Pandorica stays tapped.
    s = playUntil(s, ap, () => [box], (x) => x.activePlayer === b1 && x.step === "main1");
    expect(zone(s, angel)).toBe("phasedOut");
    // Ap keeps it tapped through their own untap step, and the Angel misses b1's next untap step too.
    s = playUntil(s, ap, () => [box], (x) => x.activePlayer === ap && x.step === "main1");
    expect(s.objects[box]!.tapped).toBe(true);
    s = playUntil(s, ap, () => [box], (x) => x.activePlayer === b1 && x.step === "main1");
    expect(zone(s, angel)).toBe("phasedOut");
  });

  it("when The Pandorica becomes untapped in its controller's untap step, the trigger phases the permanent in", () => {
    let { s, ap, box, angel } = locked();
    s = playUntil(s, ap, () => [], (x) => x.activePlayer === ap && x.step === "upkeep");
    expect(s.objects[box]!.tapped).toBe(false);
    s = settle(s);
    expect(zone(s, angel)).toBe("battlefield");
    expect(s.objects[angel]!.controller).not.toBe(ap);
  });

  it("when The Pandorica leaves the battlefield, the permanent phases in", () => {
    let { s, ap, box, angel } = locked();
    const dis = inHand(s, ap, disenchant());
    s = settle(run(s, planCast(s, ap, dis, [target(box)])));
    expect(zone(s, box)).toBe("graveyard");
    expect(zone(s, angel)).toBe("battlefield");
  });

  it("when something else untaps The Pandorica, the permanent phases in and its lock is over (CR 611.2b)", () => {
    let { s, ap, box, angel } = locked();
    const tw = inHand(s, ap, twiddle());
    s = settle(run(s, planCast(s, ap, tw, [target(box)])), (x) => (x.pending?.kind === "chooseOption" && x.pending.player === ap ? { type: "chooseOption", player: ap, choice: "untap" } : undefined));
    expect(s.objects[box]!.tapped).toBe(false);
    expect(zone(s, angel)).toBe("battlefield");
    expect(s.objects[angel]!.phased).toBeUndefined();
  });

  it("a phased-out Pandorica is treated as though it doesn't exist: the lock is over, and the permanent phases in at its controller's untap step (rulings)", () => {
    let { s, ap, b1, box, angel } = locked();
    phaseOut(s, [box]);
    s = playUntil(s, ap, () => [box], (x) => x.activePlayer === b1 && x.step === "main1");
    expect(zone(s, angel)).toBe("battlefield");
    expect(zone(s, box)).toBe("phasedOut");
  });

  it("an Aura on the permanent phases out with it and back in attached (CR 702.26g)", () => {
    const { s: s0, ap } = setup([]);
    const [b1] = opps(s0, ap);
    const box = putOnBattlefield(s0, ap, pandorica());
    const angel = putOnBattlefield(s0, b1, serra());
    const aura = putOnBattlefield(s0, ap, pacifism());
    s0.objects[aura]!.attachedTo = angel;
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planActivate(s0, ap, box, 0, [target(angel)])));
    expect(zone(s, angel)).toBe("phasedOut");
    expect(zone(s, aura)).toBe("phasedOut");
    const dis = inHand(s, ap, disenchant());
    s = settle(run(s, planCast(s, ap, dis, [target(box)])));
    expect(zone(s, angel)).toBe("battlefield");
    expect(zone(s, aura)).toBe("battlefield");
    expect(s.objects[aura]!.attachedTo).toBe(angel);
  });

  it("not tapped as the ability resolves: the lock never begins, so the permanent phases in at its controller's next untap step", () => {
    const { s: s0, ap } = setup([]);
    const [b1] = opps(s0, ap);
    const box = putOnBattlefield(s0, ap, pandorica());
    const angel = putOnBattlefield(s0, b1, serra());
    let s = run(s0, planActivate(s0, ap, box, 0, [target(angel)]));
    // As if something had untapped it in response.
    s.objects[box]!.tapped = false;
    s = settle(s);
    expect(zone(s, angel)).toBe("phasedOut");
    expect(s.objects[angel]!.phased?.lockWhileTapped).toBeUndefined();
    s = playUntil(s, ap, () => [], (x) => x.activePlayer === b1 && x.step === "main1");
    expect(zone(s, angel)).toBe("battlefield");
  });

  it("Disciple of Caelus Nin's \"Permanents can't phase in\" stops the trigger too", () => {
    let { s, ap, b2, box, angel } = locked();
    putOnBattlefield(s, b2, disciple());
    const dis = inHand(s, ap, disenchant());
    s = settle(run(s, planCast(s, ap, dis, [target(box)])));
    expect(zone(s, box)).toBe("graveyard");
    expect(zone(s, angel)).toBe("phasedOut");
  });

  it("a bot keeps The Pandorica tapped while it locks an opponent's permanent", () => {
    let { s, ap, box } = locked();
    s.players[ap]!.isBot = true;
    s = playUntil(s, -1 as PlayerId, () => [], (x) => x.pending?.kind === "pickPermanents" && x.pending.action === "keepTapped" && x.pending.player === ap);
    const a = botActions(s, ap)[0]!;
    expect(a.type === "pickPermanents" && a.ids).toEqual([box]);
  });
});

describe("Over the Top", () => {
  it("each player reveals as many cards as nonland permanents they control; the permanent cards enter at once, the rest go to the graveyard", () => {
    const { s: s0, ap, ids } = setup([overTheTop()]);
    const [b1, b2] = opps(s0, ap);
    // Ap: Sol Ring and Hill Giant (lands don't count); b1: Serra Angel; b2: nothing nonland.
    putOnBattlefield(s0, ap, solRing());
    putOnBattlefield(s0, ap, giant());
    const angel = putOnBattlefield(s0, b1, serra());
    const ogreCard = onTop(s0, ap, ogre(), 0);
    const div = onTop(s0, ap, divination(), 1);
    const third = s0.players[ap]!.library[2]!;
    const aura = onTop(s0, b1, pacifism(), 0);
    const b2Top = s0.players[b2]!.library[0]!;
    let auraHosts: string[] = [];
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)), (x) => {
      const p = x.pending;
      if (p?.kind === "chooseOption" && p.what === "enchant") auraHosts = [...p.options];
      return undefined;
    });
    expect(zone(s, ogreCard)).toBe("battlefield");
    expect(zone(s, div)).toBe("graveyard");
    expect(zone(s, third)).toBe("library");
    expect(zone(s, aura)).toBe("battlefield");
    // Pacifism enchants something that was already there, not the Gray Ogre entering with it (CR 303.4f).
    const host = s.objects[aura]!.attachedTo;
    expect(host).toBeDefined();
    expect(host).not.toBe(ogreCard);
    expect(auraHosts.some((o) => o.includes(ogreCard))).toBe(false);
    expect(s.objects[aura]!.controller).toBe(b1);
    expect(zone(s, angel)).toBe("battlefield");
    // b2 controls no nonland permanent: nothing revealed.
    expect(zone(s, b2Top)).toBe("library");
    expect(s.players[b2]!.library[0]).toBe(b2Top);
  });

  it("a land card revealed is a permanent card and enters too (CR 110.4a)", () => {
    const { s: s0, ap, ids } = setup([overTheTop()]);
    putOnBattlefield(s0, ap, solRing());
    const top = s0.players[ap]!.library[0]!;
    expect(s0.cards[s0.objects[top]!.cardId]!.name).toBe("Forest");
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(zone(s, top)).toBe("battlefield");
    expect(s.objects[top]!.controller).toBe(ap);
  });
});

describe("Barroom Brawl", () => {
  it("only a creature the opponent to your left controls can be its second target", () => {
    const { s, ap, ids } = setup([brawl()]);
    const [b1, b2] = opps(s, ap);
    const wurm = putOnBattlefield(s, ap, crawWurm());
    const left = putOnBattlefield(s, b1, ogre());
    const across = putOnBattlefield(s, b2, ogre());
    expect(planCast(s, ap, ids[0]!, [target(wurm), target(left)])).not.toBeNull();
    expect(planCast(s, ap, ids[0]!, [target(wurm), target(across)])).toBeNull();
  });

  it("they fight; then the opponent to your left may copy it, with their creature and their own left opponent's", () => {
    const { s: s0, ap, ids } = setup([brawl()]);
    const [b1, b2] = opps(s0, ap);
    const wurm = putOnBattlefield(s0, ap, crawWurm());
    const ogreId = putOnBattlefield(s0, b1, ogre());
    const giantId = putOnBattlefield(s0, b1, giant());
    const elf = putOnBattlefield(s0, b2, elves());
    const asked: PlayerId[] = [];
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(wurm), target(ogreId)])), (x) => {
      if (x.pending?.kind === "chooseMay" && x.pending.source === "Barroom Brawl") asked.push(x.pending.player);
      return undefined;
    });
    expect(zone(s, ogreId)).toBe("graveyard");
    expect(s.objects[wurm]!.damage).toBe(2);
    // b1 (a bot) copied it: Hill Giant fought b2's Llanowar Elves.
    expect(asked[0]).toBe(b1);
    expect(zone(s, elf)).toBe("graveyard");
    expect(zone(s, giantId)).toBe("battlefield");
    expect(s.objects[giantId]!.damage).toBe(1);
    // b2, then asked as the copy resolved, had nothing left to fight with and didn't copy it again.
    expect(asked).toEqual([b1, b2]);
    expect(s.stack.length).toBe(0);
  });

  it("with one target gone, neither deals damage, but the opponent to your left may still copy it (rulings)", () => {
    const { s: s0, ap, ids } = setup([brawl()]);
    const [b1] = opps(s0, ap);
    const wurm = putOnBattlefield(s0, ap, crawWurm());
    const ogreId = putOnBattlefield(s0, b1, ogre());
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(wurm), target(ogreId)]));
    moveObject(s, ogreId, "graveyard");
    invalidateCharacteristics(s);
    const asked: PlayerId[] = [];
    s = settle(s, (x) => {
      const p = x.pending;
      if (p?.kind === "chooseMay" && p.source === "Barroom Brawl") {
        asked.push(p.player);
        return { type: "chooseMay", player: p.player, yes: false };
      }
      return undefined;
    });
    expect(s.objects[wurm]!.damage).toBe(0);
    expect(asked).toEqual([b1]);
  });

  it("with both targets gone it doesn't resolve, so no copy is offered (CR 608.2b)", () => {
    const { s: s0, ap, ids } = setup([brawl()]);
    const [b1] = opps(s0, ap);
    const wurm = putOnBattlefield(s0, ap, crawWurm());
    const ogreId = putOnBattlefield(s0, b1, ogre());
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(wurm), target(ogreId)]));
    moveObject(s, ogreId, "graveyard");
    moveObject(s, wurm, "graveyard");
    invalidateCharacteristics(s);
    let asked = 0;
    s = settle(s, (x) => {
      if (x.pending?.kind === "chooseMay" && x.pending.source === "Barroom Brawl") asked++;
      return undefined;
    });
    expect(asked).toBe(0);
    expect(named(s, "Barroom Brawl").map((id) => zone(s, id))).toEqual(["graveyard"]);
  });
});
