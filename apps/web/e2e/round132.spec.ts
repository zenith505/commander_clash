// Round 132's prompts: Doubling Cube's mana menu offers each way to pay its {3} from the pool and shows what's left
// doubled; Atraxa, Grand Unifier's pick of one card for each card type; Selective Obliteration's color, chosen by each
// player for their own permanents.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

test("Doubling Cube: pay {3} with {U}{U}{C} from the pool, and the {W}{W} left becomes {W}{W}{W}{W}", async ({ page }) => {
  const s = scene({ board: ["Doubling Cube"] });
  const cube = one(s, "Doubling Cube");
  s.players[0]!.manaPool = { W: 2, U: 2, B: 0, R: 0, G: 0, C: 1 };
  await open(page, s);
  await card(page, "Doubling Cube", s).click();
  // {W}{W}{U}, {W}{W}{C}, {W}{U}{U}, {W}{U}{C}, {U}{U}{C}: every way to pay {3} from the pool.
  const buttons = menu(page).locator("button", { hasText: "pay with" });
  await expect(buttons).toHaveCount(5);
  const uuc = buttons.nth(4);
  await expect(uuc.locator("[title='{W}']")).toHaveCount(2);
  await expect(uuc.locator("[title='{U}']")).toHaveCount(2);
  await uuc.click();
  await expect.poll(async () => (await state(page)).players[0]!.manaPool.W).toBe(4);
  const after = await state(page);
  expect(after.players[0]!.manaPool).toMatchObject({ W: 4, U: 0, C: 0 });
  expect(after.objects[cube]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Atraxa, Grand Unifier: one card of each card type; a second creature doesn't fit", async ({ page }) => {
  const s = scene({ hand: ["Atraxa, Grand Unifier"], board: LANDS, library: ["Grizzly Bears", "Hill Giant", "Forest", "Opt", "Sol Ring"] });
  const [bears, giant, opt, ring] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Opt"), one(s, "Sol Ring")];
  const forest = s.players[0]!.library[2]!;
  await open(page, s);
  await card(page, "Atraxa, Grand Unifier", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await expect(pick).toContainText("Atraxa, Grand Unifier: put a card of each card type into your hand");
  await pick.locator(`[data-pick="${bears}"]`).click();
  await expect(pick.locator(`[data-pick="${giant}"]`)).toHaveClass(/dim/);
  for (const id of [forest, opt, ring]) await pick.locator(`[data-pick="${id}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect([bears, forest, opt, ring].map((id) => after.objects[id]!.zone)).toEqual(["hand", "hand", "hand", "hand"]);
  expect(after.objects[giant]!.zone).toBe("library");
  expect(pageErrors(page)).toEqual([]);
});

test("Selective Obliteration: you choose green, so your Hill Giant goes and Grizzly Bears stays", async ({ page }) => {
  // Its {C}{C} comes from Sol Ring.
  const s = scene({ hand: ["Selective Obliteration"], board: [...LANDS, "Sol Ring", "Grizzly Bears", "Hill Giant"] }, [{ board: ["Llanowar Elves", "Goblin Piker", "Raging Goblin"] }]);
  const [bears, giant, elves, piker] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Llanowar Elves"), one(s, "Goblin Piker")];
  await open(page, s);
  await card(page, "Selective Obliteration", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "color" && st.pending.player === 0);
  await expect(controls(page)).toContainText("Selective Obliteration");
  await controls(page).getByRole("button", { name: "Green" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect([bears, giant].map((id) => after.objects[id]!.zone)).toEqual(["battlefield", "exile"]);
  // The bot chose red, the color of most of its permanents: the Elves go.
  expect([elves, piker].map((id) => after.objects[id]!.zone)).toEqual(["exile", "battlefield"]);
  // Lands and Sol Ring are colorless: they all stay.
  expect(after.battlefield.filter((id) => after.objects[id]!.controller === 0).length).toBe(LANDS.length + 2);
  expect(pageErrors(page)).toEqual([]);
});
