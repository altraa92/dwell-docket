"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

type BrowserEthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<any>;
  on?: (event: string, handler: (...args: any[]) => void) => void;
  removeListener?: (event: string, handler: (...args: any[]) => void) => void;
};

declare global {
  interface Window {
    ethereum?: BrowserEthereumProvider;
  }
}

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}` | undefined;
const CONTRACT_READY = Boolean(CONTRACT_ADDRESS);

function getContractAddress() {
  if (!CONTRACT_ADDRESS) {
    throw new Error("NEXT_PUBLIC_CONTRACT_ADDRESS is not configured.");
  }

  return CONTRACT_ADDRESS;
}

type Screen =
  | "home"
  | "role_select"
  | "create"
  | "my_claim"
  | "respond_claim"
  | "status"
  | "verdict"
  | "appeal"
  | "appeal_pending"
  | "final_verdict";

type CaseStatus =
  | "idle"
  | "waiting_other"
  | "ready_verdict"
  | "round1_complete"
  | "appeal_filed"
  | "final";

type Role = "host" | "guest" | null;

type IconName =
  | "arrow"
  | "check"
  | "copy"
  | "file"
  | "home"
  | "link"
  | "person"
  | "scale"
  | "shield"
  | "spark"
  | "sync";

const CURRENCIES = ["NGN", "USD", "GBP", "EUR", "KES", "GHS", "ZAR", "AED"];

interface CaseState {
  case_id: number;
  host_name: string;
  guest_name: string;
  property_address: string;
  deposit_amount: string;
  agreement_terms: string;
  host_claim: string;
  host_evidence: string;
  guest_claim: string;
  guest_evidence: string;
  status: string;
  round: number;
  round1_winner: string;
  round1_verdict: string;
  round1_reasoning: string;
  appeal_party: string;
  appeal_reason: string;
  winner: string;
  verdict: string;
  reasoning: string;
  appeal_outcome: string;
  appeal_address: string;
  is_final: boolean;
}

let sessionAccount: ReturnType<typeof createAccount> | null = null;
let connectedWalletAddress: `0x${string}` | null = null;
let connectedWalletProvider: BrowserEthereumProvider | null = null;

function getSessionAccount() {
  if (!sessionAccount) {
    sessionAccount = createAccount();
  }
  return sessionAccount;
}

function makeClient() {
  if (connectedWalletAddress && connectedWalletProvider) {
    const client = createClient({
      chain: studionet,
      account: connectedWalletAddress,
      provider: connectedWalletProvider,
    });
    return { client, account: { address: connectedWalletAddress } };
  }

  const account = getSessionAccount();
  const client = createClient({ chain: studionet, account });
  return { client, account };
}

async function switchWalletToStudioNet(provider: BrowserEthereumProvider) {
  const chainId = `0x${studionet.id.toString(16)}`;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    });
  } catch (err: any) {
    if (err?.code !== 4902) {
      throw err;
    }

    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId,
          chainName: studionet.name,
          nativeCurrency: studionet.nativeCurrency,
          rpcUrls: [...studionet.rpcUrls.default.http],
          blockExplorerUrls: studionet.blockExplorers?.default?.url
            ? [studionet.blockExplorers.default.url]
            : undefined,
        },
      ],
    });
  }
}

function shortAddress(address: string) {
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

async function writeContract(
  fn: string,
  args: (string | number | boolean | bigint)[],
): Promise<boolean> {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const { client } = makeClient();
      const contractAddress = getContractAddress();
      const hash = await client.writeContract({
        address: contractAddress,
        functionName: fn,
        args,
        leaderOnly: false,
      } as any);

      await client.waitForTransactionReceipt({
        hash,
        status: TransactionStatus.ACCEPTED,
        retries: 100,
        interval: 4000,
      });

      return true;
    } catch (err: any) {
      console.error(`writeContract ${fn} attempt ${attempt} failed:`, err?.message);
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 4000));
      }
    }
  }

  return false;
}

async function readCase(caseId: number): Promise<CaseState | null> {
  try {
    const { client } = makeClient();
    const contractAddress = getContractAddress();
    const result = await client.readContract({
      address: contractAddress,
      functionName: "get_case",
      args: [caseId],
    });
    const raw = result as string;
    if (!raw) return null;
    return JSON.parse(raw) as CaseState;
  } catch (err) {
    console.error("readCase failed:", err);
    return null;
  }
}

async function readCaseCount(): Promise<number> {
  try {
    const { client } = makeClient();
    const contractAddress = getContractAddress();
    const result = await client.readContract({
      address: contractAddress,
      functionName: "get_case_count",
      args: [],
    });
    return Number(result);
  } catch (err) {
    console.error("readCaseCount failed:", err);
    return 0;
  }
}

function getCaseStatus(state: CaseState): CaseStatus {
  if (state.status === "final") return "final";
  if (state.status === "appeal_filed") return "appeal_filed";
  if (state.status === "round1_complete") return "round1_complete";
  const hostFiled = Boolean(state.host_claim?.length);
  const guestFiled = Boolean(state.guest_claim?.length);
  if (hostFiled && guestFiled) return "ready_verdict";
  return "waiting_other";
}

function resolveWinner(cs: CaseState): "guest" | "host" {
  return cs.winner?.toLowerCase() === "host" ? "host" : "guest";
}

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24">
      {name === "arrow" && <path {...common} d="M5 12h14m-6-6 6 6-6 6" />}
      {name === "check" && <path {...common} d="m5 13 4 4L19 7" />}
      {name === "copy" && (
        <>
          <rect {...common} x="8" y="8" width="11" height="11" rx="2" />
          <path {...common} d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
        </>
      )}
      {name === "file" && <path {...common} d="M7 3h7l4 4v14H7zM14 3v5h5M9 13h6M9 17h5" />}
      {name === "home" && <path {...common} d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />}
      {name === "link" && <path {...common} d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1" />}
      {name === "person" && <path {...common} d="M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10z" />}
      {name === "scale" && <path {...common} d="M12 3v18M5 6h14M7 6l-4 7h8zm10 0-4 7h8zM8 21h8" />}
      {name === "shield" && <path {...common} d="M12 3 5 6v5c0 4.5 2.8 8.4 7 10 4.2-1.6 7-5.5 7-10V6z" />}
      {name === "spark" && <path {...common} d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM5 16l.7 2.1L8 19l-2.3.9L5 22l-.7-2.1L2 19l2.3-.9z" />}
      {name === "sync" && <path {...common} d="M21 12a9 9 0 0 1-14.8 6.9M3 12A9 9 0 0 1 17.8 5.1M17 5h2V3M7 19H5v2" />}
    </svg>
  );
}

function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 48 48" className="dd-logo-mark">
      <rect x="4" y="4" width="40" height="40" rx="8" fill="currentColor" opacity="0.12" />
      <path d="M13 28c6-9 12-9 18 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M18 24v-5m6 5v-8m6 8v-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M15 29c2 6 6 9 12 9s10-3 12-9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="24" cy="29" r="3.5" fill="currentColor" />
    </svg>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="dd-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("home");
  const [myRole, setMyRole] = useState<Role>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [caseId, setCaseId] = useState<number | null>(null);
  const [caseData, setCaseData] = useState<CaseState | null>(null);
  const [caseStatus, setCaseStatus] = useState<CaseStatus>("idle");
  const [statusChecking, setStatusChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<"not_yet" | "ready" | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [verdictCopied, setVerdictCopied] = useState(false);
  const [signerAddress, setSignerAddress] = useState("");
  const [signerMode, setSignerMode] = useState<"session" | "wallet">("session");
  const [walletError, setWalletError] = useState("");

  const [propertyAddress, setPropertyAddress] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [currency, setCurrency] = useState("NGN");
  const [hostName, setHostName] = useState("");
  const [guestName, setGuestName] = useState("");
  const [agreementTerms, setAgreementTerms] = useState("");

  const [myClaim, setMyClaim] = useState("");
  const [myEvidence, setMyEvidence] = useState("");
  const [appealReason, setAppealReason] = useState("");
  const [loadId, setLoadId] = useState("");

  useEffect(() => {
    setSignerAddress(getSessionAccount().address);
  }, []);

  const handleConnectWallet = useCallback(async () => {
    setWalletError("");

    const provider = window.ethereum;
    if (!provider) {
      setWalletError("No browser wallet found. Install MetaMask, then try again.");
      return;
    }

    try {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      const address = accounts?.[0] as `0x${string}` | undefined;
      if (!address) {
        setWalletError("No wallet account was returned.");
        return;
      }

      await switchWalletToStudioNet(provider);
      connectedWalletAddress = address;
      connectedWalletProvider = provider;
      setSignerAddress(address);
      setSignerMode("wallet");
    } catch (err: any) {
      setWalletError(err?.message || "Wallet connection failed.");
    }
  }, []);

  const handleDisconnectWallet = useCallback(() => {
    connectedWalletAddress = null;
    connectedWalletProvider = null;
    setSignerAddress(getSessionAccount().address);
    setSignerMode("session");
    setWalletError("");
  }, []);

  const reset = useCallback(() => {
    setScreen("home");
    setMyRole(null);
    setCaseId(null);
    setCaseData(null);
    setCaseStatus("idle");
    setStatusChecking(false);
    setCheckResult(null);
    setError("");
    setCopied(false);
    setVerdictCopied(false);
    setPropertyAddress("");
    setDepositAmount("");
    setCurrency("NGN");
    setHostName("");
    setGuestName("");
    setAgreementTerms("");
    setMyClaim("");
    setMyEvidence("");
    setAppealReason("");
    setLoadId("");
  }, []);

  const checkStatus = useCallback(async (id: number, navigate = true) => {
    setStatusChecking(true);
    const state = await readCase(id);
    setStatusChecking(false);

    if (!state) {
      setError("Could not read that case from the connected contract.");
      return;
    }

    setCaseId(id);
    setCaseData(state);
    const cs = getCaseStatus(state);
    setCaseStatus(cs);

    if (cs === "final") {
      setScreen("final_verdict");
    } else if (cs === "round1_complete") {
      setScreen("verdict");
    } else if (cs === "appeal_filed") {
      setScreen("appeal_pending");
    } else if (cs === "ready_verdict") {
      setCheckResult("ready");
      if (navigate) setScreen("status");
    } else {
      setCheckResult("not_yet");
      if (navigate) setScreen("status");
    }
  }, []);

  const handleCreateCase = async () => {
    if (!propertyAddress || !depositAmount || !hostName || !guestName || !agreementTerms) {
      setError("Complete every field before opening the case.");
      return;
    }

    setError("");
    setLoading(true);
    setLoadingMsg("Opening the dispute on StudioNet...");
    const countBefore = await readCaseCount();
    const ok = await writeContract("create_case", [
      hostName,
      guestName,
      propertyAddress,
      `${depositAmount} ${currency}`,
      agreementTerms,
    ]);

    if (!ok) {
      setError("The transaction did not land. Please try again.");
      setLoading(false);
      return;
    }

    setCaseId(countBefore + 1);
    setLoading(false);
    setScreen("my_claim");
  };

  const handleMyClaim = async () => {
    if (!myClaim || !myEvidence) {
      setError("Add both your claim and supporting evidence.");
      return;
    }
    if (!caseId) return;

    setError("");
    setLoading(true);
    setLoadingMsg("Sealing your claim onchain...");
    const fn = myRole === "host" ? "submit_host_claim" : "submit_guest_claim";
    const ok = await writeContract(fn, [caseId, myClaim, myEvidence]);

    if (!ok) {
      setError("The claim transaction failed. Please try again.");
      setLoading(false);
      return;
    }

    setLoading(false);
    await checkStatus(caseId);
  };

  const handleLoadToRespond = async () => {
    if (!myRole) {
      setError("Select Host or Guest first.");
      return;
    }

    const id = Number.parseInt(loadId, 10);
    if (Number.isNaN(id) || id < 1) {
      setError("Enter a valid case ID.");
      return;
    }

    setError("");
    setLoading(true);
    setLoadingMsg("Reading the case from StudioNet...");
    const state = await readCase(id);
    setLoading(false);

    if (!state) {
      setError("Case not found on the connected contract.");
      return;
    }

    setCaseId(id);
    setCaseData(state);

    if (state.status === "final") {
      setScreen("final_verdict");
      return;
    }
    if (state.status === "round1_complete") {
      setScreen("verdict");
      return;
    }
    if (state.status === "appeal_filed") {
      setScreen("appeal_pending");
      return;
    }

    const myClaimFiled = myRole === "host" ? Boolean(state.host_claim?.length) : Boolean(state.guest_claim?.length);
    if (myClaimFiled) {
      setCaseStatus(getCaseStatus(state));
      setScreen("status");
    } else {
      setScreen("respond_claim");
    }
  };

  const handleRespondClaim = async () => {
    if (!myClaim || !myEvidence) {
      setError("Add both your claim and supporting evidence.");
      return;
    }
    if (!caseId) return;

    setError("");
    setLoading(true);
    setLoadingMsg("Sealing your response onchain...");
    const fn = myRole === "host" ? "submit_host_claim" : "submit_guest_claim";
    const ok = await writeContract(fn, [caseId, myClaim, myEvidence]);

    if (!ok) {
      setError("The response transaction failed. Please try again.");
      setLoading(false);
      return;
    }

    setLoading(false);
    await checkStatus(caseId);
  };

  const handleHomeLoad = async () => {
    const id = Number.parseInt(loadId, 10);
    if (Number.isNaN(id) || id < 1) {
      setError("Enter a valid case ID.");
      return;
    }

    setError("");
    setLoading(true);
    setLoadingMsg("Checking case status...");
    await checkStatus(id);
    setLoading(false);
  };

  const handleRequestVerdict = async () => {
    if (!caseId) return;

    setError("");
    setLoading(true);
    setLoadingMsg("AI validators are reviewing both sides. This can take about a minute.");
    const ok = await writeContract("request_verdict", [caseId]);

    if (!ok) {
      setError("The verdict request failed. Please try again.");
      setLoading(false);
      return;
    }

    setLoadingMsg("Reading the verdict from the connected contract...");
    const state = await readCase(caseId);
    setLoading(false);
    if (!state) {
      setError("The verdict transaction landed, but the updated case could not be read yet. Check again in a moment.");
      return;
    }
    setCaseData(state);
    setScreen("verdict");
  };

  const handleAcceptVerdict = async () => {
    if (!caseId) return;

    setError("");
    setLoading(true);
    setLoadingMsg("Locking the verdict as final...");
    const ok = await writeContract("accept_verdict", [caseId]);

    if (!ok) {
      setError("Could not lock the verdict. Please try again.");
      setLoading(false);
      return;
    }

    const state = await readCase(caseId);
    setLoading(false);
    if (!state) {
      setError("The verdict was locked, but the updated case could not be read yet. Check again in a moment.");
      return;
    }
    setCaseData(state);
    setScreen("final_verdict");
  };

  const handleFileAppeal = async () => {
    if (!appealReason.trim()) {
      setError("Enter the grounds for appeal.");
      return;
    }
    if (!caseId || !myRole) return;

    setError("");
    setLoading(true);
    setLoadingMsg("Filing your appeal onchain...");
    const ok = await writeContract("file_appeal", [caseId, myRole, appealReason]);

    if (!ok) {
      setError("The appeal transaction failed. Please try again.");
      setLoading(false);
      return;
    }

    const state = await readCase(caseId);
    setLoading(false);
    if (!state) {
      setError("The appeal was filed, but the updated case could not be read yet. Check again in a moment.");
      return;
    }
    setCaseData(state);
    setScreen("appeal_pending");
  };

  const handleResolveAppeal = async () => {
    if (!caseId) return;

    setError("");
    setLoading(true);
    setLoadingMsg("The appellate panel is reviewing the record. This can take about a minute.");
    const ok = await writeContract("resolve_appeal", [caseId]);

    if (!ok) {
      setError("The appeal resolution failed. Please try again.");
      setLoading(false);
      return;
    }

    setLoadingMsg("Reading the final verdict from the connected contract...");
    const state = await readCase(caseId);
    setLoading(false);
    if (!state) {
      setError("The final review landed, but the updated case could not be read yet. Check again in a moment.");
      return;
    }
    setCaseData(state);
    setScreen("final_verdict");
  };

  const copyCaseId = () => {
    if (!caseId) return;
    void navigator.clipboard.writeText(String(caseId));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyVerdictLink = () => {
    const winner = caseData ? resolveWinner(caseData) : "guest";
    const txt = [
      `DwellDocket - Case #${caseId}`,
      `Verdict: ${winner === "guest" ? "Guest wins" : "Host wins"}`,
      `Ruling: ${caseData?.verdict || "No ruling text recorded."}`,
      `Site: ${window.location.origin}`,
    ].join("\n");
    void navigator.clipboard.writeText(txt);
    setVerdictCopied(true);
    setTimeout(() => setVerdictCopied(false), 2500);
  };

  const myLabel = myRole === "host" ? "Host" : "Guest";
  const otherLabel = myRole === "host" ? "Guest" : "Host";
  const myTagClass = myRole === "host" ? "dd-host-tag" : "dd-guest-tag";
  const knownRole = Boolean(myRole);

  return (
    <main className="dd-main">
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        :root {
          --paper: #081213;
          --paper-2: #101d20;
          --ink: #eef8f6;
          --ink-soft: #b4c9c5;
          --muted: #78908b;
          --line: #21383b;
          --line-dark: rgba(180, 226, 217, 0.16);
          --teal: #43d6c8;
          --teal-2: #9eece3;
          --red: #ff6b5f;
          --red-2: #ff958e;
          --brass: #f0b84d;
          --blue: #75bbff;
          --green: #84df8b;
          --white: #0c181b;
          --shadow: 0 28px 80px rgba(0, 0, 0, 0.42);
          --r: 8px;
        }

        body {
          background: var(--paper);
          color: var(--ink);
          font-family: "Avenir Next", "Segoe UI", system-ui, sans-serif;
        }

        .dd-main {
          min-height: 100vh;
          background:
            linear-gradient(115deg, rgba(67,216,200,0.12) 0 1px, transparent 1px 90px),
            linear-gradient(25deg, rgba(255,107,95,0.08) 0 1px, transparent 1px 120px),
            radial-gradient(circle at 22% 14%, rgba(67,216,200,0.18), transparent 28%),
            radial-gradient(circle at 85% 6%, rgba(240,184,77,0.12), transparent 24%),
            linear-gradient(180deg, #081213 0%, #0b1518 45%, #070d0f 100%);
          background-size: auto, auto, auto, auto, auto;
        }

        button, input, textarea, select { font: inherit; }
        button { border: 0; }

        .dd-nav {
          position: sticky;
          top: 0;
          z-index: 20;
          border-bottom: 1px solid var(--line-dark);
          background: rgba(8, 18, 19, 0.88);
          backdrop-filter: blur(18px);
        }

        .dd-nav-inner {
          max-width: 1180px;
          margin: 0 auto;
          min-height: 68px;
          padding: 0 22px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
        }

        .dd-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          color: var(--teal-2);
          cursor: pointer;
          min-width: 0;
        }

        .dd-brand-title {
          display: block;
          font-family: Georgia, serif;
          font-size: 1.02rem;
          font-weight: 700;
          line-height: 1.1;
          color: var(--ink);
        }

        .dd-brand-sub {
          display: block;
          margin-top: 2px;
          color: var(--muted);
          font-size: 0.72rem;
          text-transform: uppercase;
          letter-spacing: 0.12em;
        }

        .dd-nav-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .dd-connection {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 36px;
          border: 1px solid var(--line-dark);
          border-radius: 999px;
          padding: 0 12px;
          background: rgba(255,255,255,0.06);
          color: var(--ink-soft);
          font-family: "SFMono-Regular", Consolas, monospace;
          font-size: 0.72rem;
          white-space: nowrap;
        }

        .dd-connection-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--green);
          box-shadow: 0 0 0 4px rgba(38,118,79,0.12);
        }

        .dd-btn {
          min-height: 42px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border-radius: var(--r);
          padding: 0 16px;
          cursor: pointer;
          font-weight: 760;
          transition: transform 150ms ease, background 150ms ease, border-color 150ms ease, color 150ms ease;
        }

        .dd-btn:disabled {
          cursor: not-allowed;
          opacity: 0.56;
          transform: none;
        }

        .dd-btn-primary { background: var(--teal); color: #061112; }
        .dd-btn-primary:hover { background: var(--teal-2); transform: translateY(-1px); }
        .dd-btn-danger { background: var(--red); color: #120706; }
        .dd-btn-danger:hover { background: var(--red-2); transform: translateY(-1px); }
        .dd-btn-brass { background: var(--brass); color: #140e03; }
        .dd-btn-brass:hover { background: #946716; transform: translateY(-1px); }
        .dd-btn-outline {
          background: rgba(255,255,255,0.06);
          color: var(--ink);
          border: 1px solid var(--line-dark);
        }
        .dd-btn-outline:hover { border-color: rgba(180,226,217,0.34); transform: translateY(-1px); }
        .dd-btn-ghost {
          background: transparent;
          color: var(--ink-soft);
          min-height: 36px;
          padding: 0 10px;
        }
        .dd-btn-ghost:hover { color: var(--teal); }
        .dd-btn-full { width: 100%; }

        .dd-overlay {
          position: fixed;
          inset: 0;
          z-index: 50;
          display: grid;
          place-items: center;
          padding: 22px;
          background: rgba(17,24,23,0.72);
          backdrop-filter: blur(10px);
        }

        .dd-overlay-box {
          width: min(420px, 100%);
          border: 1px solid rgba(255,255,255,0.14);
          border-radius: 8px;
          padding: 28px;
          background: #111817;
          color: white;
          box-shadow: var(--shadow);
          text-align: center;
        }

        @keyframes sealPulse {
          0%, 100% { transform: scale(1); opacity: 0.9; }
          50% { transform: scale(1.05); opacity: 1; }
        }

        .dd-loader-mark {
          display: inline-grid;
          place-items: center;
          width: 62px;
          height: 62px;
          margin-bottom: 16px;
          border-radius: 8px;
          background: rgba(13,107,99,0.18);
          color: #8dd8ce;
          animation: sealPulse 1.4s ease-in-out infinite;
        }

        .dd-overlay-msg {
          margin: 0 0 8px;
          line-height: 1.5;
          font-weight: 720;
        }

        .dd-overlay-sub {
          margin: 0;
          color: rgba(255,255,255,0.58);
          font-size: 0.84rem;
        }

        .dd-shell {
          max-width: 1180px;
          margin: 0 auto;
          padding: 34px 22px 56px;
        }

        .dd-page-head {
          margin-bottom: 22px;
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 16px;
        }

        .dd-kicker {
          color: var(--teal);
          font-size: 0.74rem;
          font-weight: 850;
          letter-spacing: 0.13em;
          text-transform: uppercase;
        }

        .dd-title {
          margin: 6px 0 0;
          font-family: Georgia, serif;
          font-size: clamp(2rem, 6vw, 4.7rem);
          line-height: 0.96;
          max-width: 820px;
        }

        .dd-subtitle {
          margin: 14px 0 0;
          max-width: 660px;
          color: var(--ink-soft);
          line-height: 1.7;
          font-size: 1rem;
        }

        .dd-dashboard {
          display: grid;
          grid-template-columns: minmax(0, 1.25fr) minmax(320px, 0.75fr);
          gap: 18px;
          align-items: start;
        }

        .dd-panel {
          border: 1px solid var(--line-dark);
          border-radius: 8px;
          background: rgba(12,24,27,0.78);
          box-shadow: 0 12px 44px rgba(0,0,0,0.26);
        }

        .dd-intake-panel {
          min-height: 420px;
          padding: clamp(22px, 4vw, 38px);
          background:
            linear-gradient(135deg, rgba(67,216,200,0.16), transparent 46%),
            linear-gradient(315deg, rgba(255,107,95,0.12), transparent 42%),
            rgba(12,24,27,0.86);
        }

        .dd-intake-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 26px;
        }

        .dd-ledger {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 1px;
          margin-top: 34px;
          overflow: hidden;
          border: 1px solid var(--line-dark);
          border-radius: 8px;
          background: var(--line-dark);
        }

        .dd-ledger-cell {
          min-height: 108px;
          padding: 18px;
          background: rgba(13,29,32,0.92);
        }

        .dd-ledger-num {
          color: var(--ink);
          font-family: Georgia, serif;
          font-size: 1.8rem;
          font-weight: 700;
        }

        .dd-ledger-label {
          margin-top: 6px;
          color: var(--muted);
          font-size: 0.8rem;
          line-height: 1.45;
        }

        .dd-side-stack {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .dd-lookup-panel,
        .dd-contract-panel {
          padding: 20px;
        }

        .dd-panel-label {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--teal-2);
          font-size: 0.78rem;
          font-weight: 860;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .dd-panel-title {
          margin: 12px 0 8px;
          font-family: Georgia, serif;
          font-size: 1.5rem;
          line-height: 1.1;
        }

        .dd-panel-copy {
          margin: 0 0 18px;
          color: var(--ink-soft);
          line-height: 1.6;
          font-size: 0.92rem;
        }

        .dd-lookup-row {
          display: flex;
          gap: 8px;
        }

        .dd-input,
        .dd-textarea,
        .dd-select {
          width: 100%;
          border: 1px solid rgba(180,226,217,0.18);
          border-radius: 8px;
          background: rgba(255,255,255,0.06);
          color: var(--ink);
          outline: none;
          transition: border-color 150ms ease, box-shadow 150ms ease, background 150ms ease;
        }

        .dd-input,
        .dd-select {
          min-height: 44px;
          padding: 0 13px;
        }

        .dd-textarea {
          min-height: 116px;
          padding: 12px 13px;
          line-height: 1.58;
          resize: vertical;
        }

        .dd-input:focus,
        .dd-textarea:focus,
        .dd-select:focus {
          border-color: var(--teal);
          box-shadow: 0 0 0 4px rgba(13,107,99,0.12);
          background: rgba(255,255,255,0.09);
        }

        .dd-contract-line {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-top: 16px;
          padding: 12px;
          border: 1px solid var(--line-dark);
          border-radius: 8px;
          background: rgba(255,255,255,0.045);
          color: var(--ink-soft);
          font-family: "SFMono-Regular", Consolas, monospace;
          font-size: 0.76rem;
        }

        .dd-flow {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
          margin-top: 18px;
        }

        .dd-step {
          border: 1px solid var(--line-dark);
          border-radius: 8px;
          padding: 16px;
          background: rgba(12,24,27,0.72);
        }

        .dd-step-num {
          color: var(--red);
          font-family: "SFMono-Regular", Consolas, monospace;
          font-size: 0.78rem;
          font-weight: 800;
        }

        .dd-step-title {
          margin: 10px 0 5px;
          font-weight: 820;
        }

        .dd-step-copy {
          margin: 0;
          color: var(--muted);
          line-height: 1.5;
          font-size: 0.82rem;
        }

        .dd-form-wrap,
        .dd-verdict-screen {
          max-width: 760px;
          margin: 0 auto;
        }

        .dd-form-hdr {
          margin-bottom: 18px;
        }

        .dd-form-title {
          margin: 6px 0 8px;
          font-family: Georgia, serif;
          font-size: clamp(2rem, 5vw, 3.4rem);
          line-height: 1;
        }

        .dd-form-sub {
          margin: 0;
          color: var(--ink-soft);
          line-height: 1.65;
        }

        .dd-card {
          border: 1px solid var(--line-dark);
          border-radius: 8px;
          padding: clamp(18px, 4vw, 26px);
          background: rgba(12,24,27,0.82);
          box-shadow: 0 16px 50px rgba(0,0,0,0.28);
        }

        .dd-card + .dd-card,
        .dd-vcard + .dd-vcard {
          margin-top: 14px;
        }

        .dd-field {
          display: flex;
          flex-direction: column;
          gap: 7px;
          color: var(--ink-soft);
          font-size: 0.78rem;
          font-weight: 830;
          letter-spacing: 0.07em;
          text-transform: uppercase;
        }

        .dd-field + .dd-field,
        .dd-field-row + .dd-field,
        .dd-field + .dd-field-row {
          margin-top: 15px;
        }

        .dd-field-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .dd-amount-row {
          display: grid;
          grid-template-columns: 106px 1fr;
          gap: 8px;
        }

        .dd-card-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 18px;
        }

        .dd-error {
          margin: 14px 0 0;
          border: 1px solid rgba(180,51,44,0.26);
          border-radius: 8px;
          padding: 10px 12px;
          background: rgba(180,51,44,0.08);
          color: var(--red-2);
          line-height: 1.45;
          font-size: 0.88rem;
        }

        .dd-role-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 16px;
        }

        .dd-role-card {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          min-height: 116px;
          border: 1px solid var(--line-dark);
          border-radius: 8px;
          padding: 16px;
          background: rgba(12,24,27,0.76);
          text-align: left;
          color: var(--ink);
          cursor: pointer;
        }

        .dd-role-card:hover,
        .dd-role-active-host,
        .dd-role-active-guest {
          border-color: var(--teal);
          box-shadow: 0 0 0 4px rgba(13,107,99,0.11);
        }

        .dd-role-icon {
          display: grid;
          place-items: center;
          width: 38px;
          height: 38px;
          border-radius: 8px;
          background: rgba(67,216,200,0.13);
          color: var(--teal);
          flex: 0 0 auto;
        }

        .dd-role-title {
          display: block;
          font-weight: 840;
          margin-bottom: 4px;
        }

        .dd-role-desc,
        .dd-role-check,
        .dd-path-desc {
          display: block;
          color: var(--muted);
          line-height: 1.45;
          font-size: 0.84rem;
        }

        .dd-role-check {
          color: var(--green);
          margin-top: 8px;
          font-weight: 800;
        }

        .dd-path-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .dd-path-card {
          border: 1px solid var(--line-dark);
          border-radius: 8px;
          padding: 16px;
          background: rgba(12,24,27,0.70);
        }

        .dd-path-label {
          margin-bottom: 8px;
          color: var(--teal-2);
          font-weight: 850;
        }

        .dd-path-desc {
          margin: 0 0 14px;
        }

        .dd-party-tag,
        .dd-id-badge,
        .dd-chip,
        .dd-chip-agree {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border-radius: 999px;
          padding: 4px 10px;
          font-family: "SFMono-Regular", Consolas, monospace;
          font-size: 0.76rem;
          font-weight: 800;
        }

        .dd-host-tag {
          border: 1px solid rgba(180,51,44,0.26);
          background: rgba(180,51,44,0.09);
          color: var(--red-2);
        }

        .dd-guest-tag {
          border: 1px solid rgba(38,93,131,0.26);
          background: rgba(38,93,131,0.09);
          color: var(--blue);
        }

        .dd-id-badge {
          border: 1px solid var(--line-dark);
          background: rgba(255,255,255,0.08);
          color: var(--ink);
        }

        .dd-dispute-context,
        .dd-share-box,
        .dd-ready-box,
        .dd-prev-verdict-box,
        .dd-appeal-pending-box {
          border: 1px solid var(--line-dark);
          border-radius: 8px;
          padding: 15px;
          background: rgba(255,255,255,0.045);
        }

        .dd-dispute-context + .dd-party-tag,
        .dd-prev-verdict-box + .dd-party-tag,
        .dd-ready-box + .dd-ready-box {
          margin-top: 15px;
        }

        .dd-context-label,
        .dd-share-label,
        .dd-status-label,
        .dd-prev-label,
        .dd-outcome-label {
          color: var(--muted);
          font-family: "SFMono-Regular", Consolas, monospace;
          font-size: 0.72rem;
          font-weight: 850;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .dd-details-grid {
          display: grid;
          grid-template-columns: 128px 1fr;
          gap: 9px 14px;
          margin-top: 12px;
        }

        .dd-dl {
          color: var(--muted);
          font-family: "SFMono-Regular", Consolas, monospace;
          font-size: 0.75rem;
        }

        .dd-dv {
          color: var(--ink-soft);
          line-height: 1.5;
          font-size: 0.9rem;
          overflow-wrap: anywhere;
        }

        .dd-share-id-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-top: 10px;
        }

        .dd-share-id-num {
          font-family: Georgia, serif;
          font-size: 2.6rem;
          line-height: 1;
        }

        .dd-instructions {
          margin: 15px 0 0;
          padding-left: 20px;
          color: var(--ink-soft);
          line-height: 1.7;
        }

        .dd-status-actions {
          margin-top: 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .dd-status-note {
          border-radius: 8px;
          padding: 12px;
          line-height: 1.55;
          font-size: 0.9rem;
        }

        .dd-waiting {
          border: 1px solid rgba(180,132,45,0.28);
          background: rgba(180,132,45,0.10);
          color: #77520f;
        }

        .dd-ready {
          border: 1px solid rgba(38,118,79,0.28);
          background: rgba(38,118,79,0.10);
          color: #1d5e3d;
        }

        .dd-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
          margin-top: 12px;
        }

        .dd-chip {
          border: 1px solid var(--line-dark);
          background: rgba(255,255,255,0.06);
          color: var(--ink-soft);
        }

        .dd-chip-agree {
          border: 1px solid rgba(38,118,79,0.26);
          background: rgba(38,118,79,0.10);
          color: var(--green);
        }

        .dd-verdict-banner {
          position: relative;
          overflow: hidden;
          border-radius: 8px;
          padding: clamp(24px, 5vw, 40px);
          color: white;
          background:
            linear-gradient(135deg, rgba(8,18,19,0.98), rgba(15,54,58,0.96)),
            var(--ink);
          box-shadow: var(--shadow);
        }

        .dd-verdict-banner::after {
          content: "";
          position: absolute;
          inset: 16px;
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 6px;
          pointer-events: none;
        }

        .dd-round-badge,
        .dd-final-badge {
          position: relative;
          z-index: 1;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border: 1px solid rgba(255,255,255,0.18);
          border-radius: 999px;
          padding: 6px 11px;
          color: rgba(255,255,255,0.78);
          font-family: "SFMono-Regular", Consolas, monospace;
          font-size: 0.74rem;
          font-weight: 850;
        }

        .dd-verdict-winner {
          position: relative;
          z-index: 1;
          margin-top: 22px;
          font-family: Georgia, serif;
          font-size: clamp(2.4rem, 7vw, 5rem);
          line-height: 0.96;
        }

        .dd-verdict-deposit {
          position: relative;
          z-index: 1;
          margin-top: 14px;
          max-width: 620px;
          color: rgba(255,255,255,0.78);
          line-height: 1.62;
        }

        .dd-verdict-cards {
          margin-top: 14px;
        }

        .dd-vcard {
          border: 1px solid var(--line-dark);
          border-radius: 8px;
          padding: 18px;
          background: rgba(12,24,27,0.82);
          box-shadow: 0 10px 34px rgba(0,0,0,0.24);
        }

        .dd-vcard h3 {
          margin: 0 0 10px;
          color: var(--teal-2);
          font-size: 0.78rem;
          font-weight: 880;
          letter-spacing: 0.09em;
          text-transform: uppercase;
        }

        .dd-vcard p {
          margin: 0;
          color: var(--ink-soft);
          line-height: 1.7;
        }

        .dd-appeal-actions {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-top: 14px;
        }

        .dd-appeal-note {
          margin: 0;
          color: var(--muted);
          line-height: 1.55;
          font-size: 0.88rem;
        }

        .dd-outcome-upheld {
          border-color: rgba(38,118,79,0.24);
          background: rgba(38,118,79,0.09);
        }

        .dd-outcome-overturned {
          border-color: rgba(180,132,45,0.26);
          background: rgba(180,132,45,0.11);
        }

        .dd-outcome-result {
          margin-bottom: 8px;
          font-weight: 850;
          color: var(--ink);
        }

        .dd-footer {
          max-width: 1180px;
          margin: 0 auto;
          padding: 22px;
          display: flex;
          justify-content: space-between;
          gap: 14px;
          border-top: 1px solid var(--line-dark);
          color: var(--muted);
          font-size: 0.82rem;
        }

        @media (max-width: 860px) {
          .dd-dashboard,
          .dd-flow,
          .dd-path-grid {
            grid-template-columns: 1fr;
          }

          .dd-ledger {
            grid-template-columns: 1fr;
          }

          .dd-page-head {
            align-items: flex-start;
            flex-direction: column;
          }
        }

        @media (max-width: 620px) {
          .dd-nav-inner {
            align-items: flex-start;
            flex-direction: column;
            padding-top: 14px;
            padding-bottom: 14px;
          }

          .dd-nav-actions {
            width: 100%;
            justify-content: flex-start;
          }

          .dd-connection {
            width: 100%;
            justify-content: center;
          }

          .dd-shell {
            padding: 24px 14px 42px;
          }

          .dd-role-grid,
          .dd-field-row,
          .dd-amount-row {
            grid-template-columns: 1fr;
          }

          .dd-lookup-row,
          .dd-share-id-row,
          .dd-card-actions {
            align-items: stretch;
            flex-direction: column;
          }

          .dd-details-grid {
            grid-template-columns: 1fr;
            gap: 4px;
          }

          .dd-title {
            font-size: 2.65rem;
          }
        }
      `}</style>

      <nav className="dd-nav">
        <div className="dd-nav-inner">
          <div
            className="dd-brand"
            onClick={reset}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") reset();
            }}
            role="button"
            tabIndex={0}
          >
            <Logo size={38} />
            <div>
              <span className="dd-brand-title">DwellDocket</span>
              <span className="dd-brand-sub">Deposit case console</span>
            </div>
          </div>
          <div className="dd-nav-actions">
            <div
              className="dd-connection"
              title={CONTRACT_READY ? "StudioNet contract configured" : "Set NEXT_PUBLIC_CONTRACT_ADDRESS in .env.local"}
            >
              <span className="dd-connection-dot" />
              {CONTRACT_READY ? "StudioNet live" : "Config needed"}
            </div>
            {signerMode === "wallet" ? (
              <button className="dd-btn dd-btn-outline" onClick={handleDisconnectWallet} title={signerAddress}>
                Wallet {shortAddress(signerAddress)}
              </button>
            ) : (
              <button className="dd-btn dd-btn-outline" onClick={handleConnectWallet}>
                Connect wallet
              </button>
            )}
            {screen !== "home" ? (
              <button className="dd-btn dd-btn-ghost" onClick={reset}>
                Back to desk
              </button>
            ) : (
              <button className="dd-btn dd-btn-primary" onClick={() => setScreen("role_select")}>
                New dispute <Icon name="arrow" />
              </button>
            )}
          </div>
        </div>
      </nav>

      {loading && (
        <div className="dd-overlay">
          <div className="dd-overlay-box">
            <div className="dd-loader-mark">
              <Logo size={42} />
            </div>
            <p className="dd-overlay-msg">{loadingMsg}</p>
            <p className="dd-overlay-sub">Keep this tab open while the transaction settles.</p>
          </div>
        </div>
      )}

      <div className="dd-shell">
        {screen === "home" && (
          <>
            <section className="dd-page-head">
              <div>
                <div className="dd-kicker">Connected to GenLayer StudioNet</div>
                <h1 className="dd-title">Shortlet deposit cases, tracked by AI validators.</h1>
                <p className="dd-subtitle">
                  Open a record, collect both sides, and route the evidence through the deployed GenLayer contract.
                </p>
              </div>
            </section>

            <section className="dd-dashboard">
              <div className="dd-panel dd-intake-panel">
                <div className="dd-panel-label">
                  <Icon name="scale" /> Case intake
                </div>
                <h2 className="dd-panel-title">Build the case file from either side.</h2>
                <p className="dd-panel-copy">
                  The first filing creates a case ID. The second party responds with that ID, then either side can trigger the validator decision.
                </p>
                <div className="dd-intake-actions">
                  <button className="dd-btn dd-btn-primary" onClick={() => setScreen("role_select")}>
                    File a new dispute <Icon name="arrow" />
                  </button>
                  <button className="dd-btn dd-btn-outline" onClick={() => setScreen("role_select")}>
                    Respond with case ID
                  </button>
                </div>

                <div className="dd-ledger">
                  <div className="dd-ledger-cell">
                    <div className="dd-ledger-num">01</div>
                    <div className="dd-ledger-label">Create the record with property, deposit, and agreement terms.</div>
                  </div>
                  <div className="dd-ledger-cell">
                    <div className="dd-ledger-num">02</div>
                    <div className="dd-ledger-label">Host and guest independently seal claims and evidence.</div>
                  </div>
                  <div className="dd-ledger-cell">
                    <div className="dd-ledger-num">03</div>
                    <div className="dd-ledger-label">Request Round 1, accept, or file a single appeal.</div>
                  </div>
                </div>
              </div>

              <div className="dd-side-stack">
                <div className="dd-panel dd-lookup-panel">
                  <div className="dd-panel-label">
                    <Icon name="file" /> Case lookup
                  </div>
                  <h2 className="dd-panel-title">Load an existing case.</h2>
                  <p className="dd-panel-copy">Check status, request a verdict, or review a final decision.</p>
                  <div className="dd-lookup-row">
                    <input
                      className="dd-input"
                      inputMode="numeric"
                      placeholder="Case ID"
                      value={loadId}
                      onChange={(e) => {
                        setLoadId(e.target.value);
                        setError("");
                      }}
                    />
                    <button className="dd-btn dd-btn-danger" onClick={handleHomeLoad}>
                      Check
                    </button>
                  </div>
                  {error && <p className="dd-error">{error}</p>}
                </div>

                <div className="dd-panel dd-contract-panel">
                  <div className="dd-panel-label">
                    <Icon name="link" /> Live contract
                  </div>
                  <h2 className="dd-panel-title">Connected case engine.</h2>
                  <p className="dd-panel-copy">Reads and writes use the deployed StudioNet contract configured in the public environment.</p>
                  <div className="dd-contract-line">
                    <span>Endpoint</span>
                    <span>{CONTRACT_READY ? "Configured" : "Missing env"}</span>
                  </div>
                  <div className="dd-contract-line">
                    <span>{signerMode === "wallet" ? "Wallet" : "Signer"}</span>
                    <span>{signerAddress ? shortAddress(signerAddress) : "Session signer"}</span>
                  </div>
                  <p className="dd-panel-copy" style={{ marginTop: 12, marginBottom: 0 }}>
                    {signerMode === "wallet"
                      ? "Wallet mode is active. Write actions will ask your wallet to sign and send the GenLayer transaction."
                      : "No wallet is connected. The app can still sign writes with a temporary browser-session signer, or you can connect MetaMask above."}
                  </p>
                  {walletError && <p className="dd-error" style={{ marginTop: 12 }}>{walletError}</p>}
                  <div className="dd-contract-line">
                    <span>Network</span>
                    <span>StudioNet</span>
                  </div>
                </div>
              </div>
            </section>

            <section className="dd-flow">
              {[
                ["1", "Role", "Pick Host or Guest before filing."],
                ["2", "Evidence", "Submit facts, messages, photos, receipts, and terms."],
                ["3", "Verdict", "Run the AI validator decision once both sides are in."],
                ["4", "Appeal", "One final review can uphold or overturn Round 1."],
              ].map(([n, title, copy]) => (
                <div className="dd-step" key={n}>
                  <div className="dd-step-num">Step {n}</div>
                  <div className="dd-step-title">{title}</div>
                  <p className="dd-step-copy">{copy}</p>
                </div>
              ))}
            </section>
          </>
        )}

        {screen === "role_select" && (
          <div className="dd-form-wrap">
            <div className="dd-form-hdr">
              <div className="dd-kicker">Before filing</div>
              <h2 className="dd-form-title">Choose your role.</h2>
              <p className="dd-form-sub">The selected role determines which claim method the frontend sends to the contract.</p>
            </div>

            <div className="dd-role-grid">
              <button
                className={`dd-role-card ${myRole === "host" ? "dd-role-active-host" : ""}`}
                onClick={() => {
                  setMyRole("host");
                  setError("");
                }}
              >
                <span className="dd-role-icon"><Icon name="home" /></span>
                <span>
                  <span className="dd-role-title">Host</span>
                  <span className="dd-role-desc">Property owner or manager</span>
                  {myRole === "host" && <span className="dd-role-check">Selected</span>}
                </span>
              </button>

              <button
                className={`dd-role-card ${myRole === "guest" ? "dd-role-active-guest" : ""}`}
                onClick={() => {
                  setMyRole("guest");
                  setError("");
                }}
              >
                <span className="dd-role-icon"><Icon name="person" /></span>
                <span>
                  <span className="dd-role-title">Guest</span>
                  <span className="dd-role-desc">Tenant or shortlet guest</span>
                  {myRole === "guest" && <span className="dd-role-check">Selected</span>}
                </span>
              </button>
            </div>

            {error && <p className="dd-error">{error}</p>}

            <div className="dd-path-grid">
              <div className="dd-path-card">
                <div className="dd-path-label">Open a case</div>
                <p className="dd-path-desc">Start the record and receive a case ID for the other party.</p>
                <button
                  className="dd-btn dd-btn-primary dd-btn-full"
                  onClick={() => {
                    if (!myRole) {
                      setError("Select Host or Guest first.");
                      return;
                    }
                    setError("");
                    setScreen("create");
                  }}
                >
                  Start new dispute <Icon name="arrow" />
                </button>
              </div>

              <div className="dd-path-card">
                <div className="dd-path-label">Respond to a case</div>
                <p className="dd-path-desc">Use the ID you received and submit your side.</p>
                <input
                  className="dd-input"
                  inputMode="numeric"
                  placeholder="Enter case ID"
                  value={loadId}
                  onChange={(e) => {
                    setLoadId(e.target.value);
                    setError("");
                  }}
                />
                <div className="dd-card-actions">
                  <button className="dd-btn dd-btn-outline dd-btn-full" onClick={handleLoadToRespond}>
                    Load and respond
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {screen === "create" && (
          <div className="dd-form-wrap">
            <div className="dd-form-hdr">
              <div className="dd-kicker">Step 1 of 2 - Filing as {myLabel}</div>
              <h2 className="dd-form-title">Open the dispute.</h2>
              <p className="dd-form-sub">These details become the shared case context for both parties and the validator review.</p>
            </div>

            <div className="dd-card">
              <Field label="Property address">
                <input
                  className="dd-input"
                  placeholder="12 Adewale Street, Lekki, Lagos"
                  value={propertyAddress}
                  onChange={(e) => setPropertyAddress(e.target.value)}
                />
              </Field>

              <Field label="Caution fee or deposit">
                <div className="dd-amount-row">
                  <select className="dd-select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <input
                    className="dd-input"
                    placeholder="150,000"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                  />
                </div>
              </Field>

              <div className="dd-field-row">
                <Field label="Host name">
                  <input className="dd-input" placeholder="Mr Bello" value={hostName} onChange={(e) => setHostName(e.target.value)} />
                </Field>
                <Field label="Guest name">
                  <input className="dd-input" placeholder="Miss Tunde" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
                </Field>
              </div>

              <Field label="Original agreement terms">
                <textarea
                  className="dd-textarea"
                  placeholder="Refund conditions, damage rules, checkout expectations, and any written agreement."
                  value={agreementTerms}
                  onChange={(e) => setAgreementTerms(e.target.value)}
                  rows={4}
                />
              </Field>

              {error && <p className="dd-error">{error}</p>}

              <div className="dd-card-actions">
                <button className="dd-btn dd-btn-primary dd-btn-full" onClick={handleCreateCase}>
                  Create case and continue <Icon name="arrow" />
                </button>
              </div>
            </div>
          </div>
        )}

        {screen === "my_claim" && (
          <div className="dd-form-wrap">
            <div className="dd-form-hdr">
              <div className="dd-kicker">Step 2 of 2 - Case #{caseId}</div>
              <h2 className="dd-form-title">{myLabel}&apos;s claim.</h2>
              <p className="dd-form-sub">Submit your side now. Share the case ID after your claim is sealed.</p>
            </div>

            <div className="dd-card">
              <span className={`dd-party-tag ${myTagClass}`}>
                <Icon name={myRole === "host" ? "home" : "person"} size={15} /> {myLabel}
              </span>

              <Field label="Your claim">
                <textarea
                  className="dd-textarea"
                  placeholder={
                    myRole === "host"
                      ? "Explain why the caution fee should be withheld."
                      : "Explain why the caution fee should be refunded."
                  }
                  value={myClaim}
                  onChange={(e) => setMyClaim(e.target.value)}
                  rows={4}
                />
              </Field>

              <Field label="Your evidence">
                <textarea
                  className="dd-textarea"
                  placeholder="List inspection notes, receipts, messages, photos, timestamps, and any other proof."
                  value={myEvidence}
                  onChange={(e) => setMyEvidence(e.target.value)}
                  rows={4}
                />
              </Field>

              {error && <p className="dd-error">{error}</p>}

              <div className="dd-card-actions">
                <button className="dd-btn dd-btn-primary dd-btn-full" onClick={handleMyClaim}>
                  Seal my claim <Icon name="shield" />
                </button>
              </div>
            </div>
          </div>
        )}

        {screen === "respond_claim" && caseData && (
          <div className="dd-form-wrap">
            <div className="dd-form-hdr">
              <div className="dd-kicker">Responding to Case #{caseId} - {myLabel}</div>
              <h2 className="dd-form-title">Submit your side.</h2>
              <p className="dd-form-sub">Review the case context, then seal your claim and evidence.</p>
            </div>

            <div className="dd-card">
              <div className="dd-dispute-context">
                <div className="dd-context-label">Dispute details</div>
                <div className="dd-details-grid">
                  <span className="dd-dl">Property</span><span className="dd-dv">{caseData.property_address}</span>
                  <span className="dd-dl">Amount</span><span className="dd-dv">{caseData.deposit_amount}</span>
                  <span className="dd-dl">Host</span><span className="dd-dv">{caseData.host_name}</span>
                  <span className="dd-dl">Guest</span><span className="dd-dv">{caseData.guest_name}</span>
                  <span className="dd-dl">Terms</span><span className="dd-dv">{caseData.agreement_terms}</span>
                </div>
              </div>

              <span className={`dd-party-tag ${myTagClass}`}>
                <Icon name={myRole === "host" ? "home" : "person"} size={15} /> {myLabel} response
              </span>

              <Field label="Your claim">
                <textarea
                  className="dd-textarea"
                  placeholder={
                    myRole === "guest"
                      ? "Explain why the caution fee should be refunded."
                      : "Explain why the caution fee should be withheld."
                  }
                  value={myClaim}
                  onChange={(e) => setMyClaim(e.target.value)}
                  rows={4}
                />
              </Field>

              <Field label="Your evidence">
                <textarea
                  className="dd-textarea"
                  placeholder="List the evidence the validators should consider."
                  value={myEvidence}
                  onChange={(e) => setMyEvidence(e.target.value)}
                  rows={4}
                />
              </Field>

              {error && <p className="dd-error">{error}</p>}

              <div className="dd-card-actions">
                <button className="dd-btn dd-btn-primary dd-btn-full" onClick={handleRespondClaim}>
                  Submit response <Icon name="shield" />
                </button>
              </div>
            </div>
          </div>
        )}

        {screen === "status" && (
          <div className="dd-form-wrap">
            {caseStatus === "waiting_other" && (
              <>
                <div className="dd-form-hdr">
                  <div className="dd-kicker">Case #{caseId} - Waiting</div>
                  <h2 className="dd-form-title">Claim sealed.</h2>
                  <p className="dd-form-sub">
                    {knownRole ? `Share this ID with the ${otherLabel}.` : "The other party has not responded yet."}
                  </p>
                </div>

                <div className="dd-card">
                  <div className="dd-share-box">
                    <div className="dd-share-label">Case ID</div>
                    <div className="dd-share-id-row">
                      <div className="dd-share-id-num">#{caseId}</div>
                      <button className="dd-btn dd-btn-outline" onClick={copyCaseId}>
                        <Icon name={copied ? "check" : "copy"} /> {copied ? "Copied" : "Copy ID"}
                      </button>
                    </div>
                  </div>

                  {knownRole && (
                    <ol className="dd-instructions">
                      <li>Send the ID to the {otherLabel}.</li>
                      <li>They select {otherLabel}, enter the ID, and respond.</li>
                      <li>Once both sides are in, request the validator verdict.</li>
                    </ol>
                  )}

                  <div className="dd-status-actions">
                    <button
                      className="dd-btn dd-btn-primary dd-btn-full"
                      disabled={statusChecking}
                      onClick={async () => {
                        setCheckResult(null);
                        if (caseId) await checkStatus(caseId);
                      }}
                    >
                      {statusChecking ? "Checking..." : `Check ${knownRole ? otherLabel : "other party"} response`}
                    </button>

                    {checkResult === "not_yet" && (
                      <div className="dd-status-note dd-waiting">
                        No response is recorded yet for the other party.
                      </div>
                    )}
                    {checkResult === "ready" && (
                      <div className="dd-status-note dd-ready">
                        Both sides are recorded. You can request the verdict.
                      </div>
                    )}
                  </div>

                  {error && <p className="dd-error">{error}</p>}
                </div>
              </>
            )}

            {caseStatus === "ready_verdict" && (
              <>
                <div className="dd-form-hdr">
                  <div className="dd-kicker">Case #{caseId} - Ready</div>
                  <h2 className="dd-form-title">Request the verdict.</h2>
                  <p className="dd-form-sub">Both sides are sealed. The next write call triggers the AI validator review.</p>
                </div>

                <div className="dd-card">
                  <div className="dd-ready-box">
                    <div className="dd-status-label">Validator round</div>
                    <p className="dd-panel-copy" style={{ marginTop: 8, marginBottom: 0 }}>
                      The contract reads both claims and evidence, then records a Round 1 winner, verdict, and reasoning.
                    </p>
                    <div className="dd-chips">
                      {["Independent review", "Majority outcome", "Appeal enabled", "Onchain record"].map((c) => (
                        <span key={c} className="dd-chip">{c}</span>
                      ))}
                    </div>
                  </div>

                  {error && <p className="dd-error">{error}</p>}

                  <div className="dd-card-actions">
                    <button className="dd-btn dd-btn-danger dd-btn-full" onClick={handleRequestVerdict}>
                      Request AI verdict <Icon name="spark" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {screen === "verdict" && caseData && (() => {
          const winner = resolveWinner(caseData);
          const iWon = myRole ? winner === myRole : false;

          return (
            <div className="dd-verdict-screen">
              <div className="dd-verdict-banner">
                <div className="dd-round-badge">
                  <Icon name="scale" size={15} /> Round 1 verdict - Case #{caseData.case_id}
                </div>
                <div className="dd-verdict-winner">{winner === "guest" ? "Guest wins" : "Host wins"}</div>
                <div className="dd-verdict-deposit">{caseData.verdict || "No verdict text was recorded."}</div>
              </div>

              <div className="dd-verdict-cards">
                <div className="dd-vcard">
                  <h3>Ruling</h3>
                  <p>{caseData.verdict || "No ruling text recorded."}</p>
                </div>

                <div className="dd-vcard">
                  <h3>Reasoning</h3>
                  <p>{caseData.reasoning || "No reasoning recorded."}</p>
                </div>

                <div className="dd-vcard">
                  <h3>Case details</h3>
                  <div className="dd-details-grid">
                    <span className="dd-dl">Property</span><span className="dd-dv">{caseData.property_address}</span>
                    <span className="dd-dl">Caution fee</span><span className="dd-dv">{caseData.deposit_amount}</span>
                    <span className="dd-dl">Host</span><span className="dd-dv">{caseData.host_name}</span>
                    <span className="dd-dl">Guest</span><span className="dd-dv">{caseData.guest_name}</span>
                  </div>
                </div>

                <div className="dd-vcard">
                  <h3>Next action</h3>
                  {!myRole && (
                    <div className="dd-appeal-actions">
                      <p className="dd-appeal-note">Select your role before accepting or appealing this verdict.</p>
                      <button
                        className="dd-btn dd-btn-outline dd-btn-full"
                        onClick={() => {
                          setLoadId(String(caseData.case_id));
                          setScreen("role_select");
                        }}
                      >
                        Select my role <Icon name="arrow" />
                      </button>
                    </div>
                  )}

                  {myRole && iWon && (
                    <div className="dd-status-note dd-ready">
                      You won Round 1. The other party may accept or file the single appeal.
                    </div>
                  )}

                  {myRole && !iWon && (
                    <div className="dd-appeal-actions">
                      <p className="dd-appeal-note">You lost Round 1. You can appeal once, or accept the result as final.</p>
                      <button className="dd-btn dd-btn-danger dd-btn-full" onClick={() => setScreen("appeal")}>
                        File appeal <Icon name="sync" />
                      </button>
                      <button className="dd-btn dd-btn-primary dd-btn-full" onClick={handleAcceptVerdict}>
                        Accept and lock final <Icon name="check" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {screen === "appeal" && caseData && (
          <div className="dd-form-wrap">
            <div className="dd-form-hdr">
              <div className="dd-kicker">Round 2 - Case #{caseId}</div>
              <h2 className="dd-form-title">File your appeal.</h2>
              <p className="dd-form-sub">The appellate panel receives the full record plus your grounds for appeal.</p>
            </div>

            <div className="dd-card">
              <div className="dd-prev-verdict-box">
                <div className="dd-prev-label">Round 1 verdict</div>
                <div className="dd-details-grid">
                  <span className="dd-dl">Winner</span><span className="dd-dv">{resolveWinner(caseData) === "guest" ? "Guest" : "Host"}</span>
                  <span className="dd-dl">Ruling</span><span className="dd-dv">{caseData.round1_verdict}</span>
                  <span className="dd-dl">Reasoning</span><span className="dd-dv">{caseData.round1_reasoning}</span>
                </div>
              </div>

              <span className={`dd-party-tag ${myTagClass}`}>
                <Icon name={myRole === "host" ? "home" : "person"} size={15} /> Appealing as {myLabel}
              </span>

              <Field label="Grounds for appeal">
                <textarea
                  className="dd-textarea"
                  placeholder="What did Round 1 miss, misunderstand, or weigh incorrectly?"
                  value={appealReason}
                  onChange={(e) => setAppealReason(e.target.value)}
                  rows={5}
                />
              </Field>

              <div className="dd-status-note dd-waiting" style={{ marginTop: 15 }}>
                This is the only appeal. Round 2 locks the final result onchain.
              </div>

              {error && <p className="dd-error">{error}</p>}

              <div className="dd-card-actions">
                <button className="dd-btn dd-btn-brass dd-btn-full" onClick={handleFileAppeal}>
                  Submit appeal <Icon name="arrow" />
                </button>
              </div>
            </div>
          </div>
        )}

        {screen === "appeal_pending" && caseData && (
          <div className="dd-form-wrap">
            <div className="dd-form-hdr">
              <div className="dd-kicker">Case #{caseId} - Appeal filed</div>
              <h2 className="dd-form-title">Resolve the appeal.</h2>
              <p className="dd-form-sub">Either party can trigger the final appellate review.</p>
            </div>

            <div className="dd-card">
              <div className="dd-appeal-pending-box">
                <div className="dd-status-label">Appeal record</div>
                <div className="dd-details-grid">
                  <span className="dd-dl">Filed by</span><span className="dd-dv">{caseData.appeal_party === "host" ? "Host" : "Guest"}</span>
                  <span className="dd-dl">Grounds</span><span className="dd-dv">{caseData.appeal_reason}</span>
                  <span className="dd-dl">Round 1</span><span className="dd-dv">{caseData.round1_verdict}</span>
                </div>
              </div>

              <div className="dd-ready-box" style={{ marginTop: 15 }}>
                <div className="dd-status-label">Final review</div>
                <p className="dd-panel-copy" style={{ marginTop: 8, marginBottom: 0 }}>
                  The contract asks the appellate panel to uphold or overturn Round 1 and explain the decision.
                </p>
              </div>

              {error && <p className="dd-error">{error}</p>}

              <div className="dd-card-actions">
                <button className="dd-btn dd-btn-brass dd-btn-full" onClick={handleResolveAppeal}>
                  Run final review <Icon name="spark" />
                </button>
              </div>
            </div>
          </div>
        )}

        {screen === "final_verdict" && caseData && (() => {
          const winner = resolveWinner(caseData);
          const wasAppealed = Boolean(caseData.appeal_outcome);
          const wasOverturned = caseData.appeal_outcome === "overturned";

          return (
            <div className="dd-verdict-screen">
              <div className="dd-verdict-banner">
                <div className="dd-final-badge">
                  <Icon name="shield" size={15} /> Final - Locked onchain
                </div>
                <div className="dd-verdict-winner">{winner === "guest" ? "Guest wins" : "Host wins"}</div>
                <div className="dd-verdict-deposit">{caseData.verdict || "No verdict text was recorded."}</div>
              </div>

              <div className="dd-verdict-cards">
                <div className="dd-vcard">
                  <h3>Final ruling</h3>
                  <p>{caseData.verdict || "No ruling text recorded."}</p>
                </div>

                <div className="dd-vcard">
                  <h3>Final reasoning</h3>
                  <p>{caseData.reasoning || "No reasoning recorded."}</p>
                </div>

                {wasAppealed && (
                  <div className={`dd-vcard ${wasOverturned ? "dd-outcome-overturned" : "dd-outcome-upheld"}`}>
                    <div className="dd-outcome-label">Appeal outcome</div>
                    <div className="dd-outcome-result">
                      {wasOverturned ? "Round 1 overturned" : "Round 1 upheld"}
                    </div>
                    <p>{caseData.appeal_address || "No appeal explanation recorded."}</p>
                  </div>
                )}

                <div className="dd-vcard">
                  <h3>Case details</h3>
                  <div className="dd-details-grid">
                    <span className="dd-dl">Property</span><span className="dd-dv">{caseData.property_address}</span>
                    <span className="dd-dl">Caution fee</span><span className="dd-dv">{caseData.deposit_amount}</span>
                    <span className="dd-dl">Host</span><span className="dd-dv">{caseData.host_name}</span>
                    <span className="dd-dl">Guest</span><span className="dd-dv">{caseData.guest_name}</span>
                    <span className="dd-dl">Rounds</span><span className="dd-dv">{wasAppealed ? "2 with appeal" : "1 accepted"}</span>
                  </div>
                </div>

                <div className="dd-vcard">
                  <h3>Share</h3>
                  <p>Both parties can reopen this result with Case ID <span className="dd-id-badge">#{caseData.case_id}</span>.</p>
                  <div className="dd-card-actions">
                    <button className="dd-btn dd-btn-outline" onClick={copyVerdictLink}>
                      <Icon name={verdictCopied ? "check" : "copy"} /> {verdictCopied ? "Copied" : "Copy summary"}
                    </button>
                    <button className="dd-btn dd-btn-ghost" onClick={() => window.print()}>
                      Print
                    </button>
                  </div>
                </div>

                <button className="dd-btn dd-btn-primary" onClick={reset}>
                  File another dispute <Icon name="arrow" />
                </button>
              </div>
            </div>
          );
        })()}
      </div>

      <footer className="dd-footer">
        <span>DwellDocket</span>
        <span>StudioNet case engine</span>
      </footer>
    </main>
  );
}
