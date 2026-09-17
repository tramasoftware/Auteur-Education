import type {
  BlueprintState,
  CourseState,
  ModuleState,
  RequestState,
} from "@/types/generator";

/** Display labels for the functional states named in USER_FLOWS.md. */

export const requestStateLabel: Record<RequestState, string> = {
  draft: "Draft",
  incompatible: "Incompatible",
  precision_required: "Precision required",
  objective_confirmation: "Objective confirmation",
  objective_confirmed: "Objective confirmed",
  proposals_ready: "Proposals ready",
  proposal_selected: "Proposal selected",
  blueprint_generating: "Generating Blueprint",
  awaiting_approval: "Awaiting approval",
  approved: "Approved",
};

export const blueprintStateLabel: Record<BlueprintState, string> = {
  generating: "Generating",
  awaiting_approval: "Awaiting approval",
  approved: "Approved",
  failed: "Failed",
};

export const courseStateLabel: Record<CourseState, string> = {
  queued: "Queued",
  researching: "Researching",
  writing: "Writing",
  reviewing: "Reviewing",
  partially_available: "Partially available",
  complete: "Complete",
  failed: "Failed",
};

export const moduleStateLabel: Record<ModuleState, string> = {
  queued: "Queued",
  researching: "Researching",
  writing: "Writing",
  reviewing: "Reviewing",
  published: "Published",
  failed: "Failed",
  not_built: "Not built (demo limit)",
};
