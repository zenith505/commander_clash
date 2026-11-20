// Lane B round B272 in the browser: Cass, Hand of Vengeance (Murder your enchanted and equipped Hill Giant, target
// Grizzly Bears, pick Holy Strength from your graveyard, then attach Bonesplitter) and Bruna, Light of Alabaster (attack:
// take Ana's Holy Strength off her Grizzly Bears, then put Unholy Strength from your hand and Ancestral Mask from your
// graveyard onto Bruna).
import { expect, test } from "@playwright/test";
import { invalidateCharacteristics } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { attack, card, controls, modal, passTo, resolveUntil } from "./ui";

test("Cass, Hand of Vengeance: the Giant dies; Holy Strength returns on Grizzly Bears, then Bonesplitter is attached to it", async ({ page }) => {
  const s = scene({ hand: ["Murder"], board: [...LANDS, "Cass, Hand of Vengeance", "Hill Giant", "Holy Strength", "Bonesplitter", "Grizzly Bears"] });
  const [giant, holy, bone, bears] = [one(s, "Hill Giant"), one(s, "Holy Strength"), one(s, "Bonesplitter"), one(s, "Grizzly Bears")];
  s.objects[holy]!.attachedTo = giant;
  s.objects[bone]!.attachedTo = giant;
  invalidateCharacteristics(s);
  await open(page, s);
  await card(page, "Murder", s).click();
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const pick = modal(page);
  await expect(pick).toContainText("the Aura cards that were attached to it, to return attached to Grizzly Bears");
  await pick.locator(`[data-pick="${holy}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.action === "attach");
  const bar = controls(page);
  await expect(bar).toContainText("click any number of the Equipment that were attached to Hill Giant to attach to Grizzly Bears");
  await page.locator(`[data-obj="${bone}"]`).first().click();
  await bar.getByRole("button", { name: "Attach 1" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bone]!.attachedTo === bears);
  expect(after.objects[holy]!.zone).toBe("battlefield");
  expect(after.objects[holy]!.attachedTo).toBe(bears);
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Bruna, Light of Alabaster: attacks; takes Ana's Holy Strength, then Unholy Strength from hand and Ancestral Mask from the graveyard", async ({ page }) => {
  const s = scene({ hand: ["Unholy Strength", "Wild Growth"], board: ["Bruna, Light of Alabaster"], yard: ["Ancestral Mask"] }, [{ board: ["Grizzly Bears", "Holy Strength"] }]);
  const [bruna, bears, holy, unholy, growth, mask] = [one(s, "Bruna, Light of Alabaster"), one(s, "Grizzly Bears"), one(s, "Holy Strength"), one(s, "Unholy Strength"), one(s, "Wild Growth"), one(s, "Ancestral Mask")];
  s.objects[holy]!.attachedTo = bears;
  invalidateCharacteristics(s);
  await open(page, s);
  await passTo(page, "declareAttackers");
  await attack(page, [[bruna, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.action === "attach");
  const bar = controls(page);
  await expect(bar).toContainText("you may click any number of Auras on the battlefield to attach to Bruna, Light of Alabaster");
  await page.locator(`[data-obj="${holy}"]`).first().click({ position: { x: 6, y: 6 } });
  await bar.getByRole("button", { name: "Attach 1" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const pick = modal(page);
  await expect(pick).toContainText("you may put any number of Aura cards from your hand and/or graveyard onto the battlefield attached to Bruna, Light of Alabaster");
  // Wild Growth (enchant land) couldn't enchant Bruna: not offered.
  await expect(pick.locator(`[data-pick="${growth}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${unholy}"]`).click();
  await pick.locator(`[data-pick="${mask}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[mask]!.zone === "battlefield");
  for (const id of [holy, unholy, mask]) expect(after.objects[id]!.attachedTo).toBe(bruna);
  // Holy Strength stays Ana's (CR 701.3a); the cards you put there are yours (CR 110.2a).
  expect(after.objects[holy]!.controller).toBe(1);
  expect(after.objects[unholy]!.controller).toBe(0);
  expect(after.players[0]!.hand).toContain(growth);
  expect(pageErrors(page)).toEqual([]);
});
