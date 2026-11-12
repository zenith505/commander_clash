// Lane B round B186 in the browser: Temporal Aperture (activate it, then cast the card it revealed on top of your library
// from the menu's "Cast it: without paying its mana cost") and Lumbering Laundry (activate it, then Ana's face-down
// creature shows what it is).
import { expect, test } from "@playwright/test";
import { invalidateCharacteristics, type GameState } from "@cc/engine";
import { LANDS, def, idsOf, one, open, pageErrors, scene } from "./scene";
import { card, menu, resolveUntil, seat } from "./ui";

test("Temporal Aperture: the revealed Hill Giant on top of your library is cast without paying its mana cost", async ({ page }) => {
  const s: GameState = scene({ board: [...LANDS, "Temporal Aperture"], library: ["Hill Giant"] });
  // Every card in your library a Hill Giant, so whatever the shuffle puts on top is one.
  const giant = def("Hill Giant");
  s.cards[giant.oracleId] = giant;
  for (const id of s.players[0]!.library) s.objects[id]!.cardId = giant.oracleId;
  invalidateCharacteristics(s);
  const aperture = one(s, "Temporal Aperture");
  await open(page, s);
  await card(page, "Temporal Aperture", s).click();
  const entry = menu(page).locator("button", { hasText: "Shuffle your library" });
  if (await entry.count()) await entry.click();
  const shown = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && !!st.topFreePlays?.length);
  expect(shown.objects[aperture]!.tapped).toBe(true);
  const top = shown.players[0]!.library[0]!;
  expect(shown.topFreePlays).toEqual([expect.objectContaining({ player: 0, card: top })]);
  const untapped = shown.battlefield.filter((id) => shown.objects[id]!.controller === 0 && !shown.objects[id]!.tapped).length;
  const library = seat(page, 0).locator(".zone", { hasText: "Library" });
  await library.locator(`[data-obj="${top}"]`).click();
  const free = menu(page).getByRole("button", { name: "Cast it: without paying its mana cost" });
  await expect(free).toBeEnabled();
  await free.click();
  const after = await resolveUntil(page, (st) => st.objects[top]!.zone === "battlefield" && st.stack.length === 0);
  expect(after.battlefield.filter((id) => after.objects[id]!.controller === 0 && !after.objects[id]!.tapped).length).toBe(untapped + 1);
  expect(after.topFreePlays ?? []).toEqual([]);
  expect(pageErrors(page)).toEqual([]);
});

test("Lumbering Laundry: after activating it, Ana's face-down creature shows what it is", async ({ page }) => {
  const s: GameState = scene({ board: [...LANDS, "Lumbering Laundry"] }, [{ board: ["Serra Angel"] }]);
  const angel = one(s, "Serra Angel");
  s.objects[angel]!.faceDown = "manifest";
  invalidateCharacteristics(s);
  await open(page, s);
  const theirs = page.locator(`[data-obj="${angel}"]`).first();
  await expect(theirs).not.toContainText("Serra Angel");
  await card(page, "Lumbering Laundry", s).click();
  const entry = menu(page).locator("button", { hasText: "look at face-down creatures" });
  if (await entry.count()) await entry.click();
  await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && !!st.lookFaceDownTurn?.length);
  await expect(theirs).toContainText("Serra Angel");
  expect(idsOf(s, "Serra Angel", "battlefield", 1)).toEqual([angel]);
  expect(pageErrors(page)).toEqual([]);
});
