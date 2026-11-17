// Round 377 (Lane A): a hidden search of the damaged player's library that player tries to name (Sphinx Ambassador), an
// opponent chosen in secret by an enters trigger and revealed to exile one of their attackers (Stalking Leonin), and
// copies of six cards named by their Oracle text, made outside the game and cast (Garth One-Eye, CR 707.13).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, controllerOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, registerMeldResults, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; other players' questions are answered as the bots would. Stops at any question of `me`'s. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 2000 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const moveTo = (zone: "graveyard" | "hand" | "library") => (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const toLibrary = moveTo("library");
const toYard = moveTo("graveyard");
const zone = (s: GameState, id: ObjectId) => s.objects[id]?.zone;
const ctl = (s: GameState, id: ObjectId) => controllerOf(s, s.objects[id]!);
const logSince = (s: GameState, n: number) => s.log.slice(n).map((l) => l.text).join("\n");

const ogre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { cmc: 3, power: "3", toughness: "3", colors: ["R"] });
const giant = card("Test Giant", "Creature — Giant", "{5}{R}", { cmc: 6, power: "6", toughness: "6", colors: ["R"] });
const rock = card("Test Rock", "Artifact", "{1}", { cmc: 1 });

// Real oracle text (Scryfall).
const ambassador = (): CardDef => ({"oracleId":"69e1a166-02f7-43f8-b099-dbb01034370c","name":"Sphinx Ambassador","manaCost":"{5}{U}{U}","cmc":7,"typeLine":"Creature — Sphinx","supertypes":[],"types":["Creature"],"subtypes":["Sphinx"],"oracleText":"Flying\nWhenever this creature deals combat damage to a player, search that player's library for a card, then that player chooses a card name. If you searched for a creature card that doesn't have that name, you may put it onto the battlefield under your control. Then that player shuffles.","power":"5","toughness":"5","colors":["U"],"colorIdentity":["U"],"keywords":["Flying"],"commanderLegal":"legal","set":"m10","releasedAt":"2009-07-17","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const leonin = (): CardDef => ({"oracleId":"6ec98a34-5c04-423c-98e5-8cf3047135c1","name":"Stalking Leonin","manaCost":"{2}{W}","cmc":3,"typeLine":"Creature — Cat Archer","supertypes":[],"types":["Creature"],"subtypes":["Cat","Archer"],"oracleText":"When this creature enters, secretly choose an opponent.\nReveal the player you chose: Exile target creature that's attacking you if it's controlled by the chosen player. Activate only once.","power":"3","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","set":"c17","releasedAt":"2017-08-25","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const garth = (): CardDef => ({"oracleId":"d8c4312e-03ae-43f3-b92c-4adb6875534c","name":"Garth One-Eye","manaCost":"{W}{U}{B}{R}{G}","cmc":5,"typeLine":"Legendary Creature — Human Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"{T}: Choose a card name that hasn't been chosen from among Disenchant, Braingeyser, Terror, Shivan Dragon, Regrowth, and Black Lotus. Create a copy of the card with the chosen name. You may cast the copy. (You still pay its costs.)","power":"5","toughness":"5","colors":["B","G","R","U","W"],"colorIdentity":["B","G","R","U","W"],"keywords":[],"commanderLegal":"legal","set":"mh2","releasedAt":"2021-06-18","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const disenchant = (): CardDef => ({"oracleId":"a7e97fa9-4b72-4548-b854-5be5f18a6f1a","name":"Disenchant","manaCost":"{1}{W}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target artifact or enchantment.","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","set":"bro","releasedAt":"2022-11-18","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const braingeyser = (): CardDef => ({"oracleId":"9908e597-9470-4c13-8387-39431b380138","name":"Braingeyser","manaCost":"{X}{U}{U}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target player draws X cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const terror = (): CardDef => ({"oracleId":"b81f041d-98db-4408-9472-c483e4a502bc","name":"Terror","manaCost":"{1}{B}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target nonartifact, nonblack creature. It can't be regenerated.","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const shivan = (): CardDef => ({"oracleId":"711eea87-0fa3-46e0-a42b-fa5a86455f04","name":"Shivan Dragon","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Creature — Dragon","supertypes":[],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Flying\n{R}: This creature gets +1/+0 until end of turn.","power":"5","toughness":"5","colors":["R"],"colorIdentity":["R"],"keywords":["Flying"],"commanderLegal":"legal","set":"sld","releasedAt":"2026-08-31","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const regrowth = (): CardDef => ({"oracleId":"e6e4a8bd-5c40-4654-8de1-0da9afed90fd","name":"Regrowth","manaCost":"{1}{G}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Return target card from your graveyard to your hand.","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"sld","releasedAt":"2026-10-19","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const lotus = (): CardDef => ({"oracleId":"5089ec1a-f881-4d55-af14-5d996171203b","name":"Black Lotus","manaCost":"{0}","cmc":0,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}, Sacrifice this artifact: Add three mana of any one color.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["B","G","R","U","W"],"commanderLegal":"banned","set":"lea","releasedAt":"1993-08-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

// Garth One-Eye's six cards come with the card data (meld-results.ts), as in a game.
registerMeldResults([garth(), disenchant(), braingeyser(), terror(), shivan(), regrowth(), lotus()]);

describe("round 377: compiles", () => {
  it("every card of the round, and the cards Garth One-Eye names", () => supported(ambassador(), leonin(), garth(), disenchant(), braingeyser(), terror(), shivan(), regrowth(), lotus()));
});

/** `ap` attacks `defender` with `attacker` and everyone passes until the combat damage trigger asks `ap` or `defender` something. */
const attack = (s: GameState, ap: PlayerId, attacker: ObjectId, defender: PlayerId, stopFor: PlayerId[] = [ap]) => {
  s = passUntil(s, "declareAttackers", ap);
  if (s.pending?.kind !== "declareAttackers") throw new Error("no attack");
  s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker, defender }] });
  for (let i = 0; i < 200 && !(s.pending && stopFor.includes(s.pending.player) && s.pending.kind !== "declareBlockers") && s.step !== "main2"; i++) {
    if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
    else if (s.pending) for (const a of botActions(s, s.pending.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};

describe("Sphinx Ambassador", () => {
  const begin = () => {
    const { s, ap, opp } = setup([]);
    s.players[ap]!.hand = [];
    const sphinx = putOnBattlefield(s, ap, ambassador());
    const theirOgre = toLibrary(s, opp, ogre);
    const theirRock = toLibrary(s, opp, rock);
    return { s, ap, opp, sphinx, theirOgre, theirRock };
  };

  it("searches the damaged player's library; a creature card without the name they chose may be put onto the battlefield under your control", () => {
    const { s: s0, ap, opp, sphinx } = begin();
    const lib = s0.players[opp]!.library.length;
    let s = attack(s0, ap, sphinx, opp);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 1, max: 1 });
    expect((s.pending as { cards: string[] }).cards.length).toBe(lib);
    // A Grizzly Bears: the bot names the creature card that costs the most in its library, the Ogre.
    const bears = s.players[opp]!.library.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Grizzly Bears")!;
    const n = s.log.length;
    s = act(s, { type: "searchLibrary", player: ap, found: [bears] });
    s = settle(s, ap);
    expect(logSince(s, n)).toMatch(/chooses a card, keeping it hidden/);
    expect(logSince(s, n)).not.toMatch(/Grizzly Bears/);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    expect((s.pending as { prompt: string }).prompt).toMatch(/named Test Ogre/);
    const shuffles = s.players[opp]!.shuffles ?? 0;
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(zone(s, bears)).toBe("battlefield");
    expect(ctl(s, bears)).toBe(ap);
    expect(s.objects[bears]!.owner).toBe(opp);
    expect(s.players[opp]!.shuffles).toBe(shuffles + 1);
  });

  it("the card stays in the library, unrevealed, when it has the name they chose, and the library is shuffled", () => {
    const { s: s0, ap, opp, sphinx, theirOgre } = begin();
    let s = attack(s0, ap, sphinx, opp);
    const shuffles = s.players[opp]!.shuffles ?? 0;
    const n = s.log.length;
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [theirOgre] }), ap);
    expect(s.pending?.player === ap && s.pending.kind === "chooseMay").toBe(false);
    expect(zone(s, theirOgre)).toBe("library");
    expect(s.players[opp]!.shuffles).toBe(shuffles + 1);
    expect(logSince(s, n)).toMatch(/stays in .*'s library: .* named Test Ogre/);
  });

  it("a card that isn't a creature card can't be put onto the battlefield, whatever is named", () => {
    const { s: s0, ap, opp, sphinx, theirRock } = begin();
    let s = attack(s0, ap, sphinx, opp);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [theirRock] }), ap);
    expect(s.pending?.player === ap && s.pending.kind === "chooseMay").toBe(false);
    expect(zone(s, theirRock)).toBe("library");
  });

  it("when a bot's Sphinx hits you, you name a card without being told which one it found", () => {
    const { s: s0, ap, opp } = setup([]);
    const sphinx = putOnBattlefield(s0, opp, ambassador());
    s0.players[ap]!.hand = [];
    toLibrary(s0, ap, giant);
    let s = passUntil(s0, "declareAttackers", opp);
    s = attack(s, opp, sphinx, ap, [ap]);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "cardName", purpose: "guardLibrary" });
    expect(s.log.map((l) => l.text).join("\n")).toMatch(/chooses a card, keeping it hidden/);
    // We name the Giant: the bot took the second dearest creature card, a Grizzly Bears, and puts it in.
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Test Giant" }), ap);
    const taken = s.battlefield.filter((id) => s.objects[id]!.owner === ap && ctl(s, id) === opp);
    expect(taken.map((id) => s.cards[s.objects[id]!.cardId]!.name)).toEqual(["Grizzly Bears"]);
  });
});

