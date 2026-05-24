const logos = ["NovaPay", "Skyline", "Orbit Games", "Meridian", "BlueCart", "Helix", "Vertex", "Lumen"];

export default function TrustLogos() {
  const row = [...logos, ...logos];
  return (
    <section className="border-b border-black/5 bg-white py-12">
      <p className="container-x mb-8 text-center text-sm text-black/40">
        被对「在线」零容忍的团队信赖 · Trusted by teams that can&apos;t go offline
      </p>
      <div className="relative overflow-hidden no-scrollbar [mask-image:linear-gradient(to_right,transparent,#000_12%,#000_88%,transparent)]">
        <div className="flex w-max animate-marquee items-center gap-14">
          {row.map((name, i) => (
            <span key={i} className="text-xl font-semibold tracking-tight text-black/25 transition-colors hover:text-black/50">
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
