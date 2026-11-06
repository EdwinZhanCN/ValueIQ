import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import type {
  Backing,
  FormContext,
  FormFile,
  FormIssue,
  Goal,
  Input,
} from "../../../shared/form";
import { DEFAULTS } from "../../lib/intake-fields";
import { readFormDraft, validateFormFile } from "../../lib/intake-form";
import {
  FIELD_ERROR_CODES,
  GOAL_SCOPED,
  NOT_SURE_NOTE,
  RELATED_AFTER,
  hasNaN,
  pathsOf,
  pretty,
  recordFromText,
  sectionsFor,
  type Paths,
} from "./draft";

export type DraftFile = { id: string; name: string; description: string };
type SaveResult = { error: string | null; saved: boolean; conflict?: true };

/**
 * Editable state for one project's saved form: loads the draft once, keeps
 * typed text apart from accepted records, and saves the whole form to
 * `/projects/:id/form` with the edit-conflict check (`savedAt`). Drafts may be
 * incomplete; `validateFormFile` decides readiness.
 */
export function useFormDraft({
  projectId,
  initial,
  savedAt,
  files,
  onDirty,
}: {
  projectId: string;
  initial: unknown;
  savedAt: string | null;
  files: readonly DraftFile[];
  onDirty?: () => void;
}) {
  const [start] = useState(() => {
    const form = readFormDraft(initial);
    return { form, paths: pathsOf(form) };
  });
  const [goals, setGoalsState] = useState<Goal[]>(start.form.goals);
  const [currency, setCurrencyState] = useState(start.form.currency);
  const startHorizon = start.form.horizon_years
    ? String(start.form.horizon_years)
    : "";
  const [horizon, setHorizonState] = useState(startHorizon);
  const acceptedHorizon = useRef(startHorizon);
  const [records, setRecords] = useState<Input[]>(start.form.inputs);
  const [raw, setRaw] = useState<Record<string, string>>({});
  const [notes, setNotesState] = useState(start.form.other_notes);
  const [plans, setPlans] = useState<FormFile["measurement_plan"]>(
    start.form.measurement_plan,
  );
  const [asked, setAsked] = useState<string[]>(start.form.asked);
  // File id -> the description this form gives it. Only uploaded files.
  const [fileNotes, setFileNotesState] = useState<Record<string, string>>(
    start.form.file_descriptions,
  );
  const [issues, setIssues] = useState<FormIssue[]>([]);
  const [unsaved, setUnsaved] = useState(false);
  const [paths, setPathsState] = useState<Paths>(start.paths);

  // Local time only after hydration: the server's time zone differs.
  const [savedLabel, setSavedLabel] = useState(savedAt ? "Saved" : "");
  useEffect(() => {
    setSavedLabel(savedAt ? `Saved ${new Date(savedAt).toLocaleString()}` : "");
  }, [savedAt]);
  const saver = useFetcher<SaveResult>();
  const saving = saver.state !== "idle";
  const saved = saver.state === "idle" ? saver.data : undefined;
  useEffect(() => {
    if (saved?.saved) setUnsaved(false);
  }, [saved]);
  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  const context: FormContext = {
    projectId,
    files: files.map((file) => ({ id: file.id, projectId })),
  };
  const sections = sectionsFor(goals, paths);
  const visible = new Set(sections.flatMap((section) => section.ids));
  const byId = new Map(records.map((record) => [record.id, record]));
  const kept = (id: string) => visible.has(id) || !GOAL_SCOPED.has(id);

  function dirty(id?: string) {
    onDirty?.();
    setUnsaved(true);
    if (id) {
      setIssues((previous) => previous.filter((issue) => issue.field !== id));
      setAsked((previous) =>
        previous.includes(id) ? previous : [...previous, id],
      );
    }
  }

  /** The form as it would be saved now, including uncommitted text. */
  function candidate(inputs = records): FormFile {
    const merged = new Map(
      inputs.filter((record) => kept(record.id)).map((r) => [r.id, r]),
    );
    for (const [id, text] of Object.entries(raw))
      if (kept(id)) {
        const record = recordFromText(id, text, byId.get(id));
        if (record) merged.set(id, record);
        else merged.delete(id);
      }
    return {
      version: 1,
      goals,
      currency,
      horizon_years: horizon.trim() ? Number(horizon) : 0,
      inputs: [...merged.values()],
      file_descriptions: fileNotes,
      other_notes: notes,
      measurement_plan: Object.fromEntries(
        Object.entries(plans).filter(([goal]) => goals.includes(goal as Goal)),
      ),
      asked,
    };
  }

  function replace(record: Input) {
    setRecords((previous) =>
      previous.some((item) => item.id === record.id)
        ? previous.map((item) => (item.id === record.id ? record : item))
        : [...previous, record],
    );
    dirty(record.id);
  }

  /** Text shown in a field: typed text, else the accepted value. */
  const text = (id: string) => raw[id] ?? pretty(byId.get(id)?.value ?? null);

  function type(id: string, value: string) {
    setRaw((previous) => ({ ...previous, [id]: value }));
    dirty(id);
  }

  /** Accept a field's typed text, or keep the previous value with an error. */
  function commit(id: string) {
    const form = candidate();
    const errors = validateFormFile(form, context)
      .filter(
        (issue) =>
          (issue.field === id ||
            (issue.code === "AFTER_BEFORE" &&
              issue.field === RELATED_AFTER[id])) &&
          FIELD_ERROR_CODES.includes(issue.code),
      )
      .map((issue) => ({
        ...issue,
        field: id,
        message: `${issue.message} Previous accepted value kept.`,
      }));
    if (errors.length) {
      setIssues((previous) => [
        ...previous.filter((issue) => issue.field !== id),
        ...errors,
      ]);
      setRaw((previous) => ({
        ...previous,
        [id]: pretty(byId.get(id)?.value ?? null),
      }));
      return;
    }
    const next = form.inputs.find((record) => record.id === id);
    setRecords((previous) =>
      next
        ? previous.some((record) => record.id === id)
          ? previous.map((record) => (record.id === id ? next : record))
          : [...previous, next]
        : previous.filter((record) => record.id !== id),
    );
    dirty(id);
  }

  function metadata(id: string, patch: Partial<Input>) {
    replace({
      id,
      value: null,
      tier: "estimate",
      origin: "user",
      ...byId.get(id),
      ...patch,
    });
  }

  function backing(
    id: string,
    key: keyof Backing,
    value: string | number | boolean | undefined,
  ) {
    const next = { ...byId.get(id)?.backing };
    if (value === undefined) delete next[key];
    else Object.assign(next, { [key]: value });
    metadata(id, { backing: next });
  }

  function range(id: string, key: "low" | "high", value: string) {
    const record: Input = {
      id,
      value: null,
      tier: "estimate",
      origin: "user",
      ...byId.get(id),
    };
    if (!value) delete record[key];
    else record[key] = Number(value);
    replace(record);
  }

  /** Unknown, not zero: the value is cleared and marked user_unknown. */
  function notSure(id: string) {
    replace({
      id,
      ...byId.get(id),
      value: null,
      tier: "user_unknown",
      origin: "user",
      note: NOT_SURE_NOTE,
    });
    setRaw((previous) => ({ ...previous, [id]: "" }));
  }

  /** Accept the labeled proxy from `DEFAULTS`, with its source note. */
  function acceptProxy(id: string) {
    const proxy = DEFAULTS[id];
    if (!proxy) return;
    const next = { id, ...byId.get(id), ...proxy };
    replace(next);
    setRaw((previous) => ({ ...previous, [id]: pretty(next.value) }));
  }

  function setPath<K extends keyof Paths>(key: K, value: Paths[K]) {
    setPathsState((previous) => ({ ...previous, [key]: value }));
    dirty();
  }

  function setGoals(update: (previous: Goal[]) => Goal[]) {
    setGoalsState(update);
    dirty("goals");
  }

  function setCurrency(value: string) {
    setCurrencyState(value);
    dirty("currency");
  }

  function setHorizon(value: string) {
    setHorizonState(value);
    dirty("horizon_years");
  }

  /** Keep the last accepted horizon when the typed one is not 1–20. */
  function commitHorizon() {
    const value = Number(horizon);
    if (
      !horizon.trim() ||
      !Number.isInteger(value) ||
      value < 1 ||
      value > 20
    ) {
      setIssues((previous) => [
        ...previous.filter((issue) => issue.field !== "horizon_years"),
        {
          code: "HORIZON",
          field: "horizon_years",
          message:
            "Use an integer from 1 to 20; the previous accepted horizon was kept.",
        },
      ]);
      setHorizonState(acceptedHorizon.current);
    } else acceptedHorizon.current = horizon;
  }

  function acceptHorizonDefault() {
    setHorizonState("3");
    acceptedHorizon.current = "3";
    dirty("horizon_years");
  }

  function setNotes(value: string) {
    setNotesState(value);
    dirty("other_notes");
  }

  function setPlan(goal: Goal, key: string, value: string) {
    setPlans((previous) => ({
      ...previous,
      [goal]: {
        metric: "",
        baseline: "",
        baseline_source: "",
        owner: "",
        frequency: "",
        ...previous[goal],
        [key]: value,
      },
    }));
    dirty();
  }

  function setFileNotes(
    update: (previous: Record<string, string>) => Record<string, string>,
  ) {
    setFileNotesState(update);
    dirty("file_descriptions");
  }

  /** Strict check of the current form; shows every issue on failure. */
  function check(): { form: FormFile; issues: FormIssue[] } {
    const form = candidate();
    const found = validateFormFile(form, context);
    setIssues(found);
    if (!found.length)
      setRecords((previous) => [
        ...previous.filter((record) => !kept(record.id)),
        ...form.inputs,
      ]);
    return { form, issues: found };
  }

  function save() {
    const form = candidate();
    // An uncommitted invalid number is left out rather than saved as null.
    form.inputs = form.inputs.filter((record) => !hasNaN(record.value));
    void saver.submit(
      { formJson: JSON.stringify(form), baseUpdatedAt: savedAt ?? "" },
      { method: "post", action: `/projects/${projectId}/form` },
    );
  }

  return {
    projectId,
    files,
    context,
    goals,
    currency,
    horizon,
    notes,
    plans,
    fileNotes,
    paths,
    sections,
    visible,
    byId,
    issues,
    setIssues,
    unsaved,
    saving,
    saved,
    savedLabel,
    candidate,
    text,
    type,
    commit,
    metadata,
    backing,
    range,
    notSure,
    acceptProxy,
    setPath,
    setGoals,
    setCurrency,
    setHorizon,
    commitHorizon,
    acceptHorizonDefault,
    setNotes,
    setPlan,
    setFileNotes,
    check,
    save,
  };
}

export type FormDraft = ReturnType<typeof useFormDraft>;
