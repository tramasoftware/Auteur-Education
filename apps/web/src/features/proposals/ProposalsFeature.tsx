"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { createPathRouteMotion } from "./pathRouteMotion";

import { proposalsJourneyStep, useJourneyStep } from "@/components/layout";
import { CheckingGenerationStatus, GenerationStatus } from "@/components/ui";
import {
  BLUEPRINT_APPROACH_MS,
  BLUEPRINT_PHASES,
  PROPOSAL_APPROACH_MS,
  PROPOSAL_PHASES,
  StagePreparing,
} from "@/features/course-setup/StagePreparing";
import { StageFailure, stageFailureCopy } from "@/features/course-setup/StageFailure";
import { useRedirectIfActiveBuild } from "@/hooks/useRedirectIfActiveBuild";
import { isAnonymousClaim } from "@/lib/auth/claims";
import { blueprints, learningRequests } from "@/lib/api";
import { recallRequestId, rememberRequestId } from "@/lib/session";
import { createClient } from "@/lib/supabase/browser";
import type { CourseProposal, LearningRequest } from "@/types/generator";

function directionLabel(proposal: CourseProposal): string {
  const label = proposal.direction_label?.trim();
  return label || proposal.organizing_principle;
}

function durationLabel(value: string): string {
  return value.replace(/\s*\(\s*self-paced\s*\)\s*/gi, "").trim();
}

function estimateLine(proposal: CourseProposal): string {
  const parts = [`${proposal.estimated_modules} modules`];
  if ((proposal.estimated_lessons ?? 0) > 0) {
    parts.push(`${proposal.estimated_lessons} lessons`);
  }
  const duration = durationLabel(proposal.estimated_duration);
  if (duration) {
    parts.push(duration);
  }
  return parts.join(" · ");
}

const PAPER_PAGE_NEXT_LABEL =
  "Main advantage, trade-off, leaves out, and scope";
const PAPER_PAGE_PREV_LABEL =
  "Learning path, a good fit, central question, and outcome";

function ProposalPaperBackBody({ proposal }: { proposal: CourseProposal }) {
  return (
    <dl>
      <dt>Main advantage</dt>
      <dd>{proposal.main_advantage}</dd>
      <dt>Trade-off</dt>
      <dd>{proposal.trade_off}</dd>
      <dt>Leaves out</dt>
      <dd>
        {proposal.exclusions.length > 0 ? proposal.exclusions.join(", ") : "None named."}
      </dd>
      <dt>Scope</dt>
      <dd>
        {proposal.scope.length > 0 ? (
          <ol>
            {proposal.scope.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        ) : (
          "None named."
        )}
      </dd>
    </dl>
  );
}

function RoutePaperStack({
  proposal,
  paperPage,
  onGoPaperPage,
}: {
  proposal: CourseProposal;
  paperPage: number;
  onGoPaperPage: (page: number) => void;
}) {
  const stackRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const stack = stackRef.current;
    const measure = measureRef.current;
    if (!stack || !measure) {
      return;
    }
    const syncHeight = () => {
      stack.style.setProperty("--ae-paper-height", `${measure.offsetHeight}px`);
    };
    syncHeight();
    const observer = new ResizeObserver(syncHeight);
    observer.observe(measure);
    return () => observer.disconnect();
  }, [proposal]);

  return (
    <div className="ae-route-paper-stack" ref={stackRef}>
      <div className="ae-route-paper ae-route-paper-visible">
        {paperPage === 0 ? (
          <>
            <dl>
              <dt>Learning path</dt>
              <dd>{proposal.distinctive_trajectory}</dd>
              <dt>A good fit if</dt>
              <dd>{proposal.level_fit}</dd>
              <dt>Central question</dt>
              <dd>{proposal.central_question}</dd>
              <dt>You will be able to</dt>
              <dd>{proposal.intellectual_outcome}</dd>
            </dl>
            <button
              className="ae-paper-turn next"
              type="button"
              onClick={() => onGoPaperPage(1)}
            >
              {PAPER_PAGE_NEXT_LABEL}
            </button>
          </>
        ) : (
          <>
            <ProposalPaperBackBody proposal={proposal} />
            <button
              className="ae-paper-turn prev"
              type="button"
              onClick={() => onGoPaperPage(0)}
            >
              {PAPER_PAGE_PREV_LABEL}
            </button>
          </>
        )}
      </div>
      <div className="ae-route-paper-measure" aria-hidden="true" ref={measureRef}>
        <div className="ae-route-paper">
          <ProposalPaperBackBody proposal={proposal} />
          <span className="ae-paper-turn prev">{PAPER_PAGE_PREV_LABEL}</span>
        </div>
      </div>
    </div>
  );
}

