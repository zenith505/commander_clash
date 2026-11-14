// Lane B round B206 in the browser: Kaya, Ghost Assassin's 0 (target Ana's creature, then choose which is exiled), Fumble
// (the creature to attach the taken Aura and Equipment to), The Three Seasons' chapter III (three cards from your
// graveyard to shuffle in) and Varchild's War-Riders' cumulative upkeep (pay, then the opponent who gets the token).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

test("Kaya, Ghost Assassin: 0 targeting Ana's Hill Giant, then exile the creature, not Kaya", async ({ page }) => {
  const s = scene({ board: ["Kaya, Ghost Assassin"] }, [{ board: ["Hill Giant"] }]);
  const [kaya, giant] = [one(s, "Kaya, Ghost Assassin"), one(s, "Hill Giant")];
  s.objects[kaya]!.counters.loyalty = 5;
  await open(page, s);
  await page.locator(`[data-obj="${kaya}"]`).first().click();
  await menu(page).locator("button", { hasText: "or up to one target creature" }).click();
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "either" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("choose one");
  await bar.getByRole("button", { name: "Exile the target creature" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "exile");
  expect(after.objects[kaya]!.zone).toBe("battlefield");
  expect(after.players[0]!.life).toBe(38);
  expect(pageErrors(page)).toEqual([]);
});

test("Fumble: return Ana's Hill Giant, take its Pacifism and Bonesplitter and attach both to your Grizzly Bears", async ({ page }) => {
  const s = scene({ hand: ["Fumble"], board: [...LANDS, "Grizzly Bears"] }, [{ board: ["Hill Giant", "Pacifism", "Bonesplitter", "Gray Ogre"] }]);
  const [giant, pac, bone, bears] = [one(s, "Hill Giant"), one(s, "Pacifism"), one(s, "Bonesplitter"), one(s, "Grizzly Bears")];
  s.objects[pac]!.attachedTo = giant;
  s.objects[bone]!.attachedTo = giant;
  await open(page, s);
  await card(page, "Fumble", s).click();
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "enchant" && st.pending.player === 0);
  const bar = page.locator(".enchant-pick");
  await expect(bar).toContainText("to attach Pacifism, Bonesplitter to");
  await bar.getByRole("button", { name: "Grizzly Bears" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[pac]!.attachedTo === bears);
  expect(after.objects[giant]!.zone).toBe("hand");
  expect(after.objects[bone]!.attachedTo).toBe(bears);
  expect(pageErrors(page)).toEqual([]);
});

test("The Three Seasons: chapter III, choose three of your five graveyard cards to shuffle into your library", async ({ page }) => {
  let s = scene({ board: ["The Three Seasons"], yard: ["Grizzly Bears", "Hill Giant", "Gray Ogre", "Craw Wurm", "Fumble"] }, [{ yard: ["Pacifism", "Bonesplitter"] }]);
  const saga = one(s, "The Three Seasons");
  s.objects[saga]!.counters.lore = 2;
  const [bears, giant, wurm, fumble, pac] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Craw Wurm"), one(s, "Fumble"), one(s, "Pacifism")];
  s = playUntil(s, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  await open(page, s);
  const pick = modal(page);
  await expect(pick).toContainText("their owners shuffle them into their libraries");
  for (const id of [bears, giant, wurm]) await pick.locator(`[data-pick="${id}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "library");
  expect([after.objects[giant]!.zone, after.objects[wurm]!.zone, after.objects[fumble]!.zone]).toEqual(["library", "library", "graveyard"]);
  // Ana's graveyard had only two: both shuffled in, with no choice.
  expect(after.objects[pac]!.zone).toBe("library");
  expect(pageErrors(page)).toEqual([]);
});

test("Varchild's War-Riders: pay its cumulative upkeep by having Ben create a Survivor token", async ({ page }) => {
  let s = scene({ board: ["Varchild's War-Riders"] });
  const riders = one(s, "Varchild's War-Riders");
  s = playUntil(s, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Have opponents create a Survivor token");
  await bar.getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "giveLife" && st.pending.player === 0);
  await expect(bar).toContainText("choose an opponent to create a 1/1 Survivor token");
  await bar.getByRole("button", { name: "Ben" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.battlefield.some((id) => st.objects[id]!.isToken && st.objects[id]!.controller === 2));
  expect(after.objects[riders]!.zone).toBe("battlefield");
  expect(after.objects[riders]!.counters.age).toBe(1);
  expect(after.battlefield.filter((id) => after.objects[id]!.isToken).length).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});
