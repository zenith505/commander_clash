// Round 399 (Lane A): permanents with the abilities of cards they exiled. Koh, the Face Stealer ("Choose a creature card
// exiled with Koh", "all activated and triggered abilities of the last chosen card", CR 607.2a, 607.2d, 607.4), Idris,
// Soul of the TARDIS (an artifact exiled until Idris leaves, then its activated and triggered abilities and +X/+X) and
// Territory Forge ("all activated abilities of the exiled card"). Borrowed leaves-the-battlefield abilities look back
// (CR 603.10a).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";
import { abilitiesOf } from "../src/cards";
import { manaAbilitiesOn } from "../src/manaabilities";

// Real card data (Scryfall).
const traveler = (): CardDef => ({"oracleId":"a30907c0-fbde-4fd3-a8c7-f304305fcea7","name":"Doomed Traveler","manaCost":"{W}","cmc":1,"typeLine":"Creature — Human Soldier","supertypes":[],"types":["Creature"],"subtypes":["Human","Soldier"],"oracleText":"When this creature dies, create a 1/1 white Spirit creature token with flying.","power":"1","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/5/652c3bbb-cac8-47ad-81de-41e954e17a29.jpg?1783940996","artUrl":"https://cards.scryfall.io/art_crop/front/6/5/652c3bbb-cac8-47ad-81de-41e954e17a29.jpg?1783940996","commanderLegal":"legal","set":"isd","releasedAt":"2011-09-30","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const forestCard = (): CardDef => ({"oracleId":"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6","name":"Forest","manaCost":"","cmc":0,"typeLine":"Basic Land — Forest","supertypes":["Basic"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","artUrl":"https://cards.scryfall.io/art_crop/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const grizzly = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const wellspring = (): CardDef => ({"oracleId":"5b5ef43b-13fd-4461-8d2d-18be65e9a790","name":"Ichor Wellspring","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"When this artifact enters or is put into a graveyard from the battlefield, draw a card.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/6/e6815c12-95ba-44f2-9115-3504d4d0a097.jpg?1783919759","artUrl":"https://cards.scryfall.io/art_crop/front/e/6/e6815c12-95ba-44f2-9115-3504d4d0a097.jpg?1783919759","commanderLegal":"legal","set":"brr","releasedAt":"2022-11-18","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const idris = (): CardDef => ({"oracleId":"abb5210f-597c-450d-9239-6253a9136680","name":"Idris, Soul of the TARDIS","manaCost":"{1}{U}{R}","cmc":3,"typeLine":"Legendary Creature — Human Incarnation","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Incarnation"],"oracleText":"Vanishing 3\nImprint — When Idris enters, exile another artifact you control until Idris leaves the battlefield.\nIdris has all activated and triggered abilities of the exiled card and gets +X/+X, where X is the exiled card's mana value.","power":"3","toughness":"3","colors":["R","U"],"colorIdentity":["R","U"],"keywords":["Vanishing","Imprint"],"imageUrl":"https://cards.scryfall.io/normal/front/0/1/013fe4db-615c-433f-a1cf-b5144cd877a3.jpg?1783914535","artUrl":"https://cards.scryfall.io/art_crop/front/0/1/013fe4db-615c-433f-a1cf-b5144cd877a3.jpg?1783914535","commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const koh = (): CardDef => ({"oracleId":"2bbb33e3-7d03-457c-92bb-b0c943615fa1","name":"Koh, the Face Stealer","manaCost":"{4}{B}{B}","cmc":6,"typeLine":"Legendary Creature — Shapeshifter Spirit","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Shapeshifter","Spirit"],"oracleText":"When Koh enters, exile up to one other target creature.\nWhenever another nontoken creature dies, you may exile it.\nPay 1 life: Choose a creature card exiled with Koh.\nKoh has all activated and triggered abilities of the last chosen card.","power":"6","toughness":"6","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/8/28f6fa32-5058-4c29-9ba8-9d8f2057eb6d.jpg?1783904969","artUrl":"https://cards.scryfall.io/art_crop/front/2/8/28f6fa32-5058-4c29-9ba8-9d8f2057eb6d.jpg?1783904969","commanderLegal":"legal","set":"tla","releasedAt":"2025-11-21","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const mindStone = (): CardDef => ({"oracleId":"c97361b5-af16-4a7b-af85-a429dbaf4ad2","name":"Mind Stone","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/7/f/7fdef0b6-a3b9-4752-bce6-53c0140a1693.jpg?1783906237","artUrl":"https://cards.scryfall.io/art_crop/front/7/f/7fdef0b6-a3b9-4752-bce6-53c0140a1693.jpg?1783906237","commanderLegal":"legal","set":"fic","releasedAt":"2025-06-13","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const murder = (): CardDef => ({"oracleId":"938b4e2c-88d9-4637-bc00-e228920c9a78","name":"Murder","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target creature.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","artUrl":"https://cards.scryfall.io/art_crop/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const pyromancer = (): CardDef => ({"oracleId":"29b3cb3e-aeb1-43eb-8095-9f7881aa34bd","name":"Prodigal Pyromancer","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"{T}: This creature deals 1 damage to any target.","power":"1","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/7/97787109-408e-42d3-acc5-300f5f5bf2ff.jpg?1783943143","artUrl":"https://cards.scryfall.io/art_crop/front/9/7/97787109-408e-42d3-acc5-300f5f5bf2ff.jpg?1783943143","commanderLegal":"legal","set":"plc","releasedAt":"2007-02-02","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const forge = (): CardDef => ({"oracleId":"a14d89b6-23eb-4337-8dee-93c39b0efbf1","name":"Territory Forge","manaCost":"{4}{R}","cmc":5,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"When this artifact enters, if you cast it, exile target artifact or land.\nThis artifact has all activated abilities of the exiled card.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/6/16cd6bde-29ec-4de2-b369-bb3e1d2714d9.jpg?1783911989","artUrl":"https://cards.scryfall.io/art_crop/front/1/6/16cd6bde-29ec-4de2-b369-bb3e1d2714d9.jpg?1783911989","commanderLegal":"legal","set":"big","releasedAt":"2024-04-19","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
/**
 * Everyone passes until the stack is empty. `me`'s trigger targets are `targets`, "you may" is `may`; other players'
 * questions are answered as the bots would. Stops at any other question of `me`'s.
 */
const settle = (s: GameState, me?: PlayerId, opts: { may?: boolean; targets?: TargetChoice[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: opts.may ?? true });
    else if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets ?? [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const ch = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!);
const pt = (s: GameState, id: ObjectId) => `${ch(s, id).power}/${ch(s, id).toughness}`;
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const inHand = (s: GameState, pid: PlayerId, def: CardDef): ObjectId => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
const inYard = (s: GameState, pid: PlayerId, def: CardDef): ObjectId => {
  const id = inHand(s, pid, def);
  s.players[pid]!.hand.splice(s.players[pid]!.hand.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  invalidateCharacteristics(s);
  return id;
};
const abilityIndex = (s: GameState, id: ObjectId, re: RegExp) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => re.test(a.text));
/** Casts a card from `pid`'s hand and lets everything resolve, `targets` for the triggers it causes. */
const castIt = (s: GameState, pid: PlayerId, id: ObjectId, targets?: TargetChoice[], triggerTargets?: TargetChoice[]) => settle(run(s, planCast(s, pid, id, targets)), pid, { targets: triggerTargets });
/** Murder on a creature, cast by `pid`. */
const kill = (s: GameState, pid: PlayerId, victim: ObjectId) => {
  Object.assign(s.players[pid]!.manaPool, { B: 2, C: 1 });
  return castIt(s, pid, inHand(s, pid, murder()), [tgt(victim)]);
};

describe("round 399: parse", () => {
  it("every card of the round is fully supported", () => {
    for (const d of [koh(), idris(), forge()]) expect(isFullySupported(d), d.name).toBe(true);
  });
});

describe("round 399: Koh, the Face Stealer", () => {
  it("exiles a creature as it enters, then has its activated abilities once that card is chosen", () => {
    const { s: s0, ap, opp } = setup([]);
    const pyro = putOnBattlefield(s0, opp, pyromancer());
    const k0 = inHand(s0, ap, koh());
    let s = castIt(s0, ap, k0, undefined, [tgt(pyro)]);
    expect(zone(s, pyro)).toBe("exile");
    const k = s.battlefield.find((id) => s.objects[id]!.cardId === koh().oracleId)!;
    s.objects[k]!.controlledSinceTurn = -1; // not summoning sick, for the {T} ability it borrows
    // Nothing chosen yet: none of its abilities.
    expect(abilityIndex(s, k, /deals 1 damage/)).toBe(-1);
    const life = s.players[ap]!.life;
    s = settle(run(s, planActivate(s, ap, k, abilityIndex(s, k, /^Pay 1 life/))), ap);
    expect(s.players[ap]!.life).toBe(life - 1);
    expect(s.objects[k]!.chosen?.card?.id).toBe(pyro);
    const i = abilityIndex(s, k, /deals 1 damage/);
    expect(i).toBeGreaterThan(-1);
    const oppLife = s.players[opp]!.life;
    s = settle(run(s, planActivate(s, ap, k, i, [{ kind: "player", id: opp }])), ap);
    expect(s.players[opp]!.life).toBe(oppLife - 1);
    // "~" in it is Koh: Koh is tapped.
    expect(s.objects[k]!.tapped).toBe(true);
  });

  it("may exile another nontoken creature that dies; with several, the choice is asked, and the last chosen card's dies ability looks back as Koh dies (CR 603.10a)", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, koh());
    const pyro = putOnBattlefield(s0, opp, pyromancer());
    const trav = putOnBattlefield(s0, opp, traveler());
    let s = kill(s0, ap, pyro);
    s = kill(s, ap, trav);
    expect(zone(s, pyro)).toBe("exile");
    expect(zone(s, trav)).toBe("exile");
    // The opponent's Doomed Traveler made its own Spirit as it died.
    const spirits = (st: GameState, pid: PlayerId) => st.battlefield.filter((id) => st.objects[id]!.isToken && st.objects[id]!.controller === pid && ch(st, id).name.startsWith("Spirit")).length;
    expect(spirits(s, opp)).toBe(1);
    s = run(s, planActivate(s, ap, k, abilityIndex(s, k, /^Pay 1 life/)));
    s = settle(s, ap);
    expect(s.pending?.kind === "chooseOption" && s.pending.what).toBe("kohCard");
    if (s.pending?.kind !== "chooseOption") throw new Error("no choice");
    expect([...s.pending.options].sort()).toEqual([pyro, trav].sort());
    s = settle(act(s, { type: "chooseOption", player: ap, choice: trav }), ap);
    expect(s.objects[k]!.chosen?.card?.id).toBe(trav);
    // The Pyromancer's ability isn't Koh's any more: only the last chosen card's.
    expect(abilityIndex(s, k, /deals 1 damage/)).toBe(-1);
    expect(abilitiesOf(s, s.objects[k]!).triggers.some((t) => t.event === "selfDies")).toBe(true);
    s = kill(s, ap, k);
    expect(zone(s, k)).toBe("graveyard");
    expect(spirits(s, ap)).toBe(1);
  });

  it("a token that dies isn't exiled, and the abilities go once the chosen card leaves exile (CR 400.7)", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, koh());
    const pyro = putOnBattlefield(s0, opp, pyromancer());
    let s = kill(s0, ap, pyro);
    s = settle(run(s, planActivate(s, ap, k, abilityIndex(s, k, /^Pay 1 life/))), ap);
    expect(abilityIndex(s, k, /deals 1 damage/)).toBeGreaterThan(-1);
    // The card goes back to its owner's hand: a new object, not the chosen card.
    s.players[opp]!.exile.splice(s.players[opp]!.exile.indexOf(pyro), 1);
    s.objects[pyro]!.zone = "hand";
    s.objects[pyro]!.zoneChanges = (s.objects[pyro]!.zoneChanges ?? 0) + 1;
    s.players[opp]!.hand.push(pyro);
    invalidateCharacteristics(s);
    expect(abilityIndex(s, k, /deals 1 damage/)).toBe(-1);
  });

  it("a Koh that leaves and returns is a new object, with nothing exiled with it or chosen (CR 400.7)", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, koh());
    const pyro = putOnBattlefield(s0, opp, pyromancer());
    let s = kill(s0, ap, pyro);
    s = settle(run(s, planActivate(s, ap, k, abilityIndex(s, k, /^Pay 1 life/))), ap);
    s.objects[k]!.zoneChanges = (s.objects[k]!.zoneChanges ?? 0) + 1;
    delete s.objects[k]!.chosen;
    invalidateCharacteristics(s);
    expect(abilityIndex(s, k, /deals 1 damage/)).toBe(-1);
    const after = settle(run(s, planActivate(s, ap, k, abilityIndex(s, k, /^Pay 1 life/))), ap);
    expect(after.objects[k]!.chosen?.card).toBeUndefined();
  });

  it("bots choose the card with abilities to lend, and don't pay life again for the same card", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, koh());
    const bears = putOnBattlefield(s0, opp, grizzly());
    const pyro = putOnBattlefield(s0, opp, pyromancer());
    let s = kill(s0, ap, bears);
    s = kill(s, ap, pyro);
    const choose = abilityIndex(s, k, /^Pay 1 life/);
    // No land to play and no mana for anything else first.
    for (const id of s.players[ap]!.hand.splice(0)) s.objects[id]!.zone = "library", s.players[ap]!.library.push(id);
    for (const id of s.battlefield) if (s.objects[id]!.controller === ap && id !== k) s.objects[id]!.tapped = true;
    invalidateCharacteristics(s);
    const activatesChoose = (st: GameState) => botActions(st, ap).some((a) => a.type === "activateAbility" && a.objectId === k && a.index === choose);
    expect(activatesChoose(s)).toBe(true);
    s = run(s, planActivate(s, ap, k, choose));
    s = settle(s, ap);
    if (s.pending?.kind !== "chooseOption") throw new Error("no choice");
    s = settle(run(s, botActions(s, ap)), ap);
    expect(s.objects[k]!.chosen?.card?.id).toBe(pyro);
    expect(activatesChoose(s)).toBe(false);
  });
});

