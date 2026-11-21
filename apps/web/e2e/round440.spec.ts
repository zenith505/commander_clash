// Round 440: Forger's Foundry (its {U} spent on Divination: "you may exile that spell" asked, then it's exiled with the
// Foundry; its second ability casts the cards exiled with it for free) and Calamity, Galloping Inferno (two saddlers: you
// click which one each token copies and whom each token attacks).
import { expect, test } from "@playwright/test";
import { applyAction, planActivate, compileCard, type GameState } from "@cc/engine";
import { LANDS, def, one, open, pageErrors, playUntil, scene } from "./scene";
import { controls, menu, resolveUntil } from "./ui";

test("Forger's Foundry: tap it for {U}, cast Divination, say yes, and Divination is exiled with the Foundry", async ({ page }) => {
  const s = scene({ hand: ["Divination"], board: [...LANDS, "Forger's Foundry"] });
  const [foundry, divination] = [one(s, "Forger's Foundry"), one(s, "Divination")];
  await open(page, s);
  await page.locator(`[data-obj="${foundry}"]`).click();
  await menu(page).getByRole("button", { name: /: add U$/ }).click();
  await resolveUntil(page, (st) => st.players[0]!.manaPool.U === 1);
  await page.locator(`[data-obj="${divination}"]`).click();
  const item = menu(page).getByRole("button", { name: /^Cast/ });
  if (await item.count()) await item.first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await expect(controls(page)).toContainText("exile that spell instead of putting it into its owner's graveyard");
  await controls(page).getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[divination]!.zone === "exile");
  expect(after.players[0]!.manaPool.U).toBe(0);
  expect(Object.entries(after.linkedExile ?? {}).filter(([k]) => k.startsWith(`${foundry}@`)).flatMap(([, v]) => v.map((x) => x.id))).toEqual([divination]);
  expect(pageErrors(page)).toEqual([]);
});

test("Forger's Foundry: {3}{U}{U}, {T} casts Divination and Grizzly Bears exiled with it, one after the other, for free", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Forger's Foundry"], exile: ["Divination", "Grizzly Bears"] });
  const [foundry, divination, bears] = [one(s, "Forger's Foundry"), one(s, "Divination"), one(s, "Grizzly Bears")];
  s.linkedExile = { [`${foundry}@${s.objects[foundry]!.zoneChanges ?? 0}`]: [divination, bears].map((id) => ({ id, zc: s.objects[id]!.zoneChanges ?? 0 })) };
  const hand = s.players[0]!.hand.length;
  await open(page, s);
  await page.locator(`[data-obj="${foundry}"]`).click();
  await menu(page).getByRole("button", { name: /from among cards exiled with/ }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong");
  await controls(page).getByRole("button", { name: "Divination" }).click();
  await controls(page).getByRole("button", { name: "Cast it" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong" && st.objects[divination]!.zone === "stack");
  await controls(page).getByRole("button", { name: "Grizzly Bears" }).click();
  await controls(page).getByRole("button", { name: "Cast it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "battlefield" && st.objects[divination]!.zone === "graveyard");
  expect(after.players[0]!.hand.length).toBe(hand + 2);
  expect(after.objects[foundry]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Calamity, Galloping Inferno: saddled by Llanowar Elves and Grizzly Bears, click which each token copies and whom it attacks", async ({ page }) => {
  let s: GameState = scene({ board: [...LANDS, "Calamity, Galloping Inferno", "Llanowar Elves", "Grizzly Bears"] });
  const [calamity, elves, bears] = [one(s, "Calamity, Galloping Inferno"), one(s, "Llanowar Elves"), one(s, "Grizzly Bears")];
  const saddle = compileCard(def("Calamity, Galloping Inferno")).activated.findIndex((a) => a.saddle);
  for (const a of planActivate(s, 0, calamity, saddle, undefined, undefined, [elves, bears])!) s = applyAction(s, a);
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  expect(s.objects[calamity]!.saddled).toBe(true);
  s = applyAction(s, { type: "declareAttackers", player: 0, attacks: [{ attacker: calamity, defender: 1 }] });
  s = playUntil(s, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  const at: GameState = s;
  expect(at.pending).toMatchObject({ kind: "pickPermanents", action: "choose", options: expect.arrayContaining([elves, bears]) });
  await open(page, at);
  await expect(controls(page)).toContainText("click a nonlegendary creature that saddled Calamity, Galloping Inferno this turn");
  await page.locator(`[data-obj="${elves}"]`).click();
  await controls(page).getByRole("button", { name: "Choose", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "attackWhom");
  await controls(page).getByRole("button", { name: "Ana" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  await page.locator(`[data-obj="${bears}"]`).click();
  await controls(page).getByRole("button", { name: "Choose", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "attackWhom");
  await controls(page).getByRole("button", { name: "Ben" }).click();
  const after = await resolveUntil(page, (st) => st.battlefield.filter((id) => st.objects[id]!.isToken).length === 2);
  const tokens = after.battlefield.filter((id) => after.objects[id]!.isToken);
  const name = (id: string) => after.cards[after.objects[id]!.cardId]!.name;
  expect(tokens.map((id) => [name(id), after.objects[id]!.attacking, after.objects[id]!.tapped]).sort()).toEqual([["Grizzly Bears", 2, true], ["Llanowar Elves", 1, true]]);
  expect(pageErrors(page)).toEqual([]);
});
