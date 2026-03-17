import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PitStudioEntry } from "@/components/pit-studio-entry";
import {
  buildReplayInitialStudioState,
  SHARE_STATUS_QUERY_KEY,
  SHARE_STATUS_UNSUPPORTED,
} from "@/lib/share-replay";
import { createShareUrl, readSharedConversationSnapshot } from "@/lib/share-storage";

type SharedReplayPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata(): Promise<Metadata> {
  return {
    robots: {
      index: false,
      follow: false,
    },
  };
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
