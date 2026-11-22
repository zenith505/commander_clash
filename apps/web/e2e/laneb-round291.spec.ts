// Lane B round B291 in the browser: God-Eternal Kefnet (you reveal Concentrate, the first card Divination draws, then cast
// its copy for {U}{U}) and Glyph of Delusion (after the Wall is chosen, only the creature it blocked is a target; it gets
// glyph counters equal to its power).
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

test("God-Eternal Kefnet: reveal Concentrate as you draw it, then cast its copy for {2} less", async ({ page }) => {
  const s = scene({ hand: ["Divination"], board: [...LANDS, "God-Eternal Kefnet"], library: ["Concentrate", "Grizzly Bears"] });
  const [div, conc, bears] = [one(s, "Divination"), one(s, "Concentrate"), one(s, "Grizzly Bears")];
  // As if you hadn't drawn a card yet this turn.
  s.players[0]!.draws = undefined;
  const hand = s.players[0]!.hand.length;
  await open(page, s);
  await card(page, "Divination", s).click();
  const cast = menu(page).getByRole("button", { name: /^Cast it/ });
  if (await cast.count()) await cast.click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  // Asked before the second card is drawn.
  expect(asked.pending?.kind === "chooseMay" && asked.pending.card).toBe(conc);
  expect(asked.objects[bears]!.zone).toBe("library");
  const bar = controls(page);
  await expect(bar).toContainText("God-Eternal Kefnet: Reveal Concentrate as you draw it: you copy it and may cast the copy for {2} less?");
  await bar.getByRole("button", { name: "Yes", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.player === 0);
  await bar.getByRole("button", { name: "Cast it", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[div]!.zone === "graveyard" && st.players[0]!.hand.length >= hand + 4);
  // Divination's {2}{U} and the copy's {U}{U}: five lands.
  expect(after.battlefield.filter((id) => after.objects[id]!.tapped)).toHaveLength(5);
  expect([after.objects[conc]!.zone, after.objects[bears]!.zone]).toEqual(["hand", "hand"]);
  expect(Object.values(after.objects).filter((o) => o.spellCopy)).toHaveLength(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Glyph of Delusion: target your Wall, then the Grizzly Bears it blocked (not Hill Giant); two glyph counters", async ({ page }) => {
  const s = scene({ hand: ["Glyph of Delusion"], board: [...LANDS, "Wall of Stone"] }, [{ board: ["Grizzly Bears", "Hill Giant"] }], { step: "main2" });
  const [wall, bears, giant, glyph] = [one(s, "Wall of Stone"), one(s, "Grizzly Bears"), one(s, "Hill Giant"), idsOf(s, "Glyph of Delusion", "hand", 0)[0]!];
  // Earlier this turn the Wall blocked Ana's Grizzly Bears (as the engine logs a block).
  const key = (id: string) => `${id}@${s.objects[id]!.zoneChanges ?? 0}`;
  s.turnLog = { ...s.turnLog, blocks: [{ blocker: key(wall), attacker: key(bears), combat: 0, ac: 1 }] };
  await open(page, s);
  await card(page, "Glyph of Delusion", s).click();
  const cast = menu(page).getByRole("button", { name: /^Cast it/ });
  if (await cast.count()) await cast.click();
  await page.locator(`[data-obj="${wall}"]`).first().click();
  await expect(page.locator(`[data-obj="${bears}"]`).first()).toHaveClass(/targetable/);
  await expect(page.locator(`[data-obj="${giant}"]`).first()).not.toHaveClass(/targetable/);
  await page.locator(`[data-obj="${bears}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[glyph]!.zone === "graveyard");
  expect(after.objects[bears]!.counters.glyph).toBe(2);
  expect(after.objects[giant]!.counters.glyph ?? 0).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});
