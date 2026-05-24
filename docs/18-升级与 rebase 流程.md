# GoEdge 上游同步与 rebase 流程

版本 v0.1(骨架) · 立项日期 2026-05-24 · 关联 [[docs/15-goedge-secondary-development-plan.md]]

> ⚠️ **本文档为 Phase 0 骨架** — 真实命令脚本将在 Phase 1(submodule 落地)
> 与第一次实际跑 sync 时定稿。当前先把**何时同步**、**怎么验证不破**、
> **broken 时回退到哪**的流程钉住,避免某天兴起 `git submodule update --remote` 然后炸。

---

## 1. 何时需要同步上游

| 触发条件 | 频率 | 优先级 |
| --- | --- | --- |
| GoEdge 发布 minor 版本(0.x.0) | 月级 | 高 — 含 bugfix + 新功能 |
| GoEdge 发布 patch 版本(0.x.y) | 不定 | 中 — 看是否含安全补丁 |
| 上游有安全公告(CVE / GHSA) | 立即 | 紧急 — 24h 内评估 |
| 上游有我们 overlay 关心模块的大改 | 不定 | 高 — overlay 可能失效 |
| 我们想引入上游新功能(如新 DNS 厂商) | 按需 | 中 |

→ 默认节奏:**每月第一周**例行 sync 一次(对齐 GoEdge minor 发布周期)。
→ 紧急安全补丁不等月节奏。

---

## 2. 标准同步流程(草案)

```bash
# scripts/sync-upstream.sh  (Phase 1 写)
set -euo pipefail

# 0. 确认工作区干净
[ -z "$(git status --porcelain)" ] || { echo "工作区不干净,先 commit/stash"; exit 1; }

# 1. 拉上游
for repo in EdgeAPI EdgeNode EdgeCommon; do
  echo "==> sync $repo"
  (cd "upstream/$repo" && git fetch origin && git log HEAD..origin/main --oneline | head -50)
done

# 2. 让人确认 changelog
read -p "继续 update submodule? [y/N] " ok
[ "$ok" = "y" ] || exit 0

# 3. 更新 submodule 指针
for repo in EdgeAPI EdgeNode EdgeCommon; do
  (cd "upstream/$repo" && git checkout origin/main)
done

# 4. 关键验证:overlay 是否仍能编译
bash scripts/build-edgeapi.sh    # 跑 aegis tag 构建
bash scripts/build-edgenode.sh
bash scripts/test-overlays.sh    # Phase 5+ 加 overlay 单测

# 5. 全部通过 → commit submodule 指针变更
git add upstream/
git commit -m "chore(upstream): sync GoEdge to <date / 上游 commit hash>"
```

---

## 3. Overlay 兼容性检查清单(rebase 时手动过)

每次 sync 后,对照 [[docs/16-overlay-build-tag-规范.md]] §3 的 overlay 清单,
逐项确认:

- [ ] aegis tag 构建仍通过(`go build -tags aegis`)
- [ ] community 构建仍通过(`go build`,无 tag)— 确保我们没意外破坏社区版
- [ ] overlay 替换的 stub 函数**签名**没变(grep upstream 对应文件)
- [ ] overlay 用到的 upstream 私有符号(types / funcs)仍存在且**含义未变**
- [ ] EdgeCommon 的 proto **没删字段**(删字段 = 我们 overlay 可能引用空)
- [ ] EdgeAPI 的 gRPC service 方法签名没变 — 否则 bff-edge SDK 要重生成
- [ ] 数据库 schema 变化 — overlay 引用的列 / 表 是否仍在

---

## 4. 出问题怎么办

### 4.1 overlay 编译失败

1. 看报错指向的 upstream 文件,git log 比对上次同步以来的变化
2. 决策树:
   - upstream 改动是"小修"(改了签名但语义不变)→ 改 overlay 适配
   - upstream 改动是"扩展点搬家"(stub 换位置 / 改 tag 命名)→ 改 overlay 位置 + tag
   - upstream **删了** 我们依赖的扩展点 → **回退 submodule**,在 issue 里描述需求向上游 PR
3. **不要** 把 upstream 改回去(违反 [[docs/16-overlay-build-tag-规范.md]] §5 红线)

### 4.2 同步后 bff-edge / SDK 不工作

1. 看 EdgeCommon proto 是否变了字段
2. `packages/edge-api-sdk` 重新 codegen
3. 跑 bff-edge 集成测试

### 4.3 紧急回退

```bash
# 回退所有 submodule 到上次成功的 commit
git checkout HEAD~1 -- upstream/
git submodule update --init
git commit -m "revert: rollback upstream sync — <原因>"
```

---

## 5. 不接受的 sync 模式(红线)

- ❌ `git submodule update --remote --merge` 一把梭(不看 changelog,不验证 overlay)
- ❌ 跳过 overlay 编译验证直接 commit submodule 指针
- ❌ 同时 sync 三个 submodule 又改 overlay(同一 commit 里),出问题 bisect 不出来
- ❌ sync 同时做 overlay 重构(两件独立的事必须分两次 commit)

---

## 6. 与商业版(Plus)同步的关系

D5 决策:**暂不购买**。但保留可能性:

- 如果将来购买,**不会** 把 Plus 源码 vendor 进我们仓库(授权不允许)
- 那时 `//go:build plus` 与 `//go:build aegis` 互斥,我们的 overlay 文件 tag 不变
- 但需要在 `scripts/build-*.sh` 里增加分支:plus 客户构 `-tags plus,aegis` 还是只 `plus`,
  取决于 Plus 与 aegis 功能重叠程度,届时再评

---

## 7. 关联

- [[docs/15-goedge-secondary-development-plan.md]] §2(D1 submodule 决策)
- [[docs/16-overlay-build-tag-规范.md]] §5(红线清单)
- [[docs/17-saas-svc-接口规范.md]] §5(SDK 与 proto 的依赖关系)
