-- 防护流水线编排(access_by_lua 入口)
-- 顺序:0 白名单 → 1 封禁/黑名单 → 2 WAF → 3 Bot → 4 限频 → 5 风险评分 → 6 决策 → 7 挑战校验
-- 原则:WAF 不依赖 Redis;Redis 不可用时"故障放行"(fail-open),保证可用性。
local config = require "aegis.config"
local redis = require "aegis.redis"
local ratelimit = require "aegis.ratelimit"
local waf = require "aegis.waf"
local botd = require "aegis.bot"
local risk = require "aegis.risk"
local challenge = require "aegis.challenge"
local ban = require "aegis.ban"
local fp = require "aegis.fingerprint"
local geo = require "aegis.geo"

local _M = {}

local function set_ctx(t)
  ngx.ctx.aegis = ngx.ctx.aegis or {}
  for k, v in pairs(t) do ngx.ctx.aegis[k] = v end
end

local function deny(status, reason, rule)
  set_ctx{ action = "block", reason = reason, rule = rule }
  ngx.status = status
  ngx.header["Content-Type"] = "text/html; charset=utf-8"
  ngx.say([[<!doctype html><meta charset="utf-8"><title>Blocked</title>
<body style="font-family:-apple-system,Segoe UI,sans-serif;text-align:center;padding:80px;color:#333">
<h1 style="font-size:48px;margin:0">]] .. status .. [[</h1>
<p>请求被 AegisCDN 安全策略拦截。Ray: ]] .. (ngx.var.request_id or "-") .. [[</p></body>]])
  return ngx.exit(status)
end

function _M.run()
  local domain = ngx.var.host or "default"
  local cfg = config.load(domain)
  -- 违规封禁:平台对该域名硬拦截(优先于一切)
  if cfg and cfg.blocked then
    return deny(403, "domain-blocked", "global-block")
  end
  if not cfg or cfg.enabled == false then return end

  set_ctx{ action = "allow", risk = 0 }

  -- GeoIP:解析真实客户端 IP 的国家(real_ip 还原后),写入变量供地区拦截/限频/日志使用
  ngx.var.aegis_country = geo.country(ngx.var.remote_addr)

  -- 0) 白名单:直接放行
  if ban.is_whitelisted(cfg) then
    set_ctx{ action = "allow", reason = "whitelist" }
    return
  end

  -- 1) 黑名单(国家/ASN)
  local bl, why = ban.is_blacklisted(cfg)
  if bl then return deny(403, "blacklist:" .. (why or ""), "blacklist") end

  -- 2) WAF(不依赖 Redis)
  local hit = waf.inspect(domain, cfg.waf or {})
  local waf_soft = false
  if hit.matched then
    if hit.action == "block" then
      return deny(403, "waf:" .. (hit.severity or ""), hit.rule)
    elseif hit.action == "challenge" then
      cfg._force_challenge = true
    else
      waf_soft = true   -- observe / log:喂风控
    end
  end

  -- 3) Bot 识别
  local bot = botd.detect{ ip = ngx.var.remote_addr, verify_rdns = (cfg.verify_rdns == true) }
  set_ctx{ bot_category = bot.category }
  if bot.good then
    set_ctx{ action = "allow", reason = "good-bot:" .. bot.category }
    return
  end
  if bot.fake then
    return deny(403, "fake-bot:" .. bot.category, "fake-bot")
  end
  -- 强自动化(curl/python/headless 等)直接进挑战,验证是否真实浏览器
  local bot_force_challenge = (bot.is_bot and not bot.good
    and bot.score >= (cfg.bot_challenge_score or 60))

  -- 取 Redis(失败则降级:跳过限频/封禁,仅靠 WAF+Bot+指纹)
  local red, rerr = redis.connect()
  local rl = { exceeded = false, max_ratio = 0 }
  if red then
    -- 1.5) Redis 封禁名单
    if ban.is_banned(red, ngx.var.remote_addr) then
      redis.release(red, false)
      return deny(403, "banned", "ban")
    end
    -- 4) 多维限频
    rl = ratelimit.evaluate(red, domain, cfg.ratelimit)
  else
    ngx.log(ngx.WARN, "[aegis] redis unavailable, fail-open: ", rerr)
  end

  -- 5) 风险评分
  local httpfp = fp.http_fp()
  local score = risk.score{
    rate_ratio = rl.max_ratio,
    bot_score = bot.score,
    fp_anomaly = httpfp.anomaly,
    geo_risk = 0,
    history = 0,
    waf_soft = waf_soft,
  }
  set_ctx{ risk = score }

  -- 6) 决策
  local need_challenge = cfg._force_challenge or bot_force_challenge or false
  if score >= (cfg.block_score or 80) then
    if red and cfg.ban and cfg.ban.auto then
      local ttl = ban.ban_ip(red, ngx.var.remote_addr, cfg.ban.base_ttl, cfg.ban.max_ttl)
      set_ctx{ reason = "auto-ban:" .. ttl }
    end
    if red then redis.release(red, false) end
    return deny(403, "risk:" .. score, "risk-block")
  end
  if score >= (cfg.challenge_score or 50) or rl.exceeded then
    need_challenge = true
  end

  -- Redis 用完归还(挑战只看 HMAC Cookie,不需要 Redis)
  if red then redis.release(red, false) end

  -- 7) 挑战:仅当客户端未带合法通行 Cookie 时下发
  if need_challenge and not challenge.verify() then
    set_ctx{ action = "challenge", reason = "risk:" .. score }
    return challenge.issue()
  end
  -- 放行
end

return _M
