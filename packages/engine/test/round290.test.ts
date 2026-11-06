// Round 290: from the top of the popularity list, names no earlier round looked at.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, applyAction, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";
import { draw, moveObject } from "../src/game";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const none = { kind: "none" } as TargetChoice;
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
const answer = (s: GameState, choice: string) => act(s, { type: "chooseOption", player: s.pending!.player, choice } as Action);
const nameOf = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;
/** A fresh card object on top of `pid`'s library. */
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  invalidateCharacteristics(s);
  return id;
};
const token = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.isToken = true;
  return id;
};
const inYard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  moveObject(s, id, "graveyard");
  return id;
};
const crewIndex = (s: GameState, id: string) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => a.crew !== undefined);
/** Crews `vehicle` with `crew` and attacks `opp` with it, answering what its attack trigger asks first with `onAttack`. */
const crewAndAttack = (s0: GameState, ap: PlayerId, vehicle: string, crew: string, opp: PlayerId) => {
  let s = settle(run(s0, planActivate(s0, ap, vehicle, crewIndex(s0, vehicle), undefined, undefined, [crew])));
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: vehicle, defender: opp }] } as Action);
  for (let i = 0; i < 20 && !s.pending && (s.stack.length || s.triggerQueue.length || !s.stack.length); i++) {
    if (s.stack.some((x) => x.kind !== "spell") || s.pending) break;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};

