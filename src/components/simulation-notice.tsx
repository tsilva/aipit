import { SITE_CONTACT_MAILTO } from "@/lib/contact";
import { SIMULATION_NOTICE_TEXT } from "@/lib/legal-notice";

export { SIMULATION_NOTICE_TEXT } from "@/lib/legal-notice";

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
