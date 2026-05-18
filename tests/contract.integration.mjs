import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const contractAddressPattern = /^0x[a-fA-F0-9]{40}$/;
const writeEndpointSamples = [
  ["create_case", ["Smoke Host", "Smoke Guest", "Smoke Property", "1 NGN", "Smoke terms"]],
  ["submit_host_claim", [999999999, "Smoke host claim", "Smoke host evidence"]],
  ["submit_guest_claim", [999999999, "Smoke guest claim", "Smoke guest evidence"]],
  ["request_verdict", [999999999]],
  ["accept_verdict", [999999999]],
  ["file_appeal", [999999999, "host", "Smoke appeal reason"]],
  ["resolve_appeal", [999999999]],
];

function parseEnvFile(fileName) {
  const filePath = path.join(repoRoot, fileName);
  if (!fs.existsSync(filePath)) return {};

  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const splitAt = line.indexOf("=");
        return [line.slice(0, splitAt), line.slice(splitAt + 1).replace(/^["']|["']$/g, "")];
      }),
  );
}

function getConfiguredAddress() {
  const localEnv = parseEnvFile(".env.local");

  return (
    process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
    localEnv.NEXT_PUBLIC_CONTRACT_ADDRESS ||
    ""
  );
}

function makeClient() {
  const account = process.env.TEST_ACCOUNT_PRIVATE_KEY
    ? createAccount(process.env.TEST_ACCOUNT_PRIVATE_KEY)
    : createAccount();

  return {
    account,
    client: createClient({ chain: studionet, account }),
  };
}

test("frontend contract address points at the deployed StudioNet contract", () => {
  const address = getConfiguredAddress();

  assert.ok(address, "Set NEXT_PUBLIC_CONTRACT_ADDRESS in .env.local before running contract tests");
  assert.match(address, contractAddressPattern);
});

test("deployed contract responds to get_case_count", async () => {
  const { client } = makeClient();
  const count = await client.readContract({
    address: getConfiguredAddress(),
    functionName: "get_case_count",
    args: [],
  });

  assert.equal(typeof Number(count), "number");
  assert.ok(Number.isFinite(Number(count)));
  assert.ok(Number(count) >= 0);
});

test("deployed contract accepts the frontend read/write entrypoints", async () => {
  const { account, client } = makeClient();
  const address = getConfiguredAddress();

  const missingCase = await client.readContract({
    address,
    functionName: "get_case",
    args: [999999999],
  });
  assert.equal(typeof missingCase, "string");

  for (const [functionName, args] of writeEndpointSamples) {
    await assert.doesNotReject(
      client.simulateWriteContract({
        account,
        address,
        functionName,
        args,
        leaderOnly: false,
      }),
      `${functionName} simulation should be accepted by deployed contract`,
    );
  }
});

test("optional write smoke creates and reads a real case", async (t) => {
  if (process.env.WRITE_CONTRACT_SMOKE !== "1") {
    t.skip("set WRITE_CONTRACT_SMOKE=1 to mutate the deployed StudioNet contract");
    return;
  }

  const { account, client } = makeClient();
  const address = getConfiguredAddress();
  const marker = `DwellDocket smoke ${Date.now()}`;
  const before = Number(
    await client.readContract({
      address,
      functionName: "get_case_count",
      args: [],
    }),
  );

  const hash = await client.writeContract({
    account,
    address,
    functionName: "create_case",
    args: [
      "Smoke Host",
      "Smoke Guest",
      `${marker} property`,
      "1 NGN",
      "Automated write smoke test. Safe to ignore.",
    ],
    value: 0n,
    leaderOnly: false,
  });

  await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.ACCEPTED,
    retries: 100,
    interval: 4000,
  });

  const after = Number(
    await client.readContract({
      address,
      functionName: "get_case_count",
      args: [],
    }),
  );

  assert.ok(after > before, `case count did not increase: before=${before}, after=${after}`);

  let createdCase = null;
  for (let id = before + 1; id <= after; id += 1) {
    const raw = await client.readContract({
      address,
      functionName: "get_case",
      args: [id],
    });
    if (typeof raw === "string" && raw.includes(marker)) {
      createdCase = JSON.parse(raw);
      break;
    }
  }

  assert.ok(createdCase, "could not find the smoke-test case after write");
  assert.equal(createdCase.host_name, "Smoke Host");
  assert.equal(createdCase.guest_name, "Smoke Guest");
  assert.equal(createdCase.status, "awaiting_claims");
});
