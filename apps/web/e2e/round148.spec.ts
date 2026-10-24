// Round 148's prompts: offering asks which permanent to sacrifice as the spell is announced (required when it's cast at
// instant speed, skippable otherwise); Turnabout chooses the card type and tapping or untapping as it resolves; Dance
// with Calamity asks card by card whether to exile another; Benthic Anomaly picks one creature of each opponent's and
// which of them to copy; Locke, Treasure Hunter lets you cast a spell from among the milled cards, from any graveyard.
import { expect, test } from "@playwright/test";
import { waitingOn } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { attack, card, clickPlayer, controls, menu, modal, resolveUntil } from "./ui";

test("Patron of the Akki: in Ana's end step it can be cast only by sacrificing a Goblin: Raging Goblin's {R} off, {4}{R}", async ({ page }) => {
  const s0 = scene({ hand: ["Patron of the Akki"], board: [...LANDS, "Raging Goblin"] }, [], { step: "end" });
  const [patron, goblin] = [one(s0, "Patron of the Akki"), one(s0, "Raging Goblin")];
  const s = playUntil(s0, (st) => st.activePlayer === 1 && st.step === "end" && waitingOn(st) === 0);
  await open(page, s);
  await card(page, "Patron of the Akki", s).click();
  const bar = page.locator(".targeting", { hasText: "Goblin offering: sacrifice a Goblin; it costs that permanent's mana cost less" });
  await expect(bar).toBeVisible();
  await expect(bar.getByRole("button", { name: "Cast without" })).toHaveCount(0);
  await page.locator(`[data-obj="${goblin}"]`).click();
  await bar.getByRole("button", { name: "Sacrifice and cast" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[patron]!.zone === "battlefield");
  expect(after.objects[goblin]!.zone).toBe("graveyard");
  expect(after.battlefield.filter((id) => after.objects[id]!.controller === 0 && after.objects[id]!.tapped)).toHaveLength(5);
  expect(pageErrors(page)).toEqual([]);
});

test("Blast-Furnace Hellkite: in your main phase the offering may be skipped, and it's cast for its whole cost", async ({ page }) => {
  const s = scene({ hand: ["Blast-Furnace Hellkite"], board: [...LANDS, "Sol Ring"] });
  const [hellkite, ring] = [one(s, "Blast-Furnace Hellkite"), one(s, "Sol Ring")];
  await open(page, s);
  await card(page, "Blast-Furnace Hellkite", s).click();
  const bar = page.locator(".targeting", { hasText: "Artifact offering: you may sacrifice an artifact" });
  await expect(bar).toContainText("can be cast any time you could cast an instant");
  await bar.getByRole("button", { name: "Cast without" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[hellkite]!.zone === "battlefield");
  expect(after.objects[ring]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Turnabout: choose Land, then tap all of Ana's untapped lands", async ({ page }) => {
  const s = scene({ hand: ["Turnabout"], board: LANDS }, [{ board: ["Forest", "Forest", "Grizzly Bears"] }]);
  const bears = one(s, "Grizzly Bears");
  const theirs = s.battlefield.filter((id) => s.objects[id]!.controller === 1 && id !== bears);
  await open(page, s);
  await card(page, "Turnabout", s).click();
  await clickPlayer(page, 1);
  const st = await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "cardType");
  expect(st.pending?.kind === "chooseOption" && st.pending.options).toEqual(["Artifact", "Creature", "Land"]);
  const bar = controls(page);
  await bar.getByRole("button", { name: "Land", exact: true }).click();
  await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "either");
  await expect(bar.getByRole("button", { name: "Untap all its tapped permanents of the chosen type" })).toBeVisible();
  await bar.getByRole("button", { name: "Tap all its untapped permanents of the chosen type" }).click();
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending && x.objects[one(s, "Turnabout")]!.zone === "graveyard");
  for (const id of theirs) expect(after.objects[id]!.tapped).toBe(true);
  expect(after.objects[bears]!.tapped).toBe(false);
  expect(pageErrors(page)).toEqual([]);
});

