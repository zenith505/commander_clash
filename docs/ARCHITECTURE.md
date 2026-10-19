# Architecture

## Data we have (from Scryfall bulk export, Oct 2026)

| File | Size | What it is |
|---|---|---|
| `all-cards-20261007211808.jsonl` | 2.9 GB | Every printing of every card in every language. One JSON card object per line. |
| `unique-artwork-20261007210232.jsonl` | 300 MB | One printing per unique illustration: 54,726 lines, 99% English, 37,606 oracle cards. |
| `rulings-20261007210031.jsonl` | 26 MB | 79,706 rulings for 20,080 cards. `{oracle_id, source, published_at, comment}`. |
| `MagicCompRules 20260925.pdf` | 2.5 MB | Comprehensive Rules, effective Sept 25 2026. 312 pages, ~3,000 numbered rules. Commander is rule 903. |

**How they link:** `oracle_id` is the key. Every printing of a card shares one
oracle_id; rulings attach to oracle_id. Artwork isn't stored locally: each card object
has `image_uris` (or `card_faces[].image_uris` for double-faced cards) pointing at
Scryfall's image CDN in sizes from `small` to `png`, plus `art_crop`.

For English play, unique-artwork already contains every card's oracle text, so the
build script uses it by default. all-cards only adds other languages and extra
printings; the script can stream it when we want printing choice.

After filtering out tokens, art cards, planes, schemes and vanguards we get **33,076
English playable cards**. A card with several faces keeps them all in `faces` (split, flip, double-faced,
adventurer and preparation cards); its own fields are its front face's.

`tools/scryfall-extract.mjs` (plain Node) writes the chosen printing of each card as a 15 MB extract
(`scryfall-oracle-cards.jsonl.gz`, plus the rulings), kept in the project's shared folder, so
`npm run build:cards` can rebuild `cards.json` without the bulk files.

## Platform

TypeScript, split in two:

- **Engine** (`packages/engine`): a pure function `applyAction(state, action) -> state`.
  State is plain JSON, so games are serializable, replayable from a seed and action
  list, easy to test, and ready to run on a server for online play later. Bots and the
  UI use the same `legalActions` / `planCast` helpers.
- **Client** (`apps/web`): React + Vite. Runs in any browser; can be wrapped as a
  desktop app (Tauri/Electron) later without changing the engine.

Performance today: ~1 ms per engine action including a full state copy, which is plenty
for play. When we add search-based AI we'll switch to structural sharing.

## Engine modules (`packages/engine/src`)

| Module | What it does |
|---|---|
| `types.ts` | The data model: `GameState`, objects, players, the stack, pending decisions, actions. |
| `game.ts` | `applyAction`: turns, steps, priority, casting, combat, state-based actions, zones. |
| `abilities.ts` | The effect language card text compiles to: effects, targets, triggers, statics. |
| `oracle/` | The compiler from rules text to the effect language (see `oracle/index.ts` for its map). |
| `effects/` | Runs the effect language: targets, resolution, each effect, triggers (see `effects/index.ts`). |
| `layers.ts` | Characteristics after continuous effects, in layer order (CR 613), cached. |
| `cards.ts` | Card definitions and characteristic helpers (`power`, `objIsType`, `objHasKeyword`, ...). |
| `copies.ts` | Copiable values (CR 707). |
| `faces.ts` | Cards with several faces (CR 709, 710, 712, 715, 722): each face's own definition, used while that face is up (`GameObject.face`), the card's resting characteristics anywhere else, the faces a card can be cast or played as. |
| `daynight.ts` | Day and night (CR 731) and the daybound and nightbound permanents that transform with it (702.145). |
| `graveyard.ts` | Graveyard order (CR 404): cards put into a graveyard at the same time, arranged by their owner when a card in the game reads the order; the top/bottom card of a graveyard. |
| `damage.ts`, `counters.ts` | Dealing damage (CR 120): damage dealt at the same time goes through one planner for protection, shield counters, prevention and redirection shields (CR 615, 616), which can pause combat damage to ask; counter/token replacement effects (CR 614, 616). |
| `mana.ts`, `manaabilities.ts`, `autopay.ts` | Mana costs, mana abilities, automatic payment. |
| `amounts.ts`, `modes.ts`, `keywords.ts` | Amounts (X, "for each"), modal spells, keyword tables. |
| `bot.ts` | Bot decisions, using the same legal-action helpers as the UI. |
| `shortcuts.ts` | Loops (CR 732): replaying a loop as a shortcut, the other players accepting or shortening it; a loop of mandatory actions is a draw (104.4b). |
| `rng.ts`, `deck.ts` | Seeded randomness in state; deck validation. |

## How a card works

1. `compileCard` (oracle) turns each line of rules text into keyword abilities, statics, triggers, activated
   abilities or a spell body. Any line it can't compile is listed in `unsupported`; such cards stay out of decks.
2. Casting or activating puts a stack item with the body. Resolving runs its effects in order
   (`effects/resolve.ts`); an effect that needs a choice sets `pending` and resolution continues after the answer.
3. Events (`fireEvent` in `effects/triggers.ts`) queue triggered abilities, which go on the stack in APNAP order
   before anyone gets priority (CR 603.3).
4. Everything that reads a permanent reads its characteristics through the layers (`layers.ts`). Effects from
   resolved spells lock the objects they affect (CR 611.2c); static abilities apply to whatever matches now
   (CR 611.3a). Within a layer: timestamps (CR 613.7) and dependencies (CR 613.8).

## Client (`apps/web`)

`useGame.ts` holds the game state, runs the bots and records a loop for a shortcut ("Start a loop", then "Repeat"); `App.tsx` draws the table, hand, stack, log and every choice
bar. Play-test URL params: `?hand=A|B`, `&board=`, `&yard=` (the cards must be in your deck).
