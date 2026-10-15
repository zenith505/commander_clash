// Alternative costs new this round (CR 118.9): Foil's "discard an Island card and another card", Blazing Shoal's red
// card whose mana value sets X (CR 107.3a), Land Grant's "reveal your hand", and a Trap whose condition looks back over
// the turn (Needlebite Trap: "if an opponent gained life this turn"), Invigorate's "have an opponent gain 3 life", and Mogg
// Salvage's "you may cast this spell without paying its mana cost".
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, clickPlayer, menu, modal, resolveUntil } from "./ui";

test("Foil: discard an Island card and another card, the Done button waits for the Island", async ({ page }) => {
  const s = scene({ hand: ["Divination", "Foil", "Island", "Opt", "Shock"], board: ["Island", "Island", "Island"] });
  const [divination, foil, island, opt, shock] = [one(s, "Divination"), one(s, "Foil"), s.players[0]!.hand.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Island")!, one(s, "Opt"), one(s, "Shock")];
  await open(page, s);
  await card(page, "Divination", s).click();
  await expect.poll(async () => (await state(page)).stack.length).toBe(1);
  await card(page, "Foil", s).click();
  await menu(page).getByRole("button", { name: "Cast it: discard an Island card and another card" }).click();
  const top = (await state(page)).stack[0]!.id;
  await page.locator(`[data-stack="${top}"]`).click();
  const pick = modal(page);
  await expect(pick).toContainText("Foil: discard an Island card and another card");
  await expect(pick.locator(`[data-pick="${foil}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${opt}"]`).click();
  await pick.locator(`[data-pick="${shock}"]`).click();
  await expect(pick.getByRole("button", { name: "Done" })).toBeDisabled(); // no Island card among them
  await pick.locator(`[data-pick="${shock}"]`).click();
  await pick.locator(`[data-pick="${island}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[foil]!.zone === "graveyard");
  expect(after.objects[divination]!.zone).toBe("graveyard");
  expect([island, opt, shock].map((id) => after.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "hand"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Blazing Shoal: the red card exiled from your hand sets X", async ({ page }) => {
  const s = scene({ hand: ["Blazing Shoal", "Hill Giant", "Shock"], board: ["Grizzly Bears"] });
  const [shoal, giant, shock, bears] = [one(s, "Blazing Shoal"), one(s, "Hill Giant"), one(s, "Shock"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Blazing Shoal", s).click();
  await menu(page).getByRole("button", { name: "Cast it: exile a red card with mana value X from your hand" }).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  const pick = modal(page);
  await expect(pick).toContainText("Blazing Shoal: exile from your hand a red card: X is its mana value");
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  await expect.poll(async () => (await state(page)).stack[0]?.x).toBe(4);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[shoal]!.zone === "graveyard");
  expect(after.objects[giant]!.zone).toBe("exile");
  expect(after.objects[shock]!.zone).toBe("hand");
  expect(after.log.some((e) => /Grizzly Bears gets \+4\/\+0/.test(e.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Land Grant: reveal a hand with no land cards instead of paying {1}{G}", async ({ page }) => {
  const s = scene({ hand: ["Land Grant", "Shock"], library: ["Forest"] });
  const [grant, forest] = [one(s, "Land Grant"), s.players[0]!.library[0]!];
  await open(page, s);
  await card(page, "Land Grant", s).click();
  await menu(page).getByRole("button", { name: "Cast it: reveal your hand" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await pick.locator(`[data-pick="${forest}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[grant]!.zone === "graveyard");
  expect(after.objects[forest]!.zone).toBe("hand");
  expect(after.log.some((e) => /reveals their hand: Shock/.test(e.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Needlebite Trap: {B} once an opponent gained life this turn", async ({ page }) => {
  const s = scene({ hand: ["Needlebite Trap"], board: ["Swamp"] });
  const trap = one(s, "Needlebite Trap");
  s.turnLog = { gainedLife: [1] };
  await open(page, s);
  await card(page, "Needlebite Trap", s).click();
  await menu(page).getByRole("button", { name: /^Cast it for/ }).click();
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[trap]!.zone === "graveyard");
  expect(after.players[1]!.life).toBe(35);
  expect(after.players[0]!.life).toBe(45);
  expect(pageErrors(page)).toEqual([]);
});

test("Invigorate: have an opponent you pick gain 3 life instead of paying {2}{G}", async ({ page }) => {
  const s = scene({ hand: ["Invigorate"], board: ["Forest", "Grizzly Bears"] });
  const [invigorate, bears] = [one(s, "Invigorate"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Invigorate", s).click();
  await menu(page).getByRole("button", { name: "Cast it: have an opponent gain 3 life" }).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  const bar = page.locator(".gift-pick");
  await expect(bar).toContainText("Invigorate: have an opponent gain 3 life");
  await expect(bar.getByRole("button", { name: "No gift" })).toHaveCount(0);
  await bar.getByRole("button", { name: "Ben gains 3 life" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[invigorate]!.zone === "graveyard");
  expect(after.players.map((p) => p.life)).toEqual([40, 40, 43, 40]);
  expect(after.log.some((e) => /Grizzly Bears gets \+4\/\+4/.test(e.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Mogg Salvage: cast without paying its mana cost while an opponent controls an Island", async ({ page }) => {
  const s = scene({ hand: ["Mogg Salvage"], board: ["Mountain"] }, [{ board: ["Island", "Sol Ring"] }]);
  const [salvage, ring] = [one(s, "Mogg Salvage"), one(s, "Sol Ring")];
  s.battlefield.forEach((id) => s.objects[id]!.controller === 0 && (s.objects[id]!.tapped = true));
  await open(page, s);
  await card(page, "Mogg Salvage", s).click();
  await menu(page).getByRole("button", { name: "Cast it: without paying its mana cost" }).click();
  await page.locator(`[data-obj="${ring}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[salvage]!.zone === "graveyard");
  expect(after.objects[ring]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