test("Dance with Calamity: exile two Hill Giants one at a time (8, 13 or less), then cast both free", async ({ page }) => {
  const s = scene({ hand: ["Dance with Calamity"], board: LANDS, library: ["Hill Giant", "Hill Giant", "Hill Giant", "Hill Giant"] });
  // Only the Giants in the library, so the shuffle can't change what's exiled.
  const p = s.players[0]!;
  for (const id of p.library.filter((id) => s.cards[s.objects[id]!.cardId]!.name !== "Hill Giant")) {
    s.objects[id]!.zone = "exile";
    p.exile.push(id);
  }
  p.library = p.library.filter((id) => s.objects[id]!.zone === "library");
  await open(page, s);
  await card(page, "Dance with Calamity", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("total mana value so far: 0; 13 or less to cast them");
  await bar.getByRole("button", { name: "Yes" }).click();
  await expect(bar).toContainText("total mana value so far: 4;");
  await bar.getByRole("button", { name: "Yes" }).click();
  await expect(bar).toContainText("total mana value so far: 8;");
  await bar.getByRole("button", { name: "No" }).click();
  const st = await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "castFromAmong");
  const giants = st.pending?.kind === "chooseOption" ? st.pending.options.filter((o) => o !== "none") : [];
  expect(giants).toHaveLength(2);
  for (const g of giants) {
    await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "castFromAmong" && x.pending.options.includes(g));
    await bar.getByRole("button", { name: /^Hill Giant/ }).first().click();
    await bar.getByRole("button", { name: "Cast it" }).click();
  }
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending && giants.every((g) => x.objects[g]!.zone === "battlefield"));
  expect(after.players[0]!.library).toHaveLength(2);
  expect(pageErrors(page)).toEqual([]);
});

test("Benthic Anomaly: pick one of Ana's two creatures, Ben's Hill Giant is his only one; copy the Giant, a 5/5 Eldrazi", async ({ page }) => {
  const s = scene({ hand: ["Benthic Anomaly"], board: LANDS }, [{ board: ["Grizzly Bears", "Llanowar Elves"] }, { board: ["Hill Giant"] }]);
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Benthic Anomaly", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  await page.locator(`[data-obj="${bears}"]`).click();
  await controls(page).getByRole("button", { name: /^Choose/ }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  await expect(modal(page)).toContainText("one of those creatures to copy");
  await modal(page).locator(`[data-pick="${giant}"]`).click();
  await modal(page).getByRole("button", { name: /^Choose|^Done|^Find/ }).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[one(s, "Benthic Anomaly")]!.zone === "battlefield");
  const token = after.battlefield.find((id) => after.objects[id]!.isToken && after.objects[id]!.controller === 0)!;
  await expect(page.locator(`[data-obj="${token}"]`)).toContainText("Hill Giant");
  await expect(page.locator(`[data-obj="${token}"]`)).toContainText("5/5");
  expect(pageErrors(page)).toEqual([]);
});

test("Locke, Treasure Hunter: attacking mills Ana's Lightning Bolt; you cast it from her graveyard", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Locke, Treasure Hunter"], library: ["Forest"] }, [{ library: ["Lightning Bolt"] }]);
  const [locke, bolt] = [one(s, "Locke, Treasure Hunter"), one(s, "Lightning Bolt")];
  await open(page, playUntil(s, (st) => st.pending?.kind === "declareAttackers"));
  await attack(page, [[locke, 1]]);
  // The Forest you milled makes a Treasure.
  const st = await resolveUntil(page, (x) => x.objects[bolt]!.zone === "graveyard" && x.stack.length === 0 && !x.pending && x.priority === 0);
  expect(st.battlefield.some((id) => st.objects[id]!.isToken && st.objects[id]!.controller === 0)).toBe(true);
  const life = st.players[2]!.life;
  await page.locator('[data-graveyard="1"]').click();
  await modal(page).locator(".card.playable", { hasText: "Lightning Bolt" }).click();
  await menu(page).locator("button", { hasText: "Cast from graveyard" }).click();
  await clickPlayer(page, 2);
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending && x.objects[bolt]!.zone === "graveyard" && x.players[2]!.life < life);
  expect(after.players[2]!.life).toBe(life - 3);
  expect(pageErrors(page)).toEqual([]);
});
