// Round 292's prompts: Jetsam lets you cast one spell from each opponent's graveyard (a pick that drops that graveyard's
// other cards once one is cast), and Guild Feud's "may put a creature card from among them onto the battlefield", your
// pick after the opponent's, then the two creatures fight.
import { expect, test } from "@playwright/test";
import { applyAction, botActions, waitingOn, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

test("Jetsam: cast a spell from each opponent's graveyard without paying its mana cost, one from each", async ({ page }) => {
  const s = scene({ hand: ["Flotsam // Jetsam"], board: LANDS }, [{ yard: ["Divination", "Grizzly Bears"] }, { yard: ["Counsel of the Soratami"] }]);
  const [divination, bears, counsel] = [one(s, "Divination"), one(s, "Grizzly Bears"), one(s, "Counsel of the Soratami")];
  await open(page, s);
  await card(page, "Flotsam // Jetsam", s).click();
  await menu(page).getByRole("button", { name: /^Cast Jetsam/ }).click();
  const seen = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong");
  // Each opponent milled three cards first.
  expect(seen.players[1]!.graveyard).toHaveLength(5);
  const bar = controls(page);
  await expect(bar).toContainText("cast a spell from each opponent's graveyard (one from each) without paying its mana cost?");
  await expect(bar.getByRole("button", { name: /^Grizzly Bears/ })).toBeVisible();
  await bar.getByRole("button", { name: /^Divination/ }).click();
  await bar.getByRole("button", { name: "Cast it" }).click();
  // Nothing more from Ana's graveyard; Ben's spell is still offered.
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong" && !st.pending.options.includes(divination));
  await expect(bar.getByRole("button", { name: /^Grizzly Bears/ })).toHaveCount(0);
  await expect(bar.getByRole("button", { name: /^Counsel of the Soratami/ })).toBeVisible();
  await bar.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[divination]!.zone === "exile");
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(after.objects[counsel]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Guild Feud: after Ana puts a creature onto the battlefield, you may put one from your top three, and they fight", async ({ page }) => {
  // Ana draws once before your next upkeep: her top three then are Hill Giant and two lands.
  let s = scene({ board: ["Guild Feud", ...LANDS], library: ["Grizzly Bears", "Plains", "Island"] }, [{ library: ["Plains", "Hill Giant", "Swamp", "Mountain"] }]);
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  s = playUntil(s, (st) => st.activePlayer === 0 && st.step === "upkeep" && st.pending?.kind === "chooseTargets");
  s = applyAction(s, { type: "chooseTargets", player: 0, targets: [{ kind: "player", id: 1 }] });
  for (let i = 0; i < 40 && !(s.pending?.kind === "searchLibrary" && s.pending.player === 0); i++) {
    const pid = waitingOn(s)!;
    s = applyAction(s, s.pending ? botActions(s, pid)[0]! : { type: "passPriority", player: pid });
  }
  const at: GameState = s;
  expect(at.objects[giant]!.zone).toBe("battlefield");
  expect(at.pending).toMatchObject({ kind: "searchLibrary", player: 0, cards: [bears], min: 0, max: 1 });
  await open(page, at);
  const pick = modal(page);
  await expect(pick).toContainText("Guild Feud: put a creature card onto the battlefield");
  await expect(pick).toContainText("The rest go into your graveyard.");
  await pick.locator(`[data-pick="${bears}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone !== "library");
  // The 2/2 and the 3/3 fought: the Bears died, the Giant has 2 damage.
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(after.objects[giant]!.damage).toBe(2);
  expect(after.players[0]!.graveyard).toHaveLength(3);
  expect(pageErrors(page)).toEqual([]);
});