describe("round 399: Idris, Soul of the TARDIS", () => {
  it("exiles another artifact until it leaves, gets +X/+X and its triggered abilities; as Idris dies, the borrowed leaves ability looks back (CR 603.10a), and the card returns", () => {
    const { s: s0, ap } = setup([]);
    const well = putOnBattlefield(s0, ap, wellspring());
    const i0 = inHand(s0, ap, idris());
    let s = castIt(s0, ap, i0);
    const i = s.battlefield.find((id) => s.objects[id]!.cardId === idris().oracleId)!;
    expect(zone(s, well)).toBe("exile");
    expect(s.objects[i]!.counters.time).toBe(3);
    // Ichor Wellspring's mana value is 2.
    expect(pt(s, i)).toBe("5/5");
    expect(abilitiesOf(s, s.objects[i]!).triggers.filter((t) => t.event === "selfToGraveyard").length).toBe(1);
    const hand = s.players[ap]!.hand.length;
    s = kill(s, ap, i);
    expect(zone(s, i)).toBe("graveyard");
    // The Wellspring is back (CR 610.3), and draws as it enters; the ability Idris had from it drew one as Idris died.
    expect(s.battlefield.some((id) => s.objects[id]!.cardId === wellspring().oracleId)).toBe(true);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });

  it("has the exiled artifact's activated abilities, mana abilities among them", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, solRing());
    const i0 = inHand(s0, ap, idris());
    const s = castIt(s0, ap, i0);
    const i = s.battlefield.find((id) => s.objects[id]!.cardId === idris().oracleId)!;
    expect(pt(s, i)).toBe("4/4");
    expect(manaAbilitiesOn(s, s.objects[i]!).map((m) => m.text)).toContain("{T}: Add {C}{C}.");
  });

  it("with no other artifact, nothing is exiled and Idris is 3/3", () => {
    const { s: s0, ap } = setup([]);
    const i0 = inHand(s0, ap, idris());
    const s = castIt(s0, ap, i0);
    const i = s.battlefield.find((id) => s.objects[id]!.cardId === idris().oracleId)!;
    expect(pt(s, i)).toBe("3/3");
  });

  it("gone before its enters ability resolves, nothing is exiled (CR 610.3c)", () => {
    const { s: s0, ap, opp } = setup([]);
    const ring = putOnBattlefield(s0, ap, solRing());
    const i0 = inHand(s0, ap, idris());
    let s = run(s0, planCast(s0, ap, i0));
    for (let n = 0; n < 50 && !s.stack.some((x) => x.kind === "ability"); n++) s = act(s, s.pending ? botActions(s, s.pending.player)[0]! : { type: "passPriority", player: waitingOn(s)! });
    const i = s.battlefield.find((id) => s.objects[id]!.cardId === idris().oracleId)!;
    s = kill(s, ap, i);
    expect(s.objects[i]!.zone).toBe("graveyard");
    expect(zone(s, ring)).toBe("battlefield");
  });
});

