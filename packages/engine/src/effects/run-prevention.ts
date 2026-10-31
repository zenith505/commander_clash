import type { DamageRecipient, Effect, TargetSpec } from "../abilities";
import { cardIdOf, defOf } from "../cards";
import { log, obj, player } from "../game";
import { characteristics, controllerOf } from "../layers";
import type { DamageRule, GameState, ObjectId, PlayerId } from "../types";
import { ResolveCtx, amountNow, damageRecipients, objects } from "./resolve";
import { bindChosen, objectMatches, printedMatches } from "./targeting";
import { addDelayed } from "./run-spells";

/** A source of damage a player can choose (CR 609.7a), as an option: `id@zc`. */
export interface SourceOption {
  key: string;
  id: ObjectId;
  zc: number;
  spell: boolean;
  name: string;
  controller: PlayerId;
}

/**
 * The sources of damage a player may choose (CR 609.7a): each permanent, each spell on the stack (a permanent spell
 * too), and each object an ability on the stack refers to as its source, even if it has left its zone; only those
 * that fit `filter` now ("a red source of your choice"). Face-up objects in the command zone can be chosen too, but
 * they can't deal damage from there, so they aren't offered.
 */
export function damageSourceOptions(s: GameState, filter: TargetSpec | undefined, controller: PlayerId): SourceOption[] {
  const out: SourceOption[] = [];
  const seen = new Set<string>();
  const add = (o: SourceOption) => {
    if (seen.has(o.key)) return;
    seen.add(o.key);
    out.push(o);
  };
  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (filter && !objectMatches(s, filter, o, controller, false)) continue;
    const zc = o.zoneChanges ?? 0;
    add({ key: `${id}@${zc}`, id, zc, spell: false, name: characteristics(s, o).name, controller: controllerOf(s, o) });
  }
  for (const item of [...s.stack].reverse()) {
    if (item.kind === "spell" && item.objectId) {
      const o = s.objects[item.objectId];
      if (!o || (filter && !printedMatches(filter, defOf(s, o)))) continue;
      const zc = o.zoneChanges ?? 0;
      add({ key: `${o.id}@${zc}`, id: o.id, zc, spell: true, name: defOf(s, o).name, controller: item.controller });
    } else if (item.kind === "ability" && item.sourceId && item.sourceCardId) {
      // An ability's source that has left the battlefield is still a source it refers to, as it last existed.
      const o = s.objects[item.sourceId];
      const zc = item.sourceZc ?? o?.zoneChanges ?? 0;
      if (!o || (o.zone === "battlefield" && (o.zoneChanges ?? 0) === zc)) continue;
      const d = s.cards[item.sourceCardId];
      if (!d || (filter && !printedMatches(filter, d))) continue;
      add({ key: `${o.id}@${zc}`, id: o.id, zc, spell: false, name: d.name, controller: s.lastKnown?.[o.id]?.controller ?? item.controller });
    }
  }
  return out;
}

/**
 * Asks the ability's controller for a source of damage (CR 609.7a) as it resolves, then gives the one chosen, as the
 * object it is; null when there's none to choose.
 */
export function chooseDamageSource(s: GameState, ctx: ResolveCtx, filter: TargetSpec, src: string): "paused" | { id: ObjectId; zc: number; spell?: true } | null {
  const sc = (s.resolving!.scratch ??= {});
  if (sc.damageSource === undefined) {
    const options = damageSourceOptions(s, filter, ctx.controller);
    if (!options.length) {
      log(s, `${src}: there's no ${filter.text ? `${filter.text.replace(/^target /, "")} ` : ""}source to choose.`);
      return null;
    }
    s.pending = {
      kind: "chooseOption",
      player: ctx.controller,
      source: src,
      what: "damageSource",
      prompt: `choose a source of damage${filter.text ? ` (${filter.text.replace(/^target /, "")})` : ""}`,
      options: options.map((o) => o.key),
      labels: options.map((o) => `${o.name}${o.spell ? " (spell)" : ""}, ${player(s, o.controller).name}'s`),
    };
    return "paused";
  }
  const [id, zc] = sc.damageSource.split("@");
  const o = s.objects[id!];
  if (!o) return null;
  const spell = o.zone === "stack" && s.stack.some((x) => x.kind === "spell" && x.objectId === o.id);
  log(s, `${player(s, ctx.controller).name} chooses ${spell ? defOf(s, o).name : o.zone === "battlefield" ? characteristics(s, o).name : defOf(s, o).name} as the source for ${src}.`);
  return { id: o.id, zc: Number(zc), ...(spell ? { spell: true as const } : {}) };
}