// Real oracle text (Scryfall).
const tawnos = (): CardDef => ({"oracleId":"871fbbd6-76a0-4f79-b89f-afee6ebe5a59","name":"Tawnos, Solemn Survivor","manaCost":"{1}{U}","cmc":2,"typeLine":"Legendary Creature — Human Artificer","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Artificer"],"oracleText":"{2}, {T}: Create a token that's a copy of up to one target artifact token you control. Mill two cards.\n{1}{W}{U}{B}, {T}, Sacrifice two artifact tokens, Exile an artifact or creature card from your graveyard: Create a token that's a copy of the exiled card, except it's an artifact in addition to its other types. Activate only as a sorcery.","power":"1","toughness":"3","colors":["U"],"colorIdentity":["B","U","W"],"keywords":["Mill"],"commanderLegal":"legal","set":"brc","releasedAt":"2022-11-18","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const dollhouse = (): CardDef => ({"oracleId":"73970475-f899-4e93-8498-286240181295","name":"Dollhouse of Horrors","manaCost":"{5}","cmc":5,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{1}, {T}, Exile a creature card from your graveyard: Create a token that's a copy of the exiled card, except it's a 0/0 Construct artifact in addition to its other types and it has \"This token gets +1/+1 for each Construct you control.\" It gains haste until end of turn. Activate only as a sorcery.","colors":[],"colorIdentity":[],"keywords":[],"commanderLegal":"legal","set":"dbl","releasedAt":"2022-01-28","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const triumph = (): CardDef => ({"oracleId":"6f8a4998-35c7-4e30-a9e7-7d4ec933238a","name":"Triumph of Saint Katherine","manaCost":"{4}{W}","cmc":5,"typeLine":"Creature — Human Warrior","supertypes":[],"types":["Creature"],"subtypes":["Human","Warrior"],"oracleText":"Lifelink\nPraesidium Protectiva — When this creature is put into your graveyard from the battlefield, exile it and the top six cards of your library in a face-down pile. If you do, shuffle that pile and put it back on top of your library.\nMiracle {1}{W} (You may cast this card for its miracle cost when you draw it if it's the first card you drew this turn.)","power":"5","toughness":"5","colors":["W"],"colorIdentity":["W"],"keywords":["Lifelink","Miracle","Praesidium Protectiva"],"commanderLegal":"legal","set":"40k","releasedAt":"2022-10-07","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const pyxis = (): CardDef => ({"oracleId":"4b746fe1-4c11-4dfd-bdc9-edd394478861","name":"Pyxis of Pandemonium","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Each player exiles the top card of their library face down.\n{7}, {T}, Sacrifice this artifact: Each player turns face up all cards they own exiled with this artifact, then puts all permanent cards among them onto the battlefield.","colors":[],"colorIdentity":[],"keywords":[],"commanderLegal":"legal","set":"ths","releasedAt":"2013-09-27","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const eisenhorn = (): CardDef => ({"oracleId":"db07a3f9-c6d1-4cae-a899-12b3e8d94018","name":"Inquisitor Eisenhorn","manaCost":"{2}{U}{B}","cmc":4,"typeLine":"Legendary Creature — Human Inquisitor","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Inquisitor"],"oracleText":"You may reveal the first card you draw each turn as you draw it. Whenever you reveal an instant or sorcery card this way, create Cherubael, a legendary 4/4 black Demon creature token with flying.\nWhenever Inquisitor Eisenhorn deals combat damage to a player, investigate that many times. (Create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")","power":"2","toughness":"3","colors":["B","U"],"colorIdentity":["B","U"],"keywords":["Investigate"],"commanderLegal":"legal","set":"40k","releasedAt":"2022-10-07","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const limo = (): CardDef => ({"oracleId":"864a9276-2fec-49b3-bc53-008608de5ab6","name":"Mysterious Limousine","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Artifact — Vehicle","supertypes":[],"types":["Artifact"],"subtypes":["Vehicle"],"oracleText":"Whenever this Vehicle enters or attacks, exile up to one other target creature until this Vehicle leaves the battlefield. If a creature is put into exile this way, return each other card exiled with this Vehicle to the battlefield under its owner's control.\nCrew 2","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Crew"],"commanderLegal":"legal","set":"snc","releasedAt":"2022-04-29","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const steamboat = (): CardDef => ({"oracleId":"d97a0e41-9dd7-4466-afb7-3d8bd6cd0eed","name":"Foreboding Steamboat","manaCost":"{3}{B}{B}","cmc":5,"typeLine":"Artifact — Vehicle","supertypes":[],"types":["Artifact"],"subtypes":["Vehicle"],"oracleText":"When this Vehicle enters, each player chooses two nontoken, non-Vehicle creatures they control. Exile them until this Vehicle leaves the battlefield.\nWhenever this Vehicle attacks, put a card exiled with it into its owner's graveyard. If you do, investigate.\nCrew 2","power":"5","toughness":"7","colors":["B"],"colorIdentity":["B"],"keywords":["Investigate","Crew"],"commanderLegal":"legal","set":"mkc","releasedAt":"2024-02-09","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const chaotic = (): CardDef => ({"oracleId":"a754458d-55b5-44c2-98de-8bf26b82c1b1","name":"Chaotic Transformation","manaCost":"{5}{R}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Exile up to one target artifact, up to one target creature, up to one target enchantment, up to one target planeswalker, and/or up to one target land. For each permanent exiled this way, its controller reveals cards from the top of their library until they reveal a card that shares a card type with it, puts that card onto the battlefield, then shuffles.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"dmu","releasedAt":"2022-09-09","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const savior = (): CardDef => ({"oracleId":"1857dc32-8ff1-4519-b1ca-480a5c2d3b3c","name":"Savior of Ollenbock","manaCost":"{1}{W}{W}","cmc":3,"typeLine":"Creature — Human Soldier","supertypes":[],"types":["Creature"],"subtypes":["Human","Soldier"],"oracleText":"Training (Whenever this creature attacks with another creature with greater power, put a +1/+1 counter on this creature.)\nWhenever this creature trains, exile up to one other target creature from the battlefield or creature card from a graveyard.\nWhen this creature leaves the battlefield, put the exiled cards onto the battlefield under their owners' control.","power":"1","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["Training"],"commanderLegal":"legal","set":"dbl","releasedAt":"2022-01-28","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const venser = (): CardDef => ({"oracleId":"9b1ae6d8-0cf3-4a67-9241-37f4bc5ddbdd","name":"Venser, Fervent Forger","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Legendary Creature — Human Sorcerer","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Sorcerer"],"oracleText":"Flash\nWhen Venser enters, choose one —\n• Copy target instant or sorcery spell an opponent controls twice. You may choose new targets for the copies.\n• Create two tokens that are copies of target permanent an opponent controls. They gain haste. At the beginning of the next end step, sacrifice them.","power":"5","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":["Flash"],"commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);

describe("round 290", () => {
  it("every card of the round compiles fully", () => {
    supported(tawnos(), dollhouse(), triumph(), pyxis(), eisenhorn(), limo(), steamboat(), chaotic(), savior(), venser());
  });
});

describe("Tawnos, Solemn Survivor", () => {
  it("sacrifices two artifact tokens and exiles an artifact or creature card from your graveyard: a token copy of that card that's also an artifact", () => {
    const { s: s0, ap } = setup([]);
    const me = putOnBattlefield(s0, ap, tawnos());
    const t1 = token(s0, ap, card("Test Thopter", "Artifact Creature — Thopter", "", { power: "1", toughness: "1" }));
    const t2 = token(s0, ap, card("Test Clue", "Artifact — Clue"));
    const dead = inYard(s0, ap, bear({ name: "Test Dead Bear" }));
    const plan = planActivate(s0, ap, me, 1, [], undefined, undefined, undefined, { sacrifice: [t1, t2], exileCards: [dead] });
    let s = settle(run(s0, plan));
    expect(zone(s, dead)).toBe("exile");
    expect(s.objects[t1]?.zone ?? "gone").not.toBe("battlefield");
    expect(s.objects[t2]?.zone ?? "gone").not.toBe("battlefield");
    const copy = s.battlefield.find((id) => s.objects[id]!.isToken && nameOf(s, id) === "Test Dead Bear")!;
    expect(copy).toBeDefined();
    const c = characteristics(s, s.objects[copy]!);
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(c.subtypes).toContain("Bear");
    void s;
  });

  it("can't be activated without two artifact tokens to sacrifice", () => {
    const { s: s0, ap } = setup([]);
    const me = putOnBattlefield(s0, ap, tawnos());
    const t1 = token(s0, ap, card("Test Clue", "Artifact — Clue"));
    putOnBattlefield(s0, ap, card("Test Relic", "Artifact", "{1}"));
    const dead = inYard(s0, ap, bear({ name: "Test Dead Bear" }));
    expect(planActivate(s0, ap, me, 1, [], undefined, undefined, undefined, { sacrifice: [t1], exileCards: [dead] })).toBeNull();
  });
});

describe("Dollhouse of Horrors", () => {
  it("exiles a creature card from your graveyard: a 0/0 Construct artifact copy that gets +1/+1 for each Construct you control, with haste", () => {
    const { s: s0, ap } = setup([]);
    const me = putOnBattlefield(s0, ap, dollhouse());
    putOnBattlefield(s0, ap, card("Test Construct", "Artifact Creature — Construct", "{2}", { power: "1", toughness: "1" }));
    const dead = inYard(s0, ap, bear({ name: "Test Dead Bear" }));
    const s = settle(run(s0, planActivate(s0, ap, me, 0, [], undefined, undefined, undefined, { exileCards: [dead] })));
    expect(zone(s, dead)).toBe("exile");
    const copy = s.battlefield.find((id) => s.objects[id]!.isToken)!;
    const c = characteristics(s, s.objects[copy]!);
    expect(c.name).toBe("Test Dead Bear");
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(c.subtypes).toEqual(expect.arrayContaining(["Bear", "Construct"]));
    // 0/0, +1/+1 for each of the two Constructs (itself counts, rulings).
    expect([c.power, c.toughness]).toEqual([2, 2]);
    expect(c.keywords.map((k) => k.toLowerCase())).toContain("haste");
  });
});

describe("Triumph of Saint Katherine", () => {
  it("put into your graveyard from the battlefield: it and the top six cards of your library are shuffled together on top", () => {
    const { s: s0, ap } = setup([]);
    const me = putOnBattlefield(s0, ap, triumph());
    const top6 = s0.players[ap]!.library.slice(0, 6);
    const size = s0.players[ap]!.library.length;
    moveObject(s0, me, "graveyard");
    const s = settle(s0);
    expect(zone(s, me)).toBe("library");
    expect(s.players[ap]!.graveyard).not.toContain(me);
    expect(s.players[ap]!.library.length).toBe(size + 1);
    expect([...s.players[ap]!.library.slice(0, 7)].sort()).toEqual([...top6, me].sort());
  });

  it("with fewer than six cards in your library, nothing happens (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const me = putOnBattlefield(s0, ap, triumph());
    for (const id of s0.players[ap]!.library.slice(5)) moveObject(s0, id, "exile");
    expect(s0.players[ap]!.library.length).toBe(5);
    moveObject(s0, me, "graveyard");
    const s = settle(s0);
    expect(zone(s, me)).toBe("graveyard");
    expect(s.players[ap]!.library.length).toBe(5);
  });

  it("if it left your graveyard before the trigger resolves, nothing happens (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const me = putOnBattlefield(s0, ap, triumph());
    const top6 = s0.players[ap]!.library.slice(0, 6);
    moveObject(s0, me, "graveyard");
    let s = act(s0, { type: "passPriority", player: waitingOn(s0)! });
    expect(s.stack.length).toBe(1);
    moveObject(s, me, "exile");
    s = settle(s);
    expect(zone(s, me)).toBe("exile");
    expect(s.players[ap]!.library.slice(0, 6)).toEqual(top6);
  });
});

describe("Pyxis of Pandemonium", () => {
  it("each player exiles their top card face down; later each turns theirs face up and puts the permanent cards onto the battlefield", () => {
    const { s: s0, ap } = setup([]);
    const me = putOnBattlefield(s0, ap, pyxis());
    const [p0, p1, p2, p3] = s0.turnOrder;
    const tops = new Map<PlayerId, string>([
      [p0!, onTop(s0, p0!, bear({ name: "Test Bear A" }))],
      [p1!, onTop(s0, p1!, card("Test Shock", "Instant", "{R}"))],
      [p2!, onTop(s0, p2!, card("Test Relic", "Artifact", "{1}"))],
      [p3!, onTop(s0, p3!, card("Test Wastes", "Land"))],
    ]);
    let s = settle(run(s0, planActivate(s0, ap, me, 0)));
    for (const [, id] of tops) {
      expect(zone(s, id)).toBe("exile");
      expect(s.objects[id]!.hiddenExile?.seen).toEqual([]);
    }
    s.objects[me]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, me, 1)));
    expect(zone(s, me)).toBe("graveyard");
    for (const [pid, id] of tops) {
      const d = s.cards[s.objects[id]!.cardId]!;
      if (d.types.includes("Instant")) {
        expect(zone(s, id)).toBe("exile");
        expect(s.objects[id]!.hiddenExile).toBeUndefined();
      } else {
        expect(zone(s, id)).toBe("battlefield");
        expect(s.objects[id]!.controller).toBe(pid);
      }
    }
  });
});

