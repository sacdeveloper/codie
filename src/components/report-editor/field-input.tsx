"use client";
import { useFormContext, useWatch } from "react-hook-form";
import { Input, Select, Textarea } from "@/components/ui/input";
import type { FieldDefinition, SectionKey } from "@/lib/template/types";
import { isFieldRequired, isFieldVisible } from "@/lib/template/validation";
import type { ReportFormValues } from "@/lib/template/form-schema";
import { cn } from "@/lib/utils";

export function CategoryDot({ category }: { category: FieldDefinition["category"] }) {
  return (
    <span
      className={cn("inline-block size-2 shrink-0 rounded-full", category === "manual" ? "bg-slate-800" : "bg-brand-500")}
      title={category === "manual" ? "Manually entered value" : "Predefined / system value"}
      aria-hidden
    />
  );
}

export function FieldInput({ section, field, disabled, compact }: { section: SectionKey; field: FieldDefinition; disabled?: boolean; compact?: boolean }) {
  const { register, formState, control } = useFormContext<ReportFormValues>();
  const all = useWatch({ control }) as ReportFormValues;
  const data = all as never;
  if (!isFieldVisible(field, data)) return null;
  const required = isFieldRequired(field, data);
  const name = `${section}.${field.key}` as const;
  const error = (formState.errors as Record<string, Record<string, { message?: string }> | undefined>)[section]?.[field.key]?.message;
  const id = `f-${section}-${field.key}`;
  const listId = `${id}-options`;
  const common = { id, disabled, "aria-invalid": Boolean(error), "aria-describedby": error ? `${id}-err` : field.helpText ? `${id}-help` : undefined };

  let control_: React.ReactNode;
  switch (field.type) {
    case "textarea":
      control_ = <Textarea {...common} rows={4} maxLength={field.maxLength} placeholder={field.placeholder} {...register(name)} />;
      break;
    case "select":
      control_ = (
        <Select {...common} {...register(name)}>
          <option value="">— Select —</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
      );
      break;
    case "result":
      control_ = (
        <>
          <Input
            {...common}
            list={listId}
            maxLength={field.maxLength}
            placeholder={field.placeholder ?? "Type or choose a result"}
            autoComplete="off"
            // Results are printed in capitals as on the reference form.
            {...register(name, { setValueAs: (v) => (typeof v === "string" ? v.toUpperCase() : v) })}
            className="uppercase placeholder:normal-case"
          />
          <datalist id={listId}>{field.options?.map((o) => <option key={o.value} value={o.value} />)}</datalist>
        </>
      );
      break;
    case "number":
      control_ = (
        <div className="flex items-center gap-2">
          <Input {...common} type="number" step="any" inputMode="decimal" min={field.min} max={field.max} {...register(name)} />
          {field.unit && <span className="text-xs whitespace-nowrap text-slate-500">{field.unit}</span>}
        </div>
      );
      break;
    case "date":
      control_ = <Input {...common} type="date" {...register(name)} />;
      break;
    default:
      control_ = <Input {...common} maxLength={field.maxLength} placeholder={field.placeholder} autoComplete="off" {...register(name)} />;
  }

  return (
    <div className={cn("space-y-1", compact && "grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] items-start gap-3 space-y-0")}>
      <label htmlFor={id} className={cn("flex items-center gap-1.5 text-sm font-medium text-slate-700", compact && "pt-2")}>
        <CategoryDot category={field.category} />
        <span>{field.label}</span>
        {required && <span className="text-red-600" aria-label="required">*</span>}
      </label>
      <div className="space-y-1">
        {control_}
        {error ? (
          <p id={`${id}-err`} className="text-xs text-red-600">{error}</p>
        ) : field.helpText ? (
          <p id={`${id}-help`} className="text-xs text-slate-500">{field.helpText}</p>
        ) : null}
      </div>
    </div>
  );
}
