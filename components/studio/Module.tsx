import type { ReactNode, Ref } from "react";

/** One rack module: thin engraved header over its controls. */
export default function Module({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-panel-edge px-3 pt-2 pb-3 last:border-b-0">
      <header className="mb-2 flex items-center gap-2 border-b border-panel-edge/70 pb-1">
        <h2 className="engraved font-semibold">{title}</h2>
        {aside && <div className="ml-auto flex items-center gap-1">{aside}</div>}
      </header>
      {children}
    </section>
  );
}

/** Small engraved push-button used across the panel. */
export function PanelButton({
  children,
  className,
  ref,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { ref?: Ref<HTMLButtonElement> }) {
  return (
    <button
      ref={ref}
      type="button"
      {...props}
      className={`inline-flex min-h-8 items-center justify-center gap-1.5 rounded-[3px] border border-panel-edge bg-panel-hi px-2.5 text-label font-medium text-engrave shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_1px_0_rgba(0,0,0,0.12)] hover:bg-white active:translate-y-px active:shadow-none disabled:cursor-not-allowed disabled:opacity-50 ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

/** Keyboard hint chip, e.g. <Kbd>R</Kbd>. */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-[2px] border border-panel-edge px-1 font-sans text-label leading-4 text-engrave-soft">
      {children}
    </kbd>
  );
}
