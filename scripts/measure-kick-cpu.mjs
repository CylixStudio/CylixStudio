import { createPublicKey, generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { verifyKickSignature } from "../src/lib/webhooks/verify.server.ts";

const source = readFileSync(new URL("../src/lib/webhooks/verify.server.ts", import.meta.url), "utf8");
const pem = source.match(/-----BEGIN PUBLIC KEY-----[\s\S]+?-----END PUBLIC KEY-----/)?.[0];
if (!pem) throw new Error("builtin Kick public key not found");

const body = JSON.stringify({
  message_id: "11111111-1111-1111-1111-111111111111",
  content: "!points",
  broadcaster: { user_id: 42, username: "channel", channel_slug: "channel" },
  sender: { user_id: 7, username: "viewer", identity: { badges: [{ type: "subscriber" }] } },
});
const messageId = "evt-measure";
const timestamp = String(Math.floor(Date.now() / 1000));
const payload = `${messageId}.${timestamp}.${body}`;
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const signature = sign("RSA-SHA256", Buffer.from(payload), privateKey).toString("base64");

function cpuMs() {
  const usage = process.cpuUsage();
  return (usage.user + usage.system) / 1000;
}

const rounds = 200;
const rsaStart = cpuMs();
for (let i = 0; i < rounds; i++) {
  await verifyKickSignature({
    publicKeyPem: undefined,
    hmacSecret: undefined,
    messageId,
    timestamp,
    signature,
    rawBody: body,
  });
}
const rsaCpu = cpuMs() - rsaStart;

const keyStart = cpuMs();
for (let i = 0; i < rounds; i++) createPublicKey(pem);
const keyCpu = cpuMs() - keyStart;

const cached = createPublicKey(pem);
const cachedStart = cpuMs();
for (let i = 0; i < rounds; i++) cached.asymmetricKeyDetails;
const cachedCpu = cpuMs() - cachedStart;

const big = "x".repeat(20_000);
const logStart = cpuMs();
for (let i = 0; i < 200; i++) {
  JSON.stringify({
    messageId,
    eventType: "chat.message.sent",
    body: big,
  });
}
const logCpu = cpuMs() - logStart;

const slimStart = cpuMs();
for (let i = 0; i < 200; i++) {
  JSON.stringify({ messageId, eventType: "chat.message.sent", bodyBytes: big.length });
}
const slimCpu = cpuMs() - slimStart;

console.log(
  JSON.stringify(
    {
      rounds,
      rsaVerifyCpuMs: Number(rsaCpu.toFixed(2)),
      rsaVerifyPerCallMs: Number((rsaCpu / rounds).toFixed(3)),
      createPublicKeyCpuMs: Number(keyCpu.toFixed(2)),
      createPublicKeyPerCallMs: Number((keyCpu / rounds).toFixed(3)),
      cachedKeyTouchCpuMs: Number(cachedCpu.toFixed(2)),
      stringifyFull20kb200CpuMs: Number(logCpu.toFixed(2)),
      stringifyBytesOnly200CpuMs: Number(slimCpu.toFixed(2)),
    },
    null,
    2,
  ),
);
