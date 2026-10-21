// Round 108's prompts: Seize the Spotlight's Fame and Fortune buttons (when an opponent casts it) and the pick of the
// fame player's creature (when you cast it), Delina's "Roll again?" and Ancient Brass Dragon's targets with total mana
// value up to the roll.
import { expect, test } from "@playwright/test";
import { applyAction, botActions, controllerOf, nextRandom, waitingOn, type GameState, type PlayerId } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, modal, resolveUntil } from "./ui";

/** Seed the game's dice so the next d`sides` rolls come out as `values`. */
function rig(s: GameState, sides: number, values: number[]) {
  for (let st = 1; st < 50_000_000; st++) {
    const t = { rngState: st };
    if (values.every((v) => 1 + Math.floor(nextRandom(t) * sides) === v)) {
      s.rngState = st;
      return;
    }
  }
  throw new Error("no such seed");
}

/** Play on in the engine (bots answer their prompts, you pass or attack with `attackers`) until `done`. */
function stepUntil(s: GameState, done: (s: GameState) => boolean, attackers: [string, PlayerId][] = []): GameState {
  for (let i = 0; i < 300; i++) {
    if (done(s)) return s;
    const pid = waitingOn(s)!;
    if (s.pending?.kind === "declareAttackers" && pid === 0) s = applyAction(s, { type: "declareAttackers", player: 0, attacks: attackers.map(([attacker, defender]) => ({ attacker, defender })) });
    else if (pid !== 0) s = applyAction(s, botActions(s, pid)[0]!);
    else if (!s.pending) s = applyAction(s, { type: "passPriority", player: 0 });
    else throw new Error(`stepUntil: a ${s.pending.kind} prompt for you`);
  }
  throw new Error("stepUntil: never got there");
}

test("Seize the Spotlight cast by Ana: choose Fortune with its button; she draws a card and makes a Treasure", async ({ page }) => {
  // Ana's bot casts it in her main phase.
  let s: GameState = scene({}, [{ hand: ["Seize the Spotlight"], board: LANDS }]);
  s = stepUntil(s, (st) => st.pending?.kind === "chooseOption" && st.pending.player === 0);
  const hand = s.players[1]!.hand.length;
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Seize the Spotlight:");
  await expect(bar.getByRole("button", { name: "Fame" })).toBeVisible();
  await bar.getByRole("button", { name: "Fortune" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.players[1]!.hand.length).toBe(hand + 1);
  expect(after.battlefield.some((id) => after.objects[id]!.controller === 1 && after.objects[id]!.isToken && after.cards[after.objects[id]!.cardId]!.name.startsWith("Treasure"))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Seize the Spotlight cast by you: Ana chooses fame, you pick which of her two creatures to take", async ({ page }) => {
  const s = scene({ hand: ["Seize the Spotlight"], board: LANDS }, [{ board: ["Grizzly Bears", "Llanowar Elves"] }, {}, { board: ["Hill Giant"] }]);
  const [bears, elves] = [one(s, "Grizzly Bears"), one(s, "Llanowar Elves")];
  await open(page, s);
  await card(page, "Seize the Spotlight", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  await page.locator(`[data-obj="${bears}"]`).click();
  await controls(page).getByRole("button", { name: /^(Choose|Done|Pick)/ }).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(controllerOf(after, after.objects[bears]!)).toBe(0);
  expect(controllerOf(after, after.objects[elves]!)).toBe(1);
  // Cy has a 3/3, so his bot chose fortune: a Treasure for you.
  expect(after.battlefield.some((id) => after.objects[id]!.controller === 0 && after.objects[id]!.isToken)).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Delina: a 15—20 roll makes a copy and asks Roll again?; Yes rolls once more", async ({ page }) => {
  let s: GameState = scene({ board: ["Delina, Wild Mage", "Grizzly Bears"] }, [{}]);
  const [delina, bears] = [one(s, "Delina, Wild Mage"), one(s, "Grizzly Bears")];
  rig(s, 20, [17, 4]);
  s = stepUntil(s, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0, [[delina, 1]]);
  s = applyAction(s, { type: "chooseTargets", player: 0, targets: [{ kind: "object", id: bears }] });
  s = stepUntil(s, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Delina, Wild Mage: Roll again?");
  await bar.getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.step === "declareAttackers");
  const copies = after.battlefield.filter((id) => after.objects[id]!.isToken && after.cards[after.objects[id]!.cardId]!.name === "Grizzly Bears");
  expect(copies).toHaveLength(2);
  for (const id of copies) expect(after.objects[id]!.attacking).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Ancient Brass Dragon: a roll of 6 lets you pick Grizzly Bears and Hill Giant from graveyards, then Done", async ({ page }) => {
  let s: GameState = scene({ board: ["Ancient Brass Dragon"], yard: ["Grizzly Bears"] }, [{ yard: ["Hill Giant", "Llanowar Elves"] }]);
  const [dragon, bears, giant, elves] = [one(s, "Ancient Brass Dragon"), one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Llanowar Elves")];
  rig(s, 20, [6]);
  s = stepUntil(s, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0, [[dragon, 1]]);
  await open(page, s);
  for (const id of [bears, giant]) await modal(page).locator(`[data-pick="${id}"]`).click();
  await modal(page).getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  for (const id of [bears, giant]) {
    expect(after.objects[id]!.zone).toBe("battlefield");
    expect(controllerOf(after, after.objects[id]!)).toBe(0);
  }
  expect(after.objects[elves]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
