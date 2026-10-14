import { existsSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function withExtension(base) {
  if (existsSync(base)) return base;
  if (existsSync(`${base}.ts`)) return `${base}.ts`;
  if (existsSync(`${base}.tsx`)) return `${base}.tsx`;
  if (existsSync(resolvePath(base, "index.ts"))) return resolvePath(base, "index.ts");
  return `${base}.ts`;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const base = resolvePath(process.cwd(), "src", specifier.slice(2));
    return nextResolve(pathToFileURL(withExtension(base)).href, context);
  }
  if (specifier.startsWith(".") && context.parentURL) {
    const base = resolvePath(dirname(fileURLToPath(context.parentURL)), specifier);
    return nextResolve(pathToFileURL(withExtension(base)).href, context);
  }
  return nextResolve(specifier, context);
}
