/** Replies of Clarify's "Find in file" (POST /projects/:projectId/evidence). */
export type EvidenceCandidate = {
  quote: string;
  /** Where in the file: "Summary!A5:B5", "page 2", "p4". */
  location: string;
  value_in_quote: string;
  parsed_value: number | null;
  /** How the number in the quote compares with the value in the form. */
  form_check: "matches" | "differs" | "form_value_unknown" | "not_a_number";
  note?: string;
};

export type EvidenceReply =
  | {
      ok: true;
      fileName: string;
      /** The local scripted model picked the passages (VALUEIQ_MODEL=dry). */
      scripted: boolean;
      candidates: EvidenceCandidate[];
      rejected: number;
    }
  | { ok: false; code: string; message: string };
