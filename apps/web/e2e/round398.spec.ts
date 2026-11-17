// Round 398 in the browser: Hurkyl, Master Wizard's end step pick (one card for each card type among the noncreature
// spells you cast this turn, an instant and an artifact here); The Book of Vile Darkness's activation, its cost the Book
// and an artifact named Eye of Vecna and one named Hand of Vecna clicked on the battlefield, then Vecna with their
// triggered abilities (Eye of Vecna's draws a card as it's created); Grime Gorger's attack trigger, up to one card of each
// card type picked from Ana's graveyard, a second instant refused.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { attack, card, menu, modal, passTo, resolveUntil } from "./ui";

test("Hurkyl, Master Wizard: after an instant and an artifact this turn, take Opt and Arcane Signet, not Divination", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Hurkyl, Master Wizard", "Sol Ring"], yard: ["Lightning Bolt"], library: ["Opt", "Arcane Signet", "Divination", "Glorious Anthem", "Grizzly Bears"] }, [], { step: "main2" });
  const [opt, signet, div, anthem, bears] = [one(s, "Opt"), one(s, "Arcane Signet"), one(s, "Divination"), one(s, "Glorious Anthem"), one(s, "Grizzly Bears")];
  // Spells cast earlier this turn: Lightning Bolt (an instant, in the graveyard now) and Sol Ring (an artifact).
  const cardOf = (n: string) => s.objects[one(s, n)]!.cardId;
  s.castThisTurn = [
    { player: 0, card: cardOf("Lightning Bolt"), name: "Lightning Bolt", types: ["Instant"] },
    { player: 0, card: cardOf("Sol Ring"), name: "Sol Ring", types: ["Artifact"] },
  ];
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0, 60);
  const pick = modal(page);
  await expect(pick).toBeVisible();
  // Shown, but not to be taken: a sorcery, an enchantment and a creature card.
  for (const id of [div, anthem, bears]) await expect(pick.locator(`[data-pick="${id}"]`)).toHaveClass(/dim/);
  await pick.locator(`[data-pick="${opt}"]`).click();
  await pick.locator(`[data-pick="${signet}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[opt]!.zone === "hand");
  expect(after.objects[signet]!.zone).toBe("hand");
  // The rest on the bottom of the library.
  expect(after.players[0]!.library.slice(-3).sort()).toEqual([div, anthem, bears].sort());
  expect(pageErrors(page)).toEqual([]);
});

test("The Book of Vile Darkness: exile it, Eye of Vecna and Hand of Vecna; Vecna draws you a card as it's created", async ({ page }) => {
  const s = scene({ board: [...LANDS, "The Book of Vile Darkness", "Eye of Vecna", "Hand of Vecna", "Sol Ring"] });
  const [book, eye, hand, ring] = [one(s, "The Book of Vile Darkness"), one(s, "Eye of Vecna"), one(s, "Hand of Vecna"), one(s, "Sol Ring")];
  const cards = s.players[0]!.hand.length;
  await open(page, s);
  await card(page, "The Book of Vile Darkness", s).click();
  if (await menu(page).count()) await menu(page).locator("button", { hasText: /Exile The Book of Vile Darkness/ }).first().click();
  const bar = page.locator(".targeting", { hasText: "(click them)" });
  await expect(bar).toBeVisible();
  await page.locator(`[data-obj="${eye}"]`).first().click();
  await expect(bar.getByRole("button", { name: "Exile and activate" })).toBeDisabled();
  await page.locator(`[data-obj="${hand}"]`).first().click();
  await bar.getByRole("button", { name: "Exile and activate" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.battlefield.some((id) => st.cards[st.objects[id]!.cardId]!.name === "Vecna") && st.players[0]!.life < 40);
  for (const id of [book, eye, hand]) expect(after.objects[id]!.zone).toBe("exile");
  expect(after.objects[ring]!.zone).toBe("battlefield");
  // Eye of Vecna's enters ability, Vecna's now: you draw a card and you lose 2 life.
  expect(after.players[0]!.hand.length).toBe(cards + 1);
  expect(after.players[0]!.life).toBe(38);
  expect(pageErrors(page)).toEqual([]);
});

test("Grime Gorger: attacking Ana, exile her Lightning Bolt, Divination, Ornithopter and Grizzly Bears; not a second Bolt", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Grime Gorger"] }, [{ yard: ["Lightning Bolt", "Shock", "Divination", "Ornithopter", "Grizzly Bears"] }]);
  const [gorger, bolt, shock, div, thopter, bears] = [one(s, "Grime Gorger"), one(s, "Lightning Bolt"), one(s, "Shock"), one(s, "Divination"), one(s, "Ornithopter"), one(s, "Grizzly Bears")];
  await open(page, s);
  await passTo(page, "declareAttackers");
  await attack(page, [[gorger, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const pick = modal(page);
  await expect(pick).toContainText("Ana's graveyard");
  await pick.locator(`[data-pick="${bolt}"]`).click();
  // An instant is taken: Shock can't be another.
  await expect(pick.locator(`[data-pick="${shock}"]`)).toHaveClass(/dim/);
  for (const id of [div, thopter, bears]) await pick.locator(`[data-pick="${id}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[bears]!.zone === "exile");
  for (const id of [bolt, div, thopter]) expect(after.objects[id]!.zone).toBe("exile");
  expect(after.objects[shock]!.zone).toBe("graveyard");
  expect(after.objects[gorger]!.counters?.["+1/+1"]).toBe(4);
  expect(pageErrors(page)).toEqual([]);
});
