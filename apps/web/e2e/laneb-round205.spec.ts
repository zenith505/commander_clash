// Lane B round B205 in the browser: Too Evil to Stay Dead cast using teamwork (the tap bar, then the any-creature target
// from your graveyard), Earth's Mightiest Heroes using teamwork (any number of creature cards), Don & Leo's two end-step
// targets, and Captain Marvel's "you may put the same number and kind of counters" question.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, modal, resolveUntil } from "./ui";

test("Too Evil to Stay Dead: tap Hill Giant and Grizzly Bears for teamwork, then return Craw Wurm", async ({ page }) => {
  const s = scene({ hand: ["Too Evil to Stay Dead"], board: [...LANDS, "Hill Giant", "Grizzly Bears"], yard: ["Craw Wurm"] });
  const [giant, bears, wurm] = [one(s, "Hill Giant"), one(s, "Grizzly Bears"), one(s, "Craw Wurm")];
  await open(page, s);
  await card(page, "Too Evil to Stay Dead", s).click();
  const bar = page.locator(".teamwork-pick");
  await expect(bar).toContainText("Teamwork 4:");
  await page.locator(`[data-obj="${giant}"]`).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  await expect(bar).toContainText("(now 5)");
  await bar.getByRole("button", { name: "Tap and cast" }).click();
  // Cast using teamwork: any creature card in your graveyard, mana value 6 included.
  await modal(page).locator(`[data-pick="${wurm}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[wurm]!.zone === "battlefield");
  expect(after.objects[giant]!.tapped && after.objects[bears]!.tapped).toBe(true);
  expect(after.objects[wurm]!.controller).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Earth's Mightiest Heroes: cast using teamwork, put two of the revealed creature cards onto the battlefield", async ({ page }) => {
  const s = scene({ hand: ["Earth's Mightiest Heroes"], board: [...LANDS, "Hill Giant", "Grizzly Bears"], library: ["Craw Wurm", "Gray Ogre", "Forest", "Forest", "Forest", "Forest", "Forest", "Forest"] });
  const [giant, bears, wurm, ogre] = [one(s, "Hill Giant"), one(s, "Grizzly Bears"), one(s, "Craw Wurm"), one(s, "Gray Ogre")];
  await open(page, s);
  await card(page, "Earth's Mightiest Heroes", s).click();
  const bar = page.locator(".teamwork-pick");
  await page.locator(`[data-obj="${giant}"]`).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  await bar.getByRole("button", { name: "Tap and cast" }).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  expect(asked.pending?.kind === "searchLibrary" && [...asked.pending.cards].sort()).toEqual([wurm, ogre].sort());
  const pick = modal(page);
  await pick.locator(`[data-pick="${wurm}"]`).click();
  await pick.locator(`[data-pick="${ogre}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[ogre]!.zone === "battlefield");
  expect(after.objects[wurm]!.zone).toBe("battlefield");
  expect(after.players[0]!.graveyard.filter((id) => after.cards[after.objects[id]!.cardId]!.name === "Forest").length).toBe(6);
  expect(pageErrors(page)).toEqual([]);
});

test("Don & Leo, Problem Solvers: at your end step choose Sol Ring and Grizzly Bears; both are exiled and come back", async ({ page }) => {
  let s = scene({ board: [...LANDS, "Don & Leo, Problem Solvers", "Sol Ring", "Grizzly Bears"] });
  const [ring, bears] = [one(s, "Sol Ring"), one(s, "Grizzly Bears")];
  s.objects[bears]!.counters["+1/+1"] = 1;
  s = playUntil(s, (st) => st.activePlayer === 0 && st.step === "end" && st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  const zc = [s.objects[ring]!.zoneChanges ?? 0, s.objects[bears]!.zoneChanges ?? 0];
  await open(page, s);
  await expect(page.locator(".targeting")).toContainText("choose target artifact you control");
  await page.locator(`[data-obj="${ring}"]`).first().click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && (st.objects[bears]!.zoneChanges ?? 0) > zc[1]!);
  expect(after.objects[ring]!.zone).toBe("battlefield");
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(after.objects[ring]!.zoneChanges ?? 0).toBeGreaterThan(zc[0]!);
  expect(after.objects[bears]!.counters["+1/+1"] ?? 0).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Captain Marvel, Apex Avenger: Battlegrowth on Grizzly Bears, then say yes to a +1/+1 counter on Captain Marvel", async ({ page }) => {
  const s = scene({ hand: ["Battlegrowth"], board: [...LANDS, "Captain Marvel, Apex Avenger", "Grizzly Bears"] });
  const [marvel, bears] = [one(s, "Captain Marvel, Apex Avenger"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Battlegrowth", s).click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("the same number and kind of counters");
  await bar.getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && (st.objects[marvel]!.counters["+1/+1"] ?? 0) === 1);
  expect(after.objects[bears]!.counters["+1/+1"]).toBe(1);
  await expect(page.locator(`[data-obj="${marvel}"]`).first()).toContainText("5/5");
  expect(pageErrors(page)).toEqual([]);
});
