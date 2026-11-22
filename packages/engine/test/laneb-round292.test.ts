// Lane B round B292: Balduvian Shaman's "{T}: Change the text of target white enchantment you control that doesn't have
// cumulative upkeep by replacing all instances of one color word with another. That enchantment gains "Cumulative upkeep
// {1}."" (CR 612, 702.24a, 611.2a) and Guardian Beast's "As long as this creature is untapped, noncreature artifacts you
// control can't be enchanted, they have indestructible, and other players can't gain control of them. This effect doesn't
// remove Auras already attached to those artifacts." (CR 101.2, 303.4i, 701.12b).

import { describe, expect, it } from "vitest";
import { act, mountain, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const balduvianShaman = (): CardDef => ({"oracleId":"3354c3d3-5713-4139-beb2-4fa17f6b47d9","name":"Balduvian Shaman","manaCost":"{U}","cmc":1,"typeLine":"Creature — Human Cleric Shaman","supertypes":[],"types":["Creature"],"subtypes":["Human","Cleric","Shaman"],"oracleText":"{T}: Change the text of target white enchantment you control that doesn't have cumulative upkeep by replacing all instances of one color word with another. (For example, you may change \"black creatures can't attack\" to \"blue creatures can't attack.\") That enchantment gains \"Cumulative upkeep {1}.\" (At the beginning of its controller's upkeep, that player puts an age counter on it, then sacrifices it unless they pay its upkeep cost for each age counter on it.)","power":"1","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/4/74859723-8ddf-4ee6-a0a7-87192c84e8ad.jpg?1783947518","artUrl":"https://cards.scryfall.io/art_crop/front/7/4/74859723-8ddf-4ee6-a0a7-87192c84e8ad.jpg?1783947518","commanderLegal":"legal","set":"ice","releasedAt":"1995-06-03","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const guardianBeast = (): CardDef => ({"oracleId":"34c3aebe-a224-426a-ae06-f3145193313e","name":"Guardian Beast","manaCost":"{3}{B}","cmc":4,"typeLine":"Creature — Beast","supertypes":[],"types":["Creature"],"subtypes":["Beast"],"oracleText":"As long as this creature is untapped, noncreature artifacts you control can't be enchanted, they have indestructible, and other players can't gain control of them. This effect doesn't remove Auras already attached to those artifacts.","power":"2","toughness":"4","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/9/9941f83b-2903-4eab-ac6d-5313e3978fa3.jpg?1783948387","artUrl":"https://cards.scryfall.io/art_crop/front/9/9/9941f83b-2903-4eab-ac6d-5313e3978fa3.jpg?1783948387","commanderLegal":"legal","set":"arn","releasedAt":"1993-12-17","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const absoluteLaw = (): CardDef => ({"oracleId":"f4aa8391-34d5-4ad2-a981-9aa08f8229db","name":"Absolute Law","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"All creatures have protection from red.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/9/59d1f05b-f165-47c7-8a78-3b60ee3298ca.jpg?1783946377","artUrl":"https://cards.scryfall.io/art_crop/front/5/9/59d1f05b-f165-47c7-8a78-3b60ee3298ca.jpg?1783946377","commanderLegal":"legal","set":"usg","releasedAt":"1998-10-12","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const coldSnap = (): CardDef => ({"oracleId":"3dcbcf5e-bdbe-46b3-881e-5ac4030c6e38","name":"Cold Snap","manaCost":"{2}{W}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Cumulative upkeep {2} (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\nAt the beginning of each player's upkeep, this enchantment deals damage to that player equal to the number of snow lands they control.","colors":["W"],"colorIdentity":["W"],"keywords":["Cumulative upkeep"],"imageUrl":"https://cards.scryfall.io/normal/front/8/1/81b87a58-b20c-4f38-afa3-59d398195740.jpg?1783947527","artUrl":"https://cards.scryfall.io/art_crop/front/8/1/81b87a58-b20c-4f38-afa3-59d398195740.jpg?1783947527","commanderLegal":"legal","set":"ice","releasedAt":"1995-06-03","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const shatter = (): CardDef => ({"oracleId":"84d32e68-72b9-432d-a023-7bc6a26b8ad0","name":"Shatter","manaCost":"{1}{R}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target artifact.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/2/929a41f7-f52d-4190-a80c-5ceb3e368a31.jpg?1783935294","artUrl":"https://cards.scryfall.io/art_crop/front/9/2/929a41f7-f52d-4190-a80c-5ceb3e368a31.jpg?1783935294","commanderLegal":"legal","set":"rix","releasedAt":"2018-01-19","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const hijack = (): CardDef => ({"oracleId":"fd5651f7-52f8-4845-8a1b-32e5d2e9b00e","name":"Hijack","manaCost":"{1}{R}{R}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Gain control of target artifact or creature until end of turn. Untap it. It gains haste until end of turn.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/1/519c5660-4daf-4404-b808-66d1c840ab70.jpg?1783935743","artUrl":"https://cards.scryfall.io/art_crop/front/5/1/519c5660-4daf-4404-b808-66d1c840ab70.jpg?1783935743","commanderLegal":"legal","set":"xln","releasedAt":"2017-09-29","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const animateArtifact = (): CardDef => ({"oracleId":"2dd7a4dc-902a-4e85-8a3b-c96a898fba86","name":"Animate Artifact","manaCost":"{3}{U}","cmc":4,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant artifact\nAs long as enchanted artifact isn't a creature, it's an artifact creature with power and toughness each equal to its mana value.","colors":["U"],"colorIdentity":["U"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/6/6/664b46f5-0424-4f4e-9f26-6bd2cf5e0357.jpg?1783948707","artUrl":"https://cards.scryfall.io/art_crop/front/6/6/664b46f5-0424-4f4e-9f26-6bd2cf5e0357.jpg?1783948707","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const comaVeil = (): CardDef => ({"oracleId":"c062bd12-34cf-4177-92d4-8ce91206989d","name":"Coma Veil","manaCost":"{4}{U}","cmc":5,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant artifact or creature\nEnchanted permanent doesn't untap during its controller's untap step.","colors":["U"],"colorIdentity":["U"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/2/d/2d5b820c-fd07-4e1f-9451-da9267347acd.jpg?1783942575","artUrl":"https://cards.scryfall.io/art_crop/front/2/d/2d5b820c-fd07-4e1f-9451-da9267347acd.jpg?1783942575","commanderLegal":"legal","set":"ala","releasedAt":"2008-10-03","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const shiftingLoyalties = (): CardDef => ({"oracleId":"0ee9a743-c678-4a76-b106-53f57a84848d","name":"Shifting Loyalties","manaCost":"{5}{U}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Exchange control of two target permanents that share a card type. (Artifact, creature, enchantment, land, and planeswalker are card types.)","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/d/ed9ff175-2e4c-4658-813e-1bfb4b9a6ca0.jpg?1783938702","artUrl":"https://cards.scryfall.io/art_crop/front/e/d/ed9ff175-2e4c-4658-813e-1bfb4b9a6ca0.jpg?1783938702","commanderLegal":"legal","set":"frf","releasedAt":"2015-01-23","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const mindStone = (): CardDef => ({"oracleId":"c97361b5-af16-4a7b-af85-a429dbaf4ad2","name":"Mind Stone","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/7/f/7fdef0b6-a3b9-4752-bce6-53c0140a1693.jpg?1783906237","artUrl":"https://cards.scryfall.io/art_crop/front/7/f/7fdef0b6-a3b9-4752-bce6-53c0140a1693.jpg?1783906237","commanderLegal":"legal","set":"fic","releasedAt":"2025-06-13","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const broodingSaurian = (): CardDef => ({"oracleId":"2fb7f844-edaf-43ef-9121-318baf9ec9ce","name":"Brooding Saurian","manaCost":"{2}{G}{G}","cmc":4,"typeLine":"Creature — Lizard","supertypes":[],"types":["Creature"],"subtypes":["Lizard"],"oracleText":"At the beginning of each end step, each player gains control of all nontoken permanents they own.","power":"4","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/5/252ef807-f861-4dcf-8e52-9260301c729a.jpg?1783943332","artUrl":"https://cards.scryfall.io/art_crop/front/2/5/252ef807-f861-4dcf-8e52-9260301c729a.jpg?1783943332","commanderLegal":"legal","set":"csp","releasedAt":"2006-07-21","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const inHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
const tap = (s: GameState, id: ObjectId, tapped = true) => {
  s.objects[id]!.tapped = tapped;
  invalidateCharacteristics(s);
};
const kw = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!).keywords;

describe("Lane B round B292: Balduvian Shaman", () => {
  const board = () => {
    const { s, ap, opp } = setup([]);
    const shaman = putOnBattlefield(s, ap, balduvianShaman());
    const law = putOnBattlefield(s, ap, absoluteLaw());
    const snap = putOnBattlefield(s, ap, coldSnap());
    const theirs = putOnBattlefield(s, opp, absoluteLaw());
    const bears = putOnBattlefield(s, opp, { ...coldSnap(), name: "Grizzly Bears", oracleId: "bears", typeLine: "Creature — Bear", types: ["Creature"], subtypes: ["Bear"], oracleText: "", manaCost: "{1}{G}", cmc: 2, colors: ["G"], power: "2", toughness: "2", keywords: [] } as CardDef);
    invalidateCharacteristics(s);
    return { s, ap, opp, shaman, law, snap, theirs, bears };
  };

  it("compiles fully", () => {
    supported(balduvianShaman(), absoluteLaw(), coldSnap());
  });

  it("targets only a white enchantment you control that doesn't have cumulative upkeep", () => {
    const { s, ap, shaman, law, snap, theirs } = board();
    expect(planActivate(s, ap, shaman, 0, [tgt(law)])).not.toBeNull();
    // Cold Snap has cumulative upkeep printed; the opponent's Absolute Law isn't yours.
    expect(planActivate(s, ap, shaman, 0, [tgt(snap)])).toBeNull();
    expect(planActivate(s, ap, shaman, 0, [tgt(theirs)])).toBeNull();
  });

  it("changes a color word (chosen as it resolves), then the enchantment has cumulative upkeep {1} for good", () => {
    const { s: s0, ap, opp, shaman, law, bears } = board();
    expect(kw(s0, bears)).toContain("Protection from red");
    let s = settle(run(s0, planActivate(s0, ap, shaman, 0, [tgt(law)])));
    let p = s.pending;
    expect(p?.kind === "chooseOption" && p.what === "textFrom" && p.player === ap && p.about === law).toBe(true);
    s = act(s, { type: "chooseOption", player: ap, choice: "red" });
    p = s.pending;
    expect(p?.kind === "chooseOption" && p.what === "textTo" && !p.options.includes("red")).toBe(true);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "black" }));
    expect(s.pending).toBeFalsy();
    // Absolute Law now says "protection from black"; the opponent's copy is untouched.
    expect(kw(s, bears)).toContain("Protection from black");
    expect(characteristics(s, s.objects[law]!).grantedAbilities).toEqual(["Cumulative upkeep {1}."]);
    expect(abilitiesOf(s, s.objects[law]!).triggers.some((t) => t.event === "yourUpkeep" && t.body.effects.some((e) => e.type === "cumulativeUpkeep"))).toBe(true);
    // It has cumulative upkeep now, so it can't be the target again.
    s.objects[shaman]!.tapped = false;
    invalidateCharacteristics(s);
    expect(planActivate(s, ap, shaman, 0, [tgt(law)])).toBeNull();
    // At its controller's next upkeep: an age counter, then pay {1} or sacrifice it.
    s = passUntil(s, "upkeep", opp);
    s = passUntil(s, "upkeep", ap);
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    p = s.pending;
    expect(p?.kind === "chooseMay" && p.player === ap && /cumulative upkeep/.test(p.prompt)).toBe(true);
    expect(s.objects[law]!.counters.age).toBe(1);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.objects[law]!.zone).toBe("graveyard");
  });

  it("bots don't give their own enchantment cumulative upkeep without a plan", () => {
    const { s: s0, ap, shaman } = board();
    // Bots use abilities like this in their second main phase.
    const s = passUntil(s0, "main2", ap);
    expect(s.objects[shaman]!.tapped).toBeFalsy();
    const acts = botActions(s, ap);
    expect(acts.some((a) => a.type === "activateAbility" && a.objectId === shaman)).toBe(false);
  });
});

