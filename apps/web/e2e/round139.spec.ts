// Round 139: Baldin's "up to one hundred target creatures" offers each creature as an "up to" target, and Indulgent
// Tormentor's opponent picks a sacrifice, 3 life, or the draw.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { attack, controls, resolveUntil } from "./ui";

test("Baldin, Century Herdmaster: its attack trigger takes any number of creatures, each getting +0/+X (X cards in hand)", async ({ page }) => {
  const s = scene({ hand: ["Shock", "Lightning Bolt"], board: [...LANDS, "Baldin, Century Herdmaster", "Grizzly Bears", "Hill Giant"] }, [{ board: ["Llanowar Elves"] }]);
  const [baldin, bears, giant, elves] = [one(s, "Baldin, Century Herdmaster"), one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Llanowar Elves")];
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  await attack(page, [[baldin, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  const bar = page.locator(".targeting");
  await expect(bar).toContainText("(optional, up to 4 more)");
  await page.locator(`[data-obj="${bears}"]`).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  await bar.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.effects.some((e) => e.affected.includes(bears)));
  const plus = (id: string) => after.effects.filter((e) => e.affected.includes(id)).flatMap((e) => e.mods).filter((m) => m.kind === "modifyPT");
  expect(plus(bears)).toEqual([{ kind: "modifyPT", power: 0, toughness: 2 }]);
  expect(plus(giant)).toEqual([{ kind: "modifyPT", power: 0, toughness: 2 }]);
  expect(plus(elves)).toEqual([]);
  expect(plus(baldin)).toEqual([]);
  expect(pageErrors(page)).toEqual([]);
});

test("Indulgent Tormentor: at Ana's upkeep you choose to sacrifice a creature, pay 3 life, or let her draw", async ({ page }) => {
  // The other opponents have hexproof (Leyline of Sanctity), so Ana's Tormentor targets you.
  const s = scene({ board: ["Grizzly Bears"] }, [{ board: ["Indulgent Tormentor"] }, { board: ["Leyline of Sanctity"] }, { board: ["Leyline of Sanctity"] }], { step: "end" });
  const bears = one(s, "Grizzly Bears");
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "punisher" && st.pending.player === 0, 200);
  const bar = controls(page);
  await expect(bar).toContainText("sacrifice a creature or pay 3 life, or");
  await expect(bar.getByRole("button", { name: "Sacrifice a creature" })).toHaveCount(1);
  await bar.getByRole("button", { name: "Pay 3 life" }).click();
  // Then the payment itself (CR 119.4).
  await resolveUntil(page, (st) => st.pending?.kind === "payUnless" && st.pending.player === 0);
  await expect(bar).toContainText("pay 3 life or Ana draws a card");
  await bar.getByRole("button", { name: "Pay", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[0]!.life === 37, 200);
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
