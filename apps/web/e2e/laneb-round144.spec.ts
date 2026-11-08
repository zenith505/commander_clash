// Lane B round B144 in the browser: Cunning Giant attacks Ana unblocked, and you choose whether it assigns its combat
// damage to a creature Ana controls (her Hulking Goblin, which can't block) or to Ana as usual.
import { expect, test } from "@playwright/test";
import { one, open, pageErrors, scene } from "./scene";
import { attack, controls, passTo, resolveUntil } from "./ui";

test("Cunning Giant: unblocked, you click Ana's Hulking Goblin and it takes the combat damage instead of Ana", async ({ page }) => {
  const s = scene({ board: ["Cunning Giant"] }, [{ board: ["Hulking Goblin"] }, { board: ["Grizzly Bears"] }]);
  const [giant, goblin, bears] = [one(s, "Cunning Giant"), one(s, "Hulking Goblin"), one(s, "Grizzly Bears")];
  const life = s.players[1]!.life;
  await open(page, s);
  await passTo(page, "declareAttackers");
  await attack(page, [[giant, 1]]);
  const st = await resolveUntil(page, (x) => x.pending?.kind === "pickPermanents" && x.pending.player === 0);
  // Only Ana's creatures are offered, not Ben's.
  expect(st.pending?.kind === "pickPermanents" && st.pending.action === "damageCreature" ? st.pending.options : []).toEqual([goblin]);
  const bar = controls(page);
  await expect(bar).toContainText("Cunning Giant is unblocked");
  await expect(bar.getByRole("button", { name: "Damage the player" })).toBeVisible();
  await page.locator(`[data-obj="${goblin}"]`).click();
  await bar.getByRole("button", { name: "Damage that creature" }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && x.objects[goblin]!.zone === "graveyard");
  expect(after.players[1]!.life).toBe(life);
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Cunning Giant: Damage the player assigns its combat damage to Ana as usual", async ({ page }) => {
  const s = scene({ board: ["Cunning Giant"] }, [{ board: ["Hulking Goblin"] }]);
  const [giant, goblin] = [one(s, "Cunning Giant"), one(s, "Hulking Goblin")];
  const life = s.players[1]!.life;
  await open(page, s);
  await passTo(page, "declareAttackers");
  await attack(page, [[giant, 1]]);
  await resolveUntil(page, (x) => x.pending?.kind === "pickPermanents" && x.pending.player === 0);
  await controls(page).getByRole("button", { name: "Damage the player" }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && x.players[1]!.life === life - 4);
  expect(after.objects[goblin]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
