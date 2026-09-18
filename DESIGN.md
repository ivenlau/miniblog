# Miniblog — 轻量级个人博客系统设计文档

> 与 Minidriver 同系的 Cloudflare Workers 全栈博客：SSR 公开站 + 可移植同源认证 + 素材联动 + 主题/插件系统。
> 支持两种部署形态：**独立部署**（自带 D1/R2 与完整认证）与**联动部署**（与 Minidriver 共库共桶、SSO、图床直链）。

| | |
|---|---|
| 版本 | v1.1（设计定稿，待实施） |
| 日期 | 2026-09-18 |
| 状态 | Draft → Ready for Implementation |
| 产品名 | Miniblog |
| 部署 | `b.<根域>` 子域（如 `b.minimo.qzz.io`），全环境变量驱动，可换域重部署 |

---

## 1. 概述

### 1.1 目标

- 单作者个人博客：写 Markdown、发布、被读到（SEO/RSS），零服务器运维
- **双部署形态**（本设计的一等概念）：
  - **独立部署**：绑定自己的 D1/R2，自带完整认证（setup 向导 / Passkey / 密码 / 恢复码）——**不依赖 minidriver，minidriver 零改动**
  - **联动部署**：指向与 minidriver 相同的 D1/R2——账号共享（密码/恢复码/Passkey）、SSO、博客素材自动进网盘并生成图床直链
- **个性化**：主题系统（v1 内置 JSX 主题 + v2 模板主题，协议一次设计）+ 声明式插件池
- 沿用 minidriver 的全部平台经验：Workers + Hono + D1 + R2、GitHub Actions、安全模型

### 1.2 非目标（v1 不做）

| 不做 | 原因 |
|---|---|
| 多作者 / 评论后台 | 个人博客；评论走 giscus 位（GitHub Discussions，零后端） |
| 任意 JS 主题/插件 | Workers 禁止 eval/new Function（见 §8） |
| 静态站点生成（SSG） | SSR + CDN 缓存 + 发布按需清缓存 |
| 全文搜索 | 文章量小；v2 可接 D1 FTS |

### 1.3 决策记录（与作者对齐）

| # | 决策 | 结论 |
|---|---|---|
| 1 | 身份存储 | **方案 A：认证 schema 做成可移植模块**——独立部署自建（幂等建表 + setup 向导），联动部署共享 minidriver 的表 |
| 2 | Passkey 共享 | RP ID 可配（`AUTH_RP_ID`）；联动模式统一到根域可共享（依赖 PSL 验证，§4.5），退级路径明确 |
| 3 | 主题系统 | **v1 内置 JSX 主题 + v2 模板主题两期都做**，协议一次设计到位（§7） |
| 4 | 插件 | v1 声明式内置插件池（§8） |
| 5 | 域名 | `b.<根域>`；所有域相关信息环境变量化，换域=改变量重新部署 |
| 6 | **双部署模式** | `DEPLOY_MODE=standalone \| linked`（§3.1）；**联动模式下也尽量不动 minidriver**——存在"零改动兼容阶梯"（§3.2） |

---

## 2. 技术选型

| 层 | 选型 | 理由 |
|---|---|---|
| 运行时 | Cloudflare Workers（单 Worker：SSR 公开站 + Admin SPA + API） | 与 minidriver 同系 |
| Web 框架 | **Hono + Hono JSX**（服务端渲染） | 博客 SEO 硬需求；JSX 编译期主题零运行时开销 |
| Admin 端 | React 19 + Vite SPA（挂 `/admin/*`） | 写作编辑器重交互；组件模式复用 minidriver 经验 |
| Markdown | markdown-it（footnote/tasklist/anchor，`html: true`） | 解析式无 eval；单作者可信内容允许内嵌 HTML |
| 模板主题引擎（v2） | **liquidjs**（解析式，无 eval） | M4 首日做 Workers 兼容 spike，退级方案为受限 Mustache 子集 |
| 数据 | D1 + R2（绑定指向由部署模式决定，代码无感知） | — |
| 样式 | 内置主题 Tailwind（编译期）+ 主题 CSS 变量 | — |
| 测试 | Vitest + @cloudflare/vitest-pool-workers；smoke（复用 minidriver 伪造认证器） | — |
| 部署 | GitHub Actions（复制 minidriver 工作流） | push 即上线，迁移先行 |

