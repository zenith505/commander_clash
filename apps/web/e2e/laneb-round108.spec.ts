// Lane B round B108 in the browser: Suffer the Past's targets, X cards that must all be in the graveyard of the player it
// targets (CR 601.2c, 107.3a), and Dimir Machinations' pick of any number of the top three cards to exile.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, modal, resolveUntil } from "./ui";

test("Suffer the Past: X = 2, target Ana, then two cards from her graveyard; yours can't be chosen", async ({ page }) => {
  const s = scene({ hand: ["Suffer the Past"], board: LANDS, yard: ["Llanowar Elves"] }, [{ yard: ["Hill Giant", "Grizzly Bears", "Ornithopter"] }]);
  const [giant, bears, thopter, elves] = [one(s, "Hill Giant"), one(s, "Grizzly Bears"), one(s, "Ornithopter"), one(s, "Llanowar Elves")];
  await open(page, s);
  await card(page, "Suffer the Past", s).click();
  const x = page.locator(".x-pick");
  await expect(x).toBeVisible();
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  await clickPlayer(page, 1);
  const pick = modal(page);
  await expect(pick.locator(`[data-pick="${elves}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.locator(`[data-pick="${bears}"]`).click();
  if (await pick.getByRole("button", { name: "Done" }).count()) await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "exile");
  expect([giant, bears, thopter, elves].map((id) => after.objects[id]!.zone)).toEqual(["exile", "exile", "graveyard", "graveyard"]);
  expect(after.players[1]!.life).toBe(s.players[1]!.life - 2);
  expect(after.players[0]!.life).toBe(s.players[0]!.life + 2);
  expect(pageErrors(page)).toEqual([]);
});

test("Dimir Machinations: exile one of Ana's top three cards, then put the other two back", async ({ page }) => {
  const s = scene({ hand: ["Dimir Machinations"], board: LANDS }, [{ library: ["Hill Giant", "Grizzly Bears", "Ornithopter"] }]);
  const [giant, bears, thopter] = [one(s, "Hill Giant"), one(s, "Grizzly Bears"), one(s, "Ornithopter")];
  await open(page, s);
  await card(page, "Dimir Machinations", s).click();
  // Cast it, not its transmute.
  await page.getByRole("button", { name: /^Cast it/ }).click();
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await pick.locator(`[data-pick="${bears}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  // Then the other two, in the order you choose, on top of Ana's library.
  const mid = await resolveUntil(page, (x) => x.pending?.kind === "arrangeTop" && x.pending.player === 0);
  expect(mid.objects[bears]!.zone).toBe("exile");
  const order = mid.pending?.kind === "arrangeTop" ? mid.pending.cards : [];
  expect(new Set(order)).toEqual(new Set([giant, thopter]));
  const arrange = page.locator(".modal.arrange");
  await expect(arrange).toContainText("Dimir Machinations");
  await arrange.locator(".arrange-card", { has: page.locator(`[data-arrange="${order[1]}"]`) }).getByRole("button", { name: "Move toward the top" }).click();
  await arrange.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0);
  expect([giant, bears, thopter].map((id) => after.objects[id]!.zone)).toEqual(["library", "exile", "library"]);
  expect(after.players[1]!.library.slice(0, 2)).toEqual([order[1], order[0]]);
  expect(pageErrors(page)).toEqual([]);
});
