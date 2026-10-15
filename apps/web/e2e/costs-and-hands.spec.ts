// PR #18: choosing which additional cost to pay (Spark Harvest), and picking from a revealed hand (Thoughtseize).
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene, state } from "./scene";
import { card, clickPlayer, controls, modal, resolveUntil } from "./ui";

const harvest = () => scene({ hand: ["Spark Harvest"], board: [...LANDS, "Grizzly Bears"] }, [{ board: ["Hill Giant"] }]);

test("Spark Harvest: pay {3}{B} instead of sacrificing", async ({ page }) => {
  const s = harvest();
  const [giant, bears] = [one(s, "Hill Giant"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Spark Harvest", s).click();
  // Which cost comes first (CR 601.2b), then the target.
  const bar = page.locator(".targeting", { hasText: "as an additional cost" });
  await expect(bar.getByRole("button", { name: "Sacrifice a creature" })).toBeEnabled();
  await bar.getByRole("button", { name: /^Pay/ }).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  const after = await state(page);
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(after.battlefield.filter((id) => after.objects[id]!.tapped)).toHaveLength(5);
  expect(pageErrors(page)).toEqual([]);
});

test("Spark Harvest: sacrifice a creature, clicked on the battlefield", async ({ page }) => {
  const s = harvest();
  const [giant, bears] = [one(s, "Hill Giant"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Spark Harvest", s).click();
  await page.locator(".targeting").getByRole("button", { name: "Sacrifice a creature" }).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  const bar = page.locator(".targeting", { hasText: "sacrifice a creature (click it)" });
  await expect(bar.getByRole("button", { name: "Sacrifice and cast" })).toBeDisabled();
  await page.locator(`[data-obj="${bears}"]`).click();
  await bar.getByRole("button", { name: "Sacrifice and cast" }).click();
  await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  const after = await state(page);
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(after.battlefield.filter((id) => after.objects[id]!.tapped)).toHaveLength(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Thoughtseize: target a player, then pick a nonland card from their revealed hand", async ({ page }) => {
  const s = scene({ hand: ["Thoughtseize"], board: LANDS }, [{ hand: ["Grizzly Bears", "Forest", "Hill Giant"] }]);
  const giant = one(s, "Hill Giant");
  const forest = idsOf(s, "Forest", "hand", 1)[0]!;
  await open(page, s);
  await card(page, "Thoughtseize", s).click();
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await expect(pick).toContainText("Ana's hand");
  // The land is shown but can't be taken.
  await expect(pick.locator(`[data-pick="${forest}"]`)).toHaveClass(/dim/);
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  const after = await state(page);
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(after.players[1]!.hand).toHaveLength(2);
  expect(after.players[0]!.life).toBe(38);
  expect(pageErrors(page)).toEqual([]);
});

test("Daring Buccaneer: reveal a Pirate card from your hand instead of paying {2}", async ({ page }) => {
  const s = scene({ hand: ["Daring Buccaneer", "Rishadan Cutpurse", "Shock"], board: LANDS });
  const [buccaneer, cutpurse, shock] = [one(s, "Daring Buccaneer"), one(s, "Rishadan Cutpurse"), one(s, "Shock")];
  await open(page, s);
  await card(page, "Daring Buccaneer", s).click();
  await page.locator(".targeting").getByRole("button", { name: /^Reveal a Pirate card/ }).click();
  const pick = modal(page);
  await expect(pick).toContainText("Daring Buccaneer: reveal a Pirate card");
  // Only Pirates are offered.
  await expect(pick.locator(`[data-pick="${shock}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${cutpurse}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.objects[buccaneer]!.zone === "battlefield" && st.stack.length === 0);
  expect(after.battlefield.filter((id) => after.objects[id]!.tapped)).toHaveLength(1);
  expect(after.objects[cutpurse]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});
