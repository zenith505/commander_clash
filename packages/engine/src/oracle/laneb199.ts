// Lane B round B199's lines, read by compileCard before its triggers and activated abilities (after round B198's).
import type { AbilityBody, CompiledCard, Effect, TargetSpec } from "../abilities";
import { parseActivated } from "./activated";
import { parseStatic } from "./statics";
import { parseTrigger } from "./triggers";
import { parseBody } from "./body";

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB199Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Nazahn, Revered Bladesmith: "When ~ enters, search your library for an Equipment card and reveal it. If you reveal a card
  // named Hammer of Nazahn this way, put it onto the battlefield. Otherwise, put that card into your hand. Then shuffle.": one
  // search, the card's destination by its name (CR 201.2); "Hammer of Nazahn" is another card's name, not this one's, so a
  // copy of Nazahn looks for it too (CR 201.4b doesn't make it ~).
  if (line === "When ~ enters, search your library for an Equipment card and reveal it. If you reveal a card named Hammer of ~ this way, put it onto the battlefield. Otherwise, put that card into your hand. Then shuffle.") {
    const t = parseTrigger("When ~ enters, search your library for an Equipment card, reveal it, put it into your hand, then shuffle.");
    const e = t && t !== "fail" && t.body.effects.length === 1 ? t.body.effects[0] : undefined;
    if (!t || t === "fail" || t.event !== "selfEnters" || e?.type !== "search" || e.dest.zone !== "hand" || !e.reveal || e.cardTo || e.landTo || e.condDest || e.mayInstead) {
      out.unsupported.push(raw);
      return true;
    }
    const hammer: TargetSpec = { kind: "card", types: [], notTypes: [], notColors: [], named: "Hammer of Nazahn", text: "card named Hammer of Nazahn" };
    out.triggers.push({ ...t, body: { ...t.body, effects: [{ ...e, cardTo: { card: hammer, dest: { zone: "battlefield" } } }], text: line.replace(/^When ~ enters, /, "") } });
    return true;
  }
  // Hall of Echoes: "{5}: ~ becomes a copy of target creature you control until end of turn. The "legend rule" doesn't apply
  // to permanents you control this turn.": both until the cleanup step, ending together (rulings, CR 514.2), so the legend
  // rule applies again as the state-based actions are checked then (CR 514.3a).
  if (line === '{5}: ~ becomes a copy of target creature you control until end of turn. The "legend rule" doesn\'t apply to permanents you control this turn.') {
    const a = parseActivated("{5}: ~ becomes a copy of target creature you control until end of turn.");
    const e = a && a !== "fail" && a.body.effects.length === 1 ? a.body.effects[0] : undefined;
    if (!a || a === "fail" || e?.type !== "becomeCopy" || e.duration !== "endOfTurn" || a.body.targets.length !== 1) out.unsupported.push(raw);
    else out.activated.push({ ...a, text: line, body: { ...a.body, effects: [e, { type: "noLegendRuleThisTurn" }], text: line.replace(/^\{5\}: /, "") } });
    return true;
  }
  // Wall of Shadows: "~ can't be the target of spells that can target only Walls or of abilities that can target only
  // Walls.": a spell or ability all of whose targets, in every mode, can only be Walls (compileCard marks those targets
  // TargetSpec.onlyWalls); a modal spell with a mode that can target a non-Wall isn't one (rulings).
  if (line === "~ can't be the target of spells that can target only Walls or of abilities that can target only Walls.") {
    const st = parseStatic("~ can't be the target of spells.");
    const m = st?.mods.length === 1 ? st.mods[0] : undefined;
    if (!st || st.condition || st.affects.kind !== "self" || m?.kind !== "untargetable") out.unsupported.push(raw);
    else out.statics.push({ ...st, mods: [{ kind: "untargetable", by: { onlyWalls: true } }], text: line });
    return true;
  }
  // Fraying Line: "At the beginning of each player's upkeep, that player may pay {2}. If they do, they put a rope counter on a
  // creature they control. Otherwise, exile ~ and each creature without a rope counter on it, then remove all rope counters
  // from all creatures.": the active player decides (CR 503.1); the creature is chosen as the counter is put (not targeted);
  // if they don't pay, ~ (while it's still there) and every such creature are exiled at once, then the counters are removed.
  if (line === "At the beginning of each player's upkeep, that player may pay {2}. If they do, they put a rope counter on a creature they control. Otherwise, exile ~ and each creature without a rope counter on it, then remove all rope counters from all creatures.") {
    const t = parseTrigger("At the beginning of each player's upkeep, that player draws a card.");
    const put = parseBody("Put a rope counter on a creature you control.");
    const exile = parseBody("Exile each creature without a rope counter on it.");
    const remove = parseBody("Remove all rope counters from all creatures.");
    const pick = one(put);
    const ex = one(exile);
    const rm = one(remove);
    if (!t || t === "fail" || t.event !== "eachUpkeep" || pick?.type !== "pick" || pick.action !== "counters" || pick.who.ref !== "you" || ex?.type !== "exile" || ex.what.ref !== "each" || rm?.type !== "removeCounters") {
      out.unsupported.push(raw);
      return true;
    }
    const text = line.replace(/^At the beginning of each player's upkeep, /, "");
    const pay: Effect = {
      type: "punisher",
      who: { ref: "eventPlayer" },
      options: [{ pay: { cost: "{2}" } }],
      mode: "ifAny",
      effects: [{ ...pick, who: { ref: "eventPlayer" } }],
      otherwise: [{ ...ex, what: { ...ex.what, andSelf: true } }, rm],
      thenText: "they put a rope counter on a creature they control; if not, ~ and each creature without a rope counter on it are exiled",
    };
    out.triggers.push({ ...t, body: { targets: [], effects: [pay], text } });
    return true;
  }
  // Meandering Towershell: "Whenever ~ attacks, exile it. Return it to the battlefield under your control tapped and attacking
  // at the beginning of the declare attackers step on your next turn.": attacking what you choose as it returns (rulings, CR
  // 508.4), never having "attacked" that turn (rulings).
  if (line === "Whenever ~ attacks, exile it. Return it to the battlefield under your control tapped and attacking at the beginning of the declare attackers step on your next turn.") {
    const t = parseTrigger("Whenever ~ attacks, draw a card.");
    if (!t || t === "fail" || t.event !== "selfAttacks") out.unsupported.push(raw);
    else out.triggers.push({ ...t, body: { targets: [], effects: [{ type: "exileReturnAttackingAtDeclare", under: "you", laterTurn: true }], text: line.replace(/^Whenever ~ attacks, /, "") } });
    return true;
  }
  // Noctis, Heir Apparent: "Warp-Strike — {3}: Exile ~. Return it to the battlefield under its owner's control tapped and
  // attacking at the beginning of that player's next declare attackers step. It can't be blocked that combat.": that
  // player's next declare attackers step, this turn's if it hasn't begun yet; it returns even if no attackers are declared
  // (rulings, CR 508.8).
  const warp = /^(?:Warp-Strike — )?(\{3\}): Exile ~\. Return it to the battlefield under its owner's control tapped and attacking at the beginning of that player's next declare attackers step\. It can't be blocked that combat\.$/.exec(line);
  if (warp) {
    const a = parseActivated(`${warp[1]}: Draw a card.`);
    if (!a || a === "fail" || a.tap || a.sacrificeSelf || (a.costs ?? []).length) out.unsupported.push(raw);
    else {
      const text = line.replace(/^(?:Warp-Strike — )?\{3\}: /, "");
      const body: AbilityBody = { targets: [], effects: [{ type: "exileReturnAttackingAtDeclare", under: "owner", unblockable: true }], text };
      out.activated.push({ ...a, text: line, body });
    }
    return true;
  }
  return false;
}

