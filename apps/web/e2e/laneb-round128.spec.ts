// Lane B round B128 in the browser: Wormfang Crab's "an opponent chooses a permanent you control ... and exiles it"
// (you choose the opponent, the opponent chooses the permanent); Wormfang Drake's "sacrifice it unless you exile a
// creature you control" (the choice, then the creature, or sacrificed); Wormfang Newt's land picked to exile; Corpseweft's "Exile one or
// more creature cards from your graveyard" (X chosen, then the cards clicked).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

test("Wormfang Crab: choose Ana, and Ana exiles one of your other permanents", async ({ page }) => {
  const s = scene({ hand: ["Wormfang Crab"], board: [...LANDS, "Sol Ring"] });
  const crab = one(s, "Wormfang Crab");
  await open(page, s);
  await card(page, "Wormfang Crab", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.player === 0);
  const bar = controls(page);
  await bar.getByRole("button", { name: "Ana" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[0]!.exile.length === 1);
  const gone = after.players[0]!.exile[0]!;
  expect(gone).not.toBe(crab);
  expect(after.objects[crab]!.zone).toBe("battlefield");
  expect(after.log.some((l) => (typeof l === "string" ? l : l.text).startsWith("Ana exiles"))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Wormfang Drake: exile your Grizzly Bears (not your Llanowar Elves) to keep it", async ({ page }) => {
  const s = scene({ hand: ["Wormfang Drake"], board: [...LANDS, "Grizzly Bears", "Llanowar Elves"] });
  const [drake, bears] = [one(s, "Wormfang Drake"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Wormfang Drake", s).click();
  await resolveUntil(page, (st) => !!st.pending && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Exile a creature you control other than Wormfang Drake to keep Wormfang Drake?");
  await bar.getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await bar.getByRole("button", { name: "Exile" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[0]!.exile.length === 1);
  expect(after.objects[after.players[0]!.exile[0]!]!.cardId).toBe(s.objects[bears]!.cardId);
  expect(after.objects[drake]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Wormfang Drake: decline, and it's sacrificed", async ({ page }) => {
  const s = scene({ hand: ["Wormfang Drake"], board: [...LANDS, "Grizzly Bears"] });
  const [drake, bears] = [one(s, "Wormfang Drake"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Wormfang Drake", s).click();
  await resolveUntil(page, (st) => !!st.pending && st.pending.player === 0);
  await controls(page).getByRole("button", { name: "No" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[drake]!.zone === "graveyard");
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Wormfang Newt: click the land to exile", async ({ page }) => {
  const s = scene({ hand: ["Wormfang Newt"], board: [...LANDS, "Darksteel Citadel"] });
  const citadel = one(s, "Darksteel Citadel");
  await open(page, s);
  await card(page, "Wormfang Newt", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("click a land of yours to exile");
  await page.locator(`[data-obj="${citadel}"]`).first().click();
  await bar.getByRole("button", { name: "Exile" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[citadel]!.zone === "exile");
  expect(after.objects[one(s, "Wormfang Newt")]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Corpseweft: choose X = 2, click two creature cards in your graveyard, and get a tapped 4/4 Zombie Horror", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Corpseweft"], yard: ["Grizzly Bears", "Llanowar Elves", "Lightning Bolt", "Hill Giant"] });
  const [cw, bears, elves, bolt, giant] = ["Corpseweft", "Grizzly Bears", "Llanowar Elves", "Lightning Bolt", "Hill Giant"].map((n) => one(s, n)) as [string, string, string, string, string];
  await open(page, s);
  await page.locator(`[data-obj="${cw}"]`).first().click();
  await menu(page).locator("button", { hasText: "Exile one or more creature cards" }).click();
  const x = page.locator(".x-pick");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  const pick = modal(page);
  await expect(pick.locator(`[data-pick="${bolt}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${bears}"]`).click();
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.battlefield.some((id) => st.objects[id]!.isToken));
  expect([bears, elves, bolt, giant].map((id) => after.objects[id]!.zone)).toEqual(["exile", "graveyard", "graveyard", "exile"]);
  const token = after.battlefield.find((id) => after.objects[id]!.isToken)!;
  expect(after.objects[token]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
