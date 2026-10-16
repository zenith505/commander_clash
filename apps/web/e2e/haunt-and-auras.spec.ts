// Haunt (CR 702.55): a haunt creature that dies is exiled haunting the creature you click, which shows a Haunted chip;
// when that creature dies, the haunt card's ability triggers from exile. And Auras put onto the battlefield without
// being cast (CR 303.4f): a button for each thing the Aura could enchant.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, resolveUntil } from "./ui";

test("Blind Hunter: dies, haunts the creature you click, and drains again when that creature dies", async ({ page }) => {
  const s = scene({ hand: ["Shock", "Lightning Bolt"], board: [...LANDS, "Blind Hunter"] }, [{ board: ["Hill Giant"] }]);
  const hunter = one(s, "Blind Hunter"), giant = one(s, "Hill Giant");
  await open(page, s);
  await card(page, "Shock", s).click();
  await page.locator(`[data-obj="${hunter}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.objects[hunter]!.zone === "graveyard");
  await expect(page.locator(".control-pane")).toContainText("exile it haunting target creature.: choose target creature");
  await page.locator(`[data-obj="${giant}"]`).click();
  let st = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending && x.objects[hunter]!.zone === "exile");
  expect(st.objects[hunter]!.haunting?.id).toBe(giant);
  await expect(page.locator(`[data-obj="${giant}"] .chip`, { hasText: "Haunted" })).toBeVisible();

  await card(page, "Lightning Bolt", s).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  await resolveUntil(page, (x) => x.pending?.kind === "chooseTargets" && x.objects[giant]!.zone === "graveyard");
  await expect(page.locator(".control-pane")).toContainText("target player loses 2 life and you gain 2 life.: choose target player");
  await clickPlayer(page, 1);
  st = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending && x.players[1]!.life === 38);
  expect(st.players[0]!.life).toBe(42);
  expect(pageErrors(page)).toEqual([]);
});

test("Replenish: choose what Pacifism enchants as it comes back", async ({ page }) => {
  const s = scene({ hand: ["Replenish"], board: [...LANDS, "Grizzly Bears"], yard: ["Pacifism", "Glorious Anthem"] }, [{ board: ["Hill Giant"] }]);
  const pacifism = one(s, "Pacifism"), anthem = one(s, "Glorious Anthem"), giant = one(s, "Hill Giant");
  await open(page, s);
  await card(page, "Replenish", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption");
  const pick = page.locator(".controls.enchant-pick");
  await expect(pick).toContainText("Replenish: choose what Pacifism enchants as it enters");
  await expect(pick.getByRole("button")).toHaveText(["Grizzly Bears (You)", "Hill Giant (Ana)"]);
  await pick.getByRole("button", { name: "Hill Giant (Ana)" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[pacifism]!.zone === "battlefield");
  expect(after.objects[pacifism]!.attachedTo).toBe(giant);
  expect(after.objects[anthem]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Banishing Light leaves: choose what your exiled Holy Strength enchants as it returns", async ({ page }) => {
  const s = scene({ hand: ["Disenchant"], board: [...LANDS, "Grizzly Bears"], exile: ["Holy Strength"] }, [{ board: ["Banishing Light", "Hill Giant"] }]);
  const strength = one(s, "Holy Strength"), light = one(s, "Banishing Light"), bears = one(s, "Grizzly Bears");
  s.objects[light]!.exiledUntilLeaves = [{ id: strength, zc: s.objects[strength]!.zoneChanges ?? 0 }]; // Ana's Banishing Light exiled it
  await open(page, s);
  await card(page, "Disenchant", s).click();
  await page.locator(`[data-obj="${light}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption");
  const pick = page.locator(".controls.enchant-pick");
  await expect(pick).toContainText("Banishing Light: choose what Holy Strength enchants as it returns");
  await expect(pick.getByRole("button")).toHaveText(["Grizzly Bears (You)", "Hill Giant (Ana)"]);
  await pick.getByRole("button", { name: "Grizzly Bears (You)" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[strength]!.zone === "battlefield");
  expect(after.objects[strength]).toMatchObject({ attachedTo: bears, controller: 0 });
  expect(after.objects[light]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
