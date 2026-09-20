/**
 * D1 语句执行审计：找出构建了 prepared statement 但从未执行（.run/.all/.first/.batch）的语句。
 * 这类 bug 会静默失败——端点照常返回成功，但数据没写库。
 *
 * 实现：对每个 .prepare( 做括号配平扫描，取出完整链式表达式（`.prepare(...).bind(...).run()`）——
 * 深度归零后下一个非空白字符是 `.` 则链继续，否则链结束。代码库无分号风格，
 * 不能用分号/行首字符切窗口（会把后续语句的执行器误算进来，或漏掉真正的漏执行）。
 * 放入 CI（deploy workflow 的类型检查步）作为回归防线。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    const s = statSync(p)
    return s.isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : []
  })
}

const EXECUTORS = new RegExp('\\.\\s*(run\\(\\s*\\)|all(\\s*<|\\s*\\()|first(\\s*<|\\s*\\()|batch\\()')

/** 从 .prepare( 起，取完整链式表达式（括号配平；深度归零后下一个非空白字符非 `.` 即结束） */
function chainWindow(src, dotIdx) {
  let i = src.indexOf('(', dotIdx)
  if (i === -1) return src.slice(dotIdx, dotIdx + 400)
  let depth = 0
  while (i < src.length) {
    const ch = src[i]
    if (ch === '(') {
      depth++
    } else if (ch === ')') {
      depth--
      if (depth === 0) {
        let j = i + 1
        while (j < src.length && /\s/.test(src[j])) j++
        if (src[j] !== '.') return src.slice(dotIdx, j)
        i = j
      }
    }
    i++
  }
  return src.slice(dotIdx, dotIdx + 800)
}

let bad = 0

for (const file of walk('server')) {
  const src = readFileSync(file, 'utf8')
  let idx = src.indexOf('.prepare(')
  while (idx !== -1) {
    const lineStart = src.lastIndexOf('\n', idx) + 1
    const lineText = src.slice(lineStart, src.indexOf('\n', lineStart))
    // 行内标注 audit-ok 表示该语句经 batch 等方式在别处执行（如 stmts 数组）
    if (!lineText.includes('audit-ok')) {
      const window = chainWindow(src, idx)
      if (!EXECUTORS.test(window)) {
        bad++
        const line = src.slice(0, idx).split('\n').length
        console.log(`${file}:${line}  statement built but never executed`)
      }
    }
    idx = src.indexOf('.prepare(', idx + 1)
  }
}

if (bad > 0) {
  console.error(`\n${bad} 个 D1 语句缺少执行器（.run()/.all()/.first()/.batch()）`)
  process.exit(1)
}
console.log('D1 语句审计通过：所有 prepare 都有执行器')
