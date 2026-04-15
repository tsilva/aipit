"use client";

import Image from "next/image";
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
  decorative = true,
  priority = false,
  sizes = "64px",
}: {
  name: string;
  avatarUrl?: string;
  className: string;
  fallbackClassName?: string;
  imageClassName?: string;
  decorative?: boolean;
  priority?: boolean;
  sizes?: string;
}) {
  const normalizedAvatarUrl = avatarUrl?.trim();
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const showImage = Boolean(normalizedAvatarUrl) && failedAvatarUrl !== normalizedAvatarUrl;
  const optimizedAvatarUrl =
    showImage && normalizedAvatarUrl && isLocalAvatarAsset(normalizedAvatarUrl) ? normalizedAvatarUrl : null;
  const shouldUseOptimizedImage = optimizedAvatarUrl !== null;

  return (
    <span
      className={className}
      aria-hidden={decorative}
      style={shouldUseOptimizedImage ? { position: "relative" } : undefined}
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
            src={normalizedAvatarUrl}
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
    </span>
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
