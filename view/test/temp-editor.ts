import {EditorView} from "../src"
import {EditorState} from "../../state/src"
import {Extension} from "../../extension/src/extension"

const workspace: HTMLElement = document.querySelector("#workspace")! as HTMLElement

let tempView: EditorView | null = null
let hide: any = null

export function tempEditor(doc = "", extensions: ReadonlyArray<Extension> = []): EditorView {
  if (tempView) {
    tempView.destroy()
    tempView = null
  }

  tempView = new EditorView(EditorState.create({doc, extensions}))
  workspace.appendChild(tempView.dom)
  workspace.style.pointerEvents = ""
  if (hide == null) hide = setTimeout(() => {
    hide = null
    workspace.style.pointerEvents = "none"
  }, 100)
  return tempView
}

export function requireFocus(cm: EditorView): EditorView {
  if (!document.hasFocus())
    throw new Error("The document doesn't have focus, which is needed for this test")
  cm.focus()
  return cm
}
