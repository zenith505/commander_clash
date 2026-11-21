// Lane B round B287's effects: Sanar, Innovative First-Year (revealColorsExile). Mimeoplasm, Revered One's "As ~ enters,
// exile up to X creature cards from your graveyard" is in enters-yard.ts.
import type { Effect, TargetSpec } from "../abilities";
import { defOf, isType } from "../cards";
import { log, moveObject, obj, player } from "../game";
import { characteristics, controllerOf, invalidateCharacteristics } from "../layers";
import { shuffleLibrary } from "../rng";
import { COLORS, type Color, type GameState, type ObjectId } from "../types";
import type { ResolveCtx } from "./resolve";
import { printedMatches } from "./targeting";

type B287Effect = Extract<Effect, { type: "revealColorsExile" }>;

const WORD: Record<string, string> = { W: "white", U: "blue", B: "black", R: "red", G: "green" };
/** A card of that color, whatever its other colors (CR 105.2). */
const colorSpec = (c: Color): TargetSpec => ({ kind: "card", types: [], notTypes: [], notColors: [], colors: [c], text: `${WORD[c]} card` });

export function runLaneB287Effect(s: GameState, e: B287Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "revealColorsExile": {
      // Sanar, Innovative First-Year: X and "those colors" are the colors among permanents you control as this resolves,
      // counted once (rulings; colorless isn't a color, CR 105.1, 105.2c, and lands are usually colorless). Cards are
      // revealed from the top until X nonland cards are (all of them with fewer; none with X 0), staying in the library
      // (CR 701.20a). For each of those colors, a card of that color among the revealed ones may be exiled: a different
      // card for each color, a multicolored card standing for one of its colors (oneOfEach), any number of colors left
      // out ("you may"). Then the library is shuffled, revealed cards and all, and the exiled cards may be cast this turn,
      // paying their costs and following the usual timing (rulings; GameObject.mayPlay `castOnly`). A land exiled this way
      // is played, never cast (CR 305.1, 116.2a), so it just stays exiled.
      const r = s.resolving!;
      const sc = (r.scratch ??= {});
      const p = player(s, ctx.controller);
      if (!sc.sanar) {
        const colors = COLORS.filter((c) => s.battlefield.some((id) => controllerOf(s, obj(s, id)) === p.id && characteristics(s, obj(s, id)).colors.includes(c)));
        const seen: ObjectId[] = [];
        let nonland = 0;
        for (const id of p.library) {
          if (nonland >= colors.length) break;
          seen.push(id);
          if (!isType(defOf(s, obj(s, id)), "Land")) nonland++;
        }
        log(s, seen.length ? `${p.name} reveals ${seen.map((id) => defOf(s, obj(s, id)).name).join(", ")} from the top of their library (X is ${colors.length}).` : `${p.name} reveals no cards (${colors.length ? "an empty library" : "no colors among their permanents"}).`);
        sc.sanar = { seen };
        const specs = colors.map(colorSpec);
        const cards = seen.filter((id) => specs.some((f) => printedMatches(f, defOf(s, obj(s, id)))));
        if (cards.length) {
          const names = colors.map((c) => WORD[c]!);
          const what = `a card of each of those colors (${names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0]}; a multicolored card for one of its colors)`;
          s.pending = { kind: "searchLibrary", player: p.id, source: src, what, cards, min: 0, max: Math.min(specs.length, cards.length), oneOfEach: specs, colorsToCast: true, dig: { looked: seen, to: "into exile; you may cast them this turn", rest: "stay, then your library is shuffled" } };
          return "paused";
        }
      }
      const found = (sc.found ?? []).filter((id) => obj(s, id).zone === "library" && obj(s, id).owner === p.id);
      sc.found = undefined;
      const exiled: ObjectId[] = [];
      for (const id of found) {
        moveObject(s, id, "exile");
        const o = obj(s, id);
        if (o.zone !== "exile") continue;
        o.mayPlay = { player: p.id, zc: o.zoneChanges ?? 0, until: "thisTurn", turn: s.turn, castOnly: true };
        exiled.push(id);
      }
      if (exiled.length) log(s, `${p.name} exiles ${exiled.map((id) => defOf(s, obj(s, id)).name).join(", ")} and may cast ${exiled.length === 1 ? "it" : "them"} this turn.`);
      shuffleLibrary(s, p);
      log(s, `${p.name} shuffles their library.`);
      invalidateCharacteristics(s);
      return;
    }
  }
}
