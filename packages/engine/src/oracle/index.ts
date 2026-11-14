// Compiles a card's oracle text into the effect language in abilities.ts.
//
// This is a pattern-based compiler over Wizards' templated rules text. It reports every line it can't compile,
// so we always know which cards fully work. Where things live:
//
//   compile.ts           compileCard: splits a card into lines and routes each one
//   keyword-abilities.ts keyword lines (flying, kicker, ninjutsu, storm, ...) and alternative/additional costs
//   statics.ts           static abilities and their conditions, cost changes
//   triggers.ts          "When/Whenever/At" lines: which event triggers them
//   activated.ts         "Cost: Effect" lines
//   mana-abilities.ts    mana abilities
//   body.ts              an ability's text split into sentences ("if you do", "instead", modes, for each)
//   sentences/*.ts       one sentence -> effects, grouped by subject; tried in order by sentence.ts
//   targets.ts           "target creature an opponent controls" and other object/player phrases
//   counts.ts            amounts: "the number of ...", "equal to ..."
//   search.ts            library searches
//   grants.ts            quoted abilities given to other objects
//   tokens.ts            token descriptions, copy exceptions
//   words.ts             shared regex pieces and word tables

export { compileCard, overloadedText, cleavedText, MONARCH, RING, INITIATIVE, RAD, isFullySupported, spellTargetSpecs, castTimeTargets, castingBody, normalizeSelf, mutateTarget } from "./compile";
export { parseManaAbility } from "./mana-abilities";
export { parseBody, usesX } from "./body";
export { parseCount } from "./counts";
export { parseTargetPhrase } from "./targets";
export { compileGranted, emblemAbilityOk, bindGrantSource, showGrantSource, CAST_BY_SOURCE, casterMark, SPELL_CONTROLLER, playerMark } from "./grants";
export { QUOTED_SOURCE_NAME } from "./compile";
export { parseCopyExcept, PREDEFINED_TOKENS } from "./tokens";
export { UNDERCITY, LOST_MINE, MAD_MAGE, TOMB_OF_ANNIHILATION, DUNGEONS, dungeonByName, dungeonDef, dungeonSupported, roomBody, type Dungeon, type DungeonRoom } from "./dungeons";
