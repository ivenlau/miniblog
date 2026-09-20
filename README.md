# Miniblog

跑在 Cloudflare Workers 上的单用户个人博客，与 [Minidriver](../minidriver)（个人网盘）同系同源：SSR 公开站 + 可安装的写作后台（PWA）。与网盘的联动由部署配置收敛决定——指向同一资源即联动，无需模式开关。

**亮点**

- **SSR 公开站**：文章 / 归档 / 标签索引 / 独立页面 + RSS / sitemap，页头导航可自定义，移动端自适应，正文链接与封面版式精修
- **写作后台**：Markdown 工具栏 + 服务端同管线实时预览 + 图片粘贴 / 拖拽 / 素材库光标插入 + 自动保存 + 离线可用的 PWA
- **与 Minidriver 联动（可选）**：共账号共素材——博客图片自动归档网盘「博客素材/」目录，直链由博客本域提供，SSO + Passkey 一次注册两端通用
- **主题与插件**：三套内置主题 + Design Tokens 可视化定制（强调色 / 圆角 / 版心 / 字号 / 字体 + 实时预览）；声明式插件池（代码高亮 / KaTeX / giscus / 目录 / 灯箱 / 页脚链接）
- **中英双语 · 亮暗主题 · 桌面 / 移动自适应 · 安全设置齐全**（Passkey / TOTP / 恢复码 / 设备管理）

技术栈：Cloudflare Workers（Hono）+ R2 + D1 + React 19，架构细节见 [DESIGN.md](./DESIGN.md)。

---

## 本地开发

```bash
npm install
cp .dev.vars.example .dev.vars        # 把 SESSION_ENC_KEY 换成真实随机值（生成命令见文件内注释）
npm run db:migrate:local
npm run dev                           # wrangler dev(8787, API) + vite dev(5174, 页面热更)
```

打开 http://localhost:8787/admin/ → `/admin/setup` → 输入 `.dev.vars` 里的 `SETUP_TOKEN`（默认 `dev-setup-token`）→ 注册 Passkey → 保存恢复码。

> - 无浏览器时可跑 API 冒烟测试（内置伪造 WebAuthn 认证器，81 项断言）：`npm run dev:api` + `npm run smoke`（需全新库）。
> - Passkey 注册 / 登录绑定真实页面 origin，热更端口 5174 只适合看普通界面，认证请走 8787。

---

## 部署（GitHub Actions → Cloudflare）

流程：**先配 GitHub → 首次运行 Action（自动在 Cloudflare 创建 Worker）→ 回 dashboard 配置 Worker Secrets → 再次运行 Action → 初始化**。

### 值流向总表

| # | 值 | 从哪里取 | 设置到哪里 |
|---|---|---|---|
| 1 | R2 桶名 | 创建时自拟，须与 `wrangler.jsonc` 的 `bucket_name` 一致（默认 `miniblog`）；可再设 GitHub Secret `R2_BUCKET_NAME` 覆盖 | Cloudflare R2 |
| 2 | D1 Database ID | 创建数据库后的详情页（UUID） | GitHub Secret `D1_DATABASE_ID` |
| 3 | Account ID | dashboard 右侧边栏 / Workers & Pages 概览页 | GitHub Secret `CLOUDFLARE_ACCOUNT_ID` |
| 4 | API Token | My Profile → API Tokens（见第 1 步） | GitHub Secret `CLOUDFLARE_API_TOKEN` |
| 5 | SESSION_ENC_KEY | 本机生成（见第 4 步命令） | Cloudflare Worker Secret |
| 6 | SETUP_TOKEN | 自拟强随机字符串 | Cloudflare Worker Secret |
| 7 | APP_PUBLIC_URL | 你的正式域名（可选，见第 4 步） | Cloudflare Worker Secret |
| 8 | BASE_DOMAIN_AUTH | `true`（可选，开启跨子域 SSO，见联动章节） | Cloudflare Worker 变量 |

### 第 1 步：Cloudflare 创建资源与令牌

1. **R2 桶**：dashboard → R2 Object Storage → Create bucket → 命名 `miniblog`（首次启用 R2 需绑卡，免费额度内不扣费）
2. **D1 数据库**：Storage & Databases → D1 SQL Database → Create → 命名 `miniblog` → **复制 Database ID**
3. **API Token**：右上角头像 → My Profile → API Tokens → Create Token → 模板 **Edit Cloudflare Workers** → 权限页追加 `Account · D1 · Edit` 与 `Account · Workers R2 Storage Bucket Item Edit` → Create → **复制 token（只显示一次）**
4. **Account ID**：dashboard 右侧边栏，复制

