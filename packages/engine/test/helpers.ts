import { applyAction, cardFromScryfall, isRoom, createGame, invalidateCharacteristics, parseTypeLine, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type Color, type GameState, type Modification, type PlayerId, type Step, type TargetChoice } from "../src";

let n = 0;
export function card(name: string, typeLine: string, manaCost = "", extra: Partial<CardDef> = {}): CardDef {
  const colors = [...new Set([...manaCost.matchAll(/[WUBRG]/g)].map((m) => m[0] as Color))];
  return {
    oracleId: `test-${name}-${n++}`,
    name,
    manaCost,
    cmc: 0,
    typeLine,
    ...parseTypeLine(typeLine),
    oracleText: "",
    colors,
    colorIdentity: colors,
    keywords: [],
    ...extra,
  };
}
export const forest = card("Forest", "Basic Land — Forest");
export const plains = card("Plains", "Basic Land — Plains");
export const bear = (extra: Partial<CardDef> = {}) => card(extra.name ?? "Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2", ...extra });
export const commander = (name = "Test Commander") =>
  card(name, "Legendary Creature — Elf", "{1}{G}", { power: "3", toughness: "3" });

/** Four players with 99-card decks of forests and bears. */
export function fourPlayerGame(seed = 42): GameState {
  const deck = () => [...Array.from({ length: 50 }, () => forest), ...Array.from({ length: 49 }, () => bear())];
  return createGame(
    ["Ana", "Ben", "Cy", "Dee"].map((name, i) => ({ name, commander: commander(`Cmdr ${i}`), deck: deck() })),
    seed,
  );
}

export function act(s: GameState, a: Action): GameState {
  return applyAction(s, a);
}

/** Everyone passes until we reach `step` of `active`'s turn. Declares no attacks/blocks along the way. */
export function passUntil(s: GameState, step: Step, active?: PlayerId, max = 2000): GameState {
  for (let i = 0; i < max; i++) {
    if (s.step === step && (active === undefined || s.activePlayer === active)) return s;
    const pid = waitingOn(s)!;
    const pend = s.pending;
    if (pend?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (pend?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (pend?.kind === "pickPermanents" && pend.action === "keepTapped") s = act(s, { type: "pickPermanents", player: pid, ids: [] });
    else if (pend?.kind === "discardToHandSize")
      s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, pend.count) });
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error(`never reached ${step}`);
}

/** Put a fresh copy of `def` onto the battlefield under `pid`, not summoning sick. */
export function putOnBattlefield(s: GameState, pid: PlayerId, def: CardDef, opts: { sick?: boolean; commander?: boolean } = {}) {
  s.cards[def.oracleId] = def;
  const id = `t${s.nextId++}`;
  s.objects[id] = {
    id,
    cardId: def.oracleId,
    owner: pid,
    controller: pid,
    zone: "battlefield",
    timestamp: s.nextTimestamp++,
    tapped: false,
    controlledSinceTurn: opts.sick ? s.turn : -1,
    damage: 0,
    deathtouchDamage: false,
    counters: {},
    isCommander: !!opts.commander,
    isToken: false,
    // A Room put onto the battlefield, not cast, has both doors locked (CR 709.5d).
    ...(isRoom(def) ? { unlocked: [] } : {}),
  };
  s.battlefield.unshift(id);
  invalidateCharacteristics(s);
  return id;
}

export function passAll(s: GameState): GameState {
  const start = s.step;
  const turn = s.turn;
  const stack = s.stack.length;
  for (let i = 0; i < 8 && s.step === start && s.turn === turn && s.stack.length === stack && !s.pending; i++)
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}

export const island = card("Island", "Basic Land — Island");
export const mountain = card("Mountain", "Basic Land — Mountain");
export const plainsCard = card("Plains", "Basic Land — Plains");
export const swamp = card("Swamp", "Basic Land — Swamp");

/** Four players; the active player is in their first main phase with lots of every land and `hand` in hand. */
export function setup(hand: CardDef[], seed = 5) {
  const deck = () => [...Array.from({ length: 60 }, () => forest), ...Array.from({ length: 39 }, () => bear())];
  let s = createGame(["A", "B", "C", "D"].map((name, i) => ({ name, commander: commander(`C${i}`), deck: deck() })), seed);
  s = passUntil(s, "main1");
  const ap = s.activePlayer;
  for (const l of [mountain, mountain, mountain, island, island, island, forest, forest, forest, plainsCard, plainsCard, plainsCard, swamp, swamp])
    putOnBattlefield(s, ap, l);
  const ids = hand.map((c) => {
    const id = putOnBattlefield(s, ap, c);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "hand";
    s.players[ap]!.hand.push(id);
    return id;
  });
  invalidateCharacteristics(s);
  return { s, ap, ids, opp: s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]! };
}

export function cast(s: GameState, pid: PlayerId, id: string, targets?: TargetChoice[], modes?: number[]) {
  const plan = planCast(s, pid, id, targets, modes);
  if (!plan) throw new Error(`can't cast ${s.cards[s.objects[id]!.cardId]!.name}`);
  for (const a of plan) s = act(s, a);
  return passAll(s);
}

export function activate(s: GameState, pid: PlayerId, id: string, index: number, targets?: TargetChoice[]) {
  const plan = planActivate(s, pid, id, index, targets);
  if (!plan) throw new Error("can't activate");
  for (const a of plan) s = act(s, a);
  return passAll(s);
}

/** A resolved-spell style effect, locked onto `ids`, created now. */
export function addEffect(s: GameState, controller: PlayerId, ids: string[], mods: Modification[], duration: "endOfTurn" | "game" = "endOfTurn") {
  s.effects.push({ id: `x${s.nextId++}`, timestamp: s.nextTimestamp++, controller, sourceName: "test", duration, affected: ids, mods });
  invalidateCharacteristics(s);
  return s.effects[s.effects.length - 1]!;
}

export const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
export const target = (id: string): TargetChoice => ({ kind: "object", id });

type Face = { name: string; mana_cost?: string; type_line: string; oracle_text?: string; power?: string; toughness?: string; defense?: string; loyalty?: string; color_indicator?: string[] };
/** A card as Scryfall has it, read the way the card database is built (tools/build-cards.ts). */
export function scry(layout: string, faces: Face[], extra: { keywords?: string[]; color_identity?: string[] } = {}): CardDef {
  const top = layout === "split" || layout === "adventure" || layout === "prepare" ? { mana_cost: faces.map((f) => f.mana_cost ?? "").join(" // ") } : layout === "flip" ? { mana_cost: faces[0]!.mana_cost ?? "" } : {};
  const colors = [...new Set(faces.flatMap((f) => [...(f.mana_cost ?? "").matchAll(/[WUBRG]/g)].map((m) => m[0])))];
  return cardFromScryfall({
    oracle_id: `faces-${n++}`,
    name: faces.map((f) => f.name).join(" // "),
    layout,
    cmc: 0,
    type_line: faces.map((f) => f.type_line).join(" // "),
    color_identity: extra.color_identity ?? colors,
    keywords: extra.keywords ?? [],
    legalities: { commander: "legal" },
    ...top,
    card_faces: faces.map((f) => ({ object: "card_face", mana_cost: "", oracle_text: "", ...f })),
  });
}
