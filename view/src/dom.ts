import browser from "./browser"

export let maybeGetRoot: (dom: HTMLElement) => DocumentOrShadowRoot | null =
  typeof document == "undefined" || (document as any).getRootNode ?
  (dom: HTMLElement) => {
    let root = (dom as any).getRootNode()
    return root.nodeType == 9 || root.nodeType == 11 ? root : null
  } : () => document

export function getRoot(dom: HTMLElement) { return maybeGetRoot(dom) || document }

// Work around Chrome issue https://bugs.chromium.org/p/chromium/issues/detail?id=447523
// (isCollapsed inappropriately returns true in shadow dom)
export function selectionCollapsed(domSel: Selection) {
  let collapsed = domSel.isCollapsed
  if (collapsed && browser.chrome && domSel.rangeCount && !domSel.getRangeAt(0).collapsed)
    collapsed = false
  return collapsed
}

export function hasSelection(dom: HTMLElement): boolean {
  let sel = getRoot(dom).getSelection()!
  if (!sel.anchorNode) return false
  try {
    // Firefox will raise 'permission denied' errors when accessing
    // properties of `sel.anchorNode` when it's in a generated CSS
    // element.
    return dom.contains(sel.anchorNode.nodeType == 3 ? sel.anchorNode.parentNode! : sel.anchorNode)
  } catch(_) {
    return false
  }
}

export function clientRectsFor(dom: Node): DOMRectList {
  if (dom.nodeType == 3) {
    let range = document.createRange()
    range.setEnd(dom, dom.nodeValue!.length)
    range.setStart(dom, 0)
    return range.getClientRects() as DOMRectList
  } else if (dom.nodeType == 1) {
    return (dom as HTMLElement).getClientRects() as DOMRectList
  } else {
    return [] as any as DOMRectList
  }
}

// Scans forward and backward through DOM positions equivalent to the
// given one to see if the two are in the same place (i.e. after a
// text node vs at the end of that text node)
export function isEquivalentPosition(node: Node, off: number, targetNode: Node | null, targetOff: number): boolean {
  return targetNode ? (scanFor(node, off, targetNode, targetOff, -1) ||
                       scanFor(node, off, targetNode, targetOff, 1)) : false
}

export function domIndex(node: Node): number {
  for (var index = 0;; index++) {
    node = node.previousSibling!
    if (!node) return index
  }
}

function scanFor(node: Node, off: number, targetNode: Node, targetOff: number, dir: -1 | 1): boolean {
  for (;;) {
    if (node == targetNode && off == targetOff) return true
    if (off == (dir < 0 ? 0 : maxOffset(node))) {
      if (node.nodeName == "DIV") return false
      let parent = node.parentNode
      if (!parent || parent.nodeType != 1) return false
      off = domIndex(node) + (dir < 0 ? 0 : 1)
      node = parent
    } else if (node.nodeType == 1) {
      node = node.childNodes[off + (dir < 0 ? -1 : 0)]
      off = dir < 0 ? maxOffset(node) : 0
    } else {
      return false
    }
  }
}

export function maxOffset(node: Node): number {
  return node.nodeType == 3 ? node.nodeValue!.length : node.childNodes.length
}

export type Rect = {left: number, right: number, top: number, bottom: number}

function windowRect(win: Window): Rect {
  return {left: 0, right: win.innerWidth,
          top: 0, bottom: win.innerHeight}
}

export function scrollRectIntoView(dom: HTMLElement, rect: Rect) {
  let scrollThreshold = 0, scrollMargin = 5
  let doc = dom.ownerDocument!, win = doc.defaultView!
  let gutterCover = 0, prev = dom.previousSibling
  if (prev && getComputedStyle(prev as HTMLElement).position == "sticky") gutterCover = dom.offsetLeft

  for (let cur: any = dom.parentNode; cur;) {
    if (cur.nodeType == 1) { // Element or document
      let bounding: Rect, top = cur == document.body
      if (top) {
        bounding = windowRect(win)
      } else {
        if (cur.scrollHeight <= cur.clientHeight && cur.scrollWidth <= cur.clientWidth) {
          cur = cur.parentNode
          continue
        }
        let rect = cur.getBoundingClientRect()
        bounding = {left: rect.left, right: rect.left + cur.clientWidth,
                    top: rect.top, bottom: rect.top + cur.clientHeight}
      }

      let moveX = 0, moveY = 0
      if (rect.top < bounding.top + scrollThreshold)
        moveY = -(bounding.top - rect.top + scrollMargin)
      else if (rect.bottom > bounding.bottom - scrollThreshold)
        moveY = rect.bottom - bounding.bottom + scrollMargin
      if (rect.left < bounding.left + gutterCover + scrollThreshold)
        moveX = -(bounding.left + gutterCover - rect.left + scrollMargin)
      else if (rect.right > bounding.right - scrollThreshold)
        moveX = rect.right - bounding.right + scrollMargin
      if (moveX || moveY) {
        if (top) {
          win.scrollBy(moveX, moveY)
        } else {
          if (moveY) cur.scrollTop += moveY
          if (moveX) cur.scrollLeft += moveX
          rect = {left: rect.left - moveX, top: rect.top - moveY,
                  right: rect.right - moveX, bottom: rect.bottom - moveY} as ClientRect
        }
      }
      if (top) break
      cur = cur.parentNode
    } else if (cur.nodeType == 11) { // A shadow root
      cur = cur.host
    } else {
      break
    }
  }
}

export class DOMSelection {
  anchorNode: Node | null = null
  anchorOffset: number = 0
  focusNode: Node | null = null
  focusOffset: number = 0

  eq(domSel: Selection): boolean {
    return this.anchorNode == domSel.anchorNode && this.anchorOffset == domSel.anchorOffset &&
      this.focusNode == domSel.focusNode && this.focusOffset == domSel.focusOffset
  }

  set(domSel: Selection) {
    this.anchorNode = domSel.anchorNode; this.anchorOffset = domSel.anchorOffset
    this.focusNode = domSel.focusNode; this.focusOffset = domSel.focusOffset
  }
}
