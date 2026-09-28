"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { proposalsJourneyStep, useJourneyStep } from "@/components/layout";
import {
  BulletList,
  Button,
  DefinitionList,
  ErrorNotice,
  GenerationStatus,
  Notice,
  StatusBadge,
  outlineButtonClass,
} from "@/components/ui";
import { learningRequests } from "@/lib/api";
import { recallRequestId, rememberRequestId } from "@/lib/session";
import type { CourseProposal, LearningRequest } from "@/types/generator";

/** Dedupe concurrent generateProposals calls for the same request (React Strict Mode). */
const proposalGenerationByRequest = new Map<string, Promise<LearningRequest>>();

async function loadProposalsForRequest(requestId: string): Promise<LearningRequest> {
  const current = await learningRequests.get(requestId);
  if (current.state !== "objective_confirmed") {
    return current;
  }

  const pending = proposalGenerationByRequest.get(requestId);
  if (pending) {
    return pending;
  }

  const generation = learningRequests
    .generateProposals(requestId)
    .finally(() => proposalGenerationByRequest.delete(requestId));
  proposalGenerationByRequest.set(requestId, generation);
  return generation;
}

/** UF-03: 1-5 differentiated learning directions; select one, then Blueprint. */
export function ProposalsFeature() {
  const router = useRouter();
  const params = useSearchParams();
  const [request, setRequest] = useState<LearningRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const loadSeq = useRef(0);

  const requestId = params.get("request") ?? recallRequestId();
  const missing = !requestId;

  useJourneyStep(proposalsJourneyStep(request));

  useEffect(() => {
    if (!requestId) {
      return;
    }
    const seq = ++loadSeq.current;
    let cancelled = false;
    (async () => {
      setBusy(true);
      setError(null);
      try {
        const current = await loadProposalsForRequest(requestId);
        if (!cancelled && seq === loadSeq.current) {
          rememberRequestId(current.id);
          setRequest(current);
        }
      } catch (err) {
        if (!cancelled && seq === loadSeq.current) {
          setError(err);
        }
      } finally {
        if (!cancelled && seq === loadSeq.current) {
          setBusy(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [requestId]);

  const act = async (action: () => Promise<LearningRequest>) => {
    setBusy(true);
    setError(null);
    try {
      setRequest(await action());
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const startBlueprint = async () => {
    if (!request) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const blueprint = await learningRequests.startBlueprint(request.id);
      router.push(`/blueprints/${blueprint.id}`);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  if (missing) {
    return (
      <Notice tone="info" title="No learning request yet">
        <Link
          href="/onboarding"
          className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-xl bg-foreground px-5 py-2.5 text-sm font-medium text-surface no-underline cursor-pointer hover:bg-foreground/85"
        >
          <span aria-hidden>+</span>
          New course
        </Link>
      </Notice>
    );
  }

  if (!request) {
    return (
      <div className="flex flex-col gap-3">
        {busy ? (
          <GenerationStatus
            title="Preparing learning directions"
            description="Building differentiated ways to approach your confirmed objective."
          />
        ) : (
          <p className="text-sm text-muted">Loading…</p>
        )}
        <ErrorNotice error={error} />
      </div>
    );
  }

  if (!request.objective?.confirmed) {
    return (
      <Notice tone="info" title="Confirm your objective first">
        <Link href={`/onboarding?request=${request.id}`} className={`mt-3 ${outlineButtonClass}`}>
          Return to the objective step.
        </Link>
      </Notice>
    );
  }

  const set = request.proposals;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Confirmed objective</h2>
        <p className="text-sm leading-6">{request.objective.statement}</p>
      </section>

      {!set ? (
        <ErrorNotice error={error} />
      ) : (
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">
              {set.proposals.length === 1
                ? "One sound direction"
                : `${set.proposals.length} learning directions`}
            </h2>
            <p className="text-sm text-muted">
              Each direction is a different intellectual trajectory toward the same
              objective. Choose the one that fits how you want to think about it.
            </p>
          </div>
          {set.recommended_proposal_id && set.recommendation_reason ? (
            <Notice tone="info" title="Suggested for you">
              {set.recommendation_reason}
            </Notice>
          ) : null}
          <ul className="flex flex-col gap-4">
            {set.proposals.map((proposal) => (
              <ProposalCard
                key={proposal.id}
                proposal={proposal}
                recommended={proposal.id === set.recommended_proposal_id}
                selected={proposal.id === request.selected_proposal_id}
                busy={busy}
                onSelect={() =>
                  act(() => learningRequests.selectProposal(request.id, proposal.id))
                }
              />
            ))}
          </ul>
          <ErrorNotice error={error} />
          <div className="flex flex-wrap items-center gap-3">
            {request.blueprint_id ? (
              <Link
                href={`/blueprints/${request.blueprint_id}`}
                className="inline-flex items-center rounded-xl bg-foreground px-5 py-2.5 text-sm font-medium text-surface cursor-pointer hover:bg-foreground/85"
              >
                Open the Blueprint
              </Link>
            ) : (
              <Button
                type="button"
                busy={busy}
                disabled={!request.selected_proposal_id}
                onClick={startBlueprint}
              >
                Generate the Blueprint
              </Button>
            )}
            <Link
              href={`/onboarding?request=${request.id}`}
              className={outlineButtonClass}
            >
              Back to objective
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

type ProposalCardProps = {
  proposal: CourseProposal;
  recommended: boolean;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
};

function ProposalCard({ proposal, recommended, selected, busy, onSelect }: ProposalCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li
      className={`flex flex-col gap-3 rounded-xl border bg-surface p-5 ${
        selected ? "border-foreground" : "border-line"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="font-serif text-base font-semibold">{proposal.title}</h3>
          <p className="text-sm text-muted">{proposal.description}</p>
        </div>
        <div className="flex gap-2">
          {recommended ? <StatusBadge label="Suggested" tone="active" /> : null}
          {selected ? <StatusBadge label="Selected" tone="success" /> : null}
        </div>
      </div>

      <div
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
          expanded ? "grid-rows-[1fr] opacity-100" : "-mb-3 grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className={expanded ? "overflow-hidden" : "pointer-events-none overflow-hidden"}>
          <div className="flex flex-col gap-3">
            <DefinitionList
              items={[
                { term: "Central question", detail: proposal.central_question },
                { term: "You will be able to", detail: proposal.intellectual_outcome },
                { term: "Trajectory", detail: proposal.distinctive_trajectory },
                { term: "Organizing principle", detail: proposal.organizing_principle },
                {
                  term: "Guided by",
                  detail: <BulletList items={proposal.guiding_authors_or_traditions} />,
                },
                { term: "Scope", detail: <BulletList items={proposal.scope} /> },
                { term: "Leaves out", detail: <BulletList items={proposal.exclusions} /> },
                { term: "Fit for your level", detail: proposal.level_fit },
                {
                  term: "Estimate",
                  detail: `${proposal.estimated_modules} modules · ${proposal.estimated_duration}`,
                },
                { term: "Main advantage", detail: proposal.main_advantage },
                { term: "Trade-off", detail: proposal.trade_off },
              ]}
            />
            <Button
              type="button"
              variant={selected ? "secondary" : "primary"}
              disabled={busy || selected}
              onClick={() => {
                setExpanded(false);
                onSelect();
              }}
              className="self-start"
            >
              {selected ? "Selected" : "Choose this direction"}
            </Button>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="inline-flex items-center gap-1.5 self-start text-sm text-muted hover:text-foreground"
            >
              Read less
              <span aria-hidden className="inline-block -rotate-90 text-base leading-none">
                ›
              </span>
            </button>
          </div>
        </div>
      </div>
      {expanded ? null : (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="inline-flex items-center gap-1.5 self-start text-sm text-muted hover:text-foreground"
        >
          Read more
          <span aria-hidden className="inline-block rotate-90 text-base leading-none">
            ›
          </span>
        </button>
      )}
    </li>
  );
}
