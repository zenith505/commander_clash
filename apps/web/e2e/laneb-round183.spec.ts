// Lane B round B183 in the browser: Songcrafter Mage's enters trigger gives Divination in your graveyard harmonize, which
// the graveyard menu then offers (tapping Hill Giant for {3} less); Varolz, the Scar-Striped gives Grizzly Bears in your
// graveyard scavenge, offered in the graveyard menu, and the counters go on the creature clicked.
import { expect, test } from "@playwright/test";
import { one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

test("Songcrafter Mage: target Divination in your graveyard, then cast it with harmonize tapping Hill Giant", async ({ page }) => {
  const s = scene({ hand: ["Songcrafter Mage"], board: ["Forest", "Island", "Mountain", "Island", "Hill Giant"], yard: ["Divination", "Grizzly Bears"] });
  const [mage, div, bears, giant] = [one(s, "Songcrafter Mage"), one(s, "Divination"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Songcrafter Mage", s).click();
  // Its trigger's target is a card in your graveyard: the picker opens on its own, with no creature card in it.
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets");
  expect(asked.objects[mage]!.zone).toBe("battlefield");
  await expect(modal(page).locator(`[data-pick="${bears}"]`)).toHaveCount(0);
  await modal(page).locator(`[data-pick="${div}"]`).click();
  await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && !!st.yardCastGrants?.length);
  const hand = s.players[0]!.hand.length - 1;
  await page.locator('[data-graveyard="0"]').click();
  await modal(page).locator(".card.playable", { hasText: "Divination" }).click();
  await menu(page).getByRole("button", { name: /^Harmonize/ }).click();
  const bar = page.locator(".harmonize-pick");
  await page.locator(`[data-obj="${giant}"]`).click();
  await expect(bar).toContainText("Hill Giant: {3} less");
  await bar.getByRole("button", { name: "Tap and cast" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[div]!.zone === "exile");
  expect(after.objects[giant]!.tapped).toBe(true);
  expect(after.players[0]!.hand.length).toBe(hand + 2);
  await expect(controls(page)).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});

test("Varolz, the Scar-Striped: scavenge Grizzly Bears from your graveyard for {1}{G}, two counters on Varolz", async ({ page }) => {
  const s = scene({ board: ["Forest", "Forest", "Varolz, the Scar-Striped"], yard: ["Grizzly Bears"] });
  const [varolz, bears] = [one(s, "Varolz, the Scar-Striped"), one(s, "Grizzly Bears")];
  await open(page, s);
  await page.locator('[data-graveyard="0"]').click();
  await modal(page).locator(".card.playable", { hasText: "Grizzly Bears" }).click();
  await menu(page).getByRole("button", { name: /Scavenge/ }).click();
  await page.locator(`[data-obj="${varolz}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "exile");
  expect(after.objects[varolz]!.counters["+1/+1"]).toBe(2);
  expect(pageErrors(page)).toEqual([]);
});
