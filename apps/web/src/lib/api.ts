import type { HealthResponse } from "@/types/health";
import type {
  ApiErrorBody,
  ApproveBlueprintResponse,
  Blueprint,
  Course,
  CourseDiagnostics,
  CourseModule,
  CreateLearningRequest,
  ErrorCode,
  LearningRequest,
  Lesson,
} from "@/types/generator";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  code: ErrorCode | "network_error";
  status: number;
  supportReference: string | null;
  details: { field: string | null; issue: string }[];

  constructor(
    status: number,
    code: ErrorCode | "network_error",
    message: string,
    supportReference: string | null = null,
    details: { field: string | null; issue: string }[] = [],
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.supportReference = supportReference;
    this.details = details;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/v1${path}`, {
      cache: "no-store",
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(
      0,
      "network_error",
      "The Auteur API is unreachable. Check that the backend is running.",
    );
  }

  if (!response.ok) {
    let body: ApiErrorBody | null = null;
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      body = null;
    }
    if (body?.error) {
      throw new ApiError(
        response.status,
        body.error.code,
        body.error.message,
        body.error.support_reference,
        body.error.details,
      );
    }
    throw new ApiError(
      response.status,
      "internal_error",
      `Request failed with status ${response.status}.`,
    );
  }

  return response.json() as Promise<T>;
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/health");
}

// --- Learning requests (UF-01..UF-03, UF-05) ---

export const learningRequests = {
  create: (payload: CreateLearningRequest) =>
    post<LearningRequest>("/learning-requests", payload),
  get: (id: string) => request<LearningRequest>(`/learning-requests/${id}`),
  choosePrecision: (
    id: string,
    payload: { option_id?: string; free_text?: string },
  ) => post<LearningRequest>(`/learning-requests/${id}/precision`, payload),
  confirmObjective: (id: string, version: number) =>
    post<LearningRequest>(`/learning-requests/${id}/objective/confirm`, {
      version,
    }),
  reviseObjective: (id: string, feedback: string) =>
    post<LearningRequest>(`/learning-requests/${id}/objective/revisions`, {
      feedback,
    }),
  generateProposals: (id: string) =>
    post<LearningRequest>(`/learning-requests/${id}/proposals`),
  selectProposal: (id: string, proposalId: string) =>
    post<LearningRequest>(`/learning-requests/${id}/proposals/select`, {
      proposal_id: proposalId,
    }),
  startBlueprint: (id: string) =>
    post<Blueprint>(`/learning-requests/${id}/blueprint`),
};

// --- Blueprints (UF-04) ---

export const blueprints = {
  get: (id: string) => request<Blueprint>(`/blueprints/${id}`),
  revise: (id: string, feedback: string) =>
    post<Blueprint>(`/blueprints/${id}/revisions`, { feedback }),
  approve: (id: string, version: number) =>
    post<ApproveBlueprintResponse>(`/blueprints/${id}/approve`, { version }),
};

// --- Courses (UF-06, UF-07) ---

export const courses = {
  get: (courseId: string) => request<Course>(`/courses/${courseId}`),
  getModule: (courseId: string, moduleId: string) =>
    request<CourseModule>(`/courses/${courseId}/modules/${moduleId}`),
  getLesson: (courseId: string, moduleId: string, lessonId: string) =>
    request<Lesson>(
      `/courses/${courseId}/modules/${moduleId}/lessons/${lessonId}`,
    ),
  getDiagnostics: (courseId: string) =>
    request<CourseDiagnostics>(`/courses/${courseId}/diagnostics`),
};
