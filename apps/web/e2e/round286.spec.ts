// Round 286 in the browser: Burning-Rune Demon's search takes exactly two cards or none (Done stays off with one), then
// you choose the opponent who picks the one for your hand; Angelic Aberration sacrifices the creatures you click among
// those with base power or toughness 1 or less; Domineering Will gives up to three creatures to the player you click.
import { expect, test } from "@playwright/test";
import { characteristics } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, controls, modal, resolveUntil } from "./ui";

test("Burning-Rune Demon: one card found isn't enough, two are; Ben picks which goes to your hand", async ({ page }) => {
  const s = scene({ hand: ["Burning-Rune Demon"], board: LANDS, library: ["Sol Ring", "Mind Stone", "Burning-Rune Demon"] });
  const [ring, stone] = [one(s, "Sol Ring"), one(s, "Mind Stone")];
  const other = s.players[0]!.library.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Burning-Rune Demon")!;
  await open(page, s);
  await card(page, "Burning-Rune Demon", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay");
  await controls(page).getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const search = modal(page);
  // Another Burning-Rune Demon can't be found.
  await expect(search.locator(`[data-pick="${other}"]`)).toHaveCount(0);
  await search.locator(`[data-pick="${ring}"]`).click();
  await expect(search).toContainText("Found 1: exactly 2 or none.");
  await expect(search.getByRole("button", { name: "Done" })).toBeDisabled();
  await search.locator(`[data-pick="${stone}"]`).click();
  await search.getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "opponent");
  await controls(page).getByRole("button", { name: "Ben", exact: true }).click();
  // Ben (a bot) chooses one of the two; it goes to your hand and the other to your graveyard.
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[ring]!.zone !== "library");
  expect([after.objects[ring]!.zone, after.objects[stone]!.zone].sort()).toEqual(["graveyard", "hand"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Angelic Aberration: sacrifice Llanowar Elves and Ornithopter, not Grizzly Bears; two 4/4 Angels", async ({ page }) => {
  const s = scene({ hand: ["Angelic Aberration"], board: [...LANDS, "Llanowar Elves", "Ornithopter", "Grizzly Bears"] });
  const [elves, thopter, bears] = [one(s, "Llanowar Elves"), one(s, "Ornithopter"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Angelic Aberration", s).click();
  const at = await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  const offered = (at.pending as { options?: string[]; cards?: string[] }).options ?? (at.pending as { cards?: string[] }).cards ?? [];
  expect(offered).toEqual(expect.arrayContaining([elves, thopter]));
  expect(offered).not.toContain(bears);
  await page.locator(`[data-obj="${elves}"]`).click();
  await page.locator(`[data-obj="${thopter}"]`).click();
  await controls(page).getByRole("button", { name: "Sacrifice", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[elves]!.zone === "graveyard");
  expect(after.objects[thopter]!.zone).toBe("graveyard");
  expect(after.objects[bears]!.zone).toBe("battlefield");
  const angels = after.battlefield.filter((id) => after.objects[id]!.isToken && after.objects[id]!.controller === 0);
  expect(angels).toHaveLength(2);
  expect(pageErrors(page)).toEqual([]);
});

test("Domineering Will: click Ana, then two of Ben's creatures and Done; Ana controls them, untapped", async ({ page }) => {
  const s = scene({ hand: ["Domineering Will"], board: LANDS }, [{}, { board: ["Grizzly Bears", "Hill Giant"] }]);
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  s.objects[bears]!.tapped = true;
  await open(page, s);
  await card(page, "Domineering Will", s).click();
  await clickPlayer(page, 1);
  const bar = page.locator(".targeting");
  await page.locator(`[data-obj="${bears}"]`).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  await bar.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[one(s, "Domineering Will")]!.zone === "graveyard");
  expect(after.objects[bears]!.tapped).toBe(false);
  expect([characteristics(after, after.objects[bears]!).controller, characteristics(after, after.objects[giant]!).controller]).toEqual([1, 1]);
  expect(pageErrors(page)).toEqual([]);
});
