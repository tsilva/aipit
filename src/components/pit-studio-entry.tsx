import { PitStudio, type InitialStudioState } from "@/components/pit-studio";

export function PitStudioEntry({
  initialState,
}: {
  initialState: InitialStudioState;
}) {
  return <PitStudio initialState={initialState} />;
}
