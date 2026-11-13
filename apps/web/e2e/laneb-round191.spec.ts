// Lane B round B191 in the browser: Multiple Choice with X = 2 ("you may choose a player. They return a creature they
// control to its owner's hand"): you agree, choose Ana, and she returns her creature; and Ward of Bones keeping your
// creature spell out of reach while you control more creatures than its controller.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Multiple Choice: X = 2, Yes, choose Ana; she returns her Hill Giant to her hand", async ({ page }) => {
  const s = scene({ hand: ["Multiple Choice"], board: LANDS }, [{ board: ["Hill Giant"] }]);
  const [spell, giant] = [one(s, "Multiple Choice"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Multiple Choice", s).click();
  const x = page.locator(".x-pick");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await controls(page).getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "nthPlayer");
  await controls(page).getByRole("button", { name: "Ana", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "hand");
  expect(after.players[1]!.hand).toContain(giant);
  expect(after.objects[spell]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Ward of Bones: with more creatures than Ana, your Grizzly Bears can't be cast, your Opt still can", async ({ page }) => {
  const s = scene({ hand: ["Grizzly Bears", "Opt"], board: [...LANDS, "Hill Giant"] }, [{ board: ["Ward of Bones"] }]);
  await open(page, s);
  await expect(card(page, "Opt", s)).toHaveClass(/playable/);
  await expect(card(page, "Grizzly Bears", s)).not.toHaveClass(/playable/);
  const now = await state(page);
  expect(now.players[0]!.hand).toHaveLength(2);
  expect(pageErrors(page)).toEqual([]);
});
