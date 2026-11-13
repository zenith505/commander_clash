// Lane B round B187 in the browser: Graceful Takedown's two groups of targets ("Choose none" for "up to one other target
// creature you control" leaves the enchanted creatures still to choose, CR 601.2c), and Chong and Lily, Nomads' attack
// trigger (choose the lore counter mode, then any number of target Sagas you control).
import { expect, test } from "@playwright/test";
import { applyAction, invalidateCharacteristics, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, resolveUntil } from "./ui";

test("Graceful Takedown: no other creature, then only the enchanted Grizzly Bears (Done) and Ana's Hill Giant; the Bears deal 3 and it dies", async ({ page }) => {
  const s: GameState = scene({ hand: ["Graceful Takedown"], board: [...LANDS, "Grizzly Bears", "Llanowar Elves", "Serra Angel", "Holy Strength", "Holy Strength"] }, [{ board: ["Hill Giant"] }]);
  const [bears, elves, angel, giant, spell] = [one(s, "Grizzly Bears"), one(s, "Llanowar Elves"), one(s, "Serra Angel"), one(s, "Hill Giant"), one(s, "Graceful Takedown")];
  const [auraA, auraB] = idsOf(s, "Holy Strength", "battlefield", 0);
  s.objects[auraA!]!.attachedTo = bears;
  s.objects[auraB!]!.attachedTo = elves;
  invalidateCharacteristics(s);
  await open(page, s);
  await card(page, "Graceful Takedown", s).click();
  const bar = page.locator(".targeting");
  await expect(bar).toContainText("target creature you control (optional, up to 1 more)");
  await bar.getByRole("button", { name: "Choose none" }).click();
  // The enchanted ones are still to choose: the Angel isn't enchanted.
  await expect(bar).toContainText("target enchanted creature you control (optional");
  await page.locator(`[data-obj="${angel}"]`).first().click();
  await expect(bar).toContainText("target enchanted creature you control (optional");
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await bar.getByRole("button", { name: "Done" }).click();
  await expect(bar).toContainText("target creature you don't control");
  await page.locator(`[data-obj="${giant}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[spell]!.zone === "graveyard");
  // 3 damage from the 3/4 Bears alone: the 3/3 Hill Giant dies.
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(after.log.some((l) => /Grizzly Bears deals 3 damage to Hill Giant/.test(l.text))).toBe(true);
  expect(after.objects[angel]!.damage).toBe(0);
  expect(after.objects[elves]!.damage).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Chong and Lily: attacking, you choose the lore counter mode and your Saga; History of Benalia makes a Knight", async ({ page }) => {
  let s: GameState = scene({ board: ["Chong and Lily, Nomads", "History of Benalia"] });
  const [chong, saga] = [one(s, "Chong and Lily, Nomads"), one(s, "History of Benalia")];
  s.objects[saga]!.counters.lore = 1;
  // In the engine: on to your declare attackers step, Chong and Lily attacking Ana, its trigger asking for a mode.
  s = playUntil(s, (st) => st.step === "declareAttackers" && st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  s = applyAction(s, { type: "declareAttackers", player: 0, attacks: [{ attacker: chong, defender: 1 }] });
  s = playUntil(s, (st) => st.pending?.kind === "chooseModes" && st.pending.player === 0);
  await open(page, s);
  const modes = page.locator(".mode-menu");
  await modes.getByRole("button", { name: /Put a lore counter on each of any number of target Sagas/ }).click();
  const bar = page.locator(".targeting");
  await expect(bar).toContainText(/target saga you control \(optional/i);
  // Your only Saga: the one it can target, so that's all the targets there are.
  await page.locator(`[data-obj="${saga}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && (st.objects[saga]!.counters.lore ?? 0) === 2 && st.battlefield.some((id) => st.objects[id]!.isToken && st.objects[id]!.controller === 0));
  expect(after.objects[saga]!.counters.lore).toBe(2);
  expect(pageErrors(page)).toEqual([]);
});
