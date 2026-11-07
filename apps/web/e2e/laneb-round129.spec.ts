// Lane B round B129 in the browser: Rite of Ruin's order for artifacts, creatures and lands (six buttons, then each
// player sacrifices in that order); Mindblaze's card name and "a number greater than 0" (up to the cards in the target's
// library); Odds with Krark's Thumb (two coins no one called, one heads and one tails: keep heads or tails).
import { expect, test } from "@playwright/test";
import { applyAction, botActions, planCast, waitingOn, type GameState } from "@cc/engine";
import { idsOf, LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, controls, modal, resolveUntil } from "./ui";

test("Rite of Ruin: choose lands, then artifacts, then creatures; you pick a land and lose both artifacts; Ana loses her Forest, Ornithopter and both creatures", async ({ page }) => {
  const s = scene({ hand: ["Rite of Ruin"], board: [...LANDS, "Sol Ring", "Mind Stone"] }, [{ board: ["Forest", "Grizzly Bears", "Llanowar Elves", "Ornithopter"] }]);
  const [ring, stone, bears, elves, thopter] = ["Sol Ring", "Mind Stone", "Grizzly Bears", "Llanowar Elves", "Ornithopter"].map((n) => one(s, n)) as [string, string, string, string, string];
  const forest = idsOf(s, "Forest", "battlefield", 1)[0]!;
  await open(page, s);
  await card(page, "Rite of Ruin", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "typeOrder" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("choose an order for artifacts, creatures, and lands");
  await bar.getByRole("button", { name: "lands, then artifacts, then creatures" }).click();
  const pick = await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  const land = ["Plains", "Island", "Swamp", "Mountain", "Forest"].flatMap((n) => idsOf(s, n, "battlefield", 0)).find((id) => pick.objects[id]!.tapped)!;
  await page.locator(`[data-obj="${land}"]`).first().click();
  await bar.getByRole("button", { name: "Sacrifice", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[one(s, "Rite of Ruin")]!.zone === "graveyard");
  expect(after.objects[land]!.zone).toBe("graveyard");
  expect([ring, stone, forest].map((id) => after.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "graveyard"]);
  // Ana: her Forest, then Ornithopter as her only artifact (rulings: an artifact creature sacrificed as an artifact
  // is gone before creatures are sacrificed), then her two other creatures.
  expect([bears, elves, thopter].map((id) => after.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "graveyard"]);
  expect(["Plains", "Island", "Swamp", "Mountain", "Forest"].flatMap((n) => idsOf(s, n, "battlefield", 0)).filter((id) => after.objects[id]!.zone === "battlefield")).toHaveLength(LANDS.length - 1);
  expect(pageErrors(page)).toEqual([]);
});

test("Mindblaze: target Ana, name Lightning Bolt and choose 2 (the number box goes up to her library); she has exactly two, so 8 damage", async ({ page }) => {
  const s = scene({ hand: ["Mindblaze"], board: LANDS }, [{ library: ["Lightning Bolt", "Lightning Bolt"] }]);
  const size = s.players[1]!.library.length;
  const life = s.players[1]!.life;
  await open(page, s);
  await card(page, "Mindblaze", s).click();
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "cardName" && st.pending.player === 0);
  const pick = modal(page);
  await expect(pick).toContainText("Mindblaze: choose a nonland card name");
  await pick.locator("input").fill("bolt");
  await pick.locator('[data-name="Lightning Bolt"]').click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "number" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText(`choose a number greater than 0 (up to ${size}, the cards in that player's library)`);
  await bar.getByRole("spinbutton", { name: "Number" }).fill("2");
  await bar.getByRole("button", { name: "Choose 2" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[one(s, "Mindblaze")]!.zone === "graveyard");
  expect(after.players[1]!.life).toBe(life - 8);
  expect(after.players[1]!.library.length).toBe(size);
  expect(after.log.some((l) => (typeof l === "string" ? l : l.text).startsWith("Ana reveals their library"))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

/** Your Divination on the stack, your Odds targeting it with Krark's Thumb out, resolved up to the Thumb's question. */
function oddsThumb(): GameState {
  const s0 = scene({ hand: ["Divination", "Odds // Ends"], board: [...LANDS, "Krark's Thumb"] });
  const [div, odds] = [one(s0, "Divination"), one(s0, "Odds // Ends")];
  for (let seed = 1; seed < 200; seed++) {
    let s = structuredClone(s0);
    for (const a of planCast(s, 0, div)!) s = applyAction(s, a);
    const spell = s.stack[s.stack.length - 1]!.id;
    for (const a of planCast(s, 0, odds, [{ kind: "stack", id: spell }], undefined, undefined, undefined, { face: 0 })!) s = applyAction(s, a);
    s.rngState = seed;
    for (let i = 0; i < 20 && !s.pending && s.stack.length > 1; i++) {
      const pid = waitingOn(s)!;
      s = applyAction(s, pid === 0 ? { type: "passPriority", player: 0 } : botActions(s, pid)[0]!);
    }
    if (s.pending?.kind === "chooseMay" && s.pending.thumb) return s;
  }
  throw new Error("no seed flips heads and tails");
}

for (const keep of ["Yes", "No"] as const)
  test(`Odds with Krark's Thumb: heads and tails, ${keep === "Yes" ? "keep heads: Divination is countered" : "keep tails: Divination is copied"}`, async ({ page }) => {
    const s = oddsThumb();
    const div = one(s, "Divination");
    const hand = s.players[0]!.hand.length;
    await open(page, s);
    const bar = controls(page);
    await expect(bar).toContainText("Odds: Keep heads (Krark's Thumb flipped two coins, heads and tails; No keeps tails)");
    await bar.getByRole("button", { name: keep, exact: true }).click();
    const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
    expect(after.objects[div]!.zone).toBe("graveyard");
    expect(after.players[0]!.hand.length).toBe(hand + (keep === "Yes" ? 0 : 4));
    expect(pageErrors(page)).toEqual([]);
  });
