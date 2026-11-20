// Lane B round B276 in the browser: Secret Invasion (cast it on your Grizzly Bears and exile Ana's Serra Angel with its
// enters trigger: the Bears becomes a copy of the Angel until the Aura leaves, as its Copy chip says) and Runesword
// (activate it on your attacking Grizzly Bears, which a Drudge Skeletons blocks: the Skeletons can't regenerate and is
// exiled instead of dying).
import { expect, test } from "@playwright/test";
import { applyAction, characteristics, waitingOn } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, menu, resolveUntil } from "./ui";

test("Secret Invasion: exile Ana's Serra Angel; your Grizzly Bears is a copy of it until the Aura leaves", async ({ page }) => {
  const s = scene({ hand: ["Secret Invasion"], board: [...LANDS, "Grizzly Bears"] }, [{ board: ["Serra Angel"] }]);
  const [aura, bears, angel] = [one(s, "Secret Invasion"), one(s, "Grizzly Bears"), one(s, "Serra Angel")];
  await open(page, s);
  await card(page, "Secret Invasion", s).click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /^Cast/ }).first().click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  // Its enters trigger asks for up to one target creature other than the enchanted one.
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0 && st.objects[aura]!.zone === "battlefield");
  await page.locator(`[data-obj="${angel}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[angel]!.zone === "exile");
  expect(characteristics(after, after.objects[bears]!).name).toBe("Serra Angel");
  expect(after.objects[aura]!.attachedTo).toBe(bears);
  const chip = page.locator(`[data-obj="${bears}"] .chip`, { hasText: /^Copy$/ });
  await expect(chip).toHaveAttribute("title", "Grizzly Bears, a copy of Serra Angel until Secret Invasion leaves the battlefield.");
  expect(pageErrors(page)).toEqual([]);
});

test("Runesword: your attacking Grizzly Bears gets +2/+0; the blocking Drudge Skeletons can't regenerate and is exiled", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Runesword", "Grizzly Bears"] }, [{ board: ["Drudge Skeletons", "Swamp"] }]);
  const [sword, bears, skel] = [one(s0, "Runesword"), one(s0, "Grizzly Bears"), one(s0, "Drudge Skeletons")];
  let s = playUntil(s0, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  s = applyAction(s, { type: "declareAttackers", player: 0, attacks: [{ attacker: bears, defender: 1 }] });
  s = playUntil(s, (st) => st.pending?.kind === "declareBlockers" && st.pending.player === 1);
  s = applyAction(s, { type: "declareBlockers", player: 1, blocks: [{ blocker: skel, attacker: bears }] });
  s = playUntil(s, (st) => st.step === "declareBlockers" && !st.pending && st.stack.length === 0 && waitingOn(st) === 0);
  await open(page, s);
  await page.locator(`[data-obj="${sword}"]`).first().click();
  await menu(page).getByRole("button", { name: /Target attacking creature gets \+2\/\+0/ }).click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.objects[skel]!.zone !== "battlefield");
  expect(after.objects[skel]!.zone).toBe("exile");
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(after.objects[sword]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
