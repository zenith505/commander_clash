// Lane B round B241 in the browser: Frantic Scapegoat's choice of a creature to pass its suspicion to (and declining it),
// Lucius the Eternal's dies trigger aimed at Ana's creature and its return when that creature leaves, and Risky Move's
// choice of your creature and an opponent when you gain control of it at your upkeep.
import { expect, test } from "@playwright/test";
import { controllerOf } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Frantic Scapegoat: Grizzly Bears enters and you pass the suspicion to it", async ({ page }) => {
  const s = scene({ hand: ["Grizzly Bears"], board: [...LANDS, "Frantic Scapegoat"] });
  const [goat, bears] = [one(s, "Frantic Scapegoat"), one(s, "Grizzly Bears")];
  s.objects[goat]!.suspected = s.nextTimestamp++;
  await open(page, s);
  await card(page, "Grizzly Bears", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("you may suspect one of the other creatures that entered (then Frantic Scapegoat is no longer suspected)");
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[bears]!.suspected !== undefined);
  expect(after.objects[goat]!.suspected).toBeUndefined();
  expect(after.log.some((l) => l.text === "Frantic Scapegoat suspects Grizzly Bears.")).toBe(true);
  expect(after.log.some((l) => l.text === "Frantic Scapegoat is no longer suspected.")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Frantic Scapegoat: choosing none keeps it suspected", async ({ page }) => {
  const s = scene({ hand: ["Grizzly Bears"], board: [...LANDS, "Frantic Scapegoat"] });
  const [goat, bears] = [one(s, "Frantic Scapegoat"), one(s, "Grizzly Bears")];
  s.objects[goat]!.suspected = s.nextTimestamp++;
  await open(page, s);
  await card(page, "Grizzly Bears", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  await controls(page).getByRole("button", { name: "Choose none", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[bears]!.zone === "battlefield");
  expect(after.objects[goat]!.suspected).toBeDefined();
  expect(after.objects[bears]!.suspected).toBeUndefined();
  expect(pageErrors(page)).toEqual([]);
});

test("Lucius the Eternal: it dies, is exiled aiming at Ana's Grizzly Bears, and returns when you bounce the Bears", async ({ page }) => {
  const s = scene({ hand: ["Murder", "Unsummon"], board: [...LANDS, "Lucius the Eternal"] }, [{ board: ["Grizzly Bears", "Hill Giant"] }]);
  const [luc, murder, unsummon] = [one(s, "Lucius the Eternal"), one(s, "Murder"), one(s, "Unsummon")];
  const [bears, giant] = [idsOf(s, "Grizzly Bears", "battlefield", 1)[0]!, one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Murder", s).click();
  await page.locator(`[data-obj="${luc}"]`).first().click();
  // Lucius's dies trigger: choose its target among Ana's creatures.
  let mid = await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  expect(mid.objects[luc]!.zone).toBe("graveyard");
  await page.locator(`[data-obj="${bears}"]`).first().click();
  mid = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[luc]!.zone === "exile");
  expect(mid.objects[murder]!.zone).toBe("graveyard");
  expect(mid.log.some((l) => l.text.startsWith("Lucius the Eternal returns from exile when Grizzly Bears leaves the battlefield"))).toBe(true);
  // Return the Bears to Ana's hand: Lucius comes back under your control; the Hill Giant changes nothing.
  await card(page, "Unsummon", s).click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[unsummon]!.zone === "graveyard" && st.objects[luc]!.zone === "battlefield");
  expect(after.objects[bears]!.zone).toBe("hand");
  expect(after.objects[giant]!.zone).toBe("battlefield");
  expect(controllerOf(after, after.objects[luc]!)).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Risky Move: you gain control of it at your upkeep, choose your Grizzly Bears and Ben, and flip a coin", async ({ page }) => {
  let s = scene({ board: ["Grizzly Bears", "Hill Giant"] }, [{}, {}, { board: ["Risky Move"] }]);
  const [move, bears, giant] = [one(s, "Risky Move"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  s = playUntil(s, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  expect(s.step).toBe("upkeep");
  expect(s.activePlayer).toBe(0);
  expect(controllerOf(s, s.objects[move]!)).toBe(0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("choose a creature you control (if you lose Risky Move's coin flip, the opponent you choose next gains control of it)");
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.player === 0);
  for (const name of ["Ana", "Ben", "Cy"]) await expect(bar.getByRole("button", { name, exact: true })).toBeVisible();
  await bar.getByRole("button", { name: "Ben", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.log.some((l) => /(wins|loses) the flip/.test(l.text)));
  const lost = after.log.some((l) => l.text.startsWith("You flips a coin for Risky Move and loses the flip"));
  expect(controllerOf(after, after.objects[bears]!)).toBe(lost ? 2 : 0);
  expect(controllerOf(after, after.objects[giant]!)).toBe(0);
  expect(controllerOf(after, after.objects[move]!)).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});