describe("Inquisitor Eisenhorn", () => {
  const game = (top: CardDef) => {
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, eisenhorn());
    onTop(s, ap, top);
    s.players[ap]!.draws = { turn: s.turn, n: 0 };
    return { s, ap };
  };
  it("revealing an instant or sorcery as the first card you draw each turn creates Cherubael, a legendary 4/4 black Demon with flying", () => {
    const { s: s0, ap } = game(card("Test Shock", "Instant", "{R}"));
    draw(s0, ap);
    let s = settle(s0);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    const cherubael = s.battlefield.find((id) => s.objects[id]!.isToken && nameOf(s, id) === "Cherubael")!;
    expect(cherubael).toBeDefined();
    const c = characteristics(s, s.objects[cherubael]!);
    expect([c.power, c.toughness, c.colors, c.subtypes]).toEqual([4, 4, ["B"], ["Demon"]]);
    expect(c.supertypes).toContain("Legendary");
    expect(c.keywords).toContain("Flying");
  });

  it("you needn't reveal it: no token (rulings)", () => {
    const { s: s0, ap } = game(card("Test Ponder", "Sorcery", "{U}"));
    draw(s0, ap);
    let s = settle(s0);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.battlefield.some((id) => s.objects[id]!.isToken)).toBe(false);
  });

  it("nothing for a creature card, or for the second card drawn this turn", () => {
    const g = game(bear({ name: "Test Bear" }));
    draw(g.s, g.ap);
    expect(settle(g.s).pending).toBeFalsy();
    const h = game(card("Test Shock", "Instant", "{R}"));
    h.s.players[h.ap]!.draws = { turn: h.s.turn, n: 1 };
    draw(h.s, h.ap);
    const s = settle(h.s);
    expect(s.pending).toBeFalsy();
    expect(s.stack.length).toBe(0);
  });
});

