import type { Metadata } from "next";
import { headers } from "next/headers";
import type { InitialStudioState } from "@/components/pit-studio";
import { PitStudioEntry } from "@/components/pit-studio-entry";
import { resolveInitialAudience } from "@/lib/audience";
import {
  missingOpenRouterKeyMessage,
  serverOpenRouterKeyMessage,
} from "@/lib/openrouter";
import { hasServerOpenRouterKey } from "@/lib/openrouter-server";
import {
  createInputFromStarterBundle,
  createRandomStarterInput,
  resolveStarterBundle,
} from "@/lib/pit";
import { readCountryCodeFromHeaders } from "@/lib/region";
import { buildStarterBundleMetadata } from "@/lib/seo";

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
  const hostedKeyAvailable = hasServerOpenRouterKey();

  return {
    config,
    audience,
    lineupOrder,
    starterBundleId: starter.bundle.id,
    apiKey: "",
    apiKeyStatus: hostedKeyAvailable ? "valid" : "empty",
    apiKeyStatusMessage: hostedKeyAvailable
      ? serverOpenRouterKeyMessage()
      : missingOpenRouterKeyMessage(),
    draftApiKey: "",
  };
}

export default async function Home({ searchParams }: HomePageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const initialState = await buildInitialStudioState(resolveBundleIdParam(resolvedSearchParams?.id));

  return <PitStudioEntry initialState={initialState} />;
}
