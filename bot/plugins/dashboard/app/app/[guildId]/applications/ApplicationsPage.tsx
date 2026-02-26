"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fetchApi } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import TextInput from "@/components/ui/TextInput";
import Textarea from "@/components/ui/Textarea";
import Toggle from "@/components/ui/Toggle";
import NumberInput from "@/components/ui/NumberInput";
import Tabs from "@/components/ui/Tabs";
import Modal from "@/components/ui/Modal";
import Combobox from "@/components/ui/Combobox";
import ChannelCombobox from "@/components/ui/ChannelCombobox";
import RoleCombobox from "@/components/ui/RoleCombobox";
import EmbedEditor, { type EmbedData, type EmbedMessageMode } from "@/components/ui/EmbedEditor";
import { useCanManage } from "@/components/providers/PermissionsProvider";
import { toast } from "sonner";
import { useRealtimeEvent } from "@/hooks/useRealtimeEvent";

type QuestionType = "short" | "long" | "select_single" | "select_multi" | "button" | "number";

interface QuestionOption {
  id: string;
  label: string;
  value: string;
  description?: string;
  emoji?: string;
}

interface ApplicationQuestion {
  id: string;
  type: QuestionType;
  label: string;
  description?: string;
  required: boolean;
  placeholder?: string;
  minLength?: number;
  maxLength?: number;
  minValue?: number;
  maxValue?: number;
  options?: QuestionOption[];
}

interface ApplicationSubmission {
  applicationId: string;
  applicationNumber: number;
  formId: string;
  formName: string;
  userId: string;
  userDisplayName: string;
  status: "pending" | "approved" | "denied";
  reviewReason?: string;
  createdAt: string;
  linkedModmailId?: string;
  responses: Array<{ questionLabel: string; value?: string; values?: string[] }>;
}

interface ApplicationStats {
  total: number;
  pending: number;
  approved: number;
  denied: number;
}

interface PanelPost {
  panelId: string;
  channelId: string;
  messageId: string;
  postedAt: string;
  postedBy: string;
}

interface ApplicationForm {
  formId: string;
  guildId: string;
  name: string;
  enabled: boolean;
  embed: EmbedData;
  questions: ApplicationQuestion[];
  submissionChannelId?: string;
  submissionChannelType: "text" | "forum";
  reviewRoleIds: string[];
  requiredRoleIds: string[];
  restrictedRoleIds: string[];
  acceptRoleIds: string[];
  denyRoleIds: string[];
  acceptRemoveRoleIds: string[];
  denyRemoveRoleIds: string[];
  pingRoleIds: string[];
  cooldownSeconds: number;
  completionMessageMode?: EmbedMessageMode;
  acceptMessageMode?: EmbedMessageMode;
  denyMessageMode?: EmbedMessageMode;
  completionMessage?: string;
  acceptMessage?: string;
  denyMessage?: string;
  completionMessageEmbed?: EmbedData;
  acceptMessageEmbed?: EmbedData;
  denyMessageEmbed?: EmbedData;
  modmailCategoryId?: string;
  panels: PanelPost[];
  createdAt: string;
  updatedAt: string;
}

interface ApplicationsPageProps {
  guildId: string;
}

interface DashboardUserSettingsPayload {
  settings: {
    applicationsAccordionMultiOpen?: boolean;
  };
}

const DEFAULT_COMPLETION_MESSAGE = "Thanks {user_mention}, your application #{application_number} for {form_name} was submitted.";
const DEFAULT_ACCEPT_MESSAGE = "Your application #{application_number} for {form_name} was {status} by {reviewer_mention}.";
const DEFAULT_DENY_MESSAGE = "Your application #{application_number} for {form_name} was {status}. Reason: {reason}";
const DEFAULT_COMPLETION_MESSAGE_EMBED: EmbedData = { description: DEFAULT_COMPLETION_MESSAGE, color: "#5865f2" };
const DEFAULT_ACCEPT_MESSAGE_EMBED: EmbedData = { description: DEFAULT_ACCEPT_MESSAGE, color: "#57f287" };
const DEFAULT_DENY_MESSAGE_EMBED: EmbedData = { description: DEFAULT_DENY_MESSAGE, color: "#ed4245" };

const MESSAGE_PLACEHOLDERS: Array<{ token: string; description: string }> = [
  { token: "{user_mention}", description: "Applicant mention" },
  { token: "{user_id}", description: "Applicant user ID" },
  { token: "{user_name}", description: "Applicant display name" },
  { token: "{form_name}", description: "Application form name" },
  { token: "{application_id}", description: "Application ID" },
  { token: "{application_number}", description: "Application number" },
  { token: "{status}", description: "Review status (approved/denied)" },
  { token: "{reason}", description: "Review reason (or fallback text)" },
  { token: "{reviewer_mention}", description: "Reviewer mention" },
  { token: "{reviewer_id}", description: "Reviewer user ID" },
  { token: "{guild_id}", description: "Guild ID" },
];

function hydrateFormDraft(form: ApplicationForm): ApplicationForm {
  const nextDraft: ApplicationForm = JSON.parse(JSON.stringify(form));
  if (!nextDraft.completionMessageMode) nextDraft.completionMessageMode = "embed";
  if (!nextDraft.acceptMessageMode) nextDraft.acceptMessageMode = "embed";
  if (!nextDraft.denyMessageMode) nextDraft.denyMessageMode = "embed";
  if (typeof nextDraft.completionMessage !== "string") nextDraft.completionMessage = "";
  if (typeof nextDraft.acceptMessage !== "string") nextDraft.acceptMessage = "";
  if (typeof nextDraft.denyMessage !== "string") nextDraft.denyMessage = "";
  if (!nextDraft.completionMessageEmbed || Object.keys(nextDraft.completionMessageEmbed).length === 0) {
    nextDraft.completionMessageEmbed = { ...(nextDraft.completionMessage ? { description: nextDraft.completionMessage } : DEFAULT_COMPLETION_MESSAGE_EMBED) };
  }
  if (!nextDraft.acceptMessageEmbed || Object.keys(nextDraft.acceptMessageEmbed).length === 0) {
    nextDraft.acceptMessageEmbed = { ...(nextDraft.acceptMessage ? { description: nextDraft.acceptMessage } : DEFAULT_ACCEPT_MESSAGE_EMBED) };
  }
  if (!nextDraft.denyMessageEmbed || Object.keys(nextDraft.denyMessageEmbed).length === 0) {
    nextDraft.denyMessageEmbed = { ...(nextDraft.denyMessage ? { description: nextDraft.denyMessage } : DEFAULT_DENY_MESSAGE_EMBED) };
  }
  return nextDraft;
}

