// Round 288 in the browser: Endless Detour's "From a graveyard" button for a target that may be a spell, a nonland
// permanent or a card in a graveyard; Clockspinning's "A suspended card" button, then the kind of counter and one more or
// one fewer; Jhoira's Timebug's "Neither"; Protection Racket asking you to pay life equal to the revealed card's mana
// value; Yuna's Decision putting a creature card and a land card from your hand at once; Soul Immolation's X with its
// blight on the creature you click.
import { expect, test } from "@playwright/test";
import { invalidateCharacteristics, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

test("Endless Detour: From a graveyard, Ana's Grizzly Bears; it goes into her library", async ({ page }) => {
  const s = scene({ hand: ["Endless Detour"], board: LANDS }, [{ yard: ["Grizzly Bears"] }]);
  const bears = one(s, "Grizzly Bears");
  await open(page, s);
  await card(page, "Endless Detour", s).click();
  const bar = page.locator(".targeting");
  await expect(bar).toContainText("target spell, nonland permanent, or card in a graveyard");
  await bar.getByRole("button", { name: "From a graveyard" }).click();
  const pick = modal(page);
  await expect(pick).toContainText("Ana's graveyard");
  await pick.locator(`[data-pick="${bears}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "library");
  const lib = after.players[1]!.library;
  expect(lib[0] === bears || lib.at(-1) === bears).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Clockspinning: A suspended card, your Ancestral Vision; remove a time counter", async ({ page }) => {
  const s = scene({ hand: ["Clockspinning"], board: LANDS, exile: ["Ancestral Vision"] });
  const vision = one(s, "Ancestral Vision");
  s.objects[vision]!.counters.time = 3;
  await open(page, s);
  await card(page, "Clockspinning", s).click();
  await page.locator(".targeting").getByRole("button", { name: "Don't" }).click();
  const bar = page.locator(".targeting", { hasText: "target permanent or suspended card" });
  await bar.getByRole("button", { name: "A suspended card" }).click();
  const pick = modal(page);
  await expect(pick).toContainText("Your cards in exile");
  await pick.locator(`[data-pick="${vision}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "addOrRemoveCounter");
  await controls(page).getByRole("button", { name: "Remove a time counter from it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[vision]!.counters.time === 2);
  expect(after.objects[vision]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});

test("Clockspinning: a charge counter, not the +1/+1 counter, on your Hill Giant; put another", async ({ page }) => {
  const s = scene({ hand: ["Clockspinning"], board: [...LANDS, "Hill Giant"] });
  const giant = one(s, "Hill Giant");
  s.objects[giant]!.counters = { "+1/+1": 1, charge: 1 };
  invalidateCharacteristics(s);
  await open(page, s);
  await card(page, "Clockspinning", s).click();
  await page.locator(".targeting").getByRole("button", { name: "Don't" }).click();
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "counterKind");
  await controls(page).getByRole("button", { name: "A charge counter" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "addOrRemoveCounter");
  await controls(page).getByRole("button", { name: "Put another charge counter on it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.counters.charge === 2);
  expect(after.objects[giant]!.counters["+1/+1"]).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Jhoira's Timebug: your suspended Ancestral Vision, then Neither; its time counters stay", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Jhoira's Timebug"], exile: ["Ancestral Vision"] });
  const [bug, vision] = [one(s, "Jhoira's Timebug"), one(s, "Ancestral Vision")];
  s.objects[vision]!.counters.time = 2;
  await open(page, s);
  await card(page, "Jhoira's Timebug", s).click();
  const m = menu(page);
  if (await m.count()) await m.locator("button").first().click();
  const bar = page.locator(".targeting", { hasText: "suspended card you own" });
  await bar.getByRole("button", { name: "A suspended card" }).click();
  await modal(page).locator(`[data-pick="${vision}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "addOrRemoveCounter");
  const c = controls(page);
  await expect(c.getByRole("button", { name: "Put another time counter on it" })).toBeVisible();
  await c.getByRole("button", { name: "Neither" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bug]!.tapped);
  expect(after.objects[vision]!.counters.time).toBe(2);
  expect(pageErrors(page)).toEqual([]);
});

test("Protection Racket: Ana's upkeep; you pay 4 life to exile her Hill Giant", async ({ page }) => {
  let s: GameState = scene({ board: LANDS }, [{ board: ["Protection Racket"], library: ["Island", "Island", "Hill Giant"] }]);
  const giant = one(s, "Hill Giant");
  s = playUntil(s, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "punisher" && st.pending.player === 0);
  const life = s.players[0]!.life;
  await open(page, s);
  const c = controls(page);
  await expect(c.getByRole("button", { name: "Don't" })).toBeVisible();
  await c.getByRole("button", { name: "Pay 4 life" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.objects[giant]!.zone === "exile");
  expect(after.players[0]!.life).toBe(life - 4);
  expect(pageErrors(page)).toEqual([]);
});

test("Yuna's Decision: sacrifice Grizzly Bears, then Hill Giant and Forest from your hand together", async ({ page }) => {
  const s = scene({ hand: ["Yuna's Decision", "Hill Giant", "Gray Ogre", "Forest"], board: [...LANDS, "Grizzly Bears"] });
  const [bears, giant, ogre] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Gray Ogre")];
  const forest = s.players[0]!.hand.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Forest")!;
  await open(page, s);
  await card(page, "Yuna's Decision", s).click();
  const modes = page.locator(".mode-menu");
  await modes.getByRole("button", { name: /^Sacrifice a creature/ }).click();
  if (await modes.getByRole("button", { name: "Done" }).count()) await modes.getByRole("button", { name: "Done" }).click();
  let st = await resolveUntil(page, (x) => (x.pending?.kind === "pickPermanents" && x.pending.player === 0) || (x.pending?.kind === "searchLibrary" && x.pending.player === 0));
  if (st.pending?.kind === "pickPermanents") {
    await page.locator(`[data-obj="${bears}"]`).first().click();
    await controls(page).getByRole("button", { name: "Sacrifice", exact: true }).click();
    st = await resolveUntil(page, (x) => x.pending?.kind === "searchLibrary" && x.pending.player === 0);
  }
  expect(st.objects[bears]!.zone).toBe("graveyard");
  const pick = modal(page);
  await expect(pick).toContainText("one for each of creature card and land card");
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.locator(`[data-pick="${forest}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending && x.objects[giant]!.zone === "battlefield");
  expect(after.objects[forest]!.zone).toBe("battlefield");
  expect(after.objects[ogre]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});

test("Soul Immolation: X = 2, blight 2 on your Hill Giant; 2 damage to each opponent and their creatures", async ({ page }) => {
  const s = scene({ hand: ["Soul Immolation"], board: [...LANDS, "Hill Giant"] }, [{ board: ["Grizzly Bears"] }]);
  const [giant, bears] = [one(s, "Hill Giant"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Soul Immolation", s).click();
  const x = page.locator(".x-pick");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  const bar = page.locator(".targeting", { hasText: "blight 2" });
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await bar.getByRole("button", { name: /^Blight and cast/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "graveyard");
  expect(after.objects[giant]!.counters["-1/-1"]).toBe(2);
  expect(after.players.map((p) => p.life)).toEqual([40, 38, 38, 38]);
  expect(pageErrors(page)).toEqual([]);
});
