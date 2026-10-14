# Commander Clash

4-player Commander (MTG): Ken against 3 bots. `packages/engine` is a pure TypeScript rules engine; `apps/web` is the
React + Vite client. Work comes from `docs/ROADMAP.md`; finished rounds go in `docs/HISTORY.md`; the design is in
`docs/ARCHITECTURE.md`.

## Rules correctness

Correctness over speed. Before implementing a mechanic, read the Comprehensive Rules (PDF in `data/raw/`) and the
card's rulings (`data/generated/rulings.json`, keyed by oracleId). Never guess: if unsure, research, or leave the
card unsupported. Cite the CR number in a comment where the code implements a rule.

## Engine rules every change must follow

- **Characteristics come from the layers.** Read a permanent's types, colors, keywords, power, toughness and
  controller with `characteristics()` / `controllerOf()` (`layers.ts`) or the helpers in `cards.ts` (`power`,
  `toughness`, `objIsType`, `objHasKeyword`), never from its card definition. After anything that could change them
  (zones, counters, effects, attachments) call `invalidateCharacteristics(s)`.
- **State is plain JSON**, changed only through `applyAction`. Randomness only from `rng.ts` (seeded, in state).
- **Unsupported is honest.** A rules-text line that isn't fully understood must make the compiler return `null` so
  the line is reported and the card stays out of decks (`isFullySupported`). Never compile half a line.
- **Choices pause.** A choice during resolution sets `s.pending` (a `PendingDecision` in `types.ts`); the bot answers
  it in `bot.ts` and the UI in `apps/web/src/App.tsx`. Add all three when adding a choice.

## Adding a card template

1. `npm run blockers` lists the lines blocking the most cards.
2. Parse it in `src/oracle/`: keyword lines in `keyword-abilities.ts`, triggers in `triggers.ts`, statics in
   `statics.ts`, one sentence of an effect in `sentences/<area>.ts`. Effects are types in `abilities.ts`.
3. A new effect type runs in `src/effects/run-<area>.ts`; add its case to the dispatch in `effects/resolve.ts`.
4. Test in `packages/engine/test/<mechanic>.test.ts` with the helpers in `test/helpers.ts`, using real oracle text
   and asserting `isFullySupported`. Infinite or long loops get CR 732 shortcuts, as in paper Magic.

## Commands

- `npm run typecheck` (root), `cd packages/engine && npx vitest run`
- `npm run coverage` (supported card count), `npm run blockers`, `npm run simulate -- 20` (bot games)
- `npm run dev`; play-test URL params `?hand=A|B&board=C&yard=D` (cards must be in your deck)

## Git

One branch per round (`round/<name>`), committed as Ken (repo-local git config), with the Claude co-author trailer.
Nothing goes on `main` and nothing is pushed until Ken says so. At the end of a round: tests and typecheck green,
update `docs/ROADMAP.md` (drop what's done, add what's still missing) and add one line to `docs/HISTORY.md`.
