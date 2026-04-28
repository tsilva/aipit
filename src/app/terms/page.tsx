import { permanentRedirect } from "next/navigation";

export default function TermsRedirectPage() {
  permanentRedirect("/legal#terms");
}