describe("Mysterious Limousine", () => {
  it("enters: exiles up to one other creature until it leaves; attacks: exiles another, and the first one returns; leaving returns the last", () => {
    const { s: s0, ap, ids, opp } = setup([limo()]);
    const a = putOnBattlefield(s0, opp, bear({ name: "Test Bear A" }));
    const b = putOnBattlefield(s0, opp, bear({ name: "Test Bear B" }));
    const crew = putOnBattlefield(s0, ap, bear({ name: "Test Driver" }));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(a)] }));
    expect(zone(s, a)).toBe("exile");
    s.objects[ids[0]!]!.controlledSinceTurn = -1;
    s = crewAndAttack(s, ap, ids[0]!, crew, opp);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(b)] }));
    expect(zone(s, b)).toBe("exile");
    expect(zone(s, a)).toBe("battlefield");
    expect(s.objects[a]!.controller).toBe(opp);
    moveObject(s, ids[0]!, "graveyard");
    s = settle(s);
    expect(zone(s, b)).toBe("battlefield");
  });

  it("with no creature exiled (no target chosen), nothing returns", () => {
    const { s: s0, ap, ids, opp } = setup([limo()]);
    const a = putOnBattlefield(s0, opp, bear({ name: "Test Bear A" }));
    const crew = putOnBattlefield(s0, ap, bear({ name: "Test Driver" }));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(a)] }));
    s.objects[ids[0]!]!.controlledSinceTurn = -1;
    s = settle(crewAndAttack(s, ap, ids[0]!, crew, opp));
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [none] }));
    expect(zone(s, a)).toBe("exile");
  });
});

