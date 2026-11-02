// Round 253: Neera, Wild Mage ("you may put it on the bottom of its owner's library. If you do, reveal cards ... until you
// reveal a nonland card. You may cast that card without paying its mana cost"): the "you may" asked as the trigger
// resolves, then the free cast offered; Illuna, Apex of Wishes ("Put that card onto the battlefield or into your hand"):
// the two options named after the exiled card, chosen after seeing it.
import { expect, test } from "@playwright/test";
import { applyAction, planCast, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Neera, Wild Mage: put Opt on the bottom of your library, then cast the revealed Grizzly Bears for free", async ({ page }) => {
  const s = scene({ hand: ["Opt"], board: [...LANDS, "Neera, Wild Mage"], library: ["Wastes", "Grizzly Bears"] });
  const [opt, wastes, bears] = ["Opt", "Wastes", "Grizzly Bears"].map((n) => one(s, n));
  await open(page, s);
  await card(page, "Opt", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Neera, Wild Mage: Put it on the bottom of its owner's library?");
  await bar.getByRole("button", { name: "Yes" }).click();
  const offer = await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.player === 0);
  expect(offer.pending?.kind === "castFree" && offer.pending.objectId).toBe(bears);
  expect(offer.objects[opt!]!.zone).toBe("library");
  await bar.getByRole("button", { name: "Cast it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears!]!.zone === "battlefield");
  expect(after.players[0]!.library.slice(-2).sort()).toEqual([opt!, wastes!].sort());
  expect(pageErrors(page)).toEqual([]);
});

test("Illuna, Apex of Wishes: mutated, it exiles down to Hill Giant; put it into your hand", async ({ page }) => {
  const s0 = scene({ hand: ["Illuna, Apex of Wishes"], board: [...LANDS, "Grizzly Bears"], library: ["Wastes", "Lightning Bolt", "Hill Giant"] });
  const [illuna, bears, wastes, bolt, giant] = ["Illuna, Apex of Wishes", "Grizzly Bears", "Wastes", "Lightning Bolt", "Hill Giant"].map((n) => one(s0, n));
  let s: GameState = s0;
  for (const a of planCast(s, 0, illuna!, [{ kind: "object", id: bears! }], undefined, "auto", undefined, { alt: "mutate" })!) s = applyAction(s, a);
  s = playUntil(s, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "mutate");
  s = applyAction(s, { type: "chooseOption", player: 0, choice: "top" });
  s = playUntil(s, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "either");
  await open(page, s);
  const bar = controls(page);
  await expect(bar.getByRole("button", { name: "Put Hill Giant onto the battlefield" })).toBeVisible();
  await bar.getByRole("button", { name: "Put Hill Giant into your hand" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant!]!.zone === "hand");
  expect(after.objects[wastes!]!.zone).toBe("exile");
  expect(after.objects[bolt!]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});