/** The one effect a sentence compiled to, if it's one. */
function one(b: AbilityBody | null | undefined): Effect | undefined {
  return b && !b.targets.length && b.effects.length === 1 ? b.effects[0] : undefined;
}

/**
 * Wall of Shadows (TargetSpec.onlyWalls): `out`, with every target of each spell or ability whose targets, in all its modes,
 * can only be Walls marked; `out` itself when there's none. A mode isn't a spell or ability of its own (rulings).
 */
export function markOnlyWalls(out: CompiledCard): CompiledCard {
  const wallOnly = (t: TargetSpec) => (t.kind === "object" || t.kind === "card") && !t.orExile && !!t.subtypes?.length && (t.allSubtypes ? t.subtypes.includes("Wall") : t.subtypes.every((x) => x === "Wall"));
  const isBody = (v: Record<string, unknown>): v is AbilityBody & Record<string, unknown> => Array.isArray(v.targets) && Array.isArray(v.effects) && typeof v.text === "string";
  const specsOf = (b: AbilityBody) => [...b.targets, ...(b.modal?.modes ?? []).flatMap((m) => m.targets)];
  const qualifies = (b: AbilityBody) => {
    const all = specsOf(b);
    return all.length > 0 && all.every(wallOnly);
  };
  let any = false;
  const scan = (v: unknown, inMode: boolean): void => {
    if (Array.isArray(v)) return v.forEach((x) => scan(x, false));
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    if (!inMode && isBody(o) && qualifies(o)) any = true;
    for (const [k, x] of Object.entries(o)) {
      if (k === "modal" && x && typeof x === "object") ((x as { modes?: unknown[] }).modes ?? []).forEach((m) => scan(m, true));
      else scan(x, false);
    }
  };
  scan(out, false);
  if (!any) return out;
  const copy = structuredClone(out);
  const mark = (v: unknown, inMode: boolean): void => {
    if (Array.isArray(v)) return v.forEach((x) => mark(x, false));
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    if (!inMode && isBody(o) && qualifies(o)) {
      o.targets = o.targets.map((t) => ({ ...t, onlyWalls: true as const }));
      for (const m of o.modal?.modes ?? []) m.targets = m.targets.map((t) => ({ ...t, onlyWalls: true as const }));
    }
    for (const [k, x] of Object.entries(o)) {
      if (k === "modal" && x && typeof x === "object") ((x as { modes?: unknown[] }).modes ?? []).forEach((m) => mark(m, true));
      else mark(x, false);
    }
  };
  mark(copy, false);
  return copy;
}
