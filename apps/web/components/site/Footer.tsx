import { BRAND } from "@/lib/content";

const cols = [
  { title: "产品", links: ["网站加速", "DDoS 防护", "WAF 安全", "全球节点", "价格"] },
  { title: "资源", links: ["接入文档", "API", "状态页", "更新日志"] },
  { title: "公司", links: ["关于我们", "客户案例", "联系商务", "招贤纳士"] },
  { title: "法务", links: ["服务条款", "隐私政策", "合规说明"] },
];

export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-ink py-16 text-white">
      <div className="container-x">
        <div className="grid gap-10 md:grid-cols-[1.5fr_repeat(4,1fr)]">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-brand to-accent text-sm font-bold">
                A
              </span>
              <span className="text-[17px] font-semibold">{BRAND}</span>
            </div>
            <p className="mt-4 max-w-xs text-sm text-white/45">
              企业级高防 CDN —— 智能防护、全球加速、永远在线。仅服务合法合规业务。
            </p>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <h4 className="text-sm font-semibold text-white/80">{c.title}</h4>
              <ul className="mt-4 space-y-2.5">
                {c.links.map((l) => (
                  <li key={l}>
                    <a href="#" className="text-sm text-white/45 transition-colors hover:text-white/80">
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-8 text-xs text-white/35 sm:flex-row">
          <span>© {new Date().getFullYear()} {BRAND}. 备案号占位 · 仅服务合法合规业务。</span>
          <span>Made with care · Apple × Cloudflare style</span>
        </div>
      </div>
    </footer>
  );
}
