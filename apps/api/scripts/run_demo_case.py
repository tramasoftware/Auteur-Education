"""Run one evaluation case against a running API and print evidence.

Usage (from apps/api, with the API started via `uv run uvicorn auteur_api.main:app`):

    uv run python scripts/run_demo_case.py --list
    uv run python scripts/run_demo_case.py specific-beginner --until objective
    uv run python scripts/run_demo_case.py ambiguous --until proposals
    uv run python scripts/run_demo_case.py materialist-central --until course
    uv run python scripts/run_demo_case.py advanced --until proposals --repeat 2
    uv run python scripts/run_demo_case.py advanced --until course --out %TEMP%\\adv.json

Only stdlib is used. Evidence is printed (and optionally written to a file you
choose, outside the repository — DEC-010). Nothing here bypasses the API: the
script does exactly what the frontend does.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict
from typing import Any

sys.path.insert(0, __file__.rsplit("scripts", 1)[0] + "scripts")
from demo_cases import CASES  # noqa: E402

STEPS = ["objective", "proposals", "blueprint", "course"]


class Api:
    def __init__(self, base_url: str) -> None:
        self.base = base_url.rstrip("/") + "/api/v1"

    def call(self, method: str, path: str, body: dict | None = None) -> dict[str, Any]:
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(
            self.base + path,
            data=data,
            method=method,
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=600) as resp:
                return json.loads(resp.read() or b"{}")
        except urllib.error.HTTPError as exc:
            payload = exc.read().decode(errors="replace")
            raise SystemExit(f"HTTP {exc.code} {method} {path}\n{payload}") from exc


def wait(api: Api, path: str, done: set[str], label: str, every: float = 5.0) -> dict:
    started = time.monotonic()
    while True:
        record = api.call("GET", path)
        activity = record.get("current_activity") or ""
        print(
            f"  [{label}] {record['state']:<22} {int(time.monotonic() - started):>4}s {activity}"
        )
        if record["state"] in done:
            return record
        time.sleep(every)


def print_traces(traces: list[dict]) -> None:
    per_stage: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for t in traces:
        agg = per_stage[t["stage"]]
        agg["calls"] += 1
        agg["ms"] += t["duration_ms"]
        agg["tokens"] += t["usage"]["total_tokens"]
        agg["in"] += t["usage"]["input_tokens"]
        agg["out"] += t["usage"]["output_tokens"]
        if t["status"] != "ok":
            agg["retries_or_failures"] += 1
    print(
        f"  {'stage':<14}{'calls':>6}{'ms':>9}{'tokens':>9}{'in':>9}{'out':>9}{'not ok':>8}"
    )
    for stage, agg in per_stage.items():
        print(
            f"  {stage:<14}{agg['calls']:>6}{agg['ms']:>9}{agg['tokens']:>9}"
            f"{agg['in']:>9}{agg['out']:>9}{agg['retries_or_failures']:>8}"
        )
    total_ms = sum(t["duration_ms"] for t in traces)
    total_tokens = sum(t["usage"]["total_tokens"] for t in traces)
    print(
        f"  total: {len(traces)} calls, {total_ms / 1000:.1f}s model time, {total_tokens} tokens"
    )


def run(api: Api, case_key: str, until: str, evidence: dict[str, Any]) -> None:
    case = CASES[case_key]
    print(f"\n== {case.key}: {case.purpose}")
    t0 = time.monotonic()
    req = api.call("POST", "/learning-requests", case.body)
    rid = req["id"]
    comp = req["compatibility"]
    print(f"  request {rid}")
    print(f"  compatibility: {comp['classification']} (risk={comp['risk_category']})")
    print(
        f"  precision needed: {req['precision']['needs_precision']} state={req['state']}"
    )
    ok_comp = comp["classification"] in case.expected_compatibility
    print(
        f"  expected compatibility {case.expected_compatibility}: {'OK' if ok_comp else 'DIFFERS'}"
    )
    if case.expects_precision is not None:
        ok_prec = req["precision"]["needs_precision"] == case.expects_precision
        print(
            f"  expected precision={case.expects_precision}: {'OK' if ok_prec else 'DIFFERS'}"
        )

    if req["state"] == "incompatible":
        print(f"  explanation: {comp['explanation']}")
        print(f"  safe_reframing: {comp['safe_reframing']}")
    elif req["state"] == "precision_required":
        options = req["precision"]["options"]
        for o in options:
            print(f"    - [{o['id']}] {o['title']}: {o['explanation']}")
        # Deterministic choice for reproducibility: first option.
        req = api.call(
            "POST",
            f"/learning-requests/{rid}/precision",
            {"option_id": options[0]["id"]},
        )
        print(f"  chose option 1 -> state={req['state']}")

    if req.get("objective"):
        obj = req["objective"]
        print(f"  objective v{obj['version']}: {obj['statement']}")
        print(f"  assumed level: {obj['assumed_level_and_knowledge']}")
        if until != "objective":
            req = api.call(
                "POST",
                f"/learning-requests/{rid}/objective/confirm",
                {"version": obj["version"]},
            )
            print(f"  confirmed -> state={req['state']}")

    if (
        until in ("proposals", "blueprint", "course")
        and req["state"] == "objective_confirmed"
    ):
        req = api.call("POST", f"/learning-requests/{rid}/proposals")
        ps = req["proposals"]
        print(
            f"  proposals: {len(ps['proposals'])} (recommended={ps['recommended_proposal_id']})"
        )
        for p in ps["proposals"]:
            print(f"    - [{p['id']}] {p['title']} — {p['distinctive_trajectory']}")
        chosen = ps["recommended_proposal_id"] or ps["proposals"][0]["id"]
        if until != "proposals":
            req = api.call(
                "POST",
                f"/learning-requests/{rid}/proposals/select",
                {"proposal_id": chosen},
            )
            print(f"  selected {chosen} -> state={req['state']}")

    if until in ("blueprint", "course") and req["state"] == "proposal_selected":
        bp = api.call("POST", f"/learning-requests/{rid}/blueprint")
        bp = wait(
            api, f"/blueprints/{bp['id']}", {"awaiting_approval", "failed"}, "blueprint"
        )
        if bp["state"] == "failed":
            print(f"  blueprint failed: {bp.get('failure_message')}")
        else:
            vis = bp["blueprint"]
            print(f"  blueprint v{bp['current_version']}: {vis['title']}")
            for m in vis["modules"]:
                print(f"    {m['index']}. {m['title']} ({len(m['lessons'])} lessons)")
            if until == "course":
                approved = api.call(
                    "POST",
                    f"/blueprints/{bp['id']}/approve",
                    {"version": bp["current_version"]},
                )
                course = wait(
                    api,
                    f"/courses/{approved['course_id']}",
                    {"complete", "partially_available", "failed"},
                    "course",
                    every=15.0,
                )
                print(f"  course {course['id']} -> {course['state']}")
                for m in course["modules"]:
                    print(f"    {m['index']}. {m['title']}: {m['state']}")
                if course.get("failure"):
                    print(f"  failure: {course['failure']}")
                diag = api.call("GET", f"/courses/{course['id']}/diagnostics")
                print(
                    "  materialist: "
                    f"{diag['blueprint_internal']['materialist_classification']}"
                )
                for m in diag["modules"]:
                    for lesson in m["lessons"]:
                        print(
                            f"    {lesson['title']}: {lesson['state']} attempts="
                            f"{lesson['attempts']} research_rounds={lesson['research_rounds']} "
                            f"evidence={lesson['evidence_retrieved']}/{lesson['evidence_total']} "
                            f"words={lesson['word_count']} review={lesson['review_result']}"
                        )
                evidence["course_diagnostics"] = diag

    diag = api.call("GET", f"/learning-requests/{rid}/diagnostics")
    print(f"  wall time: {time.monotonic() - t0:.1f}s")
    print_traces(diag["traces"])
    evidence.update(
        {
            "case": case.key,
            "request_id": rid,
            "final_request": req,
            "request_diagnostics": diag,
            "rubric": list(case.rubric),
        }
    )
    if case.rubric:
        print("  review by hand: " + "; ".join(case.rubric))


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("case", nargs="?", choices=sorted(CASES), help="case key")
    parser.add_argument("--until", choices=STEPS, default="proposals")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--repeat", type=int, default=1, help="run the case N times")
    parser.add_argument(
        "--out", help="write JSON evidence to this file (outside the repo)"
    )
    parser.add_argument("--list", action="store_true")
    args = parser.parse_args()

    if args.list or not args.case:
        for c in CASES.values():
            print(f"{c.key:<28} {c.purpose}")
        return

    api = Api(args.base_url)
    runs: list[dict[str, Any]] = []
    for _ in range(args.repeat):
        evidence: dict[str, Any] = {}
        run(api, args.case, args.until, evidence)
        runs.append(evidence)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            json.dump(runs, fh, indent=2, ensure_ascii=False)
        print(f"\nEvidence written to {args.out}")


if __name__ == "__main__":
    main()
