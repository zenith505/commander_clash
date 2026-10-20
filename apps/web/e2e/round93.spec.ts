// Round 93's prompts: Underworld Breach's escape from the graveyard view (exile three other cards), Forgotten Ancient's
// "move any number of counters" bar, Krosan Verge's "a Forest card and a Plains card" search, Nesting Grounds' choice of
// counter kind, and Emry's "you may cast that card this turn" from the graveyard.
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene, state } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

test("Underworld Breach: escape a sorcery from your graveyard, exiling three other cards", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Underworld Breach"], yard: ["Night's Whisper", "Grizzly Bears", "Hill Giant", "Shock"] });
  const whisper = one(s, "Night's Whisper");
  const others = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Shock")];
  await open(page, s);
  await page.locator('[data-graveyard="0"]').click();
  await modal(page).locator(".card.playable", { hasText: "Night's Whisper" }).click();
  await menu(page).getByRole("button", { name: /^Escape/ }).click();
  const pick = modal(page);
  await expect(pick).toContainText("exile from your graveyard 3");
  for (const id of others) await pick.locator(`[data-pick="${id}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[0]!.life === 38);
  for (const id of others) expect(after.objects[id]!.zone).toBe("exile");
  // An escaped instant or sorcery goes back to the graveyard (only permanents "escape with" something, CR 702.138).
  expect(after.objects[whisper]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Forgotten Ancient: at your upkeep, move some of its +1/+1 counters onto other creatures", async ({ page }) => {
  const s = scene({ board: ["Forgotten Ancient", "Grizzly Bears"] }, [{ board: ["Hill Giant"] }]);
  const [ancient, bears, giant] = [one(s, "Forgotten Ancient"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  s.objects[ancient]!.counters["+1/+1"] = 3;
  await open(page, s);
  // Through the opponents' turns to your next upkeep.
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0 && st.activePlayer === 0, 300);
  await controls(page).getByRole("button", { name: "Yes" }).click();
  const bar = controls(page);
  await expect(bar).toContainText("move up to 3 +1/+1 counters from it onto other creatures, if you want (3 left)");
  await bar.locator(`[data-distribute="${bears}"]`).getByRole("button", { name: "+" }).click();
  await bar.locator(`[data-distribute="${giant}"]`).getByRole("button", { name: "+" }).click();
  await expect(bar).toContainText("(1 left)");
  await bar.getByRole("button", { name: "Done" }).click();
  await expect.poll(async () => (await state(page)).objects[ancient]!.counters["+1/+1"]).toBe(1);
  const after = await state(page);
  expect(after.objects[bears]!.counters["+1/+1"]).toBe(1);
  expect(after.objects[giant]!.counters["+1/+1"]).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Krosan Verge: find a Forest card and a Plains card, not two Forests", async ({ page }) => {
  const s = scene({ board: ["Krosan Verge", "Mountain", "Mountain"], library: ["Forest", "Forest", "Plains"] });
  const verge = one(s, "Krosan Verge");
  s.objects[verge]!.tapped = false;
  await open(page, s);
  await card(page, "Krosan Verge", s).click();
  await menu(page).getByRole("button", { name: /Sacrifice/ }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await expect(pick).toContainText("up to a Forest card and a Plains card");
  // The library's cards come one per name: after a Forest, the Forests can't be picked again; the Plains can.
  const forest = pick.locator(".card[data-pick]", { hasText: /^Forest/ });
  await forest.click();
  await expect(forest).toHaveClass(/dim/);
  await expect(pick.locator(".card[data-pick]", { hasText: /^Plains/ })).toHaveClass(/targetable/);
  await pick.locator(".card[data-pick]", { hasText: /^Plains/ }).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const found = (st: typeof s, name: string) => st.battlefield.filter((id) => st.cards[st.objects[id]!.cardId]!.name === name && st.objects[id]!.tapped).length;
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && found(st, "Plains") === 1);
  expect(found(after, "Forest")).toBe(1);
  expect(after.objects[verge]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Nesting Grounds: choose the kind of counter to move", async ({ page }) => {
  const s = scene({ board: ["Nesting Grounds", "Mountain", "Grizzly Bears", "Hill Giant"] });
  const [grounds, bears, giant] = [one(s, "Nesting Grounds"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  s.objects[bears]!.counters = { "+1/+1": 1, stun: 2 };
  await open(page, s);
  await card(page, "Nesting Grounds", s).click();
  await menu(page).getByRole("button", { name: /Move a counter/ }).click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "counterKind");
  const bar = controls(page);
  await expect(bar).toContainText("choose the kind of counter to move from Grizzly Bears onto Hill Giant");
  await bar.getByRole("button", { name: "A stun counter" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && (st.objects[giant]!.counters.stun ?? 0) > 0);
  expect(after.objects[bears]!.counters).toMatchObject({ "+1/+1": 1, stun: 1 });
  expect(after.objects[grounds]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Emry: tap it for an artifact card in your graveyard, then cast that card from the graveyard view", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Emry, Lurker of the Loch"], yard: ["Mind Stone"] });
  const stone = one(s, "Mind Stone");
  await open(page, s);
  await card(page, "Emry, Lurker of the Loch", s).click();
  await menu(page).getByRole("button", { name: /Choose target artifact card/ }).click();
  // Its target is a card in a graveyard: the picker opens on its own.
  await modal(page).locator(`[data-pick="${stone}"]`).click();
  await resolveUntil(page, (st) => st.stack.length === 0 && !!st.objects[stone]!.mayPlay);
  await page.locator('[data-graveyard="0"]').click();
  await modal(page).locator(".card.playable", { hasText: "Mind Stone" }).click();
  await menu(page).getByRole("button", { name: /^Cast from graveyard/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[stone]!.zone === "battlefield");
  expect(after.objects[stone]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
