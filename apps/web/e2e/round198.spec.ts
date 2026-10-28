// Round 198 in the browser: Killing Wave's "sacrifices it unless they pay X life" (click the creatures to keep, X life
// each), and behold (CR 701.4a) as Sarkhan, Dragon Ascendant enters: a Dragon card from your hand or a Dragon you control.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, modal, resolveUntil } from "./ui";

test("Killing Wave: X = 2, keep the Hill Giant and Grizzly Bears for 4 life, the Llanowar Elves are sacrificed", async ({ page }) => {
  const s = scene({ hand: ["Killing Wave"], board: [...LANDS, "Hill Giant", "Grizzly Bears", "Llanowar Elves"] });
  const [giant, bears, elves] = [one(s, "Hill Giant"), one(s, "Grizzly Bears"), one(s, "Llanowar Elves")];
  const life = s.players[0]!.life;
  await open(page, s);
  await card(page, "Killing Wave", s).click();
  const x = page.locator(".x-pick");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.action === "keep" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("click the creatures of yours to keep, paying 2 life for each (up to 3). The rest are sacrificed.");
  await page.locator(`[data-obj="${giant}"]`).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  await bar.getByRole("button", { name: "Keep 2" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[elves]!.zone === "graveyard");
  expect([giant, bears, elves].map((id) => after.objects[id]!.zone)).toEqual(["battlefield", "battlefield", "graveyard"]);
  expect(after.players[0]!.life).toBe(life - 4);
  expect(pageErrors(page)).toEqual([]);
});

test("Sarkhan, Dragon Ascendant: behold the Shivan Dragon in your hand as he enters, and make a Treasure", async ({ page }) => {
  const s = scene({ hand: ["Sarkhan, Dragon Ascendant", "Shivan Dragon"], board: LANDS });
  const dragon = one(s, "Shivan Dragon");
  await open(page, s);
  await card(page, "Sarkhan, Dragon Ascendant", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const pick = modal(page);
  await expect(pick).toContainText("Sarkhan, Dragon Ascendant: you may behold a Dragon card (reveal one from your hand or choose one you control)");
  await expect(pick.getByRole("button", { name: "Behold nothing" })).toBeVisible();
  await pick.locator(`[data-pick="${dragon}"]`).click();
  await pick.getByRole("button", { name: "Behold", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.battlefield.some((id) => st.objects[id]!.isToken && st.objects[id]!.controller === 0));
  expect(after.battlefield.filter((id) => after.objects[id]!.isToken && after.objects[id]!.controller === 0)).toHaveLength(1);
  expect(after.objects[dragon]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});

test("Sarkhan, Dragon Ascendant: or behold the Shivan Dragon you control", async ({ page }) => {
  const s = scene({ hand: ["Sarkhan, Dragon Ascendant"], board: [...LANDS, "Shivan Dragon"] });
  const dragon = one(s, "Shivan Dragon");
  await open(page, s);
  await card(page, "Sarkhan, Dragon Ascendant", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const pick = modal(page);
  await expect(pick).toContainText("Your hand and permanents");
  await pick.locator(`[data-pick="${dragon}"]`).click();
  await pick.getByRole("button", { name: "Behold", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.battlefield.some((id) => st.objects[id]!.isToken && st.objects[id]!.controller === 0));
  expect(after.objects[dragon]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