function turnPaperSheet(
  sheet: HTMLElement,
  direction: 1 | -1,
  commit: () => void,
  onDone?: () => void,
) {
  const finish = () => {
    onDone?.();
  };
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced || typeof sheet.animate !== "function" || !sheet.parentElement) {
    commit();
    finish();
    return;
  }

  const ghost = sheet.cloneNode(true) as HTMLElement;
  ghost.removeAttribute("id");
  ghost.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
  ghost.setAttribute("aria-hidden", "true");
  ghost.inert = true;
  ghost.classList.add("ae-paper-clone");
  ghost.style.height = `${sheet.getBoundingClientRect().height}px`;
  ghost.style.transformOrigin = direction > 0 ? "left center" : "right center";
  sheet.parentElement.appendChild(ghost);
  sheet.setAttribute("aria-busy", "true");
  commit();

  const angle = direction > 0 ? -78 : 78;
  const animation = ghost.animate(
    [
      { transform: "translate3d(0,0,0) rotateY(0deg)", opacity: 1 },
      {
        transform: `translate3d(${direction > 0 ? -36 : 36}px,0,0) rotateY(${angle}deg)`,
        opacity: 0,
      },
    ],
    { duration: 720, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" },
  );
  const settle = () => {
    ghost.remove();
    sheet.removeAttribute("aria-busy");
    finish();
  };
  animation.finished.then(settle).catch(settle);
}

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