describe("Stalking Leonin", () => {
  /** Leonin cast from `ap`'s hand; `ap` secretly chooses `chosen` as its enters trigger resolves. */
  const begin = () => {
    const { s: s0, ap, ids } = setup([leonin()]);
    const order = [...s0.turnOrder.slice(s0.turnOrder.indexOf(ap)), ...s0.turnOrder.slice(0, s0.turnOrder.indexOf(ap))];
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    return { s, ap, l: ids[0]!, b: order[1]!, c: order[2]! };
  };
  const choose = (s: GameState, ap: PlayerId, who: PlayerId) => {
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "opponent", secret: true });
    const n = s.log.length;
    s = settle(act(s, { type: "chooseOption", player: ap, choice: String(who) }), ap);
    return { s, n };
  };
  /** `attacker` (controlled by `by`) attacks `ap`; then everyone passes until `ap` has priority in the declare attackers step. */
  const attacked = (s: GameState, by: PlayerId, attacker: ObjectId, ap: PlayerId) => {
    s = passUntil(s, "declareAttackers", by);
    if (s.pending?.kind !== "declareAttackers") throw new Error("no attack");
    s = act(s, { type: "declareAttackers", player: by, attacks: [{ attacker, defender: ap }] });
    for (let i = 0; i < 20 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(waitingOn(s)).toBe(ap);
    return s;
  };

  it("its enters trigger secretly chooses an opponent: kept on it, and the log doesn't say who", () => {
    const { s: s1, ap, l, c } = begin();
    const { s, n } = choose(s1, ap, c);
    expect(s.objects[l]!.chosen).toMatchObject({ player: c, secret: true });
    expect(logSince(s, n)).toMatch(/secretly chooses an opponent for Stalking Leonin/);
    expect(logSince(s, n)).not.toMatch(new RegExp(`chooses ${s.players[c]!.name}\\b`));
  });

  it("revealing the chosen player exiles a creature of theirs attacking you", () => {
    const { s: s1, ap, l, c } = begin();
    let { s } = choose(s1, ap, c);
    const att = putOnBattlefield(s, c, ogre);
    s = attacked(s, c, att, ap);
    s = settle(run(s, planActivate(s, ap, l, 0, [{ kind: "object", id: att }])), ap);
    expect(zone(s, att)).toBe("exile");
    expect(s.objects[l]!.chosen?.secret).toBeUndefined();
    expect(s.log.some((x) => /reveals the player chosen for Stalking Leonin/.test(x.text))).toBe(true);
  });

  it("an attacker of another player's isn't exiled, and the ability is used up: only once", () => {
    const { s: s1, ap, l, b, c } = begin();
    let { s } = choose(s1, ap, c);
    const att = putOnBattlefield(s, b, ogre);
    s = attacked(s, b, att, ap);
    s = settle(run(s, planActivate(s, ap, l, 0, [{ kind: "object", id: att }])), ap);
    expect(zone(s, att)).toBe("battlefield");
    expect(planActivate(s, ap, l, 0, [{ kind: "object", id: att }])).toBeNull();
  });

  it("with no player chosen for it (put onto the battlefield some other way), the cost can't be paid", () => {
    const { s: s0, ap } = setup([]);
    const l = putOnBattlefield(s0, ap, leonin());
    const c = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    const att = putOnBattlefield(s0, c, ogre);
    const s = attacked(s0, c, att, ap);
    expect(planActivate(s, ap, l, 0, [{ kind: "object", id: att }])).toBeNull();
  });

  it("a bot reveals its chosen player only for an attacker of theirs", () => {
    const { s: s0, ap } = setup([]);
    const order = [...s0.turnOrder.slice(s0.turnOrder.indexOf(ap)), ...s0.turnOrder.slice(0, s0.turnOrder.indexOf(ap))];
    const bot = order[1]!;
    const l = putOnBattlefield(s0, bot, leonin());
    s0.objects[l]!.chosen = { player: ap, secret: true };
    const mine = putOnBattlefield(s0, ap, ogre);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: mine, defender: bot }] });
    s = settle(s, ap);
    for (let i = 0; i < 40 && s.step === "declareAttackers"; i++) {
      const w = waitingOn(s)!;
      if (s.pending) for (const a of botActions(s, s.pending.player)) s = act(s, a);
      else if (w === ap) s = act(s, { type: "passPriority", player: ap });
      else for (const a of botActions(s, w)) s = act(s, a);
    }
    expect(zone(s, mine)).toBe("exile");
  });
});

