// Lane B round B163 in the browser: Words of War's ability targets as it's activated, and with two of its shields the
// draw prompt names each one's target; Sol'Kanar the Tainted's last mode asks which opponent gets it.
import { expect, test } from "@playwright/test";
import { controllerOf } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, clickPlayer, controls, menu, resolveUntil } from "./ui";

test("Words of War: target Grizzly Bears, then Divination's first draw kills it instead and the second is drawn", async ({ page }) => {
  const s = scene({ hand: ["Divination"], board: [...LANDS, "Words of War"] }, [{ board: ["Grizzly Bears"] }]);
  const [words, bears] = [one(s, "Words of War"), one(s, "Grizzly Bears")];
  await open(page, s);
  await page.locator(`[data-obj="${words}"]`).first().click();
  if (await menu(page).count()) await menu(page).locator("button", { hasText: "The next time you would draw" }).click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  const armed = await resolveUntil(page, (st) => st.stack.length === 0 && !!st.players[0]!.nextDrawInstead?.length);
  expect(armed.players[0]!.nextDrawInstead![0]!.damage).toMatchObject({ n: 2, to: { object: bears } });
  const hand = armed.players[0]!.hand.length;
  await card(page, "Divination", s).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "graveyard");
  // Divination left the hand, and one of its two draws was a card.
  expect(after.players[0]!.hand.length).toBe(hand);
  expect(after.players[0]!.nextDrawInstead).toBeUndefined();
  expect(pageErrors(page)).toEqual([]);
});

test("two Words of War shields: the draw prompt names each target, and the one you pick is used", async ({ page }) => {
  const s = scene({ hand: ["Divination"], board: [...LANDS, "Words of War"] }, [{ board: ["Grizzly Bears"] }]);
  const [words, bears] = [one(s, "Words of War"), one(s, "Grizzly Bears")];
  s.players[0]!.nextDrawInstead = [
    { turn: s.turn, source: "Words of War", sourceId: words, sourceZc: 0, damage: { n: 2, to: { object: bears, zc: s.objects[bears]!.zoneChanges ?? 0 } } },
    { turn: s.turn, source: "Words of War", sourceId: words, sourceZc: 0, damage: { n: 2, to: { player: 2 } } },
  ];
  await open(page, s);
  await card(page, "Divination", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "drawInstead" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar.getByRole("button", { name: "Deal 2 damage to Grizzly Bears (Words of War)" })).toHaveCount(1);
  await bar.getByRole("button", { name: "Deal 2 damage to Ben (Words of War)" }).click();
  // The second draw: the other shield is the only replacement left, so it applies.
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[0]!.nextDrawInstead === undefined);
  expect(after.players[2]!.life).toBe(38);
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Sol'Kanar the Tainted: choose its last mode at your end step, then choose Cy to get it", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Sol'Kanar the Tainted"] }, [], { step: "main2" });
  const sol = one(s, "Sol'Kanar the Tainted");
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseModes" && st.pending.player === 0, 60);
  const modes = page.locator(".mode-menu");
  await modes.getByRole("button", { name: /Exile Sol'Kanar the Tainted, then return it/ }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "opponent" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar.getByRole("button", { name: "You", exact: true })).toHaveCount(0);
  await bar.getByRole("button", { name: "Cy", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.objects[sol]!.zone === "battlefield" && controllerOf(st, st.objects[sol]!) === 3);
  expect(after.objects[sol]!.owner).toBe(0);
  expect((await state(page)).players[0]!.lost).toBeFalsy();
  expect(pageErrors(page)).toEqual([]);
});