export default function ApplicationsPage({ guildId }: ApplicationsPageProps) {
  const searchParams = useSearchParams();
  const canManage = useCanManage("applications.manage");
  const canReview = useCanManage("applications.review");

  const [forms, setForms] = useState<ApplicationForm[]>([]);
  const [selectedFormId, setSelectedFormId] = useState("");
  const [draft, setDraft] = useState<ApplicationForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [newFormName, setNewFormName] = useState("");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [postChannelId, setPostChannelId] = useState("");
  const [submissions, setSubmissions] = useState<ApplicationSubmission[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [stats, setStats] = useState<ApplicationStats>({ total: 0, pending: 0, approved: 0, denied: 0 });
  const [submissionStatusFilter, setSubmissionStatusFilter] = useState<"all" | "pending" | "approved" | "denied">("all");
  const [submissionUserIdFilter, setSubmissionUserIdFilter] = useState("");
  const [pendingScrollQuestionId, setPendingScrollQuestionId] = useState<string | null>(null);
  const [confirmDeleteFormId, setConfirmDeleteFormId] = useState<string | null>(null);
  const [confirmDeleteSubmissionId, setConfirmDeleteSubmissionId] = useState<string | null>(null);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [expandedSubmissionIds, setExpandedSubmissionIds] = useState<Set<string>>(new Set());
  const [applicationsAccordionMultiOpen, setApplicationsAccordionMultiOpen] = useState(false);
  const [relatedSubmissions, setRelatedSubmissions] = useState<ApplicationSubmission[]>([]);
  const [reviewModal, setReviewModal] = useState<{ applicationId: string; status: "approved" | "denied" } | null>(null);
  const [reviewReason, setReviewReason] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const questionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const submissionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const deepLinkAppliedRef = useRef(false);

  const selectedForm = useMemo(() => forms.find((entry) => entry.formId === selectedFormId) || null, [forms, selectedFormId]);
  const selectedSubmission = useMemo(() => submissions.find((entry) => entry.applicationId === selectedSubmissionId) || null, [submissions, selectedSubmissionId]);
  const hydratedSelectedForm = useMemo(() => (selectedForm ? hydrateFormDraft(selectedForm) : null), [selectedForm]);
  const deepLinkApplicationId = searchParams.get("applicationId") || "";
  const deepLinkFormId = searchParams.get("formId") || "";
  const deepLinkUserId = searchParams.get("userId") || "";
  const isDraftDirty = useMemo(() => {
    if (!draft || !hydratedSelectedForm) return false;
    return JSON.stringify(draft) !== JSON.stringify(hydratedSelectedForm);
  }, [draft, hydratedSelectedForm]);

  useEffect(() => {
    if (!selectedForm) {
      setDraft(null);
      return;
    }

    setDraft(hydrateFormDraft(selectedForm));
  }, [selectedForm]);

  useEffect(() => {
    if (!pendingScrollQuestionId) return;
    const target = questionRefs.current[pendingScrollQuestionId];
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    setPendingScrollQuestionId(null);
  }, [pendingScrollQuestionId, draft?.questions?.length]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDraftDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDraftDirty]);

  useRealtimeEvent("applications:updated", () => {
    void loadForms();
    void loadSubmissions();
    void loadStats();
  });

  const loadForms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchApi<ApplicationForm[]>(guildId, "applications/forms");
      if (!response.success) {
        setError(response.error?.message ?? "Failed to load forms");
        setForms([]);
        return;
      }
      const incoming = response.data ?? [];
      setForms(incoming);
      setSelectedFormId((current) => {
        if (current && incoming.some((entry) => entry.formId === current)) return current;
        return incoming[0]?.formId ?? "";
      });
    } finally {
      setLoading(false);
    }
  }, [guildId]);

  const loadStats = useCallback(async () => {
    const response = await fetchApi<ApplicationStats>(guildId, "applications/stats", { skipCache: true });
    if (response.success && response.data) {
      setStats(response.data);
    }
  }, [guildId]);

  const loadSubmissions = useCallback(async () => {
    setSubmissionsLoading(true);
    try {
      const query: string[] = ["limit=100"];
      if (selectedFormId) query.push(`formId=${encodeURIComponent(selectedFormId)}`);
      if (submissionStatusFilter !== "all") query.push(`status=${submissionStatusFilter}`);
      if (submissionUserIdFilter) query.push(`userId=${encodeURIComponent(submissionUserIdFilter)}`);

      const response = await fetchApi<ApplicationSubmission[]>(guildId, `applications/submissions?${query.join("&")}`, { skipCache: true });
      if (!response.success || !response.data) {
        toast.error(response.error?.message ?? "Failed to load submissions");
        setSubmissions([]);
        return;
      }
      setSubmissions(response.data);
    } finally {
      setSubmissionsLoading(false);
    }
  }, [guildId, selectedFormId, submissionStatusFilter, submissionUserIdFilter]);

  const loadUserSettings = useCallback(async () => {
    const response = await fetchApi<DashboardUserSettingsPayload>(guildId, "dashboard-user-settings", { skipCache: true });
    if (response.success && response.data?.settings) {
      setApplicationsAccordionMultiOpen(!!response.data.settings.applicationsAccordionMultiOpen);
    }
  }, [guildId]);

  useEffect(() => {
    void loadForms();
    void loadStats();
    void loadUserSettings();
  }, [guildId, loadForms, loadStats, loadUserSettings]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ applicationsAccordionMultiOpen?: boolean }>).detail;
      if (typeof detail?.applicationsAccordionMultiOpen === "boolean") {
        setApplicationsAccordionMultiOpen(detail.applicationsAccordionMultiOpen);
      }
    };
    window.addEventListener("dashboard:user-settings-updated", handler as EventListener);
    return () => window.removeEventListener("dashboard:user-settings-updated", handler as EventListener);
  }, []);

  useEffect(() => {
    void loadSubmissions();
  }, [loadSubmissions]);

  useEffect(() => {
    if (deepLinkAppliedRef.current) return;
    if (!deepLinkApplicationId && !deepLinkFormId && !deepLinkUserId) return;

    if (deepLinkFormId) setSelectedFormId(deepLinkFormId);
    if (deepLinkUserId) setSubmissionUserIdFilter(deepLinkUserId);
    if (deepLinkApplicationId) setSelectedSubmissionId(deepLinkApplicationId);
    deepLinkAppliedRef.current = true;
  }, [deepLinkApplicationId, deepLinkFormId, deepLinkUserId]);

  useEffect(() => {
    if (!selectedSubmissionId) return;
    setExpandedSubmissionIds((current) => {
      if (applicationsAccordionMultiOpen) {
        if (current.has(selectedSubmissionId)) return current;
        const next = new Set(current);
        next.add(selectedSubmissionId);
        return next;
      }

      if (current.size === 1 && current.has(selectedSubmissionId)) return current;
      return new Set([selectedSubmissionId]);
    });

    const target = submissionRefs.current[selectedSubmissionId];
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [applicationsAccordionMultiOpen, selectedSubmissionId, submissions.length]);

  useEffect(() => {
    if (!selectedSubmission) {
      setRelatedSubmissions([]);
      return;
    }

    const run = async () => {
      const query = ["limit=100", `formId=${encodeURIComponent(selectedSubmission.formId)}`, `userId=${encodeURIComponent(selectedSubmission.userId)}`];
      const response = await fetchApi<ApplicationSubmission[]>(guildId, `applications/submissions?${query.join("&")}`, { skipCache: true });
      if (!response.success || !response.data) {
        setRelatedSubmissions([]);
        return;
      }
      setRelatedSubmissions(response.data.filter((entry) => entry.applicationId !== selectedSubmission.applicationId));
    };

    void run();
  }, [guildId, selectedSubmission]);

  const toggleSubmissionExpanded = (applicationId: string) => {
    setSelectedSubmissionId(applicationId);
    setExpandedSubmissionIds((current) => {
      const next = new Set(current);
      const currentlyExpanded = next.has(applicationId);

      if (applicationsAccordionMultiOpen) {
        if (currentlyExpanded) next.delete(applicationId);
        else next.add(applicationId);
        return next;
      }

      if (currentlyExpanded) return new Set();
      return new Set([applicationId]);
    });
  };

  async function createForm() {
    const trimmed = newFormName.trim();
    if (!trimmed) return;

    setCreating(true);
    setError(null);
    try {
      const response = await fetchApi<ApplicationForm>(guildId, "applications/forms", {
        method: "POST",
        body: JSON.stringify({ name: trimmed }),
      });

      if (!response.success) {
        const message = response.error?.message ?? "Failed to create form";
        setError(message);
        toast.error(message);
        return;
      }

      setNewFormName("");
      toast.success("Application form created");
      await loadForms();
      if (response.data?.formId) setSelectedFormId(response.data.formId);
    } finally {
      setCreating(false);
    }
  }

  async function saveForm() {
    if (!draft) return;
    setSaving(true);

    try {
      const response = await fetchApi<ApplicationForm>(guildId, `applications/forms/${draft.formId}`, {
        method: "PUT",
        body: JSON.stringify(draft),
      });

      if (!response.success || !response.data) {
        toast.error(response.error?.message ?? "Failed to save form");
        return;
      }

      toast.success("Form saved");
      await loadForms();
    } finally {
      setSaving(false);
    }
  }

  async function deleteForm(formId: string) {
    const response = await fetchApi(guildId, `applications/forms/${formId}`, { method: "DELETE" });
    if (!response.success) {
      toast.error(response.error?.message ?? "Failed to delete form");
      setConfirmDeleteFormId(null);
      return;
    }
    toast.success("Form deleted");
    setConfirmDeleteFormId(null);
    await loadForms();
  }

  async function postPanel() {
    if (!draft || !postChannelId) return;

    const response = await fetchApi(guildId, `applications/forms/${draft.formId}/post`, {
      method: "POST",
      body: JSON.stringify({ channelId: postChannelId }),
    });

    if (!response.success) {
      toast.error(response.error?.message ?? "Failed to post panel");
      return;
    }

    toast.success("Panel posted");
    setPostChannelId("");
    await loadForms();
  }

  async function updatePostedPanels() {
    if (!draft) return;
    const response = await fetchApi(guildId, `applications/forms/${draft.formId}/update-posts`, { method: "PUT" });
    if (!response.success) {
      toast.error(response.error?.message ?? "Failed to update posted panels");
      return;
    }
    toast.success("Posted panels updated");
    await loadForms();
  }

  async function removePostedPanel(panelId: string) {
    if (!draft) return;
    const response = await fetchApi(guildId, `applications/forms/${draft.formId}/posts/${panelId}`, { method: "DELETE" });
    if (!response.success) {
      toast.error(response.error?.message ?? "Failed to remove posted panel");
      return;
    }
    await loadForms();
  }

  async function reviewSubmission(applicationId: string, status: "approved" | "denied", reason?: string) {
    const response = await fetchApi<ApplicationSubmission>(guildId, `applications/submissions/${applicationId}/status`, {
      method: "PUT",
      body: JSON.stringify({ status, reason: reason?.trim() || undefined }),
    });

    if (!response.success) {
      toast.error(response.error?.message ?? "Failed to update submission");
      return;
    }

    toast.success(`Application ${status}`);
    await loadSubmissions();
    await loadStats();
    await loadForms();
  }

  function openReasonModal(applicationId: string, status: "approved" | "denied") {
    setReviewReason("");
    setReviewModal({ applicationId, status });
  }

  async function submitReviewWithReason() {
    if (!reviewModal) return;
    const trimmedReason = reviewReason.trim();
    if (!trimmedReason) {
      toast.error("Reason is required");
      return;
    }

    setReviewSubmitting(true);
    try {
      await reviewSubmission(reviewModal.applicationId, reviewModal.status, trimmedReason);
      setReviewModal(null);
      setReviewReason("");
    } finally {
      setReviewSubmitting(false);
    }
  }

  async function openSubmissionModmail(applicationId: string) {
    const response = await fetchApi(guildId, `applications/submissions/${applicationId}/open-modmail`, { method: "POST" });
    if (!response.success) {
      toast.error(response.error?.message ?? "Failed to open modmail");
      return;
    }

    toast.success("Modmail opened/linked");
    await loadSubmissions();
    await loadForms();
  }

  async function deleteSubmission(applicationId: string) {
    const response = await fetchApi(guildId, `applications/submissions/${applicationId}`, { method: "DELETE" });
    if (!response.success) {
      toast.error(response.error?.message ?? "Failed to delete submission");
      setConfirmDeleteSubmissionId(null);
      return;
    }
    toast.success("Submission deleted");
    setConfirmDeleteSubmissionId(null);
    await loadSubmissions();
    await loadStats();
  }

  const addQuestion = () => {
    if (!draft) return;
    const questionId = crypto.randomUUID();
    const next: ApplicationQuestion = {
      id: questionId,
      type: "short",
      label: "New question",
      required: true,
      options: [],
    };
    setDraft({ ...draft, questions: [...(draft.questions || []), next] });
    setPendingScrollQuestionId(questionId);
  };

  const resetDraft = () => {
    if (!selectedForm) return;
    setDraft(hydrateFormDraft(selectedForm));
  };

  const updateQuestion = (questionId: string, patch: Partial<ApplicationQuestion>) => {
    if (!draft) return;
    setDraft({
      ...draft,
      questions: (draft.questions || []).map((question) => (question.id === questionId ? { ...question, ...patch } : question)),
    });
  };

  const deleteQuestion = (questionId: string) => {
    if (!draft) return;
    setDraft({ ...draft, questions: (draft.questions || []).filter((question) => question.id !== questionId) });
  };

  const moveQuestion = (questionId: string, direction: -1 | 1) => {
    if (!draft) return;
    const questions = [...(draft.questions || [])];
    const index = questions.findIndex((question) => question.id === questionId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= questions.length) return;
    const [moved] = questions.splice(index, 1);
    questions.splice(nextIndex, 0, moved);
    setDraft({ ...draft, questions });
  };

  const updateRoleList = (field: keyof ApplicationForm, values: string[]) => {
    if (!draft) return;
    setDraft({ ...draft, [field]: values } as ApplicationForm);
  };

  const sortedForms = useMemo(() => [...forms].sort((left, right) => left.name.localeCompare(right.name)), [forms]);

  const filteredSubmissions = useMemo(() => submissions, [submissions]);

  const questionTypeOptions = [
    { value: "short", label: "Short text" },
    { value: "long", label: "Long text" },
    { value: "number", label: "Number" },
    { value: "select_single", label: "Select menu (single)" },
    { value: "select_multi", label: "Select menu (multi)" },
    { value: "button", label: "Button choice" },
  ];

  const submissionStatusOptions = [
    { value: "all", label: "All statuses" },
    { value: "pending", label: "Pending" },
    { value: "approved", label: "Approved" },
    { value: "denied", label: "Denied" },
  ];

  function RoleListEditor({ label, values, onChange }: { label: string; values: string[]; onChange: (value: string[]) => void }) {
    const add = () => onChange([...(values || []), ""]);
    const update = (index: number, next: string) => {
      const copied = [...values];
      copied[index] = next;
      onChange(copied.filter((entry) => entry));
    };
    const remove = (index: number) => {
      const copied = [...values];
      copied.splice(index, 1);
      onChange(copied);
    };

    return (
      <div className="space-y-2 rounded-lg border border-zinc-700/30 p-3">
        <p className="text-sm font-medium text-zinc-200">{label}</p>
        {(values || []).length === 0 ? <p className="text-xs text-zinc-500">No roles selected.</p> : null}
        {(values || []).map((entry, index) => (
          <div key={`${label}-${index}`} className="flex items-center gap-2">
            <div className="flex-1">
              <RoleCombobox guildId={guildId} value={entry} onChange={(value) => update(index, value)} includeEveryone={false} />
            </div>
            <button type="button" className="rounded-lg border border-zinc-700/30 px-2 py-2 text-xs text-zinc-300 transition hover:bg-white/5" onClick={() => remove(index)}>
              Remove
            </button>
          </div>
        ))}
        <button type="button" className="rounded-lg border border-zinc-700/30 px-3 py-1.5 text-xs text-zinc-300 transition hover:bg-white/5" onClick={add}>
          Add Role
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Applications</CardTitle>
            <CardDescription>Create forms, configure questions/panels, and review submissions.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <TextInput label="Form Name" value={newFormName} onChange={setNewFormName} placeholder="New application form name" />
            </div>
            <button
              type="button"
              disabled={creating || !newFormName.trim() || !canManage}
              onClick={createForm}
              className="h-fit rounded-lg border border-zinc-700/30 bg-zinc-900/40 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:border-zinc-600/40 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-60">
              {creating ? "Creating..." : "Create Form"}
            </button>
          </div>
          {error ? <p className="text-sm text-rose-400">{error}</p> : null}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-zinc-700/30 p-2 text-center">
              <p className="text-xs text-zinc-400">Total</p>
              <p className="text-lg font-semibold text-zinc-100">{stats.total}</p>
            </div>
            <div className="rounded-lg border border-zinc-700/30 p-2 text-center">
              <p className="text-xs text-zinc-400">Pending</p>
              <p className="text-lg font-semibold text-amber-300">{stats.pending}</p>
            </div>
            <div className="rounded-lg border border-zinc-700/30 p-2 text-center">
              <p className="text-xs text-zinc-400">Approved</p>
              <p className="text-lg font-semibold text-emerald-300">{stats.approved}</p>
            </div>
            <div className="rounded-lg border border-zinc-700/30 p-2 text-center">
              <p className="text-xs text-zinc-400">Denied</p>
              <p className="text-lg font-semibold text-rose-300">{stats.denied}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Forms</CardTitle>
            <CardDescription>{loading ? "Loading forms..." : `${sortedForms.length} form${sortedForms.length === 1 ? "" : "s"}`}</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-zinc-400">Loading...</p>
            ) : sortedForms.length === 0 ? (
              <p className="text-sm text-zinc-400">No forms yet. Create your first application form above.</p>
            ) : (
              <div className="space-y-2">
                {sortedForms.map((form) => (
                  <button
                    key={form.formId}
                    type="button"
                    onClick={() => setSelectedFormId(form.formId)}
                    className={`w-full rounded-lg border px-3 py-2 text-left transition ${form.formId === selectedFormId ? "border-primary-500/60 bg-primary-500/10" : "border-zinc-700/30 bg-zinc-900/30"}`}>
                    <p className="font-medium text-zinc-100">{form.name}</p>
                    <p className="text-xs text-zinc-400">
                      {form.enabled ? "Enabled" : "Disabled"} • {form.questions?.length ?? 0} questions • {form.submissionChannelType || "text"}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-8">
          <CardHeader>
            <CardTitle>{draft ? `Edit: ${draft.name}` : "Form Editor"}</CardTitle>
            <CardDescription>{draft ? "Manage all form settings below." : "Select a form from the left to edit it."}</CardDescription>
          </CardHeader>
          <CardContent>
            {!draft ? (
              <p className="text-sm text-zinc-400">Select a form to begin.</p>
            ) : (
              <>
                <Tabs
                  tabs={[
                    {
                      id: "general",
                      label: "General",
                      content: (
                        <div className="space-y-4">
                          <TextInput label="Form Name" value={draft.name} onChange={(value) => setDraft({ ...draft, name: value })} />
                          <Toggle label="Enabled" checked={draft.enabled} onChange={(checked) => setDraft({ ...draft, enabled: checked })} />
                          <Combobox
                            options={[
                              { value: "text", label: "Text Channel" },
                              { value: "forum", label: "Forum Channel" },
                            ]}
                            value={draft.submissionChannelType || "text"}
                            onChange={(value) => setDraft({ ...draft, submissionChannelType: value as "text" | "forum" })}
                            placeholder="Submission channel type"
                          />
                          <ChannelCombobox
                            guildId={guildId}
                            value={draft.submissionChannelId || ""}
                            onChange={(value) => setDraft({ ...draft, submissionChannelId: value })}
                            channelType={draft.submissionChannelType === "forum" ? "forum" : "text"}
                            excludeForums={draft.submissionChannelType !== "forum"}
                            label="Submission Channel"
                          />
                          <NumberInput
                            label="Reapply Cooldown (seconds)"
                            value={draft.cooldownSeconds || 0}
                            min={0}
                            max={31536000}
                            onChange={(value) => setDraft({ ...draft, cooldownSeconds: Number.isFinite(value) ? Math.max(0, value) : 0 })}
                          />
                        </div>
                      ),
                    },
                    {
                      id: "embed",
                      label: "Embed",
                      content: <EmbedEditor value={draft.embed || {}} onChange={(value) => setDraft({ ...draft, embed: value })} />,
                    },
                    {
                      id: "questions",
                      label: "Questions",
                      content: (
                        <div className="space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-zinc-700/30 p-2">
                            <p className="text-sm text-zinc-300">
                              {(draft.questions || []).length} question{(draft.questions || []).length === 1 ? "" : "s"}
                            </p>
                            <button type="button" className="rounded-lg border border-zinc-700/30 px-3 py-1.5 text-sm text-zinc-200 transition hover:bg-white/5" onClick={addQuestion}>
                              Add Question
                            </button>
                          </div>
                          {(draft.questions || []).map((question, index) => (
                            <div
                              key={question.id}
                              ref={(node) => {
                                questionRefs.current[question.id] = node;
                              }}
                              className="space-y-3 rounded-lg border border-zinc-700/30 p-3">
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-semibold text-zinc-200">Question {index + 1}</p>
                                <div className="flex gap-2">
                                  <button type="button" className="rounded border border-zinc-700/30 px-2 py-1 text-xs" onClick={() => moveQuestion(question.id, -1)}>
                                    ↑
                                  </button>
                                  <button type="button" className="rounded border border-zinc-700/30 px-2 py-1 text-xs" onClick={() => moveQuestion(question.id, 1)}>
                                    ↓
                                  </button>
                                  <button type="button" className="rounded border border-zinc-700/30 px-2 py-1 text-xs text-rose-300" onClick={() => deleteQuestion(question.id)}>
                                    Delete
                                  </button>
                                </div>
                              </div>

                              <Combobox
                                options={questionTypeOptions}
                                value={question.type}
                                onChange={(value) => updateQuestion(question.id, { type: value as QuestionType })}
                                placeholder="Question type"
                              />
                              <TextInput label="Label" value={question.label} onChange={(value) => updateQuestion(question.id, { label: value })} />
                              <Textarea label="Description" value={question.description || ""} onChange={(value) => updateQuestion(question.id, { description: value })} rows={2} />
                              <TextInput label="Placeholder" value={question.placeholder || ""} onChange={(value) => updateQuestion(question.id, { placeholder: value })} />
                              <Toggle label="Required" checked={question.required !== false} onChange={(checked) => updateQuestion(question.id, { required: checked })} />

                              {(question.type === "short" || question.type === "long") && (
                                <div className="grid gap-2 sm:grid-cols-2">
                                  <NumberInput
                                    label="Min Length"
                                    value={question.minLength || 0}
                                    min={0}
                                    max={2000}
                                    onChange={(value) => updateQuestion(question.id, { minLength: value || undefined })}
                                  />
                                  <NumberInput
                                    label="Max Length"
                                    value={question.maxLength || 200}
                                    min={1}
                                    max={2000}
                                    onChange={(value) => updateQuestion(question.id, { maxLength: value || undefined })}
                                  />
                                </div>
                              )}

                              {question.type === "number" && (
                                <div className="grid gap-2 sm:grid-cols-2">
                                  <NumberInput label="Min Value" value={question.minValue || 0} onChange={(value) => updateQuestion(question.id, { minValue: value || undefined })} />
                                  <NumberInput label="Max Value" value={question.maxValue || 0} onChange={(value) => updateQuestion(question.id, { maxValue: value || undefined })} />
                                </div>
                              )}

                              {(question.type === "select_single" || question.type === "select_multi" || question.type === "button") && (
                                <div className="space-y-2 rounded-lg border border-zinc-700/30 p-2">
                                  <p className="text-sm text-zinc-300">Options</p>
                                  {(question.options || []).map((option, optionIndex) => (
                                    <div key={option.id} className="grid gap-2 sm:grid-cols-12">
                                      <div className="sm:col-span-4">
                                        <TextInput
                                          label="Label"
                                          value={option.label}
                                          onChange={(value) => {
                                            const next = [...(question.options || [])];
                                            next[optionIndex] = { ...next[optionIndex], label: value, value: next[optionIndex].value || value };
                                            updateQuestion(question.id, { options: next });
                                          }}
                                        />
                                      </div>
                                      <div className="sm:col-span-4">
                                        <TextInput
                                          label="Value"
                                          value={option.value}
                                          onChange={(value) => {
                                            const next = [...(question.options || [])];
                                            next[optionIndex] = { ...next[optionIndex], value };
                                            updateQuestion(question.id, { options: next });
                                          }}
                                        />
                                      </div>
                                      <div className="sm:col-span-3">
                                        <TextInput
                                          label="Emoji"
                                          value={option.emoji || ""}
                                          onChange={(value) => {
                                            const next = [...(question.options || [])];
                                            next[optionIndex] = { ...next[optionIndex], emoji: value };
                                            updateQuestion(question.id, { options: next });
                                          }}
                                        />
                                      </div>
                                      <div className="sm:col-span-1 flex items-end">
                                        <button
                                          type="button"
                                          className="h-10 w-full rounded border border-zinc-700/30 text-xs text-rose-300"
                                          onClick={() => {
                                            const next = [...(question.options || [])];
                                            next.splice(optionIndex, 1);
                                            updateQuestion(question.id, { options: next });
                                          }}>
                                          X
                                        </button>
                                      </div>
                                    </div>
                                  ))}

                                  <button
                                    type="button"
                                    className="rounded border border-zinc-700/30 px-3 py-1.5 text-xs"
                                    onClick={() => {
                                      const next = [...(question.options || []), { id: crypto.randomUUID(), label: "Option", value: "option" }];
                                      updateQuestion(question.id, { options: next });
                                    }}>
                                    Add Option
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                          <div className="flex justify-center">
                            <button type="button" className="rounded-lg border border-zinc-700/30 px-3 py-1.5 text-sm text-zinc-200 transition hover:bg-white/5" onClick={addQuestion}>
                              Add Question
                            </button>
                          </div>
                        </div>
                      ),
                    },
                    {
                      id: "roles",
                      label: "Roles",
                      content: (
                        <div className="space-y-3">
                          <RoleListEditor label="Review Roles" values={draft.reviewRoleIds || []} onChange={(values) => updateRoleList("reviewRoleIds", values)} />
                          <RoleListEditor label="Required Roles" values={draft.requiredRoleIds || []} onChange={(values) => updateRoleList("requiredRoleIds", values)} />
                          <RoleListEditor label="Restricted Roles" values={draft.restrictedRoleIds || []} onChange={(values) => updateRoleList("restrictedRoleIds", values)} />
                          <RoleListEditor label="Ping Roles" values={draft.pingRoleIds || []} onChange={(values) => updateRoleList("pingRoleIds", values)} />
                          <RoleListEditor label="Accept Roles" values={draft.acceptRoleIds || []} onChange={(values) => updateRoleList("acceptRoleIds", values)} />
                          <RoleListEditor label="Deny Roles" values={draft.denyRoleIds || []} onChange={(values) => updateRoleList("denyRoleIds", values)} />
                          <RoleListEditor label="Accept Remove Roles" values={draft.acceptRemoveRoleIds || []} onChange={(values) => updateRoleList("acceptRemoveRoleIds", values)} />
                          <RoleListEditor label="Deny Remove Roles" values={draft.denyRemoveRoleIds || []} onChange={(values) => updateRoleList("denyRemoveRoleIds", values)} />
                        </div>
                      ),
                    },
                    {
                      id: "messages",
                      label: "Messages",
                      content: (
                        <div className="space-y-3">
                          <div className="rounded border border-zinc-700/30 p-3">
                            <EmbedEditor
                              heading="Completion Message"
                              value={draft.completionMessageEmbed || {}}
                              onChange={(value) => setDraft({ ...draft, completionMessageEmbed: value })}
                              showMessageModeControls
                              messageMode={draft.completionMessageMode || "embed"}
                              onMessageModeChange={(mode) => setDraft({ ...draft, completionMessageMode: mode })}
                              textContent={draft.completionMessage || ""}
                              onTextContentChange={(value) => setDraft({ ...draft, completionMessage: value })}
                              textContentPlaceholder="Thanks {user_mention}, your application #{application_number} for {form_name} was submitted."
                            />
                          </div>
                          <div className="rounded border border-zinc-700/30 p-3">
                            <EmbedEditor
                              heading="Accept Message"
                              value={draft.acceptMessageEmbed || {}}
                              onChange={(value) => setDraft({ ...draft, acceptMessageEmbed: value })}
                              showMessageModeControls
                              messageMode={draft.acceptMessageMode || "embed"}
                              onMessageModeChange={(mode) => setDraft({ ...draft, acceptMessageMode: mode })}
                              textContent={draft.acceptMessage || ""}
                              onTextContentChange={(value) => setDraft({ ...draft, acceptMessage: value })}
                              textContentPlaceholder="Your application #{application_number} for {form_name} was {status} by {reviewer_mention}."
                            />
                          </div>
                          <div className="rounded border border-zinc-700/30 p-3">
                            <EmbedEditor
                              heading="Deny Message"
                              value={draft.denyMessageEmbed || {}}
                              onChange={(value) => setDraft({ ...draft, denyMessageEmbed: value })}
                              showMessageModeControls
                              messageMode={draft.denyMessageMode || "embed"}
                              onMessageModeChange={(mode) => setDraft({ ...draft, denyMessageMode: mode })}
                              textContent={draft.denyMessage || ""}
                              onTextContentChange={(value) => setDraft({ ...draft, denyMessage: value })}
                              textContentPlaceholder="Your application #{application_number} for {form_name} was {status}. Reason: {reason}"
                            />
                          </div>
                          <div className="rounded border border-zinc-700/30 p-3 text-xs text-zinc-300">
                            <p className="text-zinc-100">Available placeholders</p>
                            <div className="mt-2 grid gap-1 sm:grid-cols-2">
                              {MESSAGE_PLACEHOLDERS.map((entry) => (
                                <p key={entry.token}>
                                  <span className="text-zinc-100">{entry.token}</span> — {entry.description}
                                </p>
                              ))}
                            </div>
                          </div>
                          <TextInput
                            label="Modmail Category ID"
                            value={draft.modmailCategoryId || ""}
                            onChange={(value) => setDraft({ ...draft, modmailCategoryId: value })}
                            placeholder="Optional modmail category id"
                          />
                        </div>
                      ),
                    },
                    {
                      id: "panels",
                      label: "Panels",
                      content: (
                        <div className="space-y-3">
                          <ChannelCombobox guildId={guildId} value={postChannelId} onChange={setPostChannelId} channelType="text" excludeForums label="Post Panel To Channel" />
                          <div className="flex flex-wrap gap-2">
                            <button type="button" className="rounded border border-zinc-700/30 px-3 py-1.5 text-sm" onClick={postPanel} disabled={!postChannelId || !canManage}>
                              Post Panel
                            </button>
                            <button type="button" className="rounded border border-zinc-700/30 px-3 py-1.5 text-sm" onClick={updatePostedPanels} disabled={!canManage}>
                              Update Posted Panels
                            </button>
                          </div>

                          <div className="space-y-2">
                            {(draft.panels || []).length === 0 ? <p className="text-sm text-zinc-500">No posted panels yet.</p> : null}
                            {(draft.panels || []).map((panel) => (
                              <div key={panel.panelId} className="flex items-center justify-between rounded border border-zinc-700/30 p-2 text-sm">
                                <div>
                                  <p className="text-zinc-200">
                                    Channel: <span className="text-zinc-400">{panel.channelId}</span>
                                  </p>
                                  <p className="text-zinc-500">Message: {panel.messageId}</p>
                                </div>
                                <button
                                  type="button"
                                  className="rounded border border-zinc-700/30 px-2 py-1 text-xs text-rose-300"
                                  onClick={() => removePostedPanel(panel.panelId)}
                                  disabled={!canManage}>
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ),
                    },
                  ]}
                />
              </>
            )}
            {draft ? (
              <div className="sticky bottom-0 z-10 mt-4 border-t border-zinc-700/30 bg-[#11131a]/95 pb-2 pt-3 backdrop-blur">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`inline-block h-2 w-2 rounded-full ${isDraftDirty ? "bg-amber-400" : "bg-emerald-400"}`} />
                    <span className={isDraftDirty ? "text-amber-300" : "text-emerald-300"}>{isDraftDirty ? "Unsaved changes" : "All changes saved"}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded border border-zinc-700/30 px-3 py-1.5 text-sm font-medium text-zinc-300 transition hover:bg-white/5"
                      onClick={resetDraft}
                      disabled={!isDraftDirty || !canManage}>
                      Reset Changes
                    </button>
                    <button
                      type="button"
                      className="rounded border border-emerald-500/40 bg-emerald-600/15 px-3 py-1.5 text-sm font-medium text-emerald-200 transition hover:bg-emerald-600/25 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={saveForm}
                      disabled={saving || !canManage || !isDraftDirty}>
                      {saving ? "Saving…" : "Save Form"}
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-red-900/40 bg-red-600/10 px-3 py-1.5 text-sm font-medium text-rose-300 transition hover:bg-red-600/20"
                      onClick={() => setConfirmDeleteFormId(draft.formId)}
                      disabled={!canManage}>
                      Delete Form
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Submissions</CardTitle>
          <CardDescription>Review and manage submitted applications.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Combobox options={submissionStatusOptions} value={submissionStatusFilter} onChange={(value) => setSubmissionStatusFilter(value as any)} placeholder="Status filter" />
            <button type="button" className="rounded border border-zinc-700/30 px-3 py-2 text-sm" onClick={() => void loadSubmissions()}>
              Refresh
            </button>
          </div>

          {submissionUserIdFilter ? (
            <div className="flex items-center justify-between rounded border border-zinc-700/30 bg-zinc-900/30 p-2 text-xs text-zinc-300">
              <span>Filtering by user: {submissionUserIdFilter}</span>
              <button type="button" className="rounded border border-zinc-700/30 px-2 py-1 text-xs" onClick={() => setSubmissionUserIdFilter("")}>
                Clear
              </button>
            </div>
          ) : null}

          {submissionsLoading ? (
            <p className="text-sm text-zinc-500">Loading submissions...</p>
          ) : filteredSubmissions.length === 0 ? (
            <p className="text-sm text-zinc-500">No submissions found.</p>
          ) : (
            <div className="space-y-2">
              {filteredSubmissions.map((submission) => (
                <div
                  key={submission.applicationId}
                  ref={(node) => {
                    submissionRefs.current[submission.applicationId] = node;
                  }}
                  className="rounded-lg border border-zinc-700/30 p-3">
                  <button type="button" className="flex w-full items-center justify-between gap-2 text-left" onClick={() => toggleSubmissionExpanded(submission.applicationId)}>
                    <div>
                      <p className="font-medium text-zinc-100">
                        #{submission.applicationNumber} • {submission.formName}
                      </p>
                      <p className="text-xs text-zinc-400">
                        Status: {submission.status} {submission.linkedModmailId ? `• Modmail: ${submission.linkedModmailId}` : ""}
                      </p>
                      <button
                        type="button"
                        className="mt-1 text-xs text-primary-400 hover:text-primary-300"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSubmissionUserIdFilter(submission.userId);
                        }}>
                        {submission.userDisplayName}
                      </button>
                    </div>
                    <span className="text-xs text-zinc-400">{expandedSubmissionIds.has(submission.applicationId) ? "Hide" : "View"}</span>
                  </button>

                  {expandedSubmissionIds.has(submission.applicationId) && (
                    <div className="mt-3 grid gap-3 lg:grid-cols-3">
                      <div className="rounded border border-zinc-700/20 bg-zinc-900/20 p-2 lg:col-span-2">
                        <p className="mb-2 text-xs font-medium text-zinc-300">Submission answers</p>
                        <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                          {submission.responses.map((answer, index) => (
                            <div key={`${submission.applicationId}-${index}`} className="rounded border border-zinc-700/20 bg-zinc-900/30 p-2 text-xs text-zinc-300">
                              <p className="font-semibold text-zinc-100">
                                {index + 1}. {answer.questionLabel}
                              </p>
                              <p className="mt-1 whitespace-pre-wrap">{answer.values?.join(", ") || answer.value || "_No answer_"}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded border border-zinc-700/20 bg-zinc-900/20 p-2">
                        <p className="mb-2 text-xs font-medium text-zinc-300">Previous applications (same form)</p>
                        <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                          {selectedSubmissionId === submission.applicationId && relatedSubmissions.length > 0 ? (
                            relatedSubmissions.map((entry) => (
                              <button
                                key={entry.applicationId}
                                type="button"
                                className="w-full rounded border border-zinc-700/20 bg-zinc-900/30 p-2 text-left text-xs text-zinc-300 transition hover:bg-white/5"
                                onClick={() => toggleSubmissionExpanded(entry.applicationId)}>
                                <p className="font-semibold text-zinc-100">
                                  #{entry.applicationNumber} • {entry.status}
                                </p>
                                <p className="text-zinc-500">{new Date(entry.createdAt).toLocaleString()}</p>
                              </button>
                            ))
                          ) : (
                            <p className="text-xs text-zinc-500">No previous submissions for this form.</p>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 rounded border border-zinc-700/20 bg-zinc-900/20 p-2 lg:col-span-3">
                        <button
                          type="button"
                          className="rounded border border-zinc-700/30 px-2 py-1 text-xs"
                          onClick={() => reviewSubmission(submission.applicationId, "approved")}
                          disabled={!canReview || submission.status !== "pending"}>
                          Approve
                        </button>
                        <button
                          type="button"
                          className="rounded border border-zinc-700/30 px-2 py-1 text-xs"
                          onClick={() => openReasonModal(submission.applicationId, "approved")}
                          disabled={!canReview || submission.status !== "pending"}>
                          Approve + Reason
                        </button>
                        <button
                          type="button"
                          className="rounded border border-zinc-700/30 px-2 py-1 text-xs"
                          onClick={() => reviewSubmission(submission.applicationId, "denied")}
                          disabled={!canReview || submission.status !== "pending"}>
                          Deny
                        </button>
                        <button
                          type="button"
                          className="rounded border border-zinc-700/30 px-2 py-1 text-xs"
                          onClick={() => openReasonModal(submission.applicationId, "denied")}
                          disabled={!canReview || submission.status !== "pending"}>
                          Deny + Reason
                        </button>
                        <button type="button" className="rounded border border-zinc-700/30 px-2 py-1 text-xs" onClick={() => openSubmissionModmail(submission.applicationId)} disabled={!canReview}>
                          Open Modmail
                        </button>
                        <button
                          type="button"
                          className="ml-auto rounded border border-zinc-700/30 px-2 py-1 text-xs text-rose-300"
                          onClick={() => setConfirmDeleteSubmissionId(submission.applicationId)}
                          disabled={!canManage}>
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        open={!!reviewModal}
        onClose={() => {
          if (reviewSubmitting) return;
          setReviewModal(null);
          setReviewReason("");
        }}
        title={reviewModal?.status === "approved" ? "Approve with Reason" : "Deny with Reason"}
        maxWidth="sm"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                if (reviewSubmitting) return;
                setReviewModal(null);
                setReviewReason("");
              }}
              className="rounded-lg border border-zinc-700/30 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5"
              disabled={reviewSubmitting}>
              Cancel
            </button>
            <button
              onClick={() => void submitReviewWithReason()}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60"
              disabled={reviewSubmitting || reviewReason.trim().length === 0}>
              {reviewSubmitting ? "Submitting…" : "Submit"}
            </button>
          </div>
        }>
        <Textarea label="Reason" value={reviewReason} onChange={setReviewReason} placeholder="Enter review reason" rows={4} maxLength={2000} disabled={reviewSubmitting} />
      </Modal>

      <Modal
        open={!!confirmDeleteFormId}
        onClose={() => setConfirmDeleteFormId(null)}
        title="Delete Form"
        maxWidth="sm"
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setConfirmDeleteFormId(null)} className="rounded-lg border border-zinc-700/30 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5">
              Cancel
            </button>
            <button onClick={() => confirmDeleteFormId && deleteForm(confirmDeleteFormId)} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500">
              Delete Form
            </button>
          </div>
        }>
        <p className="text-sm text-zinc-300">Are you sure you want to delete this application form? All associated submissions will remain but the form will be removed.</p>
      </Modal>

      <Modal
        open={!!confirmDeleteSubmissionId}
        onClose={() => setConfirmDeleteSubmissionId(null)}
        title="Delete Submission"
        maxWidth="sm"
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setConfirmDeleteSubmissionId(null)} className="rounded-lg border border-zinc-700/30 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5">
              Cancel
            </button>
            <button
              onClick={() => confirmDeleteSubmissionId && deleteSubmission(confirmDeleteSubmissionId)}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500">
              Delete Submission
            </button>
          </div>
        }>
        <p className="text-sm text-zinc-300">This will permanently delete the submission. This cannot be undone.</p>
      </Modal>
    </div>
  );
}
