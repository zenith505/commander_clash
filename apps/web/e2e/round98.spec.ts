// Round 98's prompts: Ripples of Potential's "choose any number of permanents you control that had a counter put on
// them this way. Those permanents phase out" (click them, then Phase out), Breach the Multiverse's choice of a card in
// each player's graveyard, and Chain of Vapor's "that permanent's controller may sacrifice a land of their choice. If the
// player does, they may copy ~" (yes, the land, yes, the copy's new target).
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { card, controls, modal, resolveUntil } from "./ui";

test("Ripples of Potential: proliferate, then phase out the Grizzly Bears that got a counter", async ({ page }) => {
  const s = scene({ hand: ["Ripples of Potential"], board: [...LANDS, "Grizzly Bears", "Hill Giant"] });
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  s.objects[bears]!.counters["+1/+1"] = 1;
  s.objects[giant]!.counters["+1/+1"] = 1;
  await open(page, s);
  await card(page, "Ripples of Potential", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents");
  const bar = controls(page);
  await expect(bar).toContainText("choose any number of permanents of yours that got a counter to phase out");
  await expect(bar.getByRole("button", { name: "Phase out none" })).toBeEnabled();
  await page.locator(`[data-obj="${bears}"]`).click();
  await bar.getByRole("button", { name: "Phase out 1" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect([after.objects[bears]!.zone, after.objects[giant]!.zone]).toEqual(["phasedOut", "battlefield"]);
  expect([after.objects[bears]!.counters["+1/+1"], after.objects[giant]!.counters["+1/+1"]]).toEqual([2, 2]);
  expect(pageErrors(page)).toEqual([]);
});

test("Breach the Multiverse: choose a creature card in your graveyard and in Ana's", async ({ page }) => {
  const s = scene({ hand: ["Breach the Multiverse"], board: LANDS, yard: ["Hill Giant", "Grizzly Bears"] }, [{ yard: ["Llanowar Elves", "Colossal Dreadmaw"] }]);
  const [giant, dreadmaw] = [one(s, "Hill Giant"), one(s, "Colossal Dreadmaw")];
  await open(page, s);
  await card(page, "Breach the Multiverse", s).click();
  for (const [who, pick] of [["your graveyard", giant], ["Ana's graveyard", dreadmaw]] as const) {
    await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
    await expect(modal(page)).toContainText(who);
    await modal(page).locator(`[data-pick="${pick}"]`).click();
    await modal(page).getByRole("button", { name: "Done" }).click();
  }
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  for (const id of [giant, dreadmaw]) expect([after.objects[id]!.zone, after.objects[id]!.controller]).toEqual(["battlefield", 0]);
  expect(pageErrors(page)).toEqual([]);
});

test("Chain of Vapor: bounce your own Grizzly Bears, sacrifice a land to copy it, and aim the copy at Ana's Hill Giant", async ({ page }) => {
  const s = scene({ hand: ["Chain of Vapor"], board: ["Island", "Mountain", "Grizzly Bears"] }, [{ board: ["Hill Giant"] }]);
  const [bears, giant, mountain] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), idsOf(s, "Mountain", "battlefield", 0)[0]!];
  await open(page, s);
  await card(page, "Chain of Vapor", s).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay");
  await expect(controls(page)).toContainText("Chain of Vapor: Sacrifice a land to copy Chain of Vapor?");
  await controls(page).getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents");
  await page.locator(`[data-obj="${mountain}"]`).click();
  await controls(page).getByRole("button", { name: "Sacrifice" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay");
  await expect(controls(page)).toContainText("Copy Chain of Vapor and choose a new target for the copy?");
  await controls(page).getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "copyTargets");
  await page.locator(`[data-obj="${giant}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "hand");
  expect([after.objects[bears]!.zone, after.objects[mountain]!.zone]).toEqual(["hand", "graveyard"]);
  expect(pageErrors(page)).toEqual([]);
});
