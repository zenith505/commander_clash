// Round 360: Knowledge Exploitation's search of an opponent's library, then the free cast of the card found (from that
// library, with the usual "Cast it" prompt); Coffin Queen's untap-step choice to keep it tapped, so the creature it
// returned stays, or untap it, so that creature is exiled.
import { expect, test, type Page } from "@playwright/test";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, clickPlayer, controls, menu, modal, resolveUntil } from "./ui";

test("Knowledge Exploitation: target Ana, pick Divination in her library, cast it free and draw two", async ({ page }) => {
  const s = scene({ hand: ["Knowledge Exploitation"], board: LANDS }, [{ library: ["Grizzly Bears", "Divination"] }]);
  const [ke, div, bears] = [one(s, "Knowledge Exploitation"), one(s, "Divination"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Knowledge Exploitation", s).click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /^Cast it/ }).first().click();
  await clickPlayer(page, 1);
  const found = await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  // Only instant and sorcery cards can be picked.
  expect((found.pending as { cards: string[] }).cards).toContain(div);
  expect((found.pending as { cards: string[] }).cards).not.toContain(bears);
  const pick = modal(page);
  await pick.locator(`[data-pick="${div}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.objectId === div);
  await controls(page).getByRole("button", { name: "Cast it", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[div]!.zone === "graveyard");
  // Divination drew you two cards and went to its owner's graveyard.
  expect(after.players[0]!.hand.length).toBe(2);
  expect(after.players[1]!.graveyard).toContain(div);
  expect(after.objects[ke]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

/** Coffin Queen returns Ana's Grizzly Bears, then the game goes round the table to your next untap step's choice. */
async function queenToUntap(page: Page) {
  const s = scene({ board: [...LANDS, "Coffin Queen"] }, [{ yard: ["Grizzly Bears"] }]);
  const [queen, bears] = [one(s, "Coffin Queen"), one(s, "Grizzly Bears")];
  await open(page, s);
  await page.locator(`[data-obj="${queen}"]`).click();
  await menu(page).getByRole("button", { name: /Put target creature card/ }).click();
  await modal(page).locator(`[data-pick="${bears}"]`).click();
  let now = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[bears]!.zone === "battlefield");
  expect(now.objects[bears]!.controller).toBe(0);
  // Round the table (in the engine, for speed) to your next untap step, where you choose what stays tapped.
  now = playUntil(now, (st) => st.pending?.kind === "pickPermanents" && st.pending.action === "keepTapped" && st.pending.player === 0);
  await open(page, now);
  await expect(controls(page)).toContainText("Untap step: click the permanents you want to keep tapped");
  return { queen, bears };
}

test("Coffin Queen: keep it tapped in the untap step and the returned creature stays", async ({ page }) => {
  const { queen, bears } = await queenToUntap(page);
  await page.locator(`[data-obj="${queen}"]`).click();
  await controls(page).getByRole("button", { name: "Keep 1 tapped" }).click();
  const now = await resolveUntil(page, (st) => st.step === "main1" && st.activePlayer === 0);
  expect(now.objects[queen]!.tapped).toBe(true);
  expect(now.objects[bears]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Coffin Queen: untap it and the returned creature is exiled", async ({ page }) => {
  const { queen, bears } = await queenToUntap(page);
  await controls(page).getByRole("button", { name: "Untap all" }).click();
  const now = await resolveUntil(page, (st) => st.step === "main1" && st.activePlayer === 0 && st.stack.length === 0 && st.objects[bears]!.zone === "exile");
  expect(now.objects[queen]!.tapped).toBe(false);
  expect(now.players[1]!.exile).toContain(bears);
  expect(pageErrors(page)).toEqual([]);
});
