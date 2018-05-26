import {Decoration, DecorationSet, decoratedSpansInRange} from "../src/decoration"
import {Change} from "../../state/src/state"
const ist = require("ist")

function depth(decoSet: DecorationSet): number {
  return 1 + Math.max(0, ...decoSet.children.map(depth))
}
function maxSize(decoSet: DecorationSet): number {
  return Math.max(decoSet.local.length, ...decoSet.children.map(maxSize))
}
function size(decoSet: DecorationSet): number {
  return decoSet.children.reduce((a, b) => a + size(b), decoSet.local.length)
}
function avgSize(decoSet: DecorationSet): number {
  let total = 0, count = 0
  function scan(set: DecorationSet) {
    total += set.local.length + set.children.length
    count++
    set.children.forEach(scan)
  }
  scan(decoSet)
  return total / count
}
function checkSet(decoSet: DecorationSet, offset: number = 0) {
  ist(decoSet.length, 0, ">=")
  ist(size(decoSet), decoSet.size)
  let off = 0
  for (let i = 0; i < decoSet.children.length; i++) {
    let child = decoSet.children[i]
    checkSet(child, offset + off)
    off += child.length
  }
  ist(off, decoSet.length, "<=")
  for (let i = 0; i < decoSet.local.length; i++) {
    let deco = decoSet.local[i]
    if (deco.spec.pos != null) ist(offset + deco.from, deco.spec.pos)
    ist(deco.to, deco.from, ">=")
    ist(deco.from, 0, ">=")
    ist(deco.to, decoSet.length, "<=")
  }
}

let smallDecorations = []
for (let i = 0; i < 5000; i++) {
  smallDecorations.push(Decoration.range(i, i + 1 + (i % 4), {pos: i}))
}
let set0 = DecorationSet.of(smallDecorations)

