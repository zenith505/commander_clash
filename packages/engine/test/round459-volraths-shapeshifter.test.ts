// Round 459: Volrath's Shapeshifter. "As long as the top card of your graveyard is a creature card, this creature has the
// full text of that card and has the text "{2}: Discard a card." (This creature has that card's name, mana cost, color,
// types, abilities, power, and toughness.)" A text-changing effect (rulings), in layer 3 (CR 613.1c): a copy of it copies
// the Shapeshifter (CR 707.2, rulings), effects of later layers apply to what it has become, changing forms isn't entering
// (rulings: its "enters" abilities don't trigger), and it enters as the card on top (CR 614.12).

import { describe, expect, it } from "vitest";
import { act, addEffect, cast, passAll, putOnBattlefield, setup, target } from "./helpers";
import { characteristics, compileCard, defOf, isFullySupported, moveObject, planActivate, power, runStateBasedActions, toughness, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const shifter = (): CardDef => ({"oracleId":"16e9a4ee-0398-4e76-bc7e-dd2d52056aaf","name":"Volrath's Shapeshifter","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"Creature — Phyrexian Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Phyrexian","Shapeshifter"],"oracleText":"As long as the top card of your graveyard is a creature card, this creature has the full text of that card and has the text \"{2}: Discard a card.\" (This creature has that card's name, mana cost, color, types, abilities, power, and toughness.)\n{2}: Discard a card.","power":"0","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;
const dragon = (): CardDef => ({"oracleId":"711eea87-0fa3-46e0-a42b-fa5a86455f04","name":"Shivan Dragon","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Creature — Dragon","supertypes":[],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Flying\n{R}: This creature gets +1/+0 until end of turn.","power":"5","toughness":"5","colors":["R"],"colorIdentity":["R"],"keywords":["Flying"],"layout":"normal"}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const visionary = (): CardDef => ({"oracleId":"c6a3a882-a127-4590-93d7-679ef4313efe","name":"Elvish Visionary","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Elf Shaman","supertypes":[],"types":["Creature"],"subtypes":["Elf","Shaman"],"oracleText":"When this creature enters, draw a card.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"}) as CardDef;
const clone = (): CardDef => ({"oracleId":"42226b87-0746-4ebf-9fd0-108d508462af","name":"Clone","manaCost":"{3}{U}","cmc":4,"typeLine":"Creature — Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"You may have this creature enter as a copy of any creature on the battlefield.","power":"0","toughness":"0","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;
const arbor = (): CardDef => ({"oracleId":"e996cd67-739c-40f4-b276-0042acf26c71","name":"Dryad Arbor","manaCost":"","cmc":0,"typeLine":"Land Creature — Forest Dryad","supertypes":[],"types":["Land","Creature"],"subtypes":["Forest","Dryad"],"oracleText":"(This land isn't a spell, it's affected by summoning sickness, and it has \"{T}: Add {G}.\")","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"layout":"normal"}) as CardDef;
const delver = (): CardDef => ({"oracleId":"edd531b9-f615-4399-8c8c-1c5e18c4acbf","name":"Delver of Secrets // Insectile Aberration","manaCost":"{U}","cmc":1,"typeLine":"Creature — Human Wizard // Creature — Human Insect","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"At the beginning of your upkeep, look at the top card of your library. You may reveal that card. If an instant or sorcery card is revealed this way, transform this creature.","power":"1","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":["Flying","Transform"],"layout":"transform","faces":[{"name":"Delver of Secrets","manaCost":"{U}","typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"At the beginning of your upkeep, look at the top card of your library. You may reveal that card. If an instant or sorcery card is revealed this way, transform this creature.","power":"1","toughness":"1","colors":["U"]},{"name":"Insectile Aberration","manaCost":"","typeLine":"Creature — Human Insect","supertypes":[],"types":["Creature"],"subtypes":["Human","Insect"],"oracleText":"Flying","power":"3","toughness":"2","colors":["U"],"colorIndicator":["U"]}]}) as CardDef;
const dissenter = (): CardDef => ({"oracleId":"11cb509d-21af-48f1-b355-135ebd3e4bd1","name":"Doomed Dissenter","manaCost":"{1}{B}","cmc":2,"typeLine":"Creature — Human","supertypes":[],"types":["Creature"],"subtypes":["Human"],"oracleText":"When this creature dies, create a 2/2 black Zombie creature token.","power":"1","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":[],"layout":"normal"}) as CardDef;
const wrath = (): CardDef => ({"oracleId":"34515b16-c9a4-4f98-8c77-416a7a523407","name":"Wrath of God","manaCost":"{2}{W}{W}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Destroy all creatures. They can't be regenerated.","colors":["W"],"colorIdentity":["W"],"keywords":[],"layout":"normal"}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"}) as CardDef;
const giant = (): CardDef => ({"oracleId":"d6d72f5f-8f5d-4180-b514-f22ff5482902","name":"Bonecrusher Giant // Stomp","manaCost":"{2}{R} // {1}{R}","cmc":3,"typeLine":"Creature — Giant // Instant — Adventure","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"Whenever this creature becomes the target of a spell, this creature deals 2 damage to that spell's controller.","power":"4","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"adventure","faces":[{"name":"Bonecrusher Giant","manaCost":"{2}{R}","typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"Whenever this creature becomes the target of a spell, this creature deals 2 damage to that spell's controller.","power":"4","toughness":"3","colors":["R"]},{"name":"Stomp","manaCost":"{1}{R}","typeLine":"Instant — Adventure","supertypes":[],"types":["Instant"],"subtypes":["Adventure"],"oracleText":"Damage can't be prevented this turn. Stomp deals 2 damage to any target.","colors":["R"]}]}) as CardDef;
const controlMagic = (): CardDef => ({"oracleId":"cd0d7141-46d2-4aa3-bc77-6b3b4513803e","name":"Control Magic","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nYou control enchanted creature.","colors":["U"],"colorIdentity":["U"],"keywords":["Enchant"],"layout":"normal"}) as CardDef;

const nameOf = (s: GameState, id: string) => defOf(s, s.objects[id]!).name;
const ptOf = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;

/** A game with the Shapeshifter on the active player's battlefield and `hand` in their hand. */
function game(hand: CardDef[] = []) {
  const { s, ap, ids, opp } = setup(hand);
  const sh = putOnBattlefield(s, ap, shifter());
  runStateBasedActions(s);
  return { s, ap, ids, opp, sh };
}

/** A card into its owner's graveyard (on top), then the event ends (state-based actions). */
function toYard(s: GameState, id: string) {
  moveObject(s, id, "graveyard");
  runStateBasedActions(s);
}

/** A card of `def` in `pid`'s hand (an extra object), its id. */
function inHand(s: GameState, pid: PlayerId, def: CardDef) {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  return id;
}

/** The index of the Shapeshifter's activated ability with this text, in what it is now. */
const abilityIndex = (s: GameState, id: string, text: string) => compileCard(defOf(s, s.objects[id]!)).activated.findIndex((a) => a.text === text);

describe("Volrath's Shapeshifter (round 459)", () => {
  it("is fully supported", () => {
    expect(isFullySupported(shifter())).toBe(true);
    const c = compileCard(shifter());
    expect(c.shapeshifter?.grant).toBe("{2}: Discard a card.");
    expect(c.activated.map((a) => a.text)).toEqual(["{2}: Discard a card."]);
  });

  it("is a 0/1 blue Shapeshifter while the top card of your graveyard isn't a creature card", () => {
    const { s, ap, sh } = game([bolt()]);
    expect(nameOf(s, sh)).toBe("Volrath's Shapeshifter");
    expect(ptOf(s, sh)).toBe("0/1");
    toYard(s, s.players[ap]!.hand.at(-1)!);
    expect(nameOf(s, sh)).toBe("Volrath's Shapeshifter");
    expect(characteristics(s, s.objects[sh]!).colors).toEqual(["U"]);
  });

  it("has the creature card's name, mana cost, color, types, abilities, power and toughness, and the discard ability", () => {
    const { s, ap, ids, sh } = game([dragon(), bolt()]);
    toYard(s, ids[0]!);
    const o = s.objects[sh]!;
    const ch = characteristics(s, o);
    expect(ch.name).toBe("Shivan Dragon");
    expect(ptOf(s, sh)).toBe("5/5");
    expect(ch.colors).toEqual(["R"]);
    expect(ch.subtypes).toEqual(["Dragon"]);
    expect(ch.keywords).toContain("Flying");
    expect(defOf(s, o).cmc).toBe(6);
    expect(compileCard(defOf(s, o)).activated.map((a) => a.text)).toEqual(["{R}: ~ gets +1/+0 until end of turn.", "{2}: Discard a card."]);
    // A noncreature card put on top: it's the Shapeshifter again.
    toYard(s, ids[1]!);
    expect(nameOf(s, sh)).toBe("Volrath's Shapeshifter");
    expect(ptOf(s, sh)).toBe("0/1");
    expect(s.players[ap]!.graveyard.length).toBe(2);
  });

  it("only the top card counts, and only its controller's graveyard", () => {
    const { s, ap, ids, opp, sh } = game([bolt(), dragon()]);
    toYard(s, ids[1]!); // Shivan Dragon
    toYard(s, ids[0]!); // Lightning Bolt above it
    expect(nameOf(s, sh)).toBe("Volrath's Shapeshifter");
    // An opponent's creature card on top of their graveyard: it's theirs, not this one's controller's.
    toYard(s, inHand(s, opp, bears()));
    expect(nameOf(s, sh)).toBe("Volrath's Shapeshifter");
    // Under the opponent's control (layer 2), it's their graveyard's top card.
    addEffect(s, opp, [sh], [{ kind: "control" }], "game");
    runStateBasedActions(s);
    expect(nameOf(s, sh)).toBe("Grizzly Bears");
    expect(ptOf(s, sh)).toBe("2/2");
    expect(s.objects[sh]!.owner).toBe(ap);
  });

  it("its discard ability puts a creature card on top, and it becomes that creature as the ability resolves", () => {
    const { s: s0, ap, ids, sh } = game([dragon()]);
    const plan = planActivate(s0, ap, sh, abilityIndex(s0, sh, "{2}: Discard a card."));
    if (!plan) throw new Error("can't activate");
    let s = s0;
    for (const a of plan) s = act(s, a);
    s = passAll(s);
    if (s.pending?.kind === "discard") s = act(s, { type: "discard", player: ap, objectIds: [ids[0]!] });
    expect(s.players[ap]!.graveyard.at(-1)).toBe(ids[0]);
    expect(nameOf(s, sh)).toBe("Shivan Dragon");
    expect(ptOf(s, sh)).toBe("5/5");
    // The dragon's ability works: {R} for +1/+0.
    s = (() => {
      const p = planActivate(s, ap, sh, abilityIndex(s, sh, "{R}: ~ gets +1/+0 until end of turn."));
      if (!p) throw new Error("can't pump");
      for (const a of p) s = act(s, a);
      return passAll(s);
    })();
    expect(ptOf(s, sh)).toBe("6/5");
  });

  it("effects of later layers apply to what it has become", () => {
    const { s, ids, ap, sh } = game([dragon()]);
    addEffect(s, ap, [sh], [{ kind: "modifyPT", power: 1, toughness: 1 }], "game");
    toYard(s, ids[0]!);
    expect(ptOf(s, sh)).toBe("6/6");
  });

  it("changing forms isn't entering: the card's enters ability doesn't trigger", () => {
    const { s, ap, ids, sh } = game([visionary()]);
    const hand = s.players[ap]!.hand.length;
    toYard(s, ids[0]!);
    expect(nameOf(s, sh)).toBe("Elvish Visionary");
    const after = passAll(s);
    expect(after.stack.length).toBe(0);
    expect(after.players[ap]!.hand.length).toBe(hand - 1);
  });

  it("entering while a creature card is on top, it enters as that creature: its enters ability triggers", () => {
    const { s: s0, ap, ids } = game([visionary(), shifter()]);
    toYard(s0, ids[0]!);
    const hand = s0.players[ap]!.hand.length; // the second Shapeshifter in hand
    let s = cast(s0, ap, ids[1]!);
    s = passAll(s); // the enters trigger resolves
    const entered = s.battlefield.find((id) => s.objects[id]!.cardId === s0.objects[ids[1]!]!.cardId)!;
    expect(nameOf(s, entered)).toBe("Elvish Visionary");
    expect(s.players[ap]!.hand.length).toBe(hand); // cast one, drew one
  });

  it("a copy of it copies the Shapeshifter, with the shapeshifting ability, not the form it has", () => {
    const { s: s0, ap, ids, sh } = game([dragon(), clone(), bolt()]);
    toYard(s0, ids[0]!);
    expect(nameOf(s0, sh)).toBe("Shivan Dragon");
    let s = cast(s0, ap, ids[1]!);
    // As it enters, Clone's controller chooses what it copies (CR 707.5).
    const p = s.pending;
    if (p?.kind !== "chooseOption") throw new Error(`no copy question: ${JSON.stringify(p)?.slice(0, 300)}`);
    expect(p.options).toContain(sh);
    s = act(s, { type: "chooseOption", player: p.player, choice: sh });
    s = passAll(s);
    const cl = ids[1]!;
    expect(s.objects[cl]!.zone).toBe("battlefield");
    expect(s.objects[cl]!.copyOf).toBe(shifter().oracleId);
    expect(nameOf(s, cl)).toBe("Shivan Dragon");
    // Lightning Bolt on top: both are 0/1 Volrath's Shapeshifters again.
    toYard(s, ids[2]!);
    expect(nameOf(s, sh)).toBe("Volrath's Shapeshifter");
    expect(nameOf(s, cl)).toBe("Volrath's Shapeshifter");
    expect(ptOf(s, cl)).toBe("0/1");
  });

  it("a creature card's characteristic it doesn't have isn't taken: Dryad Arbor's mana cost", () => {
    const { s, ids, sh } = game([arbor()]);
    toYard(s, ids[0]!);
    const o = s.objects[sh]!;
    const ch = characteristics(s, o);
    expect(ch.name).toBe("Dryad Arbor");
    expect(ch.types).toEqual(["Land", "Creature"]);
    expect(ch.subtypes).toEqual(["Forest", "Dryad"]);
    expect(ch.colors).toEqual(["G"]);
    expect(defOf(s, o).manaCost).toBe("{1}{U}{U}");
    expect(ptOf(s, sh)).toBe("1/1");
  });

  it("a double-faced card's front face, an adventurer's creature half", () => {
    const { s, ids, sh } = game([delver(), giant()]);
    toYard(s, ids[0]!);
    expect(nameOf(s, sh)).toBe("Delver of Secrets");
    expect(ptOf(s, sh)).toBe("1/1");
    expect(defOf(s, s.objects[sh]!).faces).toBeUndefined();
    toYard(s, ids[1]!);
    expect(nameOf(s, sh)).toBe("Bonecrusher Giant");
    expect(ptOf(s, sh)).toBe("4/3");
    expect(defOf(s, s.objects[sh]!).manaCost).toBe("{2}{R}");
  });

  it("dying with other creatures, it dies as what it was: Doomed Dissenter's dies trigger", () => {
    const { s: s0, ap, ids, sh } = game([dissenter(), wrath()]);
    const bearsId = putOnBattlefield(s0, ap, bears());
    toYard(s0, ids[0]!);
    expect(nameOf(s0, sh)).toBe("Doomed Dissenter");
    let s = cast(s0, ap, ids[1]!);
    // They were put into the graveyard together: their owner arranges them (CR 404.3), the order mattering here.
    const p = s.pending;
    if (p?.kind !== "orderGraveyard") throw new Error(`no order question: ${JSON.stringify(p)}`);
    expect([...p.cards].sort()).toEqual([sh, bearsId].sort());
    s = act(s, { type: "orderGraveyard", player: ap, order: [sh, bearsId] });
    s = passAll(s);
    expect(s.objects[sh]!.zone).toBe("graveyard");
    expect(s.objects[bearsId]!.zone).toBe("graveyard");
    const zombies = s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Zombie"));
    expect(zombies.length).toBe(1);
  });
});
