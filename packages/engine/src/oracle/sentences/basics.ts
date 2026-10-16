// Sentences about damage, drawing, life, energy, the monarch, prevention, and "at end of combat" delayed triggers.

import { DUNGEONS, UNDERCITY, dungeonSupported } from "../dungeons";
import { allEffects } from "../../abilities";
import type { Amount, AmountExpr, DamageRecipient, Effect, ObjRef, PlayerRef, PunisherOption, TargetSpec } from "../../abilities";
import { NUM, NUMX, amt, num, plainMana, sacrificeSelf } from "../words";
import { parsePayCost, addTarget, parseUnlessPays } from "../body";
import { parseCount } from "../counts";
import { parseSearch, parseSearchFilter } from "../search";
import { parseDamageRecipient, parsePlayer, parseObject, parseTargetPhrase, pickFilter } from "../targets";
import { parseSentence } from "../sentence";
import type { Ctx } from "../body";
import { parsePreventAll } from "../statics";

/** One sentence to effects, or null if it can't be compiled, or undefined if none of these templates match. */
export function parseBasicsSentence(s: string, ctx: Ctx): Effect[] | null | undefined {
  let m: RegExpExecArray | null;

  if (/^Search your library /i.test(s)) return parseSearch(s);
  // "Its controller may search their library for a basic land card, put that card onto the battlefield tapped, then
  // shuffle" (Path to Exile): that player chooses whether to search, and doesn't shuffle if they don't (rulings). "That
  // player" after "target ... an opponent controls" (Boseiju) is that permanent's controller. Last known information
  // says who controlled it if it's gone by then (CR 608.2h).
  if ((m = /^(Its controller|That creature's controller|That permanent's controller|That player) may search their library for (.+)$/.exec(s))) {
    const who = m[1] === "That player" ? (ctx.lastPlayerTarget === undefined && ctx.lastObjectTarget !== undefined ? { ref: "targetController" as const, index: ctx.lastObjectTarget } : null) : parsePlayer(m[1]!.toLowerCase(), ctx);
    if (!who || / your /.test(m[2]!)) return null;
    const fx = parseSearch(`Search your library for ${m[2]!.replace(/ their hand\b/, " your hand")}`);
    if (fx?.length !== 1 || fx[0]!.type !== "search") return null;
    return [{ type: "eachMay", who, text: `search their library for ${m[2]!}`, effects: [{ ...fx[0]!, who: { ref: "choseThisWay" } }] }];
  }
  // "For each blight counter on it, each opponent loses 4 life unless that player sacrifices a nonland permanent of their
  // choice or discards a card" (Rottenmouth Viper): each player makes all the choices, then they all happen (rulings).
  if ((m = /^[Ff]or each ([a-z+\/0-9-]+) counter on (?:it|~), (.+)$/.exec(s)) && (ctx.selfIt || /on ~,/.test(s))) {
    const fx = parseSentence(`${m[2]!.charAt(0).toUpperCase()}${m[2]!.slice(1)}`, ctx);
    const p = fx?.length === 1 ? fx[0] : undefined;
    if (p?.type !== "punisher" || p.times !== undefined || p.picks !== undefined) return undefined;
    // One kind of permanent to sacrifice and no payment, so the picks can be made all together.
    if (p.options.some((o) => "pay" in o) || p.options.filter((o) => "sacrifice" in o).length > 1) return null;
    return [{ ...p, picks: { count: { kind: "counters", counter: m[1]!, of: { ref: "self" } } } }];
  }
  // Punishers: "Each opponent loses 3 life unless that player sacrifices a nonland permanent of their choice or discards a
  // card", "that player loses 2 life unless they pay {2}" (see the punisher effect).
  if ((m = new RegExp(`^(.+?) (?:loses|lose) ${NUMX} life unless (?:they|that player|he or she) (.+)$`).exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    const options = parsePunisherOptions(m[3]!, ctx);
    if (!who || who.ref === "you" || !options) return null;
    return [{ type: "punisher", who, options, effects: [{ type: "loseLife", who: { ref: "punished" }, n: amt(m[2]!) }] }];
  }
  // "~ deals 5 damage to target opponent unless that player sacrifices a creature of their choice" (Demanding Dragon).
  if ((m = new RegExp(`^(?:~|It) deals ${NUMX} damage to (.+?) unless (?:they|that player|he or she) ((?:sacrifices?|discards?|pays?) .+)$`).exec(s))) {
    if (/^It /.test(s) && !ctx.selfIt) return null;
    const who = parsePlayer(m[2]!, ctx);
    const options = parsePunisherOptions(m[3]!, ctx);
    if (!who || who.ref === "you" || !options) return null;
    return [{ type: "punisher", who, options, effects: [{ type: "damage", amount: amt(m[1]!), to: { ref: "punished" } }] }];
  }
  // "For each opponent, you create a 2/2 black Zombie creature token unless that player sacrifices a creature of their
  // choice" (Acererak): one token for each opponent who doesn't, all made at once after the sacrifices (rulings).
  if ((m = /^[Ff]or each opponent, you (create .+?) unless (?:that player|they) ((?:sacrifices?|discards?) .+)$/.exec(s))) {
    const options = parsePunisherOptions(m[2]!, ctx);
    const before = ctx.targets.length;
    const fx = options && parseSentence(`${m[1]!.charAt(0).toUpperCase()}${m[1]!.slice(1)}`, ctx);
    const tok = fx?.length === 1 ? fx[0] : undefined;
    if (!options || tok?.type !== "createToken" || typeof tok.n !== "number" || ctx.targets.length !== before) return null;
    return [{ type: "punisher", who: { ref: "eachOpponent" }, options, effects: [{ ...tok, n: { count: { kind: "punished" }, times: tok.n } }] }];
  }
  // "You may collect evidence 4" as it resolves (CR 701.59a): only after "you may" (a player can't be made to).
  if ((m = /^Collect evidence (\d+)$/.exec(s))) return ctx.mayNow ? [{ type: "collectEvidence", n: Number(m[1]) }] : null;
  // Additional phases (CR 500.8): "After this main phase, there is an additional combat phase followed by an additional
  // main phase", "after this phase, there are two additional combat phases", and, after "If it's your main phase,",
  // "there is an additional combat phase after this phase".
  if (
    (m = /^After this (main |combat )?phase, there(?: is|'s| are) (an|two) additional combat phases?(,? followed by an additional main phase)?$/i.exec(s)) ??
    (m = /^There(?: is|'s| are) (an|two) additional combat phases? after this phase(,? followed by an additional main phase)?$/i.exec(s))
  ) {
    const [after, n, main] = m.length === 4 ? [m[1]?.trim(), m[2]!, m[3]] : [undefined, m[1]!, m[2]];
    if (n.toLowerCase() === "two" && main) return null;
    const phases: ("combat" | "main")[] = n.toLowerCase() === "two" ? ["combat", "combat"] : main ? ["combat", "main"] : ["combat"];
    return [{ type: "addPhases", phases, ...(after ? { after: after as "main" | "combat" } : {}) }];
  }
  // Timetwister: "Each player shuffles their hand and graveyard into their library, then draws seven cards." Reminisce:
  // "Target player shuffles their graveyard into their library."
  if ((m = /^(?:(Target player|Each player|Target opponent) shuffles their|[Ss]huffle your) (hand and graveyard|graveyard|hand) into (?:their|your) library(?:, then (?:draws|draw) (\w+) cards?)?$/.exec(s))) {
    const who: PlayerRef | null = m[1] ? parsePlayer(m[1].toLowerCase(), ctx) : { ref: "you" };
    if (!who) return null;
    const out: Effect[] = [{ type: "shuffleZones", who, ...(m[2] !== "graveyard" ? { hand: true as const } : {}), ...(m[2] !== "hand" ? { graveyard: true as const } : {}) }];
    if (m[3]) {
      const n = num(m[3]);
      if (!Number.isInteger(n)) return null;
      out.push({ type: "draw", who, n });
    }
    return out;
  }
  // "Sacrifice it at end of combat", "destroy that creature at end of combat" (CR 511.2, 603.7), "return ~ to its
  // owner's hand at the beginning of the next cleanup step" (514.3a): a delayed trigger
  // about the source or about the object the trigger was about, with no targets of its own.
  if ((m = /^(.+?) at (end of combat|the beginning of the next cleanup step|the beginning of the next end step)$/i.exec(s)) && !(ctx.lastCreatedAny && /^(Sacrifice|Exile) (?:it|them|the tokens?|that token|those tokens)$/i.test(m[1]!))) {
    const before = ctx.targets.length;
    const inner = parseSentence(m[1]!.replace(/^./, (c) => c.toUpperCase()), ctx);
    if (!inner || ctx.targets.length !== before) return null;
    const refs = new Set<string>();
    let players = true;
    for (const y of allEffects(inner)) {
      if ("what" in y) refs.add((y.what as ObjRef).ref);
      if ("who" in y && (y.who as PlayerRef).ref !== "you") players = false;
      if (y.type === "delayed") players = false;
    }
    if (!players || refs.size !== 1) return null;
    const [ref] = refs;
    const when = m[2] === "end of combat" ? "endOfCombat" : /cleanup/.test(m[2]!) ? "nextCleanup" : "nextEndStep";
    if (ref === "subject") return [{ type: "delayed", when, each: "subject", effects: inner, text: m[1]! }];
    // The Locust God: "When ~ dies, return it to its owner's hand at the beginning of the next end step": about the card
    // in the graveyard now; if it leaves there first, it stays where it went (rulings).
    if (ref === "selfCard") return [{ type: "delayed", when, each: "selfCard", effects: JSON.parse(JSON.stringify(inner).replace(/\{"ref":"selfCard"\}/g, '{"ref":"subjectCard"}')) as Effect[], text: m[1]! }];
    if (ref !== "self") return null;
    // The delayed trigger is about the source as it is now: if it leaves, it's a new object (CR 400.7).
    const effects = JSON.parse(JSON.stringify(inner).replace(/\{"ref":"self"\}/g, '{"ref":"subject"}')) as Effect[];
    return [{ type: "delayed", when, effects, text: m[1]! }];
  }
  // Uro: "When ~ enters, sacrifice it unless it escaped" (CR 702.138b): whether it escaped can't change.
  if (/^[Ss]acrifice (?:~|it) unless (?:it|~) escaped$/.test(s) && ctx.selfIt && ctx.lastObjectTarget === undefined)
    return [{ type: "if", cond: { kind: "state", cond: { kind: "self", is: "escaped" } }, effects: [], otherwise: [sacrificeSelf] }];
  // "Sacrifice ~ unless you pay {U}" (upkeep costs): pay to keep it, or it's sacrificed.
  if ((m = /^[Ss]acrifice (~|it) unless you pay (.+)$/.exec(s)) && (m[1] === "~" || (ctx.selfIt && ctx.lastObjectTarget === undefined))) {
    const pay = parsePayCost(m[2]!);
    if (!pay || (pay.mana && !plainMana(pay.mana))) return null;
    return [{ type: "may", effects: [], pay, otherwise: [sacrificeSelf], keep: true, text: `Pay ${m[2]} to keep ~` }];
  }
  // "Sacrifice ~ unless you discard a card" (Masticore), "sacrifice it unless you discard a card at random" (Balduvian
  // Horde): the choice is made on resolution; with no card to discard, it's sacrificed (rulings).
  if ((m = /^[Ss]acrifice (~|it) unless you discard a card( at random)?$/.exec(s)) && (m[1] === "~" || (ctx.selfIt && ctx.lastObjectTarget === undefined))) {
    const discard: Effect = { type: "discard", who: { ref: "you" }, n: 1, ...(m[2] ? { random: true } : {}) };
    return [{ type: "may", effects: [discard], otherwise: [sacrificeSelf], keep: true, text: `Discard a card${m[2] ?? ""} to keep ~` }];
  }
  // "Sacrifice ~ unless you discard a land card" (Fallow Wurm), "exile it unless you discard a creature card" (Body
  // Snatcher): only such a card can be discarded; with none, it's sacrificed (exiled).
  if ((m = /^(Sacrifice|Exile) (~|it) unless you discard (an? .+? card)$/i.exec(s)) && (m[2] === "~" || (ctx.selfIt && ctx.lastObjectTarget === undefined))) {
    const filter = parseSearchFilter(m[3]!.replace(/^an? /, ""));
    if (!filter) return null;
    const away: Effect = /^sacrifice/i.test(m[1]!) ? sacrificeSelf : { type: "exile", what: { ref: "self" } };
    return [{ type: "may", effects: [{ type: "discard", who: { ref: "you" }, n: 1, filter }], otherwise: [away], keep: true, text: `Discard ${m[3]} to keep ~` }];
  }
  // "Sacrifice ~ unless you exile the top creature card of your graveyard" (Barrow Ghoul): with none there, it's sacrificed;
  // without ~, it can still be exiled (rulings).
  if ((m = /^[Ss]acrifice (~|it) unless you exile the top (.+?) of your graveyard$/.exec(s)) && (m[1] === "~" || (ctx.selfIt && ctx.lastObjectTarget === undefined))) {
    const filter = parseSearchFilter(m[2]!);
    if (filter === null) return null;
    const exile: Effect = { type: "exile", what: { ref: "graveyardEnd", who: { ref: "you" }, ...(filter ? { filter } : {}) } };
    return [{ type: "may", effects: [exile], otherwise: [sacrificeSelf], keep: true, text: `Exile the top ${m[2]} of your graveyard to keep ~` }];
  }
  // "Then discard two cards unless you discard a creature card" (Mystic Meditation, Thirst for Knowledge): a card of
  // that kind, or two cards. With none of that kind, two cards (rulings).
  if ((m = new RegExp(`^(?:[Tt]hen )?[Dd]iscard (two|three|\\d+) cards unless you discard (an? .+? card)$`).exec(s))) {
    const filter = parseSearchFilter(m[2]!.replace(/^an? /, ""));
    if (!filter) return null;
    return [{ type: "may", effects: [{ type: "discard", who: { ref: "you" }, n: 1, filter }], otherwise: [{ type: "discard", who: { ref: "you" }, n: num(m[1]!) }], keep: true, text: `Discard ${m[2]} rather than ${m[1]} cards` }];
  }
  // The Lairs: "sacrifice it unless you return a non-Lair land you control to its owner's hand". Returning one keeps it;
  // with none to return, it's sacrificed. Quickling: "unless you return another creature you control".
  if ((m = /^[Ss]acrifice (~|it) unless you return (an? .+?|another .+?) you control to its owner's hand$/.exec(s)) && (m[1] === "~" || (ctx.selfIt && ctx.lastObjectTarget === undefined))) {
    const another = /^another /.test(m[2]!);
    const filter = pickFilter(m[2]!.replace(/^(?:an?|another) /, ""));
    if (!filter) return null;
    return [{ type: "may", effects: [{ type: "pick", who: { ref: "you" }, filter: another ? { ...filter, notSource: true, text: `other ${filter.text}` } : filter, n: 1, action: "bounce" }], otherwise: [sacrificeSelf], keep: true, text: `Return ${m[2]} you control to its owner's hand to keep ~` }];
  }
  // "That player draws an additional card" (Howling Mine): just another draw.
  if ((m = /^(.*?\b[Dd]raws?) an additional card$/.exec(s))) return parseSentence(`${m[1]} a card`, ctx);
  // Poison counters on a player (CR 122.1f): "defending player gets a poison counter", "each opponent gets two".
  if ((m = new RegExp(`^(.+?) gets? (a|${NUMX}) poison counters?$`).exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    return who && [{ type: "poison", who, n: m[2] === "a" ? 1 : amt(m[2]!) }];
  }
  // Adding mana from a spell or a non-mana triggered ability (CR 605.5a: it uses the stack): "Add {B}{B}{B}" (Dark
  // Ritual), "add one mana of any color", "add three mana of any one color" (the color is chosen as it resolves).
  if ((m = /^[Aa]dd ((?:\{[WUBRGC]\})+)$/.exec(s))) return [{ type: "addMana", mana: m[1]! }];
  // "Add {R} for each card in target opponent's hand" (Jeska's Will): counted as it resolves.
  if ((m = /^[Aa]dd ((?:\{[WUBRGC]\})+) for each (.+)$/.exec(s))) {
    const times = parseCount(m[2]!, ctx, true);
    return times && [{ type: "addMana", mana: m[1]!, times }];
  }
  if ((m = new RegExp(`^[Aa]dd ${NUM} mana of any (one )?color$`).exec(s)) && (num(m[1]!) === 1 || m[2])) return [{ type: "choose", choice: "color" }, { type: "addMana", chosen: num(m[1]!) }];
  // Energy (CR 107.14): "You get {E}{E}", "you get X {E}", "you get an amount of {E} equal to ~'s power".
  if ((m = /^(?:[Yy]ou )?[Gg]et ((?:\{E\})+)$/.exec(s))) return [{ type: "getEnergy", who: { ref: "you" }, n: m[1]!.length / 3 }];
  if ((m = new RegExp(`^(?:[Yy]ou )?[Gg]et ${NUMX} \\{E\\}$`).exec(s))) return [{ type: "getEnergy", who: { ref: "you" }, n: amt(m[1]!) }];
  if ((m = /^(?:[Yy]ou )?[Gg]et an amount of \{E\} equal to (.+)$/.exec(s))) {
    const n = parseCount(m[1]!, ctx);
    return n && [{ type: "getEnergy", who: { ref: "you" }, n }];
  }
  // The monarch (CR 725).
  if (/^You become the monarch$/i.test(s)) return [{ type: "becomeMonarch", who: { ref: "you" } }];
  // "You may play an additional land this turn", "you may play up to two additional lands this turn" (CR 305.2a).
  if ((m = new RegExp(`^You may play (?:an|up to ${NUM}) additional lands? this turn$`, "i").exec(s))) return [{ type: "extraLandThisTurn", n: m[1] ? num(m[1]) : 1 }];
  // The initiative (CR 726), which ventures into Undercity; and venturing into Undercity itself (CR 701.49d). Plain
  // "venture into the dungeon" lets its player pick a dungeon that isn't modeled yet (see oracle/dungeons.ts).
  if (/^(?:You )?take the initiative$/i.test(s)) return dungeonSupported(UNDERCITY) ? [{ type: "takeInitiative", who: { ref: "you" } }] : null;
  if (/^(?:You )?venture into Undercity$/i.test(s)) return dungeonSupported(UNDERCITY) ? [{ type: "venture", undercity: true }] : null;
  if (/^(?:You )?venture into the dungeon$/i.test(s)) return DUNGEONS.length > 1 && DUNGEONS.every(dungeonSupported) ? [{ type: "venture" }] : null;
  // "Venture into the dungeon and you gain 3 life", "Create a Treasure token and venture into the dungeon": in order.
  if ((m = /^(?:Venture into the dungeon and (.+)|(.+?) and venture into the dungeon)$/.exec(s))) {
    const other = parseSentence((m[1] ?? m[2])!.replace(/^./, (c) => c.toUpperCase()), ctx);
    return other && (m[1] ? [{ type: "venture" }, ...other] : [...other, { type: "venture" }]);
  }
  // The Ring tempts you (CR 701.54).
  if (/^the Ring tempts you$/i.test(s)) return [{ type: "ringTempts" }];
  if (/^Target player becomes the monarch$/i.test(s)) return [{ type: "becomeMonarch", who: { ref: "target", index: addTarget(ctx, { kind: "player", text: "target player" }) } }];
  // "Choose a creature type." / "Choose a color." (the rest of the text says what it's for).
  if ((m = /^Choose an? (creature type|color)(?: other than (\w+))?$/i.exec(s)))
    return [{ type: "choose", choice: m[1]!.toLowerCase() === "color" ? "color" : "creatureType", ...(m[2] ? { except: m[2] } : {}) }];

  // "~ gets +1/+1 until end of turn for each creature blocking it (beyond the first)" (rampage, CR 702.23)
  if ((m = /^~ gets ([+-]\d+)\/([+-]\d+) until end of turn for each creature blocking it( beyond the first)?$/.exec(s)))
    return [{ type: "pumpPerBlocker", what: { ref: "self" }, power: Number(m[1]), toughness: Number(m[2]), beyondFirst: !!m[3] }];
  // Prevention (CR 615): shields for the next N damage this turn, and Fog.
  if ((m = new RegExp(`^Prevent the next ${NUMX} damage that would be dealt to (any target|target .+?) this turn$`, "i").exec(s))) {
    const to = /^any target$/i.test(m[2]!) ? parseDamageRecipient(m[2]!, ctx) : parseObject(m[2]!, ctx);
    return to ? [{ type: "preventNext", n: amt(m[1]!), to }] : null;
  }
  if (/^Prevent all combat damage that would be dealt this turn$/i.test(s)) return [{ type: "preventCombatDamage" }];
  if ((m = /^(Players|Your opponents) can't gain life this turn$/i.exec(s))) return [{ type: "noLifeGain", players: /^players$/i.test(m[1]!) ? "all" : "opponents" }];
  if (/^Damage can't be prevented this turn$/i.test(s)) return [{ type: "noPrevention" }];
  // "Your opponents can't cast spells this turn" (Silence), "Target player can't ..." (Orim's Chant), "Its controller
  // can't ..." (Render Silent), "defending player can't ..." (Xantid Swarm), "Players can't cast noncreature spells this
  // turn" (Calamity's Wake), "Players dealt damage this way can't ..." (Aurelia's Fury): a "can't" for those players
  // until the turn ends, which wins over anything that says they can (CR 101.2).
  if ((m = /^(.+?) can't cast (?:(noncreature|creature|instant|sorcery|artifact) )?spells this turn$/i.exec(s))) {
    const w = m[1]!.toLowerCase();
    const who: PlayerRef | null = w === "players" ? { ref: "eachPlayer" } : w === "your opponents" ? { ref: "eachOpponent" } : w === "players dealt damage this way" ? { ref: "damagedThisWay" } : parsePlayer(w, ctx);
    if (!who) return null;
    const filter = m[2] ? parseTargetPhrase(`${m[2].toLowerCase()} spell`) : undefined;
    if (filter === null || (filter && filter.kind !== "spell")) return null;
    return [{ type: "cantCast", who, ...(filter ? { filter: { ...filter, text: `${m[2]!.toLowerCase()} spell` } } : {}) }];
  }
  // "Prevent all combat damage that would be dealt to and dealt by that creature this turn" (Maze of Ith), "Prevent all
  // damage target creature would deal this turn": a prevention effect on that creature until the turn ends (CR 615.1).
  if ((m = /^(Prevent all .+) this turn$/i.exec(s)) || (m = /^Prevent all (combat )?damage (.+?) would deal this turn$/i.exec(s))) {
    const p = m.length === 2 ? parsePreventAll(m[1]!) : { subject: m[2]!, mod: { kind: "preventDamage" as const, by: true as const, ...(m[1] ? { combat: "only" as const } : {}) } };
    const what = p && /^(~|it|that creature|target .+)$/i.test(p.subject) ? parseObject(p.subject, ctx) : null;
    return p && what ? [{ type: "continuous", what, mods: [p.mod], duration: "endOfTurn" }] : null;
  }
  // Redirection shields (CR 614.9): "The next 1 damage that would be dealt to ~ this turn is dealt to target creature
  // you control instead" (the en-Kor), "... dealt this turn to target white creature you control is dealt to ~ instead".
  if ((m = new RegExp(`^The next ${NUMX} damage that would be dealt (this turn )?to (.+?)( this turn)? is dealt to (.+) instead$`, "i").exec(s)) && !m[2] !== !m[4]) {
    const from = /^(~|any target|target .+)$/i.test(m[3]!) ? parseDamageRecipient(m[3]!, ctx) : null;
    const to = from && /^(~|any target|any other target|another target|target .+|another target .+)$/i.test(m[5]!) ? parseDamageRecipient(m[5]!, ctx) : null;
    return from && to ? [{ type: "redirectNext", n: amt(m[1]!), from, to }] : null;
  }
  // "~ deals 2 damage to any target and 1 damage to any other target" (Arc Trail): both at once.
  if ((m = new RegExp(`^~ deals ${NUMX} damage to (.+?) and ${NUMX} damage to (.+)$`, "i").exec(s))) {
    const a = parseDamageRecipient(m[2]!, ctx);
    const b = a && parseDamageRecipient(m[4]!, ctx);
    return a && b ? [{ type: "damage", amount: amt(m[1]!), to: a }, { type: "damage", amount: amt(m[3]!), to: b }] : null;
  }
  // "~ deals 3 damage divided as you choose among one, two, or three targets": how many targets and how much each
  // gets are chosen with the targets, at least 1 each (CR 601.2d); "any number of targets" is one to that many.
  // "X damage" ("X plus 1"): the spell's X, announced before the targets (CR 601.2b), so one to X targets.
  // "Damage equal to its power" (Orca, Siege Demon): worked out the same way, with what the ability knows then.
  // "Among up to X target creatures" with X damage (Ravenous Gigantotherium) is the same: at least 1 each. "8 damage
  // divided as you choose among X target creatures" (Meteor Swarm): exactly the spell's X targets, so X is 8 at most.
  if ((m = /^~ deals (\d+|one|two|three|four|five|six|seven|eight|nine|ten|X|X plus 1|damage equal to .+?) (?:damage )?divided as you choose among (one or two|one, two, or three|any number of|up to X|X) (targets|target .+)$/i.exec(s))) {
    const equal = /^damage equal to (.+)$/.exec(m[1]!);
    const counted = equal ? parseCount(equal[1]!, ctx) : null;
    if (equal && !counted) return null;
    const to = addDivided(ctx, counted ?? m[1]!, m[2]!, m[3]!);
    return to && [{ type: "damage", amount: to.amount, to: { ref: "anyTarget", index: to.index, n: to.n }, divided: true }];
  }
  // "~ deals X damage divided evenly, rounded down, among any number of targets" (Fireball): no division is chosen; it's
  // worked out among the targets still legal as it resolves (rulings), so any number of targets, X or not (CR 115.6).
  if ((m = /^~ deals (X|\d+) damage divided evenly, rounded down, among any number of targets$/i.exec(s))) {
    if (ctx.targets.some((t) => t.many) || (m[1] === "X" && !ctx.spell)) return null;
    const index = addTarget(ctx, { kind: "any", text: "any target", many: "any" });
    ctx.lastObjectTarget = undefined;
    ctx.lastTargets = { index, n: 2 };
    return [{ type: "damage", amount: amt(m[1]!), to: { ref: "anyTarget", index, n: 2 }, evenly: true }];
  }
  // "Prevent the next 5 damage that would be dealt this turn to any number of targets, divided as you choose" (Remedy):
  // a shield of its part on each target, divided as for damage (CR 601.2d, 615.7).
  if ((m = /^Prevent the next (\d+|one|two|three|four|five|six|seven|eight|nine|ten|X) damage that would be dealt this turn to (any number of|one or two|one, two, or three) (targets|target .+), divided as you choose$/i.exec(s))) {
    const to = addDivided(ctx, m[1]!, m[2]!, m[3]!);
    return to && [{ type: "preventNext", n: to.amount, to: { ref: "anyTarget", index: to.index, n: to.n }, divided: true }];
  }
  // Damage: "~ deals 3 damage to any target"
  if ((m = new RegExp(`^~ deals ${NUMX} damage to (.+)$`, "i").exec(s))) {
    // "to each creature and each player": dealt to all of them at once (CR 120.3).
    const tos: DamageRecipient[] = [];
    for (const part of m[2]!.split(/,? and (?=each )/i)) {
      const to = parseDamageRecipient(part, ctx);
      if (!to) return null;
      tos.push(to);
    }
    return [{ type: "damage", amount: amt(m[1]!), to: tos[0]!, ...(tos.length > 1 ? { also: tos.slice(1) } : {}) }];
  }
  // Drawing
  if ((m = new RegExp(`^(?:You )?[Dd]raw ${NUMX} cards?$`).exec(s))) return [{ type: "draw", who: { ref: "you" }, n: amt(m[1]!) }];
  if ((m = new RegExp(`^(.+?) draws? ${NUMX} cards?$`, "i").exec(s)) && !/ may /i.test(m[1]!)) {
    const who = parsePlayer(m[1]!, ctx);
    return who ? [{ type: "draw", who, n: amt(m[2]!) }] : null;
  }
  // Life. "You may gain 1 life" leaves "Gain 1 life": yours.
  if ((m = new RegExp(`^Gain ${NUMX} life$`).exec(s))) return [{ type: "gainLife", who: { ref: "you" }, n: amt(m[1]!) }];
  if ((m = new RegExp(`^(.+?) (gains?|loses?) ${NUMX} life$`, "i").exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    if (!who) return null;
    return [{ type: m[2]!.startsWith("gain") ? "gainLife" : "loseLife", who, n: amt(m[3]!) }];
  }
  return undefined;
}

/**
 * The targets something "divided as you choose" is divided among (CR 601.2d): `amount` ("3", "X", "X plus 1", or an
 * amount counted otherwise), `among` ("one or two", "one, two, or three", "any number of"), `what` ("targets", "target
 * creatures and/or planeswalkers your opponents control"). A fixed amount gets a target for each part there could be; an
 * amount worked out as they're chosen gets one `many` target (TargetSpec.divided.amount). Null if it isn't one we can.
 */
function addDivided(ctx: Ctx, amount: string | AmountExpr, among: string, what: string): { index: number; n: number; amount: Amount } | null {
  const counted = typeof amount !== "string";
  const isX = counted || amount.startsWith("X");
  // X is the spell's own, or defined by the text ("where X is ...", body.ts defineX).
  // An ability's own X is checked with the ability (compile.ts checkX, activated.ts).
  if (among === "up to X") {
    if (amount !== "X") return null;
    among = "any number of";
  }
  if (isX && (among !== "any number of" || (ctx.whereX && amount !== "X"))) return null;
  if (among === "X" && (isX || !ctx.spell)) return null;
  const total = isX ? 0 : num(amount as string);
  const n = among === "one or two" ? 2 : among === "one, two, or three" ? 3 : total;
  let spec: TargetSpec | null = { kind: "any", text: "any target" };
  if (what !== "targets") {
    const words = what.replace(/^target /, "").replace(/ your opponents control$/, " an opponent controls").replace(/ and\/or /g, " or ");
    const one = words.replace(/\bcreatures\b/g, "creature").replace(/\bplaneswalkers\b/g, "planeswalker");
    spec = one === words ? null : parseTargetPhrase(one);
    if (spec?.kind !== "object") return null;
    spec = { ...spec, text: `target ${one}` };
  }
  const first = ctx.targets.length;
  if (among === "X") {
    if (ctx.targets.some((t) => t.many)) return null;
    addTarget(ctx, { ...spec, divided: { first, n: 1, total }, many: "exactX" });
    ctx.lastObjectTarget = undefined;
    ctx.lastTargets = { index: first, n: 2 };
    return { index: first, n: 2, amount: total };
  }
  if (isX) {
    if (ctx.targets.some((t) => t.many)) return null;
    const x: AmountExpr = counted ? amount : { count: { kind: "x" }, ...(amount === "X plus 1" ? { plus: 1 } : {}) };
    addTarget(ctx, { ...spec, divided: { first, n: 1, total: 0, amount: x }, many: "any" });
    // "Those creatures" are all of them, however many (see TargetSpec.many).
    ctx.lastObjectTarget = undefined;
    ctx.lastTargets = { index: first, n: 2 };
    return { index: first, n: 2, amount: x };
  }
  for (let k = 0; k < n; k++)
    addTarget(ctx, { ...spec, divided: { first, n, total }, ...(k ? { optional: true, distinctFrom: Array.from({ length: k }, (_, j) => first + j) } : {}) });
  return { index: first, n, amount: total };
}

/**
 * A punisher's ways out: "sacrifices a nonland permanent of their choice or discards a card", "discards two cards or
 * sacrifices a creature or planeswalker of their choice", "pay {2}". Null if one isn't understood.
 */
function parsePunisherOptions(text: string, ctx: Ctx): PunisherOption[] | null {
  const out: PunisherOption[] = [];
  for (const part of text.split(/,? or (?=(?:discards?|sacrifices?|pays?) )/)) {
    let m: RegExpExecArray | null;
    if ((m = new RegExp(`^discards? ${NUM} cards?$`).exec(part))) out.push({ discard: num(m[1]!) });
    else if ((m = /^sacrifices? (?:an?|one) (.+?)(?: of (?:their|his or her) choice)?$/.exec(part))) {
      // "An artifact, a creature, or a land": one permanent that's any of them.
      const filter = pickFilter(m[1]!.replace(/, (?:or )?an? /g, (x) => x.replace(/an? $/, "")).replace(/ or an? /, " or "));
      if (!filter) return null;
      out.push({ sacrifice: filter });
    } else if ((m = /^pays? (.+)$/.exec(part))) {
      const pay = parseUnlessPays(m[1]!, ctx);
      if (!pay) return null;
      out.push({ pay });
    } else return null;
  }
  return out.length ? out : null;
}