/** The permanent or player a reference means now, as the object it is (CR 400.7), or null if it's gone or illegal. */
function fixedRecipient(s: GameState, to: DamageRecipient, ctx: ResolveCtx): { object: ObjectId; zc: number } | { player: PlayerId } | null {
  const r = to.ref === "attached" ? { objs: objects(s, to, ctx), pids: [] } : damageRecipients(s, to, ctx);
  const o = r.objs[0];
  if (o) return o.zone === "battlefield" ? { object: o.id, zc: o.zoneChanges ?? 0 } : null;
  return r.pids[0] !== undefined ? { player: r.pids[0] } : null;
}

/** Prevention and redirection effects that last the turn and aren't a shield on one permanent or player (CR 615, 614.9). */
export function runPreventionEffect(s: GameState, e: Effect, ctx: ResolveCtx, src: string): "paused" | void {
  if (e.type !== "damageRule") return;
  const spec = e.rule;
  const rule: DamageRule = {
    id: `dr${s.nextId++}`,
    turn: s.turn,
    controller: ctx.controller,
    cardId: (() => {
      const item = s.resolving?.item;
      const spell = item?.kind === "spell" && item.objectId ? s.objects[item.objectId] : undefined;
      return spell ? cardIdOf(spell) : (item?.sourceCardId ?? Object.keys(s.cards).find((k) => s.cards[k] === ctx.sourceDef) ?? "");
    })(),
    ...(spec.combat ? { combat: spec.combat } : {}),
  };
  // The source of your choice, chosen as it resolves (CR 609.7a): asked first, then the rest is worked out.
  if (spec.by?.choose) {
    const filter = bindChosen(spec.by.choose, ctx.chosen);
    const chosen = chooseDamageSource(s, ctx, filter, src);
    if (chosen === "paused") return "paused";
    if (!chosen) return;
    rule.by = { chosen, filter };
  }
  if (spec.by?.filter) rule.by = { ...rule.by, filter: bindChosen(spec.by.filter, ctx.chosen) };
  if (spec.by?.notSelf && ctx.sourceId) rule.by = { ...rule.by, not: { id: ctx.sourceId, zc: ctx.sourceZc ?? s.objects[ctx.sourceId]?.zoneChanges ?? 0 } };
  if (spec.by?.target) {
    // "Prevent all damage target spell would deal this turn" (Hallow): that spell, and the permanent it becomes.
    const i = spec.by.target.ref === "target" ? spec.by.target.index : -1;
    const t = ctx.targets[i];
    if (i < 0 || !t || !ctx.legal[i]) return;
    if (t.kind === "stack") {
      const id = ctx.spellObjects?.[i];
      const so = id ? s.objects[id] : undefined;
      if (!so) return;
      rule.by = { ...rule.by, chosen: { id: so.id, zc: so.zoneChanges ?? 0, spell: true } };
    } else {
      const so = objects(s, spec.by.target, ctx)[0];
      if (!so) return;
      rule.by = { ...rule.by, chosen: { id: so.id, zc: so.zoneChanges ?? 0 } };
    }
  }
  if (spec.to) {
    const to: NonNullable<DamageRule["to"]> = {};
    if (spec.to.players) to.players = spec.to.players;
    if (spec.to.objects) to.objects = bindChosen(spec.to.objects, ctx.chosen);
    if (spec.to.target) {
      // A target that's gone or illegal now gets no protection (CR 608.2b).
      const r = fixedRecipient(s, spec.to.target, ctx);
      if (!r) return;
      if ("object" in r) to.object = { id: r.object, zc: r.zc };
      else to.player = r.player;
    }
    rule.to = to;
  }
  if (spec.n !== undefined) {
    rule.left = amountNow(s, spec.n, ctx);
    if (rule.left <= 0) return;
  }
  if (spec.nextTime) rule.nextTime = true;
  if (spec.redirect) {
    // Where the damage goes is fixed now; if it's gone when the damage comes, the damage isn't redirected (CR 614.9).
    const r = fixedRecipient(s, spec.redirect, ctx);
    if (!r) return;
    rule.redirect = r;
  }
  if (spec.gainLife) rule.gainLife = spec.gainLife;
  if (spec.dealBack) rule.dealBack = spec.dealBack;
  if (spec.tokens) rule.tokens = spec.tokens;
  if (spec.dealTo) {
    // Vengeful Archon: the target as it resolves; if it's gone, damage is still prevented, with none dealt (rulings).
    // Acolyte's Reward: "If only the second target is illegal, damage that would be dealt to the first target will be
    // prevented, but Acolyte's Reward won't deal damage" (rulings, CR 608.2b).
    const r = fixedRecipient(s, spec.dealTo, ctx);
    if (r) rule.dealTo = r;
  }
  if (spec.countersOn && rule.to?.object) {
    const on = rule.to.object;
    if (!spec.countersOn.endStep) rule.countersOn = { counter: spec.countersOn.counter };
    else {
      // Sacred Boon: "At the beginning of the next end step, put a +0/+1 counter on that creature for each 1 damage
      // prevented this way": a delayed trigger (CR 603.7) counting all this rule prevented; on that creature if it's
      // still the same object then (CR 400.7), and a creature (Scars of the Veteran's "If it's a creature").
      rule.countersOn = { counter: spec.countersOn.counter, tally: true };
      (s.preventedTally ??= {})[rule.id] = 0;
      const n = { count: { kind: "preventedByRule" as const, rule: rule.id } };
      const put: Effect = { type: "counters", what: { ref: "subject" }, counter: spec.countersOn.counter, n };
      const effects: Effect[] = spec.countersOn.ifCreature ? [{ type: "if", cond: { kind: "subjectIs", filter: { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "creature" } }, effects: [put] }] : [put];
      addDelayed(s, "nextEndStep", ctx.controller, obj(s, on.id), { targets: [], effects, text: `Put a ${spec.countersOn.counter} counter on that creature for each 1 damage prevented this way.` }, rule.cardId);
    }
  }
  (s.damageRules ??= []).push(rule);
  log(s, `${src}: ${describeRule(s, rule)}.`);
}

