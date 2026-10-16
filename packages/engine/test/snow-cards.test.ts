// Snow cards beyond snow mana itself: cumulative upkeep {S} (CR 702.24a, paid with snow mana, 107.4h); "look at the top
// card; if it's a snow card, you may reveal it and put it into your hand" (you can't reveal a card that isn't snow, and
// needn't reveal one that is, rulings on Scrying Sheets); snow landwalk (CR 702.14c); "snow and Zombie creatures" (a snow
// Zombie gets the bonus once, rulings on Narfi); "can't be blocked this turn except by snow creatures"; "target creature
// blocks target creature this turn if able" (rulings on Rimehorn Aurochs); an enters trigger with "if it's on the
// battlefield" (CR 603.4) that deals damage both ways, like a fight (rulings on Stalking Yeti); lands that become
// creatures with all creature types (Faceless Haven, Mutavault) or an artifact creature type (Frostwalk Bastion, Mishra's
// Factory) and stay lands (CR 205.1b).

import { describe, expect, it } from "vitest";
import { act, card, passAll, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import { blockProblem, botActions, characteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};

// Real oracle text (Scryfall).
const snowForest = card("Snow-Covered Forest", "Basic Snow Land — Forest", "", { oracleText: "({T}: Add {G}.)" });
const snowIsland = card("Snow-Covered Island", "Basic Snow Land — Island", "", { oracleText: "({T}: Add {U}.)" });
const snowPlains = card("Snow-Covered Plains", "Basic Snow Land — Plains", "", { oracleText: "({T}: Add {W}.)" });
const island = card("Island", "Basic Land — Island", "", { oracleText: "({T}: Add {U}.)" });
const plating = card("Glacial Plating", "Snow Enchantment — Aura", "{2}{W}{W}", { keywords: ["Enchant", "Cumulative upkeep"], oracleText: "Enchant creature\nCumulative upkeep {S} (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it. {S} can be paid with one mana from a snow source.)\nEnchanted creature gets +3/+3 for each age counter on this Aura." });
const augur = card("Frost Augur", "Snow Creature — Human Wizard", "{U}", { power: "1", toughness: "2", oracleText: "{S}, {T}: Look at the top card of your library. If it's a snow card, you may reveal it and put it into your hand. ({S} can be paid with one mana from a snow source.)" });
const sheets = card("Scrying Sheets", "Snow Land", "", { oracleText: "{T}: Add {C}.\n{1}{S}, {T}: Look at the top card of your library. If that card is snow, you may reveal it and put it into your hand. ({S} can be paid with one mana from a snow source.)" });
const narfi = card("Narfi, Betrayer King", "Legendary Snow Creature — Zombie Wizard", "{3}{U}{B}", { power: "4", toughness: "3", oracleText: "Other snow and Zombie creatures you control get +1/+1.\n{S}{S}{S}: Return this card from your graveyard to the battlefield tapped. ({S} can be paid with one mana from a snow source.)" });
const musher = card("Zombie Musher", "Snow Creature — Zombie", "{3}{B}", { power: "2", toughness: "3", keywords: ["Snow landwalk"], oracleText: "Snow landwalk (This creature can't be blocked as long as defending player controls a snow land.)\n{S}: Regenerate this creature. ({S} can be paid with one mana from a snow source.)" });
const transfusion = card("Rime Transfusion", "Snow Enchantment — Aura", "{1}{B}", { keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature gets +2/+1 and has \"{S}: This creature can't be blocked this turn except by snow creatures.\" ({S} can be paid with one mana from a snow source.)" });
const aurochs = card("Rimehorn Aurochs", "Snow Creature — Aurochs", "{4}{G}", { power: "3", toughness: "3", keywords: ["Trample"], oracleText: "Trample\nWhenever this creature attacks, it gets +1/+0 until end of turn for each other attacking Aurochs.\n{2}{S}: Target creature blocks target creature this turn if able. ({S} can be paid with one mana from a snow source.)" });
const yeti = card("Stalking Yeti", "Snow Creature — Yeti", "{2}{R}{R}", { power: "3", toughness: "3", oracleText: "When this creature enters, if it's on the battlefield, it deals damage equal to its power to target creature an opponent controls and that creature deals damage equal to its power to this creature.\n{2}{S}: Return this creature to its owner's hand. Activate only as a sorcery. ({S} can be paid with one mana from a snow source.)" });
const haven = card("Faceless Haven", "Snow Land", "", { oracleText: "{T}: Add {C}.\n{S}{S}{S}: This land becomes a 4/3 creature with vigilance and all creature types until end of turn. It's still a land. ({S} can be paid with one mana from a snow source.)" });
const bastion = card("Frostwalk Bastion", "Snow Land", "", { oracleText: "{T}: Add {C}.\n{1}{S}: Until end of turn, this land becomes a 2/3 Construct artifact creature. It's still a land. ({S} can be paid with one mana from a snow source.)\nWhenever this land deals combat damage to a creature, tap that creature and it doesn't untap during its controller's next untap step." });
const mutavault = card("Mutavault", "Land", "", { oracleText: "{T}: Add {C}.\n{1}: This land becomes a 2/2 creature with all creature types until end of turn. It's still a land." });
const factory = card("Mishra's Factory", "Land", "", { oracleText: "{T}: Add {C}.\n{1}: This land becomes a 2/2 Assembly-Worker artifact creature until end of turn. It's still a land.\n{T}: Target Assembly-Worker creature gets +1/+1 until end of turn." });
const bear = (name = "Grizzly Bears", type = "Creature — Bear") => card(name, type, "{1}{G}", { power: "2", toughness: "2" });

/** Just these lands for `pid`: the setup's other lands are taken away. */
function onlyLands(s: GameState, pid: PlayerId, lands: CardDef[]): string[] {
  for (const id of [...s.battlefield]) if (s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.typeLine.includes("Land")) s.battlefield.splice(s.battlefield.indexOf(id), 1);
  return lands.map((l) => putOnBattlefield(s, pid, l));
}
/** Put these on top of `pid`'s library, the first on top. */
function onTop(s: GameState, pid: PlayerId, defs: CardDef[]): string[] {
  const ids = defs.map((d) => {
    const id = putOnBattlefield(s, pid, d);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "library";
    return id;
  });
  s.players[pid]!.library.unshift(...ids);
  return ids;
}
const name = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;
const botAnswers = (s: GameState, pid: PlayerId) => {
  s.players[pid]!.isBot = true;
  for (const a of botActions(s, pid)) s = act(s, a);
  s.players[pid]!.isBot = false;
  return s;
};

describe("snow cards", () => {
  it("parse", () => supported(plating, augur, sheets, narfi, musher, transfusion, aurochs, yeti, haven, bastion, mutavault, factory));

  it("Glacial Plating: cumulative upkeep {S} is paid with snow mana; without it the Aura is sacrificed", () => {
    for (const snow of [true, false]) {
      const { s: s0, ap } = setup([]);
      onlyLands(s0, ap, snow ? [snowPlains] : [card("Plains", "Basic Land — Plains")]);
      const b = putOnBattlefield(s0, ap, bear());
      const a = putOnBattlefield(s0, ap, plating);
      s0.objects[a]!.attachedTo = b;
      let s = passUntil(s0, "draw", s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!);
      s = settle(passUntil(s, "upkeep", ap));
      expect(s.log.some((l) => /Glacial Plating gets an age counter \(1\)/.test(l.text))).toBe(true);
      if (snow) {
        expect(s.pending).toMatchObject({ kind: "chooseMay", pay: { mana: "{S}" }, keep: true });
        s = settle(botAnswers(s, ap));
        expect(s.objects[a]!.zone).toBe("battlefield");
        expect(pt(s, b)).toBe("5/5");
      } else expect(s.objects[a]!.zone).toBe("graveyard");
    }
  });

  it("Frost Augur: a snow card on top may be revealed and put into your hand; any other card stays", () => {
    for (const top of [snowIsland, island]) {
      const { s: s0, ap } = setup([]);
      onlyLands(s0, ap, [snowIsland]);
      const f = putOnBattlefield(s0, ap, augur);
      const [t] = onTop(s0, ap, [top]);
      let s = settle(passAll(run(s0, planActivate(s0, ap, f, 0))));
      expect(s.log.some((l) => /looks at the top card of their library/.test(l.text))).toBe(true);
      if (top === snowIsland) {
        expect(s.pending).toMatchObject({ kind: "chooseMay", card: t, prompt: "reveal Snow-Covered Island and put it into your hand" });
        s = settle(botAnswers(s, ap));
        expect(s.objects[t!]!.zone).toBe("hand");
        expect(s.log.some((l) => /reveals Snow-Covered Island/.test(l.text))).toBe(true);
      } else {
        expect(s.pending).toBeNull();
        expect(s.players[ap]!.library[0]).toBe(t);
      }
    }
  });

  it("Scrying Sheets: \"if that card is snow\"; you needn't reveal it", () => {
    const { s: s0, ap } = setup([]);
    const [sh] = onlyLands(s0, ap, [sheets, snowIsland, island]);
    const [t] = onTop(s0, ap, [snowForest]);
    let s = settle(passAll(run(s0, planActivate(s0, ap, sh!, 0))));
    expect(s.pending).toMatchObject({ kind: "chooseMay", card: t });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.players[ap]!.library[0]).toBe(t);
    expect(name(s, s.players[ap]!.library[0]!)).toBe("Snow-Covered Forest");
  });

  it("Narfi: other snow creatures and Zombies get +1/+1, a snow Zombie only once", () => {
    const { s: s0, ap } = setup([]);
    const n = putOnBattlefield(s0, ap, narfi);
    const snowBear = putOnBattlefield(s0, ap, bear("Snow Bear", "Snow Creature — Bear"));
    const zombie = putOnBattlefield(s0, ap, bear("Zombie Bear", "Creature — Zombie Bear"));
    const both = putOnBattlefield(s0, ap, bear("Snow Zombie", "Snow Creature — Zombie"));
    const plain = putOnBattlefield(s0, ap, bear());
    expect([n, snowBear, zombie, both, plain].map((id) => pt(s0, id))).toEqual(["4/3", "3/3", "3/3", "3/3", "2/2"]);
  });

  it("Zombie Musher: snow landwalk only against a player with a snow land", () => {
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, musher);
    const blocker = putOnBattlefield(s0, opp, bear());
    s0.objects[m]!.attacking = opp;
    expect(blockProblem(s0, s0.objects[blocker]!, s0.objects[m]!)).toBeNull();
    putOnBattlefield(s0, opp, snowForest);
    expect(blockProblem(s0, s0.objects[blocker]!, s0.objects[m]!)).toMatch(/snow landwalk/);
  });

  it("Rime Transfusion: +2/+1, and {S}: can't be blocked this turn except by snow creatures", () => {
    const { s: s0, ap, opp } = setup([]);
    onlyLands(s0, ap, [snowIsland]);
    const b = putOnBattlefield(s0, ap, bear());
    const a = putOnBattlefield(s0, ap, transfusion);
    s0.objects[a]!.attachedTo = b;
    expect(pt(s0, b)).toBe("4/3");
    const s = passAll(run(s0, planActivate(s0, ap, b, 0)));
    s.objects[b]!.attacking = opp;
    const plain = putOnBattlefield(s, opp, bear());
    const snowy = putOnBattlefield(s, opp, bear("Snow Bear", "Snow Creature — Bear"));
    expect(blockProblem(s, s.objects[plain]!, s.objects[b]!)).toMatch(/except by snow creatures/);
    expect(blockProblem(s, s.objects[snowy]!, s.objects[b]!)).toBeNull();
  });

  it("Rimehorn Aurochs: the first target must block the second this turn if able", () => {
    const { s: s0, ap, opp } = setup([]);
    onlyLands(s0, ap, [snowForest, snowForest, snowForest]);
    const au = putOnBattlefield(s0, ap, aurochs);
    const mine = putOnBattlefield(s0, ap, bear("Attacker Bear"));
    const theirs = putOnBattlefield(s0, opp, bear());
    const s = passAll(run(s0, planActivate(s0, ap, au, 0, [target(theirs), target(mine)])));
    expect(s.objects[theirs]!.provokedBy).toMatchObject({ id: mine, turn: s.turn });
  });

  it("Stalking Yeti: it and the target deal damage to each other; nothing if the Yeti has left", () => {
    for (const leaves of [false, true]) {
      const { s: s0, ap, opp, ids } = setup([yeti]);
      const b = putOnBattlefield(s0, opp, bear());
      let s = run(s0, planCast(s0, ap, ids[0]!));
      s = settle(passAll(s));
      if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [target(b)] });
      expect(s.stack.at(-1)?.sourceId).toBe(ids[0]);
      if (leaves) {
        // It leaves before its trigger resolves: the trigger does nothing (CR 603.4).
        const y = s.objects[ids[0]!]!;
        s.battlefield.splice(s.battlefield.indexOf(y.id), 1);
        y.zone = "hand";
        y.zoneChanges = (y.zoneChanges ?? 0) + 1;
        s.players[ap]!.hand.push(y.id);
      }
      s = settle(passAll(s));
      expect(s.objects[b]!.zone).toBe(leaves ? "battlefield" : "graveyard");
      if (!leaves) expect(s.objects[ids[0]!]!.damage).toBe(2);
    }
  });

  it("Faceless Haven and Mutavault become creatures with every creature type and stay lands", () => {
    const { s: s0, ap } = setup([]);
    const [h] = onlyLands(s0, ap, [haven, snowIsland, snowIsland, snowForest, mutavault]);
    let s = passAll(run(s0, planActivate(s0, ap, h!, 0)));
    const c = characteristics(s, s.objects[h!]!);
    expect(c.types).toEqual(expect.arrayContaining(["Land", "Creature"]));
    expect(c.allCreatureTypes).toBe(true);
    expect(c.keywords).toContain("Vigilance");
    expect(pt(s, h!)).toBe("4/3");
    const mv = s.battlefield.find((id) => name(s, id) === "Mutavault")!;
    s.objects[mv]!.tapped = false;
    s = passAll(run(s, planActivate(s, ap, mv, 0)));
    expect(characteristics(s, s.objects[mv]!).allCreatureTypes).toBe(true);
    expect(pt(s, mv)).toBe("2/2");
  });

  it("Frostwalk Bastion and Mishra's Factory become artifact creatures with a creature type, still lands", () => {
    const { s: s0, ap } = setup([]);
    const [b, , , f, f2] = onlyLands(s0, ap, [bastion, snowIsland, snowIsland, factory, factory]);
    let s = passAll(run(s0, planActivate(s0, ap, b!, 0)));
    expect(characteristics(s, s.objects[b!]!)).toMatchObject({ types: expect.arrayContaining(["Land", "Artifact", "Creature"]), subtypes: ["Construct"] });
    expect(pt(s, b!)).toBe("2/3");
    s = passAll(run(s, planActivate(s, ap, f!, 0)));
    expect(characteristics(s, s.objects[f!]!).subtypes).toEqual(["Assembly-Worker"]);
    // The other Factory pumps the Assembly-Worker (untapped again: autopay may have tapped it for mana).
    s.objects[f2!]!.tapped = false;
    s = passAll(run(s, planActivate(s, ap, f2!, 1, [target(f!)])));
    expect(pt(s, f!)).toBe("3/3");
  });
});
