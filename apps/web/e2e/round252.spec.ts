// Round 252: Author of Shadows ("exile all opponents' graveyards. Choose a nonland card exiled this way. You may cast that
// card for as long as it remains exiled"): the choice among the nonland cards only; Jacob Frye ("exile up to one target
// Assassin card ... from your graveyard. If you do, copy it. You may cast the copy."): the target picked from your
// graveyard, then the copy offered for its mana cost, cast now or not at all.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { attack, card, controls, modal, passTo, resolveUntil } from "./ui";

test("Author of Shadows: choose Grizzly Bears among the opponents' exiled nonland cards; only it may be cast", async ({ page }) => {
  const s = scene({ hand: ["Author of Shadows"], board: LANDS }, [{ yard: ["Lightning Bolt", "Grizzly Bears", "Wastes"] }, { yard: ["Hill Giant"] }]);
  const [bolt, bears, wastes, giant] = ["Lightning Bolt", "Grizzly Bears", "Wastes", "Hill Giant"].map((n) => one(s, n));
  await open(page, s);
  await card(page, "Author of Shadows", s).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "impulseChoice" && st.pending.player === 0);
  expect(asked.pending?.kind === "chooseOption" ? [...asked.pending.options].sort() : []).toEqual([bolt!, bears!, giant!].sort());
  for (const id of [bolt, bears, wastes, giant]) expect(asked.objects[id!]!.zone).toBe("exile");
  const bar = controls(page);
  await expect(bar).toContainText("choose a nonland card; you may cast it for as long as it remains exiled");
  await expect(bar.getByRole("button", { name: "Wastes" })).toHaveCount(0);
  await bar.getByRole("button", { name: "Grizzly Bears" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && !!st.objects[bears!]!.mayPlay);
  expect(after.objects[bears!]!.mayPlay).toMatchObject({ player: 0, until: "exiled", castOnly: true, anyType: true });
  expect(after.objects[bolt!]!.mayPlay).toBeUndefined();
  expect(after.objects[giant!]!.mayPlay).toBeUndefined();
  expect(pageErrors(page)).toEqual([]);
});

test("Jacob Frye: after combat damage, exile Royal Assassin from your graveyard and cast its copy for {1}{B}{B}", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Jacob Frye"], yard: ["Royal Assassin", "Lightning Bolt"] });
  const [jacob, assassin, bolt] = ["Jacob Frye", "Royal Assassin", "Lightning Bolt"].map((n) => one(s, n));
  await open(page, s);
  await passTo(page, "declareAttackers");
  await attack(page, [[jacob!, 1]]);
  const targeting = await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  expect(targeting.pending?.kind).toBe("chooseTargets");
  await expect(modal(page).locator(`[data-pick="${bolt}"]`)).toHaveCount(0);
  await modal(page).locator(`[data-pick="${assassin}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong" && st.pending.player === 0);
  const bar = controls(page);
  await bar.getByRole("button", { name: "Royal Assassin" }).click();
  const offer = await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.player === 0);
  expect(offer.pending?.kind === "castFree" && offer.pending.how).toBe("paid");
  expect(offer.objects[assassin!]!.zone).toBe("exile");
  await expect(bar).toContainText("cast Royal Assassin from exile for");
  await bar.getByRole("button", { name: "Cast it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.battlefield.some((id) => st.objects[id]!.isToken && st.cards[st.objects[id]!.cardId]?.name === "Royal Assassin"));
  expect(after.objects[assassin!]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});
