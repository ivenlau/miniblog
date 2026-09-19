# Miniblog

跑在 Cloudflare Workers 上的轻量级个人博客，与 [Minidriver](../minidriver) 同系同源：共享账号体系与图床素材，支持主题与插件个性化，**独立部署**与**联动部署**双模式。

> 架构与决策详见 [DESIGN.md](./DESIGN.md)。

## 亮点

- **SSR 博客**：首页 / 文章 / 归档 / 标签 / 独立页面，RSS + sitemap，SEO 友好
- **与 Minidriver 联动**：同一账号（Passkey/密码/恢复码），博客图片自动进网盘并生成图床直链
- **主题**：v1 三套内置主题（极简杂志/经典博客/相册封面）+ Design Tokens 可视化配置；v2 Liquid 模板主题包（zip 上传即用）
- **插件**：声明式内置插件池（阅读时长/目录/代码高亮/灯箱/KaTeX/giscus/页脚链接），开关与配置实时生效
- **Admin**：React SPA（写作编辑器含素材选择器与同管线预览），同源会话保护

---

## 本地开发

```bash
npm install
cp .dev.vars.example .dev.vars       # 默认 standalone 模式；替换 SESSION_ENC_KEY
npm run db:migrate:local
npm run dev                          # wrangler dev(8787) + admin 构建
```

- 公开站：http://localhost:8787/
- Admin：http://localhost:8787/admin/ → 首次进入 `/admin/setup`（口令见 `.dev.vars`）

冒烟测试（伪造 WebAuthn 认证器，70 项断言）：

```bash
npm run smoke                        # 或 /tmp 式全链路：见 scripts/smoke.mjs 头注释
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
| `npm run dev` | 本地开发 |
| `npm run build` | 构建 admin SPA 到 `public/admin` |
| `npm run typecheck` | server + admin 双端类型检查 |
| `npm run db:migrate:local` / `:remote` | 应用迁移（1001_ 起编，只动 blog_* 表） |
| `npm run smoke` | API 全链路冒烟（70 项断言） |
| `D1_DATABASE_ID=<id> npm run deploy` | 手动部署 |

## 安全与边界

- 与 minidriver 相同的会话/CSRF/防爆破安全模型；认证表结构以 minidriver 为正本（standalone 使用幂等副本）
- 插件与模板主题均为**声明式/解析式**实现（Workers 禁止 eval，第三方代码不可执行）；liquid 模板源码不对外提供
