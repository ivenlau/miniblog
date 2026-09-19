import { Liquid } from 'liquidjs'
import type { AppEnv } from '../lib/env'
import type { FS } from 'liquidjs'

/**
 * 模板主题渲染（v2）：liquidjs（解析式，无 eval，Workers 兼容）。
 * 模板文件从 R2 themes/<themeId>/templates/ 读取；上下文白名单见各路由。
 */

const engines = new Map<string, Liquid>()

function engineFor(env: AppEnv['Bindings'], themeId: string): Liquid {
  const existing = engines.get(themeId)
  if (existing) return existing
  const fs = {
    readFileSync: () => {
      throw new Error('sync fs 不可用')
    },
    existsSync: () => false,
    async readFile(filePath: string) {
      const obj = await env.R2.get(`themes/${themeId}/templates/${filePath}`)
      if (!obj) throw new Error(`模板不存在: ${filePath}`)
      return await obj.text()
    },
    async exists(filePath: string) {
      const obj = await env.R2.get(`themes/${themeId}/templates/${filePath}`)
      return !!obj
    },
    resolve(dirPath: string, filePatch: string, _ext?: string) {
      // liquidjs 默认 root 为 "."，需归一化避免 R2 key 出现 "./"
      const dir = !dirPath || dirPath === '.' ? '' : dirPath.replace(/\/+$/, '')
      return dir ? `${dir}/${filePatch}` : filePatch
    },
  } as unknown as FS
  // relativeReference 依赖 fs.dirname/fs.sep（Workers 环境没有），显式关闭以消除启动警告
  const engine = new Liquid({ jsTruthy: true, relativeReference: false, fs })
  engines.set(themeId, engine)
  return engine
}

/** 渲染指定模板；模板缺失或渲染失败返回 null（调用方回退内置主题） */
export async function renderLiquid(
  env: AppEnv['Bindings'],
  themeId: string,
  template: string,
  ctx: Record<string, unknown>,
): Promise<string | null> {
  try {
    // 校验主题包存在（避免对空包建引擎）
    const meta = await env.R2.get(`themes/${themeId}/theme.json`)
    if (!meta) return null
    const engine = engineFor(env, themeId)
    const tpl = await engine.parseFile(template)
    return await engine.render(tpl, ctx)
  } catch (err) {
    console.error(`[liquid] ${themeId}/${template} 渲染失败:`, (err as Error).message)
    return null
  }
}
