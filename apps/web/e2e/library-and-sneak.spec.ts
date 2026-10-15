// PR #24: ordering cards on the bottom of your library, sneak from the cast menu, playing the top card of your
// library by clicking it, and viewing an opponent's revealed hand.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { attack, card, controls, menu, modal, resolveUntil, seat } from "./ui";

test("Impulse: take one, then order the rest on the bottom of your library with the arrows", async ({ page }) => {
  const s = scene({ hand: ["Impulse"], board: LANDS, library: ["Grizzly Bears", "Hill Giant", "Llanowar Elves", "Shock"] });
  const [bears, giant, elves, shock] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Llanowar Elves"), one(s, "Shock")];
  await open(page, s);
  await card(page, "Impulse", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  await modal(page).locator(`[data-pick="${shock}"]`).click();
  await modal(page).getByRole("button", { name: "Done" }).click();
  const arrange = page.locator(".modal.arrange");
  await expect(arrange).toContainText("Impulse: put 3 cards on the bottom of your library in any order");
  const order = () => arrange.locator("[data-arrange]").evaluateAll((els) => els.map((e) => e.getAttribute("data-arrange")));
  expect(await order()).toEqual([bears, giant, elves]);
  // Move the Bears one deeper, then the Bears again: it ends at the very bottom.
  await arrange.locator(".arrange-card", { has: page.locator(`[data-arrange="${bears}"]`) }).getByRole("button", { name: "Move deeper" }).click();
  await arrange.locator(".arrange-card", { has: page.locator(`[data-arrange="${bears}"]`) }).getByRole("button", { name: "Move deeper" }).click();
  expect(await order()).toEqual([giant, elves, bears]);
  await expect(arrange.locator(".arrange-card", { has: page.locator(`[data-arrange="${bears}"]`) })).toContainText("Bottom");
  await arrange.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0);
  expect(after.players[0]!.library.slice(-3)).toEqual([giant, elves, bears]);
  expect(after.objects[shock]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});

test("Sneak: after blockers, cast it from the menu by returning an unblocked attacker", async ({ page }) => {
  const s = scene({ hand: ["Leonardo, Big Brother"], board: [...LANDS, "Grizzly Bears"] });
  const [leo, bears] = [one(s, "Leonardo, Big Brother"), one(s, "Grizzly Bears")];
  await open(page, s);
  // Not before combat.
  await card(page, "Leonardo, Big Brother", s).click();
  await expect(menu(page).getByRole("button", { name: /^Sneak/ })).toBeDisabled();
  await menu(page).getByRole("button", { name: "Close" }).click();
  await controls(page).getByRole("button", { name: "Pass" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers");
  await attack(page, [[bears, 1]]);
  // You stop after blocks because you could sneak.
  await resolveUntil(page, (st) => st.step === "declareBlockers" && !st.pending && st.priority === 0);
  await card(page, "Leonardo, Big Brother", s).click();
  await menu(page).getByRole("button", { name: /^Sneak/ }).click();
  const bar = page.locator(".targeting", { hasText: "return" });
  await page.locator(`[data-obj="${bears}"]`).click();
  await bar.getByRole("button", { name: "Return and cast" }).click();
  const after = await resolveUntil(page, (st) => st.objects[leo]!.zone === "battlefield" && st.stack.length === 0);
  expect(after.objects[leo]).toMatchObject({ tapped: true, attacking: 1 });
  expect(after.objects[bears]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});

test("Future Sight: click the revealed top card of your library to cast it", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Future Sight"], library: ["Hill Giant"] });
  const giant = one(s, "Hill Giant");
  await open(page, s);
  const library = seat(page, 0).locator(".zone", { hasText: "Library" });
  await expect(library.locator(".zone-title")).toHaveText("Library ✦");
  await library.locator(`[data-obj="${giant}"]`).click();
  await resolveUntil(page, (st) => st.objects[giant]!.zone === "battlefield" && st.stack.length === 0);
  expect(pageErrors(page)).toEqual([]);
});

test("Courser of Kruphix: click the land on top of your library to play it", async ({ page }) => {
  const s = scene({ board: ["Courser of Kruphix"], library: ["Forest", "Hill Giant"] });
  const forest = s.players[0]!.library[0]!; // every library has Forests: this one is on top of yours
  await open(page, s);
  const library = seat(page, 0).locator(".zone", { hasText: "Library" });
  await expect(library.locator(".zone-title")).toHaveText("Library ✦");
  await library.locator(`[data-obj="${forest}"]`).click();
  // Landfall: you gain 1 life. The next card is revealed but can't be played (only lands, and one land a turn).
  const after = await resolveUntil(page, (st) => st.objects[forest]!.zone === "battlefield" && st.stack.length === 0);
  expect(after.players[0]!.life).toBe(41);
  await expect(library.locator(`[data-obj="${one(s, "Hill Giant")}"]`)).toBeVisible();
  await expect(library.locator(".zone-title")).toHaveText("Library");
  expect(pageErrors(page)).toEqual([]);
});

test("Telepathy: an opponent's revealed hand opens from their Hand count", async ({ page }) => {
  const s = scene({ board: ["Telepathy"] }, [{ hand: ["Hill Giant", "Forest"] }, { hand: ["Shock"] }]);
  await open(page, s);
  const peek = seat(page, 1).locator("button.hand-peek");
  await expect(peek).toHaveText("Hand 2 👁");
  await peek.click();
  await expect(modal(page)).toContainText("Ana's revealed hand");
  await expect(modal(page).locator(".card")).toHaveCount(2);
  await expect(modal(page)).toContainText("Hill Giant");
  await modal(page).getByRole("button", { name: "Close" }).click();
  await expect(seat(page, 2).locator("button.hand-peek")).toHaveText("Hand 1 👁");
  expect(pageErrors(page)).toEqual([]);
});
