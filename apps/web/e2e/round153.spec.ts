// Round 153's prompts: Birthing Ritual's "you may sacrifice a creature" with the cards looked at, then the pick among
// them; Swashbuckler Extraordinaire's Treasures to sacrifice as you attack and its targets; Senu, Keen-Eyed Protector
// choosing what it attacks as it returns from exile; and Waterbending Lesson's "discard a card unless you waterbend {2}".
import { expect, test } from "@playwright/test";
import { objHasKeyword } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { attack, card, controls, modal, passTo, resolveUntil } from "./ui";

test("Birthing Ritual: sacrifice Grizzly Bears at your end step, seeing the top seven, and put Gray Ogre onto the battlefield", async ({ page }) => {
  const s = scene({ board: ["Birthing Ritual", "Grizzly Bears"], library: ["Gray Ogre", "Hill Giant", "Island", "Island", "Island", "Island", "Island"] }, [], { step: "main2" });
  const [bears, ogre, giant] = [one(s, "Grizzly Bears"), one(s, "Gray Ogre"), one(s, "Hill Giant")];
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents");
  const bar = controls(page);
  await expect(bar).toContainText("you may sacrifice a creature");
  // The seven cards looked at, named in the prompt.
  await expect(bar.locator(`[data-looked="${ogre}"]`)).toHaveText(/Gray Ogre/);
  await expect(bar.locator("[data-looked]")).toHaveCount(7);
  await page.locator(`[data-obj="${bears}"]`).click();
  await bar.getByRole("button", { name: "Sacrifice", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  // Hill Giant's mana value 4 is more than 1 plus Grizzly Bears's 2.
  await expect(pick.locator(`[data-pick="${giant}"]`)).toHaveClass(/\bdim\b/);
  await pick.locator(`[data-pick="${ogre}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.objects[ogre]!.zone === "battlefield" && !st.pending);
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(after.players[0]!.library.slice(-6)).toContain(giant);
  expect(pageErrors(page)).toEqual([]);
});

test("Birthing Ritual: sacrifice none, and all seven go to the bottom", async ({ page }) => {
  const s = scene({ board: ["Birthing Ritual", "Grizzly Bears"], library: ["Gray Ogre", "Hill Giant", "Island", "Island", "Island", "Island", "Island", "Forest"] }, [], { step: "main2" });
  const [bears, ogre] = [one(s, "Grizzly Bears"), one(s, "Gray Ogre")];
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents");
  await controls(page).getByRole("button", { name: "Sacrifice none" }).click();
  const after = await resolveUntil(page, (st) => st.players[0]!.library.at(-7) !== undefined && st.step !== "end" && !st.pending, 60);
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(after.objects[ogre]!.zone).toBe("library");
  expect(after.players[0]!.library.indexOf(ogre)).toBeGreaterThan(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Swashbuckler Extraordinaire: attack, sacrifice two Treasures, and two attackers gain double strike", async ({ page }) => {
  const s = scene({ board: ["Swashbuckler Extraordinaire", "Grizzly Bears", "Hill Giant"], tokens: ["Treasure", "Treasure"] });
  const [swash, bears, giant] = [one(s, "Swashbuckler Extraordinaire"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  const treasures = s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Treasure Token");
  await open(page, s);
  await passTo(page, "declareAttackers");
  await attack(page, [
    [swash, 1],
    [bears, 1],
    [giant, 1],
  ]);
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents");
  const bar = controls(page);
  for (const t of treasures) await page.locator(`[data-obj="${t}"]`).click();
  await bar.getByRole("button", { name: "Sacrifice", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets");
  await page.locator(`[data-obj="${bears}"]`).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  // Two of "up to two" chosen: that's all it can take.
  const done = page.locator(".targeting").getByRole("button", { name: "Done" });
  if (await done.isVisible()) await done.click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && objHasKeyword(st, st.objects[giant]!, "Double strike"));
  expect(objHasKeyword(after, after.objects[bears]!, "Double strike")).toBe(true);
  expect(objHasKeyword(after, after.objects[swash]!, "Double strike")).toBe(false);
  expect(treasures.every((t) => after.objects[t]?.zone !== "battlefield")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Senu, Keen-Eyed Protector: Isamaru attacks Ana unblocked; Senu returns from exile attacking Ben", async ({ page }) => {
  const s = scene({ board: ["Isamaru, Hound of Konda"], exile: ["Senu, Keen-Eyed Protector"] });
  const [isamaru, senu] = [one(s, "Isamaru, Hound of Konda"), one(s, "Senu, Keen-Eyed Protector")];
  await open(page, s);
  await passTo(page, "declareAttackers");
  await attack(page, [[isamaru, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "attackWhom");
  const bar = controls(page);
  await expect(bar).toContainText("choose what Senu, Keen-Eyed Protector attacks");
  await bar.getByRole("button", { name: "Ben", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.objects[senu]!.zone === "battlefield" && st.stack.length === 0);
  expect(after.objects[senu]!.attacking).toBe(2);
  expect(pageErrors(page)).toEqual([]);
});

test("Waterbending Lesson: draw three, then waterbend {2} by tapping two creatures instead of discarding", async ({ page }) => {
  const s = scene({ hand: ["Waterbending Lesson"], board: ["Island", "Island", "Island", "Island", "Grizzly Bears", "Grizzly Bears"], library: ["Hill Giant", "Gray Ogre", "Forest"] });
  const lesson = one(s, "Waterbending Lesson");
  await open(page, s);
  await card(page, "Waterbending Lesson", s).click();
  const st = await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" || x.pending?.kind === "payUnless");
  const bar = controls(page);
  await expect(bar).toContainText("waterbend");
  await bar.getByRole("button", { name: st.pending?.kind === "payUnless" ? /^Pay, tapping 2/ : /waterbend/i }).first().click();
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending && x.objects[lesson]!.zone === "graveyard");
  expect(after.players[0]!.hand).toHaveLength(3);
  expect(after.battlefield.filter((id) => after.cards[after.objects[id]!.cardId]!.name === "Grizzly Bears").every((id) => after.objects[id]!.tapped)).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
