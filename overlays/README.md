# overlays/ — Aegis 二开增强层

版本 v0.1 · 立项日期 2026-05-24 · Phase 1 Step 2 落地骨架

## 与 upstream/ 的关系

```
upstream/      ← GoEdge 官方源码(git submodule,锁 release tag)
└── 只读       ← 不直接硬改,任何修改都视为最后手段
overlays/      ← Aegis 二开增强层(本目录)
└── 可写       ← 通过 build tag / rsync 注入到 upstream 同结构路径
```

## 三条原则

1. **不硬改 upstream**
   `upstream/{EdgeAPI,EdgeNode,EdgeCommon}/` 是 git submodule,锁定到上游
   release tag。任何修改都视为最后手段;能用新建 `*_aegis.go` 文件解决的,
   **不准**改 upstream。详见 [[docs/16-overlay-build-tag-规范.md]] §5 红线。

2. **build tag 互斥**
   - GoEdge 用 `//go:build !plus`(community 默认) 与 `//go:build plus`(商业版独占)
   - Aegis 用 **`//go:build aegis`** —— 与 plus 互斥,与 community 互补
   - 不启用 `-tags aegis` 时,行为退化为 GoEdge 社区版,**不会**因 overlay 文件存在而破坏

3. **目录镜像 upstream**
   `overlays/EdgeAPI/internal/...` 路径**严格镜像** `upstream/EdgeAPI/internal/...`,
   便于构建脚本 rsync 合并、上游 rebase 时一眼看出受影响范围。

## 目录骨架

```
overlays/
├── README.md           ← 本文件
├── EdgeAPI/            ← 镜像 upstream/EdgeAPI 结构(Phase 5+ 填实现)
├── EdgeNode/           ← 镜像 upstream/EdgeNode 结构(Phase 6/7+ 填实现)
├── EdgeCommon/         ← 镜像 upstream/EdgeCommon 结构(尽量不改 proto 既有定义)
└── patches/            ← 实在用 build tag 解决不了的小修才用 *.patch(最后手段)
```

各子目录现在只有 `.gitkeep`,具体扩展点的 `*_aegis.go` 文件由后续 Phase 按需新增。

## 三种合并方式(由轻到重,优先级从高到低)

| 方式 | 何时用 | 实现 |
| --- | --- | --- |
| **A. build tag 新文件** | upstream 已提供 `_community`/`_ext` stub 可替换时 | `overlays/.../*_aegis.go` rsync 进 upstream,`-tags aegis` 编译时互斥替换 |
| **B. build tag 新增能力** | 需要全新 service/checkpoint(upstream 无 stub) | 同上,但是新文件,不冲突任何 community 文件 |
| **C. patch 文件** | 需要改 upstream 某文件的几行(无可替换点) | `overlays/patches/*.patch`,build 脚本先 apply 再 build,记入 patch 索引 |

→ 永远先试 A,A 不行试 B,B 不行才考虑 C。

## 构建脚本

- `scripts/build-edgeapi.sh` — 编译 EdgeAPI(`-tags aegis`)
- `scripts/build-edgenode.sh` — 编译 EdgeNode(`-tags aegis`)

Phase 1 Step 2 提供雏形,真正的 rsync + 编译流水在第一次实战 overlay(Phase 5)前定稿。

## 关联文档

- [[../docs/15-goedge-secondary-development-plan.md]] — v2 北极星(GoEdge 二开实施方案)
- [[../docs/16-overlay-build-tag-规范.md]] — overlay 命名/红线/扩展点摸底结果
- [[../docs/17-saas-svc-接口规范.md]] — overlay 在 EdgeAPI 侧,saas-svc/bff-edge 在 NestJS 侧
- [[../docs/18-升级与 rebase 流程.md]] — 上游 sync 时 overlay 兼容性检查清单
