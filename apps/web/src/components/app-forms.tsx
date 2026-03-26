import { useId, type ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const EMPTY_SELECT_VALUE = "__empty__";

export function FormField(props: {
  children: ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <div className={cn("stack-field", props.className)}>
      <Label className="px-1 text-[0.88rem] font-medium text-[rgb(47_33_22_/_0.74)]">
        {props.label}
      </Label>
      {props.children}
    </div>
  );
}

export function FormInput(props: React.ComponentProps<typeof Input>) {
  const { className, ...rest } = props;

  return <Input className={cn("rounded-2xl border-border/50 bg-white/80", className)} {...rest} />;
}

export function FormTextarea(props: React.ComponentProps<typeof Textarea>) {
  const { className, ...rest } = props;

  return (
    <Textarea
      className={cn("rounded-2xl border-border/50 bg-white/80", className)}
      {...rest}
    />
  );
}

export function FormSelect(props: {
  className?: string;
  disabled?: boolean;
  label: string;
  onValueChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  placeholder?: string;
  value: string;
}) {
  const fieldProps = props.className ? { className: props.className } : {};
  const selectProps = props.disabled ? { disabled: props.disabled } : {};

  return (
    <FormField label={props.label} {...fieldProps}>
      <Select
        onValueChange={(value) =>
          props.onValueChange(value === EMPTY_SELECT_VALUE ? "" : value)
        }
        value={props.value || EMPTY_SELECT_VALUE}
        {...selectProps}
      >
        <SelectTrigger className="w-full rounded-2xl border-border/50 bg-white/80">
          <SelectValue placeholder={props.placeholder ?? "Select an option"} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={EMPTY_SELECT_VALUE}>
            {props.placeholder ?? "Select an option"}
          </SelectItem>
          {props.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormField>
  );
}

export function ToggleField(props: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onCheckedChange: (value: boolean) => void;
}) {
  const id = useId();

  return (
    <Label
      className={cn(
        "toggle-field",
        props.checked && "toggle-field-active",
        props.disabled && "toggle-field-disabled"
      )}
      htmlFor={id}
    >
      <Checkbox
        checked={props.checked}
        disabled={props.disabled}
        className="sr-only"
        id={id}
        onCheckedChange={(checked) => props.onCheckedChange(checked === true)}
      />
      <span className="toggle-field-track" aria-hidden="true">
        <span className="toggle-field-thumb" />
      </span>
      <span className="toggle-field-label">{props.label}</span>
    </Label>
  );
}

export function ChoiceChip(props: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onCheckedChange: (value: boolean) => void;
}) {
  const id = useId();

  return (
    <Label
      className={cn(
        "choice-pill cursor-pointer rounded-full border border-border/50 bg-white/72 px-4 py-2 shadow-sm transition-colors hover:bg-white",
        props.checked && "border-primary/35 bg-primary/12 text-primary",
        props.disabled && "cursor-not-allowed opacity-60"
      )}
      htmlFor={id}
    >
      <Checkbox
        checked={props.checked}
        disabled={props.disabled}
        id={id}
        onCheckedChange={(checked) => props.onCheckedChange(checked === true)}
      />
      <span>{props.label}</span>
    </Label>
  );
}
