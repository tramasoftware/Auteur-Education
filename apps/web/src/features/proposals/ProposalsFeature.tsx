"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { createPathRouteMotion } from "./pathRouteMotion";

import { proposalsJourneyStep, useJourneyStep } from "@/components/layout";
import { CheckingGenerationStatus } from "@/components/ui";
import { pathPreparingCopy, PreparingCourse } from "@/features/blueprint/PreparingCourse";
import { CourseSetupFrame } from "@/features/course-setup/CourseSetupFrame";
import {
  PROPOSAL_APPROACH_MS,
  PROPOSAL_PHASES,
  StagePreparing,
} from "@/features/course-setup/StagePreparing";
import { CourseStepLabel } from "@/features/course-setup/CourseStepLabel";
import { StageFailure, stageFailureCopy } from "@/features/course-setup/StageFailure";
import { useRedirectIfActiveBuild } from "@/hooks/useRedirectIfActiveBuild";
import { isAnonymousClaim } from "@/lib/auth/claims";
import { blueprints, courses, generateDirectionsOnce, learningRequests } from "@/lib/api";
import {
  peekLearningRequest,
  recallRequestId,
  rememberBlueprint,
  rememberLearningRequest,
} from "@/lib/session";
import { createClient } from "@/lib/supabase/browser";
import type { Course, CourseProposal, LearningRequest } from "@/types/generator";

function courseOutlineReady(course: Course): boolean {
  return (
    course.title.trim().length > 0 &&
    course.modules.some(
      (module) => module.title.trim().length > 0 && module.lessons.length > 0,
    )
  );
}

const FOLDER_COLORS = ["#C6D4DF", "#372018", "#D4CBC2", "#243044"] as const;
const DARK_FOLDER_COLORS = new Set<string>(["#372018", "#243044"]);

function folderTone(index: number): { color: string; dark: boolean } {
  const color = FOLDER_COLORS[index % FOLDER_COLORS.length] ?? FOLDER_COLORS[0];
  return { color, dark: DARK_FOLDER_COLORS.has(color) };
}

function firstSentence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^[\s\S]+?[.!?](?=\s|$)/);
  return (match?.[0] ?? trimmed).trim();
}

