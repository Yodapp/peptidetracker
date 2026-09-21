import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Surface({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-[22px] border border-border/80 bg-card text-card-foreground shadow-[0_1px_2px_rgba(0,0,0,.025)]", className)}>{children}</div>;
}

export function PageHeader({ eyebrow, title, subtitle, action }: { eyebrow?: string; title: string; subtitle?: string; action?: ReactNode }) {
  return <header className="sticky top-0 z-20 -mx-5 mb-6 flex min-h-[94px] items-end justify-between gap-4 border-b border-border/60 bg-background/88 px-5 pb-3 pt-[calc(1.25rem+env(safe-area-inset-top))] backdrop-blur-2xl sm:-mx-6 sm:px-6"><div className="min-w-0">{eyebrow&&<p className="mb-1 text-sm font-semibold text-primary">{eyebrow}</p>}<h1 className="truncate text-[34px] font-bold leading-none tracking-[-.035em]">{title}</h1>{subtitle&&<p className="mt-2 text-base text-muted-foreground">{subtitle}</p>}</div>{action&&<div className="shrink-0">{action}</div>}</header>;
}

export function SectionHeading({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return <div className="mb-3 flex items-end justify-between gap-4 px-1"><div><h2 className="text-[17px] font-semibold tracking-[-.01em]">{title}</h2>{detail&&<p className="mt-1 text-[13px] text-muted-foreground">{detail}</p>}</div>{action}</div>;
}

export function SegmentedControl<T extends string | number>({ values, value, onChange, label }: { values: { value: T; label: string }[]; value: T; onChange: (value: T) => void; label: string }) {
  return <div className="grid grid-flow-col auto-cols-fr rounded-[10px] bg-muted p-0.5" aria-label={label}>{values.map(item=><button type="button" key={String(item.value)} aria-pressed={value===item.value} onClick={()=>onChange(item.value)} className={`min-h-9 rounded-lg px-3 text-[13px] font-medium transition-all ${value===item.value?"bg-card text-foreground shadow-[0_1px_3px_rgba(0,0,0,.12)]":"text-muted-foreground"}`}>{item.label}</button>)}</div>;
}
