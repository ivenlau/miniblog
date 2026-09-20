# Miniblog

跑在 Cloudflare Workers 上的轻量级个人博客，与 [Minidriver](../minidriver) 同系同源：支持主题与插件个性化。与网盘的**联动由部署配置决定**——D1/R2 指向同一资源即共享账号与素材，各自指向则完全独立，无需模式开关。

> 架构与决策详见 [DESIGN.md](./DESIGN.md)。

## 亮点

- **SSR 博客**：首页 / 文章 / 归档 / 标签（`/tags` 索引）/ 独立页面，RSS + sitemap，页头导航（可自定义 `site.nav`）与移动端自适应，SEO 友好
- **与 Minidriver 联动（配置收敛）**：同一 D1 → 共账号（Passkey/密码/恢复码）与素材元数据；同一 R2 → 共文件存储；博客图片统一存网盘 nodes 体系，**直链由博客本域提供**（/assets/<slug>），不依赖网盘图床端点
- **主题**：v1 三套内置主题（极简杂志/经典博客/相册封面）+ Design Tokens 可视化配置；v2 Liquid 模板主题包（zip 上传即用）
- **插件**：声明式内置插件池（阅读时长/目录/代码高亮/灯箱/KaTeX/giscus/页脚链接），开关与配置实时生效
- **Admin**：与 minidriver 同一设计系统（亮/暗/跟随系统三态主题、中英双语、侧栏 + 移动底部导航），安全设置齐全（Passkey/设备会话/密码/TOTP/恢复码），写作编辑器为「Markdown 源 + 工具栏 + 服务端同管线实时预览 + 图片粘贴/拖拽上传 + 自动保存」

---

## 本地开发

```bash
npm install
cp .dev.vars.example .dev.vars       # 替换 SESSION_ENC_KEY
npm run db:migrate:local
npm run dev                          # wrangler dev(8787) + vite dev(5174，热更)
```

- 公开站：http://localhost:8787/
- Admin（生产形态）：http://localhost:8787/admin/ → 首次进入 `/admin/setup`（口令见 `.dev.vars`）
- Admin（热更形态）：http://localhost:5174/admin/ ——vite 代理已把 Origin 改写为 API 同源；**Passkey 流程绑定真实页面 origin，注册/登录需直接走 :8787**

> 注意重置本地数据时先停掉 `wrangler dev` 再删 `.wrangler/state`（D1 文件句柄问题）。

冒烟测试（伪造 WebAuthn 认证器，81 项断言，需全新库）：

```bash
npm run smoke
```

---

### 部署（GitHub Actions 自动）

1. Cloudflare 建 D1 / R2 / API Token（权限含 D1 Edit + Workers Scripts Edit + R2 Edit）
2. GitHub Secrets：`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`、`D1_DATABASE_ID`、`R2_BUCKET_NAME`
3. push main 即可——代码不含任何域名/ID，运行时自动适配访问域名（单域名零配置）
4. 部署后在 Cloudflare（Worker → Settings → Variables and Secrets，设置一次永久生效）：
   - `SESSION_ENC_KEY`：32 字节 base64（生成命令见 `.dev.vars.example`）
   - `SETUP_TOKEN`：自拟初始化口令
   - `APP_PUBLIC_URL`：规范域名（如 `https://blog.example.com`）——**绑自定义域后必填**（RP/CSRF/直链的权威来源）；单域名可不填（自动取访问域）
   - `BASE_DOMAIN_AUTH`：`true` 时开启跨子域共享认证（SSO + Passkey 互通，见下表）
5. 首访 `/admin/setup` 初始化

### 与 Minidriver 联动（可选，配置收敛）

无需任何模式开关——**两个仓库的部署配置指到同一资源即联动**：

| 配置（两侧对称） | 相同时的效果 |
|---|---|
| GitHub Secrets `D1_DATABASE_ID` | 共账号/会话/凭证 + 素材元数据（nodes 表，双方向迁移幂等，任意顺序部署） |
| GitHub Secrets `R2_BUCKET_NAME` | 共文件存储 |
| CF Secrets `SESSION_ENC_KEY` / `SETUP_TOKEN` | 需同值（共享 TOTP 密文与初始化语义） |
| 变量 `BASE_DOMAIN_AUTH` = `true`（两侧 dashboard 设置） | 再加 SSO：一处登录两站通用，Passkey 跨应用。根域从 APP_PUBLIC_URL 自动推导（支持 com.cn/co.uk 等常见多级后缀；PSL 托管域不适用） |

不配以上重合 → 两应用完全独立。联动时素材在网盘「博客素材/」目录可见可管理；直链始终走博客本域，网盘侧彻底删除文件后链接自然失效。

### 值流向

| 值 | 从哪来 | 设置到 |
|---|---|---|
| D1 database_id | dashboard → D1 详情页 | GitHub Secret `D1_DATABASE_ID` / wrangler.jsonc |
| Account ID / API Token | dashboard / My Profile → API Tokens | GitHub Secrets |
| SESSION_ENC_KEY / SETUP_TOKEN / APP_PUBLIC_URL / AUTH_* | 本机生成 / 自拟 / 你的域名 | Cloudflare Worker Secrets（变量和 Secrets 页） |

---

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 本地开发（wrangler dev + vite 热更） |
| `npm run build` | 构建 admin SPA 到 `public/admin` |
| `npm run typecheck` | server + admin 双端类型检查 |
| `npm run db:migrate:local` / `:remote` | 应用迁移（1001_ 起编；1001/1003 为与 minidriver 的共享契约表） |
| `npm run smoke` | API 全链路冒烟（81 项断言，需全新库） |
| `node scripts/shoot.mjs` | Playwright 截图到 /tmp/mb-shots（需 dev 运行中） |
| `D1_DATABASE_ID=<id> R2_BUCKET_NAME=<桶> npm run deploy` | 手动部署 |

## 安全与边界

- 与 minidriver 相同的会话/CSRF/防爆破安全模型；共享表（认证 + nodes）双方向迁移幂等，任意顺序部署
- Admin HTML 响应附加安全头（CSP `script-src 'self'` 等，`server/index.tsx`）；公开 SSR 页**不**加 CSP——插件需注入 CDN script
- 插件与模板主题均为**声明式/解析式**实现（Workers 禁止 eval，第三方代码不可执行）；liquid 模板源码不对外提供

## Admin 设计系统（与 minidriver 对齐）

- 主题三态 `mb.theme`（light/dark/system）+ 语言 `mb.lang`（zh-CN/en），localStorage 持久化，`admin/public/theme.js` 首帧防闪白
- 组件库 `admin/src/components/ui.tsx`（Button/Modal/Dropdown/EmptyState…），CSS 变量 `--mb-*` + Tailwind `@theme inline`
- 路由为 data router（`createBrowserRouter`，basename `/admin`）——编辑器脏守卫 `useBlocker` 依赖它
- **安全设置共享语义**：users/sessions/webauthn_credentials/recovery_codes 随 D1 收敛共享，密码/TOTP/恢复码/会话吊销**即刻对两个应用生效**（设置 → 安全页顶部在开启 `BASE_DOMAIN_AUTH` 后显示联动提示条）；Passkey 跨应用需两侧都开启且同根域（依赖 PSL）

## 安全与边界

- 与 minidriver 相同的会话/CSRF/防爆破安全模型；共享表（认证 + nodes）双方向迁移幂等，任意顺序部署
