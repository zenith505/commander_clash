// Round 385: Words of Wind's permanent pick when your draw is replaced (you choose first, then the bots), Aladdin's
// Lamp's "Keep ... on top" buttons before the draw, and Mangara's Tome's search for its face-down pile, then its {2}
// ability putting the pile's top card into your hand instead of a draw.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

test("Words of Wind: your next draw is replaced; you return Words of Wind, Ana returns one of hers, Ben his only one; then Vision Skeins finishes", async ({ page }) => {
  const s = scene({ hand: ["Vision Skeins"], board: [...LANDS, "Words of Wind"] }, [{ board: ["Hill Giant", "Grizzly Bears"] }, { board: ["Llanowar Elves"] }]);
  const words = one(s, "Words of Wind");
  const [giant, bears, elves] = [one(s, "Hill Giant"), one(s, "Grizzly Bears"), one(s, "Llanowar Elves")];
  // You activated Words of Wind this turn: your next draw this turn is replaced.
  s.players[0]!.nextDrawInstead = [{ turn: s.turn, source: "Words of Wind", sourceId: words, sourceZc: 0, wind: true }];
  await open(page, s);
  await card(page, "Vision Skeins", s).click();
  const ask = await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  expect(ask.objects[giant]!.zone).toBe("battlefield");
  const bar = controls(page);
  await expect(bar).toContainText("click a permanent you control to return to its owner's hand.");
  await page.locator(`[data-obj="${words}"]`).first().click();
  await bar.getByRole("button", { name: "Return", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[words]!.zone === "hand");
  // Ana (a bot) returned one of her two, Ben his only one; all at once, after every choice.
  expect([after.objects[giant]!.zone, after.objects[bears]!.zone].sort()).toEqual(["battlefield", "hand"]);
  expect(after.objects[elves]!.zone).toBe("hand");
  // Your first draw was replaced, the second drawn: Words of Wind and one card.
  expect(after.players[0]!.hand).toHaveLength(2);
  expect(after.players[0]!.nextDrawInstead).toBeUndefined();
  expect(pageErrors(page)).toEqual([]);
});

test("Aladdin's Lamp: your next draw looks at the top three; you keep Hill Giant on top and draw it, the other two go on the bottom", async ({ page }) => {
  const s = scene({ hand: ["Vision Skeins"], board: [...LANDS, "Aladdin's Lamp"], library: ["Grizzly Bears", "Llanowar Elves", "Hill Giant"] });
  const lamp = one(s, "Aladdin's Lamp");
  const [bears, elves, giant] = [one(s, "Grizzly Bears"), one(s, "Llanowar Elves"), one(s, "Hill Giant")];
  // You activated the Lamp with X = 3 this turn.
  s.players[0]!.nextDrawInstead = [{ turn: s.turn, source: "Aladdin's Lamp", sourceId: lamp, sourceZc: 0, lamp: 3 }];
  await open(page, s);
  await card(page, "Vision Skeins", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "drawLook" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Aladdin's Lamp: instead of drawing, keep one of the top 3 cards of your library on top");
  await expect(bar.getByRole("button", { name: "Keep Grizzly Bears on top" })).toBeVisible();
  await bar.getByRole("button", { name: "Keep Hill Giant on top" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "hand");
  // The Lamp's draw was Hill Giant; Vision Skeins's second draw the next card (a land): Bears and Elves are at the bottom.
  expect(after.players[0]!.hand).toHaveLength(2);
  expect(new Set(after.players[0]!.library.slice(-2))).toEqual(new Set([bears, elves]));
  expect(pageErrors(page)).toEqual([]);
});

test("Mangara's Tome: you search for five cards for its face-down pile, then its {2} ability puts the pile's top card into your hand instead of a draw", async ({ page }) => {
  const s = scene({ hand: ["Mangara's Tome", "Vision Skeins"], board: LANDS, library: ["Hill Giant", "Grizzly Bears", "Llanowar Elves"] });
  const tome = one(s, "Mangara's Tome");
  const picks = [one(s, "Hill Giant"), one(s, "Grizzly Bears"), one(s, "Llanowar Elves")];
  await open(page, s);
  await card(page, "Mangara's Tome", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const pick = modal(page);
  await expect(pick).toContainText("Mangara's Tome: search your library for 5 cards");
  for (const id of picks) await pick.locator(`[data-pick="${id}"]`).click();
  // Two Forests: one pile in the search window, each click finds the next one.
  const forests = pick.locator(".card.targetable", { hasText: "Forest" });
  await forests.click();
  await forests.click();
  await pick.getByRole("button", { name: "Done" }).click();
  const exiled = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[picks[0]!]!.zone === "exile");
  const pile = exiled.linkedExile![`${tome}@${exiled.objects[tome]!.zoneChanges ?? 0}`]!.map((l) => l.id);
  expect(pile).toHaveLength(5);
  for (const id of pile) expect(exiled.objects[id]!.hiddenExile?.seen).toEqual([]);
  await page.locator(`[data-obj="${tome}"]`).first().click();
  await menu(page).locator("button", { hasText: "instead put the top card of the exiled pile" }).click();
  await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && !!st.players[0]!.nextDrawInstead?.length);
  await card(page, "Vision Skeins", s).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[pile[0]!]!.zone === "hand");
  // The pile's top card and Vision Skeins's second draw.
  expect(after.players[0]!.hand).toHaveLength(2);
  expect(after.objects[pile[1]!]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});
