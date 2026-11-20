// Lane B round B274 in the browser: Next of Kin (Hill Giant dies; put your commander, Isamaru, from the command zone onto
// the battlefield, and Next of Kin returns attached to it at the end step) and Dimensional Breach (everything is exiled;
// at your next upkeep you choose Grizzly Bears to return).
import { expect, test } from "@playwright/test";
import { invalidateCharacteristics } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, modal, resolveUntil } from "./ui";

test("Next of Kin: the enchanted Hill Giant dies; Isamaru comes from the command zone and Next of Kin returns on it at the end step", async ({ page }) => {
  const s = scene({ hand: ["Murder", "Llanowar Elves", "Craw Wurm"], board: [...LANDS, "Hill Giant", "Next of Kin"], commander: "Isamaru, Hound of Konda" });
  const [giant, kin, elves, wurm] = [one(s, "Hill Giant"), one(s, "Next of Kin"), one(s, "Llanowar Elves"), one(s, "Craw Wurm")];
  const isamaru = s.players[0]!.command[0]!;
  s.objects[kin]!.attachedTo = giant;
  invalidateCharacteristics(s);
  await open(page, s);
  await card(page, "Murder", s).click();
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const pick = modal(page);
  await expect(pick).toContainText("you may put a creature card with lesser mana value from your hand or the command zone onto the battlefield");
  await expect(pick).toContainText("Your hand and command zone");
  // Mana value less than Hill Giant's 4: Llanowar Elves and Isamaru, not Craw Wurm.
  await expect(pick.locator(`[data-pick="${elves}"]`)).toBeVisible();
  await expect(pick.locator(`[data-pick="${wurm}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${isamaru}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const put = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[isamaru]!.zone === "battlefield");
  expect(put.objects[kin]!.zone).toBe("graveyard");
  const after = await resolveUntil(page, (st) => st.objects[kin]!.zone === "battlefield" && st.stack.length === 0, 80);
  expect(after.objects[kin]!.attachedTo).toBe(isamaru);
  expect(after.objects[elves]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});

test("Dimensional Breach: every permanent is exiled; at your next upkeep you return Grizzly Bears", async ({ page }) => {
  const s = scene({ hand: ["Dimensional Breach"], board: [...LANDS, "Grizzly Bears", "Sol Ring"] }, [{ board: ["Forest"] }]);
  const [breach, bears, ring, anaForest] = [one(s, "Dimensional Breach"), one(s, "Grizzly Bears"), one(s, "Sol Ring"), s.battlefield.find((id) => s.objects[id]!.controller === 1)!];
  await open(page, s);
  await card(page, "Dimensional Breach", s).click();
  const cast = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[breach]!.zone === "graveyard");
  expect(cast.battlefield).toEqual([]);
  expect(cast.objects[bears]!.zone).toBe("exile");
  // Round the table: Ana returns her Forest at her upkeep; then it's your upkeep and your choice.
  const mine = playUntil(cast, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "breachReturn" && st.pending.player === 0);
  expect(mine.objects[anaForest]!.zone).toBe("battlefield");
  await open(page, mine);
  const bar = controls(page);
  await expect(bar).toContainText("choose one of your exiled cards to return to the battlefield");
  await expect(bar.getByRole("button", { name: "Sol Ring" })).toHaveCount(1);
  await bar.getByRole("button", { name: "Grizzly Bears" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "battlefield");
  expect(after.objects[bears]!.controller).toBe(0);
  expect(after.objects[ring]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});
