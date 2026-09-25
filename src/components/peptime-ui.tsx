"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

export function Surface({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-[18px] bg-card text-card-foreground", className)}>{children}</div>;
}

function subscribeScroll(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}
const scrolledPastTitle = () => window.scrollY > 40;

/**
 * iOS-style navigation header: a large title that scrolls away while a small
 * centered title and a hairline fade into the bar pinned at the top.
 */
export function PageHeader({ title, subtitle, action, back }: { title: string; subtitle?: ReactNode; action?: ReactNode; back?: { label: string; onClick: () => void } }) {
  const collapsed = useSyncExternalStore(subscribeScroll, scrolledPastTitle, () => false);
  return <>
    <div className={cn(
      "sticky top-0 z-20 -mx-5 grid h-[calc(3.25rem+env(safe-area-inset-top))] grid-cols-[minmax(0,1fr)_minmax(0,auto)_minmax(0,1fr)] items-center gap-2 border-b px-3 pt-[env(safe-area-inset-top)] transition-colors duration-200 sm:-mx-6",
      collapsed ? "border-border/70 bg-background/85 backdrop-blur-xl backdrop-saturate-150" : "border-transparent",
    )}>
      <div className="flex min-w-0 justify-start">{back && <button type="button" onClick={back.onClick} className="-ml-1 flex min-h-11 min-w-0 items-center pr-2 text-[17px] text-primary active:opacity-50"><ChevronLeft className="size-7 shrink-0" strokeWidth={2.2}/><span className="truncate">{back.label}</span></button>}</div>
      <p aria-hidden className={cn("truncate text-[17px] font-semibold transition-opacity duration-200", collapsed ? "opacity-100" : "opacity-0")}>{title}</p>
      <div className="flex min-w-0 items-center justify-end gap-2">{action}</div>
    </div>
    <header className="mb-6">
      <h1 className="text-[34px] font-bold leading-[1.12] tracking-[-.022em]">{title}</h1>
      {subtitle && <p className="mt-1 text-[17px] leading-6 text-muted-foreground">{subtitle}</p>}
    </header>
  </>;
}

/** Round button in the header, e.g. the profile/settings entry. */
export function HeaderButton({ label, onClick, children, variant = "tinted" }: { label: string; onClick: () => void; children: ReactNode; variant?: "tinted" | "filled" }) {
  return <button type="button" aria-label={label} onClick={onClick} className={cn(
    "grid size-9 shrink-0 place-items-center rounded-full transition-opacity active:opacity-60 [&_svg]:size-[19px]",
    variant === "filled" ? "bg-primary text-primary-foreground" : "bg-secondary text-primary",
  )}>{children}</button>;
}

export function ProfileButton({ onClick, email }: { onClick: () => void; email?: string }) {
  const initial = email?.trim().charAt(0).toLocaleUpperCase("sv-SE");
  return <button type="button" aria-label="Inställningar och konto" onClick={onClick} className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#8fd0c3] to-[#147d70] text-[15px] font-semibold text-white shadow-sm transition-opacity active:opacity-60">
    {initial || <UserRound className="size-[19px]"/>}
  </button>;
}

export function SectionHeading({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return <div className="mb-2.5 flex items-end justify-between gap-4 px-1"><div className="min-w-0"><h2 className="text-[20px] font-bold leading-tight tracking-[-.012em]">{title}</h2>{detail&&<p className="mt-0.5 text-[13px] text-muted-foreground">{detail}</p>}</div>{action}</div>;
}

/** Inset grouped list, as in iOS Settings. */
export function ListSection({ title, footer, children, className }: { title?: string; footer?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={cn("mb-7", className)}>
    {title && <h2 className="mb-1.5 px-4 text-[13px] uppercase tracking-[.02em] text-muted-foreground">{title}</h2>}
    <div className="overflow-hidden rounded-[14px] bg-card [&>*+*]:border-t [&>*+*]:border-border/80">{children}</div>
    {footer && <div className="mt-1.5 px-4 text-[13px] leading-[18px] text-muted-foreground">{footer}</div>}
  </section>;
}

export function IconTile({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("grid size-[30px] shrink-0 place-items-center rounded-[8px] text-white [&_svg]:size-[18px]", className ?? "bg-primary")}>{children}</span>;
}

export function ListRow({ icon, iconClassName, title, subtitle, value, trailing, onClick, chevron, destructive, className }: {
  icon?: ReactNode; iconClassName?: string; title: ReactNode; subtitle?: ReactNode; value?: ReactNode; trailing?: ReactNode;
  onClick?: () => void; chevron?: boolean; destructive?: boolean; className?: string;
}) {
  const content = <>
    {icon && <IconTile className={iconClassName}>{icon}</IconTile>}
    <span className="min-w-0 flex-1"><span className={cn("block truncate text-[17px] leading-[22px]", destructive && "text-destructive")}>{title}</span>{subtitle && <span className="mt-0.5 block text-[13px] leading-[18px] text-muted-foreground">{subtitle}</span>}</span>
    {value !== undefined && <span className="shrink-0 text-right text-[17px] text-muted-foreground">{value}</span>}
    {trailing}
    {chevron && <ChevronRight className="-mr-1 size-5 shrink-0 text-muted-foreground/50" strokeWidth={2.4}/>}
  </>;
  const classes = cn("flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left", onClick && "transition-colors active:bg-muted", className);
  return onClick ? <button type="button" onClick={onClick} className={classes}>{content}</button> : <div className={classes}>{content}</div>;
}

export function ProgressRing({ value, total, size = 64, stroke = 8, children }: { value: number; total: number; size?: number; stroke?: number; children?: ReactNode }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = total > 0 ? Math.min(1, value / total) : 0;
  return <div className="relative shrink-0" style={{ width: size, height: size }}>
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-primary/15"/>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - fraction)} className="text-primary transition-[stroke-dashoffset] duration-700 ease-out"/>
    </svg>
    {children && <div className="absolute inset-0 grid place-items-center">{children}</div>}
  </div>;
}

/** Floating confirmation above the tab bar, with an optional action such as Ångra. */
export function Toast({ message, actionLabel, onAction }: { message: string; actionLabel?: string; onAction?: () => void }) {
  return <div role="status" className="fixed inset-x-4 bottom-[calc(68px+env(safe-area-inset-bottom))] z-40 mx-auto flex min-h-12 max-w-[440px] items-center justify-between gap-3 rounded-2xl bg-foreground py-1.5 pl-4 pr-1.5 text-[15px] text-background shadow-xl animate-in fade-in-0 slide-in-from-bottom-3 duration-200">
    <span className="min-w-0 truncate">{message}</span>
    {actionLabel && onAction && <button type="button" onClick={onAction} className="min-h-9 shrink-0 rounded-xl px-3 text-[15px] font-semibold text-[#8fd0c3] active:opacity-60 dark:text-primary">{actionLabel}</button>}
  </div>;
}

/** Top bar for bottom sheets: Avbryt · title · Spara, as in iOS modal sheets. */
export function SheetBar({ title, onCancel, onDone, doneLabel = "Klar", doneDisabled, cancelLabel = "Avbryt" }: { title: string; onCancel?: () => void; onDone?: () => void; doneLabel?: string; doneDisabled?: boolean; cancelLabel?: string }) {
  return <div className="-mx-5 -mt-5 mb-1 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-b border-border/70 px-2 py-1.5">
    <div className="flex justify-start">{onCancel && <button type="button" onClick={onCancel} className="min-h-11 px-3 text-[17px] text-primary active:opacity-50">{cancelLabel}</button>}</div>
    <p className="truncate text-[17px] font-semibold">{title}</p>
    <div className="flex justify-end">{onDone && <button type="button" onClick={onDone} disabled={doneDisabled} className="min-h-11 px-3 text-[17px] font-semibold text-primary active:opacity-50 disabled:opacity-35">{doneLabel}</button>}</div>
  </div>;
}

export function SegmentedControl<T extends string | number>({ values, value, onChange, label }: { values: { value: T; label: string }[]; value: T; onChange: (value: T) => void; label: string }) {
  return <div className="grid grid-flow-col auto-cols-fr rounded-[10px] bg-secondary/80 p-0.5" role="group" aria-label={label}>{values.map(item=><button type="button" key={String(item.value)} aria-pressed={value===item.value} onClick={()=>onChange(item.value)} className={`min-h-8 rounded-[8px] px-3 text-[13px] font-medium transition-all ${value===item.value?"bg-card text-foreground shadow-[0_1px_3px_rgba(0,0,0,.14)] dark:bg-[#636366]":"text-foreground/80"}`}>{item.label}</button>)}</div>;
}
