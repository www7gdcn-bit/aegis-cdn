# GeoIP 增强版 OpenResty:在官方镜像基础上加 libmaxminddb + lua-resty-maxminddb。
# 配置与 Lua 仍在运行时通过卷挂载;GeoLite2 数据库挂载到 /etc/openresty/geoip/。
FROM openresty/openresty:alpine
RUN apk add --no-cache libmaxminddb \
 && /usr/local/openresty/bin/opm get anjia0532/lua-resty-maxminddb
# 无 mmdb 时 geo.lua 会优雅降级为 XX,不影响启动与防护。