describe("Foreboding Steamboat", () => {
  it("enters: each player chooses two nontoken, non-Vehicle creatures they control and they're exiled until it leaves; attacks: one goes to its owner's graveyard and you investigate", () => {
    const { s: s0, ap, ids, opp } = setup([steamboat()]);
    const mine = [1, 2, 3].map((i) => putOnBattlefield(s0, ap, bear({ name: `Test Mine ${i}` })));
    const tok = token(s0, ap, bear({ name: "Test Token Bear" }));
    const theirs = [1, 2].map((i) => putOnBattlefield(s0, opp, bear({ name: `Test Theirs ${i}` })));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, count: 2 });
    expect((s.pending as { options: string[] }).options).not.toContain(tok);
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [mine[0]!, mine[1]!] }));
    for (const id of [mine[0]!, mine[1]!, ...theirs]) expect(zone(s, id)).toBe("exile");
    expect(zone(s, mine[2]!)).toBe("battlefield");
    s.objects[ids[0]!]!.controlledSinceTurn = -1;
    s = settle(crewAndAttack(s, ap, ids[0]!, mine[2]!, opp));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [theirs[0]!] }));
    expect(zone(s, theirs[0]!)).toBe("graveyard");
    expect(s.battlefield.some((id) => s.objects[id]!.isToken && /^Clue/.test(nameOf(s, id)))).toBe(true);
    moveObject(s, ids[0]!, "graveyard");
    s = settle(s);
    for (const id of [mine[0]!, mine[1]!, theirs[1]!]) expect(zone(s, id)).toBe("battlefield");
    expect(zone(s, theirs[0]!)).toBe("graveyard");
  });
});

describe("Chaotic Transformation", () => {
  it("exiles the targets at once; each one's controller reveals until a card that shares a card type with it, puts it onto the battlefield and shuffles, choosing the order of theirs", () => {
    const { s: s0, ap, ids, opp } = setup([chaotic()]);
    const relic = putOnBattlefield(s0, opp, card("Test Relic", "Artifact", "{1}"));
    const beast = putOnBattlefield(s0, opp, bear({ name: "Test Beast" }));
    const trinket = onTop(s0, opp, card("Test Trinket", "Artifact", "{2}"));
    onTop(s0, opp, card("Test Wastes", "Land"));
    const bearsBefore = s0.battlefield.filter((id) => s0.objects[id]!.controller === opp && nameOf(s0, id) === "Grizzly Bears").length;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(relic), tgt(beast), none, none, none])));
    expect(zone(s, relic)).toBe("exile");
    expect(zone(s, beast)).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp, what: "nextExiled" });
    expect((s.pending as { options: string[] }).options.sort()).toEqual([relic, beast].sort());
    s = settle(answer(s, relic));
    expect(zone(s, trinket)).toBe("battlefield");
    expect(s.objects[trinket]!.controller).toBe(opp);
    const bearsAfter = s.battlefield.filter((id) => s.objects[id]!.controller === opp && nameOf(s, id) === "Grizzly Bears").length;
    expect(bearsAfter).toBe(bearsBefore + 1);
  });

  it("a land shares the land type: the next land card goes onto the battlefield", () => {
    const { s: s0, ap, ids, opp } = setup([chaotic()]);
    const land = putOnBattlefield(s0, opp, card("Test Waste", "Land"));
    const next = onTop(s0, opp, card("Test Ground", "Land"));
    onTop(s0, opp, bear({ name: "Test Top Bear" }));
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [none, none, none, none, tgt(land)])));
    expect(zone(s, land)).toBe("exile");
    expect(zone(s, next)).toBe("battlefield");
  });
});

