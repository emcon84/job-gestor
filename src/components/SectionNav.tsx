import type { ReactNode } from "react";

/**
 * Sticky in-page navigation: anchor links to the page sections plus an
 * optional trailing slot (e.g. a link to another panel). Sections linked here
 * should use `scroll-mt-20` so the sticky bar does not cover their heading.
 */
export default function SectionNav({
  links,
  trailing,
}: {
  links: { href: string; label: string }[];
  trailing?: ReactNode;
}) {
  return (
    <nav
      aria-label="Secciones"
      className="sticky top-0 z-30 -mx-4 mb-6 flex items-center gap-1 overflow-x-auto border-b border-card-border bg-background/90 px-4 py-2 backdrop-blur"
    >
      {links.map((l) => (
        <a
          key={l.href}
          href={l.href}
          className="shrink-0 rounded-lg px-3 py-2 text-sm text-secondary transition-colors hover:bg-surface hover:text-primary"
        >
          {l.label}
        </a>
      ))}
      {trailing && <div className="ml-auto shrink-0 pl-2">{trailing}</div>}
    </nav>
  );
}
