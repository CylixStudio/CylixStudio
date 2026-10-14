const srcRoot = new URL("../src/", import.meta.url);

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    return nextResolve(new URL(`${specifier.slice(2)}.ts`, srcRoot).href, context);
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  const text = decodeURIComponent(String(url)).split("?")[0].split("#")[0];
  if (/\.(png|svg|jpe?g|webp)$/i.test(text)) {
    return { format: "module", shortCircuit: true, source: "export default 'asset';\n" };
  }
  return nextLoad(url, context);
}
