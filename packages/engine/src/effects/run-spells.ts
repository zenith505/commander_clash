import type { AbilityBody, Effect, SpellCondition, TargetChoice, UnlessPays } from "../abilities";
import { manaValue, parseManaCost } from "../mana";
import { cardIdOf, defOf, isType } from "../cards";
import { shuffle } from "../rng";
import { castProblem, describeTargets, log, moveObject, newObject, obj, player } from "../game";
import { compileCard } from "../oracle";
import type { DelayedTrigger, GameObject, GameState, ObjectId, PlayerId, StackItem } from "../types";
import { stampTargets } from "./targeting";
import { ResolveCtx, objects, amountNow } from "./resolve";
import { fireEvent } from "./triggers";

/**
 * Put a copy of this spell on the stack under `controller` (CR 707.10): its values and every choice made casting
 * it (modes, X, kicker, what was sacrificed), with these targets. It isn't cast.
 */
function putSpellCopy(s: GameState, orig: StackItem, controller: PlayerId, targets: TargetChoice[] | undefined) {
  const card = orig.objectId ? s.objects[orig.objectId] : undefined;
  if (!card) return;
  const o = newObject(s, s.cards[cardIdOf(card)]!, controller, "stack");
  o.spellCopy = true;
  o.kicked = card.kicked;
  o.castAlt = card.castAlt;
  const name = orig.description.replace(/ \(copy\)$/, "");
  const id = `s${s.nextId++}`;
  const { castNth: _, ...rest } = structuredClone(orig);
  s.stack.push({ ...rest, id, objectId: o.id, controller, targets: stampTargets(s, targets), copy: true, description: `${name} (copy)` });
  log(s, `${player(s, controller).name} copies ${name}${describeTargets(s, targets ?? [])}.`);
  fireEvent(s, { type: "cast", stackId: id, controller, card: defOf(s, o), copy: true }); // magecraft: "cast or copy"
  fireEvent(s, { type: "targeted", stackId: id });
}

/** Spells on the stack: copying, countering, cascade, "when you next cast", delayed triggers. */
export function runSpellsEffect(s: GameState, e: Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "delayed": {
      // A spell's own object (it's on its way to the graveyard), or the source of the ability.
      const item = s.resolving?.item;
      const id = item?.kind === "spell" ? item.objectId : ctx.sourceId;
      const body = { targets: [], effects: e.effects, text: e.text.replace(/^./, (c) => c.toUpperCase()) + "." };
      if (e.each === "created") {
        for (const t of s.resolving?.created ?? []) if (s.objects[t]?.zone === "battlefield") addDelayed(s, e.when, ctx.controller, s.objects[t]!, body);
        return;
      }
      if (e.each === "subject") {
        const subj = objects(s, { ref: "subject" }, ctx)[0];
        if (subj) addDelayed(s, e.when, ctx.controller, subj, body, cardIdOf(s.objects[id ?? ""] ?? subj));
        return;
      }
      const o = id ? s.objects[id] : undefined;
      if (o) addDelayed(s, e.when, ctx.controller, o, body);
      return;
    }
    case "copySpell": {
      // Copies of a spell go on the stack one at a time, each with its targets chosen first (CR 707.10, 707.10c).
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      if (!sc.copies) {
        const i = e.spell === "cause" ? -1 : e.spell.target;
        const t = i >= 0 ? ctx.targets[i] : undefined;
        const id = i < 0 ? ctx.cause : t?.kind === "stack" && ctx.legal[i] ? t.id : undefined;
        const orig = id ? (s.stack.find((x) => x.id === id) ?? s.castItems?.[id]) : undefined;
        if (!orig || orig.kind !== "spell") return;
        const n = e.n === "storm" ? (orig.castNth ?? 0) : e.n === "kicked" ? (orig.kicked?.length ?? 0) : amountNow(s, e.n, ctx);
        if (n <= 0) return;
        sc.copies = { of: id!, left: n };
      }
      const c = sc.copies;
      // As it is now, or as it was cast if it has left the stack.
      const orig = s.stack.find((x) => x.id === c.of) ?? s.castItems?.[c.of];
      const specs = orig?.body?.targets ?? [];
      while (orig && c.left > 0) {
        if (e.newTargets && specs.length && c.targets === undefined) {
          s.pending = { kind: "copyTargets", player: ctx.controller, source: src, copyOf: orig.description, specs, current: orig.targets ?? [], left: c.left };
          return "paused";
        }
        putSpellCopy(s, orig, ctx.controller, c.targets ?? orig.targets);
        c.targets = undefined;
        c.left--;
      }
      return;
    }
    case "nextCast": {
      const item = s.resolving?.item;
      const id = item?.kind === "spell" ? item.objectId : ctx.sourceId;
      const o = id ? s.objects[id] : undefined;
      (s.nextCast ??= []).push({
        controller: ctx.controller,
        filter: e.filter,
        sourceId: id ?? "",
        sourceCardId: o ? cardIdOf(o) : ctx.sourceDef.oracleId,
        body: { targets: [], effects: e.effects, text: e.text.replace(/^./, (c) => c.toUpperCase()) + "." },
        turn: s.turn,
      });
      return;
    }
    case "cascade": {
      // CR 702.85a. The spell's mana value is its own, even if it has left the stack by now (last known information).
      const p = player(s, ctx.controller);
      const sc = (s.resolving!.scratch ??= {});
      if (!sc.cascade) {
        const limit = manaValue(parseManaCost(ctx.sourceDef.manaCost));
        const exiled: ObjectId[] = [];
        let hit: ObjectId | undefined;
        while (p.library.length) {
          const id = p.library[0]!;
          moveObject(s, id, "exile");
          exiled.push(id);
          const d = defOf(s, obj(s, id));
          if (!isType(d, "Land") && manaValue(parseManaCost(d.manaCost)) < limit) {
            hit = id;
            break;
          }
        }
        sc.cascade = { exiled, ...(hit ? { hit } : {}) };
        log(s, `${src} cascades: ${p.name} exiles ${exiled.length} card${exiled.length === 1 ? "" : "s"}${hit ? `, hitting ${defOf(s, obj(s, hit)).name}` : ", finding nothing to cast"}.`);
        if (hit) {
          // Cast as this resolves, so its card type's timing doesn't matter; it still needs legal targets and modes.
          s.pending = { kind: "castFree", player: p.id, objectId: hit, source: src };
          if (castProblem(s, p.id, hit) === null) return "paused";
          s.pending = null;
          log(s, `${defOf(s, obj(s, hit)).name} can't be cast.`);
        }
      }
      const rest = sc.cascade.exiled.filter((id) => s.objects[id]?.zone === "exile");
      shuffle(s, rest);
      for (const id of rest) moveObject(s, id, "library"); // to the bottom, in a random order
      if (rest.length) log(s, `${p.name} puts ${rest.length} card${rest.length === 1 ? "" : "s"} on the bottom of their library in a random order.`);
      return;
    }
    case "counterUnlessPays": {
      // Ward (CR 702.21a) and "counter it unless that player pays": the spell or ability that triggered this.
      return counterOnStack(s, ctx, ctx.cause, e.ward ? `${src}'s ward` : src, e.unless);
    }
    case "counterSpell": {
      const t = ctx.targets[e.index];
      if (!ctx.legal[e.index] || t?.kind !== "stack") return;
      return counterOnStack(s, ctx, t.id, src, e.unless, e.exile);
    }
  }
}

