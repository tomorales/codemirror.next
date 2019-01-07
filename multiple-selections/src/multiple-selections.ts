import {Plugin, EditorState} from "../../state/src"
import {EditorView, DecorationSet, Decoration, WidgetType, RangeDecorationSpec} from "../../view/src"
import {styleModule} from "stylemodule"

export function multipleSelections() {
  return new Plugin({
    multipleSelections: true,
    view: (view: EditorView) => new MultipleSelectionView(view)
  })
}

class CursorWidget extends WidgetType<null> {
  toDOM() {
    let span = document.createElement("span")
    span.className = styles.secondaryCursor
    return span
  }
}

class MultipleSelectionView {
  decorations: DecorationSet = Decoration.none
  rangeConfig: RangeDecorationSpec

  constructor(view: EditorView) {
    this.update(view.state)
    this.rangeConfig = {class: styles.secondarySelection} // FIXME themable?
  }

  updateState(view: EditorView, prevState: EditorState) {
    if (prevState.doc != view.state.doc || !prevState.selection.eq(view.state.selection))
      this.update(view.state)
  }

  update(state: EditorState) {
    let {ranges, primaryIndex} = state.selection
    if (ranges.length == 0) {
      this.decorations = Decoration.none
      return
    }
    let deco = []
    for (let i = 0; i < ranges.length; i++) if (i != primaryIndex) {
      let range = ranges[i]
      deco.push(range.empty ? Decoration.widget(range.from, {widget: new CursorWidget(null)})
                            : Decoration.range(ranges[i].from, ranges[i].to, this.rangeConfig))
    }
    this.decorations = Decoration.set(deco)
  }

  get styles() { return styles }
}

const styles = styleModule({
  secondarySelection: {
    backgroundColor_fallback: "#3297FD",
    color_fallback: "white !important",
    backgroundColor: "Highlight",
    color: "HighlightText !important"
  },

  secondaryCursor: {
    display: "inline-block",
    verticalAlign: "text-top",
    borderLeft: "1px solid #555",
    width: 0,
    height: "1.15em",
    margin: "0 -0.5px -.5em"
  }
})
