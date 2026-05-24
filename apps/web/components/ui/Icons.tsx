import type { SVGProps } from "react";

const base = (props: SVGProps<SVGSVGElement>) => ({
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...props,
});

export const ShieldIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);

export const BoltIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
  </svg>
);

export const InfinityIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M6.5 8.5a3.5 3.5 0 100 7c2 0 3-1.5 5.5-3.5S15.5 8.5 17.5 8.5a3.5 3.5 0 110 7c-2 0-3-1.5-5.5-3.5S8.5 8.5 6.5 8.5z" />
  </svg>
);

export const LockIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
    <path d="M8 10.5V8a4 4 0 018 0v2.5" />
    <path d="M12 14.5v2.5" />
  </svg>
);

export const icons: Record<string, (p: SVGProps<SVGSVGElement>) => JSX.Element> = {
  shield: ShieldIcon,
  bolt: BoltIcon,
  infinity: InfinityIcon,
  lock: LockIcon,
};
