# v0.1.0
# { "Depends": "py-genlayer:test" }

import genlayer.gl as gl
from genlayer import TreeMap, u256
import json


class AppealArbitration(gl.Contract):

    case_count: u256
    cases: TreeMap[u256, str]

    def __init__(self):
        self.case_count = u256(0)

    # ─────────────────────────────────────────────
    # INTERNAL: Round 1 verdict
    # ─────────────────────────────────────────────
    def _run_verdict(self, state: dict) -> dict:
        host_name = state["host_name"]
        guest_name = state["guest_name"]
        property_address = state["property_address"]
        deposit_amount = state["deposit_amount"]
        agreement_terms = state["agreement_terms"]
        host_claim = state["host_claim"]
        host_evidence = state["host_evidence"]
        guest_claim = state["guest_claim"]
        guest_evidence = state["guest_evidence"]

        def generate():
            return gl.nondet.exec_prompt(
                f"You are an impartial arbitration judge resolving a shortlet/Airbnb caution fee dispute. "
                f"Property: {property_address}. "
                f"Caution fee amount: {deposit_amount}. "
                f"Original agreement terms: {agreement_terms}. "
                f"HOST ({host_name}) claims: {host_claim}. "
                f"HOST evidence: {host_evidence}. "
                f"GUEST ({guest_name}) claims: {guest_claim}. "
                f"GUEST evidence: {guest_evidence}. "
                "Based ONLY on the claims and evidence above, decide who wins this caution fee dispute. "
                "Return ONLY this exact JSON with no extra text: "
                '{"winner": "host" or "guest", "verdict": "one sentence ruling", "reasoning": "2-3 sentence explanation citing specific evidence"}'
            ).replace("```json", "").replace("```", "").strip()

        result = gl.eq_principle.prompt_non_comparative(
            generate,
            task="arbitrate shortlet caution fee dispute",
            criteria="valid JSON with winner (host or guest), verdict, and reasoning fields"
        )
        try:
            parsed = json.loads(result)
            if parsed.get("winner") not in ("host", "guest"):
                parsed["winner"] = "guest"
            return parsed
        except Exception:
            return {
                "winner": "guest",
                "verdict": "Insufficient evidence to rule against guest. Caution fee returned.",
                "reasoning": "The evidence presented was inconclusive. In cases of doubt, the caution fee is returned to the guest."
            }

    # ─────────────────────────────────────────────
    # INTERNAL: Round 2 appeal verdict
    # ─────────────────────────────────────────────
    def _run_appeal_verdict(self, state: dict) -> dict:
        host_name = state["host_name"]
        guest_name = state["guest_name"]
        property_address = state["property_address"]
        deposit_amount = state["deposit_amount"]
        agreement_terms = state["agreement_terms"]
        host_claim = state["host_claim"]
        host_evidence = state["host_evidence"]
        guest_claim = state["guest_claim"]
        guest_evidence = state["guest_evidence"]
        round1_winner = state["round1_winner"]
        round1_verdict = state["round1_verdict"]
        round1_reasoning = state["round1_reasoning"]
        appeal_party = state["appeal_party"]
        appeal_reason = state["appeal_reason"]

        def generate():
            return gl.nondet.exec_prompt(
                f"You are a senior appellate arbitration judge reviewing a caution fee dispute appeal. "
                f"Property: {property_address}. "
                f"Caution fee amount: {deposit_amount}. "
                f"Original agreement terms: {agreement_terms}. "
                f"HOST ({host_name}) claims: {host_claim}. HOST evidence: {host_evidence}. "
                f"GUEST ({guest_name}) claims: {guest_claim}. GUEST evidence: {guest_evidence}. "
                f"ROUND 1 VERDICT: {round1_winner} won. Ruling: {round1_verdict}. Reasoning: {round1_reasoning}. "
                f"APPEAL filed by: {appeal_party}. Appeal reason: {appeal_reason}. "
                "Review the original verdict carefully. You MUST explicitly state whether you are upholding or overturning the previous verdict and WHY. "
                "Consider whether the appeal raises new points not addressed in round 1. "
                "Return ONLY this exact JSON with no extra text: "
                '{"winner": "host" or "guest", "verdict": "one sentence final ruling", "reasoning": "2-3 sentences", "appeal_outcome": "upheld" or "overturned", "appeal_address": "one sentence explaining why you upheld or overturned the round 1 verdict"}'
            ).replace("```json", "").replace("```", "").strip()

        result = gl.eq_principle.prompt_non_comparative(
            generate,
            task="review appeal of shortlet caution fee arbitration",
            criteria="valid JSON with winner, verdict, reasoning, appeal_outcome, and appeal_address fields"
        )
        try:
            parsed = json.loads(result)
            if parsed.get("winner") not in ("host", "guest"):
                parsed["winner"] = round1_winner
            if parsed.get("appeal_outcome") not in ("upheld", "overturned"):
                parsed["appeal_outcome"] = "upheld"
            return parsed
        except Exception:
            return {
                "winner": round1_winner,
                "verdict": "Original verdict upheld on appeal.",
                "reasoning": "The appeal did not present sufficient new grounds to overturn the original ruling.",
                "appeal_outcome": "upheld",
                "appeal_address": "The appellate panel reviewed the original reasoning and found it sound. No new compelling evidence was presented."
            }

    # ─────────────────────────────────────────────
    # PUBLIC WRITE: Create a new case (fast — no AI)
    # ─────────────────────────────────────────────
    @gl.public.write
    def create_case(self, host_name: str, guest_name: str, property_address: str, deposit_amount: str, agreement_terms: str) -> None:
        case_id = int(self.case_count) + 1
        self.case_count = u256(case_id)
        state = {
            "case_id": case_id,
            "host_name": host_name,
            "guest_name": guest_name,
            "property_address": property_address,
            "deposit_amount": deposit_amount,
            "agreement_terms": agreement_terms,
            "host_claim": "",
            "host_evidence": "",
            "guest_claim": "",
            "guest_evidence": "",
            "status": "awaiting_claims",
            "round": 1,
            "round1_winner": "",
            "round1_verdict": "",
            "round1_reasoning": "",
            "appeal_party": "",
            "appeal_reason": "",
            "winner": "",
            "verdict": "",
            "reasoning": "",
            "appeal_outcome": "",
            "appeal_address": "",
            "is_final": False
        }
        self.cases[u256(case_id)] = json.dumps(state)

    # ─────────────────────────────────────────────
    # PUBLIC WRITE: Submit host claim (fast — no AI)
    # ─────────────────────────────────────────────
    @gl.public.write
    def submit_host_claim(self, case_id: int, host_claim: str, host_evidence: str) -> None:
        key = u256(case_id)
        if key not in self.cases:
            return
        state = json.loads(self.cases[key])
        if state["status"] not in ("awaiting_claims",):
            return
        state["host_claim"] = host_claim
        state["host_evidence"] = host_evidence
        self.cases[key] = json.dumps(state)

    # ─────────────────────────────────────────────
    # PUBLIC WRITE: Submit guest claim (fast — no AI)
    # ─────────────────────────────────────────────
    @gl.public.write
    def submit_guest_claim(self, case_id: int, guest_claim: str, guest_evidence: str) -> None:
        key = u256(case_id)
        if key not in self.cases:
            return
        state = json.loads(self.cases[key])
        if state["status"] not in ("awaiting_claims",):
            return
        state["guest_claim"] = guest_claim
        state["guest_evidence"] = guest_evidence
        self.cases[key] = json.dumps(state)

    # ─────────────────────────────────────────────
    # PUBLIC WRITE: Request verdict — triggers AI (SLOW ~60s)
    # ─────────────────────────────────────────────
    @gl.public.write
    def request_verdict(self, case_id: int) -> None:
        key = u256(case_id)
        if key not in self.cases:
            return
        state = json.loads(self.cases[key])
        # Must have both claims before verdict
        if not state["host_claim"] or not state["guest_claim"]:
            return
        if state["status"] not in ("awaiting_claims",):
            return

        result = self._run_verdict(state)

        state["round1_winner"] = result.get("winner", "guest")
        state["round1_verdict"] = result.get("verdict", "")
        state["round1_reasoning"] = result.get("reasoning", "")
        state["winner"] = result.get("winner", "guest")
        state["verdict"] = result.get("verdict", "")
        state["reasoning"] = result.get("reasoning", "")
        state["status"] = "round1_complete"
        state["round"] = 1
        self.cases[key] = json.dumps(state)

    # ─────────────────────────────────────────────
    # PUBLIC WRITE: File appeal (fast — no AI)
    # ─────────────────────────────────────────────
    @gl.public.write
    def file_appeal(self, case_id: int, appeal_party: str, appeal_reason: str) -> None:
        key = u256(case_id)
        if key not in self.cases:
            return
        state = json.loads(self.cases[key])
        # Can only appeal after round 1, before final
        if state["status"] != "round1_complete":
            return
        if appeal_party not in ("host", "guest"):
            return
        state["appeal_party"] = appeal_party
        state["appeal_reason"] = appeal_reason
        state["status"] = "appeal_filed"
        self.cases[key] = json.dumps(state)

    # ─────────────────────────────────────────────
    # PUBLIC WRITE: Resolve appeal — triggers AI (SLOW ~60s)
    # ─────────────────────────────────────────────
    @gl.public.write
    def resolve_appeal(self, case_id: int) -> None:
        key = u256(case_id)
        if key not in self.cases:
            return
        state = json.loads(self.cases[key])
        if state["status"] != "appeal_filed":
            return

        result = self._run_appeal_verdict(state)

        state["winner"] = result.get("winner", state["round1_winner"])
        state["verdict"] = result.get("verdict", "")
        state["reasoning"] = result.get("reasoning", "")
        state["appeal_outcome"] = result.get("appeal_outcome", "upheld")
        state["appeal_address"] = result.get("appeal_address", "")
        state["status"] = "final"
        state["round"] = 2
        state["is_final"] = True
        self.cases[key] = json.dumps(state)

    # ─────────────────────────────────────────────
    # PUBLIC WRITE: Accept verdict (skip appeal — mark final)
    # ─────────────────────────────────────────────
    @gl.public.write
    def accept_verdict(self, case_id: int) -> None:
        key = u256(case_id)
        if key not in self.cases:
            return
        state = json.loads(self.cases[key])
        if state["status"] != "round1_complete":
            return
        state["status"] = "final"
        state["is_final"] = True
        self.cases[key] = json.dumps(state)

    # ─────────────────────────────────────────────
    # PUBLIC VIEW: Read a case
    # ─────────────────────────────────────────────
    @gl.public.view
    def get_case(self, case_id: int) -> str:
        key = u256(case_id)
        if key in self.cases:
            return self.cases[key]
        return ""

    # ─────────────────────────────────────────────
    # PUBLIC VIEW: Get total case count
    # ─────────────────────────────────────────────
    @gl.public.view
    def get_case_count(self) -> int:
        return int(self.case_count)
