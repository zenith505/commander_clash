// Round 151's prompts: Ao, the Dawn Sky's pick from the top seven with a total mana value limit, Memory's Journey's
// player and card targets (cards from that player's graveyard only), Kitesail Larcenist's one target for each player,
// and Dina's Guidance's "into your hand or graveyard".
import { expect, test } from "@playwright/test";
import { characteristics, objIsType } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, controls, modal, resolveUntil } from "./ui";

test("Ao, the Dawn Sky: dies, first mode; nonland permanent cards with total mana value 4 or less onto the battlefield", async ({ page }) => {
  const s = scene({ hand: ["Murder"], board: [...LANDS, "Ao, the Dawn Sky"], library: ["Grizzly Bears", "Ornithopter", "Hill Giant", "Llanowar Elves", "Opt", "Island", "Sol Ring"] });
  const [bears, thopter, giant, elves, opt] = [one(s, "Grizzly Bears"), one(s, "Ornithopter"), one(s, "Hill Giant"), one(s, "Llanowar Elves"), one(s, "Opt")];
  await open(page, s);
  await card(page, "Murder", s).click();
  await page.locator(`[data-obj="${one(s, "Ao, the Dawn Sky")}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseModes");
  const modes = page.locator(".mode-menu");
  await modes.getByRole("button", { name: /Look at the top seven cards/ }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  // Opt isn't a permanent card.
  await expect(pick.locator(`[data-pick="${opt}"]`)).toHaveClass(/dim/);
  await pick.locator(`[data-pick="${bears}"]`).click();
  // Hill Giant (4) would take the total to 6.
  await expect(pick.locator(`[data-pick="${giant}"]`)).toHaveClass(/dim/);
  await pick.locator(`[data-pick="${elves}"]`).click();
  await pick.locator(`[data-pick="${thopter}"]`).click();
  await expect(pick).toContainText("Ao, the Dawn Sky: put any number of nonland permanent cards with total mana value 4 or less onto the battlefield");
  await expect(pick).toContainText("Total mana value 3 of at most 4.");
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "battlefield");
  expect([bears, elves, thopter, giant, opt].map((id) => after.objects[id]!.zone)).toEqual(["battlefield", "battlefield", "battlefield", "library", "library"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Memory's Journey: target Ana, then two cards from her graveyard; yours can't be chosen; they're shuffled into her library", async ({ page }) => {
  const s = scene({ hand: ["Memory's Journey"], board: LANDS, yard: ["Llanowar Elves"] }, [{ yard: ["Hill Giant", "Grizzly Bears", "Ornithopter"] }]);
  const [giant, bears, thopter, elves] = [one(s, "Hill Giant"), one(s, "Grizzly Bears"), one(s, "Ornithopter"), one(s, "Llanowar Elves")];
  await open(page, s);
  await card(page, "Memory's Journey", s).click();
  await clickPlayer(page, 1);
  const pick = modal(page);
  await expect(pick.locator(`[data-pick="${elves}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.locator(`[data-pick="${bears}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "library");
  expect([giant, bears, thopter, elves].map((id) => after.objects[id]!.zone)).toEqual(["library", "library", "graveyard", "graveyard"]);
  expect(after.players[1]!.library).toContain(giant);
  expect(pageErrors(page)).toEqual([]);
});

test("Kitesail Larcenist: Ana's Hill Giant and Cy's Sol Ring become Treasures", async ({ page }) => {
  const s = scene({ hand: ["Kitesail Larcenist"], board: LANDS }, [{ board: ["Hill Giant"] }, {}, { board: ["Sol Ring"] }]);
  const [giant, ring] = [one(s, "Hill Giant"), one(s, "Sol Ring")];
  await open(page, s);
  await card(page, "Kitesail Larcenist", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets");
  const panel = page.locator(".targeting", { hasText: "Kitesail Larcenist" });
  await expect(panel).toContainText("one for each player: You —, Ana —, Ben —, Cy —");
  await page.locator(`[data-obj="${ring}"]`).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  await expect(panel).toContainText("You —, Ana Hill Giant, Ben —, Cy Sol Ring");
  await panel.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && !objIsType(st, st.objects[giant]!, "Creature"));
  for (const id of [giant, ring]) expect(characteristics(after, after.objects[id]!).subtypes).toEqual(["Treasure"]);
  expect(objIsType(after, after.objects[one(s, "Kitesail Larcenist")]!, "Creature")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Dina's Guidance: find Hill Giant and put it into your graveyard", async ({ page }) => {
  const s = scene({ hand: ["Dina's Guidance"], board: LANDS, library: ["Hill Giant"] });
  const giant = one(s, "Hill Giant");
  await open(page, s);
  await card(page, "Dina's Guidance", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  await modal(page).locator(`[data-pick="${giant}"]`).click();
  await modal(page).getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay");
  const bar = controls(page);
  await expect(bar).toContainText("Put Hill Giant into your graveyard (if you don't, into your hand)?");
  await bar.getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "graveyard");
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
