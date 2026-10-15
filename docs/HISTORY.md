# History

Finished work, one line per round. Git history (`git log -- packages/engine`) and each round's tests hold the details;
the full write-ups were in `docs/PLAN.md` until the restructure: `git show $(git log -1 --format=%h --diff-filter=D -- docs/PLAN.md)^:docs/PLAN.md`.

| Date | Round | Cards supported | Rules tests |
|---|---|---|---|
| 2026-10-08 | Table UI |  |  |
| 2026-10-08 | Card effects | 2,657 |  |
| 2026-10-09 | Layers and continuous effects | 3,535 | layers.test.ts |
| 2026-10-09 | Modal spells and target filters | 3,722 |  |
| 2026-10-09 | Choices during resolution, graveyards and tokens | 4,344 | actions.test.ts, graveyard.test.ts |
| 2026-10-09 | Table UI, round 3 |  |  |
| 2026-10-09 | Cycling, crew, convoke, ward, cast triggers | 4,717 | mechanics.test.ts |
| 2026-10-09 | UI polish |  |  |
| 2026-10-09 | Mulligans and Ken's round 4 notes |  |  |
| 2026-10-09 | Protection, poison, exalted, landfall, regeneration | 5,189 | combat-keywords.test.ts |
| 2026-10-09 | Blocking, lands, persist, prevention, life gain | 5,810 | blocks-lands-prevention.test.ts |
| 2026-10-09 | Mana abilities, explore, cascade and more | 6,244 | mana-counters-cascade.test.ts |
| 2026-10-09 | X costs, counted amounts and last known information | 6,719 | amounts-x.test.ts |
| 2026-10-10 | Library search, typecycling, kicker and additional costs | 7,147 | search.test.ts, kicker-costs.test.ts |
| 2026-10-10 | Effects on groups, and creature types or colors chosen | 7,547 | mass-choose.test.ts |
| 2026-10-10 | "Counter unless they pay", energy, the monarch, "you may pay" | 7,724 | counter-energy-monarch.test.ts |
| 2026-10-10 | Casting from graveyards, buyback, rebound, unearth | 7,889 | graveyard-cast.test.ts |
| 2026-10-10 | Echo, cumulative upkeep, evoke, dash, delve, living weapon, scavenge | 7,998 | upkeep-alt-costs.test.ts |
| 2026-10-10 | Morph, megamorph, disguise: face-down creatures | 8,103 | face-down.test.ts |
| 2026-10-10 | Auras' abilities, edicts, bounce lands, "until it leaves", riot, unleash, afterlife | 8,413 | auras-edicts.test.ts |
| 2026-10-10 | Sacrifice and discard costs on abilities, "as long as" abilities | 9,019 | activation-costs.test.ts, as-long-as.test.ts |
| 2026-10-10 | Several targets, "up to" targets, "another target" | 9,380 | targets.test.ts |
| 2026-10-10 | Spells that cost more or less | 9,493 | cost-changes.test.ts |
| 2026-10-10 | Abilities given to other permanents, backup | 9,699 | granted-abilities.test.ts |
| 2026-10-10 | Umbra armor, "If you do", extort, damage triggers | 9,850 | umbra-extort-damage.test.ts |
| 2026-10-10 | Protection from anything, attack and block rules, mentor | 10,163 | protection-combat-mentor.test.ts |
| 2026-10-10 | Enters and leaves triggers, stun and shield counters, raid, connive | 10,659 | enters-leaves-counters.test.ts |
| 2026-10-10 | "Whenever another creature dies", heroic, proliferate, amass, blink | 10,949 | dies-heroic-proliferate.test.ts |
| 2026-10-10 | Looking at the top cards, fading, vanishing, dethrone, each upkeep | 11,154 | dig.test.ts, fading-dethrone.test.ts |
| 2026-10-10 | Charge, spore, oil and other named counters | 11,323 | named-counters.test.ts |
| 2026-10-10 | Playing exiled cards, extra land drops, "whenever you attack" | 11,381 | impulse.test.ts |
| 2026-10-10 | Token and counter doublers | 11,393 | doublers.test.ts |
| 2026-10-10 | Ninjutsu, mobilize, tokens that enter attacking, graft, state triggers | 11,480 | ninjutsu.test.ts, graft.test.ts |
| 2026-10-10 | Copies: clones, token copies, populate, embalm, eternalize | 11,577 | copies.test.ts |
| 2026-10-11 | Beginning and end of combat, myriad | 11,752 | combat-steps.test.ts |
| 2026-10-14 | Copying spells: Twincast, storm, replicate, magecraft | 11,802 | spell-copies.test.ts |
| 2026-10-14 | Split second, devour, exploit, ascend and the city's blessing; "activate only if", "if ..., ... instead" | 11,881 | split-second-devour-exploit-ascend.test.ts |
| 2026-10-14 | Soulbond, Backgrounds and two commanders (partner pairs), blocking additional creatures, "as long as you're the monarch" | 11,952 | soulbond-backgrounds-blocks.test.ts |
| 2026-10-14 | "Becomes a copy" (CR 707.4) with durations and exceptions: Mirage Mirror, Mirrorweave, Cryptoplasm, Vesuvan Doppelganger, True Polymorph, Cemetery Puca, Shapesharer; ability words before activated abilities | 12,062 | becomes-a-copy.test.ts |
| 2026-10-14 | Madness, suspend (and spells that suspend themselves again), bestow, dredge, casualty; no-mana-cost cards can't be cast normally (CR 118.6); cleanup gets priority when something triggers (CR 514.3a) | 12,178 | madness-suspend-bestow-dredge-casualty.test.ts |
| 2026-10-15 | Loop shortcuts (CR 732): record a loop, repeat it N times, bots accept or stop it; mandatory loops are a draw (CR 104.4b); "whenever an opponent loses life", life gained and lost as events (Sanguine Bond, Exquisite Blood) | 12,188 | loops.test.ts |
| 2026-10-15 | Banding, enlist, "assign combat damage as though it weren't blocked", offspring, squad, ravenous, For Mirrodin!, sunburst, amplify, Start your engines! and max speed, flash with a cleanup sacrifice and "at the beginning of the next cleanup step"; "Exile this card from your graveyard" costs; keyword lines split by semicolons | 12,380 | offspring-squad-ravenous.test.ts, sunburst-amplify.test.ts, cleanup-step.test.ts, speed.test.ts, combat-choices.test.ts |
| 2026-10-15 | Support, converge, provoke, firebending, Phantom creatures' damage prevention, "tap an untapped creature you control" costs (also for mana), "put them back in any order", the Ring tempts you (Ring-bearers and the Ring's abilities), phasing; deck limits like Nazgûl's "up to nine" | 12,572 | support-converge.test.ts, provoke-firebending.test.ts, tap-costs.test.ts, ring.test.ts, phasing.test.ts |
| 2026-10-15 | Graveyard self-returns, "tap target creature defending player controls", "can't be blocked except by three or more creatures", Arrest-style restrictions, ingest, annihilator, party; blitz, warp, plot; reconfigure, incubate; the initiative and Undercity (CR 726, 309), goad, detain, "until your next turn"; assist | 12,772 | arrest-ingest-party.test.ts, blitz-warp-plot.test.ts, reconfigure-incubate.test.ts, initiative.test.ts, assist.test.ts |
| 2026-10-15 | Restricted mana ("spend this mana only to cast creature spells", CR 106.6) with Powerstones (CR 111.10h); "whenever ~ deals damage to a creature", tap-and-doesn't-untap; "the creature type of your choice"; "when enchanted creature dies, return that card"; "creatures your opponents control enter tapped"; melee, bolster, clash, endure, threshold and ability words in spells; "you may play lands from your graveyard" | 13,022 | restricted-mana.test.ts, damage-to-creature.test.ts, creature-type-choice.test.ts, enchanted-dies.test.ts, enter-tapped.test.ts, melee.test.ts, bolster.test.ts, clash.test.ts, endure.test.ts, threshold.test.ts, lands-from-graveyard.test.ts |
