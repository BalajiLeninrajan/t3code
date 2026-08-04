import { SettingsIcon } from "lucide-react";
import { memo, useCallback } from "react";
import { Link, useNavigate } from "@tanstack/react-router";

import { useEnvironmentIdentificationMode } from "../../hooks/useSettings";
import { cn } from "../../lib/utils";
import {
  resolveEnvironmentIdentificationPillLabel,
  resolveSidebarStageBackdropVariant,
  SidebarStageBackdrop,
  useEnvironmentStageLabel,
} from "../SidebarStageBackdrop";
import { Badge } from "../ui/badge";
import {
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "../ui/sidebar";
import { SidebarProviderUpdatePill } from "./SidebarProviderUpdatePill";
import { SidebarUpdatePill } from "./SidebarUpdatePill";

export const SidebarChromeHeader = memo(function SidebarChromeHeader({
  isElectron,
}: {
  isElectron: boolean;
}) {
  const stageLabel = useEnvironmentStageLabel();
  const environmentIdentificationMode = useEnvironmentIdentificationMode();
  const backdropVariant = resolveSidebarStageBackdropVariant(
    stageLabel,
    environmentIdentificationMode === "artwork",
  );
  const pillLabel =
    environmentIdentificationMode === "pill"
      ? resolveEnvironmentIdentificationPillLabel(stageLabel)
      : null;

  return (
    <SidebarHeader
      className={cn(
        "@container/sidebar-header relative h-[var(--workspace-topbar-height)] shrink-0 flex-row items-center px-3 py-0 md:px-0",
        isElectron && "drag-region",
      )}
    >
      {backdropVariant ? <SidebarStageBackdrop variant={backdropVariant} /> : null}
      <SidebarTrigger
        className={cn(
          "relative z-10 md:hidden",
          backdropVariant &&
            "[:hover,[data-pressed]]:bg-white/15 focus-visible:ring-white/90 focus-visible:ring-offset-blue-700 [&_svg]:stroke-white/90! [&_svg]:opacity-100! [&_svg]:hover:stroke-white!",
        )}
      />
      <SidebarBrand onBackdrop={backdropVariant !== null} />
      {pillLabel ? (
        <Badge
          className="relative z-10 ml-1 rounded-full px-1.5 text-muted-foreground"
          data-environment-identification="pill"
          size="sm"
          variant="secondary"
        >
          {pillLabel}
        </Badge>
      ) : null}
    </SidebarHeader>
  );
});

function SidebarBrand({ onBackdrop }: { onBackdrop: boolean }) {
  return (
    <Link
      aria-label="Go to threads"
      className={cn(
        "sidebar-brand relative z-10 ml-[var(--workspace-titlebar-content-left)] h-7 w-fit min-w-0 shrink-0 items-center gap-1 overflow-hidden rounded-md outline-hidden ring-ring focus-visible:ring-2",
        onBackdrop ? "text-white" : "text-foreground",
      )}
      to="/"
    >
      <B5Wordmark />
      <span
        className={cn(
          "truncate text-sm font-medium tracking-tight",
          onBackdrop ? "text-white/70" : "text-muted-foreground",
        )}
      >
        Code
      </span>
    </Link>
  );
}

function B5Wordmark() {
  return (
    <svg
      aria-label="B5"
      className="h-2.5 w-auto shrink-0"
      viewBox="18.076 37 89.304 57.4437"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M43.4546 93H18.076V37H45.2782Q55.574 37.152 59.8671 42.9647Q62.4505 46.536 62.4505 51.5129Q62.4505 56.6418 59.8671 59.7571Q58.4234 61.5047 55.612 62.9484Q59.9051 64.5061 62.0896 67.8874Q64.2741 71.2687 64.2741 76.0936Q64.2741 81.0706 61.7667 85.0217Q60.171 87.6431 57.7775 89.4288Q55.0801 91.4803 51.4139 92.2402Q47.7477 93 43.4546 93ZM43.1887 68.3433H29.2456V83.2741H42.9987Q46.6839 83.2741 48.7355 82.2863Q52.4587 80.4627 52.4587 75.2958Q52.4587 70.9267 48.8494 69.2931Q46.8359 68.3813 43.1887 68.3433ZM49.0014 57.6676Q51.2809 56.2999 51.2809 52.7666Q51.2809 48.8535 48.2416 47.5997Q45.6201 46.7259 41.555 46.7259H29.2456V59.0733H42.9987Q46.6839 59.0733 49.0014 57.6676Z"
        fill="currentColor"
      />
      <path
        d="M87.9661 65.6459Q85.9906 65.6459 84.5469 66.1398Q82.0014 67.0516 80.7097 69.521L70.9838 69.0651L74.8589 38.6336H105.2144V47.8277H82.6853L80.7097 59.8711Q83.2171 58.2374 84.6228 57.7056Q86.9783 56.8318 90.3596 56.8318Q97.1981 56.8318 102.2891 61.4288Q107.38 66.0258 107.38 74.8019Q107.38 82.4383 102.479 88.441Q97.5781 94.4437 87.8142 94.4437Q79.9498 94.4437 74.8969 90.2266Q69.844 86.0095 69.2741 78.2592H80.0638Q80.7097 81.7924 82.5333 83.711Q84.3569 85.6296 87.8522 85.6296Q91.8793 85.6296 93.9878 82.7992Q96.0964 79.9688 96.0964 75.6757Q96.0964 71.4586 94.1208 68.5522Q92.1452 65.6459 87.9661 65.6459Z"
        fill="currentColor"
      />
    </svg>
  );
}

export const SidebarChromeFooter = memo(function SidebarChromeFooter() {
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();
  const handleSettingsClick = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
    void navigate({ to: "/settings" });
  }, [isMobile, navigate, setOpenMobile]);

  return (
    <SidebarFooter className="p-[var(--sidebar-content-inset)]">
      <SidebarProviderUpdatePill />
      <SidebarUpdatePill />
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton onClick={handleSettingsClick}>
            <SettingsIcon />
            <span>Settings</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
});
