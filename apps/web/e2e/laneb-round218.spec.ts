// Lane B round B218 in the browser: Conundrum Sphinx's card name for each player (yours asked first), Mirror of Fate's
// pick of face-up exiled cards and their order on top of your library, and Fugitive Codebreaker turned face up for its
// reduced disguise cost.
import { expect, test } from "@playwright/test";
import { invalidateCharacteristics } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { attack, controls, menu, modal, resolveUntil } from "./ui";

test("Conundrum Sphinx: attacking, you name Hill Giant and the Hill Giant on top of your library goes into your hand", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Conundrum Sphinx"], library: ["Hill Giant"] });
  const [sphinx, giant] = [one(s, "Conundrum Sphinx"), one(s, "Hill Giant")];
  await open(page, s);
  await controls(page).getByRole("button", { name: "Pass" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers");
  await attack(page, [[sphinx, 1]]);
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "cardName" && st.pending.player === 0);
  // Nothing is revealed before every player has named a card.
  expect(asked.players[0]!.library[0]).toBe(giant);
  const pick = modal(page);
  await expect(pick).toContainText("Conundrum Sphinx: choose a card name");
  await pick.locator("input").fill("Hill Giant");
  await pick.locator('[data-name="Hill Giant"]').click();
  const after = await resolveUntil(page, (st) => st.objects[giant]!.zone === "hand");
  expect(after.log.some((l) => /You reveals? Hill Giant from the top of their library/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Mirror of Fate: pick Hill Giant and Craw Wurm from exile, put Craw Wurm on top; the rest of your library is exiled", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Mirror of Fate"], exile: ["Hill Giant", "Craw Wurm"] });
  const [mirror, giant, wurm] = [one(s, "Mirror of Fate"), one(s, "Hill Giant"), one(s, "Craw Wurm")];
  const library = [...s.players[0]!.library];
  await open(page, s);
  await page.locator(`[data-obj="${mirror}"]`).first().click();
  if (await menu(page).isVisible()) await menu(page).getByRole("button", { name: /Sacrifice/ }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const search = modal(page);
  await expect(search).toContainText("face-up exiled cards you own");
  await search.locator(`[data-pick="${giant}"]`).click();
  await search.locator(`[data-pick="${wurm}"]`).click();
  await search.getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "arrangeTop" && st.pending.player === 0);
  const arrange = page.locator(".modal.arrange");
  await expect(arrange).toContainText("Craw Wurm");
  await arrange.locator(".arrange-card", { has: page.locator(`[data-arrange="${wurm}"]`) }).getByRole("button", { name: "Move toward the top" }).click();
  await arrange.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[mirror]!.zone === "graveyard");
  expect(after.players[0]!.library).toEqual([wurm, giant]);
  expect(library.every((id) => after.objects[id]!.zone === "exile")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Fugitive Codebreaker: with two instants and sorceries in your graveyard, it turns face up for {3}{R}; you discard and draw three", async ({ page }) => {
  const s = scene({ hand: ["Grizzly Bears"], board: [...LANDS, "Fugitive Codebreaker"], yard: ["Lightning Bolt", "Divination"] });
  const [f, bears] = [one(s, "Fugitive Codebreaker"), one(s, "Grizzly Bears")];
  s.objects[f]!.faceDown = "disguise";
  invalidateCharacteristics(s);
  await open(page, s);
  await page.locator(`[data-obj="${f}"]`).first().click();
  const up = menu(page).getByRole("button", { name: /Turn face up: disguise/ });
  await expect(up).toBeEnabled();
  await expect(up.locator(".pip")).toHaveCount(2);
  await up.click();
  const after = await resolveUntil(page, (st) => !st.objects[f]!.faceDown && st.stack.length === 0 && !st.pending);
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(after.players[0]!.hand.length).toBe(3);
  expect(after.battlefield.filter((id) => after.objects[id]!.controller === 0 && after.objects[id]!.tapped).length).toBe(4);
  expect(pageErrors(page)).toEqual([]);
});
