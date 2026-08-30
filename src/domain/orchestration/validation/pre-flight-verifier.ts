const TASK_HEADING_PATTERN = /^### \[[ xX]\] (.+)$/gm;
const FILES_FIELD_PATTERN = /^Files:\s*(.+)$/m;
const CHECK_FIELD_PATTERN = /^Check:\s*(.+)$/m;

/** Result of running pre-flight verification over a task checklist (05-tasks.md). */
export interface TaskChecklistVerificationResult {
  readonly isValid: boolean;
  readonly missingFieldTaskTitles: readonly string[];
}

/**
 * Mechanically verifies that every task in a checklist has a non-empty `Files:` list
 * and a non-empty `Check:` command, per contract Invariant 1 (Rule Enforcer / pre-flight verification).
 * @param checklistMarkdown Raw markdown content of 05-tasks.md.
 * @returns `isValid: true` iff the checklist has at least one task and every task carries
 *   both fields; otherwise `isValid: false` with the titles of the offending tasks.
 */
export function verifyTaskChecklist(checklistMarkdown: string): TaskChecklistVerificationResult {
  const sections = splitIntoTaskSections(checklistMarkdown);

  if (sections.length === 0) {
    return { isValid: false, missingFieldTaskTitles: [] };
  }

  const missingFieldTaskTitles = sections
    .filter((section) => !hasNonEmptyField(section.body, FILES_FIELD_PATTERN) || !hasNonEmptyField(section.body, CHECK_FIELD_PATTERN))
    .map((section) => section.title);

  return {
    isValid: missingFieldTaskTitles.length === 0,
    missingFieldTaskTitles,
  };
}

interface TaskSection {
  readonly title: string;
  readonly body: string;
}

/** Splits checklist markdown into one section per `### [ ] T-X <title>` heading, each spanning to the next heading. */
function splitIntoTaskSections(checklistMarkdown: string): TaskSection[] {
  const headingMatches = [...checklistMarkdown.matchAll(TASK_HEADING_PATTERN)];

  return headingMatches.map((match, index) => {
    const sectionStart = match.index + match[0].length;
    const sectionEnd = index + 1 < headingMatches.length ? headingMatches[index + 1].index : checklistMarkdown.length;
    return {
      title: match[1].trim(),
      body: checklistMarkdown.slice(sectionStart, sectionEnd),
    };
  });
}

function hasNonEmptyField(sectionBody: string, fieldPattern: RegExp): boolean {
  const match = fieldPattern.exec(sectionBody);
  return match !== null && match[1].trim().length > 0;
}
