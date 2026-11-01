// Lane B round 73's choices in the browser: a basic land type chosen as an Aura enters (Convincing Mirage), and a color
// chosen as an Aura enters for its prevention shield (Prismatic Ward).
import { expect, test } from "@playwright/test";
import { characteristics } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Convincing Mirage: on an opponent's Forest, pick Island; the Forest is an Island now", async ({ page }) => {
  const s = scene({ hand: ["Convincing Mirage"], board: LANDS }, [{ board: ["Forest"] }]);
  const theirForest = s.battlefield.find((id) => s.objects[id]!.controller === 1 && s.cards[s.objects[id]!.cardId]!.name === "Forest")!;
  await open(page, s);
  await card(page, "Convincing Mirage", s).click();
  await page.locator(`[data-obj="${theirForest}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "basicLandType" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("choose a basic land type");
  await bar.getByRole("button", { name: "Island" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.battlefield.some((id) => st.cards[st.objects[id]!.cardId]!.name === "Convincing Mirage"));
  expect(characteristics(after, after.objects[theirForest]!).subtypes).toEqual(["Island"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Prismatic Ward: on our Hill Giant, pick Red; red damage to it is prevented from then on", async ({ page }) => {
  const s = scene({ hand: ["Prismatic Ward"], board: [...LANDS, "Hill Giant"] });
  const giant = one(s, "Hill Giant");
  await open(page, s);
  await card(page, "Prismatic Ward", s).click();
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "color" && st.pending.player === 0);
  await controls(page).getByRole("button", { name: "Red" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.attachedTo === undefined && st.battlefield.some((id) => st.objects[id]!.attachedTo === giant));
  const ward = after.battlefield.find((id) => after.objects[id]!.attachedTo === giant)!;
  expect(after.objects[ward]!.chosen?.color).toBe("R");
  expect(characteristics(after, after.objects[giant]!).preventDamage).toEqual([{ to: true, fromColors: ["R"] }]);
  expect(pageErrors(page)).toEqual([]);
});
