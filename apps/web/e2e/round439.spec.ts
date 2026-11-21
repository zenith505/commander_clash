// Round 439: Sunken Palace (exile seven cards from your graveyard for {U} that copies the spell it's spent on) and Arvinox,
// the Mind Flail (cast the card it exiled face down from the bottom of an opponent's library, paying {G} with an Island).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { menu, modal, resolveUntil, seat } from "./ui";

test("Sunken Palace: exile seven cards for {U}, cast Divination with it, and its copy draws two more", async ({ page }) => {
  const yard = ["Grizzly Bears", "Hill Giant", "Mind Stone", "Craw Wurm", "Llanowar Elves", "Lightning Bolt", "Shock"];
  const s = scene({ hand: ["Divination"], board: [...LANDS, "Sunken Palace"], yard });
  const [palace, divination] = [one(s, "Sunken Palace"), one(s, "Divination")];
  const cards = yard.map((n) => one(s, n));
  await open(page, s);
  await page.locator(`[data-obj="${palace}"]`).click();
  await menu(page).getByRole("button", { name: /Exile seven cards from your graveyard/ }).click();
  const pick = modal(page);
  for (const id of cards) await pick.locator(`[data-pick="${id}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const added = await resolveUntil(page, (st) => st.players[0]!.manaPool.U === 1 && !st.pending);
  expect(cards.every((id) => added.objects[id]!.zone === "exile")).toBe(true);
  expect(added.objects[palace]!.tapped).toBe(true);
  await page.locator(`[data-obj="${divination}"]`).click();
  const item = menu(page).getByRole("button", { name: /^Cast/ });
  if (await item.count()) await item.first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[divination]!.zone === "graveyard");
  expect(after.players[0]!.manaPool.U).toBe(0);
  expect(after.players[0]!.hand).toHaveLength(4);
  expect(pageErrors(page)).toEqual([]);
});

test("Arvinox, the Mind Flail: at your end step it exiles Ana's bottom card face down; cast that Ambush Viper with Islands", async ({ page }) => {
  const s0 = scene({ board: ["Island", "Island", "Arvinox, the Mind Flail"] }, [{ library: ["Ambush Viper"] }]);
  const viper = one(s0, "Ambush Viper");
  const lib = s0.players[1]!.library;
  lib.splice(lib.indexOf(viper), 1);
  lib.push(viper);
  const s = playUntil(s0, (st) => st.step === "end" && st.activePlayer === 0 && !st.stack.length && !st.triggerQueue.length && !st.pending && st.objects[viper]!.zone === "exile");
  expect(s.objects[viper]!.hiddenExile?.seen).toEqual([0]);
  await open(page, s);
  const theirs = seat(page, 1).locator(".zone", { hasText: "Exile" });
  await theirs.click();
  await expect(modal(page).locator(".zone-tag")).toHaveText("face down");
  await modal(page).locator(".card.playable", { hasText: "Ambush Viper" }).click();
  const item = menu(page).getByRole("button", { name: /^Cast/ });
  if (await item.count()) await item.first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[viper]!.zone === "battlefield");
  expect(after.objects[viper]!.controller).toBe(0);
  expect(after.objects[viper]!.owner).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});
