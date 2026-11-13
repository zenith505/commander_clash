// Round 354's prompts: Espers to Magicite's reflexive trigger aimed at a creature card it exiled (the picker offers only
// those), Rootweaver Druid's search asked of you as an opponent (the first land you find goes to its controller), and
// Vincent's Limit Break's tier in the mode menu.
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, playWithBots, scene } from "./scene";
import { card, controls, modal, resolveUntil } from "./ui";

test("Espers to Magicite: exile the opponents' graveyards, then pick Ana's Hill Giant for an artifact copy of it", async ({ page }) => {
  const s = scene({ hand: ["Espers to Magicite"], board: LANDS, yard: ["Hill Giant"] }, [{ yard: ["Hill Giant", "Lightning Bolt"] }, { yard: ["Grizzly Bears"] }]);
  const anaGiant = idsOf(s, "Hill Giant", "graveyard", 1)[0]!;
  const myGiant = idsOf(s, "Hill Giant", "graveyard", 0)[0]!;
  const [bolt, bears] = [one(s, "Lightning Bolt"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Espers to Magicite", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  const pick = modal(page);
  await expect(pick).toContainText("up to one target creature card exiled this way");
  // Only the creature cards it exiled: not Lightning Bolt, not your own Hill Giant (still in your graveyard).
  await expect(pick.locator(`[data-pick="${bears}"]`)).toHaveCount(1);
  await expect(pick.locator(`[data-pick="${bolt}"]`)).toHaveCount(0);
  await expect(pick.locator(`[data-pick="${myGiant}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${anaGiant}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.battlefield.some((id) => st.objects[id]!.isToken));
  const tok = after.battlefield.find((id) => after.objects[id]!.isToken)!;
  expect(after.cards[after.objects[tok]!.cardId]!.name).toBe("Hill Giant");
  expect(after.objects[tok]!.controller).toBe(0);
  expect(after.objects[anaGiant]!.zone).toBe("exile");
  expect(after.objects[myGiant]!.zone).toBe("graveyard");
  // An artifact, not a creature: no power to show.
  await expect(page.locator(`[data-obj="${tok}"]`)).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});

test("Rootweaver Druid: Ana casts it, you may search for up to three basic lands; the first goes to Ana, the rest to you", async ({ page }) => {
  const s0 = scene({ board: LANDS }, [{ hand: ["Rootweaver Druid"], board: ["Forest", "Forest", "Forest"] }]);
  const druid = one(s0, "Rootweaver Druid");
  // In turn order from Ana's turn, Ana left out: Ben, Cy, then you.
  const s = playWithBots(s0, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  expect(s.objects[druid]!.zone).toBe("battlefield");
  const before = s.battlefield.length;
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Rootweaver Druid: Search your library for up to 3 basic land cards?");
  await bar.getByRole("button", { name: "Yes", exact: true }).click();
  const search = modal(page);
  await expect(search).toContainText("The first you find goes onto the battlefield tapped under Ana's control, the other onto the battlefield tapped under your control.");
  const picks = search.locator(".modal-cards [data-pick]");
  await picks.first().click();
  await picks.first().click();
  await search.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.battlefield.length === before + 2, 60);
  const mine = after.battlefield.filter((id) => after.objects[id]!.owner === 0 && !s.battlefield.includes(id));
  expect(mine).toHaveLength(2);
  expect(mine.every((id) => after.objects[id]!.tapped)).toBe(true);
  expect(mine.map((id) => after.objects[id]!.controller).sort()).toEqual([0, 1]);
  expect(pageErrors(page)).toEqual([]);
});

test("Vincent's Limit Break: pick the Hellmasker tier ({3} more); Hill Giant becomes 7/2 until end of turn", async ({ page }) => {
  const s = scene({ hand: ["Vincent's Limit Break"], board: [...LANDS, "Hill Giant"] });
  const giant = one(s, "Hill Giant");
  await open(page, s);
  await card(page, "Vincent's Limit Break", s).click();
  const modes = page.locator(".mode-menu");
  await expect(modes).toContainText('Galian Beast: Until end of turn, target creature you control gains "When this creature dies');
  await modes.getByRole("button", { name: /^\+ \{3\} — Hellmasker: .* 7\/2\.$/ }).click();
  const done = modes.getByRole("button", { name: "Done" });
  if (await done.count()) await done.click();
  await page.locator(`[data-obj="${giant}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.log.some((e) => /Vincent's Limit Break resolves/.test(e.text)));
  // {1}{B} and the tier's {3}.
  expect(after.battlefield.filter((id) => after.objects[id]!.tapped)).toHaveLength(5);
  await expect(page.locator(`[data-obj="${giant}"]`)).toContainText("7/2");
  expect(pageErrors(page)).toEqual([]);
});
