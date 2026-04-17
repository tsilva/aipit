"use client";

export const SIMULATION_ACKNOWLEDGEMENT_KEY = "aipit.simulation-acknowledgement";
export const SIMULATION_ACKNOWLEDGEMENT_VALUE = "acknowledged";
const SIMULATION_ACKNOWLEDGEMENT_EVENT = "aipit:simulation-acknowledgement-change";

export function hasAcknowledgedSimulationNotice(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(SIMULATION_ACKNOWLEDGEMENT_KEY) === SIMULATION_ACKNOWLEDGEMENT_VALUE;
  } catch {
    return false;
  }
}

export function acknowledgeSimulationNotice(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    window.localStorage.setItem(SIMULATION_ACKNOWLEDGEMENT_KEY, SIMULATION_ACKNOWLEDGEMENT_VALUE);
    window.dispatchEvent(new Event(SIMULATION_ACKNOWLEDGEMENT_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function subscribeToSimulationAcknowledgement(callback: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  window.addEventListener(SIMULATION_ACKNOWLEDGEMENT_EVENT, callback);
  window.addEventListener("storage", callback);

  return () => {
    window.removeEventListener(SIMULATION_ACKNOWLEDGEMENT_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}