describe("Lane B round B292: Guardian Beast", () => {
  /** The opponent controls Guardian Beast and Sol Ring; the active player has the lands and the spells. */
  const board = (hand: CardDef[]) => {
    const { s, ap, opp, ids } = setup(hand);
    const beast = putOnBattlefield(s, opp, guardianBeast());
    const ring = putOnBattlefield(s, opp, solRing());
    invalidateCharacteristics(s);
    return { s, ap, opp, ids, beast, ring };
  };

  it("compiles fully", () => {
    supported(guardianBeast(), solRing(), shatter(), hijack(), animateArtifact(), comaVeil(), shiftingLoyalties(), mindStone(), broodingSaurian());
  });

  it("noncreature artifacts its controller controls have indestructible while it's untapped", () => {
    const { s: s0, ap, ids, beast, ring } = board([shatter(), shatter()]);
    expect(objHasKeyword(s0, s0.objects[ring]!, "Indestructible")).toBe(true);
    // Not the Beast itself, nor anyone else's artifacts.
    expect(objHasKeyword(s0, s0.objects[beast]!, "Indestructible")).toBe(false);
    const mine = putOnBattlefield(s0, ap, mindStone());
    invalidateCharacteristics(s0);
    expect(objHasKeyword(s0, s0.objects[mine]!, "Indestructible")).toBe(false);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(ring)])));
    expect(s.objects[ring]!.zone).toBe("battlefield");
    tap(s, beast);
    expect(objHasKeyword(s, s.objects[ring]!, "Indestructible")).toBe(false);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(ring)])));
    expect(s.objects[ring]!.zone).toBe("graveyard");
  });

  it("other players can't gain control of them while it's untapped; the rest of the spell still happens", () => {
    const { s: s0, ap, opp, ids, beast, ring } = board([hijack(), hijack()]);
    s0.objects[ring]!.tapped = true;
    putOnBattlefield(s0, ap, mountain);
    putOnBattlefield(s0, ap, mountain);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(ring)])));
    expect(controllerOf(s, s.objects[ring]!)).toBe(opp);
    // "Untap it" still happens (CR 101.2 stops only the control change).
    expect(s.objects[ring]!.tapped).toBe(false);
    expect(s.log.some((l) => /can't gain control of Sol Ring \(Guardian Beast\)/.test(l.text))).toBe(true);
    // Tapped, it doesn't stop the second Hijack; untapping it again doesn't undo that (the effect began, CR 611.2c).
    tap(s, beast);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(ring)])));
    expect(controllerOf(s, s.objects[ring]!)).toBe(ap);
    tap(s, beast, false);
    expect(controllerOf(s, s.objects[ring]!)).toBe(ap);
    // Sol Ring is ap's now, so the opponent's Beast doesn't make it indestructible.
    expect(objHasKeyword(s, s.objects[ring]!, "Indestructible")).toBe(false);
  });

  it("an exchange of control with one of them doesn't happen at all (CR 701.12b)", () => {
    const { s: s0, ap, opp, ids, ring } = board([shiftingLoyalties()]);
    const stone = putOnBattlefield(s0, ap, mindStone());
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(ring), tgt(stone)])));
    expect(controllerOf(s, s.objects[ring]!)).toBe(opp);
    expect(controllerOf(s, s.objects[stone]!)).toBe(ap);
  });

  it("an owner can't take back their artifact from its controller either (Brooding Saurian)", () => {
    const { s: s0, ap, opp } = setup([]);
    // ap controls Guardian Beast and the opponent's Mind Stone.
    putOnBattlefield(s0, ap, guardianBeast());
    const stone = putOnBattlefield(s0, opp, mindStone());
    const other = putOnBattlefield(s0, opp, mindStone());
    putOnBattlefield(s0, opp, broodingSaurian());
    s0.effects.push({ id: "steal", timestamp: s0.nextTimestamp++, controller: ap, sourceName: "test", duration: "game", affected: [stone], mods: [{ kind: "control" }] });
    invalidateCharacteristics(s0);
    expect(controllerOf(s0, s0.objects[stone]!)).toBe(ap);
    expect(controllerOf(s0, s0.objects[other]!)).toBe(opp);
    const s = passUntil(s0, "cleanup");
    expect(controllerOf(s, s.objects[stone]!)).toBe(ap);
  });

  it("no Aura can become attached to them, but one attached already stays", () => {
    const { s: s0, ap, opp, ids, beast, ring } = board([animateArtifact(), comaVeil()]);
    // Animate Artifact can target it (not a targeting rule), but it can't enter attached: it goes to the graveyard (CR 303.4i).
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(ring)])));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(characteristics(s, s.objects[ring]!).types).not.toContain("Creature");
    // Coma Veil attached while the Beast is tapped stays once it untaps.
    tap(s, beast);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(ring)])));
    expect(s.objects[ids[1]!]!.attachedTo).toBe(ring);
    tap(s, beast, false);
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(s.objects[ids[1]!]!.zone).toBe("battlefield");
    expect(s.objects[ids[1]!]!.attachedTo).toBe(ring);
    expect(controllerOf(s, s.objects[ring]!)).toBe(opp);
  });

  it("doesn't stop sacrifices (rulings)", () => {
    const { s: s0, opp } = setup([]);
    putOnBattlefield(s0, opp, guardianBeast());
    const stone = putOnBattlefield(s0, opp, mindStone());
    invalidateCharacteristics(s0);
    expect(abilitiesOf(s0, s0.objects[stone]!).activated.length).toBeGreaterThan(0);
    expect(characteristics(s0, s0.objects[stone]!).cantBeSacrificed).toBeFalsy();
  });
});
