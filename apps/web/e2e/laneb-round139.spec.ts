// Lane B round B139 in the browser: Cytoshape's creature chosen as it resolves, Burning of Xinye's four lands, Sages of
// the Anima's bottom order, Aquamorph Entity's 5/1 or 1/5 (as it enters, on the Turn face up buttons, and when an
// effect turns it face up), Mister Immortal from exile, Valleymaker's player who adds the mana, and the draws Obstinate
// Familiar and Pursuit of Knowledge may replace.
import { expect, test } from "@playwright/test";
import { applyAction, characteristics, planCast, power, toughness, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene, state } from "./scene";
import { card, clickPlayer, controls, menu, modal, resolveUntil, seat } from "./ui";

const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;

test("Cytoshape: Grizzly Bears becomes a copy of Ana's Hill Giant, clicked as it resolves", async ({ page }) => {
  const s = scene({ hand: ["Cytoshape"], board: ["Grizzly Bears", ...LANDS] }, [{ board: ["Hill Giant"] }]);
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Cytoshape", s).click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("for the target to become a copy of until end of turn");
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[one(s, "Cytoshape")]!.zone === "graveyard");
  expect(characteristics(after, after.objects[bears]!).name).toBe("Hill Giant");
  expect(pt(after, bears)).toBe("3/3");
  expect(pageErrors(page)).toEqual([]);
});

test("Burning of Xinye: you click four of your lands, Ana destroys four of hers, then 4 damage to each creature", async ({ page }) => {
  const mine = ["Tranquil Cove", "Dismal Backwater", "Bloodfell Caves", "Rugged Highlands"];
  const s = scene({ hand: ["Burning of Xinye"], board: ["Grizzly Bears", "Darksteel Citadel", ...mine, ...LANDS] }, [{ board: ["Hill Giant", "Island", "Island", "Island", "Island", "Island"] }]);
  const picked = mine.map((n) => one(s, n));
  const [bears, giant, citadel] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Darksteel Citadel")];
  await open(page, s);
  await card(page, "Burning of Xinye", s).click();
  await clickPlayer(page, 1);
  const st = await resolveUntil(page, (x) => x.pending?.kind === "pickPermanents" && x.pending.player === 0);
  expect(st.pending?.kind === "pickPermanents" && st.pending.options).not.toContain(citadel);
  for (const id of picked) await page.locator(`[data-obj="${id}"]`).first().click();
  await controls(page).getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending && x.objects[one(s, "Burning of Xinye")]!.zone === "graveyard");
  for (const id of picked) expect(after.objects[id]!.zone).toBe("graveyard");
  expect(after.objects[citadel]!.zone).toBe("battlefield");
  expect(idsOf(after, "Island", "battlefield", 1)).toHaveLength(1);
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Sages of the Anima: your draw reveals three; Gray Ogre to your hand, the other two on the bottom in your order", async ({ page }) => {
  const s0 = scene({ board: ["Sages of the Anima"], library: ["Shock", "Gray Ogre", "Tranquil Cove"] });
  const [shock, ogre, cove] = [one(s0, "Shock"), one(s0, "Gray Ogre"), one(s0, "Tranquil Cove")];
  const s = playUntil(s0, (st) => st.pending?.kind === "orderLibrary" && st.pending.player === 0);
  expect(s.players[0]!.hand).toEqual([ogre]);
  const start = s.pending?.kind === "orderLibrary" ? s.pending.cards : [];
  expect(new Set(start)).toEqual(new Set([shock, cove]));
  await open(page, s);
  const arrange = page.locator(".modal.arrange");
  await expect(arrange).toContainText("Sages of the Anima");
  await arrange.locator(".arrange-card", { has: page.locator(`[data-arrange="${start[1]}"]`) }).getByRole("button", { name: /^Move toward the/ }).first().click();
  await arrange.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.objects[shock]!.zone === "library" && x.players[0]!.library.slice(-2).includes(shock));
  expect(new Set(after.players[0]!.library.slice(-2))).toEqual(new Set([shock, cove]));
  expect(after.players[0]!.hand).toEqual([ogre]);
  expect(pageErrors(page)).toEqual([]);
});

test("Aquamorph Entity cast face up: choose 1/5 as it enters", async ({ page }) => {
  const s = scene({ hand: ["Aquamorph Entity"], board: LANDS });
  const aq = one(s, "Aquamorph Entity");
  await open(page, s);
  await card(page, "Aquamorph Entity", s).click();
  await menu(page).getByRole("button", { name: /^Cast it/ }).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.player === 0);
  const bar = controls(page);
  await bar.getByRole("button", { name: "1/5", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[aq]!.zone === "battlefield");
  expect(pt(after, aq)).toBe("1/5");
  expect(pageErrors(page)).toEqual([]);
});