---

## 3. 总体架构

```
                ┌─────────────────────────────────────────────────────────┐
                │                Cloudflare（同一账号）                     │
 浏览器/读者 ───▶│  Worker: miniblog（b.<根域>）                            │
                │   ├─ SSR 公开站：/ /post/:slug /archive /tag/* /rss.xml  │
                │   ├─ /admin/*（React SPA） /api/*（Admin API）            │
                │   ├─ /assets/:slug（standalone 素材直链）                  │
                │   └─ /themes/<id>/*（v2 主题资产，R2 直出）                │
                │        │                       │                         │
                │   ┌────▼────┐            ┌─────▼──────┐                  │
                │   │ AuthCore│            │ AssetStore │                  │
                │   └────┬────┘            └─────┬──────┘                  │
                │        │      DEPLOY_MODE       │                        │
                │   standalone：自建认证表        standalone：blog_assets+R2  │
                │   linked：共享 minidriver 表    linked：nodes 表+图床直链    │
                └────────────────┬────────────────────────────────────────┘
                                 │ （linked 模式）
                Worker: minidriver（f.<根域>）—— 认证同源 + 图床直链 /i/:slug
```

**路由策略**：`"run_worker_first": true`——所有请求先进 Worker；`/admin/*` 走 ASSETS 绑定（SPA 回退），其余 SSR。

**缓存**：公开页渲染后写 Cache API，发布/删除/设置变更按 URL 清单清除；Admin 与 API 不缓存。

### 3.1 部署模式（`DEPLOY_MODE`）

| | **standalone 独立部署** | **linked 联动部署** |
|---|---|---|
| D1 | 自己的库：AuthCore 幂等建表 + `blog_*` | minidriver 同库：认证表已存在（建表幂等跳过）+ `blog_*` |
| R2 | 自己的桶：`assets/`、`themes/` | minidriver 同桶：素材写 `nodes` 体系 + `themes/` |
| 认证 | setup 向导自建账号；`__Host-` 会话 Cookie；RP = 自己域名 | 账号即 minidriver 账号；SSO Cookie；RP 可统一根域 |
| 素材 | `LocalAssetStore` → 本域 `/assets/:slug` | `DriverAssetStore` → 图床直链 `f.<根域>/i/:slug` |
| 对 minidriver 的要求 | **零改动、零存在感** | L0：零改动；L1：两个可选环境变量（§3.2） |

**关键设计：代码只有一套**。两种模式的差异全部收敛在 ① 绑定指向（同一个还是不同的 D1/R2）② `DEPLOY_MODE` 环境变量 ③ AuthCore 建表幂等。切换部署形态 = 换绑定和变量，重新部署。

### 3.2 联动模式的"零改动兼容阶梯"（对 minidriver 尽量不动）

| 级别 | minidriver 侧动作 | 获得能力 |
|---|---|---|
| **L0 联动·零改动** | **什么都不做** | 共享账号（密码/恢复码/凭证表）；素材进网盘；图床直链。会话与 Passkey 各端独立（在 b. 登录一次，f. 仍需登录） |
| **L1 联动·增强** | 设置 `AUTH_RP_ID=<根域>` 与 `AUTH_COOKIE_DOMAIN=<根域>`（两个**向后兼容**的可选 env，未设置=现有行为） | + SSO（一处登录两站通用）+ Passkey 跨应用共享（依赖 PSL 验证，§4.5） |

> L1 的两个 env 是 minidriver 仅有的改动：`rpID()` 优先读 `AUTH_RP_ID`；会话 Cookie 支持可配名/域。均为**未设置时行为不变**的向后兼容改造，随 minidriver 任意版本发布，不部署 miniblog 就完全不用动。

