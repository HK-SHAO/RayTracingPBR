const en = {
  hide: "Hide",
  open: "Open",
  scene: "Scene",
  camera: "Camera",
  orbit: "Orbit",
  fpsMode: "FPS",
  hintOrbit: "orbit drag · pinch / wheel",
  hintFps: "WASDQE · look · stick",
  path: "Path",
  off: "Off",
  on: "On",
  hintPathOn: "tap a pixel · esc",
  hintPathOff: "off",
  liftDown: "Down",
  liftUp: "Up",
  vfov: "vfov",
  focus: "focus",
  aperture: "aperture",
  exposure: "exposure",
  bounce: "bounce",
  env: "env",
  spp: "spp",
  fps: "fps",
} as const;

const zh = {
  hide: "收起",
  open: "打开",
  scene: "场景",
  camera: "相机",
  orbit: "环绕",
  fpsMode: "FPS",
  hintOrbit: "拖动环绕 · 捏合 / 滚轮",
  hintFps: "WASDQE · 视角 · 摇杆",
  path: "光路",
  off: "关",
  on: "开",
  hintPathOn: "点选像素 · Esc",
  hintPathOff: "关闭",
  liftDown: "下",
  liftUp: "上",
  vfov: "垂直视场",
  focus: "对焦距离",
  aperture: "光圈",
  exposure: "曝光",
  bounce: "反弹次数",
  env: "环境光",
  spp: "每像素采样",
  fps: "帧率",
} as const satisfies Record<keyof typeof en, string>;

export type Msg = keyof typeof en;
export type Locale = "en" | "zh";

export function localeFrom(tag: string): Locale {
  return tag.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export const locale: Locale = localeFrom(
  typeof navigator !== "undefined" ? navigator.language : "en",
);

function catalog(loc: Locale): Record<Msg, string> {
  return loc === "zh" ? zh : en;
}

export function t(key: Msg, loc: Locale = locale): string {
  return catalog(loc)[key];
}

export function bootI18n() {
  document.documentElement.lang = locale === "zh" ? "zh" : "en";
}
