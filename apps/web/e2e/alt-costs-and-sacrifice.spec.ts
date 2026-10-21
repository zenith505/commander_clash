// PR #21: Fist of Suns' {W}{U}{B}{R}{G} cast button, and a bot's Rishadan Cutpurse asking you to pay or sacrifice.
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, playWithBots, scene, state } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

test("Fist of Suns: cast a spell for {W}{U}{B}{R}{G} from its menu", async ({ page }) => {
  const s = scene({ hand: ["Hill Giant"], board: [...LANDS, "Fist of Suns"] });
  const giant = one(s, "Hill Giant");
  await open(page, s);
  await card(page, "Hill Giant", s).click();
  await expect(menu(page).getByRole("button", { name: /^Cast it/ }).first()).toBeEnabled();
  await menu(page).locator("button", { hasText: "Cast it for" }).click();
  await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[giant]!.zone === "battlefield");
  const after = await state(page);
  const tapped = after.battlefield.filter((id) => after.objects[id]!.tapped).map((id) => after.cards[after.objects[id]!.cardId]!.name).sort();
  expect(tapped).toEqual(["Forest", "Island", "Mountain", "Plains", "Swamp"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Rishadan Cutpurse cast by a bot: don't pay, then click the permanent to sacrifice", async ({ page }) => {
  const s = scene({ board: ["Island", "Grizzly Bears"] }, [{ hand: ["Rishadan Cutpurse"], board: ["Island", "Island", "Island"] }]);
  const bears = one(s, "Grizzly Bears");
  // Ana's bot casts it on her turn, in the engine (for speed).
  await open(page, playWithBots(s, (st) => st.pending?.kind === "payUnless" && st.pending.player === 0));
  await expect(controls(page)).toContainText("Rishadan Cutpurse:");
  await expect(controls(page).getByRole("button", { name: "Pay", exact: true })).toBeEnabled();
  await controls(page).getByRole("button", { name: "Don't pay" }).click();
  await expect(controls(page)).toContainText("Rishadan Cutpurse:");
  await expect(controls(page).getByRole("button", { name: "Sacrifice" })).toBeDisabled();
  await page.locator(`[data-obj="${bears}"]`).click();
  await controls(page).getByRole("button", { name: "Sacrifice" }).click();
  await resolveUntil(page, (st) => st.objects[bears]!.zone === "graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Rishadan Cutpurse cast by a bot: pay {1} and keep everything", async ({ page }) => {
  const s = scene({ board: ["Island", "Grizzly Bears"] }, [{ hand: ["Rishadan Cutpurse"], board: ["Island", "Island", "Island"] }]);
  // Ana's bot casts it on her turn, in the engine (for speed).
  await open(page, playWithBots(s, (st) => st.pending?.kind === "payUnless" && st.pending.player === 0));
  await controls(page).getByRole("button", { name: "Pay", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0);
  const island = idsOf(s, "Island", "battlefield", 0)[0]!;
  expect(after.objects[island]!.tapped).toBe(true);
  expect(after.players[0]!.graveyard).toHaveLength(0);
  expect(pageErrors(page)).toEqual([]);
});
