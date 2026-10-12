import { register } from "node:module";

await register(new URL("./command-match-hook.mjs", import.meta.url).href, {
  parentURL: import.meta.url,
});
