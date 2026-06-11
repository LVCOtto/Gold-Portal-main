import { format } from "date-fns";
import {
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  PackageSearch,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type JobFlowStageId = "logged" | "booked" | "quoted" | "awaiting_parts" | "to_be_booked" | "attended";
type JobFlowTone = "standard" | "complete" | "paused" | "blocked";
type JobFlowVariant = "breakdown" | "callback";

interface JobFlowStage {
  id: JobFlowStageId;
  label: string;
  description: string;
  icon: LucideIcon;
}

interface JobStatusFlowProps {
  status: string;
  jobDescription?: string | null;
  upcomingDate?: string | Date | null;
  upcomingDateType?: "parts" | "visit" | null;
  lastUpdatedDate?: string | Date | null;
  className?: string;
}

const BREAKDOWN_FLOW_STAGES: JobFlowStage[] = [
  {
    id: "logged",
    label: "LOGGED",
    description: "Job received",
    icon: ClipboardCheck,
  },
  {
    id: "booked",
    label: "BOOKED",
    description: "Visit booked",
    icon: CalendarClock,
  },
  {
    id: "attended",
    label: "ATTENDED",
    description: "Engineer attended",
    icon: Wrench,
  },
];

const CALLBACK_FLOW_STAGES: JobFlowStage[] = [
  {
    id: "logged",
    label: "LOGGED",
    description: "Job received",
    icon: ClipboardCheck,
  },
  {
    id: "quoted",
    label: "QUOTED",
    description: "Quote issued",
    icon: FileText,
  },
  {
    id: "awaiting_parts",
    label: "AWAITING PARTS",
    description: "Parts on order",
    icon: PackageSearch,
  },
  {
    id: "to_be_booked",
    label: "TO BE BOOKED",
    description: "Next visit to arrange",
    icon: CalendarClock,
  },
  {
    id: "attended",
    label: "ATTENDED",
    description: "Engineer attended",
    icon: Wrench,
  },
];

const FLOW_STAGES: Record<JobFlowVariant, JobFlowStage[]> = {
  breakdown: BREAKDOWN_FLOW_STAGES,
  callback: CALLBACK_FLOW_STAGES,
};

function normalizeStatus(status: string) {
  return status
    .toLowerCase()
    .replace(/[_/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getFlowVariant(jobDescription?: string | null): JobFlowVariant {
  const normalized = normalizeStatus(jobDescription ?? "");
  return normalized.includes("breakdown") ? "breakdown" : "callback";
}

function getFlowState(status: string, variant: JobFlowVariant): { stageId: JobFlowStageId; tone: JobFlowTone } {
  const normalized = normalizeStatus(status);

  if (!normalized || normalized === "unknown") {
    return { stageId: "logged", tone: "standard" };
  }

  if (/overdue/.test(normalized)) {
    return { stageId: variant === "breakdown" ? "booked" : "awaiting_parts", tone: "blocked" };
  }

  if (/cancel|reject/.test(normalized)) {
    return { stageId: "logged", tone: "blocked" };
  }

  if (/hold|delay/.test(normalized)) {
    return { stageId: variant === "breakdown" ? "booked" : "to_be_booked", tone: "paused" };
  }

  if (/complete|closed|invoiced/.test(normalized)) {
    return { stageId: "attended", tone: "complete" };
  }

  if (variant === "breakdown") {
    if (/attended|site attended|awaiting complete|finalis|close out|work in progress|repair|awaiting parts|parts ordered|parts on order|quote|approval/.test(normalized)) {
      return { stageId: "attended", tone: "standard" };
    }

    if (/booked|pending engineer|pending visit|scheduled/.test(normalized)) {
      return { stageId: "booked", tone: "standard" };
    }

    return { stageId: "logged", tone: "standard" };
  }

  if (/awaiting parts|parts ordered|parts on order/.test(normalized)) {
    return { stageId: "awaiting_parts", tone: "standard" };
  }

  if (/quote|approval/.test(normalized)) {
    return { stageId: "quoted", tone: "standard" };
  }

  if (/booked|pending engineer|pending visit|scheduled|to be booked|approved pending internal processing|approved/.test(normalized)) {
    return { stageId: "to_be_booked", tone: "standard" };
  }

  if (/attended|site attended|attended.*processing|awaiting complete|finalis|close out|work in progress|workshop repair|repair/.test(normalized)) {
    return { stageId: "attended", tone: "standard" };
  }

  if (/waiting acceptance|accepted|open|new|logged/.test(normalized)) {
    return { stageId: "logged", tone: "standard" };
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
  variant: JobFlowVariant,
  upcomingDate?: string | Date | null,
  upcomingDateType?: "parts" | "visit" | null,
) {
  const formattedDate = formatOptionalDate(upcomingDate);

  if (tone === "blocked") {
    if (stageId === "awaiting_parts") {
      return "Parts ETA is overdue. Contact the LVC team for an updated date.";
    }

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
      return "The job has been logged and is waiting for the next action.";
    case "booked":
      return "The breakdown visit has been booked.";
    case "quoted":
      return "A quote has been issued or is awaiting approval.";
    case "awaiting_parts":
      return "Parts are on order or being awaited.";
    case "to_be_booked":
      return variant === "breakdown" ? "The visit has been booked." : "The next visit needs to be booked.";
    case "attended":
      return "The engineer has attended or the job is being closed out.";
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
  jobDescription,
  upcomingDate,
  upcomingDateType,
  lastUpdatedDate,
  className,
}: JobStatusFlowProps) {
  const flowVariant = getFlowVariant(jobDescription);
  const stages = FLOW_STAGES[flowVariant];
  const flowState = getFlowState(status, flowVariant);
  const activeIndex = Math.max(stages.findIndex((stage) => stage.id === flowState.stageId), 0);
  const toneClasses = getToneClasses(flowState.tone);
  const currentStage = stages[activeIndex];
  const progressPercent = (activeIndex / (stages.length - 1)) * 100;
  const updatedDate = formatOptionalDate(lastUpdatedDate);
  const statusSummary = getStatusSummary(flowState.stageId, flowState.tone, flowVariant, upcomingDate, upcomingDateType);

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
            <Badge variant="outline" className="bg-background text-muted-foreground hover:no-default-hover-elevate">
              {flowVariant === "breakdown" ? "Breakdown" : "Callback"}
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
          <ol
            className={cn(
              "grid gap-0",
              flowVariant === "breakdown" ? "min-w-[420px] grid-cols-3" : "min-w-[680px] grid-cols-5",
            )}
            aria-label="Standard job stages"
          >
            {stages.map((stage, index) => {
              const isCurrent = index === activeIndex;
              const isComplete = index < activeIndex || (flowState.tone === "complete" && index === activeIndex);
              const isConnectorComplete = index < activeIndex;
              const StepIcon = isComplete ? CheckCircle2 : stage.icon;

              return (
                <li key={stage.id} className="relative flex flex-col items-center px-2 text-center">
                  {index < stages.length - 1 && (
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