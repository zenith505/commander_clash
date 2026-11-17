// Lane B round B245 in the browser: Caller of the Hunt asks for a creature type as it's cast; Reap Intellect takes up to X
// cards from the revealed hand, then searches for their names; Deadly Cover-Up, with evidence collected, asks for a card in
// an opponent's graveyard, then searches its owner's zones for its name.
import { expect, test } from "@playwright/test";
import { power, toughness } from "@cc/engine";
import { idsOf, LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, modal, resolveUntil } from "./ui";

test("Caller of the Hunt: choose Elf as it's cast; two Elves on the battlefield make it 2/2", async ({ page }) => {
  const s = scene({ hand: ["Caller of the Hunt"], board: [...LANDS, "Llanowar Elves"] }, [{ board: ["Elvish Mystic", "Grizzly Bears"] }]);
  const caller = one(s, "Caller of the Hunt");
  await open(page, s);
  await card(page, "Caller of the Hunt", s).click();
  const types = modal(page);
  await expect(types).toContainText("Caller of the Hunt: choose a creature type");
  await types.locator('button[data-type="Elf"]').first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[caller]!.zone === "battlefield");
  expect(after.objects[caller]!.chosen?.type).toBe("Elf");
  expect(`${power(after, after.objects[caller]!)}/${toughness(after, after.objects[caller]!)}`).toBe("2/2");
  expect(after.log.some((l) => l.text.includes("casts Caller of the Hunt, choosing Elf"))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Reap Intellect: X = 2, exile Lightning Bolt and Opt from Ana's hand, then her other Bolts", async ({ page }) => {
  const s = scene({ hand: ["Reap Intellect"], board: LANDS }, [{ hand: ["Lightning Bolt", "Lightning Bolt", "Opt", "Island"], yard: ["Lightning Bolt"], library: ["Opt"] }]);
  const bolts = idsOf(s, "Lightning Bolt", "hand", 1);
  const [yardBolt, handOpt, libOpt, island] = [idsOf(s, "Lightning Bolt", "graveyard", 1)[0]!, idsOf(s, "Opt", "hand", 1)[0]!, idsOf(s, "Opt", "library", 1)[0]!, idsOf(s, "Island", "hand", 1)[0]!];
  await open(page, s);
  await card(page, "Reap Intellect", s).click();
  const x = page.locator(".x-pick");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const pick = modal(page);
  await expect(pick.locator(`[data-pick="${island}"]`)).toHaveClass(/dim/); // shown, not offered
  await pick.locator(`[data-pick="${bolts[0]}"]`).click();
  await pick.locator(`[data-pick="${handOpt}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0 && st.objects[handOpt]!.zone === "exile");
  const search = modal(page);
  await expect(search).toContainText("cards named Lightning Bolt or Opt");
  await search.locator(`[data-pick="${bolts[1]}"]`).click();
  await search.locator(`[data-pick="${yardBolt}"]`).click();
  await search.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0);
  expect([...bolts, yardBolt, handOpt].map((id) => after.objects[id]!.zone)).toEqual(["exile", "exile", "exile", "exile"]);
  // Left in the library (any number), and the land stays in her hand.
  expect(after.objects[libOpt]!.zone).toBe("library");
  expect(after.objects[island]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});

test("Deadly Cover-Up: collect evidence 6, the creatures die, exile Ana's Grizzly Bears, then the one in her hand: she draws one", async ({ page }) => {
  const s = scene({ hand: ["Deadly Cover-Up"], board: [...LANDS, "Llanowar Elves"], yard: ["Divination", "Divination", "Shock"] }, [{ board: ["Grizzly Bears"], hand: ["Grizzly Bears"] }]);
  const [cover, elves] = [one(s, "Deadly Cover-Up"), one(s, "Llanowar Elves")];
  const [d1, d2] = idsOf(s, "Divination", "graveyard", 0);
  const shock = one(s, "Shock");
  const fieldBears = idsOf(s, "Grizzly Bears", "battlefield", 1)[0]!;
  const handBears = idsOf(s, "Grizzly Bears", "hand", 1)[0]!;
  await open(page, s);
  await card(page, "Deadly Cover-Up", s).click();
  const ev = modal(page);
  await expect(ev).toContainText("Deadly Cover-Up: you may collect evidence 6");
  await ev.locator(`[data-pick="${d1}"]`).click();
  await ev.locator(`[data-pick="${d2}"]`).click();
  await ev.getByRole("button", { name: "Done" }).click();
  const mid = await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  expect(mid.objects[elves]!.zone).toBe("graveyard");
  expect(mid.objects[fieldBears]!.zone).toBe("graveyard");
  const pick = modal(page);
  // Only an opponent's graveyard: not your Shock or Elves.
  await expect(pick.locator(`[data-pick="${shock}"]`)).toHaveCount(0);
  await expect(pick.locator(`[data-pick="${elves}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${fieldBears}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0 && st.objects[fieldBears]!.zone === "exile");
  const search = modal(page);
  await expect(search).toContainText("cards named Grizzly Bears");
  await search.locator(`[data-pick="${handBears}"]`).click();
  await search.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[cover]!.zone === "graveyard");
  expect(after.objects[handBears]!.zone).toBe("exile");
  // One card exiled from her hand: she draws one.
  expect(after.players[1]!.hand.length).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});