---

## 4. 认证（AuthCore 可移植模块）

### 4.1 形态

- 代码：`server/lib/auth/` —— 从 minidriver 移植的会话/凭证逻辑（哈希、挑战 Cookie、锁定、会话滑动续期），**单一模块，两种模式共用**
- 表：AuthCore schema（users / webauthn_credentials / recovery_codes / auth_locks / sessions），定义在 miniblog 迁移 `1001_auth_core.sql`，**全部 `CREATE ... IF NOT EXISTS`，索引名与 minidriver 完全一致**
  - standalone：表不存在 → 创建 → 进入 `/setup` 向导自建账号（复用 minidriver 交互）
  - linked：表已存在（minidriver 所建）→ 迁移空转 → `users` 表非空，直接进登录页
- 所有认证 SQL 只出现在 AuthCore 模块内（业务代码不直接碰认证表）

### 4.2 模式相关的认证参数

| 参数 | standalone | linked (L0) | linked (L1) |
|---|---|---|---|
| Cookie | `__Host-md-session`（host-only） | 同左 | `__Secure-md-session` + `Domain=<根域>`（SSO） |
| RP ID | 自己域名（`APP_PUBLIC_URL` 主机名） | 同左 | `AUTH_RP_ID`（根域，Passkey 共享） |
| setup 向导 | 首次部署必须（建账号） | users 非空则跳过 | 同左 |

### 4.3 备用通道

密码 + TOTP + 恢复码：与 minidriver 同一批表、同一套逻辑（移植），登录页交互直接复刻。

### 4.4 已知取舍（AuthCore 副本策略）

联动模式下，认证表 schema 的"正本"在 minidriver；若未来 minidriver 变更认证表结构，miniblog 的 `1001_` 副本不会自动跟随（幂等建表只管从零创建）。缓解：认证 schema 视为**稳定契约**（字段极少变动）；minidriver 侧结构变更时在 miniblog 补一条对齐迁移即可。独立部署完全不受影响。

### 4.5 Passkey 共享前提（L1 专属）

RP ID 必须为当前域名的可注册域后缀——依赖 `qzz.io` 是否在公共后缀清单（PSL）。**M0 首日实测**：minidriver 设 `AUTH_RP_ID=<根域>` 后注册一个 passkey 即可判定。不通过 → 保持 L0（Passkey 分端注册，账号仍共享）。

---

## 5. 数据模型（D1）

迁移纪律：miniblog 迁移 `1001_` 起编；`1001_auth_core.sql`（幂等建认证表）+ `1002_blog_core.sql`（业务表）。**绝不写 minidriver 独有的表（nodes/shares/uploads）。**

```sql
-- 1001_auth_core.sql（与 minidriver 0001 中的认证表定义逐字一致，此处示意）
CREATE TABLE IF NOT EXISTS users ( ... );
CREATE TABLE IF NOT EXISTS webauthn_credentials ( ... );
CREATE TABLE IF NOT EXISTS recovery_codes ( ... );
CREATE TABLE IF NOT EXISTS auth_locks ( ... );
CREATE TABLE IF NOT EXISTS sessions ( ... );
-- 索引同名 + IF NOT EXISTS

-- 1002_blog_core.sql
CREATE TABLE blog_posts (
  id           TEXT PRIMARY KEY,            -- ULID
  slug         TEXT NOT NULL,
  title        TEXT NOT NULL,
  summary      TEXT NOT NULL DEFAULT '',
  content_md   TEXT NOT NULL,
  cover_url    TEXT,                        -- 封面（图床/素材直链）
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  pinned       INTEGER NOT NULL DEFAULT 0,
  views        INTEGER NOT NULL DEFAULT 0,
  published_at INTEGER,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_blog_posts_slug ON blog_posts(slug);
CREATE INDEX ix_blog_posts_pub ON blog_posts(status, published_at DESC);

CREATE TABLE blog_tags (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE
);
CREATE TABLE blog_post_tags (
  post_id TEXT NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  tag_id  TEXT NOT NULL REFERENCES blog_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

CREATE TABLE blog_pages (                     -- 独立页面（关于页等）
  id         TEXT PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,
  title      TEXT NOT NULL,
  content_md TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE blog_settings (                  -- KV 式站点设置
  key   TEXT PRIMARY KEY,                     -- site / theme / plugins
  value TEXT NOT NULL                         -- JSON
);

-- 仅 standalone 模式使用（linked 的素材走 minidriver nodes 体系）
CREATE TABLE IF NOT EXISTS blog_assets (
  id         TEXT PRIMARY KEY,                -- ULID
  slug       TEXT NOT NULL UNIQUE,            -- 公开直链 slug
  r2_key     TEXT NOT NULL,                   -- assets/<id>
  name       TEXT NOT NULL,
  mime       TEXT NOT NULL,
  size       INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
```

