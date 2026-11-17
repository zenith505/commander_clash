// Round 402 in the browser: Scheming Fence's "you may choose a nonland permanent" as it enters (an opponent's Prodigal
// Pyromancer, or nothing), and Braided Net tapping an opponent's Shivan Dragon so its ability can't be activated.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

test("Scheming Fence: cast it, choose Ana's Prodigal Pyromancer; Fence has its ability and the Pyromancer's is shut off", async ({ page }) => {
  const s = scene({ hand: ["Scheming Fence"], board: LANDS }, [{ board: ["Prodigal Pyromancer"] }]);
  const [fence, pyro] = [one(s, "Scheming Fence"), one(s, "Prodigal Pyromancer")];
  await open(page, s);
  await card(page, "Scheming Fence", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "chosenObject" && st.pending.player === 0);
  await expect(controls(page)).toContainText("you may choose a nonland permanent");
  await expect(controls(page).getByRole("button", { name: "Choose nothing" })).toBeVisible();
  await controls(page).getByRole("button", { name: "Prodigal Pyromancer (Ana)" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[fence]!.chosen?.object?.id === pyro);
  expect(after.objects[fence]!.zone).toBe("battlefield");
  // Fence has the Pyromancer's ability (summoning sick, so not usable yet).
  await card(page, "Scheming Fence", s).click();
  await expect(menu(page).locator("button", { hasText: "deals 1 damage to any target" })).toHaveCount(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Scheming Fence: choose nothing; it enters with no borrowed ability", async ({ page }) => {
  const s = scene({ hand: ["Scheming Fence"], board: LANDS }, [{ board: ["Prodigal Pyromancer"] }]);
  const fence = one(s, "Scheming Fence");
  await open(page, s);
  await card(page, "Scheming Fence", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "chosenObject" && st.pending.player === 0);
  await controls(page).getByRole("button", { name: "Choose nothing" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[fence]!.zone === "battlefield");
  expect(after.objects[fence]!.chosen?.object).toBeUndefined();
  expect(after.log.some((l) => /chooses nothing for Scheming Fence/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Braided Net: tap Ana's Shivan Dragon; a net counter is removed and the Dragon's abilities can't be activated while it stays tapped", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Braided Net // Braided Quipu"] }, [{ board: ["Shivan Dragon"] }]);
  const [netId, dragon] = [one(s, "Braided Net"), one(s, "Shivan Dragon")];
  s.objects[netId]!.counters.net = 3;
  await open(page, s);
  await card(page, "Braided Net", s).click();
  await menu(page).locator("button", { hasText: "Tap another target nonland permanent" }).first().click();
  await page.locator(`[data-obj="${dragon}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[dragon]!.tapped);
  expect(after.objects[netId]!.counters.net).toBe(2);
  expect(after.effects.some((e) => e.affected.includes(dragon) && e.whileTapped?.id === dragon && e.mods.some((m) => m.kind === "cantActivate"))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