/** UF-04: exactly four learning directions (DEC-019); select one, then Blueprint. */
export function ProposalsFeature() {
  const router = useRouter();
  const params = useSearchParams();
  const blockingActiveBuild = useRedirectIfActiveBuild();
  const [request, setRequest] = useState<LearningRequest | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [failure, setFailure] = useState<"directions" | "blueprint" | null>(null);
  const [pathScreen, setPathScreen] = useState<"off" | "wait" | "ready">("off");
  const [blueprintScreen, setBlueprintScreen] = useState<"off" | "wait" | "ready">("off");
  const [blueprintTargetId, setBlueprintTargetId] = useState<string | null>(null);
  const loadSeq = useRef(0);

  const requestId = params.get("request") ?? recallRequestId();
  const missing = !requestId;

  useJourneyStep(
    proposalsJourneyStep(
      request ? { ...request, selected_proposal_id: selectedId } : request,
    ),
  );

  const loadDirections = useCallback(() => {
    if (!requestId) {
      return;
    }
    const seq = ++loadSeq.current;
    void (async () => {
      try {
        const current = await learningRequests.get(requestId);
        if (seq !== loadSeq.current) {
          return;
        }
        rememberRequestId(current.id);
        if (current.state === "objective_confirmed") {
          setPathScreen("wait");
          const generated = await loadProposalsForRequest(requestId);
          if (seq !== loadSeq.current) {
            return;
          }
          setRequest(generated);
          setSelectedId(generated.selected_proposal_id);
          setFailure(null);
          setPathScreen("ready");
          setBusy(false);
          return;
        }
        if (current.state === "blueprint_generating" && current.blueprint_id) {
          setRequest(current);
          setSelectedId(current.selected_proposal_id);
          setBlueprintTargetId(current.blueprint_id);
          setBlueprintScreen("wait");
          setFailure(null);
          setBusy(false);
          return;
        }
        setRequest(current);
        setSelectedId(current.selected_proposal_id);
        setFailure(null);
        setBusy(false);
      } catch {
        if (seq !== loadSeq.current) {
          return;
        }
        setRequest(null);
        setPathScreen("off");
        setFailure("directions");
        setBusy(false);
      }
    })();
  }, [requestId]);

  useEffect(() => {
    loadDirections();
  }, [loadDirections]);

  useEffect(() => {
    if (blueprintScreen !== "wait" || !blueprintTargetId) {
      return;
    }
    let cancelled = false;
    const tick = () => {
      void blueprints.get(blueprintTargetId).then(
        (next) => {
          if (cancelled) {
            return;
          }
          if (next.state === "failed") {
            setBlueprintScreen("off");
            setFailure("blueprint");
            setBusy(false);
            return;
          }
          if (next.state !== "generating") {
            setBlueprintScreen("ready");
          }
        },
        () => {
          // A single poll miss should not drop the wait. The next tick retries.
        },
      );
    };
    tick();
    const handle = window.setInterval(tick, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
  }, [blueprintScreen, blueprintTargetId]);

  const selectPath = (proposalId: string) => {
    setSelectedId(proposalId);
  };

  const startBlueprint = async () => {
    if (!request || !selectedId) {
      return;
    }
    setBusy(true);
    try {
      if (request.selected_proposal_id !== selectedId) {
        setRequest(await learningRequests.selectProposal(request.id, selectedId));
      }
      const supabase = createClient();
      const { data } = await supabase.auth.getClaims();
      if (isAnonymousClaim(data?.claims as Record<string, unknown> | undefined)) {
        const next = `/proposals?request=${request.id}`;
        router.push(`/login?next=${encodeURIComponent(next)}`);
        setBusy(false);
        return;
      }
      const blueprint = await learningRequests.startBlueprint(request.id);
      setFailure(null);
      if (blueprint.state === "failed") {
        setFailure("blueprint");
        setBusy(false);
        return;
      }
      if (blueprint.state === "generating") {
        setBlueprintTargetId(blueprint.id);
        setBlueprintScreen("wait");
        setBusy(false);
        return;
      }
      router.push(`/blueprints/${blueprint.id}`);
    } catch {
      setBlueprintScreen("off");
      setFailure("blueprint");
      setBusy(false);
    }
  };

  const pathPreparing =
    pathScreen === "off" ? null : (
      <StagePreparing
        frameTitle="Your learning path"
        backHref={requestId ? `/onboarding?request=${requestId}` : "/onboarding"}
        backLabel="Learning objective"
        backAriaLabel="Back to your learning objective"
        heading="Your learning paths are taking shape"
        readyHeading="Your learning paths are ready"
        phases={PROPOSAL_PHASES}
        approachMs={PROPOSAL_APPROACH_MS}
        ready={pathScreen === "ready"}
        actionLabel="View learning paths"
        onContinue={() => setPathScreen("off")}
      />
    );

  const blueprintPreparing =
    blueprintScreen === "off" || !blueprintTargetId ? null : (
      <StagePreparing
        frameTitle="Blueprint"
        backHref={requestId ? `/proposals?request=${requestId}` : "/proposals"}
        backLabel="Learning paths"
        backAriaLabel="Back to your learning paths"
        heading="Your Blueprint is taking shape"
        readyHeading="Your Blueprint is ready"
        phases={BLUEPRINT_PHASES}
        approachMs={BLUEPRINT_APPROACH_MS}
        crawlMs={30000}
        ready={blueprintScreen === "ready"}
        actionLabel="Review the Blueprint"
        onContinue={() => router.push(`/blueprints/${blueprintTargetId}`)}
      />
    );

  if (blockingActiveBuild) {
    return <CheckingGenerationStatus />;
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

  if (pathScreen !== "off") {
    return pathPreparing;
  }

  if (!request) {
    if (failure === "directions") {
      return (
        <StageFailure
          {...stageFailureCopy.directions}
          busy={busy}
          onRetry={() => {
            setBusy(true);
            loadDirections();
          }}
          onBack={() => router.push(`/onboarding?request=${requestId}`)}
        />
      );
    }
    return (
      <div className="ae-status-check">
        <GenerationStatus
          title="Opening your learning paths"
          description="Loading the directions for this objective."
        />
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

  if (failure === "blueprint") {
    return (
      <StageFailure
        {...stageFailureCopy.blueprint}
        busy={busy}
        onRetry={() => {
          void startBlueprint();
        }}
        onBack={() => setFailure(null)}
      />
    );
  }

  return (
    <>
      {blueprintPreparing}
      <section className="caminos-h">
        <span className="paso-n">Your learning path</span>
        <h2>Choose a way in</h2>
        <p>One subject. Different ways to understand it.</p>
        {set?.recommendation_reason ? <p className="reco">{set.recommendation_reason}</p> : null}
      </section>

      {!set ? null : (
        <Paths
          proposals={set.proposals}
          recommendedId={set.recommended_proposal_id}
          selectedId={selectedId}
          busy={busy}
          blueprintId={request.blueprint_id}
          onSelect={selectPath}
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
  onSelect,
  onContinue,
}: {
  proposals: CourseProposal[];
  recommendedId: string | null;
  selectedId: string | null;
  busy: boolean;
  blueprintId: string | null;
  onSelect: (proposalId: string) => void;
  onContinue: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const motionRef = useRef<ReturnType<typeof createPathRouteMotion> | null>(null);
  const proposalsRef = useRef(proposals);
  const [openId, setOpenId] = useState<string | null>(null);
  const [paperPage, setPaperPage] = useState(0);
  const [routeClass, setRouteClass] = useState("");
  const turningRef = useRef(false);
  const proposalIds = proposals.map((proposal) => proposal.id).join();
  proposalsRef.current = proposals;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    const motion = createPathRouteMotion(root, {
      onOpen: (index) => {
        setPaperPage(0);
        setOpenId(proposalsRef.current[index]?.id ?? null);
      },
      onClose: () => {
        setPaperPage(0);
        setOpenId(null);
      },
      onClass: setRouteClass,
    });
    motionRef.current = motion;
    return () => {
      motion.dispose();
      motionRef.current = null;
    };
  }, [proposalIds]);

  const goPaperPage = (next: number) => {
    if (turningRef.current || next === paperPage || next < 0 || next > 1) {
      return;
    }
    const sheet = rootRef.current?.querySelector<HTMLElement>(
      ".ae-route-folder.on .ae-route-paper-visible",
    );
    const commit = () => setPaperPage(next);
    if (!sheet) {
      commit();
      return;
    }
    turningRef.current = true;
    turnPaperSheet(sheet, next > paperPage ? 1 : -1, commit, () => {
      turningRef.current = false;
    });
  };

  return (
    <>
      <div className={`ae-routes${routeClass ? ` ${routeClass}` : ""}`} ref={rootRef}>
        <div className="caminos">
          {proposals.map((proposal, index) => (
            <article
              className={`lomo${proposal.id === selectedId ? " is-selected" : ""}`}
              key={proposal.id}
              style={{ ["--ae-card-index" as string]: String(index) }}
            >
              <button
                className="ae-route-open"
                type="button"
                aria-expanded={openId === proposal.id}
                aria-controls={`ae-route-detail-${proposal.id}`}
                aria-label={`Open learning path: ${proposal.title}`}
                onClick={() => {
                  void motionRef.current?.open(index);
                }}
              >
                <span className="sol folder-tab">
                  <span className="folder-tab-label">
                    <span className="n">{String(index + 1).padStart(2, "0")}</span>
                    <span className="tt">{directionLabel(proposal)}</span>
                  </span>
                </span>
                <span className="caja">
                  <span className="abierto">
                    <b>{proposal.title}</b>
                    <span className="sint">{proposal.description}</span>
                    <span className="pie">
                      <span className="ae-route-meta">
                        {estimateLine(proposal)}
                      </span>
                      <span className="ver">Open learning path</span>
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
        <div className="ae-route-panels">
          {proposals.map((proposal, index) => (
            <article
              className={`ae-route-folder${openId === proposal.id ? " on" : ""}${proposal.id === selectedId ? " is-selected" : ""}`}
              id={`ae-route-detail-${proposal.id}`}
              key={proposal.id}
              inert={openId !== proposal.id}
              aria-labelledby={`ae-route-heading-${proposal.id}`}
            >
              <span className="folder-tab">
                <span className="folder-tab-label">
                  <span className="n">{String(index + 1).padStart(2, "0")}</span>
                  <span className="tt">{directionLabel(proposal)}</span>
                </span>
              </span>
              <div className="ae-route-spread">
                <div className="ae-route-summary">
                  <h3 id={`ae-route-heading-${proposal.id}`} tabIndex={-1}>
                    {proposal.title}
                  </h3>
                  <p>{proposal.description}</p>
                  {proposal.guiding_authors_or_traditions.length > 0 ? (
                    <p className="aut">
                      <span>Authors</span>
                      {proposal.guiding_authors_or_traditions.join(", ")}
                    </p>
                  ) : null}
                  <div className="ae-route-facts">
                    <div>
                      <b>{proposal.estimated_modules}</b>
                      modules
                    </div>
                    {(proposal.estimated_lessons ?? 0) > 0 ? (
                      <div>
                        <b>{proposal.estimated_lessons}</b>
                        lessons
                      </div>
                    ) : null}
                    <div>
                      <b>{durationLabel(proposal.estimated_duration)}</b>
                      duration
                    </div>
                  </div>
                </div>
                <RoutePaperStack
                  proposal={proposal}
                  paperPage={openId === proposal.id ? paperPage : 0}
                  onGoPaperPage={goPaperPage}
                />
                <div className="ae-route-actions">
                  <button
                    className="btn ae-route-choose"
                    type="button"
                    disabled={busy || proposal.id === selectedId}
                    onClick={() => {
                      onSelect(proposal.id);
                      motionRef.current?.close(true);
                    }}
                  >
                    {proposal.id === selectedId ? "Selected" : "Choose this path"}
                    {proposal.id === selectedId ? null : (
                      <span className="ar" aria-hidden="true" />
                    )}
                  </button>
                  <button
                    className="ae-route-close"
                    type="button"
                    onClick={() => {
                      motionRef.current?.close(false);
                    }}
                  >
                    Back to learning paths
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
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
    </>
  );
}
