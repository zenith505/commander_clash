// Round 220: Sensational Spider-Man's "remove up to three stun counters from among all permanents" (the distribute
// picker's remove mode, each permanent capped at the counters it has), and Vannifar, Evolved Enigma's "cloak a card
// from your hand" (the hand picker, cloaking).
import { expect, test } from "@playwright/test";
import { characteristics, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { attack, controls, modal, resolveUntil } from "./ui";

test("Sensational Spider-Man: stun the target, then remove up to three stun counters from among all permanents and draw that many", async ({ page }) => {
  const s: GameState = scene({ board: ["Sensational Spider-Man"] }, [{ board: ["Grizzly Bears", "Hill Giant"] }]);
  const [spidey, bears, giant] = [one(s, "Sensational Spider-Man"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  s.objects[giant]!.counters.stun = 2;
  const hand = s.players[0]!.hand.length;
  await open(page, playUntil(s, (st) => st.pending?.kind === "declareAttackers"));
  await attack(page, [[spidey, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets");
  await page.locator(`[data-obj="${bears}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "distribute");
  const bar = controls(page);
  await expect(bar).toContainText("Sensational Spider-Man: remove up to 3 stun counters from among");
  await expect(bar).toContainText("(3 left)");
  // The Bears has the one just put on it, the Giant two: no more than that from each.
  const plusGiant = page.locator(`[data-distribute="${giant}"]`).getByRole("button", { name: "+" });
  await plusGiant.click();
  await plusGiant.click();
  await expect(plusGiant).toBeDisabled();
  // Fewer than three is fine.
  await expect(bar).toContainText("(1 left)");
  await bar.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.triggerQueue.length === 0);
  expect(after.objects[giant]!.counters.stun ?? 0).toBe(0);
  expect(after.objects[bears]!.counters.stun).toBe(1);
  expect(after.objects[bears]!.tapped).toBe(true);
  expect(after.players[0]!.hand.length).toBe(hand + 2);
  expect(pageErrors(page)).toEqual([]);
});

test("Vannifar, Evolved Enigma: at the beginning of combat, cloak the card you pick from your hand", async ({ page }) => {
  const s: GameState = scene({ hand: ["Hill Giant", "Lightning Bolt"], board: [...LANDS, "Vannifar, Evolved Enigma"] });
  const [giant, bolt] = [one(s, "Hill Giant"), one(s, "Lightning Bolt")];
  await open(page, playUntil(s, (st) => st.pending?.kind === "chooseModes" && st.pending.player === 0));
  const modes = page.locator(".mode-menu");
  await modes.getByRole("button", { name: /Cloak a card from your hand/ }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const picker = modal(page);
  await expect(picker).toContainText("Vannifar, Evolved Enigma: cloak a card from your hand (each a face-down 2/2 creature with ward {2})");
  await picker.locator(".card", { hasText: "Hill Giant" }).click();
  await picker.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.objects[giant]!.zone === "battlefield" && st.stack.length === 0);
  expect(after.objects[giant]!.faceDown).toBe("cloak");
  expect(characteristics(after, after.objects[giant]!).keywords.some((k) => /^Ward/.test(k))).toBe(true);
  expect(after.objects[bolt]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});
