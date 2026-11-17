// Lane B round B238 in the browser: Captured by the Consulate turning your Lightning Bolt at Ana onto your own creature;
// Piracy letting your payment tap Ana's Forests for your creature spell; Infernal Denizen's upkeep with no Swamps, where
// you choose the opponent who may take a creature of yours, and where Ana's asks you which of hers to take.
import { expect, test } from "@playwright/test";
import { applyAction, controllerOf } from "@cc/engine";
import { idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, clickPlayer, controls, resolveUntil } from "./ui";

test("Captured by the Consulate: Ana's Aura on your Grizzly Bears turns your Lightning Bolt at Ana onto the Bears", async ({ page }) => {
  const s = scene({ hand: ["Lightning Bolt"], board: ["Mountain", "Grizzly Bears"] }, [{ board: ["Captured by the Consulate"] }]);
  const [bears, aura, bolt] = [one(s, "Grizzly Bears"), one(s, "Captured by the Consulate"), one(s, "Lightning Bolt")];
  s.objects[aura]!.attachedTo = bears;
  const life = s.players[1]!.life;
  await open(page, s);
  await card(page, "Lightning Bolt", s).click();
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[bolt]!.zone === "graveyard");
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(after.players[1]!.life).toBe(life);
  expect(after.log.some((l) => l.text.startsWith("Captured by the Consulate changes the target of Lightning Bolt"))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Piracy: after it resolves, your Grizzly Bears is paid for by tapping Ana's Forests", async ({ page }) => {
  const s = scene({ hand: ["Piracy", "Grizzly Bears"], board: ["Island", "Island"] }, [{ board: ["Forest", "Mountain"] }]);
  const [piracy, bears, forest, mountain] = [one(s, "Piracy"), one(s, "Grizzly Bears"), idsOf(s, "Forest", "battlefield", 1)[0]!, idsOf(s, "Mountain", "battlefield", 1)[0]!];
  await open(page, s);
  await card(page, "Piracy", s).click();
  await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[piracy]!.zone === "graveyard");
  // Your Islands are tapped; Ana's Forest and Mountain pay {1}{G}.
  await card(page, "Grizzly Bears", s).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[bears]!.zone === "battlefield");
  expect(controllerOf(after, after.objects[bears]!)).toBe(0);
  expect(after.objects[forest]!.tapped).toBe(true);
  expect(after.objects[mountain]!.tapped).toBe(true);
  expect(controllerOf(after, after.objects[forest]!)).toBe(1);
  expect(after.log.some((l) => l.text === "You taps Ana's Forest for {G}, to spend only on spells.")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Infernal Denizen: no Swamps at your upkeep, so it's tapped and you choose Ben, who takes a creature of yours", async ({ page }) => {
  let s = scene({ board: ["Infernal Denizen", "Grizzly Bears"] }, []);
  const [denizen, bears] = [one(s, "Infernal Denizen"), one(s, "Grizzly Bears")];
  s = playUntil(s, (st) => st.pending?.kind === "chooseOption" && st.pending.player === 0);
  expect(s.step).toBe("upkeep");
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Infernal Denizen: choose an opponent");
  for (const name of ["Ana", "Ben", "Cy"]) await expect(bar.getByRole("button", { name, exact: true })).toBeVisible();
  await bar.getByRole("button", { name: "Ben", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.step === "upkeep" && [denizen, bears].some((id) => controllerOf(st, st.objects[id]!) === 2));
  expect(after.objects[denizen]!.tapped).toBe(true);
  expect(after.log.some((l) => l.text === "You chooses Ben for Infernal Denizen.")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Infernal Denizen: Ana has no Swamps and chooses you; you take her Grizzly Bears for as long as the Denizen stays", async ({ page }) => {
  let s = scene({}, [{ board: ["Infernal Denizen", "Grizzly Bears"] }]);
  const [denizen, bears] = [one(s, "Infernal Denizen"), one(s, "Grizzly Bears")];
  s = playUntil(s, (st) => st.pending?.kind === "chooseOption" && st.pending.player === 1 && st.pending.what === "opponent");
  s = applyAction(s, { type: "chooseOption", player: 1, choice: "0" });
  s = playUntil(s, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("you may choose one of the creatures of Infernal Denizen's controller and gain control of it for as long as Infernal Denizen remains on the battlefield");
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && controllerOf(st, st.objects[bears]!) === 0);
  expect(controllerOf(after, after.objects[denizen]!)).toBe(1);
  expect(after.objects[denizen]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

