-- 封禁与白名单 + 自动学习(指数退避)
local _M = {}

local function in_list(value, list)
  if not value or not list then return false end
  for _, v in ipairs(list) do
    if v == value then return true end
  end
  return false
end

-- 白名单(优先于一切)。IP / UA 子串 / ASN
function _M.is_whitelisted(cfg)
  local wl = cfg.whitelist or {}
  if in_list(ngx.var.remote_addr, wl.ip) then return true end
  if in_list(ngx.var.aegis_asn, wl.asn) then return true end
  local ua = ngx.var.http_user_agent
  if ua and wl.ua then
    for _, frag in ipairs(wl.ua) do
      if ua:find(frag, 1, true) then return true end
    end
  end
  return false
end

-- 黑名单(国家 / ASN,控制面下发)
function _M.is_blacklisted(cfg)
  local bl = cfg.blacklist or {}
  if in_list(ngx.var.aegis_country, bl.country) then return true, "country" end
  if in_list(ngx.var.aegis_asn, bl.asn) then return true, "asn" end
  return false
end

-- Redis 封禁判定
function _M.is_banned(red, ip)
  local v = red:get("aegis:ban:" .. ip)
  return v and v ~= ngx.null
end

-- 封禁 IP(自动学习:重复触发 → 时长指数退避到 max_ttl)
function _M.ban_ip(red, ip, base_ttl, max_ttl)
  local strike_key = "aegis:strike:" .. ip
  local strikes = red:incr(strike_key)
  if strikes == 1 then red:expire(strike_key, 3600) end
  local ttl = math.min((base_ttl or 300) * (2 ^ (strikes - 1)), max_ttl or 86400)
  red:set("aegis:ban:" .. ip, strikes, "EX", math.floor(ttl))
  return math.floor(ttl), strikes
end

return _M
