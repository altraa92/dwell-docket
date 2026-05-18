# DwellDocket

> AI-powered shortlet deposit case resolution built on GenLayer

**GenLayer StudioNet case console**

---

## What It Does

DwellDocket lets hosts and guests organize shortlet deposit disputes into an onchain case file. Both parties submit claims and evidence, then GenLayer validators read the record and deliver a verdict. One appeal round is available before the result is locked permanently onchain.

**Flow:**
1. Host creates a case (property, deposit amount, lease terms)
2. Host submits their claim + evidence
3. Guest receives the Case ID, submits their side
4. Either party requests the AI verdict (5 validators, ~30–60 sec)
5. Losing party may file one appeal → appellate panel re-reads everything
6. Final verdict is sealed onchain — immutable, shareable, auditable

---

## Tech Stack

- **Frontend**: Next.js 14 (App Router) + TypeScript
- **Blockchain**: [GenLayer](https://genlayer.com) (AI-powered smart contracts)
- **Client lib**: `genlayer-js`
- **Hosting**: Vercel

---

## Local Development

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/dwell-docket.git
cd dwell-docket
npm install
```

### 2. Set up environment

```bash
cp .env.example .env.local
```

Edit `.env.local` and paste your deployed GenLayer contract address:

```
NEXT_PUBLIC_CONTRACT_ADDRESS=0xYOUR_CONTRACT_ADDRESS_HERE
```

### 3. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How to Use the Site

1. Open the app and make sure the header shows **StudioNet live**.
2. Click **Connect wallet** if you want writes to be signed by MetaMask.
3. Click **New dispute**.
4. Choose **Host** or **Guest**.
5. If you are starting the case, fill the property, deposit, parties, and agreement terms, then submit your claim and evidence.
6. Share the generated case ID with the other party.
7. The other party opens the same site, chooses their role, enters the case ID, and submits their side.
8. Once both sides are filed, request the AI verdict.
9. The losing party can accept the result or file the single appeal.

### Wallet / Signer

You can use the **Connect wallet** button in the header to connect MetaMask. The app switches MetaMask to GenLayer StudioNet and then uses that wallet address for write actions such as `create_case`, `submit_host_claim`, and `request_verdict`.

If no wallet is connected, the app falls back to a temporary browser-session signer created with `createAccount()`. StudioNet is gasless, so this fallback can still send writes.

Refreshing the browser creates a new fallback signer, but the contract data is not lost. Cases are loaded by case ID from the deployed contract. If you connect MetaMask again, writes use the wallet account again.

## Contract Smoke Tests

Read-only verification:

```bash
npm run test:contract
```

This checks that the configured frontend address is a valid StudioNet contract, that `get_case_count` and `get_case` respond, and that the write methods used by the UI are accepted by `simulateWriteContract` without mutating state.

Optional write smoke test:

```bash
npm run test:contract:write
```

This creates a real test case on the deployed StudioNet contract, then reads it back. Use it only when you are okay with adding a visible smoke-test case to the contract state.

## Submitting as a Contribution

1. Keep `.env.local`, `.next/`, `node_modules/`, and local logs out of git.
2. Run the checks:

```bash
npm run test:contract
npm run build
```

3. Commit the app, contract, tests, README, and config changes.
4. Push a branch to GitHub and open a pull request, or submit the GitHub repo link wherever the GenLayer contribution form asks for source code.
5. In the submission notes, include the project name, the deployed site URL, the configured GenLayer contract address, and the test commands above.

---

## Deploy to Vercel

### Option A — Vercel Dashboard (recommended)

1. Push this repo to GitHub
2. Go to [vercel.com/new](https://vercel.com/new) → import your repo
3. In **Environment Variables**, add:
   - `NEXT_PUBLIC_CONTRACT_ADDRESS` = your contract address
4. Click **Deploy**

### Option B — Vercel CLI

```bash
npm i -g vercel
vercel
# Follow prompts, then add env var:
vercel env add NEXT_PUBLIC_CONTRACT_ADDRESS
vercel --prod
```

---

## Project Structure

```
dwell-docket/
├── app/
│   ├── layout.tsx          # Root layout + metadata + SEO
│   └── page.tsx            # Full app (all screens in one file)
├── public/
│   └── favicon.svg         # App icon
├── .env.example            # Env variable template
├── .gitignore
├── next.config.mjs         # Webpack fallbacks for genlayer-js
├── package.json
├── tsconfig.json
└── vercel.json
```

---

## Contract Functions Used

| Function | Args | Description |
|---|---|---|
| `create_case` | host, guest, address, deposit, terms | Opens a new dispute case |
| `submit_host_claim` | case_id, claim, evidence | Host submits their side |
| `submit_guest_claim` | case_id, claim, evidence | Guest submits their side |
| `request_verdict` | case_id | Triggers the 5-validator AI panel |
| `accept_verdict` | case_id | Seals Round 1 verdict as final |
| `file_appeal` | case_id, party, reason | Files an appeal onchain |
| `resolve_appeal` | case_id | Triggers appellate panel (Round 2) |
| `get_case` | case_id | Reads full case state (returns JSON) |
| `get_case_count` | — | Returns total number of cases |

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | ✅ | Your deployed GenLayer contract address |

---

## License

MIT — build on it, fork it, remix it.
