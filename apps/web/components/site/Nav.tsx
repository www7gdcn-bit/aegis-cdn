"use client";

import { useEffect, useState } from "react";
import { BRAND, nav } from "@/lib/content";

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${
        scrolled ? "border-b border-white/10 bg-ink/70 backdrop-blur-xl" : "bg-transparent"
      }`}
    >
      <nav className="container-x flex h-16 items-center justify-between">
        <a href="#top" className="flex items-center gap-2 text-white">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-brand to-accent text-sm font-bold">
            A
          </span>
          <span className="text-[17px] font-semibold tracking-tight">{BRAND}</span>
        </a>

        <ul className="hidden items-center gap-8 md:flex">
          {nav.map((n) => (
            <li key={n.href}>
              <a href={n.href} className="text-sm text-white/70 transition-colors hover:text-white">
                {n.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-3 md:flex">
          <a href="/login" className="text-sm text-white/70 transition-colors hover:text-white">
            登录
          </a>
          <a href="#pricing" className="btn-primary !px-5 !py-2 !text-sm">
            立即接入
          </a>
        </div>

        <button
          className="text-white md:hidden"
          aria-label="菜单"
          onClick={() => setOpen((v) => !v)}
        >
          <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
          </svg>
        </button>
      </nav>

      {open && (
        <div className="border-t border-white/10 bg-ink/95 px-6 py-4 md:hidden">
          <ul className="flex flex-col gap-4">
            {nav.map((n) => (
              <li key={n.href}>
                <a
                  href={n.href}
                  className="text-white/80"
                  onClick={() => setOpen(false)}
                >
                  {n.label}
                </a>
              </li>
            ))}
            <li className="flex gap-3 pt-2">
              <a href="/login" className="btn-ghost-dark flex-1 !py-2 !text-sm">登录</a>
              <a href="#pricing" className="btn-primary flex-1 !py-2 !text-sm">立即接入</a>
            </li>
          </ul>
        </div>
      )}
    </header>
  );
}
