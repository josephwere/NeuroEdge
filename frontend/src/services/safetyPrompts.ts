export interface SafetyPromptOptions {
  title: string;
  actionLabel?: string;
  chatMode?: boolean;
}

const RECOVERY_NOTE =
  "If this was accidental, contact admin or super admin to recover archived data.";

export function confirmSafeAction(options: SafetyPromptOptions): boolean {
  const actionLabel = options.actionLabel || "delete";
  if (options.chatMode) {
    return window.confirm(
      `Warning: You are about to ${actionLabel} "${options.title}".\n` +
        `This action affects conversation flow.\n\nContinue?`
    );
  }

  const firstStep = window.confirm(
    `Caution: You are about to ${actionLabel} "${options.title}".\n` +
      `Please confirm carefully to avoid accidental loss.\n\nProceed to verification?`
  );
  if (!firstStep) return false;

  const typed = window.prompt(
    `Type DELETE to confirm ${actionLabel} for "${options.title}".\n` +
      `${RECOVERY_NOTE}`,
    ""
  );
  return typed?.trim().toUpperCase() === "DELETE";
}

export function recoveryGuidance(entity: string): string {
  return `${entity} archived. ${RECOVERY_NOTE}`;
}
