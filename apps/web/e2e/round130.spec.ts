// Round 130's prompts and buttons: Out of the Tombs' "Return <card>" for a draw from an empty library, Court of
// Locthwain's "Cast it: without paying its mana cost" for a card exiled with it, Transmutation Font's three tokens, and
// the log reading "You face a villainous choice and choose".
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, playUntil, scene, state } from "./scene";
import { card, controls, menu, modal, resolveUntil, seat } from "./ui";

test("Out of the Tombs: drawing two from an empty library, you return Hill Giant, then Grizzly Bears comes back on its own", async ({ page }) => {
  const s = scene({ hand: ["Divination"], board: [...LANDS, "Out of the Tombs"], yard: ["Grizzly Bears", "Hill Giant"] });
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  // An empty library: its lands set aside in exile.
  for (const id of s.players[0]!.library.splice(0)) {
    s.objects[id]!.zone = "exile";
    s.players[0]!.exile.push(id);
  }
  await open(page, s);
  await card(page, "Divination", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "drawEmptyReturn" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("your library is empty, so instead of drawing, return a creature card from your graveyard to the battlefield (1 more draw after this)");
  await expect(bar.getByRole("button", { name: "Return Grizzly Bears" })).toBeVisible();
  await bar.getByRole("button", { name: "Return Hill Giant" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "battlefield");
  expect(after.objects[giant]!.zone).toBe("battlefield");
  expect(after.players[0]!.lost).toBeFalsy();
  expect(pageErrors(page)).toEqual([]);
});

test("Court of Locthwain: as the monarch, you cast Ana's exiled Hill Giant without paying its mana cost", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Court of Locthwain"] }, [{ exile: ["Hill Giant"] }]);
  const [court, giant] = [one(s, "Court of Locthwain"), one(s, "Hill Giant")];
  // As its upkeep trigger left things: the card exiled with it, playable with mana of any type, and one free spell.
  const zc = s.objects[giant]!.zoneChanges ?? 0;
  s.objects[giant]!.mayPlay = { player: 0, zc, until: "exiled", turn: s.turn, anyType: true };
  const key = `${court}@${s.objects[court]!.zoneChanges ?? 0}`;
  s.linkedExile = { ...s.linkedExile, [key]: [{ id: giant, zc }] };
  s.linkedFreeCasts = [{ player: 0, source: key, turn: s.turn, sourceName: "Court of Locthwain" }];
  s.monarch = 0;
  await open(page, s);
  const exile = seat(page, 1).locator(".zone", { hasText: "Exile" });
  await exile.click();
  await modal(page).locator(".card.playable").click();
  await menu(page).getByRole("button", { name: "Cast it: without paying its mana cost" }).click();
  const after = await resolveUntil(page, (st) => st.objects[giant]!.zone === "battlefield" && st.stack.length === 0);
  expect(after.objects[giant]!.controller).toBe(0);
  expect(after.battlefield.filter((id) => after.objects[id]!.tapped)).toHaveLength(0);
  expect(after.linkedFreeCasts ?? []).toEqual([]);
  expect(pageErrors(page)).toEqual([]);
});

test("Transmutation Font: its {T} ability offers a Blood, a Clue or a Food token, and you pick the Clue", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Transmutation Font"] });
  await open(page, s);
  await card(page, "Transmutation Font", s).click();
  await menu(page).locator("button", { hasText: "Create your choice" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "either" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar.getByRole("button", { name: "Create a Blood token" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Create a Food token" })).toBeVisible();
  await bar.getByRole("button", { name: "Create a Clue token" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.battlefield.some((id) => st.objects[id]!.isToken));
  const tokens = after.battlefield.filter((id) => after.objects[id]!.isToken).map((id) => after.cards[after.objects[id]!.cardId]!.name);
  expect(tokens).toEqual(["Clue Token"]);
  expect(pageErrors(page)).toEqual([]);
});

test("The Dalek Emperor: the log reads \"You face a villainous choice and choose\"", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Grizzly Bears"] }, [{ board: ["The Dalek Emperor"] }]);
  const s = playUntil(s0, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "villainous" && st.pending.player === 0);
  await open(page, s);
  await controls(page).getByRole("button", { name: /sacrifices a creature/ }).click();
  await expect.poll(async () => (await state(page)).objects[one(s0, "Grizzly Bears")]!.zone).toBe("graveyard");
  await expect(page.locator(".log")).toContainText("You face a villainous choice and choose");
  await expect(page.locator(".log")).not.toContainText("You faces");
  expect(pageErrors(page)).toEqual([]);
});
