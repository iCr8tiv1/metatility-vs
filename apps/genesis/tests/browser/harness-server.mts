import { createServer } from "node:http";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const harnessRoot = fileURLToPath(new URL(".", import.meta.url));
const appRoot = resolve(harnessRoot, "../..");
const port = Number(process.env.GENESIS_BROWSER_TEST_PORT ?? "4179");
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid local harness port.");

const built = await build({
  absWorkingDir: appRoot,
  entryPoints: [resolve(harnessRoot, "harness.tsx")],
  bundle: true, write: false, outdir: resolve(harnessRoot, ".generated"),
  format: "esm", platform: "browser", target: "es2022", jsx: "automatic",
  tsconfig: resolve(appRoot, "tsconfig.json"), metafile: true,
  define: { "process.env.NODE_ENV": '"development"' },
  alias: {
    "@/app/actions/work": resolve(harnessRoot, "harness-actions.ts"),
    "@/app/actions/workforce": resolve(harnessRoot, "harness-actions.ts"),
    "@/app/actions/director": resolve(harnessRoot, "harness-actions.ts"),
    "next/link": resolve(harnessRoot, "harness-link.tsx"),
  },
});

// A mistaken import must fail this harness rather than bundle a real server
// action, client credential, or provider into a browser fixture.
if (Object.keys(built.metafile.inputs).some((path) => /(^|\/)app\/actions\/|(^|\/)lib\/supabase\/|runtime-server/.test(path))) {
  throw new Error("A production server module entered the browser fixture bundle.");
}
const assets = new Map(built.outputFiles.map((file) => [`/${basename(file.path)}`, file.contents]));
const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Genesis neutral component fixtures</title><link rel="stylesheet" href="/harness.css"></head><body><div id="root"></div><script type="module" src="/harness.js"></script></body></html>';

const server = createServer((request, response) => {
  const path = new URL(request.url ?? "/", `http://127.0.0.1:${port}`).pathname;
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "GET") { response.writeHead(405).end(); return; }
  if (path === "/") { response.setHeader("Content-Type", "text/html; charset=utf-8"); response.end(html); return; }
  const asset = assets.get(path);
  if (asset) {
    response.setHeader("Content-Type", path.endsWith(".css") ? "text/css; charset=utf-8" : "text/javascript; charset=utf-8");
    response.end(asset); return;
  }
  if (path === "/favicon.ico") { response.writeHead(204).end(); return; }
  response.writeHead(404).end("Fixture not found");
});
server.listen(port, "127.0.0.1", () => console.log(`Neutral Genesis component harness: http://127.0.0.1:${port}`));
for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, () => server.close(() => process.exit(0)));
