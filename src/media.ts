export const iblHdr = new URL("./assets/ibl/tokyo.hdr", import.meta.url);
export const dragonObj = new URL("./assets/meshes/Dragon_8K.obj", import.meta.url);
export const teapotObj = new URL("./assets/meshes/teapot.obj", import.meta.url);

async function fromFile(url: URL): Promise<Uint8Array> {
  const { readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  return new Uint8Array(await readFile(fileURLToPath(url)));
}

export async function readText(url: URL): Promise<string> {
  if (import.meta.env.MODE === "test") return new TextDecoder().decode(await fromFile(url));
  const res = await fetch(url);
  if (!res.ok) throw new Error(url.href);
  return res.text();
}

export async function readBytes(url: URL): Promise<Uint8Array> {
  if (import.meta.env.MODE === "test") return fromFile(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(url.href);
  return new Uint8Array(await res.arrayBuffer());
}
