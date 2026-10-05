import { UserRound } from "lucide-react";

interface AvatarProps {
  name: string;
  url?: string | null;
  size?: "sm" | "md" | "lg";
}

export function Avatar({ name, url, size = "md" }: AvatarProps) {
  return (
    <span className={`avatar avatar-${size}`} aria-label={`${name}'s avatar`}>
      {url ? (
        <img src={url} alt="" referrerPolicy="no-referrer" />
      ) : (
        <span className="avatar-fallback">
          {name.trim() ? (
            name.trim().slice(0, 1).toUpperCase()
          ) : (
            <UserRound size={size === "lg" ? 24 : 18} />
          )}
        </span>
      )}
    </span>
  );
}
