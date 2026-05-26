import type { ComponentProps, ReactNode } from "react";
import { LogOut, ScrollText, Settings, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function AppNavigation(props: {
  actorDisplayName: string;
  actorRoleLabel: string;
  isLoggingOut: boolean;
  isOpen: boolean;
  mainItems: Array<{ id: string; label: string; meta?: string }>;
  onClose: () => void;
  onLogOut: () => void;
  onSelectMain: (itemId: string) => void;
  selectedMain: string;
}) {
  return (
    <>
      <div
        aria-hidden={!props.isOpen}
        className={cn("app-sidebar-backdrop", props.isOpen && "open")}
        onClick={props.onClose}
      />
      <aside
        aria-label="Primary navigation"
        className={cn("app-sidebar", props.isOpen && "open")}
      >
        <div className="app-sidebar-header">
          <div className="app-sidebar-title-row">
            <div>
              <strong className="app-sidebar-title">S#!% We Need To Do</strong>
            </div>
            <Button
              className="nav-drawer-close rounded-full"
              onClick={props.onClose}
              size="icon"
              type="button"
              variant="ghost"
            >
              <X className="size-4" />
              <span className="sr-only">Close navigation</span>
            </Button>
          </div>
        </div>

        <nav className="app-sidebar-nav">
          {props.mainItems.map((item) => (
            <Button
              className={cn(
                "sidebar-nav-button h-auto w-full justify-start rounded-3xl px-4 py-3 text-left",
                item.id === props.selectedMain && "sidebar-nav-button-active"
              )}
              key={item.id}
              onClick={() => {
                props.onSelectMain(item.id);
                props.onClose();
              }}
              type="button"
              variant={item.id === props.selectedMain ? "default" : "ghost"}
            >
              <span className="grid gap-1">
                <strong>{item.label}</strong>
                {item.meta ? <span className="text-xs opacity-80">{item.meta}</span> : null}
              </span>
            </Button>
          ))}
        </nav>

        <div className="app-sidebar-footer">
          <div className="app-sidebar-footer-copy">
            <p className="eyebrow">Signed In As</p>
          </div>
          <div className="actor-chip-wrap">
            <div className="actor-chip border border-border/50 bg-white/70 shadow-sm backdrop-blur-sm">
              <strong>{props.actorDisplayName}</strong>
              <Badge className="w-fit" variant="outline">
                {props.actorRoleLabel}
              </Badge>
            </div>
            <div className="actor-chip-actions">
              <Button
                className="actor-chip-action-button rounded-full"
                disabled={props.isLoggingOut}
                onClick={props.onLogOut}
                size="icon"
                type="button"
                variant="outline"
              >
                <LogOut className="size-4" />
                <span className="sr-only">Log out</span>
              </Button>
              <Button
                className={cn(
                  "actor-chip-action-button settings-gear-button rounded-full",
                  props.selectedMain === "settings" && "settings-gear-button-active"
                )}
                onClick={() => {
                  props.onSelectMain("settings");
                  props.onClose();
                }}
                size="icon"
                type="button"
                variant={props.selectedMain === "settings" ? "default" : "outline"}
              >
                <Settings className="size-4" />
                <span className="sr-only">Open settings</span>
              </Button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

export function StatusMessageCard(props: {
  description: string;
  title: string;
}) {
  return (
    <Card className="status-panel gap-3 border-border/50 bg-white/80 py-6 shadow-lg backdrop-blur-sm">
      <div className="flex items-start gap-3 px-6">
        <div className="rounded-full bg-primary/10 p-2 text-primary">
          <ScrollText className="size-4" />
        </div>
        <div className="space-y-1">
          <h2>{props.title}</h2>
          <p>{props.description}</p>
        </div>
      </div>
    </Card>
  );
}

export function SearchField(props: {
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <label className="search-field">
      <span>{props.label}</span>
      <Input
        className="rounded-2xl border-border/50 bg-white/78 shadow-sm"
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        type="search"
        value={props.value}
      />
    </label>
  );
}

export function SurfaceCard(props: ComponentProps<typeof Card>) {
  const { className, ...rest } = props;

  return (
    <Card
      className={cn(
        "border-border/50 bg-white/78 shadow-lg backdrop-blur-sm",
        className
      )}
      {...rest}
    />
  );
}

export function SectionHeading(props: {
  actions?: ReactNode;
  className?: string;
  compact?: boolean;
  description?: string;
  eyebrow: string;
  title: string;
  titleAs?: "h2" | "h3";
}) {
  const TitleTag = props.titleAs ?? "h2";

  return (
    <div className={cn("section-header", props.compact && "compact", props.className)}>
      <div className="section-heading-copy">
        <p className="eyebrow">{props.eyebrow}</p>
        <TitleTag>{props.title}</TitleTag>
        {props.description ? <p className="section-copy">{props.description}</p> : null}
      </div>
      {props.actions ? <div className="section-heading-actions">{props.actions}</div> : null}
    </div>
  );
}

export function EmptyStateCard(props: {
  message: string;
  title?: string;
}) {
  return (
    <SurfaceCard className="empty-card gap-2 py-4">
      {props.title ? <strong>{props.title}</strong> : null}
      <p className="m-0 text-sm leading-6 text-[rgb(47_33_22_/_0.66)]">{props.message}</p>
    </SurfaceCard>
  );
}

export function SelectionListButton(props: {
  active?: boolean;
  label: string;
  meta?: string;
  onClick: () => void;
}) {
  return (
    <Button
      className={cn(
        "template-row h-auto w-full items-start justify-start rounded-3xl border border-border/50 bg-white/68 px-4 py-3 text-left shadow-sm backdrop-blur-sm",
        props.active && "bg-primary text-primary-foreground hover:bg-primary/90"
      )}
      onClick={props.onClick}
      type="button"
      variant={props.active ? "default" : "ghost"}
    >
      <span className="grid gap-1">
        <strong>{props.label}</strong>
        {props.meta ? <span className="text-xs opacity-80">{props.meta}</span> : null}
      </span>
    </Button>
  );
}

export function InfoRow(props: {
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <SurfaceCard className="cast-row gap-4 py-4">
      {props.children}
      {props.action}
    </SurfaceCard>
  );
}
