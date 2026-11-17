// Round 376: Dream Halls' alternative cost (a menu entry, then the discard picker offering only cards that share a color),
// Emergent Ultimatum's search, opponent and free casts, Thieves' Auction's draft picker, and Warp World cast through.
import { expect, test } from "@playwright/test";
import { idsOf, LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

test("Dream Halls: cast Hill Giant by discarding Shock (red), not Llanowar Elves (green)", async ({ page }) => {
  const s = scene({ hand: ["Hill Giant", "Shock", "Llanowar Elves"] }, [{ board: ["Dream Halls"] }]);
  const [giant, shock, elves] = ["Hill Giant", "Shock", "Llanowar Elves"].map((n) => one(s, n)) as [string, string, string];
  await open(page, s);
  await card(page, "Hill Giant", s).click();
  await menu(page).getByRole("button", { name: "Cast it: discard a card that shares a color with it" }).click();
  const pick = modal(page);
  await expect(pick).toContainText("discard a card that shares a color with it");
  await expect(pick.locator(`[data-pick="${elves}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${shock}"]`).click();
  if (await pick.getByRole("button", { name: "Done" }).count()) await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[giant]!.zone === "battlefield");
  expect(after.objects[shock]!.zone).toBe("graveyard");
  expect(after.objects[elves]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});

test("Emergent Ultimatum: find three monocolored cards, Ana shuffles one back, cast the other two for free", async ({ page }) => {
  const s = scene({ hand: ["Emergent Ultimatum"], board: LANDS, library: ["Grizzly Bears", "Hill Giant", "Llanowar Elves", "Ornithopter"] });
  const [ult, bears, giant, elves, thopter] = ["Emergent Ultimatum", "Grizzly Bears", "Hill Giant", "Llanowar Elves", "Ornithopter"].map((n) => one(s, n)) as [string, string, string, string, string];
  await open(page, s);
  await card(page, "Emergent Ultimatum", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const pick = modal(page);
  // Ornithopter is colorless: not monocolored.
  await expect(pick.locator(`[data-pick="${thopter}"]`)).toHaveCount(0);
  for (const id of [bears, giant, elves]) await pick.locator(`[data-pick="${id}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "opponent" && st.pending.player === 0);
  await controls(page).getByRole("button", { name: "Ana" }).click();
  // Ana shuffles the best of them back (a bot: Hill Giant); the other two may be cast.
  const offer = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong" && st.pending.player === 0);
  const back = [bears, giant, elves].find((id) => offer.objects[id]!.zone === "library")!;
  expect(back).toBeTruthy();
  const rest = [bears, giant, elves].filter((id) => id !== back);
  const bar = controls(page);
  const name = (id: string) => offer.cards[offer.objects[id]!.cardId]!.name;
  await bar.getByRole("button", { name: name(rest[0]!) }).click();
  await bar.getByRole("button", { name: "Cast it" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong" && !st.pending.options.includes(rest[0]!));
  await bar.getByRole("button", { name: name(rest[1]!) }).click();
  await bar.getByRole("button", { name: "Cast it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[ult]!.zone === "exile");
  expect(rest.map((id) => after.objects[id]!.zone)).toEqual(["battlefield", "battlefield"]);
  expect(after.objects[back]!.zone).toBe("library");
  expect(pageErrors(page)).toEqual([]);
});

test("Thieves' Auction: everything is exiled; you choose first, Ana's Hill Giant, then a Mountain", async ({ page }) => {
  const mountains = Array.from({ length: 7 }, () => "Mountain");
  const s = scene({ hand: ["Thieves' Auction"], board: mountains }, [{ board: ["Hill Giant"] }]);
  const [auction, giant] = ["Thieves' Auction", "Hill Giant"].map((n) => one(s, n)) as [string, string];
  const lands = idsOf(s, "Mountain", "battlefield", 0);
  await open(page, s);
  await card(page, "Thieves' Auction", s).click();
  const first = await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  expect(first.objects[giant]!.zone).toBe("exile");
  const pick = modal(page);
  await expect(pick).toContainText("to put onto the battlefield tapped under your control");
  await pick.locator(`[data-pick="${giant}"]`).click();
  if (await pick.getByRole("button", { name: "Done" }).count()) await pick.getByRole("button", { name: "Done" }).click();
  // Ana, Ben and Cy each take a Mountain; then it's your pick again.
  const second = await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0 && st.objects[giant]!.zone === "battlefield");
  expect(second.objects[giant]!.controller).toBe(0);
  expect(second.objects[giant]!.tapped).toBe(true);
  const left = (second.pending as { cards: string[] }).cards;
  await modal(page).locator(`[data-pick="${left[0]}"]`).click();
  if (await modal(page).getByRole("button", { name: "Done" }).count()) await modal(page).getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[auction]!.zone === "graveyard");
  // 8 cards: you 2, Ana 2, Ben 2, Cy 2, all tapped.
  const mine = lands.filter((id) => after.objects[id]!.zone === "battlefield" && after.objects[id]!.controller === 0);
  expect(mine).toHaveLength(1);
  expect(lands.every((id) => after.objects[id]!.zone === "battlefield" && after.objects[id]!.tapped)).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Warp World: your permanents are shuffled away and as many cards from the top come back", async ({ page }) => {
  const s = scene({ hand: ["Warp World"], board: [...Array.from({ length: 8 }, () => "Mountain"), "Grizzly Bears"] });
  const [warp, bears] = ["Warp World", "Grizzly Bears"].map((n) => one(s, n)) as [string, string];
  await open(page, s);
  await card(page, "Warp World", s).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[warp]!.zone === "graveyard");
  // Nine permanents went into the library; nine cards came back (the library holds only basic lands and the Bears).
  expect(after.battlefield.filter((id) => after.objects[id]!.owner === 0)).toHaveLength(9);
  expect(after.log.some((l) => /You shuffles 9 permanents into their library and reveals/.test(l.text))).toBe(true);
  expect(["library", "battlefield"]).toContain(after.objects[bears]!.zone);
  expect(pageErrors(page)).toEqual([]);
});