describe("Savior of Ollenbock", () => {
  const attackTogether = (s0: GameState, ap: PlayerId, me: string, big: string, opp: PlayerId) => {
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: me, defender: opp }, { attacker: big, defender: opp }] } as Action);
    return settle(s);
  };
  it("when it trains, exiles up to one other creature or creature card from a graveyard; when it leaves, they come back under their owners' control", () => {
    const { s: s0, ap, opp } = setup([]);
    const me = putOnBattlefield(s0, ap, savior());
    const big = putOnBattlefield(s0, ap, bear({ name: "Test Big", power: "5", toughness: "5" }));
    const foe = putOnBattlefield(s0, opp, bear({ name: "Test Foe" }));
    const dead = inYard(s0, opp, bear({ name: "Test Dead" }));
    let s = attackTogether(s0, ap, me, big, opp);
    // Training resolves first (+1/+1 counter), then it trains.
    expect(s.objects[me]!.counters["+1/+1"]).toBe(1);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(foe)] }));
    expect(zone(s, foe)).toBe("exile");
    // The next combat: a card from a graveyard this time.
    s = passUntil(s, "main1", ap);
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: me, defender: opp }, { attacker: big, defender: opp }] } as Action);
    s = settle(s);
    expect(s.objects[me]!.counters["+1/+1"]).toBe(2);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(dead)] }));
    expect(zone(s, dead)).toBe("exile");
    moveObject(s, me, "graveyard");
    s = settle(s);
    expect(zone(s, foe)).toBe("battlefield");
    expect(s.objects[foe]!.controller).toBe(opp);
    expect(zone(s, dead)).toBe("battlefield");
    expect(s.objects[dead]!.controller).toBe(opp);
  });

  it("doesn't train attacking without a creature with greater power", () => {
    const { s: s0, ap, opp } = setup([]);
    const me = putOnBattlefield(s0, ap, savior());
    const small = putOnBattlefield(s0, ap, bear({ name: "Test Small", power: "1", toughness: "1" }));
    putOnBattlefield(s0, opp, bear({ name: "Test Foe" }));
    const s = attackTogether(s0, ap, me, small, opp);
    expect(s.objects[me]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.pending?.kind).not.toBe("chooseTargets");
  });
});

describe("Venser, Fervent Forger", () => {
  it("copies an opponent's instant twice, but not your own spell", () => {
    const { s: s0, ap, ids, opp } = setup([venser(), card("Test Mine", "Instant", "{U}", { oracleText: "Draw a card." })]);
    const shock = card("Test Spark", "Instant", "{R}", { oracleText: "Test Spark deals 1 damage to any target." });
    const sid = putOnBattlefield(s0, opp, shock);
    s0.battlefield.splice(s0.battlefield.indexOf(sid), 1);
    s0.objects[sid]!.zone = "hand";
    s0.players[opp]!.hand.push(sid);
    s0.players[opp]!.manaPool.R = 1;
    let s = s0;
    for (let i = 0; i < 4 && waitingOn(s) !== opp; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = run(s, planCast(s, opp, sid, [{ kind: "player", id: ap }]));
    for (let i = 0; i < 4 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const life = s.players[ap]!.life;
    s = run(s, planCast(s, ap, ids[0]!));
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    // The opponent has no permanents, so copying their spell is the only mode it can have.
    if (s.pending?.kind === "chooseModes") s = act(s, { type: "chooseModes", player: ap, modes: [0] });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    const item = s.stack.find((x) => x.objectId === sid)!.id;
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "stack", id: item }] });
    for (let i = 0; i < 40 && s.stack.length; i++) {
      if (s.pending?.kind === "copyTargets") s = act(s, { type: "copyTargets", player: ap, targets: [{ kind: "player", id: opp }] });
      else if (s.pending) break;
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    // Two copies at the opponent, the original still at you.
    expect(s.players[opp]!.life).toBe(40 - 2);
    expect(s.players[ap]!.life).toBe(life - 1);
  });

  it("can't target a spell you control", () => {
    const { s: s0, ap, ids } = setup([venser(), card("Test Mine", "Instant", "{U}", { oracleText: "Draw a card." })]);
    let s = run(s0, planCast(s0, ap, ids[1]!));
    s = run(s, planCast(s, ap, ids[0]!));
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    if (s.pending?.kind === "chooseModes") {
      const legal = (s.pending as { legal: boolean[] }).legal;
      expect(legal[0]).toBe(false);
    } else expect(s.pending?.kind).not.toBe("chooseTargets");
  });
});