/**
 * Counter a spell or ability on the stack (CR 701.6a), or with `unless`, only if its controller
 * doesn't pay (CR 118.12): they choose as this resolves, and may activate mana abilities to pay
 * (CR 605.3a). A spell that can't be countered stays, paid for or not (CR 101.2). A countered spell
 * goes to its owner's graveyard, or into exile with "exile it instead".
 */
function counterOnStack(s: GameState, ctx: ResolveCtx, stackId: string | undefined, by: string, unless?: UnlessPays, exile?: boolean): "paused" | void {
  const i = s.stack.findIndex((x) => x.id === stackId);
  const item = s.stack[i];
  if (!item) return; // it already left the stack
  const what = item.kind === "spell" ? item.description : `${item.description.split(":")[0]}'s ability`;
  if (item.objectId && compileCard(defOf(s, obj(s, item.objectId))).cantBeCountered) {
    log(s, `${item.description} can't be countered.`); // CR 101.2
    return;
  }
  if (unless) {
    const r = s.resolving!;
    const sc = (r.scratch ??= {});
    if (sc.paid === undefined) {
      const p = player(s, item.controller);
      // The amount is fixed as the choice is offered (CR 608.2h).
      const cost = unlessCost(unless.cost, unless.generic === undefined ? 0 : amountNow(s, unless.generic, ctx));
      if (p.lost) sc.paid = false;
      else if (cost === "{0}" && !unless.life) {
        // Paying {0} is just saying so (CR 118.5); nobody would refuse.
        log(s, `${p.name} pays {0} for ${by}.`);
        sc.paid = true;
      } else {
        s.pending = { kind: "payUnless", player: p.id, cost, source: by, what, ...(unless.life ? { life: unless.life } : {}) };
        return "paused";
      }
    }
    if (sc.paid) return;
  }
  s.stack.splice(i, 1);
  if (item.objectId) moveObject(s, item.objectId, exile ? "exile" : "graveyard");
  log(s, `${by} counters ${what}${exile && item.objectId ? " and exiles it" : ""}.`);
}

/** "{1}{U}" plus 3 generic: "{4}{U}". */
export function unlessCost(cost: string, generic: number): string {
  let n = generic;
  const rest = cost.replace(/\{(\d+)\}/g, (_, d: string) => {
    n += Number(d);
    return "";
  });
  return n || !rest ? `{${n}}${rest}` : rest;
}

/** "At the beginning of the next end step" / "your next upkeep", about this object as it is now (CR 603.7). */
export function addDelayed(s: GameState, when: DelayedTrigger["when"], controller: PlayerId, o: GameObject, body: AbilityBody, sourceCardId = cardIdOf(o)) {
  (s.delayed ??= []).push({ when, controller, sourceCardId, subject: { id: o.id, zc: o.zoneChanges ?? 0 }, body, turn: s.turn, step: s.step });
}

/** Was it kicked (CR 702.33d), with that kicker cost if the condition names one (702.33f)? */
export function kickedMatches(kicked: number[] | undefined, cond: SpellCondition): boolean {
  if (cond.kind !== "kicked") return false;
  return cond.which === undefined ? !!kicked?.length : !!kicked?.includes(cond.which);
}
