// Round 248: forage as an instruction (CR 701.61a), as Treetop Sentries' "When this creature enters, you may forage. If you
// do, draw a card.": the way to forage is chosen as it resolves, among the ways that can be done fully (rulings).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, modal, resolveUntil } from "./ui";

test("Treetop Sentries: forage by exiling three cards from your graveyard, then draw", async ({ page }) => {
  const s = scene({ hand: ["Treetop Sentries"], board: [...LANDS, "Bagel and Schmear"], yard: ["Gray Ogre", "Hill Giant", "Grizzly Bears", "Goblin Piker"] });
  const [ogre, giant, bears, piker, bagel] = ["Gray Ogre", "Hill Giant", "Grizzly Bears", "Goblin Piker", "Bagel and Schmear"].map((n) => one(s, n)) as [string, string, string, string, string];
  const hand = s.players[0]!.hand.length;
  await open(page, s);
  await card(page, "Treetop Sentries", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay");
  const bar = controls(page);
  await expect(bar).toContainText("Forage?");
  await bar.getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "either");
  await expect(bar.getByRole("button", { name: "Sacrifice a Food" })).toHaveCount(1);
  await bar.getByRole("button", { name: "Exile three cards from your graveyard" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  for (const id of [ogre, giant, bears]) await pick.locator(`[data-pick="${id}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[ogre]!.zone === "exile");
  expect([giant, bears].map((id) => after.objects[id]!.zone)).toEqual(["exile", "exile"]);
  expect(after.objects[piker]!.zone).toBe("graveyard");
  expect(after.objects[bagel]!.zone).toBe("battlefield");
  expect(after.players[0]!.hand.length).toBe(hand); // Sentries cast, one card drawn
  expect(pageErrors(page)).toEqual([]);
});

test("Treetop Sentries: forage by sacrificing a Food, then draw", async ({ page }) => {
  const s = scene({ hand: ["Treetop Sentries"], board: [...LANDS, "Bagel and Schmear"], yard: ["Gray Ogre", "Hill Giant", "Grizzly Bears"] });
  const [ogre, bagel] = ["Gray Ogre", "Bagel and Schmear"].map((n) => one(s, n)) as [string, string];
  const hand = s.players[0]!.hand.length;
  await open(page, s);
  await card(page, "Treetop Sentries", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay");
  const bar = controls(page);
  await bar.getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "either");
  await bar.getByRole("button", { name: "Sacrifice a Food" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bagel]!.zone === "graveyard");
  expect(after.objects[ogre]!.zone).toBe("graveyard");
  expect(after.players[0]!.hand.length).toBe(hand);
  expect(pageErrors(page)).toEqual([]);
});
