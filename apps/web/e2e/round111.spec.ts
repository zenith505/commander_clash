// Round 111's prompts: Gix's "Discard X cards" ability exiles Ana's top cards, then asks which to play: a land (a shock
// land asks about paying 2 life) and a spell, free; Eladamri's reveal from your hand or the top of your library; Akiri's
// unattach, which asks which Equipment; Thousand Moons Smithy's "tap five untapped artifacts and/or creatures"; Emeria
// Shepherd's choice after a Plains, to the battlefield or to your hand.
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, controls, menu, resolveUntil } from "./ui";

test("Gix: discard two to exile Ana's top two; play Watery Grave untapped for 2 life, then cast Grizzly Bears free", async ({ page }) => {
  const s = scene({ hand: ["Opt", "Shock"], board: [...LANDS, "Gix, Yawgmoth Praetor"] }, [{ library: ["Watery Grave", "Grizzly Bears"] }]);
  const [grave, bears] = [one(s, "Watery Grave"), one(s, "Grizzly Bears")];
  const [opt, shock] = [one(s, "Opt"), one(s, "Shock")];
  await open(page, s);
  await card(page, "Gix, Yawgmoth Praetor", s).click();
  await menu(page).locator("button", { hasText: "Discard X cards" }).click();
  const x = page.locator(".x-pick");
  await expect(x).toContainText("discard X");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  await clickPlayer(page, 1);
  const pick = page.locator(".modal", { hasText: "discard 2 cards" });
  await pick.locator(`[data-pick="${opt}"]`).click();
  await pick.locator(`[data-pick="${shock}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong");
  const bar = controls(page);
  await expect(bar).toContainText("play a land or cast a spell from among the exiled cards without paying its mana cost?");
  await bar.getByRole("button", { name: "Watery Grave" }).click();
  await expect(bar).toContainText("Pay 2 life so Watery Grave enters untapped?");
  await bar.getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong" && st.objects[grave]!.zone === "battlefield");
  await bar.getByRole("button", { name: "Grizzly Bears" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.objectId === bears);
  await bar.getByRole("button", { name: "Cast it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "battlefield");
  expect(after.objects[grave]!.tapped).toBe(false);
  expect(after.objects[bears]!.controller).toBe(0);
  expect(after.players[0]!.life).toBe(38);
  expect(after.players[0]!.landsPlayedThisTurn).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Eladamri: tap two creatures, then reveal Hill Giant from your hand: it's put onto the battlefield", async ({ page }) => {
  const s = scene({ hand: ["Hill Giant"], board: [...LANDS, "Eladamri, Korvecdal", "Grizzly Bears", "Grizzly Bears"] });
  const [giant, eladamri] = [one(s, "Hill Giant"), one(s, "Eladamri, Korvecdal")];
  const bears = idsOf(s, "Grizzly Bears", "battlefield");
  await open(page, s);
  await page.locator(`[data-obj="${eladamri}"]`).first().click();
  await menu(page).locator("button", { hasText: "Reveal a card" }).click();
  const tap = page.locator(".targeting", { hasText: "tap 2 untapped creatures you control" });
  for (const b of bears) await page.locator(`[data-obj="${b}"]`).click();
  await tap.getByRole("button", { name: "Tap and activate" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "revealHandOrTop");
  const bar = controls(page);
  await expect(bar).toContainText("reveal a card from your hand or the top card of your library");
  await expect(bar.getByRole("button", { name: "Top card of your library" })).toBeVisible();
  await bar.getByRole("button", { name: "Hill Giant" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "battlefield");
  expect(bears.map((b) => after.objects[b]!.tapped)).toEqual([true, true]);
  expect(pageErrors(page)).toEqual([]);
});

test("Akiri: {W} asks which Equipment to unattach; that creature is tapped and indestructible", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Akiri, Fearless Voyager", "Grizzly Bears", "Hill Giant", "Bonesplitter", "Bonesplitter"] });
  const [akiri, bears, giant] = [one(s, "Akiri, Fearless Voyager"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  const [b1, b2] = idsOf(s, "Bonesplitter", "battlefield");
  s.objects[b1!]!.attachedTo = bears;
  s.objects[b2!]!.attachedTo = giant;
  await open(page, s);
  await page.locator(`[data-obj="${akiri}"]`).first().click();
  await menu(page).locator("button", { hasText: "unattach an Equipment" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay");
  const bar = controls(page);
  await bar.getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.action === "unattach");
  await expect(bar).toContainText("click an Equipment to unattach from the creature of yours it's attached to");
  // The Equipment is tucked behind Hill Giant: click the edge of it that shows.
  await page.locator(`[data-obj="${b2}"]`).first().click({ position: { x: 6, y: 6 } });
  await bar.getByRole("button", { name: "Unattach" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[b2!]!.attachedTo === undefined);
  expect(after.objects[giant]!.tapped).toBe(true);
  expect(after.objects[bears]!.tapped).toBe(false);
  expect(after.objects[b1!]!.attachedTo).toBe(bears);
  expect(pageErrors(page)).toEqual([]);
});

test("Thousand Moons Smithy: at your first main phase, tap five of six untapped artifacts and creatures to transform it", async ({ page }) => {
  const s = scene({ board: ["Thousand Moons Smithy // Barracks of the Thousand", "Grizzly Bears", "Grizzly Bears", "Grizzly Bears", "Grizzly Bears", "Bonesplitter"] }, [], { step: "upkeep" });
  const smithy = one(s, "Thousand Moons Smithy");
  const bears = idsOf(s, "Grizzly Bears", "battlefield");
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay");
  const bar = controls(page);
  await bar.getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.action === "tap");
  await expect(bar).toContainText("click 5 untapped artifact or creature of yours to tap.");
  await page.locator(`[data-obj="${smithy}"]`).first().click();
  for (const b of bears) await page.locator(`[data-obj="${b}"]`).first().click();
  await bar.getByRole("button", { name: "Tap 5" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[smithy]!.face === 1);
  expect(bears.every((b) => after.objects[b]!.tapped)).toBe(true);
  expect(after.objects[one(s, "Bonesplitter")]!.tapped).toBe(false);
  expect(pageErrors(page)).toEqual([]);
});

test("Emeria Shepherd: play a Plains, return Grizzly Bears from your graveyard to the battlefield instead of your hand", async ({ page }) => {
  const s = scene({ hand: ["Plains"], board: ["Emeria Shepherd"], yard: ["Grizzly Bears"] });
  const bears = one(s, "Grizzly Bears");
  const plains = idsOf(s, "Plains", "hand")[0]!;
  await open(page, s);
  await page.locator(`[data-obj="${plains}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets");
  await page.locator(`.modal [data-pick="${bears}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay");
  const bar = controls(page);
  await bar.getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "either");
  await bar.getByRole("button", { name: "Return it to the battlefield" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "battlefield");
  expect(after.objects[bears]!.controller).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});
