// Round 431: Skyway Robber ("Escape—{3}{U}, Exile five other cards from your graveyard." and "This creature escapes with
// "Whenever this creature deals combat damage to a player, you may cast an artifact, instant, or sorcery spell from among
// cards exiled with this creature without paying its mana cost."").
import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, compileCard, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const robber = (): CardDef => ({"oracleId":"58aac732-3f03-4551-a684-6cb0e3b31c09","name":"Skyway Robber","manaCost":"{3}{U}","cmc":4,"typeLine":"Creature — Bird Rogue","supertypes":[],"types":["Creature"],"subtypes":["Bird","Rogue"],"oracleText":"Flying\nEscape—{3}{U}, Exile five other cards from your graveyard. (You may cast this card from your graveyard for its escape cost.)\nThis creature escapes with \"Whenever this creature deals combat damage to a player, you may cast an artifact, instant, or sorcery spell from among cards exiled with this creature without paying its mana cost.\"","power":"3","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Flying","Escape"],"layout":"normal"}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"layout":"normal"}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"}) as CardDef;
const dragon = (): CardDef => ({"oracleId":"711eea87-0fa3-46e0-a42b-fa5a86455f04","name":"Shivan Dragon","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Creature — Dragon","supertypes":[],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Flying\n{R}: This creature gets +1/+0 until end of turn.","power":"5","toughness":"5","colors":["R"],"colorIdentity":["R"],"keywords":["Flying"],"layout":"normal"}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty or `me` is asked something; bots answer the others. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const toYard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  invalidateCharacteristics(s);
  return id;
};
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
/** Passes until `me` is asked a `kind` question; bots answer the others, and nothing else stops it. */
const until = (s: GameState, me: PlayerId, kind: string) => {
  for (let i = 0; i < 400; i++) {
    if (s.pending?.player === me && s.pending.kind === kind) return s;
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) throw new Error(`stopped on ${p.kind} ${JSON.stringify(p).slice(0, 300)}`);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  throw new Error(`no ${kind}`);
};
/** Skyway Robber escaped: its five other cards (a Bolt, a Sol Ring, Divination, Grizzly Bears, Shivan Dragon) exiled. */
const escaped = () => {
  const { s: s0, ap, opp } = setup([]);
  const r = toYard(s0, ap, robber());
  const cards = { bolt: toYard(s0, ap, bolt()), ring: toYard(s0, ap, solRing()), div: toYard(s0, ap, divination()), bears: toYard(s0, ap, bears()), dragon: toYard(s0, ap, dragon()) };
  const extra = toYard(s0, ap, bolt());
  const s = settle(run(s0, planCast(s0, ap, r, undefined, undefined, undefined, undefined, { via: "escape", exileCards: Object.values(cards) })), ap);
  return { s, ap, opp, r, cards, extra };
};
const attack = (s: GameState, ap: PlayerId, opp: PlayerId, r: ObjectId) => {
  s.objects[r]!.controlledSinceTurn = -1; // as if it had been there since the turn began
  s = passUntil(s, "declareAttackers", ap);
  return act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: r, defender: opp }] });
};

describe("round 431: Skyway Robber", () => {
  it("is fully supported; the escape's exiled cards are linked to it and its trigger works only if it escaped", () => {
    expect(isFullySupported(robber())).toBe(true);
    const c = compileCard(robber());
    expect(c.triggers).toHaveLength(1);
    expect(c.triggers[0]!.activeIf).toEqual({ kind: "self", is: "escaped" });
    expect(c.fromGraveyard?.[0]?.costs[0]).toMatchObject({ kind: "exileFromGraveyard", n: 5, linkSpell: true });
  });

  it("escaped, the five cards are exiled with it (CR 607.2a); the card left in the graveyard isn't", () => {
    const { s, r, cards, extra } = escaped();
    expect(zone(s, r)).toBe("battlefield");
    expect(s.objects[r]!.escaped).toBe(true);
    for (const id of Object.values(cards)) expect(zone(s, id)).toBe("exile");
    expect(zone(s, extra)).toBe("graveyard");
    expect(s.linkedExile?.[`${r}@${s.objects[r]!.zoneChanges ?? 0}`]?.map((l) => l.id).sort()).toEqual(Object.values(cards).sort());
  });

  it("dealing combat damage to a player, it offers the artifact, instant and sorcery cards, not the creatures; the Bolt is cast free", () => {
    const { s: s1, ap, opp, r, cards } = escaped();
    let s = attack(s1, ap, opp, r);
    s = until(s, ap, "chooseOption");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong" });
    const options = s.pending?.kind === "chooseOption" ? s.pending.options : [];
    expect([...options].sort()).toEqual([cards.bolt, cards.ring, cards.div, "none"].sort());
    s = act(s, { type: "chooseOption", player: ap, choice: cards.bolt });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: cards.bolt });
    const life = s.players[opp]!.life;
    s = run(s, planCast(s, ap, cards.bolt, [{ kind: "player", id: opp }]));
    s = settle(s, ap);
    // 3 from the Bolt (after the combat damage), cast without paying its mana cost.
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(zone(s, cards.bolt)).toBe("graveyard");
    expect(s.log.some((l) => /casts Lightning Bolt.*without paying its mana cost/.test(l.text))).toBe(true);
  });

  it("cast from a hand, it has no such ability: combat damage offers nothing", () => {
    const { s: s0, ap, opp } = setup([robber()]);
    const r = s0.players[ap]!.hand[0]!;
    const ring = toYard(s0, ap, solRing());
    let s = settle(run(s0, planCast(s0, ap, r)), ap);
    expect(zone(s, r)).toBe("battlefield");
    expect(s.objects[r]!.escaped).toBeFalsy();
    s = attack(s, ap, opp, r);
    for (let i = 0; i < 300 && s.step !== "end"; i++) {
      expect(s.pending?.kind === "chooseOption" && s.pending.what === "castFromAmong").toBe(false);
      const p = s.pending;
      if (p) for (const a of botActions(s, p.player)) s = act(s, a);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(zone(s, ring)).toBe("graveyard");
  });

  it("after it leaves and escapes again, only the cards that escape exiled are offered (rulings)", () => {
    const { s: s1, ap, opp, r, cards } = escaped();
    // Back to the graveyard, then escaped again with five new cards.
    let s = s1;
    s.battlefield.splice(s.battlefield.indexOf(r), 1);
    s.objects[r]!.zone = "graveyard";
    s.objects[r]!.zoneChanges = (s.objects[r]!.zoneChanges ?? 0) + 1;
    s.objects[r]!.escaped = undefined;
    s.players[ap]!.graveyard.push(r);
    invalidateCharacteristics(s);
    const fresh = [toYard(s, ap, divination()), toYard(s, ap, bears()), toYard(s, ap, bears()), toYard(s, ap, bears()), toYard(s, ap, bears())];
    s = settle(run(s, planCast(s, ap, r, undefined, undefined, undefined, undefined, { via: "escape", exileCards: fresh })), ap);
    expect(zone(s, r)).toBe("battlefield");
    s = attack(s, ap, opp, r);
    s = until(s, ap, "chooseOption");
    const options = s.pending?.kind === "chooseOption" ? s.pending.options : [];
    expect([...options].sort()).toEqual([fresh[0]!, "none"].sort());
    expect(options).not.toContain(cards.bolt);
  });
});
