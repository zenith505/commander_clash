// Sentences that create tokens (including token copies and predefined tokens), delayed draws, proliferate, amass, populate, blink, investigate, explore.

import type { Effect, TokenSpec } from "../../abilities";
import { compileQuoted } from "../grants";
import { allEffects } from "../../abilities";
import { NUMX, X, amt, num, singularWord, isGroup, BASIC_TYPES, COLOR_WORDS } from "../words";
import { parsePlayer, parseObject, parseKeywordList } from "../targets";
import { parseSearchFilter } from "../search";
import { INCUBATOR, PREDEFINED_TOKENS, ROLE_TOKENS, parseToken, parseCopyExcept, parseCountMod } from "../tokens";
import { parseSentence } from "../sentence";
import { halfX, parseCount } from "../counts";
import type { Ctx } from "../body";
import { canonicalKeyword, SUPPORTED_KEYWORDS } from "../../keywords";

/** One sentence to effects, or null if it can't be compiled, or undefined if none of these templates match. */
export function parseTokensSentence(s: string, ctx: Ctx): Effect[] | null | undefined {
  let m: RegExpExecArray | null;

  // Kaya, Geist Hunter: "Until end of turn, if one or more tokens would be created under your control, twice that many of
  // those tokens are created instead": a token doubler for the rest of the turn (CR 614.1a, 611.2a). (The body moves a
  // leading "until end of turn" to the end.)
  if ((m = /^Until end of turn, (if one or more .+ instead)$/.exec(s) ?? /^(If one or more .+ instead) until end of turn$/.exec(s))) {
    const mod = parseCountMod(`${m[1]!.charAt(0).toUpperCase()}${m[1]!.slice(1)}.`);
    return mod?.what === "tokens" && mod.who === "you" && (mod.op === "double" || mod.op === "triple") ? [{ type: "countModThisTurn", mod }] : null;
  }

  // "Create twice X 1/1 black and green Pest creature tokens" (Pest Infestation): 2X of them (X counting 0 off the stack,
  // CR 107.3).
  if ((m = /^Create twice X (.+ tokens?(?: with .+)?)$/.exec(s))) {
    const fx = parseSentence(`Create X ${m[1]}`, ctx);
    const tok = fx?.length === 1 ? fx[0] : undefined;
    if (tok?.type !== "createToken" || typeof tok.n !== "object" || !("count" in tok.n) || tok.n.count.kind !== "x" || tok.n.times !== undefined) return null;
    return [{ ...tok, n: { count: { kind: "x" }, times: 2 } }];
  }
  // The Goose Mother: "create half X Food tokens, rounded up" (CR 107.1a).
  if ((m = /^Create half X (.+ tokens), rounded (up|down)$/i.exec(s))) {
    const fx = parseSentence(`Create X ${m[1]}`, ctx);
    const tok = fx?.length === 1 ? fx[0] : undefined;
    const n = halfX(m[2], ctx);
    if (!n || tok?.type !== "createToken" || typeof tok.n !== "object" || !("count" in tok.n) || tok.n.count.kind !== "x" || tok.n.times !== undefined) return null;
    return [{ ...tok, n }];
  }
  // Najeela, the Blade-Blossom: "you may have its controller create a 1/1 white Warrior creature token that's tapped and
  // attacking": your choice, that player's token (attacking what that player chooses, CR 508.4, rulings).
  if ((m = /^([Yy]ou may )?[Hh]ave its controller create (.+ creature tokens?(?: with [^"]+?)? that(?:'s| are) tapped and attacking)$/.exec(s))) {
    const fx = parseSentence(`Its controller creates ${m[2]}`, ctx);
    if (fx?.length !== 1 || fx[0]!.type !== "createToken" || fx[0]!.who.ref !== "subjectController") return null;
    return m[1] ? [{ type: "may", effects: fx, text: `have its controller create ${m[2]}` }] : fx;
  }
  // "Create a 3/3 colorless Phyrexian Wurm artifact creature token with deathtouch and a 3/3 colorless Phyrexian Wurm
  // artifact creature token with lifelink" (Wurmcoil Engine): each of them, entering at the same time (CR 608.2f).
  if ((m = /^[Cc]reate (.+)$/.exec(s))) {
    // Triplicate Titan: "a ... token with flying, a ... token with vigilance, and a ... token with trample".
    // Farmer Cotton: "X 1/1 white Halfling creature tokens and X Food tokens": a predefined token after one.
    // Fae Offering: "a Clue token, a Food token, and a Treasure token".
    // Reckoner Bankbuster: "a Treasure token and a 1/1 colorless Pilot creature token with "..."": only split before the
    // quoted ability, the last token's.
    const q = m[1]!.indexOf('"');
    const parts = (q < 0 ? m[1]! : m[1]!.slice(0, q)).split(/,? and (?=(?:an?|one|two|three|four|five|X) (?:\d+\/\d+ |[A-Z][a-z]+ tokens?$))|, (?=(?:an?|one|two|three|four|five) \d+\/\d+ )|, (?=an? [A-Z][a-z]+ token,)/);
    if (q >= 0) parts[parts.length - 1] += m[1]!.slice(q);
    // Not "your choice of a Clue token, a Food token, or a Treasure token" (The Third Doctor): one of them.
    if (parts.length >= 2 && !/^your choice of /.test(m[1]!) && parts.every((x) => / tokens?(?: with .+)?$/.test(x))) {
      const fx = parts.map((x) => parseSentence(`Create ${x}`, ctx));
      if (fx.some((x) => x?.length !== 1 || x[0]!.type !== "createToken" || x[0]!.attacking || x[0]!.attackingEach || x[0]!.attachTo)) return null;
      return [{ type: "together", effects: fx.map((x) => x![0]!) }];
    }
  }
  // "Create a Food token or a Treasure token" (Tireless Provisioner): one of the two predefined tokens, chosen as it
  // resolves (Effect "either").
  // "Create your choice of a Blood token, a Clue token, or a Food token" (Transmutation Font): the same, of three.
  if ((m = /^[Cc]reate (an? [A-Z][a-z]+ token) or (an? [A-Z][a-z]+ token)$/.exec(s) ?? /^[Cc]reate your choice of (an? [A-Z][a-z]+ token), (an? [A-Z][a-z]+ token),? or (an? [A-Z][a-z]+ token)$/.exec(s))) {
    const names = m.slice(1).filter((x): x is string => !!x);
    const fx = names.map((x) => parseSentence(`Create ${x}`, ctx));
    if (fx.some((x) => !x || x.length !== 1 || x[0]!.type !== "createToken")) return null;
    return [{ type: "either", options: fx as Effect[][], labels: names.map((x) => `Create ${x}`) }];
  }

  // Tokens, maybe "tapped and attacking" (CR 508.4): "Create a tapped and attacking 1/1 red Warrior creature
  // token", "Create two 1/1 white Soldier creature tokens with haste that are tapped and attacking".
  // Another player can create them: "Target opponent creates three 2/2 white Knight creature tokens", "each opponent
  // creates ..." (Hunted Dragon, Forbidden Orchard): that player creates and controls them (CR 111.2). "You create" after
  // another player's instruction (No Way Out) is the plain "create".
  // "... creature token with flying and haste named Hornet" (Hornet Cannon), "... tokens named Cadet": that name rather than
  // its subtypes (CR 111.4).
  // "An X/X green Ooze creature token": X is the spell's or ability's own, or defined by "where X is ..." (body.ts defineX).
  // "For each opponent, create a 1/1 black Ninja creature token that's tapped and attacking that player" (Endless Foot
  // Assault, Veteran Soldier): one group for each opponent, each attacking that opponent (CR 508.4), all at once.
  // "... attacking that player or a planeswalker they control" (Adeline): which one is chosen as they enter (rulings).
  if ((m = /^[Ff]or each opponent, (?:you )?(create .+? that(?:'s| are) tapped and attacking) that (?:player|opponent)( or a planeswalker they control)?$/.exec(s))) {
    const fx = parseSentence(`C${m[1]!.slice(1)}`, ctx);
    const tok = fx?.length === 1 ? fx[0] : undefined;
    if (tok?.type !== "createToken" || !tok.attacking || tok.who.ref !== "you") return null;
    return [{ ...tok, attacking: undefined, tapped: true, attackingEach: true, ...(m[2] ? { orPlaneswalker: true as const } : {}) }];
  }
  // "... creature token named Ajani's Pridemate with "Whenever you gain life, ..."" (Ajani, Strength of the Pride): the
  // same as with the name last.
  // "... token named Lightning Rager with trample, haste, and "..."" (Rite of the Raging Storm) likewise.
  if ((m = /^(.+? creature tokens?) named ([A-Z][\w'-]*(?: [A-Z][\w'-]*)*) with (.+)$/.exec(s))) return parseSentence(`${m[1]} with ${m[3]} named ${m[2]}`, ctx);
  // "... creature token with trample that's all colors" (Mechtitan Core, Reliquary Dragon): white, blue, black, red and
  // green (CR 105.1), whatever its other words say.
  if ((m = /^((?:.+? creates|(?:You )?[Cc]reate) .+? creature tokens?(?: with [^"]+?)?(?: named [^"]+?)?) that's all colors$/.exec(s))) {
    const fx = parseSentence(m[1]!, ctx);
    const tok = fx?.length === 1 ? fx[0] : undefined;
    return tok?.type === "createToken" && !tok.token.back ? [{ ...tok, token: { ...tok.token, colors: ["W", "U", "B", "R", "G"] } }] : null;
  }
  // "Create a black Spirit creature token. Its power is equal to that creature's power and its toughness is equal to that
  // creature's toughness" (body.ts joins them): fixed as it's created, from that creature as it last existed on the
  // battlefield (rulings on Broken Visage, Kalitas) or that card as it last existed in the graveyard (Ritual of the Returned).
  if ((m = /^([Cc]reate a 0\/0 [a-z]+ [A-Z][a-z]+ creature token) with power and toughness equal to (that creature|that card)'s$/.exec(s))) {
    const fx = parseSentence(m[1]!, ctx);
    const tok = fx?.length === 1 ? fx[0] : undefined;
    const [p, t] = [parseCount(`${m[2]}'s power`, ctx), parseCount(`${m[2]}'s toughness`, ctx)];
    return tok?.type === "createToken" && !tok.pt && p && t ? [{ ...tok, pt: p, ptToughness: t }] : null;
  }
  if ((m = new RegExp(`^(?:(.+?) creates|(?:You )?[Cc]reate) ${NUMX} (tapped (?:and attacking )?)?(\\d+|X)/(\\d+|X) (.+?) creature tokens?(?: with (.+?))?(?: named ([A-Z][\\w'-]*(?: (?:of |the )?[A-Z][\\w'-]*)*))?(?: that(?:'s| are) (tapped(?: and attacking(?: that player)?)?|attacking|blocking that creature))?$`, "i").exec(s))) {
    const xx = m[4] === "X" || m[5] === "X";
    // "An X/1 red Phyrexian Horror creature token" (Urabrask's Forge): only its power is X.
    const xPower = m[4] === "X" && m[5] !== "X";
    if (xx && m[4] !== "X") return null;
    const who = m[1] ? parsePlayer(m[1], ctx) : { ref: "you" as const };
    const token = parseToken(xx ? 0 : Number(m[4]), xx && !xPower ? 0 : Number(m[5]), m[6]!, m[7]);
    const how = `${m[3] ?? ""} ${m[9] ?? ""}`;
    // "That's attacking" (Brimaz): attacking, untapped; "that's blocking that creature": blocking the creature it means.
    const blocking = /blocking that creature/.test(how) ? parseObject("that creature", ctx) : undefined;
    if (/blocking/.test(how) && !blocking) return null;
    // "That's tapped and attacking that player" (Soaring Lightbringer): the player "whenever you attack a player" is about.
    if (/that player/.test(how) && !ctx.eventPlayer) return null;
    const state = { ...(/that player/.test(how) ? { attackingEvent: true as const } : {}), ...(/tapped/.test(how) ? { tapped: true } : {}), ...(/attacking/.test(how) ? { attacking: true } : {}), ...(/attacking/.test(how) && !/tapped/.test(how) ? { untapped: true as const } : {}), ...(blocking ? { blocking } : {}), ...(xx ? { pt: X } : {}), ...(xPower ? { ptPowerOnly: true as const } : {}) };
    const named = m[8] ? { name: m[8], named: true as const } : {};
    return token && who ? [{ type: "createToken", who, n: amt(m[2]!), token: { ...token, ...named }, ...state }] : null;
  }
  // "Create a white Gnome Soldier artifact creature token with "~'s power and toughness are each equal to the number of
  // artifacts and/or creatures you control."" (Thousand Moons Smithy): no printed power and toughness, the quoted
  // characteristic-defining ability sets them (CR 604.3, 613.4a).
  // 'With reach and "..."' (Wrenn and Seven): keywords too.
  if ((m = new RegExp(`^(?:You )?[Cc]reate ${NUMX} (.+?) creature tokens? with (?:([a-z, ]+?),? and )?"(~'s power and toughness are each equal to [^"]+)"$`).exec(s))) {
    const token = parseToken(0, 0, m[2]!, `${m[3] ? `${m[3]} and ` : ""}"${m[4]!}"`);
    return token ? [{ type: "createToken", who: { ref: "you" }, n: amt(m[1]!), token }] : null;
  }
  // A Vehicle token: "create a 3/2 colorless Vehicle artifact token with crew 1" (Mu Yanling, Wind Rider), "a 5/5
  // colorless Vehicle artifact token named Zeppelin with flying and crew 3" (Lita): an artifact, not a creature, with its
  // printed power and toughness (CR 301.7) and crew N (CR 702.122a).
  if ((m = new RegExp(`^(?:You )?[Cc]reate ${NUMX} (\\d+)/(\\d+) colorless Vehicle artifact tokens?(?: named ([A-Z][\\w'-]*))? with (?:([a-z, ]+?),? and )?crew (\\d+)$`).exec(s))) {
    const keywords = m[5] ? parseKeywordList(m[5]) : [];
    if (!keywords) return null;
    const token: TokenSpec = { name: m[4] ?? "Vehicle", ...(m[4] ? { named: true as const } : {}), power: Number(m[2]), toughness: Number(m[3]), colors: [], types: ["Artifact"], subtypes: ["Vehicle"], keywords, abilities: `Crew ${m[6]}` };
    return [{ type: "createToken", who: { ref: "you" }, n: amt(m[1]!), token }];
  }
  // A named noncreature token with an ability of its own: "create eight colorless snow artifact tokens named Replicated Ring
  // with "{T}: Add one mana of any color."" (Replicating Ring, CR 111.4).
  // Roxanne, Starfall Savant: "create a tapped colorless artifact token named Meteorite with "When this token enters, it
  // deals 2 damage to any target" and "{T}: Add one mana of any color."": two abilities, entering tapped.
  // Blacksmith's Talent: "create a colorless Equipment artifact token named Sword with "Equipped creature gets +1/+1" and
  // equip {2}": an Equipment with the keyword too (CR 702.6a).
  // Kibo, Uktabi Prince: "Each player creates a colorless artifact token named Banana with "..."": each their own.
  if ((m = new RegExp(`^(?:(.+?) creates|(?:You )?[Cc]reate) ${NUMX} (tapped )?colorless (snow )?(Equipment )?artifact tokens? named ((?:[A-Z][\\w'-]*)(?: [A-Z][\\w'-]*)*) with "([^"]+)"(?: and "([^"]+)")?(?: and equip (\\{\\d+\\}))?$`).exec(s))) {
    const texts = [m[7]!, ...(m[8] ? [m[8]] : [])].map((x) => x.replace(/^([^.]*[^.])$/, "$1."));
    if (m[9] && !m[5]) return null;
    const who = m[1] ? parsePlayer(m[1], ctx) : { ref: "you" as const };
    const token: TokenSpec = { name: m[6]!, named: true, colors: [], types: ["Artifact"], subtypes: m[5] ? ["Equipment"] : [], keywords: [], abilities: [...texts, ...(m[9] ? [`Equip ${m[9]}`] : [])].join("\n"), ...(m[4] ? { snow: true as const } : {}) };
    return who && texts.every((x) => compileQuoted(x)) ? [{ type: "createToken", who, n: amt(m[2]!), token, ...(m[3] ? { tapped: true as const } : {}) }] : null;
  }
  // Farid, Enterprising Salvager: "create a colorless artifact token named Scrap": its name and type only, no abilities
  // (rulings, CR 111.4).
  if ((m = /^(?:You )?[Cc]reate a colorless artifact token named ([A-Z][\w'-]*)$/.exec(s))) {
    const token: TokenSpec = { name: m[1]!, named: true, colors: [], types: ["Artifact"], subtypes: [], keywords: [] };
    return [{ type: "createToken", who: { ref: "you" }, n: 1, token }];
  }
  // Setzer, Wandering Gambler: "create The Blackjack, a legendary 3/3 colorless Vehicle artifact token with flying and crew
  // 2": a named legendary Vehicle (CR 111.4, 205.4d, 301.7, 702.122a).
  if ((m = /^(?:You )?[Cc]reate ((?:The )?[A-Z][\w'-]*(?: [A-Z][\w'-]*)*), a legendary (\d+)\/(\d+) colorless Vehicle artifact token with (?:([a-z, ]+?),? and )?crew (\d+)$/.exec(s))) {
    const keywords = m[4] ? parseKeywordList(m[4]) : [];
    if (!keywords) return null;
    const token: TokenSpec = { name: m[1]!, named: true, legendary: true, power: Number(m[2]), toughness: Number(m[3]), colors: [], types: ["Artifact"], subtypes: ["Vehicle"], keywords, abilities: `Crew ${m[5]}` };
    return [{ type: "createToken", who: { ref: "you" }, n: 1, token }];
  }
  // Overlord of the Hauntwoods: "create a tapped colorless land token named Everywhere that is every basic land type": a
  // Plains, Island, Swamp, Mountain and Forest, with each one's mana ability (CR 305.6), but not basic (rulings).
  if ((m = /^(?:You )?[Cc]reate a (tapped )?colorless land token named ([A-Z][\w'-]*) that is every basic land type$/.exec(s))) {
    const token: TokenSpec = { name: m[2]!, named: true, colors: [], types: ["Land"], subtypes: [...BASIC_TYPES], keywords: [] };
    return [{ type: "createToken", who: { ref: "you" }, n: 1, token, ...(m[1] ? { tapped: true } : {}) }];
  }
  // Mutable Explorer: "create a tapped Mutavault token": a copy of the card Mutavault (rulings), a land with its two
  // abilities and no mana cost (CR 111.4, 707.2).
  if ((m = /^(?:You )?[Cc]reate a (tapped )?Mutavault token$/.exec(s))) {
    const token: TokenSpec = { name: "Mutavault", named: true, colors: [], types: ["Land"], subtypes: [], keywords: [], abilities: "{T}: Add {C}.\n{1}: This token becomes a 2/2 creature with all creature types until end of turn. It's still a land." };
    return [{ type: "createToken", who: { ref: "you" }, n: 1, token, ...(m[1] ? { tapped: true } : {}) }];
  }
  // Mabel, Heir to Cragflame: "create Cragflame, a legendary colorless Equipment artifact token with "Equipped creature gets
  // +1/+1 and has vigilance, trample, and haste" and equip {2}": a named legendary Equipment (CR 111.4, 205.4d, 702.6a).
  if ((m = /^(?:You )?[Cc]reate ([A-Z][\w'-]*(?: (?:the |of the |of )?[A-Z][\w'-]*)*), a legendary (colorless|white|blue|black|red|green) Equipment artifact token with "([^"]+)" and equip (\{\d+\})$/.exec(s))) {
    const text = m[3]!.replace(/^([^.]*[^.])$/, "$1.");
    const colors = m[2] === "colorless" ? [] : [COLOR_WORDS[m[2]!]!];
    const token: TokenSpec = { name: m[1]!, named: true, legendary: true, colors, types: ["Artifact"], subtypes: ["Equipment"], keywords: [], abilities: `${text}\nEquip ${m[4]!}` };
    return compileQuoted(text) ? [{ type: "createToken", who: { ref: "you" }, n: 1, token }] : null;
  }
  // Nahiri, the Lithomancer: "Create a colorless Equipment artifact token named Stoneforged Blade. It has indestructible,
  // "Equipped creature gets +5/+5 and has double strike," and equip {0}." (joined into one sentence by parseBody): a named
  // Equipment token with a keyword, a quoted ability and equip (CR 111.4, 702.6a).
  if ((m = /^(?:You )?[Cc]reate a colorless Equipment artifact token named ([A-Z][\w'-]*(?: [A-Z][\w'-]*)*) with ([a-z]+), "([^"]+?),?" and equip (\{\d+\})$/.exec(s))) {
    const text = m[3]!.replace(/^([^.]*[^.])$/, "$1.");
    const kw = canonicalKeyword(m[2]!);
    if (!kw || !(SUPPORTED_KEYWORDS as readonly string[]).includes(kw)) return null;
    const token: TokenSpec = { name: m[1]!, named: true, colors: [], types: ["Artifact"], subtypes: ["Equipment"], keywords: [kw], abilities: `${text}\nEquip ${m[4]!}` };
    return compileQuoted(text) ? [{ type: "createToken", who: { ref: "you" }, n: 1, token }] : null;
  }
  // A named legendary token (CR 111.4, 205.4d): "Create Ragavan, a legendary 2/1 red Monkey creature token", "create The
  // Atropal, a legendary 4/4 black God Horror creature token with deathtouch". In its quoted abilities the token's name
  // means the token itself ("When Smaug dies, ...").
  // Bonny Pall: "create Beau, a legendary blue Ox creature token with "Beau's power and toughness are each equal to ..."":
  // no printed power and toughness, which its characteristic-defining ability sets (CR 604.3).
  // Tolsimir, Friend to Wolves: "create Voja, Friend to Elves, a legendary 3/3 ... token": a name with a comma; Nissa, Sage
  // Animist's "Ashaya, the Awoken World" too.
  if ((m = /^(?:(.+?) creates|(?:You )?[Cc]reate) ((?:The )?[A-Z][\w'-]*(?: (?:the |of the |of )?[A-Z][\w'-]*)*(?:, (?:the )?[A-Z][\w'-]*(?: (?:the |of the |of |to )?[A-Z][\w'-]*)*)?), a legendary (?:(\d+)\/(\d+) )?(.+?) creature token(?: with (.+?))?( that's tapped and attacking)?$/.exec(s))) {
    if (m[3] === undefined && !/^"[^"]*'s power and toughness are each equal to [^"]+"$/.test(m[6] ?? "")) return null;
    const name = m[2]!;
    const who = m[1] ? parsePlayer(m[1], ctx) : { ref: "you" as const };
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const withText = m[6]?.replace(/"[^"]*"/g, (q) => q.replace(new RegExp(`(^"|\\. )?\\b${esc}\\b`, "g"), (_, start?: string) => (start ? `${start}This creature` : "this creature")));
    const token = parseToken(Number(m[3] ?? 0), Number(m[4] ?? 0), m[5]!, withText);
    // Kari Zev, Skyship Raider: "... token. Ragavan enters tapped and attacking." (read as "that's tapped and attacking").
    return token && who ? [{ type: "createToken", who, n: 1, token: { ...token, name, named: true, legendary: true }, ...(m[7] ? { tapped: true as const, attacking: true as const } : {}) }] : null;
  }
  // "For each token you control, create a token that's a copy of that permanent" (Second Harvest), "For each creature
  // target player controls, create a token that's a copy of that creature" (Clone Legion): one copy of each of them.
  // "For each creature token you control that entered this turn, create a tapped and attacking token that's a copy of that
  // token" (Redoubled Stormsinger): each one attacking whom its controller chooses (CR 508.4, rulings).
  // "For each creature card in your graveyard, create a token that's a copy of it, except it's a 1/1 black and green
  // Insect" (Grist, the Plague Swarm): of each of those cards as it is there (CR 707.2), all at once.
  if ((m = /^[Ff]or each ([a-z]+) card in your graveyard, create a token that's a copy of it(?:, except (.+))?$/.exec(s))) {
    const filter = parseSearchFilter(`${m[1]!} card`);
    const except = m[2] ? parseCopyExcept(m[2]) : undefined;
    if (!filter || except === null) return null;
    return [{ type: "createTokenCopy", who: { ref: "you" }, n: 1, what: { ref: "yourGraveyard", filter }, each: true, ...(except ? { except } : {}) }];
  }
  if ((m = /^[Ff]or each (.+?), create a (tapped and attacking )?token that's a copy of (?:that (?:creature|permanent|artifact|token)|it)(?:, except (.+))?$/.exec(s))) {
    const what = parseObject(`each ${m[1]!}`, ctx);
    const except = m[3] ? parseCopyExcept(m[3]) : undefined;
    if (!what || what.ref !== "each" || except === null) return null;
    return [{ type: "createTokenCopy", who: { ref: "you" }, n: 1, what, each: true, ...(except ? { except } : {}), ...(m[2] ? { tapped: true, attacking: true } : {}) }];
  }
  // Doppelgang: "For each of X target permanents, create X tokens that are copies of that permanent": that many copies of
  // each of them, all created at once.
  if ((m = new RegExp(`^[Ff]or each of (X|two|three) target ([a-z]+s), create ${NUMX} tokens that are copies of that (?:creature|permanent|artifact)$`).exec(s))) {
    const what = parseObject(`${m[1]} target ${m[2]}`, ctx);
    if (what?.ref !== "target" || what.n === undefined || what.card) return null;
    return [{ type: "createTokenCopy", who: { ref: "you" }, n: amt(m[3]!), what, each: true }];
  }
  // Token copies (CR 707.2, 111.4): "Create a token that's a copy of target creature you control, except it
  // isn't legendary", "create two tokens that are copies of ~", "its controller creates a token that's a copy of it".
  if ((m = new RegExp(`^(?:(.+?) creates|(?:You )?[Cc]reate) ${NUMX} (tapped (?:and attacking (?:that player )?)?)?tokens? that(?:'s| are) (?:a copy|copies) of (.+?)(?:, except (.+))?$`, "i").exec(s))) {
    if (m[3]?.includes("that player") && !ctx.eventPlayer) return null;
    const who = m[1] ? parsePlayer(m[1], ctx) : { ref: "you" as const };
    // "A copy of it" after "exile target creature card from a graveyard": that card, now in exile (The Scarab God).
    const cardTargets = ctx.targets.flatMap((t, i) => (t.kind === "card" && !t.many ? [i] : []));
    const ofCard = /^(?:it|that card)$/.test(m[4]!) && ctx.lastObjectTarget === undefined && !ctx.lastCreated && cardTargets.length === 1 && cardTargets[0] === ctx.targets.length - 1;
    // "A copy of a card exiled with ~" (Mimic Vat): one of the cards linked to this object (CR 607.2a).
    const linkedCard = m[4] === "a card exiled with ~" && !ctx.spell;
    // "Copies of the sacrificed creature" (Cleaver Skaab): of the one sacrificed for the cost, as it last existed, copy
    // effects included (CR 707.2, rulings).
    const sacrificed = /^the sacrificed (?:creature|artifact|permanent)$/.test(m[4]!);
    // "A copy of the exiled card" after "you may exile an artifact or creature card from your hand. If you do" (Nexus of
    // Becoming): that card, copied as it is in exile (CR 707.2).
    const fromHand = ctx.mayExiledFromHand && /^(?:the exiled card|it|that card)$/.test(m[4]!);
    const what0 = fromHand ? { ref: "exiledFromHand" as const } : ofCard ? { ref: "target" as const, index: cardTargets[0]!, card: true as const } : linkedCard ? { ref: "linkedCard" as const } : sacrificed ? { ref: "sacrificed" as const } : parseObject(m[4]!, ctx, /\bcard\b/.test(m[4]!) && /^target /.test(m[4]!));
    // "A copy of that card" about a creature that died (Myrkul, Lord of Bones): of the card, not of the creature it was
    // as it last existed (rulings).
    const what = what0?.ref === "subjectCard" && m[4] === "that card" ? { ...what0, printed: true as const } : what0;
    const except = m[5] ? parseCopyExcept(m[5], ctx.halfRound) : undefined;
    if (!who || !what || except === null || isGroup(what)) return null;
    const state = { ...(m[3] ? { tapped: true } : {}), ...(m[3] && /attacking/.test(m[3]) ? { attacking: true } : {}), ...(m[3]?.includes("that player") ? { attackingEvent: true as const } : {}) };
    // "A copy of each of any number of target creatures" (Twinflame): one of each of them.
    const each = what.ref === "target" && what.n !== undefined && !what.card;
    if (each && amt(m[2]!) !== 1) return null;
    return [{ type: "createTokenCopy", who, n: amt(m[2]!), what, ...(each ? { each: true as const } : {}), ...(except ? { except } : {}), ...state }];
  }
  // "For each opponent, create a tapped token that's a copy of the exiled card attacking that opponent" (Mardu
  // Siegebreaker): one copy for each opponent of the card its exile ability exiled (CR 607.2a, linkExile), each attacking
  // that opponent (CR 508.4) if it's a creature (CR 506.3a) and this player's combat.
  if (!ctx.spell && /^[Ff]or each opponent, create a tapped token that's a copy of the exiled card attacking that opponent$/.test(s))
    return [{ type: "createTokenCopy", who: { ref: "you" }, n: 1, what: { ref: "linkedCard" }, tapped: true, attackingEach: true }];
  // "Whenever ~ attacks a player, for each other opponent, create a token that's a copy of ~ tapped and attacking that
  // player, except it isn't legendary" (Shredder): myriad's tokens (CR 702.116a), each opponent but the defending player,
  // with no "may".
  if (ctx.defending && (m = /^[Ff]or each other opponent, create a token that's a copy of ~ (?:that's )?tapped and attacking that player(?:, except (.+))?$/.exec(s))) {
    const except = m[1] ? parseCopyExcept(m[1]) : undefined;
    return except === null ? null : [{ type: "myriad", must: true, ...(except ? { except } : {}) }];
  }
  // "Sacrifice them at the beginning of the next end step" / "Exile it ...": about the tokens just created.
  // Firion: "Sacrifice that token at the beginning of the next upkeep": the next one to begin, whoever's turn (CR 603.7).
  if (ctx.lastCreatedAny && (m = /^(Sacrifice|Exile) (?:it|them|the tokens?|that token|those tokens) at (the beginning of (?:the|your) next end step|end of combat|the beginning of the next cleanup step|the beginning of the next upkeep|the beginning of your next upkeep)$/i.exec(s))) {
    const verb = m[1]!.toLowerCase();
    // Force of Rage: "Sacrifice those tokens at the beginning of your next upkeep": yours, in a later turn (CR 603.7).
    const when = m[2] === "end of combat" ? "endOfCombat" : /cleanup/.test(m[2]!) ? "nextCleanup" : /your next upkeep/.test(m[2]!) ? "yourNextUpkeep" : /upkeep/.test(m[2]!) ? "nextTurnUpkeep" : /your next/.test(m[2]!) ? "yourNextEndStep" : "nextEndStep";
    return [{ type: "delayed", when, each: "created", effects: [verb === "exile" ? { type: "exile", what: { ref: "subject" } } : { type: "sacrifice", what: { ref: "subject" } }], text: `${verb} ~` }];
  }
  // "Incubate 2 five times" (The Argent Etchings): one incubate after another (CR 701.53a).
  // Glistening Dawn: "Incubate X twice, where X is the number of lands you control": X each time.
  if ((m = /^Incubate (\d+|X) (twice|three times|four times|five times)$/.exec(s))) {
    const times = { twice: 2, "three times": 3, "four times": 4, "five times": 5 }[m[2]!]!;
    return Array.from({ length: times }, () => ({ type: "createToken" as const, who: { ref: "you" as const }, n: 1, token: INCUBATOR, counters: { counter: "+1/+1" as const, n: amt(m![1]!) } }));
  }
  // "Incubate 3 X times" (Progenitor Exarch): X incubates, one after another.
  if ((m = /^[Ii]ncubate (\d+) X times$/.exec(s))) return [{ type: "repeat", n: X, effects: [{ type: "createToken", who: { ref: "you" }, n: 1, token: INCUBATOR, counters: { counter: "+1/+1", n: Number(m[1]) } }] }];
  // Incubate N (CR 701.53a): an Incubator token that enters with N +1/+1 counters on it. "Its controller incubates X".
  if ((m = new RegExp(`^(?:(.+?) )?[Ii]ncubates? ${NUMX}$`).exec(s))) {
    const who = m[1] ? parsePlayer(m[1], ctx) : { ref: "you" as const };
    if (!who) return null;
    return [{ type: "createToken", who, n: 1, token: INCUBATOR, counters: { counter: "+1/+1", n: amt(m[2]!) } }];
  }
  // Role tokens (CR 111.10j-r, 303.7): "Create a Monster Role token attached to target creature you control", "... attached
  // to it". "For each creature your opponents control, create a Cursed Role token attached to that creature": one each.
  const ROLES = Object.keys(ROLE_TOKENS).join("|");
  if ((m = new RegExp(`^(?:[Ff]or each (.+?), create|[Cc]reate) an? (${ROLES}) Role token attached to (.+)$`).exec(s))) {
    const token = ROLE_TOKENS[m[2]!]!;
    if (m[1]) {
      // The group the sentence goes through; "that creature", "it", "that Rat" are each one of it.
      if (!/^(?:that (?:creature|[A-Z][a-z]+)|it)$/.test(m[3]!)) return null;
      const those = /^of (?:those|these) /.test(m[1]);
      const what = parseObject(those ? m[1].slice(3) : `each ${m[1]}`, ctx);
      return what && (isGroup(what) || those) ? [{ type: "createToken", who: { ref: "you" }, n: 1, token, attachTo: what }] : null;
    }
    const what = parseObject(m[3]!, ctx);
    return what && !isGroup(what) ? [{ type: "createToken", who: { ref: "you" }, n: 1, token, attachTo: what }] : null;
  }
  // Predefined tokens (CR 111.10): "Create a Treasure token", "Its controller creates two Treasure tokens"
  if ((m = new RegExp(`^(?:(.+?) creates?|Create) ${NUMX} (tapped )?(${Object.keys(PREDEFINED_TOKENS).join("|")}) tokens?$`, "i").exec(s))) {
    const who = m[1] ? parsePlayer(m[1], ctx) : { ref: "you" as const };
    const token = PREDEFINED_TOKENS[m[4]!.charAt(0).toUpperCase() + m[4]!.slice(1).toLowerCase()];
    return who && token ? [{ type: "createToken", who, n: amt(m[2]!), token, ...(m[3] ? { tapped: true } : {}) }] : null;
  }
  // "Draw a card at the beginning of the next turn's upkeep" (a delayed trigger, CR 603.7).
  // "Transform ~ at the beginning of the next upkeep" (Archangel Avacyn): it transforms then only if it hasn't transformed
  // since the delayed trigger was made (CR 701.27f).
  // "Counter target spell. At the beginning of your next main phase, add an amount of {C} equal to that spell's mana
  // value." (Mana Drain): the amount is that spell's mana value as this resolves (CR 608.2h), remembered by the delayed
  // trigger; it triggers at the next main phase of yours to begin (rulings).
  // Plasm Capture: "At the beginning of your next first main phase, add X mana in any combination of colors, where X is
  // that spell's mana value": your next precombat main phase to begin (rulings), X its mana value with the X it was cast
  // with (CR 202.3e), remembered the same way.
  if ((m = /^At the beginning of your next (first )?main phase, (add .+)$/.exec(s))) {
    const before = ctx.targets.length;
    const when = m[1] ? "yourNextFirstMain" : "yourNextMain";
    const inner = parseSentence(m[2]!.replace(/^./, (c) => c.toUpperCase()), ctx);
    const add = inner?.length === 1 ? inner[0] : undefined;
    if (add?.type !== "addMana" || ctx.targets.length !== before) return null;
    if (add.times === undefined || typeof add.times === "number") return [{ type: "delayed", when, effects: inner!, text: m[2]! }];
    return [{ type: "delayed", when, effects: [{ ...add, times: { count: { kind: "eventAmount" } } }], text: m[2]!, event: { amount: add.times } }];
  }
  // "Its controller may draw up to two cards at the beginning of the next turn's upkeep" (Arcane Denial): the countered
  // spell's controller as this resolves (CR 608.2h), remembered by the delayed trigger as its event player.
  if ((m = /^(Its controller|That spell's controller) (.+) at the beginning of the next (?:turn's )?upkeep$/.exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    const before = ctx.targets.length;
    const inner = who && parseSentence(`That player ${m[2]!}`, { ...ctx, eventPlayer: true, lastPlayerTarget: undefined, chosenOpponent: undefined, controllerNamed: undefined });
    if (!who || !inner || ctx.targets.length !== before || allEffects(inner).some((y) => "what" in y || ("who" in y && (y.who as { ref: string }).ref !== "eventPlayer"))) return null;
    return [{ type: "delayed", when: "nextTurnUpkeep", effects: inner, text: `${m[1]!} ${m[2]!}`, event: { player: who } }];
  }
  if ((m = /^(.+) at the beginning of the next (?:turn's )?upkeep$/.exec(s))) {
    // Only what needs no targets or objects: the delayed ability has none of its own.
    const before = ctx.targets.length;
    const inner = parseSentence(m[1]!.replace(/^./, (c) => c.toUpperCase()), ctx);
    const selfTransform = (y: Effect) => y.type === "transform" && y.what.ref === "self" && !ctx.spell;
    if (!inner || ctx.targets.length !== before || allEffects(inner).some((y) => ("what" in y && !selfTransform(y)) || ("who" in y && (y.who as { ref: string }).ref !== "you"))) return null;
    return [{ type: "delayed", when: "nextTurnUpkeep", effects: inner, text: m[1]! }];
  }
  // Time travel (CR 701.56a): "Time travel three times" (The Tenth Doctor) is three time travel actions, one after another.
  if (/^Time travel$/i.test(s)) return [{ type: "timeTravel" }];
  if ((m = /^Time travel (twice|three times)$/i.exec(s))) return [{ type: "repeat", n: m[1] === "twice" ? 2 : 3, effects: [{ type: "timeTravel" }] }];
  // Proliferate (CR 701.27), amass (CR 701.47).
  if (/^Proliferate$/i.test(s)) return [{ type: "proliferate" }];
  if (/^Proliferate twice$/i.test(s)) return [{ type: "proliferate", twice: true }];
  // "Proliferate X times, where X is ..." (Tromell, Seymour's Butler): X separate proliferate actions; X is defined by the
  // text (defineX in body.ts), never the X announced.
  // On a spell with {X} in its cost ("Proliferate X times.", Expansion Algorithm), the X announced (CR 107.3a).
  if (/^Proliferate X times$/.test(s) && (ctx.whereX || ctx.spell)) return [{ type: "proliferate", n: amt("X") }];
  // Populate (CR 701.36): copy a creature token you control, not targeted; with none, nothing happens.
  if (/^Populate$/i.test(s)) return [{ type: "pick", who: { ref: "you" }, filter: { kind: "object", types: ["Creature"], token: true, text: "creature token" }, n: 1, action: "populate" }];
  // Full Flowering: "Populate X times": one populate after another, each able to copy a token an earlier one made.
  if (/^Populate X times$/i.test(s) && ctx.spell) return [{ type: "repeat", n: X, effects: [{ type: "pick", who: { ref: "you" }, filter: { kind: "object", types: ["Creature"], token: true, text: "creature token" }, n: 1, action: "populate" }] }];
  if ((m = new RegExp(`^[Aa]mass ([A-Z][a-z]+) ${NUMX}$`).exec(s))) return [{ type: "amass", subtype: singularWord(m[1]!), n: amt(m[2]!) }];
  // Blink: "Exile target creature you control, then return it to the battlefield under its owner's control".
  // "Exile ~, then return it to the battlefield transformed under your control" (a Saga's last chapter): with its back
  // face up if it's a double-faced card (CR 712.14a).
  // "... under its owner's control with a +1/+1 counter on it" (Planar Incision): it enters with it (CR 122.6).
  // "Exile target nonland permanent, then return it to the battlefield tapped under its owner's control" (Eldrazi
  // Confluence): it enters tapped.
  // "Exile this Saga, then return it to the battlefield (front face up)" (The Great Synthesis): under your control, since
  // you put it there (CR 110.2a), front face up (CR 712.14a).
  if (/^[Ee]xile ~, then return it to the battlefield$/.test(s)) return [{ type: "flicker", what: { ref: "self" }, under: "you" }];
  if ((m = /^Exile (.+?),? then return (?:it|that card|them|those cards) to the battlefield( transformed| tapped)? under (its owner's|their owner's|their owners'|your) control(?: with an? (\+1\/\+1) counter on it)?$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    if (m[2] === " transformed" && what?.ref !== "self") return null;
    return what && !isGroup(what) ? [{ type: "flicker", what, under: m[3] === "your" ? "you" : "owner", ...(m[2] === " transformed" ? { transformed: true as const } : {}), ...(m[2] === " tapped" ? { tapped: true as const } : {}), ...(m[4] ? { counter: "+1/+1" as const } : {}) }] : null;
  }
  // Investigate (CR 701.16): create a Clue token.
  // "Investigate an additional time" (Erdwal Illuminator): once more.
  if ((m = /^Investigate( twice| X times| (?:three|four|five) times| an additional time)?$/i.exec(s))) return [{ type: "createToken", who: { ref: "you" }, n: m[1] === " X times" ? X : m[1] === " twice" ? 2 : m[1] && m[1] !== " an additional time" ? num(m[1].trim().split(" ")[0]!) : 1, token: PREDEFINED_TOKENS.Clue!, investigate: true }];
  // "Investigate once for each opponent who has more cards in hand than you" (Wojek Investigator): counted as it resolves.
  if ((m = /^Investigate (?:once )?for each (.+)$/i.exec(s))) {
    const n = parseCount(m[1]!, ctx, true);
    return n ? [{ type: "createToken", who: { ref: "you" }, n, token: PREDEFINED_TOKENS.Clue!, investigate: true }] : null;
  }
  // "Destroy target creature or planeswalker. Its controller investigates." (Fateful Absence): the player named, as in
  // "Its controller creates a ..." (the destroyed permanent's last controller, CR 608.2h).
  if ((m = /^(.+?) investigates$/i.exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    return who ? [{ type: "createToken", who, n: 1, token: PREDEFINED_TOKENS.Clue!, investigate: true }] : null;
  }
  // "That player investigates for each nontoken creature exiled this way" (Declaration in Stone).
  if ((m = /^(.+?) investigates for each (.+)$/i.exec(s))) {
    const who = parsePlayer(m[1]!, ctx);
    const n = parseCount(m[2]!, ctx, true);
    return who && n ? [{ type: "createToken", who, n, token: PREDEFINED_TOKENS.Clue!, investigate: true }] : null;
  }
  // Explore (CR 701.44)
  if (/^~ explores$/.test(s)) return [{ type: "explore" }];
  // Jadelight Spelunker: "When ~ enters, it explores X times": X explores one after another (CR 701.44), X as it was cast.
  if (/^(?:~|it) explores X times$/i.test(s) && (ctx.selfIt || /^~/.test(s)) && !ctx.spell) return [{ type: "repeat", n: X, effects: [{ type: "explore" }] }];
  // "Target creature you control explores" (a Map token, CR 111.10s): its controller is you.
  if ((m = /^(target creature you control|it|that creature) explores$/i.exec(s))) {
    const what = parseObject(m[1]!, ctx);
    return what && !isGroup(what) && what.ref !== "self" ? [{ type: "explore", what }] : what?.ref === "self" ? [{ type: "explore" }] : null;
  }
  // "Each Merfolk creature you control explores" (Hakbal of the Surging Soul): each of them, one after another.
  if ((m = /^each ((?:[A-Z][a-z]+ )?creature you control) explores$/i.exec(s))) {
    const what = parseObject(`each ${m[1]!}`, ctx);
    return what && isGroup(what) ? [{ type: "exploreEach", what }] : null;
  }
  return undefined;
}
