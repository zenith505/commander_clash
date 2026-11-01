// Lane B round 68: with two different Words shields waiting, the drawing player chooses which replaces the draw (CR 616.1).
import { expect, test } from "@playwright/test";
import { LANDS, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Words of Wilding and Words of Worship: you choose which replaces the draw; the other replaces the next one", async ({ page }) => {
  const s = scene({ hand: ["Divination"], board: [...LANDS, "Words of Wilding", "Words of Worship"] });
  // Both Words activated this turn: one shield each (Player.nextDrawInstead).
  s.players[0]!.nextDrawInstead = [
    { turn: s.turn, source: "Words of Wilding", token: { name: "Bear", power: 2, toughness: 2, colors: ["G"], types: ["Creature"], subtypes: ["Bear"], keywords: [] } },
    { turn: s.turn, source: "Words of Worship", gain: 5 },
  ];
  const life = s.players[0]!.life;
  const hand = s.players[0]!.hand.length;
  await open(page, s);
  await card(page, "Divination", s).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "drawInstead" && st.pending.player === 0);
  expect(asked.pending).toMatchObject({ kind: "drawInstead", left: 1 });
  const bar = controls(page);
  await expect(bar).toContainText("Replace this draw:");
  await expect(bar).toContainText("(1 more draw after this)");
  await expect(bar.getByRole("button", { name: "Create a 2/2 Bear token (Words of Wilding)" })).toHaveCount(1);
  await bar.getByRole("button", { name: "Gain 5 life (Words of Worship)" }).click();
  // The second draw takes the Bear shield, with nothing more to choose.
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0);
  expect(after.players[0]!.life).toBe(life + 5);
  expect(after.battlefield.filter((id) => after.objects[id]!.isToken && after.cards[after.objects[id]!.cardId]!.name.startsWith("Bear"))).toHaveLength(1);
  // Divination left the hand; no card was drawn.
  expect(after.players[0]!.hand.length).toBe(hand - 1);
  expect(after.players[0]!.nextDrawInstead).toBeUndefined();
  expect(pageErrors(page)).toEqual([]);
});

test("Tomorrow, Azami's Familiar: each draw keeps one of the top three and you order the other two on the bottom", async ({ page }) => {
  const s = scene({ hand: ["Divination"], board: [...LANDS, "Tomorrow, Azami's Familiar"], library: ["Goblin Piker", "Hill Giant", "Grizzly Bears", "Craw Wurm", "Llanowar Elves", "Lightning Bolt"] });
  await open(page, s);
  await card(page, "Divination", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "drawLook");
  const bar = controls(page);
  await expect(bar).toContainText("on the bottom of your library in any order");
  await bar.getByRole("button", { name: "Hill Giant to hand", exact: true }).click();
  // The other two go to the bottom, in the order you choose.
  const ordering = await resolveUntil(page, (st) => st.pending?.kind === "orderLibrary");
  expect(ordering.pending).toMatchObject({ kind: "orderLibrary", bottom: true });
  const arrange = page.locator(".modal.arrange");
  await expect(arrange).toContainText("Goblin Piker");
  await expect(arrange).toContainText("Grizzly Bears");
  await arrange.getByRole("button", { name: "Done" }).click();
  // Divination's second draw looks at the next three.
  await resolveUntil(page, (st) => st.pending?.kind === "drawLook" && st.pending.cards.length === 3 && st.pending.cards.every((id) => st.objects[id]!.zone === "library"));
  await expect(bar.getByRole("button", { name: "Craw Wurm to hand", exact: true })).toBeVisible();
  await bar.getByRole("button", { name: "Lightning Bolt to hand", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "orderLibrary");
  await page.locator(".modal.arrange").getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  const names = (ids: string[]) => ids.map((id) => after.cards[after.objects[id]!.cardId]!.name);
  expect(names(after.players[0]!.hand).sort()).toEqual(["Hill Giant", "Lightning Bolt"]);
  expect(names(after.players[0]!.graveyard)).toEqual(["Divination"]);
  // The four looked-at cards not kept are now the bottom four.
  expect(names(after.players[0]!.library.slice(-4)).sort()).toEqual(["Craw Wurm", "Goblin Piker", "Grizzly Bears", "Llanowar Elves"]);
  expect(pageErrors(page)).toEqual([]);
});
