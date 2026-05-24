// 官网文案集中处(对应 docs/07-首页UI文案.md),改文案只动这里

export const BRAND = "AegisCDN";

export const nav = [
  { label: "产品", href: "#advantages" },
  { label: "全球节点", href: "#network" },
  { label: "防护能力", href: "#protection" },
  { label: "价格", href: "#pricing" },
  { label: "客户", href: "#cases" },
  { label: "文档", href: "#faq" },
];

export const advantages = [
  {
    icon: "shield",
    title: "智能防护",
    en: "Intelligent Protection",
    desc: "实时识别 CC、Web 攻击与恶意 Bot,毫秒级拦截,业务无感。",
  },
  {
    icon: "bolt",
    title: "全球加速",
    en: "Global Acceleration",
    desc: "边缘缓存就近响应,首字节更快,带宽成本更低。",
  },
  {
    icon: "infinity",
    title: "永远在线",
    en: "Always Online",
    desc: "多节点冗余与故障自愈,源站宕机也能托底响应。",
  },
  {
    icon: "lock",
    title: "安全合规",
    en: "Secure by Default",
    desc: "自动 HTTPS、WAF、最小权限与全程审计,安全是默认项。",
  },
];

export const protectionStats = [
  { to: 12.8, decimals: 1, suffix: "亿", label: "今日拦截请求" },
  { to: 1.2, decimals: 1, suffix: " Tbps", label: "峰值清洗能力" },
  { to: 8, decimals: 0, suffix: " ms", label: "平均防护响应" },
  { to: 99.99, decimals: 2, suffix: "%", label: "服务可用性" },
];

export const capabilities = [
  "DDoS 清洗", "CC 防护", "WAF 防火墙", "Bot 管理",
  "速率限制", "地区围栏", "智能缓存", "自动 HTTPS",
];

export const plans = [
  {
    name: "Starter",
    price: "¥99",
    period: "/月",
    tagline: "起步上线,基础防护",
    features: ["100G 防护容量", "100GB 月流量", "1 个域名", "基础 CDN 加速", "自动 HTTPS", "7 天攻击日志"],
    cta: "选择 Starter",
    featured: false,
  },
  {
    name: "Business",
    price: "¥499",
    period: "/月",
    tagline: "成长业务,主动防御",
    features: ["300G 防护容量", "1TB 月流量", "5 个域名", "CC 防护", "WAF 安全防护", "Bot 识别", "30 天攻击日志"],
    cta: "选择 Business",
    featured: true,
  },
  {
    name: "Enterprise",
    price: "定制",
    period: "",
    tagline: "关键业务,专属保障",
    features: ["500G ~ 1T+ 防护", "不限流量(定制)", "不限域名", "专属节点与策略", "托管 WAF 规则", "专属客户经理 + SLA"],
    cta: "联系商务",
    featured: false,
  },
];

export const cases = [
  { industry: "电商零售", result: "大促期间抵御 800Gbps 攻击,全程零中断", quote: "上线后再没为流量高峰失眠过。" },
  { industry: "在线游戏", result: "CC 攻击拦截率 99.7%,登录延迟下降 40%", quote: "玩家几乎感受不到攻击的存在。" },
  { industry: "金融科技", result: "WAF 拦截 1,200 万次 Web 攻击,合规审计达标", quote: "安全和合规一次到位。" },
];

export const faqs = [
  { q: "接入会改变我的源站吗?", a: "不会。只需把域名 CNAME 到我们分配的地址,源站无需任何改动。" },
  { q: "多久能完成接入?", a: "通常 5 分钟内完成 DNS 解析校验与 HTTPS 证书签发,即刻生效。" },
  { q: "HTTPS 证书要自己买吗?", a: "不用。平台自动签发与续期免费证书,也支持上传自有证书。" },
  { q: "防护容量真有那么大吗?", a: "L7 防护(CC/WAF/限速)平台实时生效;容量级 DDoS 清洗依托上游网络与清洗中心能力,按套餐承诺提供。" },
  { q: "支持哪些支付方式?", a: "支持在线支付、余额钱包,企业客户支持对公转账。" },
];
