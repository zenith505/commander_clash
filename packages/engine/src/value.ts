// How good things are for a player: what a permanent is worth to them, what effects on groups of permanents do for
// them, and whether paying for a card with some colors helps them (its text hoping some was spent to cast it).

import { allEffects, type AbilityBody, type ChosenTarget, type Effect, type ObjRef, type SpentReq } from "./abilities";
import { power, toughness, defOf } from "./cards";
import { bindChosen, estimate, harmfulCounter, harmfulTargets, legalTargets, lethalDamage, modsAreHarmful, objectMatches } from "./effects";
import { livingPlayers, obj, opponents } from "./game";
import { characteristics, controllerOf } from "./layers";
import { compileCard } from "./oracle";
import { COLORS, type CardDef, type Chosen, type Color, type GameObject, type GameState, type PlayerId } from "./types";
import { defMv } from "./faces";

const mv = (s: GameState, id: string) => defMv(defOf(s, obj(s, id)));

/** What a permanent is worth to whoever controls it: a creature by its size, a commander most. */
export function worth(s: GameState, pid: PlayerId, o: GameObject): number {
  const c = characteristics(s, o);
  if (c.types.includes("Creature")) return Math.max(1, power(s, o) + toughness(s, o)) + (o.isCommander ? 6 : 0) + (o.isToken ? 0 : 1);
  if (c.types.includes("Land")) return 3;
  return 1 + mv(s, o.id);
}

/** While working out groupValue for one player as the target of "each creature target player controls": who, by target. */
let ofPick: Map<number, PlayerId> | undefined;

/** The player targets whose permanents a group effect touches ("tap all creatures target opponent controls"). */
export function ofPlayerTargets(body: AbilityBody): number[] {
  const out = new Set<number>();
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    const of = o.of as { ref?: string; index?: number } | undefined;
    if (o.ref === "each" && of?.ref === "target" && of.index !== undefined) out.add(of.index);
    Object.values(o).forEach(walk);
  };
  walk(body.effects);
  return [...out];
}

/** The player to target for "... each creature target player controls": the one for whom the group effects do us the most good. */
export function ofPlayerPick(s: GameState, pid: PlayerId, body: AbilityBody, i: number, pool: ChosenTarget[], sourceId?: string): ChosenTarget | undefined {
  let top: { t: ChosenTarget; v: number } | undefined;
  for (const t of pool) {
    if (t.kind !== "player") continue;
    ofPick = new Map([[i, t.id]]);
    const v = groupValue(s, pid, body, undefined, sourceId) ?? 0;
    ofPick = undefined;
    if (!top || v > top.v) top = { t, v };
  }
  return top && top.v > 0 ? top.t : undefined;
}

/**
 * What effects on groups of permanents ("destroy all creatures", "each creature gets -1/-1", "untap all
 * creatures you control") do for us: the worth of what they hurt of the opponents' and help of ours,
 * less the reverse. Null if the body has none. `chosen`: what we'd choose for its source ("the chosen type").
 */