### 第 2 步：GitHub 配置 Secrets

仓库 → Settings → Secrets and variables → Actions → New repository secret，逐条添加（Name 一字不差）：

| Name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | 第 1 步第 3 项 |
| `CLOUDFLARE_ACCOUNT_ID` | 第 1 步第 4 项 |
| `D1_DATABASE_ID` | 第 1 步第 2 项 |
| `R2_BUCKET_NAME`（可选） | 桶名覆盖；默认用 `wrangler.jsonc` 的 `miniblog`。与 Minidriver 联动时两侧配同值（见联动章节） |

### 第 3 步：首次运行 Action（自动创建 Worker）

push 到 `main`，或在仓库 **Actions → Deploy → Run workflow** 手动触发。

流水线全绿后，Workers & Pages 列表里才会出现 `miniblog` —— **Worker 到这一步才存在**，应用已上线但认证功能不可用（Secrets 还没配）。

### 第 4 步：回 Cloudflare 配置 Worker Secrets

进入 Worker → Settings → Variables and Secrets → Add：

| 类型 | Name | Value |
|---|---|---|
| Secret | `SESSION_ENC_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` 的输出；设置后不要再换 |
| Secret | `SETUP_TOKEN` | 自拟，稍后初始化时输入 |
| Secret（可选） | `APP_PUBLIC_URL` | 正式域名如 `https://blog.example.com`（Passkey RP / CSRF / 素材直链的权威来源；只用 workers.dev 可不设，自动取访问域名） |
| 变量 Text（可选） | `BASE_DOMAIN_AUTH` | `true`（与 Minidriver 一起开启 = 跨子域 SSO + Passkey 互通，见联动章节） |

> 保存 Secret 会自动生成一次新部署；为走完整流水线，建议再手动触发一次 Action。

### 第 5 步：重新触发 Action 并初始化

Actions → Deploy → Run workflow 再跑一次，全绿后：

1. 访问 `https://你的域名/admin/setup`，输入 `SETUP_TOKEN`
2. 注册第一个 Passkey → **立即保存恢复码**（只显示一次）
3. 验证：登录一次成功 · 写一篇文章并发布 · 公开站能看到

### 备选：dashboard 关联 Git（Workers Builds）

Workers & Pages → Create → Workers → Import an existing repository（注意是 Workers，不是 Pages）。
先在 Worker 的 Settings → **Build variables** 定义 `D1_DATABASE_ID` 与 `R2_BUCKET_NAME`，然后：

| 设置项 | 值 |
|---|---|
| Build command | `node scripts/resolve-config.mjs && npm run build && npx wrangler d1 migrations apply miniblog --remote` |
| Deploy command | `npx wrangler deploy` |

### 备选：本机手动部署

```bash
npx wrangler login
D1_DATABASE_ID=<你的DatabaseID> R2_BUCKET_NAME=<你的桶名> npm run deploy
```

### 绑定自定义域名

Worker → Settings → Domains & Routes → Add → Custom domain → 填子域名 → 等 Active。
把 `APP_PUBLIC_URL` Secret 更新为该域名（保存即自动重新部署）。
**Passkey 与域名绑定**：换域名后需在新域名下用密码 / 恢复码登录一次，再重新注册 Passkey。

### 部署失败排查

| 现象 | 原因 |
|---|---|
| 迁移步骤报 `authentication error` | API Token 缺 `D1 Edit` 权限，回第 1 步补勾 |
| 部署步骤报找不到 D1 / binding 错误 | `D1_DATABASE_ID` 缺失或复制带了空格 |
| 部署步骤报 R2 权限 / 不存在 | Token 缺 R2 权限，或桶名与 `R2_BUCKET_NAME` / `wrangler.jsonc` 不一致 |
| 冒烟测试失败 | 打开该步骤日志看具体断言，多为代码回归 |
| 线上 401 / 认证异常但部署成功 | 第 4 步的 `SESSION_ENC_KEY` / `SETUP_TOKEN` 未配置齐全 |

---

## 与 Minidriver 联动（可选）

无模式开关：**两个仓库的部署配置指到同一资源，联动即自然产生**；各自指向则完全独立、互不影响。

