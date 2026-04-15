import { PitStudio } from "@/components/pit-studio";
import type { InitialStudioState } from "@/lib/pit-studio-state";

export function PitStudioEntry({
  initialState,
}: {
  initialState: InitialStudioState;
}) {
  return <PitStudio initialState={initialState} />;
}
