import { JourneyFrame } from "@/components/layout";
import { BlueprintFeature } from "@/features/blueprint";
import { CourseStepLabel } from "@/features/course-setup/CourseStepLabel";

type BlueprintPageProps = {
  params: Promise<{ id: string }>;
};

export default async function BlueprintPage({ params }: BlueprintPageProps) {
  const { id } = await params;

  return (
    <JourneyFrame
      showProgress={false}
      eyebrow={<CourseStepLabel step={4} label="Your Blueprint" />}
      title="Blueprint"
      description="The pedagogical contract for your course: what will be taught, what is left out, how it progresses, and why. Review it before the course is built."
    >
      <BlueprintFeature blueprintId={id} />
    </JourneyFrame>
  );
}
