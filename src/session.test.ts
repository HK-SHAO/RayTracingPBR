import { expect, test } from "vite-plus/test";
import { defaultsFor } from "./render/params";
import { glass } from "./scene/plugins/glass";
import { decodeSession, defaultSession, encodeSession } from "./session";

test("empty search is the default view", () => {
  const session = defaultSession();
  expect(encodeSession(session)).toBe("");
  expect(decodeSession("")).toEqual(session);
});

test("unknown scene and junk keys fall back", () => {
  const session = decodeSession("?scene=nope&mode=fly&vfov=abc&foo=1");
  expect(session).toEqual(defaultSession());
});

test("roundtrip keeps non-default knobs and closed panel", () => {
  const session = {
    scene: "glass",
    mode: "fps" as const,
    params: { ...defaultsFor(glass), vfov: 50, bounce: 4, hideIbl: 0 },
    open: false,
  };
  const again = decodeSession(`?${encodeSession(session)}`);
  expect(again).toEqual(session);
});

test("knobs clamp to range", () => {
  const session = decodeSession("?scene=glass&vfov=400&bounce=0.4&hideIbl=0.2");
  expect(session.params.vfov).toBe(80);
  expect(session.params.bounce).toBe(0);
  expect(session.params.hideIbl).toBe(0);
});
