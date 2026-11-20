// Round 430: Nephalia Academy (Ana's Chains of Mephistopheles makes you discard instead of drawing: click the card to
// reveal it and put it on top instead, or send it to the graveyard) and C.A.M.P. (tap the fortified Mountain for mana:
// its trigger's counter on your red creature, and a Junk token).
import { expect, test } from "@playwright/test";
import { defOf } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Nephalia Academy: Ana's Chains makes you discard Shock instead of drawing; put it on top, the draw takes it back", async ({ page }) => {
  const s = scene({ hand: ["Divination", "Shock"], board: [...LANDS, "Nephalia Academy"] }, [{ board: ["Chains of Mephistopheles"] }]);
  const shock = one(s, "Shock");
  await open(page, s);
  await card(page, "Divination", s).click();
  const first = await resolveUntil(page, (st) => st.pending?.kind === "handToTop" && st.pending.player === 0);
  expect(first.pending).toMatchObject({ discarding: [shock], revealing: "Nephalia Academy" });
  const bar = controls(page);
  await expect(bar).toContainText("Chains of Mephistopheles: you discard Shock. Click it to reveal and put on top of your library instead (Nephalia Academy).");
  await page.locator(`[data-obj="${shock}"]`).click();
  await bar.getByRole("button", { name: "Put 1 on top", exact: true }).click();
  // Chains' draw takes it back; the second draw asks again about it.
  const again = await resolveUntil(page, (st) => st.pending?.kind === "handToTop" && st.pending.player === 0 && st.log.some((l) => l.text.includes("reveals Shock and puts it on top of their library instead (Nephalia Academy)")));
  expect(again.objects[shock]!.zone).toBe("hand");
  await bar.getByRole("button", { name: "All to the graveyard", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0);
  expect(after.objects[shock]!.zone).toBe("graveyard");
  expect(after.players[0]!.hand).toHaveLength(1);
  expect(pageErrors(page)).toEqual([]);
});

test("C.A.M.P.: tap the fortified Mountain for {R}; Raging Goblin gets a +1/+1 counter and you create a Junk token", async ({ page }) => {
  const s = scene({ board: ["Island", "Mountain", "C.A.M.P.", "Raging Goblin"] });
  const [camp, mountain, goblin] = [one(s, "C.A.M.P."), idsOf(s, "Mountain", "battlefield", 0)[0]!, one(s, "Raging Goblin")];
  s.objects[camp]!.attachedTo = mountain;
  await open(page, s);
  await page.locator(`[data-obj="${mountain}"]`).first().click();
  const asked = await resolveUntil(page, (st) => st.stack.length > 0 || st.pending?.kind === "chooseTargets" || (st.objects[goblin]!.counters["+1/+1"] ?? 0) > 0);
  expect(asked.players[0]!.manaPool.R).toBe(1);
  // One creature you control: it's the target.
  if (asked.pending?.kind === "chooseTargets") await page.locator(`[data-obj="${goblin}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && (st.objects[goblin]!.counters["+1/+1"] ?? 0) === 1);
  expect(after.battlefield.filter((id) => after.objects[id]!.isToken && defOf(after, after.objects[id]!).name === "Junk Token")).toHaveLength(1);
  expect(pageErrors(page)).toEqual([]);
});
