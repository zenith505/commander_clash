// Round 384: The Toymaker's Trap's number buttons (you choose a number, then the opponent who guesses) and its guess
// buttons when Ana's Trap picks you; Quicksilver Fountain asking you, on your upkeep, which land of yours Ana's Fountain
// floods; Fateful Tempest's past or present vote.
import { expect, test } from "@playwright/test";
import { applyAction, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

const asked = (what: string, pid = 0) => (st: GameState) => st.pending?.kind === "chooseOption" && st.pending.what === what && st.pending.player === pid;

test("The Toymaker's Trap: on your upkeep you secretly choose 3, then choose Ana to guess", async ({ page }) => {
  const s0 = scene({ board: ["The Toymaker's Trap"] });
  const trap = one(s0, "The Toymaker's Trap");
  const s = playUntil(s0, asked("toyNumber"));
  const hand = s.players[0]!.hand.length;
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("The Toymaker's Trap: secretly choose a number between 1 and 5");
  for (const n of ["1", "2", "4", "5"]) await expect(bar.getByRole("button", { name: n, exact: true })).toBeVisible();
  await bar.getByRole("button", { name: "3", exact: true }).click();
  await resolveUntil(page, asked("opponent"));
  await expect(bar).toContainText("choose an opponent to guess the number");
  await bar.getByRole("button", { name: "Ana", exact: true }).click();
  // Ana guesses at random; then the number is revealed.
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.log.some((l) => /^Ana guesses [1-5]; You reveals 3/.test(l.text)));
  const guess = Number(/^Ana guesses ([1-5])/.exec(after.log.find((l) => /^Ana guesses/.test(l.text))!.text)![1]);
  expect(after.numbersChosenFor?.[`${trap}@0`]).toEqual([3]);
  if (guess === 3) expect(after.objects[trap]!.zone).toBe("graveyard");
  else {
    expect(after.players[1]!.life).toBe(40 - guess);
    expect(after.players[0]!.hand.length).toBe(hand + 1);
  }
  expect(pageErrors(page)).toEqual([]);
});

test("The Toymaker's Trap: Ana's Trap picks you to guess; you guess 1", async ({ page }) => {
  const s0 = scene({}, [{ board: ["The Toymaker's Trap"] }]);
  const trap = one(s0, "The Toymaker's Trap");
  // Ana chooses a number (a bot), then picks you to guess.
  let s = playUntil(s0, asked("opponent", 1));
  s = applyAction(s, { type: "chooseOption", player: 1, choice: "0" });
  s = playUntil(s, asked("toyGuess"));
  const [life, anaHand] = [s.players[0]!.life, s.players[1]!.hand.length];
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("The Toymaker's Trap: guess which number Ana chose");
  for (const n of ["2", "3", "4", "5"]) await expect(bar.getByRole("button", { name: n, exact: true })).toBeVisible();
  await bar.getByRole("button", { name: "1", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.log.some((l) => /^You guesses 1; Ana reveals [1-5]/.test(l.text)));
  const picked = after.numbersChosenFor![`${trap}@0`]![0];
  if (picked === 1) expect(after.objects[trap]!.zone).toBe("graveyard");
  else {
    expect(after.players[0]!.life).toBe(life - 1);
    expect(after.players[1]!.hand.length).toBe(anaHand + 1);
  }
  expect(pageErrors(page)).toEqual([]);
});

test("Quicksilver Fountain: on your upkeep you choose which land of yours Ana's Fountain floods: your Forest, not your Island", async ({ page }) => {
  const s0 = scene({ board: ["Forest", "Island"] }, [{ board: ["Quicksilver Fountain"] }]);
  // Your own copies on the battlefield (one() could find a library card).
  const [forest, island] = [idsOf(s0, "Forest", "battlefield", 0)[0]!, idsOf(s0, "Island", "battlefield", 0)[0]!];
  const s = playUntil(s0, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  expect(s.pending).toMatchObject({ kind: "chooseTargets", player: 0, controller: 1 });
  await open(page, s);
  const bar = page.locator(".targeting");
  await expect(bar).toContainText("You choose the target for Ana's ability: Quicksilver Fountain");
  // Already an Island: clicking it chooses nothing.
  await page.locator(`[data-obj="${island}"]`).first().click();
  await expect(bar).toBeVisible();
  await page.locator(`[data-obj="${forest}"]`).first().click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && (st.objects[forest]!.counters.flood ?? 0) === 1);
  expect(after.objects[island]!.counters.flood ?? 0).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Fateful Tempest: you vote past; the milled cards' mana value hits each opponent, present votes exile cards to play", async ({ page }) => {
  const s = scene({ hand: ["Fateful Tempest"], board: LANDS, library: ["Hill Giant", "Grizzly Bears", "Gray Ogre", "Plains", "Island"] });
  const [giant, tempest] = [one(s, "Hill Giant"), one(s, "Fateful Tempest")];
  await open(page, s);
  await card(page, "Fateful Tempest", s).click();
  await resolveUntil(page, asked("vote"));
  const bar = controls(page);
  await expect(bar.getByRole("button", { name: "present", exact: true })).toBeVisible();
  await bar.getByRole("button", { name: "past", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[tempest]!.zone === "graveyard");
  const votes = after.log.filter((l) => / votes for (past|present)/.test(l.text));
  expect(votes).toHaveLength(4);
  const past = votes.filter((l) => / votes for past/.test(l.text)).length;
  // Your vote is past: at least Hill Giant (mana value 4) is milled.
  expect(after.objects[giant]!.zone).toBe("graveyard");
  const milledMv = [4, 2, 3, 0, 0].slice(0, past).reduce((a, b) => a + b, 0);
  for (const pid of [1, 2, 3]) expect(after.players[pid]!.life).toBe(40 - milledMv);
  expect(after.players[0]!.exile.filter((id) => after.objects[id]!.mayPlay?.player === 0)).toHaveLength(4 - past);
  expect(pageErrors(page)).toEqual([]);
});
