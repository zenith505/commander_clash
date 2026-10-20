// Round 96's prompts: Isochron Scepter's imprint and the copy it casts (Cast it, or Don't, and the copy is gone),
// Mockingbird's copy pick (only creatures with mana value up to the mana spent), and Springheart Nantuko's landfall
// payment for a token copy of the enchanted creature.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, controls, menu, modal, resolveUntil } from "./ui";

test("Isochron Scepter: imprint Shock, then {2},{T} casts a copy of it free, and the copy ceases to exist", async ({ page }) => {
  const s = scene({ hand: ["Isochron Scepter", "Shock"], board: LANDS });
  const [scepter, shock] = [one(s, "Isochron Scepter"), one(s, "Shock")];
  await open(page, s);
  await card(page, "Isochron Scepter", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay");
  await expect(controls(page)).toContainText("Isochron Scepter:");
  await controls(page).getByRole("button", { name: "Yes" }).click();
  await modal(page).locator(`[data-pick="${shock}"]`).click();
  await modal(page).getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[shock]!.zone === "exile");
  await page.locator(`[data-obj="${scepter}"]`).click();
  await menu(page).getByRole("button", { name: /copy the exiled card/ }).click();
  const st = await resolveUntil(page, (x) => x.pending?.kind === "castFree");
  const copy = (st.pending as Extract<NonNullable<typeof st.pending>, { kind: "castFree" }>).objectId;
  expect(copy).not.toBe(shock);
  await expect(controls(page)).toContainText("Isochron Scepter: cast Shock without paying its mana cost?");
  await controls(page).getByRole("button", { name: "Cast it" }).click();
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending && x.players[1]!.life === 38);
  expect(after.objects[copy]).toBeUndefined();
  expect(after.objects[shock]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});

test("Isochron Scepter: don't cast the copy", async ({ page }) => {
  const s = scene({ hand: ["Isochron Scepter", "Shock"], board: LANDS });
  const [scepter, shock] = [one(s, "Isochron Scepter"), one(s, "Shock")];
  await open(page, s);
  await card(page, "Isochron Scepter", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay");
  await controls(page).getByRole("button", { name: "Yes" }).click();
  await modal(page).locator(`[data-pick="${shock}"]`).click();
  await modal(page).getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[shock]!.zone === "exile");
  await page.locator(`[data-obj="${scepter}"]`).click();
  await menu(page).getByRole("button", { name: /copy the exiled card/ }).click();
  const st = await resolveUntil(page, (x) => x.pending?.kind === "castFree");
  const copy = (st.pending as Extract<NonNullable<typeof st.pending>, { kind: "castFree" }>).objectId;
  await controls(page).getByRole("button", { name: "Don't" }).click();
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending);
  expect(after.objects[copy]).toBeUndefined();
  expect(after.players[0]!.exile).toEqual([shock]);
  expect(pageErrors(page)).toEqual([]);
});

test("Mockingbird: X = 2 offers creatures with mana value 3 or less, and it becomes a flying Bird copy", async ({ page }) => {
  const s = scene({ hand: ["Mockingbird"], board: LANDS }, [{ board: ["Grizzly Bears", "Gray Ogre", "Hill Giant"] }]);
  const [bird, bears, ogre, giant] = [one(s, "Mockingbird"), one(s, "Grizzly Bears"), one(s, "Gray Ogre"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Mockingbird", s).click();
  const x = page.locator(".x-pick");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  const st = await resolveUntil(page, (t) => t.pending?.kind === "chooseOption" && t.pending.what === "copy");
  const options = (st.pending as Extract<NonNullable<typeof st.pending>, { kind: "chooseOption" }>).options;
  expect(options).toEqual(expect.arrayContaining([bears, ogre, "none"]));
  expect(options).not.toContain(giant);
  const pick = page.locator(".copy-pick");
  await expect(pick).toContainText("Mockingbird: enter as a copy of");
  await expect(pick.getByRole("button", { name: /Hill Giant/ })).toHaveCount(0);
  await pick.getByRole("button", { name: /Gray Ogre/ }).click();
  const after = await resolveUntil(page, (t) => !t.pending && t.stack.length === 0 && t.objects[bird]!.zone === "battlefield");
  expect(after.cards[after.objects[bird]!.cardId]!.name).toBe("Mockingbird");
  expect(after.cards[after.objects[bird]!.copyOf!]!.name).toBe("Gray Ogre");
  expect(pageErrors(page)).toEqual([]);
});

test("Springheart Nantuko: bestowed, a land enters, pay {1}{G} for a token copy of the enchanted creature", async ({ page }) => {
  const s = scene({ hand: ["Springheart Nantuko", "Forest"], board: [...LANDS, "Hill Giant"] });
  const [nantuko, forest, giant] = [one(s, "Springheart Nantuko"), s.players[0]!.hand.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Forest")!, one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Springheart Nantuko", s).click();
  await menu(page).getByRole("button", { name: /Bestow/ }).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[nantuko]!.attachedTo === giant);
  await page.locator(`[data-obj="${forest}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay");
  await expect(controls(page)).toContainText("Springheart Nantuko:");
  await controls(page).getByRole("button", { name: "Pay", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.battlefield.some((id) => st.objects[id]!.isToken));
  const made = after.battlefield.filter((id) => after.objects[id]!.isToken).map((id) => after.cards[after.objects[id]!.cardId]!.name);
  expect(made).toEqual(["Hill Giant"]);
  expect(pageErrors(page)).toEqual([]);
});
