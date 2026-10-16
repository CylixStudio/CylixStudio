import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const port = 9333;
const profile = "C:\\Users\\igopf\\AppData\\Local\\Temp\\cylix-commands-chrome";
const url = process.argv[2];
const out = process.argv[3];
const width = Number(process.argv[4] || 1650);
const height = Number(process.argv[5] || 927);

if (!url || !out) {
  console.error("usage: node capture.mjs url outfile width height");
  process.exit(1);
}

const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitJson() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return res.json();
    } catch {
      // chrome still starting
    }
    await sleep(250);
  }
  throw new Error("chrome debugging port did not open");
}

let id = 0;
function send(ws, method, params = {}) {
  const messageId = ++id;
  return new Promise((resolve, reject) => {
    const onMessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id !== messageId) return;
      ws.removeEventListener("message", onMessage);
      if (data.error) reject(new Error(JSON.stringify(data.error)));
      else resolve(data.result);
    };
    ws.addEventListener("message", onMessage);
    ws.send(JSON.stringify({ id: messageId, method, params }));
  });
}

try {
  const version = await waitJson();
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  const { targetId } = await send(ws, "Target.createTarget", { url: "about:blank" });
  const { webSocketDebuggerUrl } = await (
    await fetch(`http://127.0.0.1:${port}/json`)
  )
    .json()
    .then((list) => list.find((item) => item.id === targetId));
  ws.close();
  const page = new WebSocket(webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    page.addEventListener("open", resolve, { once: true });
    page.addEventListener("error", reject, { once: true });
  });
  await send(page, "Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 800,
  });
  await send(page, "Page.enable");
  await send(page, "Runtime.enable");
  await send(page, "Page.navigate", { url });
  let measured;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await sleep(500);
    measured = await send(page, "Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const text = document.body.innerText.slice(0, 400);
      const grid = document.querySelector("ul");
      const wrap = grid?.parentElement;
      const card = document.querySelector("article");
      const link = document.querySelector("article a");
      const cols = grid ? getComputedStyle(grid).gridTemplateColumns : "";
      const count = (cols.match(/px/g) || []).length;
      return {
        text,
        columns: count,
        template: cols,
        wrap: wrap ? Math.round(wrap.getBoundingClientRect().width) : 0,
        cardH: card ? Math.round(card.getBoundingClientRect().height) : 0,
        gap: grid ? Math.round(Number.parseFloat(getComputedStyle(grid).rowGap) || 0) : 0,
        articles: document.querySelectorAll("article").length,
        top: Math.round(document.querySelector("header")?.getBoundingClientRect().top ?? 0),
        bottom: Math.round(window.innerHeight - (document.querySelector("nav")?.getBoundingClientRect().bottom ?? window.innerHeight)),
        link: link ? getComputedStyle(link).color : "",
        scroll: document.documentElement.scrollHeight,
        client: document.documentElement.clientHeight,
        title: document.title,
      };
    })()`,
    });
    const value = measured.result?.value;
    if (value && !String(value.text).includes("جارٍ التحميل")) break;
  }
  const shot = await send(page, "Page.captureScreenshot", { format: "png" });
  writeFileSync(out, Buffer.from(shot.data, "base64"));
  console.log(JSON.stringify(measured.result.value, null, 2));
  console.log("saved", out);
  if (process.argv[6] === "exercise") {
    const exercise = await send(page, "Runtime.evaluate", {
      returnByValue: true,
      awaitPromise: true,
      expression: `(async () => {
        const setValue = (input, value) => {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
          setter.call(input, value);
          input.dispatchEvent(new Event("input", { bubbles: true }));
        };
        const wait = () => new Promise((resolve) => setTimeout(resolve, 120));
        const input = document.querySelector("input");
        setValue(input, "discord");
        await wait();
        const afterSearch = document.body.innerText.includes("!discord") && !document.body.innerText.includes("!demo1");
        setValue(input, "تجريبي 7");
        await wait();
        const bodySearch = document.body.innerText.includes("!demo7") && !document.body.innerText.includes("!demo1");
        setValue(input, "zzzz-no-command");
        await wait();
        const empty = document.body.innerText.includes("لا توجد أوامر مطابقة");
        setValue(input, "");
        await wait();
        const clickTab = async (label) => {
          [...document.querySelectorAll("button")].find((button) => button.textContent.includes(label))?.click();
          await wait();
        };
        await clickTab("الرسائل المؤقتة");
        const timers = document.body.innerText.includes("تابع البث");
        await clickTab("الأوامر الافتراضية");
        const defaults = document.body.innerText.includes("!lurk");
        await clickTab("الأوامر المخصصة");
        [...document.querySelectorAll("button")].find((button) => button.textContent.trim() === "2")?.click();
        await wait();
        const onPage2 = document.body.innerText.includes("!demo17") && document.querySelectorAll("article").length === 2;
        if (!navigator.clipboard) navigator.clipboard = {};
        navigator.clipboard.writeText = async () => {};
        const copy = document.querySelector("article button");
        const beforeClass = copy?.className || "";
        copy?.click();
        await new Promise((resolve) => setTimeout(resolve, 80));
        const copied = Boolean(copy) && copy.className !== beforeClass;
        return {
          afterSearch,
          bodySearch,
          empty,
          timers,
          defaults,
          onPage2,
          copied,
          articlesAfterPage: document.querySelectorAll("article").length,
          countLine: (document.body.innerText.match(/\\d+ أمر متاح/) || [""])[0],
          name: document.querySelector("header p")?.textContent || "",
        };
      })()`,
    });
    console.log("EXERCISE", JSON.stringify(exercise.result.value));
  }
  page.close();
} finally {
  chrome.kill();
}
