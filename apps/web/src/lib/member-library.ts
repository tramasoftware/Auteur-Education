import { peekCourseList } from "@/lib/api";
import { peekCurrentUserId, readMemberDisplay } from "@/lib/member-display";
import type { CourseList } from "@/types/generator";

/** Library already in this tab, or the last one stored for the signed-in member. */
export function libraryOnHand(): CourseList | null {
  const memory = peekCourseList();
  if (memory) {
    return memory;
  }
  const userId = peekCurrentUserId();
  if (!userId) {
    return null;
  }
  return readMemberDisplay(userId)?.library ?? null;
}
