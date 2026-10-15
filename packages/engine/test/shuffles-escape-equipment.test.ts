// Shuffling cards into libraries (CR 701.20), "sacrifice it unless it escaped" (CR 702.138b), "return it at the
// beginning of the next end step" (CR 603.7), granted ward (CR 702.21), and Equipment that makes a token and
// attaches to it (CR 701.3).

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, passAll, passUntil, putOnBattlefield, setup, swamp, target } from "./helpers";
import { characteristics, isFullySupported, parseManaCost, planCast, planMana, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.oracleText).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return settle(passAll(s));
};
const place = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  return id;
};
const pt = (s: GameState, id: string) => {
  const c = characteristics(s, s.objects[id]!);
  return `${c.power}/${c.toughness}`;
};

const serraAvatar = card("Serra Avatar", "Creature — Avatar", "{4}{W}{W}{W}", { power: "*", toughness: "*", oracleText: "Serra Avatar's power and toughness are each equal to your life total.\nWhen Serra Avatar is put into a graveyard from anywhere, shuffle it into its owner's library.", cmc: 7 });
const timetwister = card("Timetwister", "Sorcery", "{2}{U}", { oracleText: "Each player shuffles their hand and graveyard into their library, then draws seven cards. (Then put Timetwister into its owner's graveyard.)", cmc: 3 });
const beaconOfDestruction = card("Beacon of Destruction", "Instant", "{3}{R}{R}", { oracleText: "Beacon of Destruction deals 5 damage to any target. Shuffle Beacon of Destruction into its owner's library.", cmc: 5 });
const ceruleanSphinx = card("Cerulean Sphinx", "Creature — Sphinx", "{4}{U}{U}", { power: "5", toughness: "5", oracleText: "Flying\n{U}: This creature's owner shuffles it into their library.", keywords: ["Flying"], cmc: 6 });
const mnemonicNexus = card("Mnemonic Nexus", "Instant", "{3}{U}", { oracleText: "Each player shuffles their graveyard into their library.", cmc: 4 });
const uro = card("Uro, Titan of Nature's Wrath", "Legendary Creature — Elder Giant", "{1}{G}{U}", { power: "6", toughness: "6", oracleText: "When Uro enters, sacrifice it unless it escaped.\nWhenever Uro enters or attacks, you gain 3 life and draw a card, then you may put a land card from your hand onto the battlefield.\nEscape—{G}{G}{U}{U}, Exile five other cards from your graveyard. (You may cast this card from your graveyard for its escape cost.)", keywords: ["Escape"], cmc: 3 });
const locustGod = card("The Locust God", "Legendary Creature — God", "{4}{U}{R}", { power: "4", toughness: "4", oracleText: "Flying\nWhenever you draw a card, create a 1/1 blue and red Insect creature token with flying and haste.\n{2}{U}{R}: Draw a card, then discard a card.\nWhen The Locust God dies, return it to its owner's hand at the beginning of the next end step.", keywords: ["Flying"], cmc: 6 });
const giantAnkheg = card("Giant Ankheg", "Creature — Insect", "{6}{G}{G}", { power: "8", toughness: "8", oracleText: "Trample\nWard {2} (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays {2}.)\nOther creatures you control have trample and ward {2}.", keywords: ["Trample", "Ward"], cmc: 8 });
const ancestralBlade = card("Ancestral Blade", "Artifact — Equipment", "{1}{W}", { oracleText: "When this Equipment enters, create a 1/1 white Soldier creature token, then attach this Equipment to it.\nEquipped creature gets +1/+1.\nEquip {1} ({1}: Attach to target creature you control. Equip only as a sorcery.)", keywords: ["Equip"], cmc: 2 });
const draugrsHelm = card("Draugr's Helm", "Artifact — Equipment", "{1}{B}", { oracleText: "When this Equipment enters, you may pay {2}{B}. If you do, create a 2/2 black Zombie Berserker creature token, then attach this Equipment to it.\nEquipped creature gets +2/+2 and has menace. (It can't be blocked except by two or more creatures.)\nEquip {4}", keywords: ["Equip"], cmc: 2 });
const mill = card("Mill Two", "Sorcery", "{U}", { oracleText: "Target player mills two cards." });
const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const filler = card("Filler", "Sorcery", "{U}", { oracleText: "Draw a card." });

