import type { CameraMode } from "./render/camera";
import {
  defaultsFor,
  DEV_PARAM_KEYS,
  formatParam,
  mergeParams,
  type DevParams,
} from "./render/params";
import { plugins } from "./scene";

export type Session = {
  scene: string;
  mode: CameraMode;
  params: DevParams;
  open: boolean;
};

function pluginOf(id: string | null): (typeof plugins)[number] {
  return plugins.find((item) => item.id === id) ?? plugins[0]!;
}

export function defaultSession(): Session {
  const plugin = plugins[0]!;
  return { scene: plugin.id, mode: "orbit", params: defaultsFor(plugin), open: false };
}

export function decodeSession(search: string): Session {
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const plugin = pluginOf(q.get("scene"));
  const patch: Partial<DevParams> = {};
  for (const key of DEV_PARAM_KEYS) {
    const raw = q.get(key);
    if (raw == null || raw === "") continue;
    const value = Number(raw);
    if (Number.isFinite(value)) patch[key] = value;
  }
  return {
    scene: plugin.id,
    mode: q.get("mode") === "fps" ? "fps" : "orbit",
    params: mergeParams(defaultsFor(plugin), patch),
    open: q.get("panel") === "1",
  };
}

export function encodeSession(session: Session): string {
  const q = new URLSearchParams();
  const plugin = pluginOf(session.scene);
  const base = defaultsFor(plugin);
  if (plugin.id !== plugins[0]!.id) q.set("scene", plugin.id);
  if (session.mode !== "orbit") q.set("mode", session.mode);
  for (const key of DEV_PARAM_KEYS) {
    if (session.params[key] === base[key]) continue;
    q.set(key, formatParam(key, session.params[key]));
  }
  if (session.open) q.set("panel", "1");
  return q.toString();
}

export function readSession(): Session {
  return decodeSession(location.search);
}

export function writeSession(session: Session): void {
  const search = encodeSession(session);
  const url = new URL(location.href);
  if (url.search.slice(1) === search) return;
  url.search = search;
  history.replaceState(null, "", url);
}
