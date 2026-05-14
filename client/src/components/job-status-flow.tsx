import { format } from "date-fns";
import {
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  PackageSearch,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type JobFlowStageId = "logged" | "scheduled" | "visit" | "parts" | "finalising" | "complete";
type JobFlowTone = "standard" | "complete" | "paused" | "blocked";

interface JobFlowStage {
  id: JobFlowStageId;
  label: string;
  description: string;
  icon: LucideIcon;
}

interface JobStatusFlowProps {
  status: string;
  upcomingDate?: string | Date | null;
  upcomingDateType?: "parts" | "visit" | null;
  lastUpdatedDate?: string | Date | null;
  className?: string;
}

const JOB_FLOW_STAGES: JobFlowStage[] = [
  {
    id: "logged",
    label: "Logged",
    description: "Job received",
    icon: ClipboardCheck,
  },
  {
    id: "scheduled",
    label: "Scheduled",
    description: "Visit arranged",
    icon: CalendarClock,
  },
  {
    id: "visit",
    label: "Visit / Repair",
    description: "Engineer activity",
    icon: Wrench,
  },
  {
    id: "parts",
    label: "Parts / Approval",
    description: "Waiting on supply or sign-off",
    icon: PackageSearch,
  },
  {
    id: "finalising",
    label: "Finalising",
    description: "Close-out checks",
    icon: Clock3,
  },
  {
    id: "complete",
    label: "Complete",
    description: "Closed or invoiced",
    icon: ShieldCheck,
  },
];

const STAGE_INDEX = JOB_FLOW_STAGES.reduce<Record<JobFlowStageId, number>>((index, stage, stageIndex) => {
  index[stage.id] = stageIndex;
  return index;
}, {} as Record<JobFlowStageId, number>);

function normalizeStatus(status: string) {
  return status
    .toLowerCase()
    .replace(/[_/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getFlowState(status: string): { stageId: JobFlowStageId; tone: JobFlowTone } {
  const normalized = normalizeStatus(status);

  if (!normalized || normalized === "unknown") {
    return { stageId: "logged", tone: "standard" };
  }

  if (/cancel|reject/.test(normalized)) {
    return { stageId: "logged", tone: "blocked" };
  }

  if (/hold|delay/.test(normalized)) {
    return { stageId: "scheduled", tone: "paused" };
  }

  if (/complete|closed|invoiced/.test(normalized)) {
    return { stageId: "complete", tone: "complete" };
  }

  if (/attended.*processing|awaiting complete|finalis|close out/.test(normalized)) {
    return { stageId: "finalising", tone: "standard" };
  }

  if (/awaiting parts|parts ordered|parts on order|quote|approval/.test(normalized)) {
    return { stageId: "parts", tone: "standard" };
  }

  if (/attended|site attended|work in progress|engineer assigned|workshop repair|repair/.test(normalized)) {
    return { stageId: "visit", tone: "standard" };
  }

  if (/pending engineer|pending visit|scheduled|waiting acceptance|accepted/.test(normalized)) {
    return { stageId: "scheduled", tone: "standard" };
  }

  return { stageId: "logged", tone: "standard" };
}

function formatStatusLabel(status: string) {
  const normalized = status.trim();
  if (!normalized) return "Unknown";

  return normalized
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatOptionalDate(date: string | Date | null | undefined) {
  if (!date) return null;

  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) return null;

  return format(parsedDate, "MMM d, yyyy");
}

function getStatusSummary(
  stageId: JobFlowStageId,
  tone: JobFlowTone,
  upcomingDate?: string | Date | null,
  upcomingDateType?: "parts" | "visit" | null,
) {
  const formattedDate = formatOptionalDate(upcomingDate);

  if (tone === "blocked") {
    return "This job is outside the standard flow. Contact the LVC team if you need more detail.";
  }

  if (tone === "paused") {
    return "Progress is paused while the team resolves the blocker before the next action.";
  }

  if (formattedDate && upcomingDateType === "parts") {
    return `Parts are currently expected around ${formattedDate}.`;
  }

  if (formattedDate && upcomingDateType === "visit") {
    return `Engineer visit is scheduled for ${formattedDate}.`;
  }

  switch (stageId) {
    case "logged":
      return "The job has been received and is being prepared for the next action.";
    case "scheduled":
      return "An engineer visit is being arranged or is already scheduled.";
    case "visit":
      return "Engineer activity is underway or has recently taken place.";
    case "parts":
      return "The job is waiting on parts, supply progress, or approval before continuing.";
    case "finalising":
      return "The completed work is being processed before the job is closed.";
    case "complete":
      return "The job has been completed, closed, or invoiced.";
  }
}

function getToneClasses(tone: JobFlowTone) {
  if (tone === "complete") {
    return {
      bar: "bg-emerald-600 dark:bg-emerald-500",
      badge: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300",
      currentNode: "border-emerald-600 bg-emerald-600 text-white shadow-sm shadow-emerald-600/20 dark:border-emerald-500 dark:bg-emerald-500 dark:text-emerald-950",
    };
  }

  if (tone === "paused") {
    return {
      bar: "bg-amber-500 dark:bg-amber-400",
      badge: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300",
      currentNode: "border-amber-500 bg-amber-500 text-white shadow-sm shadow-amber-500/20 dark:border-amber-400 dark:bg-amber-400 dark:text-amber-950",
    };
  }

  if (tone === "blocked") {
    return {
      bar: "bg-destructive",
      badge: "border-destructive/20 bg-destructive/10 text-destructive",
      currentNode: "border-destructive bg-destructive text-destructive-foreground shadow-sm shadow-destructive/20",
    };
  }

  return {
    bar: "bg-primary",
    badge: "border-primary/20 bg-primary/10 text-primary",
    currentNode: "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/20",
  };
}

export function JobStatusFlow({
  status,
  upcomingDate,
  upcomingDateType,
  lastUpdatedDate,
  className,
}: JobStatusFlowProps) {
  const flowState = getFlowState(status);
  const activeIndex = STAGE_INDEX[flowState.stageId];
  const toneClasses = getToneClasses(flowState.tone);
  const currentStage = JOB_FLOW_STAGES[activeIndex];
  const progressPercent = (activeIndex / (JOB_FLOW_STAGES.length - 1)) * 100;
  const updatedDate = formatOptionalDate(lastUpdatedDate);
  const statusSummary = getStatusSummary(flowState.stageId, flowState.tone, upcomingDate, upcomingDateType);

  return (
    <section
      className={cn("rounded-md border bg-card p-4 text-card-foreground shadow-sm sm:p-5", className)}
      aria-label={`Job status flow: ${formatStatusLabel(status)}`}
      data-testid="job-status-flow"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Job Progress</h2>
            <Badge variant="outline" className={cn("hover:no-default-hover-elevate", toneClasses.badge)}>
              {currentStage.label}
            </Badge>
          </div>
          <p className="text-base font-medium text-foreground">Current status: {formatStatusLabel(status)}</p>
          <p className="max-w-3xl text-sm text-muted-foreground">{statusSummary}</p>
        </div>
        {updatedDate && (
          <div className="shrink-0 rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground">
            Updated <span className="font-medium text-foreground">{updatedDate}</span>
          </div>
        )}
      </div>

      <div className="mt-5">
        <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className={cn("h-full rounded-full transition-all duration-500", toneClasses.bar)} style={{ width: `${progressPercent}%` }} />
        </div>

        <div className="mt-4 overflow-x-auto pb-1">
          <ol className="grid min-w-[760px] grid-cols-6 gap-0" aria-label="Standard job stages">
            {JOB_FLOW_STAGES.map((stage, index) => {
              const isCurrent = index === activeIndex;
              const isComplete = index < activeIndex || (flowState.tone === "complete" && index === activeIndex);
              const isConnectorComplete = index < activeIndex;
              const StepIcon = isComplete ? CheckCircle2 : stage.icon;

              return (
                <li key={stage.id} className="relative flex flex-col items-center px-2 text-center">
                  {index < JOB_FLOW_STAGES.length - 1 && (
                    <div
                      className={cn(
                        "absolute left-[calc(50%+1.25rem)] right-[calc(-50%+1.25rem)] top-5 h-px",
                        isConnectorComplete ? toneClasses.bar : "bg-border",
                      )}
                      aria-hidden="true"
                    />
                  )}
                  <div
                    className={cn(
                      "relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 bg-background transition-colors",
                      isCurrent && toneClasses.currentNode,
                      isComplete && !isCurrent && "border-primary bg-primary text-primary-foreground",
                      !isCurrent && !isComplete && "border-border text-muted-foreground",
                    )}
                    aria-current={isCurrent ? "step" : undefined}
                  >
                    <StepIcon className="h-4 w-4" />
                  </div>
                  <div className="mt-3 space-y-1">
                    <div className={cn("text-sm font-medium", isCurrent ? "text-foreground" : "text-muted-foreground")}>
                      {stage.label}
                    </div>
                    <div className="text-xs leading-snug text-muted-foreground">{stage.description}</div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}