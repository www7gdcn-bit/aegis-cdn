# overlay build tag 规范

版本 v0.1(骨架) · 立项日期 2026-05-24 · 关联 [[docs/15-goedge-secondary-development-plan.md]]

> ⚠️ **本文档为 Phase 0 骨架** — 规则、命令、模板的细节将在 Phase 1
> (`upstream/` submodule + `overlays/` 空骨架落地)与 Phase 5(第一个 overlay
> `service_plan_aegis` 实战)中逐步定稿。当前提供**契约骨架**与**为什么这么做**,
> 让后续二开有据可循。

---

## 1. 为什么用 build tag,而不是 fork / patch

| 方案 | 优点 | 劣点 | 是否选用 |
| --- | --- | --- | --- |
| **硬 fork(独立分支)** | 改起来无拘束 | 升级 = 合并地狱;每次 GoEdge 上游迭代都要手动 rebase 全代码 | ✗ |
| **patch 文件** | 修改可追踪 | patch 漂移;upstream 文件行号一变就崩 | △(仅用于个别 stub 替换不掉的小修) |
| **`//go:build aegis` 旁路文件** | upstream 文件零改动;升级 = 跑 `git submodule update` 即可 | 必须 upstream 已经提供"扩展点"(stub 或可替换函数) | ✓ **首选** |

**铁律**:**对 `upstream/` 下任何文件的修改都视为最后手段**。
能用新建 `*_aegis.go` 文件解决的,**不准** 改 upstream。

---

## 2. 命名规范

### 2.1 文件名后缀

| 用途 | 后缀 | 示例 |
| --- | --- | --- |
| aegis 商业化扩展实现 | `_aegis.go` | `service_plan_aegis.go` |
| aegis 专用类型 / 常量 | `_aegis.go` | `const_aegis.go` |
| aegis 专用测试 | `_aegis_test.go` | `service_plan_aegis_test.go` |
| 必要的 upstream patch(尽量避免) | `*.patch`,放 `overlays/patches/` | `EdgeAPI-rpc-server-bootstrap.patch` |

### 2.2 build tag 头

每个 aegis overlay 文件**第一行**必须是:

```go
//go:build aegis
// +build aegis
```

(双行兼容 Go 1.17 前后的 build tag 语法。)

GoEdge 社区版的对应 stub 文件通常带:

```go
//go:build !plus && !aegis
// +build !plus,!aegis
```

→ 我们的 aegis 文件被启用时,自动**互斥替换** community 的 stub。
→ 不启用 `-tags aegis` 时,行为退化为 GoEdge 社区版,**不会**因 overlay 文件存在而破坏。

### 2.3 目录镜像

`overlays/EdgeAPI/internal/...` 路径**严格镜像** `upstream/EdgeAPI/internal/...`。
- 好处:rebase 上游时一眼能看出哪些扩展点可能受影响
- 工具脚本(§4)依赖这个对齐做合并

---

## 3. 哪些扩展点可以用 aegis tag 注入(待详定)

> 这里只列**已确认存在 community/plus 互斥点**的入口,详细函数签名 Phase 5 实战时补。

| 模块 | community stub | 我们的 aegis 实现 |
| --- | --- | --- |
| 套餐 | `EdgeAPI/internal/rpc/services/service_plan_community.go` | `service_plan_aegis.go` |
| 用户订阅 | `service_user_plan_community.go` | `service_user_plan_aegis.go` |
| 防护模板 | (新增,无 stub) | `service_protection_template_aegis.go` |
| 节点上限等常量 | `internal/const/const_community.go` | `const_aegis.go` |
| 用户账户 / 余额 | `db/models/user_account_*.go` 部分 stub | `user_account_aegis.go` |
| WAF 跨节点信誉 | (新增 checkpoint) | `EdgeNode/.../checkpoints/cc_global_reputation_aegis.go` |
| Coraza CRS 旁路 | (新增层) | `EdgeNode/.../waf/coraza_layer_aegis.go` |

> **待办**:Phase 1 进 submodule 后,跑 `grep -rE "//go:build (!?plus|!?aegis)"` 扫一遍
> 上游所有扩展点,在本文表格里登记完整清单。

---

## 4. 构建流程(待 Phase 1 脚本落地)

```bash
# scripts/build-edgeapi.sh  (待写)
set -euo pipefail

# 1. 把 overlays/EdgeAPI/ 同步到 upstream/EdgeAPI/(rsync,不删 upstream 自身文件)
rsync -av overlays/EdgeAPI/ upstream/EdgeAPI/

# 2. 在 upstream/EdgeAPI/ 下用 aegis tag 编译
cd upstream/EdgeAPI
go build -tags aegis -o ../../bin/edgeapi-aegis ./cmd/edgeapi
```

**清理**:构建完后 `git status upstream/` 应该**只显示**我们 overlay 进去的文件;
若显示 upstream 自身文件被修改,说明有人违规直接改了 upstream,**必须回滚**。

**未决细节**(Phase 1 定):
- 是否引入 Bazel / Mage,还是纯 shell + go build 就够
- CI 上如何同时跑社区版构建(无 tag)+ aegis 版构建(有 tag),保证两套都不破
- overlay → upstream 合并是 rsync 还是 symlink,哪个对 IDE 索引更友好

---

## 5. 红线清单

- ❌ 不准直接修改 `upstream/` 下任何 `.go` 文件(patches/ 是最后手段且需 PR review)
- ❌ 不准在 aegis overlay 里改 EdgeCommon proto 既有字段(只能加新 service / 新 field)
- ❌ 不准在 `*_aegis.go` 里 import 任何**没有** aegis tag 保护的 community 私有符号
  (会导致 aegis 关闭时编译失败)
- ✅ 必须给每个 aegis overlay 写至少一行 `// 用途:` 注释,说明替换的是 community 哪个 stub
- ✅ 必须每次 `git submodule update` 后跑一次 `scripts/build-edgeapi.sh` 验证 overlay 仍能编译

---

## 6. 关联

- [[docs/15-goedge-secondary-development-plan.md]] §5(模块复用 / 扩展 / 新增 / 不改)
- [[docs/17-saas-svc-接口规范.md]] — overlay 在 EdgeAPI 一侧,SaaS 服务在另一侧,通过 gRPC + REST 解耦
- [[docs/18-升级与 rebase 流程.md]] — 上游同步时如何检查 overlay 是否仍兼容
