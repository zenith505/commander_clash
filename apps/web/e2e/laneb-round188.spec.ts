// Round B188's prompts: Revival Experiment's pick of up to one card of each permanent type from your graveyard (CR 110.4),
// and Say Its Name's graveyard ability, whose cost is two other cards named Say Its Name clicked in the graveyard, then
// the choice to search your library too (CR 701.23) and the pick of Altanak.
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

test("Revival Experiment: one card of each permanent type, a second creature refused, 3 life for each", async ({ page }) => {
  const s = scene({ hand: ["Revival Experiment"], board: LANDS, yard: ["Grizzly Bears", "Hill Giant", "Sol Ring", "Glorious Anthem", "Lightning Bolt"] });
  const [bears, giant, ring, anthem, bolt] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Sol Ring"), one(s, "Glorious Anthem"), one(s, "Lightning Bolt")];
  await open(page, s);
  await card(page, "Revival Experiment", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await expect(pick).toContainText("one for each of");
  // An instant isn't a permanent card.
  await expect(pick.locator(`[data-pick="${bolt}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${bears}"]`).click();
  // The creature is taken: Hill Giant can't be the second.
  await expect(pick.locator(`[data-pick="${giant}"]`)).toHaveClass(/dim/);
  await pick.locator(`[data-pick="${ring}"]`).click();
  await pick.locator(`[data-pick="${anthem}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[bears]!.zone === "battlefield");
  expect([bears, ring, anthem, giant, bolt].map((id) => after.objects[id]!.zone)).toEqual(["battlefield", "battlefield", "battlefield", "graveyard", "graveyard"]);
  expect(after.players[0]!.life).toBe(40 - 9);
  expect(after.objects[one(s, "Revival Experiment")]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});

test("Say Its Name: exile it and two others from the graveyard, search only graveyard and hand, Altanak enters", async ({ page }) => {
  const s = scene({ hand: ["Altanak, the Thrice-Called"], yard: ["Say Its Name", "Say Its Name", "Say Its Name", "Grizzly Bears"] });
  const copies = idsOf(s, "Say Its Name");
  const altanak = one(s, "Altanak, the Thrice-Called");
  await open(page, s);
  await page.locator('[data-graveyard="0"]').click();
  await modal(page).locator(".card.playable", { hasText: "Say Its Name" }).first().click();
  await menu(page).locator("button", { hasText: /Exile/ }).click();
  const cost = modal(page);
  await expect(cost).toContainText("Say Its Name: exile from your graveyard 2 cards named Say Its Name");
  // Grizzly Bears isn't named Say Its Name.
  await expect(cost.locator(`[data-pick="${one(s, "Grizzly Bears")}"]`)).toHaveCount(0);
  const others = await cost.locator("[data-pick]").evaluateAll((els) => els.map((e) => e.getAttribute("data-pick")!));
  expect(others).toHaveLength(2);
  for (const id of others) await cost.locator(`[data-pick="${id}"]`).click();
  await cost.getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "searchZones");
  await controls(page).getByRole("button", { name: "Graveyard and hand only" }).click();
  // Altanak found in your hand.
  await resolveUntil(page, (x) => x.pending?.kind === "searchLibrary");
  await modal(page).locator(`[data-pick="${altanak}"]`).click();
  await modal(page).getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && x.objects[altanak]!.zone === "battlefield");
  expect(copies.map((id) => after.objects[id]!.zone)).toEqual(["exile", "exile", "exile"]);
  expect(after.objects[altanak]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
