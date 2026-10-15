// Filter lands' combinations of mana, X damage divided as you choose, and "any number of target players".
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene, state } from "./scene";
import { card, clickPlayer, menu, resolveUntil } from "./ui";

test("Mystic Gate: a button for {C} and for each combination; {W}{U} pays {W/U} with the Island", async ({ page }) => {
  const s = scene({ board: ["Mystic Gate", "Island"] });
  const [gate, island] = [one(s, "Mystic Gate"), idsOf(s, "Island", "battlefield")[0]!];
  await open(page, s);
  await page.locator(`[data-obj="${gate}"]`).click();
  const m = menu(page);
  await expect(m).toBeVisible();
  const add = m.locator("button", { hasText: ": add" });
  await expect(add).toHaveCount(4);
  const wu = add.filter({ has: page.locator("[title='{W}']") }).filter({ has: page.locator("[title='{U}']") });
  await expect(wu).toHaveCount(1);
  await wu.click();
  const after = await state(page);
  expect(after.players[0]!.manaPool).toMatchObject({ W: 1, U: 1, C: 0 });
  expect([after.objects[gate]!.tapped, after.objects[island]!.tapped]).toEqual([true, true]);
  expect(pageErrors(page)).toEqual([]);
});

test("Rolling Thunder: choose X, two targets, then divide X between them", async ({ page }) => {
  const s = scene({ hand: ["Rolling Thunder"], board: LANDS }, [{ board: ["Grizzly Bears", "Hill Giant"] }]);
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Rolling Thunder", s).click();
  const x = page.locator(".x-pick");
  await expect(x).toBeVisible();
  await x.getByLabel("X", { exact: true }).fill("4");
  await x.getByRole("button", { name: "X = 4" }).click();
  const bar = page.locator(".targeting");
  await expect(bar).toContainText("(optional, up to 4 more)");
  await page.locator(`[data-obj="${bears}"]`).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  await bar.getByRole("button", { name: "Done" }).click();
  const panel = page.locator(".targeting", { hasText: "divide the damage" });
  const bearsRow = panel.locator(".divide", { hasText: "Grizzly Bears" });
  const giantRow = panel.locator(".divide", { hasText: "Hill Giant" });
  await expect(bearsRow.locator("strong")).toHaveText("2");
  await expect(giantRow.locator("strong")).toHaveText("2");
  await bearsRow.getByRole("button", { name: "−" }).click();
  await giantRow.getByRole("button", { name: "+" }).click();
  await panel.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[one(s, "Rolling Thunder")]!.zone === "graveyard");
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(after.objects[bears]!.damage).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Stonespeaker Crystal: pick two players, Done, and only their graveyards are exiled", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Stonespeaker Crystal"] }, [{ yard: ["Grizzly Bears"] }, { yard: ["Hill Giant"] }, { yard: ["Llanowar Elves"] }]);
  const [bears, giant, elves] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Llanowar Elves")];
  await open(page, s);
  await page.locator(`[data-obj="${one(s, "Stonespeaker Crystal")}"]`).click();
  await menu(page).getByRole("button", { name: /Exile any number of target players' graveyards/ }).click();
  const bar = page.locator(".targeting");
  await expect(bar).toContainText("(optional, up to 4 more)");
  await clickPlayer(page, 1);
  await clickPlayer(page, 3);
  await bar.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[one(s, "Stonespeaker Crystal")]!.zone === "graveyard");
  expect([bears, giant, elves].map((id) => after.objects[id]!.zone)).toEqual(["exile", "graveyard", "exile"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Meteor Swarm: choose X, exactly X targets, then divide 8 between them", async ({ page }) => {
  const s = scene({ hand: ["Meteor Swarm"], board: LANDS }, [{ board: ["Grizzly Bears", "Hill Giant"] }]);
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Meteor Swarm", s).click();
  const x = page.locator(".x-pick");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  const bar = page.locator(".targeting");
  await page.locator(`[data-obj="${bears}"]`).click();
  // Exactly X targets: no Done with one picked.
  await expect(bar.getByRole("button", { name: "Done" })).toHaveCount(0);
  await page.locator(`[data-obj="${giant}"]`).click();
  const panel = page.locator(".targeting", { hasText: "divide the damage" });
  const bearsRow = panel.locator(".divide", { hasText: "Grizzly Bears" });
  await expect(bearsRow.locator("strong")).toHaveText("4");
  const giantRow = panel.locator(".divide", { hasText: "Hill Giant" });
  for (let i = 0; i < 2; i++) await bearsRow.getByRole("button", { name: "−" }).click();
  // All 8 must be divided.
  await expect(panel.getByRole("button", { name: "divide 8 among the targets" })).toBeDisabled();
  for (let i = 0; i < 2; i++) await giantRow.getByRole("button", { name: "+" }).click();
  await panel.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[one(s, "Meteor Swarm")]!.zone === "graveyard");
  expect([bears, giant].map((id) => after.objects[id]!.zone)).toEqual(["graveyard", "graveyard"]);
  expect(pageErrors(page)).toEqual([]);
});