export function groupValue(s: GameState, pid: PlayerId, body: AbilityBody, chosen?: Chosen, sourceId?: string): number | null {
  // "Destroy all creatures target player controls": as good as it is for the player we'd target (see ofPlayerPick).
  const of = ofPlayerTargets(body);
  if (of.length && !ofPick) {
    let top: number | null = null;
    for (const p of livingPlayers(s)) {
      ofPick = new Map(of.map((i) => [i, p]));
      const v = groupValue(s, pid, body, chosen, sourceId);
      ofPick = undefined;
      if (v !== null && (top === null || v > top)) top = v;
    }
    return top;
  }
  // Reign of Terror: "Destroy all green creatures or all white creatures": the better of the two for us.
  const ei = body.effects.findIndex((e) => e.type === "either" && e.options.every((o) => o.every((x) => x.type === "destroy" || x.type === "damage")));
  const either = body.effects[ei];
  if (either?.type === "either") {
    let best: number | null = null;
    for (const o of either.options) {
      const val = groupValue(s, pid, { ...body, effects: [...body.effects.slice(0, ei), ...o, ...body.effects.slice(ei + 1)] }, chosen, sourceId);
      if (val !== null && (best === null || val > best)) best = val;
    }
    return best;
  }
  let v: number | null = null;
  const group = (r: ObjRef) => {
    if (r.ref !== "each") return [];
    const whose = r.of?.ref === "target" ? ofPick?.get(r.of.index) : undefined;
    if (r.of && whose === undefined) return [];
    const filter = bindChosen(r.filter, sourceId ? (obj(s, sourceId).chosen ?? chosen) : chosen);
    return s.battlefield.map((id) => obj(s, id)).filter((o) => !(r.other && o.id === sourceId) && (whose === undefined || controllerOf(s, o) === whose) && objectMatches(s, filter, o, pid, false));
  };
  const add = (objs: GameObject[], harmful: boolean, scale = (_: GameObject) => 1) => {
    for (const o of objs) v = (v ?? 0) + (controllerOf(s, o) === pid ? -1 : 1) * (harmful ? 1 : -1) * worth(s, pid, o) * scale(o);
  };
  // A reflexive trigger's instructions too: "Sacrifice a creature. When you do, all creatures get -X/-X" (Tip the Scales).
  for (const e of allEffects(body.effects).flatMap((x) => (x.type === "reflexive" && !x.body.modal ? [x, ...allEffects(x.body.effects)] : [x]))) {
    // "Each player chooses ..., then sacrifices the rest": each keeps their best (with Mythos of Snapdax's choice made by
    // us, the opponents keep their worst), and loses the rest.
    if (e.type === "keepRest") {
      const who = e.who.ref === "eachPlayer" ? livingPlayers(s) : e.who.ref === "eachOpponent" ? opponents(s, pid) : [];
      for (const p of who) {
        const best = !e.youChoose || p === pid ? -1 : 1;
        const theirs = s.battlefield.map((id) => obj(s, id)).filter((o) => controllerOf(s, o) === p && objectMatches(s, { ...e.among, controller: "you" }, o, p, false));
        const kept = new Set<string>();
        // Restore Balance: as many as the player who controls the fewest.
        const fewest = Math.min(...who.map((q) => s.battlefield.filter((id) => controllerOf(s, obj(s, id)) === q && objectMatches(s, { ...e.among, controller: "you" }, obj(s, id), q, false)).length));
        for (const k of e.keep)
          theirs.filter((o) => objectMatches(s, { ...k.filter, controller: "you" }, o, p, false)).sort((a, b) => best * (worth(s, pid, a) - worth(s, pid, b))).slice(0, k.fewest ? fewest : k.n).forEach((o) => kept.add(o.id));
        add(theirs.filter((o) => !kept.has(o.id)), true);
      }
      v = v ?? 0;
      continue;
    }
    // By Invitation Only: "Each player sacrifices that many creatures of their choice", the number we'd choose: each
    // loses their least useful ones.
    if (e.type === "pick" && e.action === "sacrifice" && typeof e.n === "object" && e.n.count.kind === "chosenNumber") {
      const n = chosen?.number ?? 0;
      const who = e.who.ref === "eachPlayer" ? livingPlayers(s) : e.who.ref === "eachOpponent" ? opponents(s, pid) : [];
      for (const p of who) add(s.battlefield.map((id) => obj(s, id)).filter((o) => controllerOf(s, o) === p && objectMatches(s, { ...e.filter, controller: "you" }, o, p, false)).sort((a, b) => worth(s, pid, a) - worth(s, pid, b)).slice(0, n), true);
      v = v ?? 0;
      continue;
    }
    if (e.type === "damage") {
      const amount = estimate(e.amount);
      if (e.to.ref === "each") add(group(e.to), true, (o) => (lethalDamage(s, o) <= amount ? 1 : 0.2));
      // Hitting every player costs us as much as any one opponent; it's worth it against several.
      if (e.to.ref === "eachPlayer") v = (v ?? 0) + (amount * (opponents(s, pid).length - 2)) / 2;
      continue;
    }
    if (!("what" in e) || typeof e.what !== "object" || e.what.ref !== "each") continue;
    const objs = group(e.what);
    if (e.type === "destroy" || e.type === "exile" || e.type === "bounce" || e.type === "tap" || e.type === "putInLibrary" || e.type === "phaseOut") add(objs, true);
    else if (e.type === "untap") add(objs.filter((o) => o.tapped), false, () => 0.5);
    else if (e.type === "counters") add(objs, harmfulCounter(e.counter), () => estimate(e.n) / 2);
    else if (e.type === "continuous") {
      // "All creatures get -1/-1": what it kills counts in full (CR 704.5f), the rest a little.
      const shrink = e.mods.reduce((n, m) => n + (m.kind === "modifyPT" ? Math.min(0, estimate(m.toughness)) : 0), 0);
      add(objs, modsAreHarmful(e.mods), shrink < 0 ? (o) => (lethalDamage(s, o) <= -shrink ? 1 : 0.2) : () => 0.5);
    }
    else v = v ?? 0;
  }
  // A group we'd mostly empty of our own things: also nothing gained if both sides are empty.
  return v;
}

/**
 * How good meeting each hope a card's text has about the mana spent to cast it would be for its caster `pid` now
 * (`wantSpent`, CR 601.2h): above 0 when it helps ("draw a card", an adamant counter, keeping Azorius Herald), below 0
 * when it hurts them (Rolling Spoil's "all creatures get -1/-1" killing more of theirs than the opponents', Firespout's
 * damage to their own creatures), 0 when it does nothing. The caster chooses what mana pays (CR 601.2h), so autopay
 * and the payment spend or keep back those colors by this.
 */
