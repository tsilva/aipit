import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PitStudioEntry } from "@/components/pit-studio-entry";
import {
  buildReplayInitialStudioState,
  SHARE_STATUS_QUERY_KEY,
  SHARE_STATUS_UNSUPPORTED,
} from "@/lib/share-replay";
import { buildStaticPageMetadata } from "@/lib/seo";
import { createShareUrl, readSharedConversationSnapshot } from "@/lib/share-storage";

type SharedReplayPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: SharedReplayPageProps): Promise<Metadata> {
  const { slug } = await params;

  return buildStaticPageMetadata({
    title: "Shared Replay | The AI Pit",
    description: "Shared replay pages are public-by-link transcripts and are excluded from search indexing.",
    path: `/s/${slug}`,
    index: false,
    follow: false,
  });
}

export default async function SharedReplayPage({ params }: SharedReplayPageProps) {
  const { slug } = await params;
  const sharedConversation = await readSharedConversationSnapshot(slug);

  if (sharedConversation.status === "unsupported") {
    redirect(`/?${SHARE_STATUS_QUERY_KEY}=${SHARE_STATUS_UNSUPPORTED}`);
  }

  if (sharedConversation.status !== "ok") {
    notFound();
  }

  return (
    <PitStudioEntry
      initialState={buildReplayInitialStudioState(sharedConversation.snapshot, createShareUrl(slug))}
    />
  );
}
