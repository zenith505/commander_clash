// Round 452's whole lines (compile.ts, before round 451's): Karn Liberated's "−14: Restart the game, leaving in exile all
// non-Aura permanent cards exiled with ~. Then put those cards onto the battlefield under your control." (CR 727).
import { allEffects, type CompiledCard } from "../abilities";

const fail = (out: CompiledCard, raw: string) => (out.unsupported.push(raw), true);

const KARN = "−14: Restart the game, leaving in exile all non-Aura permanent cards exiled with ~. Then put those cards onto the battlefield under your control.";

/** One whole line of round 452's (compile.ts); false when it isn't one of these. */
export function round452Line(line: string, raw: string, out: CompiledCard, isSpell: boolean): boolean {
  // A loyalty ability (CR 606): activated only as a sorcery, once each turn (606.3), removing 14 loyalty counters as its
  // cost (606.4). It restarts the game (CR 727.1), the starting player being its controller (727.1a); the cards it leaves in
  // exile are exempt from the restart (727.5), and the rest of the effect puts them onto the battlefield just before the
  // first turn's untap step (727.4). Which cards: those exiled by its other abilities (linkRestartExiles, CR 607.2a).
  if (line === KARN) {
    if (isSpell) return fail(out, raw);
    out.activated.push({
      manaCost: "",
      tap: false,
      sacrificeSelf: false,
      sorcerySpeed: true,
      body: { targets: [], effects: [{ type: "restartGame" }], text: KARN.replace(/^−14: /, "") },
      text: KARN,
      loyalty: -14,
    });
    return true;
  }
  return false;
}

/**
 * Karn Liberated: "cards exiled with ~" are the ones its "+4: Target player exiles a card from their hand." and "−3: Exile
 * target permanent." exiled (CR 607.2a; the rulings: its first and third abilities are linked, and its second and third).
 * Anything else that exiles, or that isn't those two, isn't known to be linked to it: the card isn't supported.
 */
export function linkRestartExiles(out: CompiledCard) {
  const restarts = out.activated.filter((a) => a.body.effects.some((e) => e.type === "restartGame"));
  if (!restarts.length) return;
  const others = out.activated.filter((a) => !restarts.includes(a));
  const all = [...others.map((a) => a.body), ...out.triggers.map((t) => t.body), ...(out.spell ? [out.spell] : [])].flatMap((b) => allEffects(b.effects));
  const handExile = all.filter((e) => e.type === "discard" && e.exile && !e.until && !e.random && !e.hand);
  const exile = all.filter((e) => e.type === "exile" && !e.until);
  const exiling = JSON.stringify(all).match(/"(?:exile|exileTop|exileGraveyard|exileFaceDown|exileHand|hideaway|impulse)"|"action":"exile"|"zone":"exile"|"exile":true/g) ?? [];
  if (restarts.length !== 1 || out.spell || out.triggers.length || handExile.length !== 1 || exile.length !== 1 || exiling.length !== 2) {
    out.unsupported.push("(restarts the game leaving cards exiled with it that it can't link to its exile abilities)");
    return;
  }
  for (const e of [...handExile, ...exile]) (e as { linked?: boolean }).linked = true;
}
