// Lane B round 24 in the browser: Minion of the Wastes's "As this creature enters, pay any amount of life" (CR 614.12,
// 119.4), Wood Elemental's "sacrifice any number of untapped Forests" as it enters, and Arsenal Thresher's "you may
// reveal any number of other artifact cards from your hand".
import { expect, test } from "@playwright/test";
import { applyAction, planCast, waitingOn, type Action, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => applyAction(x, a), s);
};
/** Everyone passes until there's a prompt (or nothing left to resolve). */
const passToPrompt = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = applyAction(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

test("Minion of the Wastes: pay 3 life with + as it enters, and it's a 3/3", async ({ page }) => {
  const s = scene({ hand: ["Minion of the Wastes"], board: LANDS });
  const minion = one(s, "Minion of the Wastes");
  const life = s.players[0]!.life;
  await open(page, s);
  await card(page, "Minion of the Wastes", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "lifeAsEnters");
  const bar = controls(page);
  await expect(bar).toContainText("Minion of the Wastes: pay any amount of life as it enters");
  await expect(bar.getByRole("button", { name: "Number minus one" })).toBeDisabled(); // 0 is the least
  const plus = bar.getByRole("button", { name: "Number plus one" });
  for (let i = 0; i < 3; i++) await plus.click();
  await bar.getByRole("button", { name: "Pay 3 life" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[minion]!.zone === "battlefield");
  expect(after.players[0]!.life).toBe(life - 3);
  expect(after.objects[minion]!.lifePaidAsEntered).toBe(3);
  await expect(page.locator(`[data-obj="${minion}"]`).first()).toContainText("3/3");
  expect(pageErrors(page)).toEqual([]);
});

test("Wood Elemental: click two untapped Forests to sacrifice as it enters, and it's a 2/2", async ({ page }) => {
  // Differently named Forests, so each can be clicked; the mana comes from the pool, so both stay untapped.
  const s0 = scene({ board: ["Plains", "Island", "Swamp", "Forest", "Snow-Covered Forest"], hand: ["Wood Elemental"] });
  const wood = one(s0, "Wood Elemental");
  s0.players[0]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 1, C: 3 };
  const s = passToPrompt(run(s0, planCast(s0, 0, wood)));
  expect(s.pending).toMatchObject({ kind: "pickPermanents", player: 0, action: "sacrifice" });
  const [a, b] = [idsOf(s, "Forest", "battlefield", 0)[0]!, idsOf(s, "Snow-Covered Forest", "battlefield", 0)[0]!];
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("sacrifice any number of untapped Forests as it enters (its power and toughness are how many)");
  await page.locator(`[data-obj="${a}"]`).click();
  await page.locator(`[data-obj="${b}"]`).click();
  await bar.getByRole("button", { name: "Sacrifice", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[wood]!.zone === "battlefield");
  expect([a, b].map((id) => after.objects[id]!.zone)).toEqual(["graveyard", "graveyard"]);
  await expect(page.locator(`[data-obj="${wood}"]`).first()).toContainText("2/2");
  expect(pageErrors(page)).toEqual([]);
});

test("Arsenal Thresher: reveal the two artifact cards in your hand, and it enters with two +1/+1 counters", async ({ page }) => {
  const s0 = scene({ board: LANDS, hand: ["Arsenal Thresher", "Ornithopter", "Sol Ring", "Grizzly Bears"] });
  const [thresher, thopter, ring, bears] = [one(s0, "Arsenal Thresher"), one(s0, "Ornithopter"), one(s0, "Sol Ring"), one(s0, "Grizzly Bears")];
  const s = passToPrompt(run(s0, planCast(s0, 0, thresher)));
  expect(s.pending).toMatchObject({ kind: "pickPermanents", player: 0, action: "reveal" });
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("reveal any number of other artifact cards from your hand");
  await expect(page.locator(`[data-obj="${bears}"].targetable`)).toHaveCount(0);
  await page.locator(`[data-obj="${thopter}"]`).first().click();
  await page.locator(`[data-obj="${ring}"]`).first().click();
  await bar.getByRole("button", { name: "Reveal 2" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[thresher]!.zone === "battlefield");
  expect(after.objects[thresher]!.counters["+1/+1"]).toBe(2);
  expect([thopter, ring].map((id) => after.objects[id]!.zone)).toEqual(["hand", "hand"]);
  expect(pageErrors(page)).toEqual([]);
});