| 配置（两个仓库对称设置） | 相同时的效果 |
|---|---|
| GitHub Secret `D1_DATABASE_ID` | 共账号 / 会话 / 凭证 / 恢复码 + 素材元数据（nodes 表） |
| GitHub Secret `R2_BUCKET_NAME` | 共文件存储 |
| Worker Secret `SESSION_ENC_KEY` / `SETUP_TOKEN` | 需同值（共享 TOTP 密文与初始化语义） |
| Worker 变量 `BASE_DOMAIN_AUTH` = `true` | SSO：一处登录两站通用；Passkey 跨应用。共享域 = 部署域名去掉第一段（`drive.demo.qzz.io` ↔ `blog.demo.qzz.io` → `demo.qzz.io`；`blog.example.com` → `example.com`），直接部署在根域上时取根域自身 |

**联动后的行为**：

- 任一侧登录 / 注册的账号与 Passkey 两边通用；安全设置（密码 / TOTP / 会话吊销）即时双向生效——两侧「安全」设置页会显示「联动」标识
- Miniblog 的图片素材存入网盘「博客素材/年-月/」目录，在 Minidriver 的存储设置页与文件列表中可直接管理；直链始终由博客本域提供，网盘侧彻底删除文件后链接自然失效
- **顺序无关**：两侧迁移均已幂等化，谁先初始化同一 D1 都安全（后部署方的迁移对已有表自动跳过）

## 生产建议

| 项 | 说明 |
|---|---|
| 自定义域名 | iOS Safari 对 `*.workers.dev` 的 WebAuthn 体验欠佳，建议自有域名 |
| 备份 | R2 无原生版本化：定期 `rclone sync` 到本地 / 异地；`wrangler d1 export` 导出文章元数据 |
| PWA | 写作后台可安装到主屏（`/admin/`），静态资源离线缓存；换图标后运行 `node scripts/gen-icons.mjs` 重新生成 |

## 成本参考

博客流量以读为主且公开页全走 CDN 缓存，个人写作频率下 **$0**（免费额度内）即可长期运行；与 Minidriver 共享资源时增量近似为零。

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 本地开发（API 8787 + 页面热更 5174） |
| `npm run build` | 构建写作后台到 `public/admin` |
| `npm run typecheck` | Worker + 前端双端类型检查 |
| `npm run db:migrate:local` / `:remote` | 应用 D1 迁移 |
| `npm run smoke` | API 全链路冒烟测试（81 项断言，需全新库） |
| `node scripts/gen-icons.mjs` | 从 favicon.svg 重新生成 PWA PNG 图标 |
| `node scripts/shoot.mjs` | Playwright 页面截图走查（需 dev 运行中） |
| `D1_DATABASE_ID=<id> R2_BUCKET_NAME=<桶> npm run deploy` | 本机手动部署（需先 wrangler login） |

## 项目结构

```
server/        Worker（Hono：公开站 SSR / Admin API / 认证 / 素材直链 + 主题渲染 + 插件池）
admin/         React SPA 写作后台（编辑器 / 设置 / i18n / 亮暗主题 / PWA）
migrations/    D1 SQL 迁移（1001 认证 + 1002 博客 + 1003 nodes 共享契约，全部幂等）
scripts/       smoke.mjs（伪造 WebAuthn 认证器的冒烟测试）
               audit-d1.mjs（D1 语句执行审计，CI 防线）
               resolve-config.mjs（部署时注入 D1 database_id / R2 桶名）
               gen-icons.mjs（favicon.svg → PWA PNG 图标）
               shoot.mjs（页面截图走查）
```

## 安全模型速览

- 会话：`__Host-` Cookie（HttpOnly + Secure + SameSite=Lax），库内只存 SHA-256，滑动 30 天 / 绝对 90 天；开启 `BASE_DOMAIN_AUTH` 后升级为根域共享 Cookie
- CSRF：SameSite + Origin 校验 + 自定义头三重防线
- 登录爆破：5 次失败锁 15 分钟；TOTP / 恢复码同策略
- 响应头：`/admin/*` 的 HTML 附加 CSP（`script-src 'self'`）等；公开 SSR 页不加 CSP（插件需注入 CDN script）
- 共享契约表（认证 + nodes）双方向迁移幂等，与 Minidriver 任意顺序部署安全

## Admin 设计系统

- 主题三态 `mb.theme`（light / dark / system）+ 语言 `mb.lang`（zh-CN / en），localStorage 持久化，`theme.js` 首帧防闪白
- 组件库 `admin/src/components/ui.tsx`（Button / Modal / Dropdown / EmptyState…），CSS 变量 `--mb-*` + Tailwind `@theme inline`
- 路由为 data router（`createBrowserRouter`，basename `/admin`）——编辑器脏守卫 `useBlocker` 依赖它
