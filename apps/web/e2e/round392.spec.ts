// Round 392 in the browser: Aurora Awakener's pick of any number of the permanent cards it revealed; Ziatora's Envoy's
// combat damage trigger playing the land on top of your library (and paying life for it to enter untapped), casting the
// creature on top for free, or putting a too-expensive one into your hand; and a creature card Lukka, Coppercoat Outcast's
// +1 exiled cast from exile.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { attack, card, controls, menu, modal, resolveUntil, seat } from "./ui";

test("Aurora Awakener: two colors, so it reveals until two permanent cards; you put only Hill Giant onto the battlefield", async ({ page }) => {
  const s = scene({ hand: ["Aurora Awakener"], board: [...LANDS, "Savannah Lions"], library: ["Lightning Bolt", "Hill Giant", "Shock", "Sol Ring", "Grizzly Bears"] });
  const [bolt, giant, shock, ring, bears] = ["Lightning Bolt", "Hill Giant", "Shock", "Sol Ring", "Grizzly Bears"].map((n) => one(s, n));
  await open(page, s);
  await card(page, "Aurora Awakener", s).click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /^Cast it/ }).first().click();
  const ask = await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  // Green (itself) and white (Savannah Lions): the reveal stops at Sol Ring, the second permanent card.
  expect(ask.pending?.kind === "searchLibrary" && [...ask.pending.cards].sort()).toEqual([giant!, ring!].sort());
  expect(ask.pending?.kind === "searchLibrary" && [ask.pending.min, ask.pending.max]).toEqual([0, 2]);
  const pick = modal(page);
  await expect(pick).toContainText("onto the battlefield");
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[giant!]!.zone === "battlefield");
  // Everything else revealed went to the bottom; Grizzly Bears, never revealed, is on top.
  expect(after.players[0]!.library[0]).toBe(bears);
  expect([...after.players[0]!.library.slice(-3)].sort()).toEqual([bolt!, shock!, ring!].sort());
  expect(pageErrors(page)).toEqual([]);
});

test("Ziatora's Envoy: after its combat damage you play Stomping Ground from the top of your library, paying 2 life", async ({ page }) => {
  const s = scene({ board: ["Ziatora's Envoy"], library: ["Stomping Ground", "Grizzly Bears"] });
  const [envoy, ground] = [one(s, "Ziatora's Envoy"), one(s, "Stomping Ground")];
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  await attack(page, [[envoy, 1]]);
  const ask = await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.source === "Ziatora's Envoy" && st.pending.player === 0);
  expect(ask.players[1]!.life).toBe(s.players[1]!.life - 5);
  const bar = controls(page);
  await expect(bar).toContainText("Play Stomping Ground from the top of your library? If you don't, it goes into your hand.");
  await bar.getByRole("button", { name: "Yes" }).click();
  // As it enters: pay 2 life, or it enters tapped (CR 614.12).
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0 && /2 life/.test(st.pending.prompt));
  await bar.getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[ground]!.zone === "battlefield");
  expect(after.objects[ground]!.tapped).toBe(false);
  expect(after.players[0]!.life).toBe(s.players[0]!.life - 2);
  expect(after.players[0]!.landsPlayedThisTurn).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Ziatora's Envoy: you cast Grizzly Bears from the top of your library without paying its mana cost", async ({ page }) => {
  const s = scene({ board: ["Ziatora's Envoy"], library: ["Grizzly Bears", "Forest"] });
  const [envoy, bears] = [one(s, "Ziatora's Envoy"), one(s, "Grizzly Bears")];
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  await attack(page, [[envoy, 1]]);
  const ask = await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.player === 0);
  expect(ask.pending?.kind === "castFree" && [ask.pending.objectId, ask.pending.how, ask.pending.mv?.max]).toEqual([bears, "orHand", 5]);
  const bar = controls(page);
  await expect(bar).toContainText("cast Grizzly Bears without paying its mana cost? If you don't, it goes to your hand.");
  await bar.getByRole("button", { name: "Cast it" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[bears]!.zone === "battlefield");
  expect(after.objects[bears]!.controller).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Ziatora's Envoy: Craw Wurm's mana value 6 is more than the 5 damage, so you can't cast it and it goes into your hand", async ({ page }) => {
  const s = scene({ board: ["Ziatora's Envoy"], library: ["Craw Wurm", "Forest"] });
  const [envoy, wurm] = [one(s, "Ziatora's Envoy"), one(s, "Craw Wurm")];
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  await attack(page, [[envoy, 1]]);
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[wurm]!.zone === "hand");
  expect(after.players[0]!.hand).toContain(wurm);
  expect(pageErrors(page)).toEqual([]);
});

test("Lukka, Coppercoat Outcast's +1: Grizzly Bears exiled this way is cast from exile; Lightning Bolt isn't castable", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Lukka, Coppercoat Outcast"], library: ["Grizzly Bears", "Lightning Bolt", "Hill Giant", "Forest"] });
  const [lukka, bears, bolt] = [one(s, "Lukka, Coppercoat Outcast"), one(s, "Grizzly Bears"), one(s, "Lightning Bolt")];
  s.objects[lukka]!.counters = { loyalty: 5 };
  await open(page, s);
  await page.locator(`[data-obj="${lukka}"]`).first().click();
  await menu(page).locator("button", { hasText: "Exile the top three cards of your library" }).click();
  const exiled = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[bears]!.zone === "exile");
  expect(exiled.objects[bolt]!.zone).toBe("exile");
  expect(exiled.objects[lukka]!.counters.loyalty).toBe(6);
  await seat(page, 0).locator(".zone", { hasText: "Exile" }).click();
  await expect(modal(page).locator(".card.playable", { hasText: "Lightning Bolt" })).toHaveCount(0);
  await modal(page).locator(".card.playable", { hasText: "Grizzly Bears" }).click();
  const cast = menu(page).locator("button", { hasText: /^Cast/ });
  if (await cast.count()) await cast.first().click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[bears]!.zone === "battlefield");
  expect(after.objects[bolt]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});
