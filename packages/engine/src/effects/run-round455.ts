// Round 455: North Star's "For one spell this turn, you may spend mana as though it were mana of any type to pay that
// spell's mana cost." (CR 609.4b): a permission its controller uses for one spell they cast this turn, chosen as they cast it
// (CostChoices.anyTypeMana; game.ts spellCost, castSpell).
import type { GameState } from "../types";
import { log, player } from "../game";
import type { ResolveCtx } from "./resolve";

export function runAnyTypeOneSpellEffect(s: GameState, ctx: ResolveCtx, src: string) {
  // Last turn's unused ones are gone (they were for that turn only).
  const kept = (s.anyTypeSpells ?? []).filter((e) => e.turn === s.turn);
  s.anyTypeSpells = [...kept, { player: ctx.controller, turn: s.turn, source: src }];
  log(s, `For one spell this turn, ${player(s, ctx.controller).name} may spend mana as though it were mana of any type to pay that spell's mana cost (${src}).`);
}
