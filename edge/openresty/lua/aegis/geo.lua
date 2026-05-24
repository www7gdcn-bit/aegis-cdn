-- GeoIP:用 lua-resty-maxminddb + MaxMind GeoLite2 解析国家(用于地区拦截 / 攻击来源)。
-- 优雅降级:库未安装 / mmdb 不存在 / 查询失败 → 返回 "XX",绝不影响主流程。
-- 依赖:apk add libmaxminddb;opm get anjia0532/lua-resty-maxminddb;挂载 GeoLite2-Country.mmdb。
local _M = {}

local ok_lib, mmdb = pcall(require, "resty.maxminddb")
local ready = false

function _M.init()
  if not ok_lib then
    ngx.log(ngx.WARN, "[aegis] geoip lib not found, country=XX (degraded)")
    return
  end
  local db = os.getenv("GEOIP_COUNTRY_DB") or "/etc/openresty/geoip/GeoLite2-Country.mmdb"
  local f = io.open(db, "r")
  if not f then
    ngx.log(ngx.WARN, "[aegis] geoip db not found: ", db, " (country=XX, degraded)")
    return
  end
  f:close()
  local okk, err = pcall(function()
    if not (mmdb.initted and mmdb.initted()) then
      mmdb.init(db)
    end
  end)
  if okk then
    ready = true
    ngx.log(ngx.INFO, "[aegis] geoip ready: ", db)
  else
    ngx.log(ngx.ERR, "[aegis] geoip init failed: ", err)
  end
end

-- 返回 ISO 国家码(大写),失败 "XX"
function _M.country(ip)
  if not ready or not ip then return "XX" end
  local okk, res = pcall(mmdb.lookup, ip)
  if not okk or not res then return "XX" end
  local c = res.country and res.country.iso_code
  return (c and c ~= "") and c or "XX"
end

return _M
