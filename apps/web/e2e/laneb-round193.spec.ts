// Lane B round B193 in the browser: Bilbo, Thief in the Night (as it attacks, pick an artifact, instant or sorcery card in
// your graveyard and cast it for its cost, {1} less) and Demilich (as it attacks, exile an instant from your graveyard and
// cast its copy for its mana cost).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { attack, controls, modal, passTo, resolveUntil } from "./ui";

test("Bilbo: as it attacks, cast Sol Ring from your graveyard; Grizzly Bears isn't offered", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Bilbo, Thief in the Night"], yard: ["Sol Ring", "Lightning Bolt", "Grizzly Bears"] });
  const [bilbo, ring, bolt, bears] = ["Bilbo, Thief in the Night", "Sol Ring", "Lightning Bolt", "Grizzly Bears"].map((n) => one(s, n));
  await open(page, s);
  await passTo(page, "declareAttackers");
  await attack(page, [[bilbo!, 1]]);
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong" && st.pending.player === 0);
  expect(asked.pending?.kind === "chooseOption" ? [...asked.pending.options].sort() : []).toEqual([ring!, bolt!, "none"].sort());
  const bar = controls(page);
  await expect(bar).toContainText("cast an artifact, instant, or sorcery spell from your graveyard?");
  await expect(bar.getByRole("button", { name: "Grizzly Bears" })).toHaveCount(0);
  await bar.getByRole("button", { name: "Sol Ring" }).click();
  const offer = await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.player === 0);
  expect(offer.pending?.kind === "castFree" && offer.pending.how).toBe("paid");
  await bar.getByRole("button", { name: "Cast it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[ring!]!.zone === "battlefield");
  expect(after.objects[ring!]!.controller).toBe(0);
  expect(after.objects[bolt!]!.zone).toBe("graveyard");
  expect(after.objects[bears!]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Demilich: as it attacks, exile Divination from your graveyard and cast its copy for {2}{U}", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Demilich"], yard: ["Divination", "Grizzly Bears"] });
  const [demilich, div, bears] = ["Demilich", "Divination", "Grizzly Bears"].map((n) => one(s, n));
  await open(page, s);
  await passTo(page, "declareAttackers");
  await attack(page, [[demilich!, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  await expect(modal(page).locator(`[data-pick="${bears}"]`)).toHaveCount(0);
  await modal(page).locator(`[data-pick="${div}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong" && st.pending.player === 0);
  const bar = controls(page);
  await bar.getByRole("button", { name: "Divination" }).click();
  const offer = await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.player === 0);
  expect(offer.pending?.kind === "castFree" && offer.pending.how).toBe("paid");
  expect(offer.objects[div!]!.zone).toBe("exile");
  const hand = offer.players[0]!.hand.length;
  await bar.getByRole("button", { name: "Cast it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[0]!.hand.length === hand + 2);
  expect(after.objects[div!]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});
