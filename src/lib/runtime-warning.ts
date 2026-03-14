import type { PitTurn } from "@/lib/pit";

export type RuntimeTurnIdentity = {
  speakerId: string;
  kind: PitTurn["kind"];
  round?: number;
};

export type RuntimeWarningNotice = RuntimeTurnIdentity & {
  message: string;
};

export function isSameRuntimeTurn(
  left: RuntimeTurnIdentity | null | undefined,
  right: RuntimeTurnIdentity | null | undefined,
): boolean {
  return (
    left !== null &&
    left !== undefined &&
    right !== null &&
    right !== undefined &&
    left.speakerId === right.speakerId &&
    left.kind === right.kind &&
    left.round === right.round
  );
}

export function shouldDisplayRuntimeWarning(
  warning: RuntimeWarningNotice | null,
  activeTurn: RuntimeTurnIdentity | null,
): boolean {
  if (!warning) {
    return false;
  }

  return isSameRuntimeTurn(warning, activeTurn);
}
