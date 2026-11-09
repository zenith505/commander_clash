// Round 323's sentences and triggers, read before round 322's (round322Sentence and round322Trigger in oracle/round322.ts).
import type { Effect, TriggeredAbility } from "../abilities";
import type { Ctx } from "./body";
import { counterKind, num } from "./words";
import { parseTrigger } from "./triggers";

type Found = { effect: Effect; next: number } | "fail" | null;

export function round323Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  void s;
  void sentences;
  void si;
  void ctx;
  void effects;
  return null;
}

export function round323Trigger(raw: string): TriggeredAbility | "fail" | null {
  // Overseer of Vault 76: "At the beginning of combat on your turn, you may remove three quest counters from among permanents
  // you control. When you do, put a +1/+1 counter on each creature you control and they gain vigilance until end of turn.":
  // exactly three, chosen as it resolves from any permanents you control, never more (rulings); not an option with fewer
  // to remove (CR 608.2d). Removing them makes a reflexive trigger (CR 603.12), its creatures those you control as it
  // resolves.
  const overseer = /^(At the beginning of combat on your turn), you may remove (two|three|four|five) ([a-z]+) counters from among permanents you control\. When you do, (.+)$/.exec(raw);
  if (overseer) {
    const t = parseTrigger(`${overseer[1]!}, ${overseer[4]!}`);
    if (!t || t === "fail" || t.event !== "yourBeginCombat" || t.body.targets.length || !t.body.effects.length) return "fail";
    const counter = counterKind(overseer[3]!);
    const what = `remove ${overseer[2]!} ${overseer[3]!} counters from among permanents you control`;
    const remove: Effect = { type: "distribute", counter, n: num(overseer[2]!), filter: { kind: "object", types: [], notTypes: [], notColors: [], controller: "you", text: "permanents you control" }, remove: true, exact: true };
    return { ...t, body: { targets: [], effects: [{ type: "may", effects: [remove, { type: "reflexive", body: t.body }], text: what }], text: raw.replace(`${overseer[1]!}, `, "") } };
  }
  // Taii Wakeen, Perfect Shot: "Whenever a source you control deals noncombat damage to a creature equal to that creature's
  // toughness, draw a card.": once for each source and creature (as Ghyrson Starn's), the damage dealt equal to the
  // creature's toughness as it's dealt, damage already marked on it not counting (rulings).
  const toughness = /^Whenever a source you control deals noncombat damage to a creature equal to that creature's toughness, (.+)$/.exec(raw);
  if (toughness) {
    const t = parseTrigger(`Whenever a source you control deals exactly 1 damage to a permanent or player, ${toughness[1]!}`);
    if (!t || t === "fail" || t.event !== "sourceYouControlDealsDamage" || t.sourceDamage?.exactly !== 1 || t.sourceDamage.other || t.body.targets.length) return "fail";
    return { ...t, sourceDamage: { exactly: 0, toughness: true } };
  }
  return null;
}