---

## 6. 素材层（AssetStore 抽象，与 Minidriver 联动之二）

```ts
interface AssetStore {
  upload(file: { name: string; mime: string; body: Blob }, folder: string): Promise<{ url: string; id: string }>
  listImages(): Promise<Asset[]>           // 素材选择器
  remove(id: string): Promise<void>
}
```

| 实现 | 模式 | 行为 |
|---|---|---|
| `DriverAssetStore` | linked | 写共享 R2（`f/<ulid>`）+ 共享 nodes 表（归档「博客素材/YYYY-MM/」）+ `generatePublicSlug()` → 直链 `https://f.<根域>/i/<slug>.png`（minidriver 图床端点服务） |
| `LocalAssetStore` | standalone | 写自己 R2（`assets/<ulid>`）+ `blog_assets` 表 → 直链 `https://b.<根域>/assets/<slug>`（miniblog 自带直链端点，public 缓存 + CORS，语义同图床） |

```
Admin 编辑器上传 → AssetStore.upload → Markdown 自动插入直链
素材选择器     → AssetStore.listImages → 点击插入直链
```

- 直链生命周期：重命名/移动不断链；进回收站（linked）仍可访问；彻底删除才失效
- 公开站只引用直链，**不暴露任何私有路径与会话**

---

## 7. 项目结构

```
miniblog/
├── DESIGN.md
├── wrangler.jsonc             # run_worker_first: true；绑定与 DEPLOY_MODE 按部署形态配置
├── vite.config.ts             # admin SPA 构建
├── migrations/
│   ├── 1001_auth_core.sql     # 认证表幂等副本（IF NOT EXISTS，索引同名）
│   └── 1002_blog_core.sql     # blog_* 表 + blog_assets
├── server/                    # Worker SSR（Hono + JSX）
│   ├── index.tsx              # 路由装配：公开站 / admin / api / rss / assets
│   ├── routes/
│   │   ├── public.tsx         # 首页/文章/归档/标签/页面/RSS/sitemap
│   │   ├── admin-api.ts       # 博客 CRUD + 上传 + 设置 + 主题
│   │   ├── assets.ts          # standalone：/assets/:slug 直链
│   │   └── theme-assets.ts    # v2：/themes/<id>/* R2 直出
│   ├── render/
│   │   ├── markdown.ts        # markdown-it 装配（插件/高亮/TOC 提取）
│   │   ├── themes/            # 内置 JSX 主题（registry + magazine/classic/gallery）
│   │   └── liquid.ts          # v2：liquidjs 渲染器（R2 模板加载器）
│   ├── plugins/               # 声明式插件注册表
│   └── lib/
│       ├── auth/              # AuthCore（会话/凭证/锁定/setup，双模式共用）
│       ├── assets/            # AssetStore 接口 + Driver/Local 两实现
│       ├── env.ts             # DEPLOY_MODE 与全部环境变量
│       └── cache.ts           # 公开页缓存与按 URL 清除
├── admin/                     # React SPA（写作后台）
├── scripts/                   # smoke（复用 minidriver 伪造认证器）
└── .github/workflows/deploy.yml
```

---

