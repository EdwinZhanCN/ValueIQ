import { createContext, useContext } from "react";

/** Whether Clarify can look up evidence in files here (set by the Clarify loader). */
export type EvidenceAvailability = {
  available: boolean;
  /** The local scripted model answers (VALUEIQ_MODEL=dry). */
  scripted: boolean;
  reason: string | null;
};

export const EvidenceContext = createContext<EvidenceAvailability>({
  available: false,
  scripted: false,
  reason: "Looking up evidence is not available here.",
});

export const useEvidence = () => useContext(EvidenceContext);
