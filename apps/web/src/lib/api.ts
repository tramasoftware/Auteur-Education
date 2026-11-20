import type { HealthResponse } from "@/types/health";
import type {
  ApiErrorBody,
  Blueprint,
  Course,
  CourseDiagnostics,
  CourseList,
  CourseStatus,
  CourseModule,
  CourseProgress,
  CreateLearningRequest,
  ErrorCode,
  LearningRequest,
  Lesson,
  LessonAudioPlayback,
  LessonAudioProgress,
  LessonAudioStatus,
} from "@/types/generator";

import { ensureAccessToken } from "@/lib/auth/session";
import { onMemberSessionClear } from "@/lib/member-display";
import { apiUrl } from "@/lib/public-url";

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
  const token = path === "/health" ? null : await ensureAccessToken();
  try {
    response = await fetch(apiUrl(`/api/v1${path}`), {
      cache: "no-store",
      ...init,
      headers: {
        ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
      if ((response.headers.get("content-type") ?? "").includes("application/json")) {
        body = (await response.json()) as ApiErrorBody;
      }
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

  if (!(response.headers.get("content-type") ?? "").includes("application/json")) {
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

function put<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: "PUT",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export type AccountProfile = {
  first_name: string | null;
  last_name: string | null;
  birth_date: string | null;
  gender: string | null;
  avatar_url: string | null;
  image_url: string | null;
  text_size: string | null;
  generated_course_count: number;
};

let accountProfile: AccountProfile | null = null;
let profileRequest: Promise<AccountProfile> | null = null;
let profileRevision = 0;
let courseList: CourseList | null = null;
let courseListRequest: Promise<CourseList> | null = null;

export function peekAccountProfile(): AccountProfile | null {
  return accountProfile;
}

export function peekCourseList(): CourseList | null {
  return courseList;
}

function rememberProfile(profile: AccountProfile): AccountProfile {
  profileRevision += 1;
  accountProfile = profile;
  return profile;
}

function clearReadCaches(): void {
  profileRevision += 1;
  accountProfile = null;
  profileRequest = null;
  courseList = null;
  courseListRequest = null;
}

onMemberSessionClear(clearReadCaches);

export function getAccountProfile(): Promise<AccountProfile> {
  if (!profileRequest) {
    const started = profileRevision;
    profileRequest = request<AccountProfile>("/auth/profile")
      .then((profile) => {
        if (profileRevision !== started) {
          return accountProfile ?? profile;
        }
        accountProfile = profile;
        return profile;
      })
      .finally(() => {
        profileRequest = null;
      });
  }
  return profileRequest;
}

export function updateAccountProfile(profile: {
  first_name: string;
  last_name: string;
  birth_date: string;
  gender: string;
}): Promise<AccountProfile> {
  return request<AccountProfile>("/auth/profile", {
    method: "PATCH",
    body: JSON.stringify(profile),
  }).then(rememberProfile);
}

export function updateAccountTextSize(textSize: string): Promise<AccountProfile> {
  return request<AccountProfile>("/auth/profile/text-size", {
    method: "PATCH",
    body: JSON.stringify({ text_size: textSize }),
  }).then(rememberProfile);
}

function sendAccountPhoto(method: "POST" | "PUT", file: File): Promise<AccountProfile> {
  const body = new FormData();
  body.append("file", file);
  return request<AccountProfile>("/auth/profile/photo", { method, body }).then(rememberProfile);
}

export function createAccountPhoto(file: File): Promise<AccountProfile> {
  return sendAccountPhoto("POST", file);
}

export function updateAccountPhoto(file: File): Promise<AccountProfile> {
  return sendAccountPhoto("PUT", file);
}

export function deleteAccountPhoto(): Promise<AccountProfile> {
  return request<AccountProfile>("/auth/profile/photo", { method: "DELETE" }).then(rememberProfile);
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
  generateDirections: (id: string) =>
    post<LearningRequest>(`/learning-requests/${id}/directions`),
  selectProposal: (id: string, proposalId: string) =>
    post<LearningRequest>(`/learning-requests/${id}/proposals/select`, {
      proposal_id: proposalId,
    }),
  startBlueprint: (id: string) =>
    post<Blueprint>(`/learning-requests/${id}/blueprint`),
};

const directionsInflight = new Map<string, { key: string; promise: Promise<LearningRequest> }>();

/** One in-flight directions call per request and precision key (DEC-021). */
export function generateDirectionsOnce(id: string, key = "current"): Promise<LearningRequest> {
  const existing = directionsInflight.get(id);
  if (existing && existing.key === key) {
    return existing.promise;
  }
  const promise = learningRequests.generateDirections(id).finally(() => {
    const current = directionsInflight.get(id);
    if (current?.promise === promise) {
      directionsInflight.delete(id);
    }
  });
  directionsInflight.set(id, { key, promise });
  return promise;
}

// --- Blueprints (UF-04) ---

export const blueprints = {
  get: (id: string) => request<Blueprint>(`/blueprints/${id}`),
};

// --- Courses (UF-06, UF-07) ---

export type ActiveGeneration = {
  course_id: string | null;
};

let activeGenerationRequest: Promise<ActiveGeneration> | null = null;

export const courses = {
  list: () => {
    if (!courseListRequest) {
      courseListRequest = request<CourseList>("/courses")
        .then((body) => {
          courseList = body;
          return body;
        })
        .finally(() => {
          courseListRequest = null;
        });
    }
    return courseListRequest;
  },
  activeGeneration: () => {
    if (!activeGenerationRequest) {
      activeGenerationRequest = request<ActiveGeneration>("/courses/active-generation").finally(
        () => {
          activeGenerationRequest = null;
        },
      );
    }
    return activeGenerationRequest;
  },
  get: (courseId: string) => request<Course>(`/courses/${courseId}`),
  status: (courseId: string) => request<CourseStatus>(`/courses/${courseId}/status`),
  getModule: (courseId: string, moduleId: string) =>
    request<CourseModule>(`/courses/${courseId}/modules/${moduleId}`),
  getLesson: (courseId: string, moduleId: string, lessonId: string) =>
    request<Lesson>(
      `/courses/${courseId}/modules/${moduleId}/lessons/${lessonId}`,
    ),
  getDiagnostics: (courseId: string) =>
    request<CourseDiagnostics>(`/courses/${courseId}/diagnostics`),
  retry: (courseId: string) => post<Course>(`/courses/${courseId}/retry`),
  progress: (courseId: string) =>
    request<CourseProgress>(`/courses/${courseId}/progress`),
  setLessonRead: (
    courseId: string,
    lessonId: string,
    body: { read: boolean; updated_at: string | null },
  ) =>
    put<CourseProgress>(`/courses/${courseId}/lessons/${lessonId}/read`, body),
  visitLesson: (courseId: string, lessonId: string, positionRevision: number) =>
    put<CourseProgress>(`/courses/${courseId}/lessons/${lessonId}/visit`, {
      position_revision: positionRevision,
    }),
  presentSynthesis: (courseId: string) =>
    post<CourseProgress>(`/courses/${courseId}/synthesis-presentation`),
  requestLessonAudio: (courseId: string, moduleId: string, lessonId: string) =>
    post<LessonAudioStatus>(
      `/courses/${courseId}/modules/${moduleId}/lessons/${lessonId}/audio`,
    ),
  getLessonAudio: (courseId: string, moduleId: string, lessonId: string) =>
    request<LessonAudioStatus>(
      `/courses/${courseId}/modules/${moduleId}/lessons/${lessonId}/audio`,
    ),
  getLessonAudioPlayback: (courseId: string, moduleId: string, lessonId: string) =>
    request<LessonAudioPlayback>(
      `/courses/${courseId}/modules/${moduleId}/lessons/${lessonId}/audio/playback`,
    ),
  saveLessonAudioProgress: (
    courseId: string,
    moduleId: string,
    lessonId: string,
    body: LessonAudioProgress,
  ) =>
    put<LessonAudioProgress>(
      `/courses/${courseId}/modules/${moduleId}/lessons/${lessonId}/audio/progress`,
      body,
    ),
  retryLessonAudio: (courseId: string, moduleId: string, lessonId: string) =>
    post<LessonAudioStatus>(
      `/courses/${courseId}/modules/${moduleId}/lessons/${lessonId}/audio/retry`,
    ),
};

export type BillingOffer = {
  version_id: string;
  code: string;
  display_name: string;
  kind: "one_time" | "subscription";
  credits: number;
  currency: string;
  amount_cents: number;
  provisional: boolean;
  checkout_ready: boolean;
};

export type BillingAccount = {
  balance: number;
  has_customer: boolean;
  provisional: boolean;
  subscription: {
    status: string;
    cancel_at_period_end: boolean;
    current_period_end: string | null;
  } | null;
  payments: {
    status: string;
    amount_cents: number;
    currency: string;
    created_at: string;
  }[];
  movements: {
    entry_type: string;
    credits: number;
    delta: number;
    created_at: string;
  }[];
};

export const billing = {
  offers: () => request<{ offers: BillingOffer[]; provisional: boolean }>("/billing/offers"),
  account: () => request<BillingAccount>("/billing/account"),
  checkout: (offerVersionId: string) =>
    post<{ url: string }>("/billing/checkout", { offer_version_id: offerVersionId }),
  portal: () => post<{ url: string }>("/billing/portal"),
};
