# Miniblog

跑在 Cloudflare Workers 上的轻量级个人博客，与 [Minidriver](../minidriver) 同系同源：共享账号体系与图床素材，支持主题与插件个性化，**独立部署**与**联动部署**双模式。

> 架构与决策详见 [DESIGN.md](./DESIGN.md)。

## 亮点

- **SSR 博客**：首页 / 文章 / 归档 / 标签（`/tags` 索引）/ 独立页面，RSS + sitemap，页头导航（可自定义 `site.nav`）与移动端自适应，SEO 友好
- **与 Minidriver 联动**：同一账号（Passkey/密码/恢复码），博客图片自动进网盘并生成图床直链；**联动模式下安全设置双站互通**（见下）
- **主题**：v1 三套内置主题（极简杂志/经典博客/相册封面）+ Design Tokens 可视化配置；v2 Liquid 模板主题包（zip 上传即用）
- **插件**：声明式内置插件池（阅读时长/目录/代码高亮/灯箱/KaTeX/giscus/页脚链接），开关与配置实时生效
- **Admin**：与 minidriver 同一设计系统（亮/暗/跟随系统三态主题、中英双语、侧栏 + 移动底部导航），安全设置齐全（Passkey/设备会话/密码/TOTP/恢复码），写作编辑器为「Markdown 源 + 工具栏 + 服务端同管线实时预览 + 图片粘贴/拖拽上传 + 自动保存」

---

## 本地开发

```bash
npm install
cp .dev.vars.example .dev.vars       # 默认 standalone 模式；替换 SESSION_ENC_KEY
npm run db:migrate:local
npm run dev                          # wrangler dev(8787) + vite dev(5174，热更)
```

- 公开站：http://localhost:8787/
- Admin（生产形态）：http://localhost:8787/admin/ → 首次进入 `/admin/setup`（口令见 `.dev.vars`）
- Admin（热更形态）：http://localhost:5174/admin/ ——vite 代理已把 Origin 改写为 API 同源；**Passkey 流程绑定真实页面 origin，注册/登录需直接走 :8787**

> 注意重置本地数据时先停掉 `wrangler dev` 再删 `.wrangler/state`（D1 文件句柄问题）。

冒烟测试（伪造 WebAuthn 认证器，73 项断言，需全新库）：

```bash
npm run smoke
```

---

## 部署

与 minidriver 相同：GitHub Actions（复制其 deploy.yml，改 `database_id` 与项目名）或 `wrangler deploy`。

### standalone（独立部署）

1. `wrangler d1 create miniblog` + `wrangler r2 bucket create miniblog`
2. 把 D1 database_id 填入 `wrangler.jsonc`
3. Secrets：`SESSION_ENC_KEY`、`SETUP_TOKEN`（生成命令见 `.dev.vars.example`）
4. 绑定 `b.<根域>` 自定义域 → 首访 `/admin/setup` 初始化

### linked（联动部署，与 minidriver 共库共桶）

1. `wrangler.jsonc` 的 D1/R2 改为 minidriver 同一 database_id / bucket_name（见文件内注释）
2. `DEPLOY_MODE=linked`、`DRIVER_PUBLIC_URL=https://f.<根域>`、`SESSION_ENC_KEY`/`SETUP_TOKEN` 与 minidriver **同值**
3. L1 增强（SSO + Passkey 共享，可选）：minidriver 侧设置 `AUTH_RP_ID=<根域>` 与 `AUTH_COOKIE_DOMAIN=<根域>`，两边一致
4. 前提：认证表结构由 minidriver 拥有（miniblog 迁移幂等，先部署 minidriver 再部署 miniblog）

### 值流向

| 值 | 从哪来 | 设置到 |
|---|---|---|
| D1 database_id | dashboard → D1 详情页 | GitHub Secret `D1_DATABASE_ID` / wrangler.jsonc |
| Account ID / API Token | dashboard / My Profile → API Tokens | GitHub Secrets |
| SESSION_ENC_KEY / SETUP_TOKEN / APP_PUBLIC_URL | 本机生成 / 自拟 / 你的域名 | Cloudflare Worker Secrets |

---

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 本地开发（wrangler dev + vite 热更） |
| `npm run build` | 构建 admin SPA 到 `public/admin` |
| `npm run typecheck` | server + admin 双端类型检查 |
| `npm run db:migrate:local` / `:remote` | 应用迁移（1001_ 起编，只动 blog_* 表） |
| `npm run smoke` | API 全链路冒烟（73 项断言，需全新库） |
| `node scripts/shoot.mjs` | Playwright 截图到 /tmp/mb-shots（需 dev 运行中） |
| `D1_DATABASE_ID=<id> npm run deploy` | 手动部署 |

## 安全与边界

- 与 minidriver 相同的会话/CSRF/防爆破安全模型；认证表结构以 minidriver 为正本（standalone 使用幂等副本）
- Admin HTML 响应附加安全头（CSP `script-src 'self'` 等，`server/index.tsx`）；公开 SSR 页**不**加 CSP——插件需注入 CDN script
- 插件与模板主题均为**声明式/解析式**实现（Workers 禁止 eval，第三方代码不可执行）；liquid 模板源码不对外提供

## Admin 设计系统（与 minidriver 对齐）

- 主题三态 `mb.theme`（light/dark/system）+ 语言 `mb.lang`（zh-CN/en），localStorage 持久化，`admin/public/theme.js` 首帧防闪白
- 组件库 `admin/src/components/ui.tsx`（Button/Modal/Dropdown/EmptyState…），CSS 变量 `--mb-*` + Tailwind `@theme inline`
- 路由为 data router（`createBrowserRouter`，basename `/admin`）——编辑器脏守卫 `useBlocker` 依赖它
- **安全设置共享语义**：`DEPLOY_MODE=linked` 时 users/sessions/webauthn_credentials/recovery_codes 与 minidriver 同库，密码/TOTP/恢复码/会话吊销**即刻对两个应用生效**（设置 → 账户与安全页顶部有联动提示条）；Passkey 另受 RP ID 约束（L1 统一根域后才跨站可用了，见 DESIGN §4.5）

## 安全与边界

- 与 minidriver 相同的会话/CSRF/防爆破安全模型；认证表结构以 minidriver 为正本（standalone 使用幂等副本）
- 插件与模板主题均为**声明式/解析式**实现（Workers 禁止 eval，第三方代码不可执行）；liquid 模板源码不对外提供
