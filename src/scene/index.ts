import type { ScenePlugin } from "./types";
import { cornell } from "./plugins/cornell";
import { studio } from "./plugins/studio";
import { mis } from "./plugins/mis";
import { classic } from "./plugins/classic";
import { mirror } from "./plugins/mirror";
import { glass } from "./plugins/glass";

export const plugins: readonly ScenePlugin[] = [cornell, studio, mis, classic, mirror, glass];

export function pluginById(id: string): ScenePlugin {
  const found = plugins.find((p) => p.id === id);
  if (!found) throw new Error(`unknown scene ${id}`);
  return found;
}
