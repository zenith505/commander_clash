// Arranging cards in your graveyard (CR 404.3): cards put there at the same time, in the order you choose, when a
// card in the game cares about the order (Soldevi Digger here); and "reorder your graveyard as you choose".
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, resolveUntil } from "./ui";

test("Wrath of God: arrange your creatures in your graveyard with the arrows, then Wrath of God goes on top", async ({ page }) => {
  const s = scene({ hand: ["Wrath of God"], board: [...LANDS, "Soldevi Digger", "Grizzly Bears", "Hill Giant", "Llanowar Elves"] });
  const [bears, giant, elves, wrath] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Llanowar Elves"), one(s, "Wrath of God")];
  await open(page, s);
  await card(page, "Wrath of God", s).click();
  const st = await resolveUntil(page, (x) => x.pending?.kind === "orderGraveyard");
  const arrange = page.locator(".modal.arrange");
  await expect(arrange).toContainText("put these 3 cards into your graveyard in any order");
  await expect(arrange).toContainText("Top of graveyard (leftmost on top)");
  const order = () => arrange.locator("[data-arrange]").evaluateAll((els) => els.map((e) => e.getAttribute("data-arrange")));
  const start = st.pending?.kind === "orderGraveyard" ? st.pending.cards : [];
  expect(new Set(await order())).toEqual(new Set([bears, giant, elves]));
  expect(await order()).toEqual(start);
  // Move the top card one deeper, then the same card again: it ends at the bottom of the three.
  const first = start[0]!;
  const cardBox = () => arrange.locator(".arrange-card", { has: page.locator(`[data-arrange="${first}"]`) });
  await cardBox().getByRole("button", { name: "Move deeper" }).click();
  await cardBox().getByRole("button", { name: "Move deeper" }).click();
  const chosen = [start[1]!, start[2]!, first];
  expect(await order()).toEqual(chosen);
  await arrange.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0);
  // Top first: Wrath of God, then the creatures in the chosen order.
  expect([...after.players[0]!.graveyard].reverse()).toEqual([wrath, ...chosen]);
  expect(pageErrors(page)).toEqual([]);
});

test("Fossil Find: a random card comes back, then reorder your whole graveyard", async ({ page }) => {
  const s = scene({ hand: ["Fossil Find"], board: LANDS, yard: ["Grizzly Bears", "Shock", "Hill Giant", "Llanowar Elves"] });
  await open(page, s);
  await card(page, "Fossil Find", s).click();
  const st = await resolveUntil(page, (x) => x.pending?.kind === "orderGraveyard");
  const arrange = page.locator(".modal.arrange");
  await expect(arrange).toContainText("Fossil Find: reorder your graveyard as you choose");
  const start = st.pending?.kind === "orderGraveyard" ? st.pending.cards : [];
  expect(start).toHaveLength(3);
  const last = start[2]!;
  await arrange.locator(".arrange-card", { has: page.locator(`[data-arrange="${last}"]`) }).getByRole("button", { name: "Move toward the top" }).click();
  await arrange.locator(".arrange-card", { has: page.locator(`[data-arrange="${last}"]`) }).getByRole("button", { name: "Move toward the top" }).click();
  await arrange.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0);
  expect([...after.players[0]!.graveyard].reverse()).toEqual([one(s, "Fossil Find"), last, start[0]!, start[1]!]);
  expect(Object.values(after.objects).filter((o) => o.owner === 0 && o.zone === "hand")).toHaveLength(1);
  expect(pageErrors(page)).toEqual([]);
});