describe("DecorationSet", () => {
  it("creates a balanced decoration tree", () => {
    let set = DecorationSet.of(smallDecorations.concat([
      Decoration.range(1000, 4000, {pos: 1000}),
      Decoration.range(2000, 3000, {pos: 2000})
    ]))
    ist(set.size, 5002)
    ist(size(set), 5002)
    ist(depth(set), 4, "<")
    ist(maxSize(set), 64, "<=")
    ist(avgSize(set), 24, ">")
    checkSet(set)
  })

  describe("update", () => {
    it("can add decorations to an existing set", () => {
      let set = set0.update([
        Decoration.point(2000, {pos: 2000}),
        Decoration.range(2008, 2200, {pos: 2008})
      ])
      ist(set.size, 5002)
      checkSet(set)
      ist(set.children[0], set0.children[0])
      ist(set.children[set.children.length - 1], set0.children[set0.children.length - 1])
    })

    it("can add a large amount of decorations", () => {
      let set0 = DecorationSet.of([
        Decoration.point(0, {pos: 0}),
        Decoration.point(100, {pos: 100}),
        Decoration.range(2, 4000, {pos: 2}),
        Decoration.point(10000, {pos: 10000})
      ])
      let set = set0.update(smallDecorations)
      ist(set.size, 5004)
      checkSet(set)
    })

    it("can filter decorations", () => {
      let set = set0.update([], from => from >= 2500)
      ist(set.size, 2500)
      checkSet(set)
      ist(set.children[set.children.length - 1], set0.children[set0.children.length - 1])
    })

    it("can filter all over", () => {
      let set = set0.update([], from => (from % 200) >= 100)
      ist(set.size, 2500)
      checkSet(set)
    })

    it("can add and remove in one go", () => {
      let set = set0.update([Decoration.range(25, 30, {pos: 25})], from => from % 1000 > 0)
      ist(set.size, 4996)
      checkSet(set)
    })

    it("collapses the tree when removing almost all decorations", () => {
      let set = set0.update([], from => from == 500 || from == 501)
      ist(set.size, 2)
      ist(depth(set), 1)
    })

    it("doesn't call filter on decorations outside the filter range", () => {
      let called = 0
      set0.update([], () => (called++, true), 2000, 2005)
      ist(called, 10, "<")
    })

    it("reuses unchanged nodes", () => {
      ist(set0.update([], () => true), set0)
    })
  })

  describe("map", () => {
    type Pos = number | [number, number] | [number, number, any]

    function asRange(pos: Pos): {from: number, to: number} {
      return typeof pos == "number" ? {from: pos, to: pos} : {from: pos[0], to: pos[1]}
    }

    function test(positions: Pos[], changes: [number, number, number][], newPositions: Pos[]) {
      let set = DecorationSet.of(positions.map(pos => {
        let {from, to} = asRange(pos)
        return from == to ? Decoration.point(from, pos[2] || {}) : Decoration.range(from, to, pos[2] || {})
      }))
      let mapped = set.map(changes.map(([from, to, len]) => new Change(from, to, "x".repeat(len))))
      let out = []
      mapped.collect(out, 0)
      ist(JSON.stringify(out.map(d => d.from + "-" + d.to)),
          JSON.stringify(newPositions.map(asRange).map(r => r.from + "-" + r.to)))
    }

    it("can map through changes", () =>
       test([1, 4, 10], [[0, 0, 1], [2, 3, 0], [8, 8, 20]], [2, 4, 30]))

    it("takes inclusivity into account", () =>
       test([[1, 2, {inclusiveStart: true, inclusiveEnd: true}]], [[1, 1, 2], [4, 4, 2]], [[1, 6]]))

    it("defaults to exclusive on both sides", () =>
       test([[1, 2]], [[1, 1, 2], [4, 4, 2]], [[3, 4]]))

    it("drops collapsed decorations", () =>
       test([[1, 2]], [[1, 2, 0], [1, 1, 1]], []))

    it("drops decorations in deleted regions", () =>
       test([[1, 2, {assoc: 1}]], [[0, 4, 0]], []))

    it("adjusts the set tree shape", () => {
      let child0Size = set0.children[0].length, child1Size = set0.children[1].length
      let set = set0.map([new Change(0, 0, "hi"), new Change(child0Size + 3, child0Size + 5, "")])
      ist(set.size, set0.size)
      ist(set.children[0].length, child0Size + 2)
      ist(set.children[1].length, child1Size - 2)
      ist(set.children[2].length, set0.children[2].length)
    })

    it("allows decorations to escape their parent node", () => {
      let deco = []
      for (let i = 0; i < 100; i++)
        deco.push(Decoration.range(i, i + 1, {inclusiveStart: true, inclusiveEnd: true}))
      let set0 = DecorationSet.of(deco), nodeBoundary = set0.children[0].length
      let set = set0.map([new Change(nodeBoundary, nodeBoundary, "hello")])
      ist(set.size, set0.size)
      checkSet(set)
    })

    it("removes collapsed tree nodes", () => {
      let set = set0.map([new Change(0, 6000, "")])
      ist(set.size, 0)
      ist(depth(set), 1)
    })
  })

  describe("decoratedSpansInRange", () => {
    function d(from, to, tag) {
      return Decoration.range(from, to, {attributes: {[tag]: "y"}})
    }
    function id(span) {
      return span.from + "-" + span.to + (span.attrs ? "=" + Object.keys(span.attrs).sort().join("&") : "")
    }

    it("separates the range in covering spans", () => {
      let set = DecorationSet.of([d(3, 8, "one"), d(5, 8, "two"), d(10, 12, "three")])
      let ranges = decoratedSpansInRange([set], 0, 15)
      ist(ranges.map(id).join(","), "0-3,3-5=one,5-8=one&two,8-10,10-12=three,12-15")
    })

    it("can retrieve a limited range", () => {
      let decos = [d(0, 200, "wide")]
      for (let i = 0; i < 100; i++) decos.push(d(i * 2, i * 2 + 2, "span" + i))
      let set = DecorationSet.of(decos), start = set.children[0].length + set.children[1].length - 3, end = start + 6
      let expected = ""
      for (let pos = start; pos < end; pos += (pos % 2 ? 1 : 2))
        expected += (expected ? "," : "") + pos + "-" + Math.min(end, pos + (pos % 2 ? 1 : 2)) + "=span" + Math.floor(pos / 2) + "&wide"
      ist(decoratedSpansInRange([set], start, end).map(id).join(","), expected)
    })

    it("ignores decorations that don't affect spans", () => {
      let decos = [d(0, 10, "yes"), Decoration.range(5, 6, {})]
      ist(decoratedSpansInRange([DecorationSet.of(decos)], 2, 15).map(id).join(","), "2-10=yes,10-15")
    })

    it("combines classes", () => {
      let decos = [Decoration.range(0, 10, {attributes: {class: "a"}}),
                   Decoration.range(2, 4, {attributes: {class: "b"}})]
      let ranges = decoratedSpansInRange([DecorationSet.of(decos)], 0, 10)
      ist(ranges.map(id).join(","), "0-2=class,2-4=class,4-10=class")
      ist(ranges.map(r => r.attrs.class).join(","), "a,a b,a")
    })

    it("combines styles", () => {
      let decos = [Decoration.range(0, 6, {attributes: {style: "color: red"}}),
                   Decoration.range(4, 10, {attributes: {style: "background: blue"}})]
      let ranges = decoratedSpansInRange([DecorationSet.of(decos)], 0, 10)
      ist(ranges.map(id).join(","), "0-4=style,4-6=style,6-10=style")
      ist(ranges.map(r => r.attrs.style).join(","), "color: red,color: red;background: blue,background: blue")
    })

    it("reads from multiple sets at once", () => {
      let one = DecorationSet.of([d(2, 3, "x"), d(5, 10, "y"), d(10, 12, "z")])
      let two = DecorationSet.of([d(0, 6, "a"), d(10, 12, "b")])
      ist(decoratedSpansInRange([one, two], 0, 12).map(id).join(","),
          "0-2=a,2-3=a&x,3-5=a,5-6=a&y,6-10=y,10-12=b&z")
    })
  })
})