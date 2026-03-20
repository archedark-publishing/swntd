import type { ComponentProps } from "react";
import { AlertCircle, RefreshCw, ScrollText } from "lucide-react";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function AppChrome(props: {
  actorDisplayName: string;
  actorRoleLabel: string;
  canAdmin: boolean;
  isManualRefreshPending: boolean;
  onCreateTask: () => void;
  onRefresh: () => void;
}) {
  return (
    <header className="masthead">
      <div>
        <p className="eyebrow">Household Ledger</p>
        <h1>S#!% We Need To Do</h1>
        <p className="subtitle">
          A shared board for chores, errands, recurring rituals, and the small
          domestic plot twists that keep a household moving.
        </p>
      </div>
      <div className="masthead-actions">
        <Button
          className="gap-2 rounded-full bg-white/70 shadow-sm hover:bg-white"
          onClick={props.onRefresh}
          size="sm"
          type="button"
          variant="outline"
        >
          <RefreshCw className={cn("size-4", props.isManualRefreshPending && "animate-spin")} />
          {props.isManualRefreshPending ? "Refreshing..." : "Refresh"}
        </Button>
        {props.canAdmin ? (
          <Button className="gap-2 rounded-full shadow-sm" onClick={props.onCreateTask} type="button">
            New Task
          </Button>
        ) : null}
        <div className="actor-chip border border-border/50 bg-white/70 shadow-sm backdrop-blur-sm">
          <strong>{props.actorDisplayName}</strong>
          <Badge className="w-fit" variant="outline">
            {props.actorRoleLabel}
          </Badge>
        </div>
      </div>
    </header>
  );
}

export function ViewSwitcher<TView extends string>(props: {
  items: Array<{ id: TView; label: string }>;
  onSelect: (view: TView) => void;
  selected: TView;
}) {
  return (
    <nav aria-label="Primary views" className="view-nav">
      {props.items.map((item) => (
        <Button
          className={cn(
            "rounded-full border border-border/50 bg-white/60 text-foreground shadow-sm backdrop-blur-sm",
            item.id === props.selected && "bg-primary text-primary-foreground"
          )}
          key={item.id}
          onClick={() => props.onSelect(item.id)}
          size="sm"
          type="button"
          variant={item.id === props.selected ? "default" : "ghost"}
        >
          {item.label}
        </Button>
      ))}
    </nav>
  );
}

export function FlashBanner(props: {
  kind: "error" | "notice";
  message: string;
  onDismiss: () => void;
}) {
  return (
    <Alert
      className={cn(
        "mx-auto mb-4 max-w-[95rem] border-border/60 bg-white/78 shadow-sm backdrop-blur-sm",
        props.kind === "error" && "border-destructive/25 text-destructive"
      )}
    >
      <AlertCircle className="size-4" />
      <AlertTitle>{props.kind === "error" ? "Something needs attention" : "Update"}</AlertTitle>
      <AlertDescription>{props.message}</AlertDescription>
      <AlertAction>
        <Button onClick={props.onDismiss} size="sm" type="button" variant="ghost">
          Dismiss
        </Button>
      </AlertAction>
    </Alert>
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
