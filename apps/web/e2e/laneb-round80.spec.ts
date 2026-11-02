// Lane B round B80: Fathom Trawl ("reveal cards from the top of your library until you reveal three nonland cards. Put
// the nonland cards revealed this way into your hand, then put the rest of the revealed cards on the bottom of your
// library in any order"): the lands revealed are ordered at the bottom in the arrange prompt.
import { expect, test } from "@playwright/test";
import { LANDS, open, pageErrors, scene } from "./scene";
import { card, resolveUntil } from "./ui";

test("Fathom Trawl: three nonland cards to your hand, then order the revealed lands on the bottom", async ({ page }) => {
  const s = scene({ hand: ["Fathom Trawl"], board: LANDS, library: ["Island", "Grizzly Bears", "Mountain", "Opt", "Shock"] });
  const [island, bears, mountain, opt, shock] = s.players[0]!.library.slice(0, 5);
  await open(page, s);
  await card(page, "Fathom Trawl", s).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "arrangeTop" && st.pending.player === 0);
  expect(asked.pending?.kind === "arrangeTop" && asked.pending.how).toBe("bottom");
  const order = asked.pending?.kind === "arrangeTop" ? asked.pending.cards : [];
  expect(new Set(order)).toEqual(new Set([island, mountain]));
  // Nothing has moved yet.
  expect(asked.objects[bears!]!.zone).toBe("library");
  const arrange = page.locator(".modal.arrange");
  await expect(arrange).toContainText("put 2 cards on the bottom of your library in any order");
  await arrange.locator(".arrange-card", { has: page.locator(`[data-arrange="${order[0]}"]`) }).getByRole("button", { name: "Move deeper" }).click();
  await arrange.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0);
  for (const id of [bears, opt, shock]) expect(after.objects[id!]!.zone).toBe("hand");
  expect(after.players[0]!.library.slice(-2)).toEqual([order[1], order[0]]);
  expect(pageErrors(page)).toEqual([]);
});
