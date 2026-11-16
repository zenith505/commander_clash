// Round 390's effects: every permanent you own shuffled away and replaced from the top of your library (Glimpse of
// Tomorrow).
import { defOf, isPermanentCard } from "../cards";
import { enterTogether, log, moveObject, obj, player } from "../game";
import { offFieldTyped } from "../layers";
import { shuffleLibrary } from "../rng";
import type { GameState, ObjectId } from "../types";
import type { ResolveCtx } from "./resolve";
import { toBottom } from "./run-library";
import { chooseAuraHosts } from "./run-zones";

/**
 * Glimpse of Tomorrow: "Shuffle all permanents you own into your library, then reveal that many cards from the top of
 * your library. Put all non-Aura permanent cards revealed this way onto the battlefield, then do the same for Aura cards,
 * then put the rest on the bottom of your library in a random order." (rulings): every permanent you own, whoever
 * controls it, tokens too (a phased-out permanent is treated as though it doesn't exist, CR 702.26b), goes at once; a
 * token ceases to exist (CR 111.8, 704.5d) and is never revealed, and a commander that goes to the command zone instead
 * (CR 903.9b) still counts. The non-Aura permanent cards revealed (CR 110.4a: artifact, creature, enchantment, land,
 * planeswalker, battle) enter at once under your control (CR 110.2a); then the Aura cards, each enchanting something
 * already on the battlefield, you choosing (CR 303.4f), one with nothing to enchant staying with the rest (303.4g); then
 * the rest go on the bottom in a random order (CR 401.4). Card types are read as the cards are in the library (CR 400.3,
 * Encroaching Mycosynth's and the like apply there).
 */
export function runGlimpseOfTomorrowEffect(s: GameState, ctx: ResolveCtx, src: string): "paused" | void {
  const r = s.resolving!;
  const sc = (r.scratch ??= {});
  const me = player(s, ctx.controller);
  if (!sc.glimpse) {
    const mine = s.battlefield.filter((id) => obj(s, id).owner === ctx.controller);
    for (const id of mine) moveObject(s, id, "library");
    shuffleLibrary(s, me);
    // Tokens are ignored as cards are revealed (rulings); they cease to exist as state-based actions are next checked.
    const revealed = me.library.filter((id) => !obj(s, id).isToken).slice(0, mine.length);
    log(s, `${me.name} shuffles ${mine.length} permanent${mine.length === 1 ? "" : "s"} into their library${revealed.length ? ` and reveals ${revealed.map((id) => defOf(s, obj(s, id)).name).join(", ")}` : ""} (${src}).`);
    sc.glimpse = { revealed, stage: 1 };
  }
  const st = sc.glimpse;
  const typed = (id: ObjectId) => offFieldTyped(s, obj(s, id), defOf(s, obj(s, id)));
  const isAura = (id: ObjectId) => typed(id).subtypes.includes("Aura");
  const stillThere = () => st.revealed.filter((id) => s.objects[id]?.zone === "library" && me.library.includes(id));
  if (st.stage === 1) {
    const going = stillThere().filter((id) => isPermanentCard(typed(id)) && !isAura(id));
    enterTogether(s, () => {
      for (const id of going) moveObject(s, id, "battlefield", { controller: ctx.controller, putBy: ctx.controller });
    });
    if (going.length) log(s, `${going.map((id) => defOf(s, obj(s, id)).name).join(", ")} ${going.length === 1 ? "is" : "are"} put onto the battlefield (${src}).`);
    st.stage = 2;
  }
  if (st.stage === 2) {
    const cards = stillThere().filter((id) => isPermanentCard(typed(id)) && isAura(id)).map((id) => ({ o: obj(s, id), under: ctx.controller }));
    const hosts = chooseAuraHosts(s, cards, src);
    if (hosts === "paused") return "paused";
    const going = cards.filter(({ o }) => hosts.has(o.id));
    for (const { o } of cards) if (sc.auraHosts) delete sc.auraHosts[o.id];
    enterTogether(s, () => {
      for (const { o } of going) moveObject(s, o.id, "battlefield", { controller: ctx.controller, putBy: ctx.controller, ...hosts.get(o.id) });
    });
    if (going.length) log(s, `${going.map(({ o }) => defOf(s, o).name).join(", ")} ${going.length === 1 ? "is" : "are"} put onto the battlefield (${src}).`);
    st.stage = 3;
  }
  const rest = stillThere();
  if (rest.length) toBottom(s, ctx.controller, rest, src, true);
  sc.glimpse = undefined;
}