test("Aquamorph Entity face down: a Turn face up button for each form; 5/1 turns it face up as a 5/1", async ({ page }) => {
  let s = scene({ hand: ["Aquamorph Entity"], board: LANDS });
  const aq = one(s, "Aquamorph Entity");
  for (const a of planCast(s, 0, aq, undefined, undefined, "auto", undefined, { faceDown: true })!) s = applyAction(s, a);
  s = playUntil(s, (st) => st.objects[aq]!.zone === "battlefield" && st.stack.length === 0 && !st.pending && st.priority === 0);
  await open(page, s);
  await page.locator(`[data-obj="${aq}"]`).first().click();
  await expect(menu(page).locator("[data-face-up-form]")).toHaveCount(2);
  await menu(page).getByRole("button", { name: /Turn face up: morph.* as 5\/1/ }).click();
  await expect.poll(async () => !(await state(page)).objects[aq]!.faceDown).toBe(true);
  const after = await resolveUntil(page, (st) => !st.objects[aq]!.faceDown);
  expect(pt(after, aq)).toBe("5/1");
  expect(after.stack).toHaveLength(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Aquamorph Entity turned face up by Ana's Break Open: you choose what it becomes", async ({ page }) => {
  let s = scene({ hand: ["Aquamorph Entity"], board: LANDS }, [{ hand: ["Break Open"], board: ["Mountain", "Mountain"] }]);
  const aq = one(s, "Aquamorph Entity");
  for (const a of planCast(s, 0, aq, undefined, undefined, "auto", undefined, { faceDown: true })!) s = applyAction(s, a);
  s = playUntil(s, (st) => st.objects[aq]!.zone === "battlefield" && st.stack.length === 0 && !st.pending && st.priority === 0);
  // You pass with nothing on the stack; Ana casts Break Open on it.
  s = applyAction(s, { type: "passPriority", player: 0 });
  for (const a of planCast(s, 1, one(s, "Break Open"), [{ kind: "object", id: aq }])!) s = applyAction(s, a);
  s = playUntil(s, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "faceUpForm" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("choose what Aquamorph Entity becomes as it's turned face up");
  await bar.getByRole("button", { name: "1/5", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.objects[aq]!.faceDown && !st.pending);
  expect(pt(after, aq)).toBe("1/5");
  expect(pageErrors(page)).toEqual([]);
});

test("Mister Immortal: from your exile pile, {2}{G} returns it to the battlefield tapped", async ({ page }) => {
  const s = scene({ exile: ["Mister Immortal"], board: LANDS });
  const mi = one(s, "Mister Immortal");
  await open(page, s);
  await seat(page, 0).locator(".zone", { hasText: "Exile" }).click();
  await modal(page).locator(".card.playable").click();
  await menu(page).getByRole("button", { name: /Return Mister Immortal from your graveyard or from exile/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[mi]!.zone === "battlefield");
  expect(after.objects[mi]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Valleymaker: sacrifice a Forest and choose Ana; she adds {G}{G}{G} at once and you keep priority", async ({ page }) => {
  const s = scene({ board: ["Valleymaker", "Forest"] });
  const [vm, forest] = [one(s, "Valleymaker"), idsOf(s, "Forest", "battlefield", 0)[0]!];
  await open(page, s);
  await card(page, "Valleymaker", s).click();
  await menu(page).locator("button", { hasText: "Sacrifice a Forest" }).click();
  const costBar = page.locator(".targeting", { hasText: "sacrifice a Forest" });
  await page.locator(`[data-obj="${forest}"]`).first().click();
  await costBar.getByRole("button", { name: "Sacrifice and activate" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "nthPlayer");
  await controls(page).getByRole("button", { name: "Ana", exact: true }).click();
  const after = await resolveUntil(page, (st) => (st.players[1]!.manaPool.G ?? 0) === 3);
  expect(after.stack).toHaveLength(0);
  expect(after.priority).toBe(0);
  expect(after.objects[forest]!.zone).toBe("graveyard");
  expect(after.objects[vm]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Obstinate Familiar: skip your draw step's draw", async ({ page }) => {
  const s0 = scene({ board: ["Obstinate Familiar"] });
  const s = playUntil(s0, (st) => st.pending?.kind === "drawInstead" && st.pending.player === 0);
  const [hand, lib] = [s.players[0]!.hand.length, s.players[0]!.library.length];
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Replace this draw:");
  await expect(bar.getByRole("button", { name: "Draw the card", exact: true })).toBeVisible();
  await bar.getByRole("button", { name: /Skip this draw \(Obstinate Familiar\)/ }).click();
  const after = await resolveUntil(page, (st) => st.step === "main1" && st.activePlayer === 0 && !st.pending);
  expect(after.players[0]!.hand).toHaveLength(hand);
  expect(after.players[0]!.library).toHaveLength(lib);
  expect(pageErrors(page)).toEqual([]);
});

test("Pursuit of Knowledge: a study counter instead of your draw", async ({ page }) => {
  const s0 = scene({ board: ["Pursuit of Knowledge"] });
  const pk = one(s0, "Pursuit of Knowledge");
  const s = playUntil(s0, (st) => st.pending?.kind === "drawInstead" && st.pending.player === 0);
  const hand = s.players[0]!.hand.length;
  await open(page, s);
  await controls(page).getByRole("button", { name: "Put a study counter on Pursuit of Knowledge instead", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.step === "main1" && st.activePlayer === 0 && !st.pending);
  expect(after.objects[pk]!.counters.study).toBe(1);
  expect(after.players[0]!.hand).toHaveLength(hand);
  expect(pageErrors(page)).toEqual([]);
});
