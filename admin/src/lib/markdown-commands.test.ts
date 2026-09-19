import { clearFormat, insertAtCursor, insertCodeBlock, insertLink, prefixLine, surround } from './markdown-commands.ts'
import type { TextAreaState } from './markdown-commands.ts'

/**
 * markdown 命令单测（无 DOM，纯函数）：
 *   node --experimental-strip-types admin/src/lib/markdown-commands.test.ts
 */
const st = (value: string, selectionStart = 0, selectionEnd = selectionStart): TextAreaState => ({
  value,
  selectionStart,
  selectionEnd,
})
const text = (r: TextAreaState) => r.value

let passed = 0
let failed = 0
function eq(name: string, actual: string, expected: string) {
  if (actual === expected) {
    passed++
    console.log(`  ✅ ${name}`)
  } else {
    failed++
    console.log(`  ❌ ${name}\n     期望: ${JSON.stringify(expected)}\n     实际: ${JSON.stringify(actual)}`)
  }
}

// ---- 标题：替换而非嵌套 ----
eq('H1 打在普通行', text(prefixLine(st('hello', 3), '# ')), '# hello')
eq('H1 打在 H2 行 → 替换为 H1', text(prefixLine(st('## 标题', 0), '# ')), '# 标题')
eq('H2 打在 H1 行 → 替换为 H2', text(prefixLine(st('# 标题', 0), '## ')), '## 标题')
eq('H1 再点一次 → 取消', text(prefixLine(st('# 标题', 0), '# ')), '标题')
eq('H3 打在 H2 行 → 替换为 H3', text(prefixLine(st('## x', 0), '### ')), '### x')

// ---- 列表：互转而非嵌套 ----
eq('无序打在有序行 → 替换', text(prefixLine(st('1. 事项', 0), '- ')), '- 事项')
eq('无序打在 * 行 → 归一为 -', text(prefixLine(st('* x', 0), '- ')), '- x')
eq('无序再点 → 取消', text(prefixLine(st('- x', 0), '- ')), 'x')
eq('有序打在无序行（跨行选区）→ 替换', text(prefixLine(st('- a\n- b', 0, 7), '1. ', true)), '1. a\n2. b')
eq('有序打在 1) 行 → 归一重排', text(prefixLine(st('1) a\n2) b', 0, 8), '1. ', true)), '1. a\n2. b')
eq('有序再点 → 全部取消', text(prefixLine(st('1. a\n2. b', 0, 8), '1. ', true)), 'a\nb')

// ---- 引用 ----
eq('引用打在标题行 → 替换', text(prefixLine(st('# x', 0), '> ')), '> x')
eq('引用打在列表行 → 替换', text(prefixLine(st('- x', 0), '> ')), '> x')
eq('引用再点 → 取消', text(prefixLine(st('> x', 0), '> ')), 'x')

// ---- 多行与空行（跨行选区）----
eq('多行 H2：非全有则全加', text(prefixLine(st('# a\nplain', 0, 9), '## ')), '## a\n## plain')
eq('多行无序：空行不加标记', text(prefixLine(st('a\n\nb', 0, 4), '- ')), '- a\n\n- b')
eq('多行无序取消：空行保留', text(prefixLine(st('- a\n\n- b', 0, 6), '- ')), 'a\n\nb')

// ---- 行内包裹 ----
eq('加粗', text(surround(st('ab', 0, 2), '**')), '**ab**')
eq('加粗取消', text(surround(st('**ab**', 0, 6), '**')), 'ab')
eq('无选区加粗 → 光标落中间', (() => {
  const r = surround(st('x', 1), '**')
  return r.value === 'x****' && r.selectionStart === 3 ? 'x****@3' : 'bad'
})(), 'x****@3')
eq('斜体取消', text(surround(st('*ab*', 0, 4), '*')), 'ab')

// ---- 插入 ----
const link = insertLink(st('前 中 后', 2, 3))
eq('链接：URL 预选中', (() => {
  const url = link.value.slice(link.selectionStart, link.selectionEnd)
  return `${link.value}|${url}`
})(), '前 [中](https://) 后|https://')
eq('代码块包裹选区', text(insertCodeBlock(st('code', 0, 4))), '\n```\ncode\n```\n')
eq('光标处插入图片', text(insertAtCursor(st('ab', 1), '![x](u)')), 'a![x](u)b')

// ---- 清格式 ----
eq('清格式：标题/引用/列表/行内', text(clearFormat(st('## 标 **加粗** `代` [链](u)', 0))), '标 加粗 代 链')

console.log(`\n结果：${passed} 通过，${failed} 失败`)
if (failed > 0) process.exit(1)
