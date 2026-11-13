// Lane B round B194's lines, read by compileCard before its triggers and activated abilities (after round B192's), and
// its whole spells, read after round B191's.
import { allEffects, type AbilityBody, type CompiledCard, type Effect } from "../abilities";
import { parseBody, reflexiveBody, type Ctx } from "./body";
import { parseTrigger } from "./triggers";
import { roundB195Sentence, roundB195Spell } from "./laneb195";

/** One line of a card's text, compiled into `out` (an unsupported one reported as `raw`); false when it isn't one of these. */
export function roundB194Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  if (isSpell) return false;
  // Surtland Flinger: "Whenever ~ attacks, you may sacrifice another creature. When you do, ~ deals damage equal to the
  // sacrificed creature's power to any target. If the sacrificed creature was a Giant, ~ deals twice that much damage
  // instead.": the reflexive trigger's target chosen after the sacrifice (rulings, CR 603.12); the creature's power and
  // creature types as it was sacrificed, as it last existed (rulings, CR 608.2h), a changeling a Giant (CR 702.73a).
  const flinger = /^(Whenever ~ attacks, you may sacrifice another creature\. When you do, ~ deals damage equal to the sacrificed creature's power to any target\.) If the sacrificed creature was an? ([A-Z][a-z]+), ~ deals twice that much damage instead\.$/.exec(line);
  if (flinger) {
    const t = parseTrigger(flinger[1]!);
    const ok = t && t !== "fail" && t.event === "selfAttacks" ? doubleReflexiveDamage(t.body, flinger[2]!) : null;
    if (!t || t === "fail" || !ok) out.unsupported.push(raw);
    else out.triggers.push({ ...t, body: { ...ok, text: line.replace(/^Whenever ~ attacks, /, "") } });
    return true;
  }
  // Cephalid Constable: "Whenever ~ deals combat damage to a player, return up to that many target permanents that player
  // controls to their owner's hand.": as many targets as the damage dealt, known as it triggers (CR 601.2c, 603.3d;
  // TriggeredAbility.eventX), each a permanent the player dealt damage controls.
  const constable = /^Whenever ~ deals combat damage to a player, return up to that many target (permanents|creatures|nonland permanents) that player controls to their owner's hand\.$/.exec(line);
  if (constable) {
    const body = parseBody(`Return up to X target ${constable[1]} that player controls to their owner's hand.`, { ownX: true, eventPlayer: true });
    if (!body || body.targets.length !== 1 || body.effects.length !== 1) out.unsupported.push(raw);
    else out.triggers.push({ event: "selfDealsCombatDamageToPlayer", body: { ...body, text: line.replace(/^Whenever ~ deals combat damage to a player, /, "") }, eventX: true });
    return true;
  }
  return false;
}

/**
 * "If the sacrificed creature was a Giant, ~ deals twice that much damage instead" after "When you do, ~ deals damage
 * equal to the sacrificed creature's power to any target": the reflexive damage doubled for that creature type. Null if
 * the body isn't that shape.
 */
function doubleReflexiveDamage(body: AbilityBody, subtype: string): AbilityBody | null {
  const [may, did, ...rest] = body.effects;
  if (rest.length || may?.type !== "may" || did?.type !== "if" || did.cond.kind !== "youDid" || did.effects.length !== 1) return null;
  const refl = did.effects[0]!;
  if (refl.type !== "reflexive" || !refl.sacrificed || refl.body.effects.length !== 1) return null;
  const dmg = refl.body.effects[0]!;
  if (dmg.type !== "damage" || typeof dmg.amount !== "object" || !("count" in dmg.amount) || dmg.amount.count.kind !== "power" || dmg.amount.times !== undefined) return null;
  const twice: Effect = { ...dmg, amount: { ...dmg.amount, times: 2 } };
  const doubled: Effect = { type: "if", cond: { kind: "sacrificedSubtype", subtype }, effects: [twice], otherwise: [dmg] };
  return { ...body, effects: [may, { ...did, effects: [{ ...refl, body: { ...refl.body, effects: [doubled], text: `${refl.body.text} If the sacrificed creature was a ${subtype}, ~ deals twice that much damage instead.` } }] }] };
}

