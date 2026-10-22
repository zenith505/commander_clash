// Round 112's prompts: Party Thrasher's "discard a card; if you do, exile the top two, choose one, play it this turn";
// Multiversal Passage's basic land type as it enters (after "Play it untapped (pay 2 life)"); Volatile Stormdrake's
// "sacrifice that creature unless you pay {E} equal to its mana value"; Karn, the Great Creator's −2 picking a face-up
// artifact card you own in exile.
import { expect, test } from "@playwright/test";
import { controllerOf, power, toughness } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, scene, state } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

test("Party Thrasher: at your first main phase, discard Opt, exile the top two and choose Hill Giant to play this turn", async ({ page }) => {
  // The draw step draws Shock; Grizzly Bears and Hill Giant are the top two as the trigger resolves.
  const s = scene({ hand: ["Opt"], board: ["Party Thrasher"], library: ["Shock", "Grizzly Bears", "Hill Giant"] }, [], { step: "upkeep" });
  const [opt, bears, giant] = [one(s, "Opt"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const bar = controls(page);
  await bar.getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "discard");
  await expect(bar).toContainText("click 1 card in your hand to discard");
  await card(page, "Opt", s).click();
  await bar.getByRole("button", { name: "Discard" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "impulseChoice");
  await expect(bar).toContainText("choose one of them; you may play it this turn");
  await expect(bar.getByRole("button", { name: "Grizzly Bears" })).toBeVisible();
  await bar.getByRole("button", { name: "Hill Giant" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "exile");
  expect(after.step).toBe("main1");
  expect(after.objects[opt]!.zone).toBe("graveyard");
  expect(after.objects[bears]!.zone).toBe("exile");
  expect(after.objects[giant]!.mayPlay).toMatchObject({ player: 0, until: "thisTurn" });
  expect(after.objects[bears]!.mayPlay).toBeUndefined();
  expect(pageErrors(page)).toEqual([]);
});

test("Multiversal Passage: play it untapped for 2 life and choose Island; it taps for {U}", async ({ page }) => {
  const s = scene({ hand: ["Multiversal Passage"] });
  const passage = one(s, "Multiversal Passage");
  await open(page, s);
  await card(page, "Multiversal Passage", s).click();
  await menu(page).getByRole("button", { name: "Play it untapped (pay 2 life)" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("choose a basic land type");
  await expect(bar.getByRole("button", { name: "Forest" })).toBeVisible();
  await bar.getByRole("button", { name: "Island" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.objects[passage]!.zone === "battlefield");
  expect(after.objects[passage]!.tapped).toBe(false);
  expect(after.players[0]!.life).toBe(38);
  await page.locator(`[data-obj="${passage}"]`).first().click();
  await expect.poll(async () => (await state(page)).players[0]!.manaPool.U).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Volatile Stormdrake: exchange it for Ana's Grizzly Bears, then pay two of the four energy to keep the Bears", async ({ page }) => {
  const s = scene({ hand: ["Volatile Stormdrake"], board: LANDS }, [{ board: ["Grizzly Bears"] }]);
  const [drake, bears] = [one(s, "Volatile Stormdrake"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Volatile Stormdrake", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" || (st.objects[drake]!.zone === "battlefield" && st.stack.length > 0));
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Pay ⚡ equal to that creature's mana value to keep it (2 energy)?");
  await bar.getByRole("button", { name: "Pay", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[bears]!.zone).toBe("battlefield");
  // Exchange of control is a layer 2 effect (CR 613.1b): read it from the layers.
  expect(controllerOf(after, after.objects[bears]!)).toBe(0);
  expect(controllerOf(after, after.objects[drake]!)).toBe(1);
  expect(after.players[0]!.energy).toBe(2);
  expect(pageErrors(page)).toEqual([]);
});

test("Karn, the Great Creator: −2 puts Mind Stone from exile into your hand, not Ana's exiled Mind Stone", async ({ page }) => {
  const s = scene({ board: ["Karn, the Great Creator"], exile: ["Mind Stone", "Grizzly Bears"] }, [{ exile: ["Mind Stone"] }]);
  const karn = one(s, "Karn, the Great Creator");
  s.objects[karn]!.counters.loyalty = 5;
  const [mine, theirs] = [idsOf(s, "Mind Stone", "exile", 0)[0]!, idsOf(s, "Mind Stone", "exile", 1)[0]!];
  await open(page, s);
  await page.locator(`[data-obj="${karn}"]`).first().click();
  await menu(page).locator("button", { hasText: "artifact card you own" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" || st.pending?.kind === "chooseMay");
  const mid = await resolveUntil(page, () => true);
  if (mid.pending?.kind === "chooseMay") await controls(page).getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await expect(pick).toContainText("artifact card");
  await expect(pick.locator("[data-pick]")).toHaveCount(1);
  await pick.locator(`[data-pick="${mine}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[mine]!.zone === "hand");
  expect(after.objects[theirs]!.zone).toBe("exile");
  expect(after.objects[one(s, "Grizzly Bears")]!.zone).toBe("exile");
  expect(after.objects[karn]!.counters.loyalty).toBe(3);
  expect(pageErrors(page)).toEqual([]);
});

test("Food Chain: exile Hill Giant to add five mana of one color (green), only for creature spells", async ({ page }) => {
  const s = scene({ board: ["Food Chain", "Hill Giant"] });
  const [chain, giant] = [one(s, "Food Chain"), one(s, "Hill Giant")];
  await open(page, s);
  await page.locator(`[data-obj="${chain}"]`).first().click();
  // One menu entry for each color.
  await expect(menu(page).locator("button", { hasText: "Exile a creature you control: add" })).toHaveCount(5);
  await menu(page).locator("button", { hasText: "Exile a creature you control: add" }).filter({ has: page.locator("[title='{G}']") }).click();
  await expect(page.locator(".targeting")).toContainText("exile");
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await page.locator(".targeting").getByRole("button", { name: "Sacrifice and activate" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.objects[giant]!.zone === "exile");
  expect(after.players[0]!.manaPool.G).toBe(5);
  expect(after.players[0]!.manaLots?.filter((l) => l.mana === "G" && l.only).reduce((n, l) => n + l.n, 0)).toBe(5);
  expect(pageErrors(page)).toEqual([]);
});

test("Liliana of the Dark Realms: −3 on your Grizzly Bears, choosing +X/+X as it resolves (three Swamps: 5/5)", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Liliana of the Dark Realms", "Grizzly Bears"] });
  const [liliana, bears] = [one(s, "Liliana of the Dark Realms"), one(s, "Grizzly Bears")];
  s.objects[liliana]!.counters.loyalty = 3;
  await open(page, s);
  await page.locator(`[data-obj="${liliana}"]`).first().click();
  await menu(page).locator("button", { hasText: "Target creature gets" }).click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "either");
  const bar = controls(page);
  await expect(bar.getByRole("button", { name: "It gets -X/-X until end of turn" })).toBeVisible();
  await bar.getByRole("button", { name: "It gets +X/+X until end of turn" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect([power(after, after.objects[bears]!), toughness(after, after.objects[bears]!)]).toEqual([5, 5]);
  expect(after.objects[liliana]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