describe("shuffling cards into libraries", () => {
  it("compiles the cards", () => supported(serraAvatar, timetwister, beaconOfDestruction, ceruleanSphinx, mnemonicNexus));

  it("Serra Avatar milled into a graveyard is shuffled into its owner's library", () => {
    const { s: s0, ap, ids } = setup([mill]);
    const avatar = place(s0, ap, serraAvatar, "library");
    const size = s0.players[ap]!.library.length;
    const s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: ap }]));
    expect(s.objects[avatar]!.zone).toBe("library");
    expect(s.players[ap]!.library.length).toBe(size - 1);
    expect(s.players[ap]!.graveyard.length).toBe(2); // the other milled card and the spell
  });

  it("Timetwister: each player shuffles hand and graveyard into their library, then draws seven", () => {
    const { s: s0, ap, ids, opp } = setup([timetwister]);
    const dead = place(s0, opp, bear(), "graveyard");
    const s = run(s0, planCast(s0, ap, ids[0]!));
    for (const pid of s.turnOrder) expect(s.players[pid]!.hand.length).toBe(7);
    expect(s.objects[dead]!.zone === "library" || s.players[opp]!.hand.includes(dead)).toBe(true);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard"); // the spell itself goes to the graveyard afterwards
  });

  it("Mnemonic Nexus shuffles every graveyard into its library", () => {
    const { s: s0, ap, ids, opp } = setup([mnemonicNexus]);
    const a = place(s0, ap, bear(), "graveyard");
    const b = place(s0, opp, bear(), "graveyard");
    const s = run(s0, planCast(s0, ap, ids[0]!));
    expect([s.objects[a]!.zone, s.objects[b]!.zone]).toEqual(["library", "library"]);
  });

  it("Beacon of Destruction shuffles itself into its owner's library as it resolves", () => {
    const { s: s0, ap, ids, opp } = setup([beaconOfDestruction]);
    const life = s0.players[opp]!.life;
    const s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    expect(s.players[opp]!.life).toBe(life - 5);
    expect(s.objects[ids[0]!]!.zone).toBe("library");
  });

  it("Cerulean Sphinx: its owner shuffles it into their library", () => {
    const { s: s0, ap } = setup([]);
    const sphinx = putOnBattlefield(s0, ap, ceruleanSphinx);
    const s = activate(s0, ap, sphinx, 0);
    expect(settle(s).objects[sphinx]!.zone).toBe("library");
  });
});

describe("Uro and The Locust God", () => {
  it("compiles", () => supported(uro, locustGod));

  it("Uro cast from hand is sacrificed, but its enters trigger still happens; escaped, it stays (CR 702.138b)", () => {
    const { s: s0, ap, ids } = setup([uro]);
    const life = s0.players[ap]!.life;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 4 && s.pending; i++) s = settle(act(s, s.pending.kind === "chooseMay" ? { type: "chooseMay", player: ap, yes: false } : { type: "searchLibrary", player: ap, found: [] }));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(life + 3);
    const others = Array.from({ length: 5 }, () => place(s, ap, filler, "graveyard"));
    for (const id of s.battlefield) s.objects[id]!.tapped = false;
    s = run(s, planCast(s, ap, ids[0]!, undefined, undefined, undefined, undefined, { via: "escape", exileCards: others }));
    for (let i = 0; i < 4 && s.pending; i++) s = settle(act(s, s.pending.kind === "chooseMay" ? { type: "chooseMay", player: ap, yes: false } : { type: "searchLibrary", player: ap, found: [] }));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.players[ap]!.life).toBe(life + 6);
  });

  it("The Locust God returns to its owner's hand at the beginning of the next end step", () => {
    const { s: s0, ap, ids } = setup([murder]);
    const god = putOnBattlefield(s0, ap, locustGod);
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(god)]));
    expect(s.objects[god]!.zone).toBe("graveyard");
    s = passUntil(s, "end", ap);
    s = settle(s);
    expect(s.objects[god]!.zone).toBe("hand");
  });
});

describe("granted ward and Equipment that attaches to a new token", () => {
  it("compiles", () => supported(giantAnkheg, ancestralBlade, draugrsHelm));

  it("Giant Ankheg gives other creatures ward {2}: an opponent's spell is countered unless they pay", () => {
    const { s: s0, ap, ids, opp } = setup([shock]);
    putOnBattlefield(s0, opp, giantAnkheg);
    const b = putOnBattlefield(s0, opp, bear());
    expect(characteristics(s0, s0.objects[b]!).keywords).toEqual(expect.arrayContaining(["Trample"]));
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!, [target(b)])!) s = act(s, a);
    for (let i = 0; i < 20 && !s.pending && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "payUnless", player: ap });
    s = settle(act(s, { type: "payUnless", player: ap, pay: false }));
    expect(s.objects[b]!.damage).toBe(0);
  });

  it("Ancestral Blade makes a Soldier and attaches to it", () => {
    const { s: s0, ap, ids } = setup([ancestralBlade]);
    const s = run(s0, planCast(s0, ap, ids[0]!));
    const host = s.objects[ids[0]!]!.attachedTo!;
    expect(s.objects[host]!.isToken).toBe(true);
    expect(characteristics(s, s.objects[host]!).subtypes).toEqual(["Soldier"]);
    expect(pt(s, host)).toBe("2/2");
  });

  it("Draugr's Helm: pay {2}{B} for a Zombie Berserker wearing it, or don't", () => {
    const { s: s0, ap, ids } = setup([draugrsHelm, draugrsHelm]);
    for (let i = 0; i < 4; i++) putOnBattlefield(s0, ap, swamp);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "chooseMay", pay: { mana: "{2}{B}" } });
    for (const a of planMana(s, ap, parseManaCost("{2}{B}"))!) s = act(s, a);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    const host = s.objects[ids[0]!]!.attachedTo!;
    expect(host).toBeDefined();
    expect(pt(s, host)).toBe("4/4");
    expect(characteristics(s, s.objects[host]!).keywords).toContain("Menace");
    const tokens = s.battlefield.filter((id) => s.objects[id]!.isToken).length;
    for (const id of s.battlefield) s.objects[id]!.tapped = false;
    s = run(s, planCast(s, ap, ids[1]!));
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.objects[ids[1]!]!.attachedTo).toBeUndefined();
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken).length).toBe(tokens);
  });
});