## 8. 主题系统（v1 内置 + v2 模板，协议一次设计）

### 8.1 三层模型

```
主题 = 布局组件/模板（结构） + Design Tokens（观感） + 资产（CSS/JS）
blog_settings.theme = {
  "mode": "builtin" | "custom",
  "id": "magazine" | "<themeId>",
  "tokens": { "accent": "#5b5bd6", "font": "serif", "radius": 12, "dark": "auto" }
}
```

### 8.2 v1 内置 JSX 主题

- 主题包 = `theme.json`（meta + token 默认值）+ JSX 布局组件（插槽接口固定：`Layout / PostCard / PostView / ArchiveView`）
- Design Tokens 全部落为 CSS 变量（`--mb-accent` 等）；换观感不必换主题，换主题不必改内容
- 首发：`magazine`（极简杂志）、`classic`（经典两栏）、`gallery`（相册式）；亮暗跟随系统

### 8.3 v2 模板主题

- 主题包：`zip` = `theme.json` + `templates/*.liquid`（index/post/archive/tag/page）+ `assets/*`
- Admin 上传 → 校验（结构、≤5MB）→ R2 `themes/<themeId>/` → 激活写入设置
- 渲染：liquidjs + R2 模板加载器；**上下文白名单**（site/posts/post/pagination/tokens），模板执行资源限额
- 资产服务：`GET /themes/<id>/assets/*` R2 直出 + `public, max-age=86400`
- M4 首日 spike：liquidjs 在 Workers 的兼容性与资源实测（不通过退回受限 Mustache 子集，协议不变）

### 8.4 插槽契约（内置与 liquid 共同遵守）

```
site{ name, description, footer, nav[] }   post{ title, slug, date, tags[], html, toc, readingTime, cover }
list{ posts[], page, totalPages }          tokens{ ...CSS 变量表 }
```

---

## 9. 插件系统（声明式，v1）

- 插件 = **内置实现 + JSON 配置**；`blog_settings.plugins` 有序数组（顺序即渲染顺序）
- 挂载点：`head` / `post_meta` / `post_html` / `footer`；Admin 插件页启停与配置，实时生效（写设置 + 清缓存）

| 插件 | 挂载点 | 配置 |
|---|---|---|
| reading-time | post_meta | 字/分钟 |
| toc | post_html | 位置、层级 |
| highlight | head + post_html | 主题、语言集 |
| lightbox | head + post_html | — |
| katex | head + post_html | CDN 源 |
| giscus | post_html | repo、分类 |
| footer-links | footer | 链接数组 |

明确不做：任意 JS 插件（平台禁止 eval）；服务端外部钩子（v2 评估 webhook）。

---

## 10. API 设计

约定与 minidriver 一致：JSON、错误体 `{error:{code}}` 前端 i18n 渲染、CSRF 三重防线。

### Admin API（`/api/*`，会话鉴权）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET/POST | `/api/posts` | 列表 / 新建 |
| GET/PUT/DELETE | `/api/posts/:id` | 详情 / 保存（清缓存）/ 删除 |
| POST | `/api/posts/:id/publish` `· /unpublish` | 发布 / 回草稿 |
| GET/POST/DELETE | `/api/tags` `/api/tags/:id` | 标签管理 |
| GET/PUT | `/api/pages/:slug` `/api/settings` | 页面 / 站点·主题·插件设置 |
| POST | `/api/upload` | 上传素材（AssetStore，返回直链） |
| GET | `/api/assets?mime=image/*` | 素材选择器 |
| POST/DELETE | `/api/themes` `/api/themes/:id` | v2 主题包上传/删除 |
| GET | `/api/auth/*` 系列 | AuthCore（setup/登录/凭证/会话管理） |

### 公开路由（SSR）

`/` · `/post/:slug` · `/archive` · `/tag/:slug` · `/page/:slug` · `/rss.xml` · `/sitemap.xml` · `/themes/<id>/*` · standalone: `/assets/:slug`

---

## 11. 部署与配置（全环境变量）