/** What a damage rule does, for the log. */
export function describeRule(s: GameState, r: DamageRule): string {
  const by = r.by?.chosen ? `${(() => {
    const o = s.objects[r.by!.chosen!.id];
    return o ? (o.zone === "battlefield" ? characteristics(s, o).name : defOf(s, o).name) : "that source";
  })()}` : r.by?.filter?.text ? r.by.filter.text.replace(/^target /, "") : "";
  const who: string[] = [];
  if (r.to?.players === "you") who.push(player(s, r.controller).name);
  if (r.to?.players === "all") who.push("players");
  if (r.to?.players === "opponents") who.push(`${player(s, r.controller).name}'s opponents`);
  if (r.to?.objects?.text) who.push(r.to.objects.text.replace(/^target /, ""));
  if (r.to?.object) who.push(defOf(s, obj(s, r.to.object.id)).name);
  if (r.to?.player !== undefined) who.push(player(s, r.to.player).name);
  const to = who.length ? ` to ${who.join(" and ")}` : "";
  const what = r.left !== undefined ? `the next ${r.left} ${r.combat === "only" ? "combat " : ""}damage` : r.nextTime ? `the next ${r.combat === "only" ? "combat " : ""}damage` : `all ${r.combat === "only" ? "combat " : r.combat === "non" ? "noncombat " : ""}damage`;
  const dest = r.redirect ? ("player" in r.redirect ? player(s, r.redirect.player).name : defOf(s, obj(s, r.redirect.object)).name) : "";
  return `${what}${by ? ` ${by} would deal` : " that would be dealt"}${to} this turn will be ${dest ? `dealt to ${dest} instead` : "prevented"}`;
}
