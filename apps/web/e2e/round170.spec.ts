// Round 170's prompts: Galvanic Discharge's "you may pay any amount of {E}" (− / + and "Pay N energy"),
// and Edge of Autumn's "Cycling—Sacrifice a land" (a cycling cost picked on the battlefield).
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

test("Galvanic Discharge: get three energy, pay 2 of them with − / + and deal 2 damage", async ({ page }) => {
  const s = scene({ hand: ["Galvanic Discharge"], board: LANDS }, [{ board: ["Grizzly Bears"] }]);
  const bears = one(s, "Grizzly Bears");
  await open(page, s);
  await card(page, "Galvanic Discharge", s).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "payEnergy");
  expect(asked.players[0]!.energy).toBe(3);
  const bar = controls(page);
  await expect(bar).toContainText("Galvanic Discharge:");
  await expect(bar).toContainText("how much energy?");
  const minus = bar.getByRole("button", { name: "Number minus one" });
  const plus = bar.getByRole("button", { name: "Number plus one" });
  await expect(minus).toBeDisabled(); // 0 is the least
  for (let i = 0; i < 3; i++) await plus.click();
  await expect(plus).toBeDisabled(); // no more than the three you have
  await minus.click();
  await bar.getByRole("button", { name: "Pay 2 energy" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "graveyard");
  expect(after.players[0]!.energy).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Edge of Autumn: cycle it by sacrificing a land", async ({ page }) => {
  const s = scene({ hand: ["Edge of Autumn"], board: ["Forest", "Island"], library: ["Grizzly Bears"] });
  const edge = one(s, "Edge of Autumn");
  const forest = idsOf(s, "Forest", "battlefield", 0)[0]!;
  await open(page, s);
  await card(page, "Edge of Autumn", s).click();
  await menu(page).getByRole("button", { name: /^Cycling/ }).click();
  const bar = page.locator(".targeting", { hasText: "sacrifice a land (click it)" });
  await expect(bar.getByRole("button", { name: "Sacrifice and activate" })).toBeDisabled();
  await page.locator(`[data-obj="${forest}"]`).click();
  await bar.getByRole("button", { name: "Sacrifice and activate" }).click();
  const after = await resolveUntil(page, (st) => st.objects[edge]!.zone === "graveyard" && st.stack.length === 0 && !st.pending);
  expect(after.objects[forest]!.zone).toBe("graveyard");
  expect(after.players[0]!.hand.map((id) => after.cards[after.objects[id]!.cardId]!.name)).toEqual(["Grizzly Bears"]);
  expect(pageErrors(page)).toEqual([]);
});
