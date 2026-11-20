// Lane B round B268 in the browser: Selective Adaptation (choose a card for each keyword there's one for, then the one
// put onto the battlefield), Brilliant Ultimatum (choose the pile to play from, then cast from it free) and Ana's
// Brilliant Ultimatum (you separate her exiled cards into two piles).
import { expect, test } from "@playwright/test";
import { applyAction, planCast, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, modal, resolveUntil } from "./ui";

test("Selective Adaptation: choose Serra Angel, Wind Drake and Raging Goblin, then put Serra Angel onto the battlefield", async ({ page }) => {
  const s = scene({ hand: ["Selective Adaptation"], board: LANDS, library: ["Serra Angel", "Wind Drake", "Grizzly Bears", "Raging Goblin", "Lightning Bolt", "Hill Giant", "Divination"] });
  const [angel, drake, bears, goblin, bolt] = [one(s, "Serra Angel"), one(s, "Wind Drake"), one(s, "Grizzly Bears"), one(s, "Raging Goblin"), one(s, "Lightning Bolt")];
  await open(page, s);
  await card(page, "Selective Adaptation", s).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  expect(asked.pending?.kind === "searchLibrary" ? [...asked.pending.cards].sort() : []).toEqual([angel, drake, goblin].sort());
  const pick = modal(page);
  await expect(pick).toContainText("Selective Adaptation: put a card for each of flying, first strike, double strike, deathtouch, haste, hexproof, indestructible, lifelink, menace, reach, trample, vigilance there's one for (then one of them onto the battlefield, the others into your hand)");
  // Wind Drake alone leaves Serra Angel (vigilance) and Raging Goblin (haste) with nothing chosen for theirs.
  await pick.locator(`[data-pick="${drake}"]`).click();
  await expect(pick.getByRole("button", { name: "Done" })).toBeDisabled();
  await pick.locator(`[data-pick="${angel}"]`).click();
  await pick.locator(`[data-pick="${goblin}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "oneOnto");
  const bar = controls(page);
  await expect(bar).toContainText("choose the card to put onto the battlefield (the others go into your hand)");
  await bar.getByRole("button", { name: "Serra Angel" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[angel]!.zone === "battlefield");
  expect([drake, goblin].map((id) => after.objects[id]!.zone)).toEqual(["hand", "hand"]);
  expect([bears, bolt].map((id) => after.objects[id]!.zone)).toEqual(["graveyard", "graveyard"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Brilliant Ultimatum: Ana separates the five exiled cards; play from the pile with Grizzly Bears and cast it free", async ({ page }) => {
  const s = scene({ hand: ["Brilliant Ultimatum"], board: LANDS, library: ["Grizzly Bears", "Hill Giant", "Lightning Bolt", "Divination", "Wind Drake"] });
  const five = ["Grizzly Bears", "Hill Giant", "Lightning Bolt", "Divination", "Wind Drake"].map((n) => one(s, n));
  const bears = five[0]!;
  await open(page, s);
  await card(page, "Brilliant Ultimatum", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "opponent" && st.pending.player === 0);
  await expect(controls(page)).toContainText("choose an opponent to separate the exiled cards into two piles");
  await controls(page).getByRole("button", { name: "Ana", exact: true }).click();
  // Ana's bot separates them; you choose a pile.
  const piles = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "pile" && st.pending.player === 0);
  const both: string[][] = piles.pending?.kind === "chooseOption" ? piles.pending.piles! : [[], []];
  const withBears = both[0]!.includes(bears) ? 0 : 1;
  const pileModal = modal(page);
  await expect(pileModal).toContainText("choose the pile to play lands and cast spells from (the other stays in exile)");
  await pileModal.getByRole("button", { name: `Play from pile ${withBears + 1}` }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong");
  const bar = controls(page);
  await expect(bar).toContainText("play a land or cast a spell from among the exiled cards without paying its mana cost?");
  // The other pile's cards aren't offered.
  for (const id of both[1 - withBears]!) await expect(bar.getByRole("button", { name: piles.cards[piles.objects[id]!.cardId]!.name, exact: true })).toHaveCount(0);
  await bar.getByRole("button", { name: "Grizzly Bears" }).click();
  await bar.getByRole("button", { name: "Cast it" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong" && !st.pending.options.includes(bears));
  await bar.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "battlefield");
  for (const id of both[1 - withBears]!) expect(after.objects[id]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});

test("Ana's Brilliant Ultimatum: you separate her five exiled cards into two piles, Hill Giant alone in the first", async ({ page }) => {
  let s: GameState = scene({ board: LANDS }, [{ hand: ["Brilliant Ultimatum"], board: LANDS, library: ["Plains", "Hill Giant", "Grizzly Bears", "Lightning Bolt", "Divination", "Wind Drake"] }]);
  const giant = one(s, "Hill Giant");
  const ult = one(s, "Brilliant Ultimatum");
  s = playUntil(s, (x) => x.activePlayer === 1 && x.step === "main1" && !x.pending && x.stack.length === 0);
  for (const a of planCast(s, 1, ult)!) s = applyAction(s, a);
  s = playUntil(s, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "opponent" && x.pending.player === 1);
  s = applyAction(s, { type: "chooseOption", player: 1, choice: "0" });
  s = playUntil(s, (x) => x.pending?.kind === "searchLibrary" && !!x.pending.piles && x.pending.player === 0);
  await open(page, s);
  const sep = modal(page);
  await expect(sep).toContainText("Brilliant Ultimatum: separate Ana's exiled cards into two piles");
  await expect(sep).toContainText("Ana chooses one to play lands and cast spells from without paying their mana costs; the other stays in exile.");
  await sep.locator(`[data-pick="${giant}"]`).click();
  await sep.getByRole("button", { name: "Done", exact: true }).click();
  const after = await resolveUntil(page, (x) => x.log.some((l) => /separates them into two piles: Hill Giant; and/.test(l.text)));
  expect(after.objects[giant]!.zone === "exile" || after.objects[giant]!.zone === "battlefield").toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
