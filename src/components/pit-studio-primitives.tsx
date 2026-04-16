"use client";

import Image from "next/image";
import { withAvatarAssetVersion } from "@/lib/avatar-assets";
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";

function participantInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return "?";
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function isLocalAvatarAsset(url: string): boolean {
  return url.startsWith("/") && !url.startsWith("//");
}

// Generated speaking clips hold briefly near their boundaries, so loop the moving span.
const SPEAKING_AVATAR_LOOP_START_SECONDS = 0.12;
const SPEAKING_AVATAR_LOOP_END_MARGIN_SECONDS = 0.55;
const SPEAKING_AVATAR_MIN_TRIMMED_LOOP_SECONDS = 1.2;

function resizeTextarea(textarea: HTMLTextAreaElement) {
  textarea.style.height = "auto";
  textarea.style.overflowY = "hidden";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

export function ParticipantAvatar({
  name,
  avatarUrl,
  className,
  fallbackClassName,
  imageClassName,
  children,
  decorative = true,
  priority = false,
  sizes = "64px",
}: {
  name: string;
  avatarUrl?: string;
  className: string;
  fallbackClassName?: string;
  imageClassName?: string;
  children?: ReactNode;
  decorative?: boolean;
  priority?: boolean;
  sizes?: string;
}) {
  const normalizedAvatarUrl = avatarUrl?.trim();
  const versionedAvatarUrl = withAvatarAssetVersion(normalizedAvatarUrl);
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const showImage = Boolean(normalizedAvatarUrl) && failedAvatarUrl !== normalizedAvatarUrl;
  const optimizedAvatarUrl =
    showImage && versionedAvatarUrl && isLocalAvatarAsset(versionedAvatarUrl) ? versionedAvatarUrl : null;
  const shouldUseOptimizedImage = optimizedAvatarUrl !== null;

  return (
    <span
      className={className}
      aria-hidden={decorative}
      style={shouldUseOptimizedImage || children ? { position: "relative" } : undefined}
    >
      {showImage ? (
        shouldUseOptimizedImage ? (
          <Image
            className={imageClassName ?? "avatar-image"}
            src={optimizedAvatarUrl}
            alt={decorative ? "" : `${name} avatar`}
            fill
            priority={priority}
            sizes={sizes}
            onError={() => setFailedAvatarUrl(normalizedAvatarUrl ?? null)}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className={imageClassName ?? "avatar-image"}
            src={versionedAvatarUrl}
            alt={decorative ? "" : `${name} avatar`}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            fetchPriority={priority ? "high" : undefined}
            onError={() => setFailedAvatarUrl(normalizedAvatarUrl ?? null)}
          />
        )
      ) : (
        <span className={fallbackClassName ?? "avatar-fallback"}>{participantInitials(name)}</span>
      )}
      {children}
    </span>
  );
}

export function SpeakingParticipantAvatar({
  name,
  avatarUrl,
  speakingAvatarUrl,
  isSpeaking,
  className,
  fallbackClassName,
  imageClassName,
  videoClassName,
  decorative = true,
  priority = false,
  sizes = "64px",
}: {
  name: string;
  avatarUrl?: string;
  speakingAvatarUrl?: string;
  isSpeaking: boolean;
  className: string;
  fallbackClassName?: string;
  imageClassName?: string;
  videoClassName?: string;
  decorative?: boolean;
  priority?: boolean;
  sizes?: string;
}) {
  const normalizedSpeakingAvatarUrl = speakingAvatarUrl?.trim();
  const versionedSpeakingAvatarUrl = withAvatarAssetVersion(normalizedSpeakingAvatarUrl);
  const versionedPosterUrl = withAvatarAssetVersion(avatarUrl);
  const [failedSpeakingAvatarUrl, setFailedSpeakingAvatarUrl] = useState<string | null>(null);
  const [readySpeakingAvatarUrl, setReadySpeakingAvatarUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const showVideo = Boolean(normalizedSpeakingAvatarUrl) && failedSpeakingAvatarUrl !== normalizedSpeakingAvatarUrl;
  const isVideoReady = readySpeakingAvatarUrl === versionedSpeakingAvatarUrl;

  useEffect(() => {
    const video = videoRef.current;
    let animationFrameId: number | null = null;

    if (!video || !showVideo) {
      return;
    }

    if (!isSpeaking || !isVideoReady) {
      video.pause();
      video.currentTime = 0;
      return;
    }

    const loopWindow = () => {
      const duration = video.duration;

      if (
        !Number.isFinite(duration) ||
        duration < SPEAKING_AVATAR_MIN_TRIMMED_LOOP_SECONDS ||
        duration <= SPEAKING_AVATAR_LOOP_START_SECONDS + SPEAKING_AVATAR_LOOP_END_MARGIN_SECONDS
      ) {
        return null;
      }

      return {
        start: SPEAKING_AVATAR_LOOP_START_SECONDS,
        end: duration - SPEAKING_AVATAR_LOOP_END_MARGIN_SECONDS,
      };
    };

    const syncLoopWindow = () => {
      const bounds = loopWindow();

      if (bounds) {
        if (video.currentTime < bounds.start || video.currentTime >= bounds.end) {
          video.currentTime = bounds.start;
        }
      }

      animationFrameId = requestAnimationFrame(syncLoopWindow);
    };

    syncLoopWindow();

    const playPromise = video.play();

    if (!playPromise) {
      return () => {
        if (animationFrameId !== null) {
          cancelAnimationFrame(animationFrameId);
        }
      };
    }

    void playPromise.catch(() => {
      setFailedSpeakingAvatarUrl(normalizedSpeakingAvatarUrl ?? null);
      setReadySpeakingAvatarUrl(null);
    });

    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isSpeaking, isVideoReady, normalizedSpeakingAvatarUrl, showVideo, versionedSpeakingAvatarUrl]);

  return (
    <ParticipantAvatar
      name={name}
      avatarUrl={avatarUrl}
      className={className}
      fallbackClassName={fallbackClassName}
      imageClassName={imageClassName}
      decorative={decorative}
      priority={priority}
      sizes={sizes}
    >
      {showVideo ? (
        <video
          key={versionedSpeakingAvatarUrl}
          ref={videoRef}
          className={`${videoClassName ?? "avatar-video"} ${isSpeaking && isVideoReady ? "is-visible" : ""}`.trim()}
          src={versionedSpeakingAvatarUrl}
          poster={versionedPosterUrl}
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden="true"
          onCanPlay={() => setReadySpeakingAvatarUrl(versionedSpeakingAvatarUrl ?? null)}
          onError={() => {
            setFailedSpeakingAvatarUrl(normalizedSpeakingAvatarUrl ?? null);
            setReadySpeakingAvatarUrl(null);
          }}
        />
      ) : null}
    </ParticipantAvatar>
  );
}

export function FieldShell({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint ? <span className="mt-2 block text-sm text-[color:var(--muted)]">{hint}</span> : null}
    </label>
  );
}

export function AutoSizeTextarea({
  className,
  onChange,
  style,
  ...props
}: ComponentPropsWithoutRef<"textarea">) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const syncTextareaHeight = useEffectEvent(() => {
    if (textareaRef.current) {
      resizeTextarea(textareaRef.current);
    }
  });

  useLayoutEffect(() => {
    syncTextareaHeight();
  }, [props.value]);

  useEffect(() => {
    const textarea = textareaRef.current;
    const container = textarea?.parentElement;

    if (!textarea || !container || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      resizeTextarea(textarea);
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <textarea
      {...props}
      ref={textareaRef}
      className={className ? `${className} auto-size-textarea` : "auto-size-textarea"}
      style={style}
      onChange={(event) => {
        resizeTextarea(event.currentTarget);
        onChange?.(event);
      }}
    />
  );
}
