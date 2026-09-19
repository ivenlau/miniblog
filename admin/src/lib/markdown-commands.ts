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

/** 行首前缀（# / > / - / 1.）；再次执行同一命令时取消。有序列表逐行编号 */
export function prefixLine(state: TextAreaState, prefix: string, ordered = false): TextAreaState {
  const { value, selectionStart: s, selectionEnd: e } = state
  const lineStart = value.lastIndexOf('\n', s - 1) + 1
  const lineEnd = (() => {
    const i = value.indexOf('\n', e)
    return i === -1 ? value.length : i
  })()
  const lines = value.slice(lineStart, lineEnd).split('\n')
  const matcher = ordered ? /^\d+\.\s/ : undefined
  const has = (line: string) => (matcher ? matcher.test(line) : line.startsWith(prefix))
  const strip = (line: string) => (matcher ? line.replace(matcher, '') : line.slice(prefix.length))

  // 所有选中行都已有该前缀 → 移除（取消格式）
  if (lines.every((l) => has(l))) {
    const out = lines.map(strip).join('\n')
    return { value: value.slice(0, lineStart) + out + value.slice(lineEnd), selectionStart: lineStart, selectionEnd: lineStart + out.length }
  }
  let n = 0
  const out = lines
    .map((line) => {
      if (line.trim() === '' && lines.length > 1) return line
      n += 1
      return `${n}. ${matcher ? line.replace(matcher, '') : line.startsWith(prefix) ? line.slice(prefix.length) : line}`
    })
    .join('\n')
  return { value: value.slice(0, lineStart) + out + value.slice(lineEnd), selectionStart: lineStart, selectionEnd: lineStart + out.length }
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
