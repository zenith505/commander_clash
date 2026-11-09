// Round 323's prompts: Night Soil's cost of two creature cards from a single graveyard (the picker shows whose graveyard
// each card is in and won't take cards from two of them); Overseer of Vault 76's "you may remove three quest counters
// from among permanents you control" (the distribute picker's remove mode with exactly three: Done only at three);
// Super-Soldier Serum's "attach any number of target Equipment you control to it" as the creature attacks.
import { expect, test } from "@playwright/test";
import { characteristics, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { attack, card, controls, menu, modal, resolveUntil } from "./ui";

test("Night Soil: exile Ana's two creature cards, not one of yours with one of hers, for a Saproling", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Night Soil"], yard: ["Hill Giant"] }, [{ yard: ["Grizzly Bears", "Llanowar Elves"] }]);
  const [giant, bears, elves] = [one(s, "Hill Giant"), one(s, "Grizzly Bears"), one(s, "Llanowar Elves")];
  await open(page, s);
  await card(page, "Night Soil", s).click();
  await menu(page).locator("button", { hasText: "Exile two creature cards from a single graveyard" }).click();
  const pick = modal(page);
  await expect(pick).toContainText("Night Soil: exile 2 creature cards from a single graveyard");
  await expect(pick.locator(`[data-pick="${bears}"]`)).toContainText("Ana's graveyard");
  await expect(pick.locator(`[data-pick="${giant}"]`)).toContainText("your graveyard");
  const done = pick.getByRole("button", { name: "Done" });
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.locator(`[data-pick="${bears}"]`).click();
  await expect(done).toBeDisabled();
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.locator(`[data-pick="${elves}"]`).click();
  await done.click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.battlefield.some((id) => characteristics(st, st.objects[id]!).name === "Saproling Token"));
  expect([bears, elves].map((id) => after.objects[id]!.zone)).toEqual(["exile", "exile"]);
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Overseer of Vault 76: Yes, then remove exactly three quest counters, two from it and one from Sol Ring", async ({ page }) => {
  const s: GameState = scene({ board: [...LANDS, "Overseer of Vault 76", "Sol Ring", "Grizzly Bears"] });
  const [overseer, ring, bears] = [one(s, "Overseer of Vault 76"), one(s, "Sol Ring"), one(s, "Grizzly Bears")];
  s.objects[overseer]!.counters.quest = 2;
  s.objects[ring]!.counters.quest = 2;
  await open(page, playUntil(s, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0));
  await expect(controls(page)).toContainText("Overseer of Vault 76: Remove three quest counters from among permanents you control?");
  await controls(page).getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "distribute");
  const bar = controls(page);
  await expect(bar).toContainText("Overseer of Vault 76: remove 3 quest counters from among permanents you control (3 left)");
  const done = bar.getByRole("button", { name: "Done" });
  const plusOverseer = page.locator(`[data-distribute="${overseer}"]`).getByRole("button", { name: "+" });
  await plusOverseer.click();
  await plusOverseer.click();
  await expect(plusOverseer).toBeDisabled();
  // Two isn't three: exactly three (rulings).
  await expect(done).toBeDisabled();
  await page.locator(`[data-distribute="${ring}"]`).getByRole("button", { name: "+" }).click();
  await done.click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.triggerQueue.length === 0 && (st.objects[bears]!.counters["+1/+1"] ?? 0) > 0);
  expect(after.objects[overseer]!.counters.quest ?? 0).toBe(0);
  expect(after.objects[ring]!.counters.quest).toBe(1);
  for (const id of [overseer, bears]) {
    expect(after.objects[id]!.counters["+1/+1"]).toBe(1);
    expect(characteristics(after, after.objects[id]!).keywords).toContain("Vigilance");
  }
  expect(pageErrors(page)).toEqual([]);
});

test("Super-Soldier Serum: the enchanted Bears attacks, you click Bone Saw and Short Sword (not Leonin Scimitar), Done, and both move onto it", async ({ page }) => {
  const s: GameState = scene({ board: ["Grizzly Bears", "Super-Soldier Serum", "Bone Saw", "Short Sword", "Leonin Scimitar"] }, [{}]);
  const [bears, serum, saw, sword, scimitar] = [one(s, "Grizzly Bears"), one(s, "Super-Soldier Serum"), one(s, "Bone Saw"), one(s, "Short Sword"), one(s, "Leonin Scimitar")];
  s.objects[serum]!.attachedTo = bears;
  await open(page, playUntil(s, (st) => st.pending?.kind === "declareAttackers"));
  await attack(page, [[bears, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  const bar = page.locator(".targeting");
  await page.locator(`[data-obj="${saw}"]`).click();
  await page.locator(`[data-obj="${sword}"]`).click();
  await bar.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.objects[saw]!.attachedTo === bears && st.objects[sword]!.attachedTo === bears && st.stack.length === 0);
  const c = characteristics(after, after.objects[bears]!);
  expect(after.objects[scimitar]!.attachedTo).toBeUndefined();
  expect(c.supertypes).toContain("Legendary");
  expect([c.power, c.toughness]).toEqual([6, 5]);
  expect(pageErrors(page)).toEqual([]);
});
