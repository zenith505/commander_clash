// Lane B round B173's lines, read by compileCard before its triggers and activated abilities (next to round B171's), and
// its sentences, read at the end of round B172's.
import type { AdditionalCost, CompiledCard, Effect, TriggeredAbility } from "../abilities";
import type { Ctx } from "./body";
import { parseActivated } from "./activated";
import { parseTrigger } from "./triggers";

type Found = { effect: Effect; next: number } | "fail" | null;

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB173Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Cryoshatter: "When enchanted creature becomes tapped or is dealt damage, destroy it.": one ability that triggers on
  // either event, which works like two with the same effect (as "When ~ enters or dies"); becoming tapped and being dealt
  // damage are never one event. "It" is the creature as the event happened: it's destroyed even if the Aura has left or
  // moved by then (rulings).
  const tapOrDamage = /^When(?:ever)? enchanted creature becomes tapped or is dealt damage, (.+)$/.exec(line);
  if (tapOrDamage) {
    const both = [`When enchanted creature becomes tapped, ${tapOrDamage[1]}`, `When enchanted creature is dealt damage, ${tapOrDamage[1]}`].map((l) => parseTrigger(l));
    if (both.some((t) => !t || t === "fail")) out.unsupported.push(raw);
    else out.triggers.push(...(both as TriggeredAbility[]));
    return true;
  }
  // Nullstone Gargoyle: "Whenever the first noncreature spell of a turn is cast, counter that spell.": the first one any
  // player casts this turn, counted whether or not ~ was on the battlefield then (rulings: one cast before it entered
  // means it never triggers that turn); one cast in response to it is a second one (rulings).
  const firstOfTurn = /^Whenever the first (noncreature) spell of a turn is cast, (.+)$/.exec(line);
  if (firstOfTurn) {
    const t = parseTrigger(`Whenever a player casts their first ${firstOfTurn[1]} spell each turn, ${firstOfTurn[2]}`);
    if (!t || t === "fail" || t.event !== "castSpell" || !t.cast || t.cast.nth !== 1 || !t.cast.nthOfKind) out.unsupported.push(raw);
    else out.triggers.push({ ...t, cast: { ...t.cast, ofTurn: true } });
    return true;
  }
  // Skyblade's Boon: "{2}{W}: Return ~ to its owner's hand. Activate only if ~ is on the battlefield or in your
  // graveyard.": one ability that works in either zone (CR 113.6, 602.5), compiled as one for each. Moved to the other zone
  // before it resolves, it's a new object, so it isn't returned (rulings, CR 400.7).
  const twoZones = /^((?:\{[^}]+\})+): Return ~ to its owner's hand\. Activate only if ~ is on the battlefield or in your graveyard\.$/.exec(line);
  if (twoZones) {
    const field = parseActivated(`${twoZones[1]}: Return ~ to its owner's hand.`);
    const yard = parseActivated(`${twoZones[1]}: Return ~ from your graveyard to your hand.`);
    if (!field || field === "fail" || !yard || yard === "fail" || field.zone || yard.zone !== "graveyard") out.unsupported.push(raw);
    else out.activated.push({ ...field, text: line }, { ...yard, text: line });
    return true;
  }
  // Key to the Side-Door: "{1}, {T}, Discard a legendary card with the same name as a legendary permanent you control: Draw
  // two cards.": a legendary card in your hand whose name a legendary permanent you control has as the cost is paid (CR
  // 201.2, 601.2h); bound then (TargetSpec.namedAsYourLegendary, game.ts activatedCosts).
  const sameName = /^(.+?), Discard a legendary card with the same name as a legendary permanent you control: (.+)$/.exec(line);
  if (sameName) {
    const a = parseActivated(`${sameName[1]}, Discard a legendary card: ${sameName[2]}`);
    const i = a && a !== "fail" ? (a.costs ?? []).findIndex((c) => c.kind === "discard" && c.n === 1 && c.filter?.supertypes?.join() === "Legendary" && !c.random) : -1;
    if (!a || a === "fail" || i < 0) out.unsupported.push(raw);
    else {
      const costs = [...a.costs!];
      const c = costs[i] as Extract<AdditionalCost, { kind: "discard" }>;
      costs[i] = { ...c, filter: { ...c.filter!, namedAsYourLegendary: true, text: "legendary card with the same name as a legendary permanent you control" } };
      out.activated.push({ ...a, costs, text: line });
    }
    return true;
  }
  return false;
}

export function roundB173Sentence(s: string, _sentences: string[], si: number, ctx: Ctx, _effects: Effect[]): Found {
  // Saw: "Whenever equipped creature attacks, you may sacrifice a permanent other than that creature or ~. If you do, draw a
  // card.": any permanent you control but the attacker (the trigger's subject, while it's still that object) and the
  // Equipment itself, chosen as it resolves (not targeted).
  if (/^[Yy]ou may sacrifice a permanent other than that creature or ~$/.test(s) && ctx.subject && !ctx.spell) {
    const pick: Effect = { type: "pick", who: { ref: "you" }, filter: { kind: "object", types: [], notTypes: [], notColors: [], notSource: true, notSubject: true, text: "permanent other than that creature or ~" }, n: 1, action: "sacrifice" };
    return { effect: { type: "may", effects: [pick], text: "sacrifice a permanent other than that creature or ~" }, next: si + 1 };
  }
  return null;
}