describe("round 399: Territory Forge", () => {
  it("cast, it exiles target artifact and has its activated abilities, \"~\" in them being the Forge (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const stone = putOnBattlefield(s0, opp, mindStone());
    const f0 = inHand(s0, ap, forge());
    let s = castIt(s0, ap, f0, undefined, [tgt(stone)]);
    const f = s.battlefield.find((id) => s.objects[id]!.cardId === forge().oracleId)!;
    expect(zone(s, stone)).toBe("exile");
    expect(manaAbilitiesOn(s, s.objects[f]!).map((m) => m.text)).toContain("{T}: Add {C}.");
    const draw = abilityIndex(s, f, /Sacrifice/);
    expect(draw).toBeGreaterThan(-1);
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planActivate(s, ap, f, draw)), ap);
    expect(zone(s, f)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("a basic land exiled gives its intrinsic mana ability (CR 305.6), and no triggered abilities are borrowed", () => {
    const { s: s0, ap, opp } = setup([]);
    const land = putOnBattlefield(s0, opp, forestCard());
    const well = putOnBattlefield(s0, opp, wellspring());
    const f0 = inHand(s0, ap, forge());
    let s = castIt(s0, ap, f0, undefined, [tgt(land)]);
    const f = s.battlefield.find((id) => s.objects[id]!.cardId === forge().oracleId)!;
    expect(manaAbilitiesOn(s, s.objects[f]!).map((m) => m.text)).toContain("{T}: Add {G}.");
    // Another Forge exiling an artifact with a triggered ability doesn't get that ability (rulings).
    const g0 = inHand(s, ap, forge());
    s = castIt(s, ap, g0, undefined, [tgt(well)]);
    const g = s.battlefield.find((id) => s.objects[id]!.cardId === forge().oracleId && id !== f)!;
    expect(zone(s, well)).toBe("exile");
    expect(abilitiesOf(s, s.objects[g]!).triggers.some((t) => t.event === "selfToGraveyard")).toBe(false);
  });

  it("put onto the battlefield without being cast, it exiles nothing", () => {
    const { s: s0, ap, opp } = setup([]);
    const stone = putOnBattlefield(s0, opp, mindStone());
    const f = putOnBattlefield(s0, ap, forge());
    const s = settle(s0, ap);
    expect(zone(s, stone)).toBe("battlefield");
    expect(abilityIndex(s, f, /Sacrifice/)).toBe(-1);
  });
});
