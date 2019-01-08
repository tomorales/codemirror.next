import {Decoration, DecoratedRange, DecorationSet, WidgetType, EditorView} from "../../view/src"
import {Transaction, ChangeSet, ChangedRange, Plugin} from "../../state/src"
import {countColumn} from "../../doc/src"
import {styleModule} from "stylemodule"

export interface SpecialCharOptions {
  render?: (code: number, description: string | null, placeHolder: string) => HTMLElement | null
  specialChars?: RegExp
  addSpecialChars?: RegExp
}

export function specialChars(options: SpecialCharOptions = {}): Plugin {
  return new Plugin({
    view(view: EditorView) {
      return new SpecialCharHighlighter(view, options)
    }
  })
}

const JOIN_GAP = 10

class SpecialCharHighlighter {
  decorations: DecorationSet = Decoration.none
  from = 0
  to = 0
  specials: RegExp
  replaceTabs: boolean

  constructor(readonly view: EditorView, readonly options: SpecialCharOptions) {
    this.updateForViewport()
    this.specials = options.specialChars || SPECIALS
    if (options.addSpecialChars) this.specials = new RegExp(this.specials.source + "|" + options.addSpecialChars.source, "gu")
    let styles = document.body.style as any
    if (this.replaceTabs = (styles.tabSize || styles.MozTabSize) == null)
      this.specials = new RegExp("\t|" + this.specials.source, "gu")
  }

  updateState(_view: EditorView, _prev: any, transactions: Transaction[]) {
    let allChanges = transactions.reduce((ch, tr) => ch.appendSet(tr.changes), ChangeSet.empty)
    if (allChanges.length) {
      this.decorations = this.decorations.map(allChanges)
      this.from = allChanges.mapPos(this.from, 1)
      this.to = allChanges.mapPos(this.to, -1)
      this.closeHoles(allChanges.changedRanges())
    }
    this.updateForViewport()
  }

  updateViewport() {
    this.updateForViewport()
  }

  closeHoles(ranges: ReadonlyArray<ChangedRange>) {
    let decorations: DecoratedRange[] = [], vp = this.view.viewport, replaced: number[] = []
    for (let i = 0; i < ranges.length; i++) {
      let {fromB: from, toB: to} = ranges[i]
      // Must redraw all tabs further on the line
      if (this.replaceTabs) to = this.view.state.doc.lineAt(to).end
      while (i < ranges.length - 1 && ranges[i + 1].fromB < to + JOIN_GAP) to = Math.max(to, ranges[++i].toB)
      // Clip to current viewport, to avoid doing work for invisible text
      from = Math.max(vp.from, from); to = Math.min(vp.to, to)
      if (from >= to) continue
      this.getDecorationsFor(from, to, decorations)
      replaced.push(from, to)
    }
    if (decorations.length)
      this.decorations = this.decorations.update(decorations, pos => {
        for (let i = 0; i < replaced.length; i += 2)
          if (pos >= replaced[i] && pos < replaced[i + 1]) return false
        return true
      }, replaced[0], replaced[replaced.length - 1])
  }

  updateForViewport() {
    let vp = this.view.viewport
    // Viewports match, don't do anything
    if (this.from == vp.from && this.to == vp.to) return
    let decorations: DecoratedRange[] = []
    if (this.from >= vp.to || this.to <= vp.from) {
      this.getDecorationsFor(vp.from, vp.to, decorations)
      this.decorations = Decoration.set(decorations)
    } else {
      if (vp.from < this.from) this.getDecorationsFor(vp.from, this.from, decorations)
      if (this.to < vp.to) this.getDecorationsFor(this.to, vp.to, decorations)
      this.decorations = this.decorations.update(decorations, (from, to) => from >= vp.from && to <= vp.to)
    }
    this.from = vp.from; this.to = vp.to
  }

  getDecorationsFor(from: number, to: number, target: DecoratedRange[]) {
    let {doc} = this.view.state
    for (let pos = from, cursor = doc.iterRange(from, to), m; !cursor.next().done;) {
      if (!cursor.lineBreak) {
        while (m = SPECIALS.exec(cursor.value)) {
          let code = m[0].codePointAt ? m[0].codePointAt(0) : m[0].charCodeAt(0), widget
          if (code == null) continue
          if (code == 9) {
            let line = doc.lineAt(pos + m.index)
            let size = this.view.state.tabSize, col = countColumn(doc.slice(line.start, pos + m.index), 0, size)
            widget = new TabWidget((size - (col % size)) * this.view.defaultCharacterWidth)
          } else {
            widget = new SpecialCharWidget(this.options, code)
          }
          target.push(Decoration.range(pos + m.index, pos + m.index + m[0].length, {collapsed: widget}))
        }
      }
      pos += cursor.value.length
    }
  }

  get styles() { return style }
}

// FIXME configurable
const SPECIALS = /[\u0000-\u0008\u000a-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u2028\u2029\ufeff]/gu

const NAMES: {[key: number]: string} = {
  0: "null",
  7: "bell",
  8: "backspace",
  10: "newline",
  11: "vertical tab",
  13: "carriage return",
  27: "escape",
  8203: "zero width space",
  8204: "zero width non-joiner",
  8205: "zero width joiner",
  8206: "left-to-right mark",
  8207: "right-to-left mark",
  8232: "line separator",
  8233: "paragraph separator",
  65279: "zero width no-break space"
}

// Assigns placeholder characters from the Control Pictures block to
// ASCII control characters
function placeHolder(code: number): string | null {
  if (code >= 32) return null
  if (code == 10) return "\u2424"
  return String.fromCharCode(9216 + code)
}

const DEFAULT_PLACEHOLDER = "\u2022"

class SpecialCharWidget extends WidgetType<number> {
  constructor(private options: SpecialCharOptions, code: number) { super(code) }

  toDOM() {
    let ph = placeHolder(this.value) || DEFAULT_PLACEHOLDER
    let desc = "Control character " + (NAMES[this.value] || this.value)
    let custom = this.options.render && this.options.render(this.value, desc, ph)
    if (custom) return custom
    let span = document.createElement("span")
    span.textContent = ph
    span.title = desc
    span.setAttribute("aria-label", desc)
    span.style.color = "red"
    return span
  }

  ignoreEvent(): boolean { return false }
}

class TabWidget extends WidgetType<number> {
  toDOM() {
    let span = document.createElement("span")
    span.textContent = "\t"
    span.className = style.tab
    span.style.width = this.value + "px"
    return span
  }

  ignoreEvent(): boolean { return false }
}

const style = styleModule({
  tab: {
    display: "inline-block",
    overflow: "hidden",
    verticalAlign: "bottom"
  }
})