### 场景一：独立部署

| 变量/绑定 | 值 |
|---|---|
| `DEPLOY_MODE` | `standalone` |
| `APP_PUBLIC_URL` | `https://b.<根域>` |
| `SETUP_TOKEN` / `SESSION_ENC_KEY` | 本应用自设 |
| D1 / R2 | 各自新建（minidriver 不受影响） |
| RP / Cookie | 自动取 `APP_PUBLIC_URL` 主机名 + `__Host-` Cookie |

### 场景二：联动部署

| 变量/绑定 | 值 |
|---|---|
| `DEPLOY_MODE` | `linked` |
| `APP_PUBLIC_URL` | `https://b.<根域>` |
| `AUTH_RP_ID` / `AUTH_COOKIE_DOMAIN` | `<根域>`（L1；不设 = L0） |
| `DRIVER_PUBLIC_URL` | `https://f.<根域>`（图床直链域名） |
| `SETUP_TOKEN` / `SESSION_ENC_KEY` | 与 minidriver **同值** |
| D1 / R2 | **与 minidriver 相同的 database_id / bucket** |

- GitHub Actions：复制 minidriver 工作流（admin 构建 → 冒烟 → 迁移 → 部署）
- 换域：改 4 个环境变量 + 域名绑定，重新部署

---

## 12. 路线图

| 里程碑 | 内容 | 验收 | 预估 |
|---|---|---|---|
| **M0 骨架 + AuthCore** | 脚手架；AuthCore 移植（双模式）；setup/登录/SSO（linked L0/L1）；SSR 骨架 + admin 壳；PSL 实测 | standalone：全新库走完 setup；linked：f. 登录后 b. 免登录（L1） | 2 天 |
| **M1 博客基本功能** | 文章 CRUD/发布流、标签、页面、RSS/sitemap、markdown-it 管线、缓存 | 写一篇→公网可读→RSS 可订阅；SEO meta 完整 | 2–3 天 |
| **M2 素材联动** | AssetStore 双实现、上传直链自动插入、素材选择器 | linked：图片进网盘+图床直链；standalone：本域直链可用 | 1–1.5 天 |
| **M3 主题 v1 + 插件 v1** | 内置主题×3 + token 配置；插件池 + 管理页 | 三主题一键切换；插件启停实时生效 | 2–3 天 |
| **M4 模板主题 v2** | liquidjs spike、zip 主题包上传/校验/激活、资产服务 | 自制主题包从上传到生效全流程 | 2–3 天 |

依赖顺序：M0 → M1 → M2 →（M3、M4 可并行）。

---

## 13. 风险与备选

| 风险 | 影响 | 预案 |
|---|---|---|
| `qzz.io` 不在 PSL，父域 RP ID 不可用 | Passkey 不跨应用共享（仅 L1 受影响） | 保持 L0：账号共享，Passkey 分端注册 |
| AuthCore 副本与 minidriver 正本 schema 漂移 | 联动模式字段不一致 | 认证 schema 视为稳定契约；minidriver 变更时 miniblog 补对齐迁移 |
| 共库迁移纪律被破坏 | 迁移冲突 / 误改他表 | 编号分段（1001_）+ 认证表 SQL 只存在于 AuthCore 迁移 + 审查 |
| liquidjs 在 Workers 不兼容 | v2 模板主题受阻 | M4 首日 spike；退回 Mustache 子集 |
| 自写 HTML 的 XSS | 单作者可信内容，风险低 | 未来多作者时引入 sanitize 管线 |
| linked 模式下误删被博客引用的素材 | 外链断链 | 彻底删除前列出「该文件有公开直链/分享」警告（v2） |
| 国内访问质量 | 读者体验 | 平台限制；v2 评估双域名策略 |

---

## 14. 成本

- standalone：独享免费额度（Workers 免费层 + D1 5GB + R2 10GB），$0 起步
- linked：与 minidriver 共享资源，增量≈0（博客流量走 CDN 缓存）；仍建议 Workers Paid $5/月（两应用共享）
