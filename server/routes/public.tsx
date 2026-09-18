import { Hono } from 'hono'
import type { AppEnv } from '../lib/env'

/** 公开站 SSR（M0 为骨架；M1 接入 markdown 管线 / 标签 / RSS / 缓存） */
export const publicSite = new Hono<AppEnv>()

publicSite.get('/', (c) => {
  return c.html(
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Miniblog</title>
        <style>
          {`body{font-family:-apple-system,'PingFang SC','Noto Sans SC',sans-serif;margin:0;display:flex;min-height:100dvh;align-items:center;justify-content:center;background:#f6f7f9;color:#17181c}`}
        </style>
      </head>
      <body>
        <main style={{ textAlign: 'center' }}>
          <h1>Miniblog</h1>
          <p style={{ color: '#667085' }}>博客骨架已就绪，内容功能建设中。</p>
        </main>
      </body>
    </html>,
  )
})
