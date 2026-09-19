import { expect, test } from "vite-plus/test";
import { localeFrom, t } from "./i18n";

test("localeFrom maps zh* to Chinese and everything else to English", () => {
  expect(localeFrom("en")).toBe("en");
  expect(localeFrom("en-US")).toBe("en");
  expect(localeFrom("zh")).toBe("zh");
  expect(localeFrom("zh-CN")).toBe("zh");
  expect(localeFrom("zh-Hant")).toBe("zh");
});

test("fixed chrome and knobs translate; English keeps param keys", () => {
  expect(t("scene", "en")).toBe("Scene");
  expect(t("scene", "zh")).toBe("场景");
  expect(t("vfov", "en")).toBe("vfov");
  expect(t("vfov", "zh")).toBe("垂直视场");
  expect(t("focus", "zh")).toBe("对焦距离");
  expect(t("aperture", "zh")).toBe("光圈");
  expect(t("exposure", "zh")).toBe("曝光");
  expect(t("bounce", "zh")).toBe("反弹次数");
  expect(t("env", "zh")).toBe("环境光");
  expect(t("spp", "zh")).toBe("每像素采样");
  expect(t("fps", "zh")).toBe("帧率");
});
