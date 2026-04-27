import type { Metadata } from "next";
import { headers } from "next/headers";
import { PitStudioEntry } from "@/components/pit-studio-entry";
import { resolveInitialAudience } from "@/lib/audience";
import {
  compactRunInputForSerialization,
  createInputFromStarterBundle,
  createRandomStarterInput,
  resolveStarterBundle,
} from "@/lib/pit";
import type { InitialStudioState } from "@/lib/pit-studio-state";
import { readCountryCodeFromHeaders } from "@/lib/region";
import { resolveShareNotice } from "@/lib/share-replay";
import {
  buildHomeStructuredData,
  buildStarterBundleMetadata,
  buildStarterBundleStructuredData,
} from "@/lib/seo";

type HomePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function resolveBundleIdParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({ searchParams }: HomePageProps): Promise<Metadata> {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const bundleId = resolveBundleIdParam(resolvedSearchParams?.id);
  const bundle = bundleId ? resolveStarterBundle(bundleId) : undefined;

  if (!bundle) {
    return {};
  }

  return buildStarterBundleMetadata(bundle);
}

async function buildInitialStudioState(bundleId: string | undefined): Promise<InitialStudioState> {
  const queryStarterBundle = bundleId ? resolveStarterBundle(bundleId) : undefined;
  const requestHeaders = await headers();
  const audience = resolveInitialAudience({
    acceptLanguage: requestHeaders.get("accept-language"),
    countryCode: readCountryCodeFromHeaders(requestHeaders),
    starterBundleAudience: queryStarterBundle?.audience,
  });
  const starter = queryStarterBundle
    ? {
        bundle: queryStarterBundle,
        input: createInputFromStarterBundle(queryStarterBundle),
      }
    : createRandomStarterInput(undefined, audience);
  const config = starter.input;
  const lineupOrder = [config.coordinator, ...config.members].map((participant) => participant.id);

  return {
    config: compactRunInputForSerialization(config),
    audience,
    lineupOrder,
    starterBundleId: starter.bundle.id,
    apiKey: "",
    apiKeyStatus: "empty",
    apiKeyStatusMessage: "Enter a valid OpenRouter API key to start a debate.",
    draftApiKey: "",
    initialResult: null,
    initialStudioView: "setup",
    isReplayOnly: false,
    shareUrl: null,
    shareNotice: null,
  };
}

export default async function Home({ searchParams }: HomePageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const bundleId = resolveBundleIdParam(resolvedSearchParams?.id);
  const bundle = bundleId ? resolveStarterBundle(bundleId) : undefined;
  const initialState = await buildInitialStudioState(bundleId);
  const structuredData = bundle ? buildStarterBundleStructuredData(bundle) : buildHomeStructuredData();

  initialState.shareNotice = resolveShareNotice(resolvedSearchParams?.share);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <PitStudioEntry initialState={initialState} />
    </>
  );
}