function estimateLine(proposal: CourseProposal): string {
  const parts = [`${proposal.estimated_modules} modules`];
  if ((proposal.estimated_lessons ?? 0) > 0) {
    parts.push(`${proposal.estimated_lessons} lessons`);
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

/** Dedupe is inside generateDirectionsOnce (DEC-021). */
async function loadDirectionsForRequest(requestId: string): Promise<LearningRequest> {
  const current = await learningRequests.get(requestId);
  if (
    current.proposals &&
    current.state !== "objective_confirmed" &&
    current.state !== "objective_confirmation"
  ) {
    return current;
  }
  if (
    current.state !== "objective_confirmed" &&
    current.state !== "objective_confirmation"
  ) {
    return current;
  }
  return generateDirectionsOnce(requestId, current.state);
}

/** UF-04: exactly four learning directions (DEC-019); select one, then the course. */
export function ProposalsFeature() {
  const router = useRouter();
  const params = useSearchParams();
  const requestId = params.get("request") ?? recallRequestId();
  const missing = !requestId;
  const cachedRequest = requestId ? peekLearningRequest(requestId) : null;
  const resumeBlueprint =
    cachedRequest?.state === "blueprint_generating" && cachedRequest.blueprint_id
      ? cachedRequest.blueprint_id
      : null;
  const [courseScreen, setCourseScreen] = useState<"off" | "wait">(
    resumeBlueprint ? "wait" : "off",
  );
  const blockingActiveBuild = useRedirectIfActiveBuild(courseScreen === "off");
  const cachedDirections =
    cachedRequest != null &&
    cachedRequest.proposals != null &&
    cachedRequest.state !== "objective_confirmed"
      ? cachedRequest
      : null;
  const [request, setRequest] = useState<LearningRequest | null>(cachedDirections);
  const [selectedId, setSelectedId] = useState<string | null>(
    cachedDirections?.selected_proposal_id ?? null,
  );
  const [busy, setBusy] = useState(cachedDirections == null && requestId != null);
  const [failure, setFailure] = useState<"directions" | "blueprint" | null>(null);
  const [pathScreen, setPathScreen] = useState<"off" | "wait" | "ready">(() =>
    cachedDirections ? "off" : requestId ? "wait" : "off",
  );
  const [blueprintTargetId, setBlueprintTargetId] = useState<string | null>(resumeBlueprint);
  const [outlineReady, setOutlineReady] = useState(false);
  const [courseHref, setCourseHref] = useState<string | null>(null);
  const [folderOpen, setFolderOpen] = useState(false);
  const loadSeq = useRef(0);

  useJourneyStep(
    proposalsJourneyStep(
      request ? { ...request, selected_proposal_id: selectedId } : request,
    ),
  );

  const loadDirections = useCallback(() => {
    if (!requestId) {
      return;
    }
    if (
      request?.id === requestId &&
      request.proposals &&
      request.state !== "objective_confirmed"
    ) {
      return;
    }
    const seq = ++loadSeq.current;
    void (async () => {
      try {
        const current = await learningRequests.get(requestId);
        if (seq !== loadSeq.current) {
          return;
        }
        rememberLearningRequest(current);
        if (
          current.state === "objective_confirmed" ||
          current.state === "objective_confirmation"
        ) {
          setPathScreen("wait");
          const generated = await loadDirectionsForRequest(requestId);
          if (seq !== loadSeq.current) {
            return;
          }
          rememberLearningRequest(generated);
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
          setOutlineReady(false);
          setCourseHref(null);
          setCourseScreen("wait");
          setPathScreen("off");
          setFailure(null);
          setBusy(false);
          return;
        }
        setRequest(current);
        setSelectedId(current.selected_proposal_id);
        setPathScreen("off");
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
  }, [request, requestId]);

  useEffect(() => {
    loadDirections();
  }, [loadDirections]);

  useEffect(() => {
    if (courseScreen !== "wait" || !blueprintTargetId || outlineReady) {
      return;
    }
    let cancelled = false;
    const tick = () => {
      void blueprints.get(blueprintTargetId).then(
        (next) => {
          if (cancelled) {
            return;
          }
          rememberBlueprint(next);
          if (next.state === "failed") {
            setCourseScreen("off");
            setFailure("blueprint");
            setBusy(false);
            return;
          }
          if (!next.course_id) {
            return;
          }
          void courses.get(next.course_id).then(
            (course) => {
              if (cancelled || !courseOutlineReady(course)) {
                return;
              }
              setCourseHref(`/courses/${course.id}`);
              setOutlineReady(true);
            },
            () => {
              // A single poll miss should not drop the wait. The next tick retries.
            },
          );
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
  }, [courseScreen, blueprintTargetId, outlineReady]);

  const togglePath = (proposalId: string) => {
    setSelectedId((current) => (current === proposalId ? null : proposalId));
  };

  const startBlueprint = async (proposalId?: string) => {
    const id = proposalId ?? selectedId;
    if (!request || !id) {
      return;
    }
    setSelectedId(id);
    setFailure(null);
    setOutlineReady(false);
    setCourseHref(null);
    setCourseScreen("wait");
    setBusy(true);
    try {
      if (request.selected_proposal_id !== id) {
        const selected = await learningRequests.selectProposal(request.id, id);
        rememberLearningRequest(selected);
        setRequest(selected);
      }
      const supabase = createClient();
      const { data } = await supabase.auth.getClaims();
      if (isAnonymousClaim(data?.claims as Record<string, unknown> | undefined)) {
        setCourseScreen("off");
        const next = `/proposals?request=${request.id}`;
        router.push(`/login?next=${encodeURIComponent(next)}`);
        setBusy(false);
        return;
      }
      const blueprint = await learningRequests.startBlueprint(request.id);
      rememberBlueprint(blueprint);
      if (blueprint.state === "failed") {
        setCourseScreen("off");
        setFailure("blueprint");
        setBusy(false);
        return;
      }
      setBlueprintTargetId(blueprint.id);
      setBusy(false);
    } catch {
      setCourseScreen("off");
      setFailure("blueprint");
      setBusy(false);
    }
  };

  const pathPreparing =
    pathScreen === "off" ? null : (
      <StagePreparing
        frameTitle="Your learning path"
        backHref={requestId ? `/onboarding?request=${requestId}` : "/onboarding"}
        backLabel="Onboarding"
        backAriaLabel="Back to onboarding"
        heading="Your learning paths are taking shape"
        readyHeading="Your learning paths are ready"
        phases={PROPOSAL_PHASES}
        approachMs={PROPOSAL_APPROACH_MS}
        ready={pathScreen === "ready"}
        onContinue={() => setPathScreen("off")}
      />
    );

  const selectedProposal = request?.proposals?.proposals.find(
    (proposal) => proposal.id === (selectedId ?? request.selected_proposal_id),
  );
  const coursePreparing =
    courseScreen === "off"
      ? null
      : createPortal(
          <div className="preparing-overlay">
            <CourseSetupFrame
              title="Generating course"
              backHref={requestId ? `/proposals?request=${requestId}` : "/proposals"}
              backLabel="Learning paths"
              backAriaLabel="Back to your learning paths"
              onBackClick={() => setCourseScreen("off")}
              mainClassName="preparing-main"
              screenClassName="preparing-screen"
            >
              <PreparingCourse
                {...pathPreparingCopy(selectedProposal?.title ?? "Your course")}
                courseReady={outlineReady}
                onReady={() => {
                  if (courseHref) {
                    router.replace(courseHref);
                  }
                }}
              />
            </CourseSetupFrame>
          </div>,
          document.body,
        );

  if (blockingActiveBuild) {
    return <CheckingGenerationStatus />;
  }

  if (missing) {
    return (
      <section className="caminos-h">
        <CourseStepLabel step={2} label="Learning path" tight />
        <h2>Choose a way in</h2>
        <p>Start with a question. Learning paths appear once that question is ready.</p>
        <Link className="btn" href="/onboarding?new=1">
          Create a course
          <span className="ar" aria-hidden="true" />
        </Link>
      </section>
    );
  }

  if (courseScreen === "wait") {
    return coursePreparing;
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
            setPathScreen("wait");
            loadDirections();
          }}
          onBack={() => router.push(`/onboarding?request=${requestId}`)}
        />
      );
    }
    return pathPreparing;
  }

  if (!request.objective?.confirmed) {
    return (
      <section className="caminos-h">
        <CourseStepLabel step={2} label="Learning path" tight />
        <h2>Finish your question first</h2>
        <p>Learning paths are built after your intention is ready.</p>
        <Link className="btn" href={`/onboarding?request=${request.id}`}>
          Back to onboarding
          <span className="ar" aria-hidden="true" />
        </Link>
      </section>
    );
  }

  const set = request.proposals;

  if (failure === "blueprint") {
    return (
      <StageFailure
        {...stageFailureCopy.course}
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
      {coursePreparing}
      {folderOpen ? null : (
        <section className="caminos-h">
          <CourseStepLabel step={2} label="Learning path" tight />
          <h2>One subject. Different ways to understand it.</h2>
          {set?.recommendation_reason ? <p className="reco">{set.recommendation_reason}</p> : null}
        </section>
      )}

      {!set ? null : (
        <Paths
          proposals={set.proposals}
          selectedId={selectedId}
          busy={busy}
          courseId={request.course_id}
          onToggle={togglePath}
          onContinue={startBlueprint}
          onFolderOpenChange={setFolderOpen}
        />
      )}
    </>
  );
}

function Paths({
  proposals,
  selectedId,
  busy,
  courseId,
  onToggle,
  onContinue,
  onFolderOpenChange,
}: {
  proposals: CourseProposal[];
  selectedId: string | null;
  busy: boolean;
  courseId: string | null;
  onToggle: (proposalId: string) => void;
  onContinue: (proposalId?: string) => void;
  onFolderOpenChange: (open: boolean) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const motionRef = useRef<ReturnType<typeof createPathRouteMotion> | null>(null);
  const proposalsRef = useRef(proposals);
  const [openId, setOpenId] = useState<string | null>(null);
  const [paperPage, setPaperPage] = useState(0);
  const [routeClass, setRouteClass] = useState("");
  const turningRef = useRef(false);
  const proposalIds = proposals.map((proposal) => proposal.id).join();

  useEffect(() => {
    proposalsRef.current = proposals;
  }, [proposals]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    const motion = createPathRouteMotion(root, {
      onOpen: (index) => {
        setPaperPage(0);
        setOpenId(proposalsRef.current[index]?.id ?? null);
        onFolderOpenChange(true);
      },
      onClose: () => {
        setPaperPage(0);
        setOpenId(null);
        onFolderOpenChange(false);
      },
      onClass: setRouteClass,
    });
    motionRef.current = motion;
    return () => {
      motion.dispose();
      motionRef.current = null;
    };
  }, [onFolderOpenChange, proposalIds]);

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
          {proposals.map((proposal, index) => {
            const tone = folderTone(index);
            const selected = proposal.id === selectedId;
            return (
            <article
              className={`lomo${tone.dark ? " is-dark" : ""}${selected ? " is-selected" : ""}`}
              key={proposal.id}
              style={{
                ["--ae-card-index" as string]: String(index),
                ["--folder" as string]: tone.color,
              }}
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
                    <span className="n">#{index + 1}</span>
                  </span>
                </span>
                <span className="caja">
                  <span className="abierto">
                    <b>{proposal.title}</b>
                    <span className="sint">{firstSentence(proposal.description)}</span>
                    <span className="pie">
                      <span className="ae-route-meta">
                        {estimateLine(proposal)}
                      </span>
                      <span className="ver">Open learning path</span>
                    </span>
                  </span>
                </span>
              </button>
              <button
                className="marca-path"
                type="button"
                aria-pressed={selected}
                onClick={() => onToggle(proposal.id)}
              >
                {selected ? "Selected" : "Choose this path"}
              </button>
            </article>
            );
          })}
        </div>
        <div className="ae-route-panels">
          {proposals.map((proposal, index) => {
            const tone = folderTone(index);
            return (
            <article
              className={`ae-route-folder${openId === proposal.id ? " on" : ""}${tone.dark ? " is-dark" : ""}${proposal.id === selectedId ? " is-selected" : ""}`}
              id={`ae-route-detail-${proposal.id}`}
              key={proposal.id}
              inert={openId !== proposal.id}
              aria-labelledby={`ae-route-heading-${proposal.id}`}
              style={{ ["--folder" as string]: tone.color }}
            >
              <span className="folder-tab">
                <span className="folder-tab-label">
                  <span className="n">#{index + 1}</span>
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
                    disabled={busy}
                    onClick={() => onContinue(proposal.id)}
                  >
                    Choose &amp; Confirm this path
                    <span className="ar" aria-hidden="true" />
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
            );
          })}
        </div>
      </div>
      <div className="cierre-o">
        <div className="acciones">
          {courseId ? (
            <Link className="btn" href={`/courses/${courseId}`}>
              Open your course
              <span className="ar" aria-hidden="true" />
            </Link>
          ) : (
            <button className="btn" type="button" disabled={busy || !selectedId} onClick={() => onContinue()}>
              Generate the course
              <span className="ar" aria-hidden="true" />
            </button>
          )}
          <span className="nota">
            {selectedId ? "This path will shape the course." : "Choose a learning path to continue."}
          </span>
        </div>
      </div>
    </>
  );
}
