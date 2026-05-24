-- Bot / 自动化识别 + 信誉评分 + 真假搜索引擎判定
local _M = {}

-- 明确的自动化工具/脚本特征(UA)
local AUTOMATION = {
  { pat = [[curl/]],            name = "curl",            score = 70 },
  { pat = [[wget]],             name = "wget",            score = 70 },
  { pat = [[python-requests]],  name = "python-requests", score = 80 },
  { pat = [[python-urllib]],    name = "python-urllib",   score = 80 },
  { pat = [[Go-http-client]],   name = "go-http",         score = 75 },
  { pat = [[Java/]],            name = "java",            score = 65 },
  { pat = [[okhttp]],           name = "okhttp",          score = 60 },
  { pat = [[node-fetch|axios]], name = "node-http",       score = 65 },
  { pat = [[scrapy]],           name = "scrapy",          score = 85 },
  { pat = [[HeadlessChrome]],   name = "headless-chrome", score = 85 },
  { pat = [[PhantomJS]],        name = "phantomjs",       score = 90 },
  { pat = [[Selenium|webdriver]], name = "selenium",      score = 90 },
  { pat = [[puppeteer]],        name = "puppeteer",       score = 85 },
  { pat = [[bot|crawler|spider]], name = "generic-bot",   score = 40 },
}

-- 已知善意爬虫(需 rDNS 验证;UA 仅声称)
local GOOD_BOTS = {
  { pat = [[Googlebot|Google-InspectionTool|Storebot-Google]], name = "googlebot", rdns = { "googlebot.com", "google.com" } },
  { pat = [[bingbot|BingPreview]], name = "bingbot",  rdns = { "search.msn.com" } },
  { pat = [[YandexBot]],           name = "yandex",   rdns = { "yandex.com", "yandex.net", "yandex.ru" } },
  { pat = [[DuckDuckBot]],         name = "duckduck", rdns = { "duckduckgo.com" } },
  { pat = [[Applebot]],            name = "applebot", rdns = { "applebot.apple.com" } },
}

-- 反查 rDNS 校验善意爬虫真伪(PTR 反查 → 后缀匹配 → 正查确认)
-- 需 nginx 配置 resolver;失败时保守返回 nil(未知,不轻信也不误杀)
local function verify_good_bot(ip, suffixes)
  local resolver = require "resty.dns.resolver"
  local r, err = resolver:new{ nameservers = { os.getenv("DNS_RESOLVER") or "8.8.8.8" }, retrans = 2, timeout = 800 }
  if not r then return nil end
  -- 构造 PTR 查询名(仅 IPv4)
  local o1, o2, o3, o4 = ip:match("^(%d+)%.(%d+)%.(%d+)%.(%d+)$")
  if not o1 then return nil end
  local arpa = string.format("%s.%s.%s.%s.in-addr.arpa", o4, o3, o2, o1)
  local ans = r:query(arpa, { qtype = r.TYPE_PTR })
  if not ans then return nil end
  for _, rec in ipairs(ans) do
    if rec.ptrdname then
      for _, suf in ipairs(suffixes) do
        if rec.ptrdname:sub(-#suf) == suf then
          return true
        end
      end
    end
  end
  return false
end

-- 主检测。返回 { is_bot, category, score(0-100), good, fake }
function _M.detect(opts)
  local ua = ngx.var.http_user_agent
  local ip = opts and opts.ip or ngx.var.remote_addr
  local out = { is_bot = false, category = "unknown", score = 0, good = false, fake = false }

  -- 无 UA / 极短 UA:可疑
  if not ua or #ua < 8 then
    out.is_bot = true; out.category = "no-ua"; out.score = 60
    return out
  end

  -- 善意爬虫?声称即校验
  for _, g in ipairs(GOOD_BOTS) do
    if ngx.re.find(ua, g.pat, "jo") then
      out.is_bot = true; out.category = g.name
      local ok = opts and opts.verify_rdns and verify_good_bot(ip, g.rdns)
      if ok == true then
        out.good = true; out.score = 0
      elseif ok == false then
        out.fake = true; out.score = 95   -- 伪装搜索引擎,高危
      else
        out.score = 20                     -- 未校验,轻度
      end
      return out
    end
  end

  -- 自动化工具特征
  for _, a in ipairs(AUTOMATION) do
    if ngx.re.find(ua, a.pat, "joi") then
      out.is_bot = true; out.category = a.name; out.score = a.score
      return out
    end
  end

  -- 浏览器特征缺失启发式(真实浏览器一般都带 Accept-Language)
  if not ngx.var.http_accept_language then
    out.score = out.score + 25
  end
  if not ngx.var.http_accept then
    out.score = out.score + 15
  end
  if out.score >= 40 then out.is_bot = true; out.category = "suspect-automation" end

  return out
end

return _M
