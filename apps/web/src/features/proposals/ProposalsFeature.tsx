"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { proposalsJourneyStep, useJourneyStep } from "@/components/layout";
import {
  ErrorNotice,
  GenerationStatus,
} from "@/components/ui";
import { useRedirectIfActiveBuild } from "@/hooks/useRedirectIfActiveBuild";
import { isAnonymousClaim } from "@/lib/auth/claims";
import { learningRequests } from "@/lib/api";
import { recallRequestId, rememberRequestId } from "@/lib/session";
import { createClient } from "@/lib/supabase/browser";
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
  const blockingActiveBuild = useRedirectIfActiveBuild();
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
      const supabase = createClient();
      const { data } = await supabase.auth.getClaims();
      if (isAnonymousClaim(data?.claims as Record<string, unknown> | undefined)) {
        const next = `/proposals?request=${request.id}`;
        router.push(`/login?next=${encodeURIComponent(next)}`);
        setBusy(false);
        return;
      }
      const blueprint = await learningRequests.startBlueprint(request.id);
      router.push(`/blueprints/${blueprint.id}`);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  if (blockingActiveBuild) {
    return <p className="text-sm text-muted">Checking generation status…</p>;
  }

  if (missing) {
    return (
      <section className="caminos-h">
        <span className="paso-n">Your learning path</span>
        <h2>Choose a way in</h2>
        <p>Start with a question. The learning paths appear after the objective is confirmed.</p>
        <Link className="btn" href="/onboarding">
          Create a course
          <span className="ar" aria-hidden="true" />
        </Link>
      </section>
    );
  }

  if (!request) {
    return (
      <div className="caminos-h">
        <div className="form-avisos">
          {busy ? (
            <GenerationStatus
              title="Preparing learning directions"
              description="Building differentiated ways to approach your confirmed objective."
            />
          ) : (
            <p>Loading…</p>
          )}
          <ErrorNotice error={error} />
        </div>
      </div>
    );
  }

  if (!request.objective?.confirmed) {
    return (
      <section className="caminos-h">
        <span className="paso-n">Your learning path</span>
        <h2>Confirm your objective first</h2>
        <p>Learning paths are built from a confirmed objective.</p>
        <Link className="btn" href={`/onboarding?request=${request.id}`}>
          Return to the objective
          <span className="ar" aria-hidden="true" />
        </Link>
      </section>
    );
  }

  const set = request.proposals;

  return (
    <>
      <section className="caminos-h">
        <span className="paso-n">Your learning path</span>
        <h2>Choose a way in</h2>
        <p>One subject. Different ways to understand it.</p>
        {set?.recommendation_reason ? <p className="reco">{set.recommendation_reason}</p> : null}
      </section>

      {!set ? (
        <div className="form-avisos">
          <ErrorNotice error={error} />
        </div>
      ) : (
        <Paths
          proposals={set.proposals}
          recommendedId={set.recommended_proposal_id}
          selectedId={request.selected_proposal_id}
          busy={busy}
          blueprintId={request.blueprint_id}
          error={error}
          onSelect={(proposalId) =>
            act(() => learningRequests.selectProposal(request.id, proposalId))
          }
          onContinue={startBlueprint}
        />
      )}
    </>
  );
}

