// Round 335's prompts: Sasaya, Orochi Ascendant's "Reveal your hand" cost (no question, the hand shown in the log),
// The Master, Formed Anew's Body Thief (exile a creature you control, then the copy choice offering the card in exile
// with a takeover counter) and Tezzeret, Cruel Machinist's −7 (the cards from your hand to put face down as 5/5
// artifact creatures).
import { expect, test } from "@playwright/test";
import { characteristics, power, toughness } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

test("Sasaya, Orochi Ascendant: reveal a hand of seven lands and it flips into Sasaya's Essence", async ({ page }) => {
  const hand = ["Forest", "Forest", "Forest", "Mountain", "Mountain", "Island", "Swamp"];
  const s = scene({ hand, board: [...LANDS, "Sasaya, Orochi Ascendant // Sasaya's Essence"] });
  const sasaya = one(s, "Sasaya, Orochi Ascendant");
  await open(page, s);
  await page.locator(`[data-obj="${sasaya}"]`).click();
  const item = menu(page).locator("button", { hasText: "Reveal your hand" });
  if (await item.count()) await item.click();
  const after = await resolveUntil(page, (st) => st.objects[sasaya]!.face === 1 && st.stack.length === 0 && !st.pending);
  expect(characteristics(after, after.objects[sasaya]!).name).toBe("Sasaya's Essence");
  expect(after.log.some((l) => /^You reveals? (?:their|your) hand: /.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("The Master, Formed Anew: exile Serra Angel with a takeover counter, then enter as a copy of it", async ({ page }) => {
  const s = scene({ hand: ["The Master, Formed Anew"], board: [...LANDS, "Serra Angel"] });
  const [master, angel] = [one(s, "The Master, Formed Anew"), one(s, "Serra Angel")];
  await open(page, s);
  await card(page, "The Master, Formed Anew", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await controls(page).getByRole("button", { name: "Yes" }).click();
  // The one creature you control is exiled without a question; then the copy choice.
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "copy" && st.pending.player === 0);
  expect(asked.objects[angel]!.zone).toBe("exile");
  expect(asked.objects[angel]!.counters.takeover).toBe(1);
  const bar = controls(page);
  await bar.getByRole("button", { name: /^Serra Angel .*in exile/ }).click();
  const after = await resolveUntil(page, (st) => st.objects[master]!.zone === "battlefield" && st.stack.length === 0 && !st.pending);
  expect(characteristics(after, after.objects[master]!).name).toBe("Serra Angel");
  expect(power(after, after.objects[master]!)).toBe(4);
  expect(pageErrors(page)).toEqual([]);
});

test("Tezzeret, Cruel Machinist's −7: pick Lightning Bolt and Grizzly Bears from your hand, both face down as 5/5 artifact creatures", async ({ page }) => {
  const s = scene({ hand: ["Lightning Bolt", "Grizzly Bears", "Hill Giant"], board: [...LANDS, "Tezzeret, Cruel Machinist"] });
  const tz = one(s, "Tezzeret, Cruel Machinist");
  s.objects[tz]!.counters.loyalty = 7;
  const [bolt] = idsOf(s, "Lightning Bolt", "hand", 0);
  const [bears] = idsOf(s, "Grizzly Bears", "hand", 0);
  const [giant] = idsOf(s, "Hill Giant", "hand", 0);
  await open(page, s);
  await page.locator(`[data-obj="${tz}"]`).click();
  await menu(page).locator("button", { hasText: "Put any number of cards from your hand onto the battlefield face down" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const pick = modal(page);
  for (const id of [bolt, bears, giant]) await expect(pick.locator(`[data-pick="${id}"]`)).toBeVisible();
  await pick.locator(`[data-pick="${bolt}"]`).click();
  await pick.locator(`[data-pick="${bears}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.objects[bolt!]!.zone === "battlefield" && st.stack.length === 0 && !st.pending);
  for (const id of [bolt!, bears!]) {
    const o = after.objects[id]!;
    expect(o.faceDown).toBe("artifact55");
    expect([power(after, o), toughness(after, o)]).toEqual([5, 5]);
    expect([...characteristics(after, o).types].sort()).toEqual(["Artifact", "Creature"]);
  }
  expect(after.objects[giant!]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});
