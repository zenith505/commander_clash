// Round 433: The Creation of Avacyn (chapter I's search exiles Serra Angel face down; chapter III asks whether to put the
// exiled Serra Angel onto the battlefield: Yes, or No for your hand) and The Eleventh Hour (chapter III's target: a
// token copy of Ana's Grizzly Bears named Prisoner Zero).
import { expect, test } from "@playwright/test";
import type { GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, modal, resolveUntil } from "./ui";

test("The Creation of Avacyn I: search your library for Serra Angel, exiled face down", async ({ page }) => {
  const s = scene({ hand: ["The Creation of Avacyn"], board: LANDS, library: ["Serra Angel", "Divination"] });
  const [saga, angel] = [one(s, "The Creation of Avacyn"), one(s, "Serra Angel")];
  await open(page, s);
  await card(page, "The Creation of Avacyn", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  await modal(page).locator(`[data-pick="${angel}"]`).click();
  await modal(page).getByRole("button", { name: "Done", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[angel]!.zone === "exile");
  expect(after.objects[angel]!.hiddenExile?.seen).toEqual([0]);
  expect(after.linkedExile?.[`${saga}@${after.objects[saga]!.zoneChanges ?? 0}`]?.map((l) => l.id)).toEqual([angel]);
  expect(pageErrors(page)).toEqual([]);
});

/** The Saga at chapter II with Serra Angel exiled by it, face up; its third lore counter comes as the main phase begins. */
const avacynIII = (): GameState => {
  const s = scene({ board: [...LANDS, "The Creation of Avacyn"], exile: ["Serra Angel"] });
  const [saga, angel] = [one(s, "The Creation of Avacyn"), one(s, "Serra Angel")];
  s.objects[saga]!.counters = { lore: 2 };
  s.linkedExile = { ...(s.linkedExile ?? {}), [`${saga}@${s.objects[saga]!.zoneChanges ?? 0}`]: [{ id: angel, zc: s.objects[angel]!.zoneChanges ?? 0 }] };
  s.step = "draw";
  return s;
};

test("The Creation of Avacyn III: Yes puts the exiled Serra Angel onto the battlefield", async ({ page }) => {
  const s = avacynIII();
  const angel = one(s, "Serra Angel");
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Put Serra Angel onto the battlefield? If you don't, it goes into its owner's hand.");
  await bar.getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[angel]!.zone === "battlefield");
  expect(after.objects[angel]!.controller).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("The Creation of Avacyn III: No puts the exiled Serra Angel into your hand", async ({ page }) => {
  const s = avacynIII();
  const angel = one(s, "Serra Angel");
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await controls(page).getByRole("button", { name: "No" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[angel]!.zone === "hand");
  expect(after.players[0]!.hand).toContain(angel);
  expect(pageErrors(page)).toEqual([]);
});

test("The Eleventh Hour III: target Ana's Grizzly Bears, and you create Prisoner Zero, a legendary Alien copy of it", async ({ page }) => {
  const s = scene({ board: [...LANDS, "The Eleventh Hour"] }, [{ board: ["Grizzly Bears"] }]);
  const [saga, bears] = [one(s, "The Eleventh Hour"), one(s, "Grizzly Bears")];
  s.objects[saga]!.counters = { lore: 2 };
  s.step = "draw";
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  await page.locator(`[data-obj="${bears}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.battlefield.some((id) => st.objects[id]!.isToken && st.objects[id]!.controller === 0));
  const tok = after.battlefield.find((id) => after.objects[id]!.isToken && after.objects[id]!.controller === 0)!;
  const d = after.cards[after.objects[tok]!.cardId]!;
  expect(d.name).toBe("Prisoner Zero");
  expect(d.supertypes).toContain("Legendary");
  expect(d.subtypes).toEqual(["Alien"]);
  await expect(page.locator(`[data-obj="${tok}"]`).first()).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});
