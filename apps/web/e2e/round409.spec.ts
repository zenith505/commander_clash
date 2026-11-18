// Round 409 in the browser: Portent of Calamity's pick of a revealed card of each card type into exile and its free cast
// from among them, Jadzi, Oracle of Arcavios's revealed card cast for {1}, Journey to the Oracle's lands from hand and
// its discard to return it, and Arni Metalbrow's {1}{R} for a creature from hand that enters attacking.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { attack, card, clickPlayer, controls, menu, modal, resolveUntil } from "./ui";

test("Portent of Calamity: X = 5, exile one of each card type, cast Grizzly Bears free, the rest to hand", async ({ page }) => {
  const s = scene({ hand: ["Portent of Calamity"], board: LANDS, library: ["Grizzly Bears", "Pacifism", "Opt", "Island", "Divination"] });
  const [portent, bears, pac, opt, div] = ["Portent of Calamity", "Grizzly Bears", "Pacifism", "Opt", "Divination"].map((n) => one(s, n)) as [string, string, string, string, string];
  const isl = s.players[0]!.library[3]!;
  await open(page, s);
  await card(page, "Portent of Calamity", s).click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /^Cast/ }).first().click();
  const x = page.locator(".x-pick");
  await x.getByLabel("X", { exact: true }).fill("5");
  await x.getByRole("button", { name: "X = 5" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const pick = modal(page);
  await expect(pick).toContainText("into exile");
  for (const id of [bears, pac, opt, isl]) await pick.locator(`[data-pick="${id}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("without paying its mana cost");
  await bar.getByRole("button", { name: "Grizzly Bears" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.player === 0);
  await controls(page).getByRole("button", { name: "Cast it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "battlefield");
  expect([pac, opt, isl, div, portent].map((id) => after.objects[id]!.zone)).toEqual(["hand", "hand", "hand", "graveyard", "graveyard"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Jadzi, Oracle of Arcavios: Lightning Bolt at Ana reveals Hill Giant, cast for {1}", async ({ page }) => {
  const s = scene({ hand: ["Lightning Bolt"], board: [...LANDS, "Jadzi, Oracle of Arcavios // Journey to the Oracle"], library: ["Hill Giant"] });
  const [bolt, giant] = [one(s, "Lightning Bolt"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Lightning Bolt", s).click();
  await clickPlayer(page, 1);
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.player === 0);
  const untappedLands = (st: typeof asked) => st.battlefield.filter((id) => st.objects[id]!.controller === 0 && !st.objects[id]!.tapped && st.cards[st.objects[id]!.cardId]!.types.includes("Land")).length;
  const untapped = untappedLands(asked);
  const bar = controls(page);
  await expect(bar).toContainText("cast Hill Giant from the top of your library by paying");
  await bar.getByRole("button", { name: "Cast it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "battlefield" && st.objects[bolt]!.zone === "graveyard");
  // {1} paid, not {3}{R}.
  expect(untapped - untappedLands(after)).toBe(1);
  expect(after.players[1]!.life).toBe(37);
  expect(pageErrors(page)).toEqual([]);
});

test("Journey to the Oracle: put Island and Forest from hand, then discard Grizzly Bears to return it", async ({ page }) => {
  // Two cards left to choose from for the discard (with one, it's discarded without asking).
  const s = scene({ hand: ["Jadzi, Oracle of Arcavios // Journey to the Oracle", "Island", "Forest", "Grizzly Bears", "Hill Giant"], board: LANDS });
  const [jadzi, bears, giant] = [one(s, "Jadzi, Oracle of Arcavios"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  const hand = s.players[0]!.hand.filter((id) => ["Island", "Forest"].includes(s.cards[s.objects[id]!.cardId]!.name));
  await open(page, s);
  await card(page, "Jadzi, Oracle of Arcavios", s).click();
  await menu(page).getByRole("button", { name: /^Cast Journey to the Oracle/ }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const pick = modal(page);
  for (const id of hand) await pick.locator(`[data-pick="${id}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await controls(page).getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "discard" && st.pending.player === 0);
  await expect(controls(page)).toContainText("Journey to the Oracle: click 1 card in your hand to discard");
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await controls(page).getByRole("button", { name: "Discard" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[jadzi]!.zone === "hand");
  expect(hand.map((id) => after.objects[id]!.zone)).toEqual(["battlefield", "battlefield"]);
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(after.objects[giant]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});

test("Arni Metalbrow: Hill Giant attacks, pay {1}{R} and put Grizzly Bears onto the battlefield attacking Ana", async ({ page }) => {
  const s = scene({ hand: ["Grizzly Bears", "Craw Wurm"], board: [...LANDS, "Arni Metalbrow", "Hill Giant"] });
  const [giant, bears, wurm] = [one(s, "Hill Giant"), one(s, "Grizzly Bears"), one(s, "Craw Wurm")];
  await open(page, playUntil(s, (st) => st.pending?.kind === "declareAttackers"));
  await attack(page, [[giant, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Arni Metalbrow");
  await bar.getByRole("button", { name: "Pay", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const pick = modal(page);
  // Hill Giant's mana value is 4: Craw Wurm (6) can't be put in.
  await expect(pick.locator(`[data-pick="${wurm}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${bears}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  await expect(controls(page)).toContainText("choose what Grizzly Bears attacks");
  await controls(page).getByRole("button", { name: "Ana", exact: true }).click();
  // The Bears entered attacking: Arni triggers again (nothing with mana value less than 2 to put in).
  const again = await resolveUntil(page, (st) => st.objects[bears]!.zone === "battlefield" && st.pending?.kind === "chooseMay" && st.pending.player === 0);
  expect(again.objects[bears]!.attacking).toBe(1);
  expect(again.objects[bears]!.tapped).toBe(true);
  await controls(page).getByRole("button", { name: "Don't pay" }).click();
  const after = await resolveUntil(page, (st) => st.step === "main2");
  expect(after.players[1]!.life).toBe(40 - 3 - 2);
  expect(after.objects[wurm]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});
