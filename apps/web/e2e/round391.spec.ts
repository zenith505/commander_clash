// Round 391 in the browser: Ghastly Conscription aimed at Ana, manifesting the creature cards of her graveyard under
// your control; Expose the Culprit's second mode, picking which of your face-up disguise creatures to cloak; Become
// Anonymous on your Grizzly Bears; and Rowan Kenrith's +2 aimed at Ana.
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, controls, menu, resolveUntil } from "./ui";

test("Ghastly Conscription: you target Ana; her two creature cards are manifested under your control, her instant stays", async ({ page }) => {
  const s = scene({ hand: ["Ghastly Conscription"], board: LANDS }, [{ yard: ["Grizzly Bears", "Craw Wurm", "Lightning Bolt"] }]);
  const [bears, wurm, bolt] = [one(s, "Grizzly Bears"), one(s, "Craw Wurm"), one(s, "Lightning Bolt")];
  await open(page, s);
  await card(page, "Ghastly Conscription", s).click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /^Cast it/ }).first().click();
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[wurm]!.zone === "battlefield");
  for (const id of [bears, wurm]) {
    const o = after.objects[id]!;
    expect([o.zone, o.faceDown, o.controller, o.owner]).toEqual(["battlefield", "manifest", 0, 1]);
  }
  expect(after.objects[bolt]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Expose the Culprit, second mode: you pick one of your two face-up Alley Assailants; only it is cloaked", async ({ page }) => {
  const s = scene({ hand: ["Expose the Culprit"], board: [...LANDS, "Alley Assailant", "Alley Assailant", "Grizzly Bears"] });
  const [a1, a2] = idsOf(s, "Alley Assailant", "battlefield", 0);
  await open(page, s);
  await card(page, "Expose the Culprit", s).click();
  // Its modes are chosen as it's cast (CR 601.2b); the first has no target here.
  const modes = page.locator(".mode-menu");
  await expect(modes.getByRole("button", { name: "Turn target face-down creature face up." })).toBeDisabled();
  await modes.getByRole("button", { name: /Exile any number of face-up creatures you control with disguise/ }).click();
  await modes.getByRole("button", { name: "Done" }).click();
  const ask = await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  expect(ask.pending?.kind === "pickPermanents" && [...ask.pending.options].sort()).toEqual([a1!, a2!].sort());
  const bar = controls(page);
  await expect(bar).toContainText("choose any number of face-up creatures you control with disguise");
  await page.locator(`[data-obj="${a2}"]`).first().click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[a2!]!.faceDown === "cloak");
  expect(after.objects[a1!]!.faceDown).toBeUndefined();
  expect(after.objects[one(s, "Grizzly Bears")]!.faceDown).toBeUndefined();
  expect(pageErrors(page)).toEqual([]);
});

test("Become Anonymous on your Grizzly Bears: it and your top two cards are cloaked, tapped", async ({ page }) => {
  const s = scene({ hand: ["Become Anonymous"], board: [...LANDS, "Grizzly Bears"], library: ["Craw Wurm", "Lightning Bolt"] });
  const [bears, wurm, bolt] = [one(s, "Grizzly Bears"), one(s, "Craw Wurm"), one(s, "Lightning Bolt")];
  await open(page, s);
  await card(page, "Become Anonymous", s).click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /^Cast it/ }).first().click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[bears]!.faceDown === "cloak");
  for (const id of [bears, wurm, bolt]) {
    const o = after.objects[id]!;
    expect([o.zone, o.faceDown, o.controller, o.tapped]).toEqual(["battlefield", "cloak", 0, true]);
  }
  expect(pageErrors(page)).toEqual([]);
});

test("Rowan Kenrith's +2 aimed at Ana: during her next turn each creature she controls attacks if able", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Rowan Kenrith"] }, [{ board: ["Grizzly Bears"] }]);
  const rowan = one(s, "Rowan Kenrith");
  s.objects[rowan]!.counters = { loyalty: 4 };
  await open(page, s);
  await page.locator(`[data-obj="${rowan}"]`).first().click();
  await menu(page).locator("button", { hasText: "During target player's next turn, each creature that player controls attacks if able" }).click();
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && !!st.attackPlayerNextTurn?.length);
  expect(after.attackPlayerNextTurn).toEqual([{ player: 1, attack: 0, since: after.turn, anyone: true }]);
  expect(after.objects[rowan]!.counters.loyalty).toBe(6);
  expect(pageErrors(page)).toEqual([]);
});