/** A whole spell's text read at once; undefined when it isn't one of these, null when it is but fails. */
export function roundB194Spell(text: string): AbilityBody | null | undefined {
  // Farsight Ritual: "Look at the top four cards of your library. If ~ was bargained, look at the top eight cards of your
  // library instead. Put two of them into your hand and the rest on the bottom of your library in a random order.": one
  // look, eight cards if it was bargained as it was cast (a copy of a bargained spell is bargained too, rulings), still
  // two into your hand (rulings).
  const farsight = /^Look at the top (\w+) cards of your library\. If ~ was bargained, look at the top (\w+) cards of your library instead\. (Put (?:one|two|three) of them into your hand and the rest on the bottom of your library in a random order\.)$/.exec(text);
  if (farsight) {
    const plain = parseBody(`Look at the top ${farsight[1]} cards of your library. ${farsight[3]}`, { spell: true });
    const more = parseBody(`Look at the top ${farsight[2]} cards of your library. ${farsight[3]}`, { spell: true });
    if (!plain || !more || plain.targets.length || more.targets.length || plain.modal || more.modal) return null;
    return { targets: [], effects: [{ type: "if", cond: { kind: "bargained" }, effects: more.effects, otherwise: plain.effects }], text };
  }
  return roundB195Spell(text);
}

type Found = { effect: Effect; next: number } | "fail" | null;

/** Round B194's sentences, read at the end of round B193's chain. */
export function roundB194Sentence(s: string, sentences: string[], si: number, ctx: Ctx, effects: Effect[]): Found {
  // Rubble Rouser: "{T}, Exile a card from your graveyard: Add {R}. When you do, ~ deals 1 damage to each opponent.";
  // Shaun & Rebecca, Agents: "{T}: Add {C}. When you do, mill two cards.": still a mana ability, which resolves at once
  // (rulings, CR 605.1a, 605.3b); the reflexive trigger is another ability (CR 603.12) that uses the stack (CR 605.5a),
  // put there the next time a player would receive priority, after the spell or ability being paid for is cast or
  // activated (rulings, CR 603.3).
  const added = /^When you do, (.+)$/.exec(s);
  if (added && ctx.activated && !ctx.spell && si === sentences.length - 1 && effects.length === 1 && effects[0]!.type === "addMana" && !effects[0]!.who) {
    const body = reflexiveBody(added[1]!.replace(/\.$/, ""), ctx);
    if (!body || body.targets.length || allEffects(body.effects).some((e) => e.type === "addMana")) return "fail";
    return { effect: { type: "reflexive", body }, next: si + 1 };
  }
  // Spark of Creativity: "Exile the top card of your library. You may have ~ deal damage to that creature equal to the
  // exiled card's mana value. If you don't, you may play that card until end of turn.": the permission only if no damage
  // was chosen, with the card's usual timing and costs, a land with a land play left (rulings, CR 305.1); X is 0 (CR
  // 202.3e, rulings). It ends with the turn (CR 514.2).
  if (/^If you don't, you may play that card until end of turn$/.test(s.replace(/\.$/, ""))) {
    const prev = effects[effects.length - 1];
    const top = effects[effects.length - 2];
    const dmg = prev?.type === "may" && !prev.pay && prev.effects.length === 1 ? prev.effects[0] : undefined;
    if (top?.type !== "exileTop" || top.who.ref !== "you" || top.n !== 1 || top.linked || dmg?.type !== "damage" || !JSON.stringify(dmg.amount).includes('"ref":"exiledTop"')) return "fail";
    return { effect: { type: "if", cond: { kind: "youDid" }, effects: [], otherwise: [{ type: "mayCastFromGraveyard", what: { ref: "exiledTop" }, inExile: true, play: true }] }, next: si + 1 };
  }
  return roundB195Sentence(s, sentences, si, ctx, effects);
}
