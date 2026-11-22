// Lane B round B292 in the browser: Balduvian Shaman (Cold Snap isn't a target, it has cumulative upkeep; Absolute Law's
// "red" becomes "black" and it gains cumulative upkeep {1}) and Guardian Beast (Ana's Sol Ring stays hers through Hijack;
// Animate Artifact can't enter attached to it).
import { expect, test } from "@playwright/test";
import { characteristics, controllerOf } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

test("Balduvian Shaman: Absolute Law (not Cold Snap), red becomes black, and it gains cumulative upkeep {1}", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Balduvian Shaman", "Absolute Law", "Cold Snap"] }, [{ board: ["Grizzly Bears"] }]);
  const [shaman, law, snap, bears] = [one(s, "Balduvian Shaman"), one(s, "Absolute Law"), one(s, "Cold Snap"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Balduvian Shaman", s).click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /Change the text/ }).click();
  await expect(page.locator(`[data-obj="${law}"]`).first()).toHaveClass(/targetable/);
  await expect(page.locator(`[data-obj="${snap}"]`).first()).not.toHaveClass(/targetable/);
  await page.locator(`[data-obj="${law}"]`).first().click();
  await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "textFrom" && x.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("replace all instances of which color word in Absolute Law's text?");
  await bar.getByRole("button", { name: "Red", exact: true }).click();
  await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "textTo" && x.pending.player === 0);
  await bar.getByRole("button", { name: "Black", exact: true }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && !!x.objects[shaman]!.tapped);
  expect(characteristics(after, after.objects[bears]!).keywords).toContain("Protection from black");
  expect(characteristics(after, after.objects[law]!).grantedAbilities).toEqual(["Cumulative upkeep {1}."]);
  expect(after.log.some((l) => /changes the text of Absolute Law: red becomes black/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Guardian Beast: Hijack doesn't take Ana's Sol Ring, and Animate Artifact can't enchant it", async ({ page }) => {
  const s = scene({ hand: ["Hijack", "Animate Artifact"], board: LANDS }, [{ board: ["Guardian Beast", "Sol Ring"] }]);
  const ring = one(s, "Sol Ring");
  const [hijack, animate] = [idsOf(s, "Hijack", "hand", 0)[0]!, idsOf(s, "Animate Artifact", "hand", 0)[0]!];
  await open(page, s);
  await card(page, "Hijack", s).click();
  const cast = menu(page).getByRole("button", { name: /^Cast it/ });
  if (await cast.count()) await cast.click();
  await page.locator(`[data-obj="${ring}"]`).first().click();
  const mid = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending && x.objects[hijack]!.zone === "graveyard");
  expect(controllerOf(mid, mid.objects[ring]!)).toBe(1);
  expect(mid.log.some((l) => /can't gain control of Sol Ring \(Guardian Beast\)/.test(l.text))).toBe(true);
  await card(page, "Animate Artifact", s).click();
  const cast2 = menu(page).getByRole("button", { name: /^Cast it/ });
  if (await cast2.count()) await cast2.click();
  await page.locator(`[data-obj="${ring}"]`).first().click();
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending && x.objects[animate]!.zone === "graveyard");
  expect(characteristics(after, after.objects[ring]!).types).not.toContain("Creature");
  expect(pageErrors(page)).toEqual([]);
});
