/**
 * Markdown 编辑命令 —— 纯函数（输入/输出都是 textarea 状态），
 * 由编辑器工具栏与快捷键调用，便于单测。
 */

export type TextAreaState = { value: string; selectionStart: number; selectionEnd: number }

/** 包裹选区（**加粗** / *斜体* / `代码` / ~~删除线~~）；已完整包裹时取消 */
export function surround(state: TextAreaState, before: string, after: string = before): TextAreaState {
  const { value, selectionStart: s, selectionEnd: e } = state
  const sel = value.slice(s, e)
  if (sel.length >= before.length + after.length && sel.startsWith(before) && sel.endsWith(after)) {
    const inner = sel.slice(before.length, sel.length - after.length)
    return {
      value: value.slice(0, s) + inner + value.slice(e),
      selectionStart: s,
      selectionEnd: s + inner.length,
    }
  }
  return {
    value: value.slice(0, s) + before + sel + after + value.slice(e),
    selectionStart: s + before.length,
    selectionEnd: s + before.length + sel.length,
  }
}

/** 块级标记（标题/引用/无序/有序列表）——块命令互转时整体替换，避免嵌套出 `## # 标题` 之类 */
const BLOCK_MARKER_RE = /^(#{1,6}[ \t]+|>[ \t]?|[-*+][ \t]+|\d+[.)][ \t]+)/
/** 工具栏输出的标准有序标记（`1)` 等变体视作待归一，不算已是目标） */
const OL_CANONICAL_RE = /^\d+\.[ \t]+/

/**
 * 块级命令（# 标题 / > 引用 / - 列表 / 1. 有序列表）：
 * - 目标标记已存在于所有非空选中行 → 移除（取消该格式）
 * - 否则把每行已有的块标记**替换**为目标标记（H2 行点 H1 → 变 H1；有序行点无序 → 变无序；
 *   `1)` 变体归一为 `1.`）
 * - 有序列表逐行重新编号；多选中的空行不加标记
 */
export function prefixLine(state: TextAreaState, prefix: string, ordered = false): TextAreaState {
  const { value, selectionStart: s, selectionEnd: e } = state
  const lineStart = value.lastIndexOf('\n', s - 1) + 1
  const lineEnd = (() => {
    const i = value.indexOf('\n', e)
    return i === -1 ? value.length : i
  })()
  const lines = value.slice(lineStart, lineEnd).split('\n')
  const hasTarget = (line: string) => (ordered ? OL_CANONICAL_RE.test(line) : line.startsWith(prefix))
  const strip = (line: string) => line.replace(BLOCK_MARKER_RE, '')

  // 所有非空选中行都已是该块类型 → 取消
  const nonEmpty = lines.filter((l) => l.trim() !== '')
  if (nonEmpty.length > 0 && nonEmpty.every(hasTarget)) {
    const out = lines.map(strip).join('\n')
    return {
      value: value.slice(0, lineStart) + out + value.slice(lineEnd),
      selectionStart: lineStart,
      selectionEnd: lineStart + out.length,
    }
  }
  let n = 0
  const out = lines
    .map((line) => {
      if (line.trim() === '' && lines.length > 1) return line
      n += 1
      return ordered ? `${n}. ${strip(line)}` : prefix + strip(line)
    })
    .join('\n')
  return {
    value: value.slice(0, lineStart) + out + value.slice(lineEnd),
    selectionStart: lineStart,
    selectionEnd: lineStart + out.length,
  }
}

/** 在光标处插入文本（替换选区）；cursorBack 使光标落在插入内容内向后的偏移 */
export function insertAtCursor(state: TextAreaState, text: string, cursorBack = 0): TextAreaState {
  const { value, selectionStart: s, selectionEnd: e } = state
  const pos = s + text.length - cursorBack
  return {
    value: value.slice(0, s) + text + value.slice(e),
    selectionStart: pos,
    selectionEnd: pos,
  }
}

/** 链接：[选区文本](https://)，URL 部分预选中便于直接输入 */
export function insertLink(state: TextAreaState): TextAreaState {
  const { value, selectionStart: s, selectionEnd: e } = state
  const sel = value.slice(s, e) || 'text'
  const snippet = `[${sel}](https://)`
  const urlStart = s + sel.length + 3
  return {
    value: value.slice(0, s) + snippet + value.slice(e),
    selectionStart: urlStart,
    selectionEnd: urlStart + 8,
  }
}

/** 代码块：选区包进 ``` 围栏，光标落在块内 */
export function insertCodeBlock(state: TextAreaState): TextAreaState {
  const { value, selectionStart: s, selectionEnd: e } = state
  const sel = value.slice(s, e)
  const snippet = `\n\`\`\`\n${sel}\n\`\`\`\n`
  const innerStart = s + 5
  return {
    value: value.slice(0, s) + snippet + value.slice(e),
    selectionStart: sel ? innerStart : innerStart,
    selectionEnd: sel ? innerStart + sel.length : innerStart,
  }
}

/** 清除格式：去行首标记（标题、引用、列表）与行内包裹（加粗、斜体、代码、删除线、链接） */
export function clearFormat(state: TextAreaState): TextAreaState {
  const { value, selectionStart: s, selectionEnd: e } = state
  const lineStart = value.lastIndexOf('\n', s - 1) + 1
  const idx = value.indexOf('\n', e)
  const lineEnd = idx === -1 ? value.length : idx
  const out = value
    .slice(lineStart, lineEnd)
    .split('\n')
    .map((line) =>
      line
        .replace(/^#{1,6}\s+/, '')
        .replace(/^>\s?/, '')
        .replace(/^[-*+]\s+/, '')
        .replace(/^\d+\.\s+/, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/~~([^~]+)~~/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1'),
    )
    .join('\n')
  return { value: value.slice(0, lineStart) + out + value.slice(lineEnd), selectionStart: lineStart, selectionEnd: lineStart + out.length }
}
