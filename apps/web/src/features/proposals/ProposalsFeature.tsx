"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import {
  BulletList,
  Button,
  DefinitionList,
  ErrorNotice,
  Notice,
  StatusBadge,
} from "@/components/ui";
import { learningRequests } from "@/lib/api";
import { recallRequestId, rememberRequestId } from "@/lib/session";
import type { CourseProposal, LearningRequest } from "@/types/generator";

/** UF-03: 1-5 differentiated learning directions; select one, then Blueprint. */
export function ProposalsFeature() {
  const router = useRouter();
  const params = useSearchParams();
  const [request, setRequest] = useState<LearningRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const requestId = params.get("request") ?? recallRequestId();
  const missing = !requestId;

  useEffect(() => {
    if (!requestId) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        let current = await learningRequests.get(requestId);
        if (current.state === "objective_confirmed") {
          setBusy(true);
          current = await learningRequests.generateProposals(requestId);
        }
        if (!cancelled) {
          rememberRequestId(current.id);
          setRequest(current);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err);
        }
      } finally {
        if (!cancelled) {
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
        <Link href="/onboarding" className="underline underline-offset-4">
          Start by describing what you want to learn.
        </Link>
      </Notice>
    );
  }

  if (!request) {
    return (
      <div className="flex flex-col gap-3">
        {busy ? (
          <p className="text-sm text-zinc-500" role="status">
            Generating differentiated learning directions for your objective…
          </p>
        ) : (
          <p className="text-sm text-zinc-500">Loading…</p>
        )}
        <ErrorNotice error={error} />
      </div>
    );
  }

  if (!request.objective?.confirmed) {
    return (
      <Notice tone="info" title="Confirm your objective first">
        <Link href={`/onboarding?request=${request.id}`} className="underline underline-offset-4">
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
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
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
                className="inline-flex items-center rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950"
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
              className="text-sm text-zinc-500 underline-offset-4 hover:underline"
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
  return (
    <li
      className={`flex flex-col gap-3 rounded-md border p-5 ${
        selected
          ? "border-zinc-950 dark:border-zinc-50"
          : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-semibold">{proposal.title}</h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{proposal.description}</p>
        </div>
        <div className="flex gap-2">
          {recommended ? <StatusBadge label="Suggested" tone="active" /> : null}
          {selected ? <StatusBadge label="Selected" tone="success" /> : null}
        </div>
      </div>
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
        onClick={onSelect}
        className="self-start"
      >
        {selected ? "Selected" : "Choose this direction"}
      </Button>
    </li>
  );
}
