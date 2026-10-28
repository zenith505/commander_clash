// Lane B round 23 in the browser: Helica Glider's "your choice of a flying counter or a first strike counter" as it
// enters (CR 614.1c, 614.12), and Martyr of Ashes's "Reveal X red cards from your hand" cost (CR 107.3a, 602.2b).
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

test("Helica Glider: choose a first strike counter as it enters", async ({ page }) => {
  const s = scene({ hand: ["Helica Glider"], board: LANDS });
  const glider = one(s, "Helica Glider");
  await open(page, s);
  await card(page, "Helica Glider", s).click();
  const bar = controls(page);
  await expect(bar.getByRole("button", { name: "A flying counter" })).toHaveCount(1);
  await bar.getByRole("button", { name: "A first strike counter" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[glider]!.zone === "battlefield");
  expect(after.objects[glider]!.counters).toEqual({ "first strike": 1 });
  expect(pageErrors(page)).toEqual([]);
});

test("Martyr of Ashes: choose X = 2, pick two red cards to reveal, 2 damage to each creature without flying", async ({ page }) => {
  const s = scene({ hand: ["Lightning Bolt", "Shock", "Giant Growth"], board: [...LANDS, "Martyr of Ashes"] }, [{ board: ["Grizzly Bears", "Birds of Paradise"] }]);
  const [martyr, bolt, shock, growth] = [one(s, "Martyr of Ashes"), one(s, "Lightning Bolt"), one(s, "Shock"), one(s, "Giant Growth")];
  const [bears, birds] = [idsOf(s, "Grizzly Bears", "battlefield", 1)[0]!, idsOf(s, "Birds of Paradise", "battlefield", 1)[0]!];
  await open(page, s);
  await page.locator(`[data-obj="${martyr}"]`).first().click();
  await menu(page).locator("button", { hasText: "Reveal X red cards" }).click();
  const x = page.locator(".x-pick");
  await expect(x).toContainText("X red cards from your hand");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  const pick = modal(page);
  await expect(pick).toContainText("Martyr of Ashes: reveal 2 red cards from your hand");
  // Only red cards are offered.
  await expect(pick.locator(`[data-pick="${growth}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${bolt}"]`).click();
  await pick.locator(`[data-pick="${shock}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "graveyard");
  expect(after.objects[martyr]!.zone).toBe("graveyard");
  expect(after.objects[birds]!.zone).toBe("battlefield");
  expect([bolt, shock, growth].map((id) => after.objects[id]!.zone)).toEqual(["hand", "hand", "hand"]);
  expect(pageErrors(page)).toEqual([]);
});