describe("Garth One-Eye", () => {
  const begin = () => {
    const { s, ap, opp } = setup([]);
    s.players[ap]!.hand = [];
    const g = putOnBattlefield(s, ap, garth());
    return { s, ap, opp, g };
  };
  const activateIt = (s: GameState, ap: PlayerId, g: ObjectId) => settle(run(s, planActivate(s, ap, g, 0)), ap);

  it("chooses one of the six names as it resolves, creates a copy of that card and casts it: Black Lotus becomes a token", () => {
    const { s: s0, ap, g } = begin();
    let s = activateIt(s0, ap, g);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "namedCopy", options: ["Disenchant", "Braingeyser", "Terror", "Shivan Dragon", "Regrowth", "Black Lotus"] });
    s = act(s, { type: "chooseOption", player: ap, choice: "Black Lotus" });
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, how: "paid" });
    const copy = (s.pending as { objectId: string }).objectId;
    expect(s.objects[copy]!.owner).toBe(ap);
    s = settle(run(s, planCast(s, ap, copy)), ap);
    const lotusOnField = s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Black Lotus");
    expect(lotusOnField.length).toBe(1);
    expect(s.objects[lotusOnField[0]!]!.isToken || s.objects[lotusOnField[0]!]!.spellCopy).toBeTruthy();
  });

  it("a name chosen before isn't offered again, even if the copy wasn't cast (it ceases to exist)", () => {
    const { s: s0, ap, g } = begin();
    let s = activateIt(s0, ap, g);
    s = act(s, { type: "chooseOption", player: ap, choice: "Terror" });
    const copy = (s.pending as { objectId: string }).objectId;
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }), ap);
    expect(s.objects[copy]?.zone === "exile").toBe(false);
    s.objects[g]!.tapped = false;
    s = activateIt(s, ap, g);
    expect((s.pending as { options: string[] }).options).toEqual(["Disenchant", "Braingeyser", "Shivan Dragon", "Regrowth", "Black Lotus"]);
  });

  it("casts a sorcery copy as it resolves, paying its cost: Regrowth returns a card", () => {
    const { s: s0, ap, g } = begin();
    const dead = toYard(s0, ap, ogre);
    let s = activateIt(s0, ap, g);
    s = act(s, { type: "chooseOption", player: ap, choice: "Regrowth" });
    const copy = (s.pending as { objectId: string }).objectId;
    s = settle(run(s, planCast(s, ap, copy, [{ kind: "object", id: dead }])), ap);
    expect(zone(s, dead)).toBe("hand");
  });

  it("a new Garth (it left the battlefield and came back) starts over; with every name chosen, it does nothing", () => {
    const { s: s0, ap, g } = begin();
    let s = s0;
    for (const n of ["Disenchant", "Braingeyser", "Terror", "Shivan Dragon", "Regrowth", "Black Lotus"]) {
      s.objects[g]!.tapped = false;
      s = activateIt(s, ap, g);
      s = act(s, { type: "chooseOption", player: ap, choice: n });
      s = settle(act(s, { type: "chooseMay", player: ap, yes: false }), ap);
    }
    s.objects[g]!.tapped = false;
    s = activateIt(s, ap, g);
    expect(s.pending).toBeFalsy();
    expect(s.log.some((l) => /Every name has been chosen/.test(l.text))).toBe(true);
    // The same card as a new object (CR 400.7): every name again.
    s.objects[g]!.zoneChanges = (s.objects[g]!.zoneChanges ?? 0) + 1;
    s.objects[g]!.tapped = false;
    s = activateIt(s, ap, g);
    expect((s.pending as { options: string[] }).options.length).toBe(6);
  });

  it("a bot activates it in its main phase and casts the copy it can use", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, garth());
    s0.players[ap]!.hand = [];
    putOnBattlefield(s0, opp, ogre);
    s0.players[ap]!.isBot = true;
    let s = s0;
    for (let i = 0; i < 600 && !(s.namesChosenFor && Object.keys(s.namesChosenFor).length) && s.activePlayer === ap; i++) {
      const w = s.pending?.player ?? waitingOn(s)!;
      const acts = botActions(s, w);
      for (const a of acts) s = act(s, a);
    }
    s = settle(s);
    const chosen = Object.values(s.namesChosenFor ?? {}).flat();
    expect(chosen).toEqual(["Shivan Dragon"]);
    expect(s.battlefield.some((id) => s.cards[s.objects[id]!.cardId]!.name === "Shivan Dragon" && ctl(s, id) === ap)).toBe(true);
    expect(s.objects[g]!.tapped).toBe(true);
  });
});
