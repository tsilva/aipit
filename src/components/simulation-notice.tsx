import { SITE_CONTACT_MAILTO } from "@/lib/contact";

export const SIMULATION_NOTICE_TEXT =
  "AI simulation parody experiment. Generated content is fictionalized and is not a real statement, endorsement, belief, or position of anyone depicted or referenced.";

export const TAKEDOWN_LINK_TEXT = "Report copyright, image-rights, privacy, or defamation concerns";

export function SimulationNotice({
  className,
  showReportLink = false,
}: {
  className?: string;
  showReportLink?: boolean;
}) {
  return (
    <aside className={`simulation-notice ${className ?? ""}`.trim()} aria-label="AI simulation notice">
      <span>{SIMULATION_NOTICE_TEXT}</span>
      {showReportLink ? (
        <a href={SITE_CONTACT_MAILTO}>{TAKEDOWN_LINK_TEXT}</a>
      ) : null}
    </aside>
  );
}
