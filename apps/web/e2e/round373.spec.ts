// Round 373: Nashi, Moon's Legacy's attack trigger (a legendary or Rat card from your graveyard, its copy cast for its
// cost), Helm of Obedience's X, opponent and creature card picked from among the milled cards, Spectral Searchlight's
// button for each other player (who chooses the color), and Fell Beast's Shriek's creatures chosen by each opponent.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { attack, card, clickPlayer, controls, menu, modal, passTo, resolveUntil } from "./ui";

test("Nashi, Moon's Legacy: as it attacks, exile Typhoid Rats from your graveyard and cast its copy for {B}; Grizzly Bears isn't offered", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Nashi, Moon's Legacy"], yard: ["Typhoid Rats", "Grizzly Bears"] });
  const [nashi, rats, bears] = ["Nashi, Moon's Legacy", "Typhoid Rats", "Grizzly Bears"].map((n) => one(s, n));
  await open(page, s);
  await passTo(page, "declareAttackers");
  await attack(page, [[nashi!, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  await expect(modal(page).locator(`[data-pick="${bears}"]`)).toHaveCount(0);
  await modal(page).locator(`[data-pick="${rats}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong" && st.pending.player === 0);
  const bar = controls(page);
  await bar.getByRole("button", { name: "Typhoid Rats" }).click();
  const offer = await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.player === 0);
  expect(offer.pending?.kind === "castFree" && offer.pending.how).toBe("paid");
  expect(offer.objects[rats!]!.zone).toBe("exile");
  await bar.getByRole("button", { name: "Cast it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.battlefield.some((id) => st.objects[id]!.isToken && st.cards[st.objects[id]!.cardId]?.name === "Typhoid Rats"));
  expect(after.objects[rats!]!.zone).toBe("exile");
  expect(after.objects[bears!]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Helm of Obedience: X = 5 at Ana; she mills Mind Stone, then Hill Giant; pick the Giant, which enters under your control", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Helm of Obedience"] }, [{ library: ["Mind Stone", "Hill Giant", "Grizzly Bears"] }]);
  const [helm, stone, giant, bears] = ["Helm of Obedience", "Mind Stone", "Hill Giant", "Grizzly Bears"].map((n) => one(s, n));
  await open(page, s);
  await page.locator(`[data-obj="${helm}"]`).first().click();
  const item = menu(page).locator("button", { hasText: "mills a card" });
  if (await item.count()) await item.click();
  const x = page.locator(".x-pick");
  await x.getByLabel("X", { exact: true }).fill("5");
  await x.getByRole("button", { name: "X = 5" }).click();
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const pick = modal(page);
  await expect(pick).toContainText("Ana's graveyard");
  await pick.locator(`[data-pick="${giant}"]`).click();
  if (await pick.getByRole("button", { name: "Done" }).count()) await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant!]!.zone === "battlefield");
  expect(after.objects[giant!]!.controller).toBe(0);
  expect(after.objects[stone!]!.zone).toBe("graveyard");
  expect(after.objects[bears!]!.zone).toBe("library");
  expect(after.objects[helm!]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Spectral Searchlight: its menu has a color for you and a button for each other player; Ana adds one mana of the color she chooses", async ({ page }) => {
  const s = scene({ board: ["Spectral Searchlight"] });
  const light = one(s, "Spectral Searchlight");
  await open(page, s);
  await page.locator(`[data-obj="${light}"]`).first().click();
  await expect(menu(page).locator("[data-mana-to]")).toHaveCount(3);
  await expect(menu(page).locator('[data-mana-to="1"]')).toContainText("Ana adds one mana of any color they choose");
  await menu(page).locator('[data-mana-to="1"]').click();
  const after = await resolveUntil(page, (st) => !st.pending && Object.values(st.players[1]!.manaPool).reduce((a, b) => a + b, 0) === 1);
  expect(Object.values(after.players[0]!.manaPool).reduce((a, b) => a + b, 0)).toBe(0);
  expect(after.players[1]!.manaPool.C).toBe(0);
  expect(after.objects[light]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Fell Beast's Shriek: each opponent chooses a creature of theirs; the chosen ones are tapped and goaded", async ({ page }) => {
  const s = scene({ hand: ["Fell Beast's Shriek"], board: LANDS }, [{ board: ["Grizzly Bears", "Hill Giant"] }, { board: ["Savannah Lions"] }]);
  const [shriek, lions] = [one(s, "Fell Beast's Shriek"), one(s, "Savannah Lions")];
  await open(page, s);
  await card(page, "Fell Beast's Shriek", s).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[shriek]!.zone === "graveyard");
  const ana = after.battlefield.filter((id) => after.objects[id]!.controller === 1 && after.objects[id]!.tapped && ["Grizzly Bears", "Hill Giant"].includes(after.cards[after.objects[id]!.cardId]!.name));
  expect(ana.length).toBe(1);
  expect(after.objects[lions]!.tapped).toBe(true);
  expect(after.effects.some((e) => e.affected?.includes(lions) && e.mods.some((m) => m.kind === "goad"))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
