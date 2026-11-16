// Lane B round B236 in the browser: Primitive Justice's two additional costs, each counted on its own, then one more target
// artifact for each time either was paid; Enduring Renewal's reveal offered beside dredge for your draw; an opponent's Mana
// Cache paying for your spell.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, playUntil, scene, state } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Primitive Justice: pay {1}{R} once and {1}{G} once more, three artifacts destroyed and 1 life", async ({ page }) => {
  const s = scene({ hand: ["Primitive Justice"], board: LANDS }, [{ board: ["Sol Ring", "Mind Stone", "Ornithopter"] }]);
  const arts = [one(s, "Sol Ring"), one(s, "Mind Stone"), one(s, "Ornithopter")];
  const life = s.players[0]!.life;
  await open(page, s);
  await card(page, "Primitive Justice", s).click();
  const bar = page.locator(".targeting", { hasText: "how many times to pay each additional cost?" });
  await bar.getByRole("button", { name: "Pay {1}{R} one more time" }).click();
  await bar.getByRole("button", { name: "Pay {1}{G} one more time" }).click();
  await bar.getByRole("button", { name: "Pay 2 times" }).click();
  for (const a of arts) await page.locator(`[data-obj="${a}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[one(s, "Primitive Justice")]!.zone === "graveyard");
  for (const a of arts) expect(after.objects[a]!.zone).toBe("graveyard");
  expect(after.players[0]!.life).toBe(life + 1);
  expect(after.log.some((l) => l.text.startsWith("You casts Primitive Justice, paying the additional {1}{R} once and {1}{G} once targeting"))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Enduring Renewal: your draw can be its reveal or a dredge; the creature card revealed goes into your graveyard", async ({ page }) => {
  let s = scene({ board: ["Enduring Renewal"], yard: ["Golgari Thug"], library: ["Grizzly Bears", "Lightning Bolt"] }, [], { step: "upkeep" });
  const [thug, bears, bolt] = [one(s, "Golgari Thug"), one(s, "Grizzly Bears"), one(s, "Lightning Bolt")];
  s = playUntil(s, (st) => st.pending?.kind === "drawInstead" && st.pending.player === 0);
  expect(s.step).toBe("draw");
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Replace this draw");
  await expect(bar.getByRole("button", { name: "Dredge Golgari Thug: mill 4 and return it to your hand", exact: true })).toBeVisible();
  await bar.getByRole("button", { name: "Reveal the top card of your library instead: a creature card goes into your graveyard, any other card is drawn (Enduring Renewal)", exact: true }).click();
  let after = s;
  await expect.poll(async () => (after = await state(page)).objects[bears]!.zone).toBe("graveyard");
  // The draw is replaced: no card drawn, the Bolt still on top, the Thug still in the graveyard.
  expect(after.players[0]!.hand).toEqual([]);
  expect(after.players[0]!.library[0]).toBe(bolt);
  expect(after.objects[thug]!.zone).toBe("graveyard");
  expect(after.log.some((l) => l.text.startsWith("You reveals Grizzly Bears from the top of their library instead of drawing and puts it into their graveyard (Enduring Renewal)."))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Mana Cache: on your turn, your payment can remove counters from an opponent's Mana Cache for {C}", async ({ page }) => {
  const s = scene({ hand: ["Mind Stone"] }, [{ board: ["Mana Cache"] }]);
  const cache = one(s, "Mana Cache");
  s.objects[cache]!.counters.charge = 3;
  const stone = one(s, "Mind Stone");
  await open(page, s);
  // No lands of your own: the Cache's {C}{C} pays for it, two counters removed by you.
  await card(page, "Mind Stone", s).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[stone]!.zone === "battlefield");
  expect(after.objects[cache]!.counters.charge).toBe(1);
  expect(after.objects[cache]!.controller).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});
