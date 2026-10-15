// PR #23: foretell and casting the foretold card on a later turn, Brainstorm's hand picker, emerge and freerunning.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { attack, card, controls, menu, modal, passTo, resolveUntil, seat } from "./ui";

test("Foretell: exile it face down for {2}, then cast it from exile for its foretell cost on your next turn", async ({ page }) => {
  const s = scene({ hand: ["Augury Raven"], board: LANDS });
  const raven = one(s, "Augury Raven");
  await open(page, s);
  await card(page, "Augury Raven", s).click();
  await menu(page).getByRole("button", { name: /^Foretell/ }).click();
  let now = await state(page);
  expect(now.objects[raven]).toMatchObject({ zone: "exile", foretold: true });
  expect(now.battlefield.filter((id) => now.objects[id]!.tapped)).toHaveLength(2);
  // Not this turn (CR 702.143a): the exile pile has nothing to cast yet.
  await expect(seat(page, 0).locator(".zone", { hasText: "Exile" }).locator(".zone-title")).toHaveText("Exile");
  await passTo(page, "main1", s.turn + 4);
  const exile = seat(page, 0).locator(".zone", { hasText: "Exile" });
  await expect(exile.locator(".zone-title")).toHaveText("Exile ✦");
  await exile.click();
  await expect(modal(page).locator(".zone-tag")).toHaveText("foretold");
  await modal(page).locator(".card.playable").click();
  await menu(page).getByRole("button", { name: /Cast it for its foretell cost/ }).click();
  now = await resolveUntil(page, (st) => st.objects[raven]!.zone === "battlefield" && st.stack.length === 0);
  expect(now.battlefield.filter((id) => now.objects[id]!.tapped)).toHaveLength(2);
  expect(pageErrors(page)).toEqual([]);
});

test("Foretell by a bot: you see a face-down Foretold card in their exile, not what it is", async ({ page }) => {
  const s = scene({ board: ["Island"] }, [{ hand: ["Augury Raven"], board: ["Island", "Island"] }]);
  const raven = one(s, "Augury Raven");
  await open(page, s);
  await controls(page).getByRole("button", { name: "Pass" }).click();
  await resolveUntil(page, (st) => !!st.objects[raven]!.foretold, 200);
  const exile = seat(page, 1).locator(".zone", { hasText: "Exile" });
  await expect(exile.locator(".zone-label")).toHaveText("Foretold");
  await expect(exile).not.toContainText("Augury Raven");
  await expect(page.locator(".log")).not.toContainText("Augury Raven");
  await exile.click();
  await expect(modal(page).locator(".zone-label")).toHaveText("Foretold");
  await expect(modal(page)).not.toContainText("Augury Raven");
  expect(pageErrors(page)).toEqual([]);
});

test("Brainstorm: draw three, then click two cards to put back, the first on top", async ({ page }) => {
  const s = scene({ hand: ["Brainstorm", "Hill Giant"], board: LANDS, library: ["Grizzly Bears", "Llanowar Elves", "Shock"] });
  const [giant, shock] = [one(s, "Hill Giant"), one(s, "Shock")];
  await open(page, s);
  await card(page, "Brainstorm", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "handToTop");
  await expect(controls(page)).toContainText("Brainstorm: click 2 cards to put on top of your library (first pick ends on top).");
  const put = controls(page).getByRole("button", { name: "Put on top" });
  await expect(put).toBeDisabled();
  await page.locator(`[data-obj="${giant}"]`).click();
  await page.locator(`[data-obj="${shock}"]`).click();
  await put.click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0);
  expect(after.players[0]!.library.slice(0, 2)).toEqual([giant, shock]);
  expect(after.players[0]!.hand.map((id) => after.cards[after.objects[id]!.cardId]!.name).sort()).toEqual(["Grizzly Bears", "Llanowar Elves"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Emerge: sacrifice a creature from the cast menu, its mana value off the emerge cost", async ({ page }) => {
  const s = scene({ hand: ["Wretched Gryff"], board: [...LANDS, "Grizzly Bears"] });
  const [gryff, bears] = [one(s, "Wretched Gryff"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Wretched Gryff", s).click();
  await menu(page).getByRole("button", { name: /^Emerge/ }).click();
  const bar = page.locator(".targeting", { hasText: "sacrifice" });
  await page.locator(`[data-obj="${bears}"]`).click();
  await bar.getByRole("button", { name: "Sacrifice and cast" }).click();
  const after = await resolveUntil(page, (st) => st.objects[gryff]!.zone === "battlefield" && st.stack.length === 0);
  expect(after.objects[bears]!.zone).toBe("graveyard");
  // {5}{U} less 2 for the Bears.
  expect(after.battlefield.filter((id) => after.objects[id]!.tapped)).toHaveLength(4);
  expect(after.players[0]!.hand).toHaveLength(1); // "When you cast this spell, draw a card."
  expect(pageErrors(page)).toEqual([]);
});

test("Freerunning: unavailable before combat, castable after an Assassin dealt combat damage", async ({ page }) => {
  const s = scene({ hand: ["Eagle Vision"], board: [...LANDS, "Merciless Harlequin"] });
  const harlequin = one(s, "Merciless Harlequin");
  await open(page, s);
  await card(page, "Eagle Vision", s).click();
  await expect(menu(page).getByRole("button", { name: /^Freerunning/ })).toBeDisabled();
  await menu(page).getByRole("button", { name: "Close" }).click();
  await controls(page).getByRole("button", { name: "Pass" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers");
  await attack(page, [[harlequin, 1]]);
  await passTo(page, "main2");
  await card(page, "Eagle Vision", s).click();
  await menu(page).getByRole("button", { name: /^Freerunning/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.players[0]!.hand.length === 3);
  expect(after.battlefield.filter((id) => after.objects[id]!.tapped)).toHaveLength(3); // the Harlequin and {1}{U}
  expect(pageErrors(page)).toEqual([]);
});
