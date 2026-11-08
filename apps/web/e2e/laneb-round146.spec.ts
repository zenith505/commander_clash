// Lane B round B146 in the browser: Bullseye, Death Dealer's "{3}, {T}, Sacrifice an artifact or discard a nonland card"
// is one menu entry for each cost; you pick the discard, target Ana, then the card (a land can't pay it).
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { clickPlayer, menu, modal, resolveUntil } from "./ui";

test("Bullseye, Death Dealer: the discard entry, a target, then a nonland card from your hand", async ({ page }) => {
  const s = scene({ hand: ["Grizzly Bears", "Forest"], board: ["Bullseye, Death Dealer", ...LANDS] }, [{ board: ["Hill Giant"] }]);
  const bullseye = one(s, "Bullseye, Death Dealer");
  const bears = one(s, "Grizzly Bears");
  const forest = idsOf(s, "Forest", "hand", 0)[0]!;
  const life = s.players[1]!.life;
  await open(page, s);
  await page.locator(`[data-obj="${bullseye}"]`).click();
  // No artifact to sacrifice: only the discard can be paid.
  await expect(menu(page).getByRole("button", { name: /Sacrifice an artifact/ })).toBeDisabled();
  await menu(page).getByRole("button", { name: /Discard a nonland card/ }).click();
  await clickPlayer(page, 1);
  const pick = modal(page);
  await expect(pick).toContainText("nonland card");
  await expect(pick.locator(`[data-pick="${forest}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${bears}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.players[1]!.life === life - 2);
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(after.objects[forest]!.zone).toBe("hand");
  expect(after.objects[bullseye]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Bullseye, Death Dealer: the sacrifice entry, with an artifact on the battlefield", async ({ page }) => {
  const s = scene({ hand: ["Grizzly Bears"], board: ["Bullseye, Death Dealer", "Ornithopter", ...LANDS] }, [{ board: ["Hill Giant"] }]);
  const bullseye = one(s, "Bullseye, Death Dealer");
  const thopter = one(s, "Ornithopter");
  const bears = one(s, "Grizzly Bears");
  const life = s.players[1]!.life;
  await open(page, s);
  await page.locator(`[data-obj="${bullseye}"]`).click();
  await menu(page).getByRole("button", { name: /Sacrifice an artifact/ }).click();
  await clickPlayer(page, 1);
  const bar = page.locator(".targeting", { hasText: "sacrifice an artifact (click it)" });
  await expect(bar.getByRole("button", { name: "Sacrifice and activate" })).toBeVisible();
  await page.locator(`[data-obj="${thopter}"]`).click();
  await bar.getByRole("button", { name: "Sacrifice and activate" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.players[1]!.life === life - 2);
  expect(after.objects[thopter]!.zone).toBe("graveyard");
  expect(after.objects[bears]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});
