// Round 435: March from Velis Vel (target a creature, then choose a nonbasic land type: your lands of that type become
// copies of it with haste) and Ludevic, Necrogenius (choose X = 2, click two creature cards in your graveyard; as it
// transforms, choose which of them Olag, Ludevic's Hubris becomes a copy of).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

test("March from Velis Vel: target Shivan Dragon, choose Gate, and both your Gates become Shivan Dragons with haste", async ({ page }) => {
  const s = scene({ hand: ["March from Velis Vel"], board: [...LANDS, "Shivan Dragon", "Azorius Guildgate", "Simic Guildgate", "Urza's Mine"] });
  const [march, dragon, azorius, simic, mine] = [one(s, "March from Velis Vel"), one(s, "Shivan Dragon"), one(s, "Azorius Guildgate"), one(s, "Simic Guildgate"), one(s, "Urza's Mine")];
  await open(page, s);
  await card(page, "March from Velis Vel", s).click();
  await page.locator(`[data-obj="${dragon}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "landType" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("choose a nonbasic land type");
  await expect(bar.getByRole("button", { name: "Forest", exact: true })).toHaveCount(0);
  await bar.getByRole("button", { name: "Gate", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[march]!.zone === "graveyard");
  for (const g of [azorius, simic]) expect(after.objects[g]!.copyEffects?.length).toBe(1);
  expect(after.objects[mine]!.copyEffects ?? []).toHaveLength(0);
  await expect(page.locator(`[data-obj="${azorius}"]`).first()).toContainText("Shivan Dragon");
  expect(pageErrors(page)).toEqual([]);
});

test("Ludevic, Necrogenius: X = 2, two creature cards exiled, and Olag becomes a copy of the Shivan Dragon you choose", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Ludevic, Necrogenius // Olag, Ludevic's Hubris"], yard: ["Shivan Dragon", "Hill Giant", "Azorius Guildgate"] });
  const lud = one(s, "Ludevic, Necrogenius");
  const mine = (n: string) => s.players[0]!.graveyard.find((id) => s.cards[s.objects[id]!.cardId]!.name === n)!;
  const [dragon, giant, gate] = ["Shivan Dragon", "Hill Giant", "Azorius Guildgate"].map(mine) as [string, string, string];
  await open(page, s);
  await page.locator(`[data-obj="${lud}"]`).first().click();
  await menu(page).locator("button", { hasText: "Exile X creature cards" }).click();
  const x = page.locator(".x-pick");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  const pick = modal(page);
  await expect(pick.locator(`[data-pick="${gate}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${dragon}"]`).click();
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "transformCopy" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("choose a creature card exiled with it for Olag, Ludevic's Hubris to become a copy of");
  await bar.getByRole("button", { name: "Shivan Dragon", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && (st.objects[lud]!.copyEffects?.length ?? 0) === 1);
  expect(after.objects[lud]!.face).toBe(1);
  expect(after.objects[lud]!.counters["+1/+1"]).toBe(2);
  expect([dragon, giant, gate].map((id) => after.objects[id]!.zone)).toEqual(["exile", "exile", "graveyard"]);
  await expect(page.locator(`[data-obj="${lud}"]`).first()).toContainText("Olag, Ludevic's Hubris");
  expect(pageErrors(page)).toEqual([]);
});
