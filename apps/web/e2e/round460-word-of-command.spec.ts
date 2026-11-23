// Round 460: Word of Command. You look at Ana's hand and choose a card (a secret choice), then make Ana cast it: the
// commanded cast prompt with you choosing its target and only her lands paying for it, its "Don't" button only when she
// can't cast it, and the "how?" pick for a card she could play as a land or cast (Sea Gate Restoration, on her turn).
import { expect, test } from "@playwright/test";
import { applyAction, planCast, waitingOn } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, clickPlayer, controls, resolveUntil } from "./ui";

test("Word of Command: choose Ana's Lightning Bolt; she casts it at Ben, paid with her Mountain", async ({ page }) => {
  const s = scene({ hand: ["Word of Command"], board: LANDS }, [{ hand: ["Lightning Bolt", "Grizzly Bears"], board: ["Mountain"] }]);
  const [word, bolt, bears, mtn] = [one(s, "Word of Command"), one(s, "Lightning Bolt"), one(s, "Grizzly Bears"), s.battlefield.find((id) => s.objects[id]!.controller === 1)!];
  await open(page, s);
  await card(page, "Word of Command", s).click();
  await clickPlayer(page, 1);
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "commandCard" && st.pending.player === 0);
  expect(asked.pending?.kind === "chooseOption" && asked.pending.options.sort()).toEqual([bolt, bears].sort());
  const bar = controls(page);
  await expect(bar).toContainText("choose a card from Ana's hand: you control Ana while Word of Command resolves, and they play it if able");
  await bar.getByRole("button", { name: "Lightning Bolt", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.how === "commanded" && st.pending.player === 1);
  const cmd = page.getByTestId("command-cast");
  await expect(cmd).toContainText("Ana casts Lightning Bolt if able");
  // She can cast it, so it can't be declined.
  await expect(cmd.getByRole("button", { name: /^Don't/ })).toHaveCount(0);
  await cmd.getByRole("button", { name: "Cast it", exact: true }).click();
  await clickPlayer(page, 2);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bolt]!.zone === "graveyard" && st.objects[word]!.zone === "graveyard");
  expect(after.players[2]!.life).toBe(37);
  expect(after.objects[mtn]!.tapped).toBe(true);
  expect(after.objects[bears]!.zone).toBe("hand");
  expect(after.resolveControls ?? []).toEqual([]);
  expect(pageErrors(page)).toEqual([]);
});

test("Word of Command: Ana can't cast Grizzly Bears without a Forest; it stays in her hand", async ({ page }) => {
  const s = scene({ hand: ["Word of Command"], board: LANDS }, [{ hand: ["Grizzly Bears"], board: ["Mountain"] }]);
  const [word, bears] = [one(s, "Word of Command"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Word of Command", s).click();
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "commandCard" && st.pending.player === 0);
  await controls(page).getByRole("button", { name: "Grizzly Bears", exact: true }).click();
  // Nothing to cast it with: no prompt, it resolves.
  const after = await resolveUntil(page, (st) => st.objects[word]!.zone === "graveyard");
  expect(after.log.some((e) => e.text === "Ana can't play the chosen card (Word of Command).")).toBe(true);
  expect(after.objects[bears]!.zone).toBe("hand");
  expect(after.resolveControls ?? []).toEqual([]);
  expect(pageErrors(page)).toEqual([]);
});

test("Word of Command: if her Mountain is tapped by the time she'd cast Lightning Bolt, Don't is offered", async ({ page }) => {
  let s = scene({ hand: ["Word of Command"], board: LANDS }, [{ hand: ["Lightning Bolt"], board: ["Mountain"] }]);
  const [word, bolt] = [one(s, "Word of Command"), one(s, "Lightning Bolt")];
  const mtn = s.battlefield.find((id) => s.objects[id]!.controller === 1)!;
  for (const a of planCast(s, 0, word, [{ kind: "player", id: 1 }])!) s = applyAction(s, a);
  s = playUntil(s, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "commandCard");
  s = applyAction(s, { type: "chooseOption", player: 0, choice: bolt });
  expect(s.pending?.kind === "castFree" && s.pending.how).toBe("commanded");
  // Not something that happens in a game (nothing taps it mid-resolution); the button is there so the prompt can't stall.
  s.objects[mtn]!.tapped = true;
  await open(page, s);
  const cmd = page.getByTestId("command-cast");
  await expect(cmd).toContainText("Ana casts Lightning Bolt if able");
  await expect(cmd.getByRole("button", { name: "Cast it", exact: true })).toBeDisabled();
  await cmd.getByRole("button", { name: /^Don't/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[word]!.zone === "graveyard");
  expect(after.objects[bolt]!.zone).toBe("hand");
  expect(after.resolveControls ?? []).toEqual([]);
  expect(pageErrors(page)).toEqual([]);
});

test("Word of Command on Ana's turn: she plays Sea Gate, Reborn as her land, untapped by paying 3 life", async ({ page }) => {
  const s0 = scene({ hand: ["Word of Command"], board: LANDS }, [{ hand: ["Sea Gate Restoration // Sea Gate, Reborn"], board: ["Island", "Island", "Island", "Island", "Island", "Island", "Island"] }]);
  const [word, gate] = [one(s0, "Word of Command"), one(s0, "Sea Gate Restoration")];
  // Ana's first main phase, the stack empty, and you have priority.
  let s = playUntil(s0, (st) => st.activePlayer === 1 && st.step === "main1" && !st.pending && st.stack.length === 0 && waitingOn(st) === 0);
  expect(s.objects[gate]!.zone).toBe("hand");
  const life = s.players[1]!.life;
  // Cast in the engine at instant speed during her turn; the page opens on your choice of card.
  for (const a of planCast(s, 0, word, [{ kind: "player", id: 1 }])!) s = applyAction(s, a);
  const asked = playUntil(s, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "commandCard");
  await open(page, asked);
  const bar = controls(page);
  // Her hand: Sea Gate Restoration and the card she drew. With seven Islands she could cast it, or play it as her land.
  expect(asked.pending?.kind === "chooseOption" && asked.pending.options).toContain(gate);
  await bar.locator("button", { hasText: "Sea Gate Restoration" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "commandPlay" && st.pending.player === 1);
  await expect(bar).toContainText("Ana plays Sea Gate Restoration (Word of Command): how?");
  await expect(bar.getByRole("button", { name: "Cast Sea Gate Restoration", exact: true })).toBeVisible();
  await bar.getByRole("button", { name: "Play Sea Gate, Reborn as a land" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 1);
  await bar.getByRole("button", { name: "Yes", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[gate]!.zone === "battlefield" && st.objects[word]!.zone === "graveyard");
  expect(after.objects[gate]!.tapped).toBe(false);
  expect(after.players[1]!.life).toBe(life - 3);
  expect(after.resolveControls ?? []).toEqual([]);
  expect(pageErrors(page)).toEqual([]);
});
