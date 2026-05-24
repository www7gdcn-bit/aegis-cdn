# 多阶段构建:编译静态二进制 → 极小运行镜像
FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY main.go ./
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /out/edge-agent .

FROM alpine:3.20
RUN mkdir -p /var/lib/aegis-agent
COPY --from=build /out/edge-agent /usr/local/bin/edge-agent
# 以 root 运行:需读 OpenResty 日志卷、写 offset 持久化卷(避免命名卷属主冲突)。
# 生产可改指定 UID 并预置卷属主。
ENTRYPOINT ["/usr/local/bin/edge-agent"]
