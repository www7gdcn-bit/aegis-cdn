-- 请求指纹:HTTP/UA 指纹(完全可用)+ JA3/TLS 指纹(best-effort,需 OpenResty ssl 钩子)
local _M = {}

local JA3_DICT = ngx.shared.aegis_ja3   -- 在 ssl 阶段写入,access 阶段读取(按 client addr)

-- HTTP 指纹:综合 UA + 关键头存在性 + HTTP 版本,产出稳定 hash + 异常标记
function _M.http_fp()
  local ua = ngx.var.http_user_agent or "-"
  local accept = ngx.var.http_accept or "-"
  local lang = ngx.var.http_accept_language or "-"
  local enc = ngx.var.http_accept_encoding or "-"
  local ver = ngx.var.server_protocol or "-"
  local raw = table.concat({ ua, accept, lang, enc, ver }, "|")
  local anomaly = 0
  -- 浏览器声称却缺关键头 → 指纹矛盾
  local claims_browser = ngx.re.find(ua, [[(Mozilla|Chrome|Safari|Firefox|Edg)]], "jo") ~= nil
  if claims_browser then
    if lang == "-" then anomaly = anomaly + 1 end
    if enc == "-" then anomaly = anomaly + 1 end
    if accept == "-" then anomaly = anomaly + 1 end
  end
  return { hash = ngx.md5(raw), anomaly = anomaly, http_version = ver }
end

-- 在 ssl_client_hello_by_lua 阶段调用:采集并暂存 JA3(best-effort)
-- 说明:完整 JA3 = SSLVer,Ciphers,Exts,EllipticCurves,ECPointFmt 的 MD5。
-- 这里给出基于 ngx.ssl.clienthello 的采集骨架,需在 OpenResty(>=1.21,带 lua-resty-core)上验证。
function _M.collect_ja3()
  local ok, chello = pcall(require, "ngx.ssl.clienthello")
  if not ok or not chello then return end
  -- 取 SNI 与支持版本(可得;cipher/ext 原始字节解析依版本而定,生产需补全)
  local sni = chello.get_client_hello_server_name and chello.get_client_hello_server_name() or "-"
  local versions = chello.get_supported_versions and chello.get_supported_versions() or {}
  local parts = { sni or "-", table.concat(versions or {}, "-") }
  local ja3_src = table.concat(parts, ",")
  local key = (ngx.var.remote_addr or "?")
  if JA3_DICT then
    JA3_DICT:set("ja3:" .. key, ngx.md5(ja3_src), 30)  -- 30s 内同 IP 复用
  end
end

-- access 阶段读取本连接 JA3(可能为空)
function _M.get_ja3()
  if not JA3_DICT then return nil end
  return JA3_DICT:get("ja3:" .. (ngx.var.remote_addr or "?"))
end

return _M