export function hopeValues(s: GameState, pid: PlayerId, d: CardDef): { req: SpentReq; value: number }[] {
  const c = compileCard(d);
  const key = (r: SpentReq) => JSON.stringify(r);
  return (c.wantSpent ?? []).map((req) => {
    let value = 0;
    const visit = (v: unknown, body?: AbilityBody): void => {
      if (Array.isArray(v)) return v.forEach((x) => visit(x, body));
      if (!v || typeof v !== "object") return;
      const o = v as { type?: string; kind?: string; cond?: { kind?: string; req?: SpentReq; target?: number }; req?: SpentReq; effects?: Effect[]; otherwise?: Effect[] };
      if (o.type === "if" && o.cond?.kind === "spent" && o.cond.target === undefined && key(o.cond.req!) === key(req)) {
        // "... instead" (Vigor Mortis's +1/+1 counter, Mythos of Nethroi's "or if {G}{W} was spent"): the paid version
        // does more, so with nothing to tell them apart it's still a small bonus.
        const diff = listValue(s, pid, o.effects ?? [], body) - listValue(s, pid, o.otherwise ?? [], body);
        value += diff === 0 && o.otherwise?.length ? 0.5 : diff;
        return;
      }
      // An amount that counts it (adamant: "enters with a +1/+1 counter").
      if (o.kind === "spentWas" && key(o.req!) === key(req)) value += 1;
      Object.values(v).forEach((x) => visit(x, body));
    };
    if (c.spell) visit(c.spell.effects, c.spell);
    visit(c.entersWithCounters);
    for (const t of c.triggers) {
      if (t.event !== "selfEnters") continue;
      if (t.ifSpent && key(t.ifSpent) === key(req)) value += listValue(s, pid, t.body.effects, t.body);
      else visit(t.body.effects, t.body);
    }
    return { req, value };
  });
}

/**
 * What these instructions do for `pid`: effects on groups by groupValue; sacrificing the card itself is a loss; a harmful
 * instruction whose only legal targets are their own hurts them (Tin Street Hooligan's "destroy target artifact" with
 * only their artifacts on the battlefield); anything else, a bonus.
 */
function listValue(s: GameState, pid: PlayerId, effects: Effect[], body?: AbilityBody): number {
  if (!effects.length) return 0;
  // "You may have target creature get -3/-3" (Cankerous Thirst): the caster decides then, so it can't hurt them.
  if (effects.every((e) => e.type === "may")) return 1;
  const all = allEffects(effects);
  if (all.some((e) => e.type === "sacrifice" && "what" in e && (e.what as ObjRef).ref === "self")) return -5;
  const group = groupValue(s, pid, { targets: body?.targets ?? [], effects, text: "" });
  if (group !== null) return group;
  if (body) {
    // Only the targets these instructions are harmful to.
    const harm = harmfulTargets({ ...body, effects });
    for (const [i, spec] of body.targets.entries()) {
      if (!harm[i] || spec.optional) continue;
      const pool = legalTargets(s, spec, pid);
      const theirs = pool.some((t) => (t.kind === "player" ? t.id !== pid : t.kind === "object" && controllerOf(s, obj(s, t.id)) !== pid));
      if (pool.length && !theirs) return -2;
    }
  }
  return 1;
}

/**
 * The colors to spend on a card and the ones to keep off it, where its cost leaves a choice (generic or hybrid mana):
 * `want`, how much of each color the hopes worth meeting ask for; `avoid`, how much each color would cost the caster.
 */
export function spendPlan(s: GameState, pid: PlayerId, d: CardDef, pool: Record<Color, number>): { want?: Partial<Record<Color, number>>; avoid?: Partial<Record<Color, number>> } {
  const hopes = hopeValues(s, pid, d);
  if (!hopes.length) return {};
  const want: Partial<Record<Color, number>> = {};
  const avoid: Partial<Record<Color, number>> = {};
  const wantOf = (c: Color, n: number) => (want[c] = Math.max(want[c] ?? 0, n));
  for (const { req, value } of hopes) {
    if (value > 0) {
      for (const [c, n] of Object.entries(req.colors ?? {})) wantOf(c as Color, n ?? 1);
      if (req.sameColor) wantOf([...COLORS].sort((a, b) => pool[b] - pool[a])[0]!, req.sameColor);
    } else if (value < 0) for (const c of Object.keys(req.colors ?? {}) as Color[]) avoid[c] = (avoid[c] ?? 0) - value;
  }
  for (const c of Object.keys(want) as Color[]) delete avoid[c];
  return { ...(Object.keys(want).length ? { want } : {}), ...(Object.keys(avoid).length ? { avoid } : {}) };
}