function Paths({
  proposals,
  recommendedId,
  selectedId,
  busy,
  blueprintId,
  error,
  onSelect,
  onContinue,
}: {
  proposals: CourseProposal[];
  recommendedId: string | null;
  selectedId: string | null;
  busy: boolean;
  blueprintId: string | null;
  error: unknown;
  onSelect: (proposalId: string) => void;
  onContinue: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = proposals.find((proposal) => proposal.id === openId) ?? null;
  const openIndex = open ? proposals.findIndex((proposal) => proposal.id === open.id) : -1;

  return (
    <>
      <div className={`ae-routes${open ? " abierta" : ""}`}>
        <div className="caminos">
          {proposals.map((proposal, index) => (
            <article
              className={`lomo${proposal.id === selectedId ? " is-selected" : ""}`}
              key={proposal.id}
            >
              <button
                className="ae-route-open"
                type="button"
                aria-expanded={openId === proposal.id}
                onClick={() => setOpenId(proposal.id)}
              >
                <span className="sol">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <span>{proposal.organizing_principle}</span>
                </span>
                <span className="caja">
                  <span className="abierto">
                    <b>{proposal.title}</b>
                    <span className="sint">{proposal.description}</span>
                    <span className="ver">Open learning path</span>
                    <span className="pie">
                      <span>
                        {proposal.estimated_modules} modules · {proposal.estimated_duration}
                      </span>
                      <span className="marca-path">
                        {proposal.id === selectedId
                          ? "Selected"
                          : proposal.id === recommendedId
                            ? "Suggested"
                            : "Choose this path"}
                      </span>
                    </span>
                  </span>
                </span>
              </button>
            </article>
          ))}
        </div>
        {open ? (
          <div className="ae-route-panels">
            <article
              className={`ae-route-folder${open.id === selectedId ? " is-selected" : ""}`}
            >
              <span className="folder-tab">
                {String(openIndex + 1).padStart(2, "0")} {open.organizing_principle}
              </span>
              <div className="ae-route-spread">
                <div className="ae-route-summary">
                  <h3>{open.title}</h3>
                  <p>{open.description}</p>
                  {open.guiding_authors_or_traditions.length > 0 ? (
                    <p className="aut">
                      <span>Authors</span>
                      {open.guiding_authors_or_traditions.join(", ")}
                    </p>
                  ) : null}
                  <div className="ae-route-facts">
                    <div>
                      <b>{open.estimated_modules}</b>
                      modules
                    </div>
                    <div>
                      <b>{open.estimated_duration}</b>
                      duration
                    </div>
                  </div>
                </div>
                <div className="ae-route-paper">
                  <dl>
                    <dt>Learning path</dt>
                    <dd>{open.distinctive_trajectory}</dd>
                    <dt>A good fit if</dt>
                    <dd>{open.level_fit}</dd>
                    <dt>Central question</dt>
                    <dd>{open.central_question}</dd>
                    <dt>You will be able to</dt>
                    <dd>{open.intellectual_outcome}</dd>
                    <dt>Main advantage</dt>
                    <dd>{open.main_advantage}</dd>
                    <dt>Trade-off</dt>
                    <dd>{open.trade_off}</dd>
                    {open.exclusions.length > 0 ? (
                      <>
                        <dt>Leaves out</dt>
                        <dd>{open.exclusions.join(", ")}</dd>
                      </>
                    ) : null}
                  </dl>
                  {open.scope.length > 0 ? (
                    <>
                      <span className="lab">Scope</span>
                      <ol>
                        {open.scope.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ol>
                    </>
                  ) : null}
                </div>
                <div className="ae-route-actions">
                  <button
                    className="btn"
                    type="button"
                    disabled={busy || open.id === selectedId}
                    onClick={() => onSelect(open.id)}
                  >
                    {open.id === selectedId ? "Selected" : "Choose this path"}
                    {open.id === selectedId ? null : <span className="ar" aria-hidden="true" />}
                  </button>
                  <button className="ae-route-close" type="button" onClick={() => setOpenId(null)}>
                    Back to learning paths
                  </button>
                </div>
              </div>
            </article>
          </div>
        ) : null}
      </div>
      <div className="cierre-o">
        <div className="acciones">
          {blueprintId ? (
            <Link className="btn" href={`/blueprints/${blueprintId}`}>
              Open the Blueprint
              <span className="ar" aria-hidden="true" />
            </Link>
          ) : (
            <button className="btn" type="button" disabled={busy || !selectedId} onClick={onContinue}>
              Generate the Blueprint
              <span className="ar" aria-hidden="true" />
            </button>
          )}
          <span className="nota">
            {selectedId ? "This path will shape the Blueprint." : "Choose a learning path to continue."}
          </span>
        </div>
      </div>
      {error ? (
        <div className="form-avisos">
          <ErrorNotice error={error} />
        </div>
      ) : null}
    </>
  );
}
