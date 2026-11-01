// Round 228: cast-menu entries for alternative costs another permanent grants: Henzie "Toolbox" Torre's blitz (the
// spell's mana cost), Amazing Spider-Man's web-slinging {G}{W}{U} (with its pick of a tapped creature to return) and
// Ezio Auditore da Firenze's freerunning {B}{B}.
import { expect, test } from "@playwright/test";
import { characteristics, invalidateCharacteristics } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, menu, resolveUntil } from "./ui";

test("Henzie: a creature spell with mana value 4 or more has a Blitz button; it enters with haste", async ({ page }) => {
  const s = scene({ hand: ["Hill Giant"], board: [...LANDS, 'Henzie "Toolbox" Torre'] });
  const giant = one(s, "Hill Giant");
  await open(page, s);
  await card(page, "Hill Giant", s).click();
  await menu(page).getByRole("button", { name: /^Blitz/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "battlefield");
  // Cast for its blitz cost (CR 702.152a): it has haste and is sacrificed at the next end step.
  expect(characteristics(after, after.objects[giant]!).keywords).toContain("Haste");
  expect(pageErrors(page)).toEqual([]);
});

test("Amazing Spider-Man: a legendary colored spell has Web-slinging; it returns the tapped creature picked", async ({ page }) => {
  const s = scene({ hand: ["Isamaru, Hound of Konda"], board: [...LANDS, "Peter Parker // Amazing Spider-Man", "Grizzly Bears", "Hill Giant"] });
  const [isamaru, peter, bears, giant] = [one(s, "Isamaru, Hound of Konda"), one(s, "Peter Parker"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  s.objects[peter]!.face = 1; // transformed: Amazing Spider-Man
  s.objects[bears]!.tapped = true;
  invalidateCharacteristics(s);
  await open(page, s);
  await card(page, "Isamaru, Hound of Konda", s).click();
  await menu(page).getByRole("button", { name: /^Web-slinging/ }).click();
  const bar = page.locator(".targeting", { hasText: "tapped creature" });
  await expect(bar.getByRole("button", { name: "Return and cast" })).toBeDisabled();
  await page.locator(`[data-obj="${giant}"]`).click(); // untapped: not a choice
  await expect(bar.getByRole("button", { name: "Return and cast" })).toBeDisabled();
  await page.locator(`[data-obj="${bears}"]`).click();
  await bar.getByRole("button", { name: "Return and cast" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[isamaru]!.zone === "battlefield");
  expect(after.objects[bears]!.zone).toBe("hand");
  expect(after.objects[giant]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Ezio: after an Assassin dealt combat damage, an Assassin spell has a Freerunning button for {B}{B}", async ({ page }) => {
  const s = scene({ hand: ["Royal Assassin"], board: ["Swamp", "Swamp", "Swamp", "Ezio Auditore da Firenze"] });
  const assassin = one(s, "Royal Assassin");
  s.freerunningThisTurn = [0];
  await open(page, s);
  await card(page, "Royal Assassin", s).click();
  await menu(page).getByRole("button", { name: /^Freerunning/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[assassin]!.zone === "battlefield");
  // {B}{B} instead of {1}{B}{B}: one Swamp still untapped.
  expect(after.battlefield.filter((id) => after.objects[id]!.tapped)).toHaveLength(2);
  expect(pageErrors(page)).toEqual([]);
});
