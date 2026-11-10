// Lane B round B167 in the browser: Phylactery Lich's "put a phylactery counter on an artifact you control" as it enters,
// Ancestral Knowledge's picker that exiles any number of the top ten cards and puts the rest back on top in any order, and
// casting the card Fiend of the Shadows made an opponent exile from their hand.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { attack, card, controls, menu, modal, passTo, resolveUntil, seat } from "./ui";

test("Phylactery Lich: you choose the artifact that gets the phylactery counter as it enters", async ({ page }) => {
  const s = scene({ hand: ["Phylactery Lich"], board: [...LANDS, "Sol Ring", "Ornithopter", "Grizzly Bears"] });
  const [lich, ring, thopter] = [one(s, "Phylactery Lich"), one(s, "Sol Ring"), one(s, "Ornithopter")];
  await open(page, s);
  await card(page, "Phylactery Lich", s).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "chosenObject" && st.pending.player === 0);
  expect([...(asked.pending as { options: string[] }).options].sort()).toEqual([ring, thopter].sort());
  const bar = controls(page);
  await expect(bar).toContainText("choose an artifact you control to put a phylactery counter on");
  await expect(bar.getByRole("button", { name: "Grizzly Bears", exact: true })).toHaveCount(0);
  await bar.getByRole("button", { name: "Ornithopter", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[lich]!.zone === "battlefield" && (st.objects[thopter]!.counters.phylactery ?? 0) > 0);
  expect(after.objects[thopter]!.counters.phylactery).toBe(1);
  expect(after.objects[ring]!.counters.phylactery ?? 0).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Ancestral Knowledge: exile two of the top ten cards, the rest go back on top in the order shown", async ({ page }) => {
  const top = ["Grizzly Bears", "Hill Giant", "Lightning Bolt", "Counterspell", "Shock", "Divination", "Murder", "Sol Ring", "Ornithopter", "Disenchant"];
  const s = scene({ hand: ["Ancestral Knowledge"], board: LANDS, library: top });
  const [bolt, murder] = [one(s, "Lightning Bolt"), one(s, "Murder")];
  await open(page, s);
  await card(page, "Ancestral Knowledge", s).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "arrangeTop" && st.pending.how === "exile");
  const cards = (asked.pending as { cards: string[] }).cards;
  expect(cards).toHaveLength(10);
  const arrange = page.locator(".modal.arrange");
  await expect(arrange).toContainText("the top 10 cards of your library: exile any number of them and put the rest back on top in any order");
  await expect(arrange.locator("h4", { hasText: "Exile" })).toBeVisible();
  await arrange.locator(`[data-arrange="${bolt}"]`).click();
  await arrange.locator(`[data-arrange="${murder}"]`).click();
  await arrange.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[bolt]!.zone === "exile");
  expect(after.objects[murder]!.zone).toBe("exile");
  expect(after.players[0]!.library.slice(0, 8)).toEqual(cards.filter((c) => c !== bolt && c !== murder));
  expect(pageErrors(page)).toEqual([]);
});

test("Fiend of the Shadows: Ana exiles her only card, and you cast it from her exile", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Fiend of the Shadows"] }, [{ hand: ["Grizzly Bears"] }]);
  const [fiend, bears] = [one(s, "Fiend of the Shadows"), one(s, "Grizzly Bears")];
  await open(page, playUntil(s, (st) => st.pending?.kind === "declareAttackers"));
  await attack(page, [[fiend, 1]]);
  const hit = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "exile", 80);
  expect(hit.objects[bears]!.mayPlay).toMatchObject({ player: 0, until: "exiled" });
  await passTo(page, "main2");
  const theirs = seat(page, 1).locator(".zone", { hasText: "Exile" });
  await expect(theirs.locator(".zone-title")).toHaveText("Exile ✦");
  await theirs.click();
  await modal(page).locator(".card.playable").click();
  await menu(page).getByRole("button", { name: /^Cast it/ }).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "battlefield");
  expect(after.objects[bears]!.controller).toBe(0);
  expect(after.objects[bears]!.owner).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});
