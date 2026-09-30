const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { html2json, stringifyHtmlJson } = require("../html2json.js");

const fixture = (name) => fs.readFileSync(path.join(__dirname, name + ".html"), "utf8");
const text = (value) => ({ type: "text", value });
const element = (tagName, children = [], attributes = {}) => ({
  type: "element",
  tagName,
  attributes,
  children,
});
const document = (...children) => ({ type: "document", children });
const elements = (node) => node.children.filter((child) => child.type === "element");

function validateTree(root) {
  assert.equal(root.type, "document");
  const pending = [root];
  const seen = new Set();
  while (pending.length > 0) {
    const node = pending.pop();
    assert.equal(seen.has(node), false);
    seen.add(node);
    if (node.type === "document" || node.type === "element") {
      assert.ok(Array.isArray(node.children));
      if (node.type === "element") {
        assert.equal(typeof node.tagName, "string");
        assert.equal(Object.getPrototypeOf(node.attributes), Object.prototype);
        for (const value of Object.values(node.attributes)) assert.equal(typeof value, "string");
      }
      for (const child of node.children) pending.push(child);
    } else {
      assert.ok(["text", "comment", "doctype", "declaration", "cdata"].includes(node.type));
      assert.equal(typeof node.value, "string");
    }
  }
}

for (const name of fs.readdirSync(__dirname).filter((name) => name.endsWith(".html"))) {
  test(`sample ${name}: valid tree and JSON round trip`, () => {
    const result = html2json(fs.readFileSync(path.join(__dirname, name), "utf8"));
    validateTree(result);
    const serialized = stringifyHtmlJson(result);
    const restored = JSON.parse(serialized);
    validateTree(restored);
    assert.equal(stringifyHtmlJson(restored), serialized);
  });
}

test("empty input and unsupported values produce an empty document without coercion", () => {
  const hostile = {
    toString() {
      throw new Error("must not coerce");
    },
  };
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  for (const input of [
    "",
    undefined,
    null,
    false,
    42,
    1n,
    Symbol("x"),
    [],
    hostile,
    revoked.proxy,
  ]) {
    assert.deepEqual(html2json(input), document());
  }
  assert.equal(fixture("empty"), "");
});

test("plain text, entities, invalid less-than signs and Unicode are unchanged", () => {
  const source = fixture("plain-text");
  assert.deepEqual(html2json(source), document(text(source)));
  for (const value of [" ", "\r\n\t\f", "<", "</", "<3", "< div>", "a\0b\ud800c", "<> </> <💡>"]) {
    assert.deepEqual(html2json(value), document(text(value)));
  }
});

test("multiple roots and mixed text keep their order", () => {
  assert.deepEqual(
    html2json("before<div>one</div>between<p>two</p>after"),
    document(
      text("before"),
      element("div", [text("one")]),
      text("between"),
      element("p", [text("two")]),
      text("after"),
    ),
  );
  assert.deepEqual(
    html2json(fixture("mixed-content")).children[0],
    element("article", [
      text("Hello "),
      element("strong", [text("bold "), element("em", [text("and italic")])]),
      text(" world!"),
      element("br"),
      text("Next "),
      element("a", [text("link")], { href: "/page" }),
      text("."),
    ]),
  );
});

test("repeated siblings and preformatted whitespace are preserved", () => {
  const root = html2json(fixture("repeated-whitespace-unicode")).children[0];
  assert.deepEqual(
    elements(root).map((node) => node.tagName),
    ["p", "p", "p", "pre"],
  );
  assert.equal(root.children[2].children[0].value, "Привіт 🌍 é 世界");
  assert.deepEqual(root.children[3].children, [
    text("\n  first line\n\tsecond line  \n&lt;tag&gt; "),
    element("b", [text("still markup")]),
    text("\n"),
  ]);
  assert.deepEqual(
    html2json("<pre>\r\n  x\t y\r</pre>"),
    document(element("pre", [text("\r\n  x\t y\r")])),
  );
});

test("attributes support all quoting styles, booleans, duplicates and hostile property names", () => {
  const input = html2json(fixture("attributes")).children[0];
  assert.equal(input.tagName, "input");
  assert.deepEqual(input.attributes, {
    name: "search",
    style: "color: red; width: 10px",
    class: "wide field",
    disabled: "",
    empty: "",
    value: "a > b < c",
    "data-url": "https://example.test/a/b",
    "data-entity": "&quot; &#x1F600;",
    ["__proto__"]: "safe",
    constructor: "own",
    tostring: "value",
    "data-İ": "preserved",
  });
  assert.equal(Object.getPrototypeOf(input.attributes), Object.prototype);
  assert.equal({}.safe, undefined);
  assert.deepEqual(html2json("<x a=\"1\"b=2 c = '3' d=>").children[0].attributes, {
    a: "1",
    b: "2",
    c: "3",
    d: "",
  });
  assert.equal(html2json('<DİV DATA-İ="İ">İ</DİV>').children[0].tagName, "dİv");
});

test("attribute error recovery always advances and retains the first value", () => {
  assert.deepEqual(html2json("<x =value / odd==yes a=first A=last>").children[0].attributes, {
    "=value": "",
    odd: "=yes",
    a: "first",
  });
  assert.deepEqual(html2json('<x a="one\\" b=two>').children[0].attributes, {
    a: "one\\",
    b: "two",
  });
});

test("all void elements remain childless without end tags", () => {
  const root = html2json(fixture("void-and-slashes")).children[0];
  assert.equal(elements(root).length, 14);
  for (const child of elements(root)) assert.deepEqual(child.children, []);
  assert.deepEqual(root.children.at(-1), text("tail"));
  assert.equal(elements(root).find((node) => node.tagName === "img").attributes.src, "photo.png/");
});

test("trailing slashes follow HTML and foreign-content rules", () => {
  assert.deepEqual(
    html2json("<div/>inside<span/>nested</span></div>"),
    document(element("div", [text("inside"), element("span", [text("nested")])])),
  );
  assert.deepEqual(
    html2json("<img src=a/><img src=a /><br / >tail"),
    document(
      element("img", [], { src: "a/" }),
      element("img", [], { src: "a" }),
      element("br"),
      text("tail"),
    ),
  );
  assert.deepEqual(
    html2json("<svg><path/><circle /></svg><math><mspace/></math>"),
    document(
      element("svg", [element("path"), element("circle")]),
      element("math", [element("mspace")]),
    ),
  );
});

test("comments and declarations preserve quoted greater-than signs", () => {
  assert.deepEqual(
    html2json(fixture("comments-and-declarations")),
    document(
      { type: "doctype", value: 'html SYSTEM "about:legacy>compat"' },
      { type: "comment", value: " a <tag> &amp; " },
      { type: "declaration", value: '?target value="a > b"?' },
      { type: "declaration", value: "!custom [a > b]" },
      { type: "comment", value: " recovered " },
      { type: "comment", value: "" },
      { type: "comment", value: "" },
      element("p", [text("after")]),
      text("\n"),
    ),
  );
  assert.deepEqual(html2json("<!dOcTyPe html>"), document({ type: "doctype", value: "html" }));
  assert.deepEqual(html2json("<!doctypex>"), document({ type: "declaration", value: "!doctypex" }));
});

test("raw-text and escapable-text elements keep markup and entities literally", () => {
  const roots = elements(html2json(fixture("raw-text")));
  assert.deepEqual(
    roots.map((node) => node.tagName),
    ["script", "style", "textarea", "title", "script"],
  );
  for (const root of roots) {
    assert.equal(root.children.length, 1);
    assert.equal(root.children[0].type, "text");
  }
  assert.ok(roots[0].children[0].value.includes("</scripture>"));
  assert.ok(roots[1].children[0].value.includes("</stylesheet>"));
  assert.equal(
    roots[2].children[0].value,
    "\n<b>literal</b> &amp; &#60; <!-- text --> </textareax>",
  );
  assert.equal(roots[3].children[0].value, "A < B &copy; <i>literal</i>");
  assert.equal(roots[4].children[0].value, "<!--<script>inner</script>still script-->");
});

test("raw end tags require an exact name and ignore JavaScript string quoting", () => {
  assert.deepEqual(
    html2json('<script>"</script>"<p>x</p>'),
    document(element("script", [text('"')]), text('"'), element("p", [text("x")])),
  );
  assert.deepEqual(
    html2json('<style>x</style data-x="a > b"><p>after</p>'),
    document(element("style", [text("x")]), element("p", [text("after")])),
  );
  assert.deepEqual(
    html2json("<textarea>a</textareax>b</textarea/>c"),
    document(element("textarea", [text("a</textareax>b")]), text("c")),
  );
  assert.deepEqual(
    html2json("<script><!--<script>x-->y</script>after"),
    document(element("script", [text("<!--<script>x-->y")]), text("after")),
  );
});

test("legacy text elements and plaintext do not parse apparent child tags", () => {
  for (const name of ["xmp", "iframe", "noembed", "noframes"]) {
    assert.deepEqual(
      html2json(`<${name}><b>&amp;</b></${name}>`),
      document(element(name, [text("<b>&amp;</b>")])),
    );
  }
  assert.deepEqual(
    html2json("<plaintext>x</plaintext><b>y"),
    document(element("plaintext", [text("x</plaintext><b>y")])),
  );
});

test("list and definition items close implicitly within their own list", () => {
  assert.deepEqual(
    html2json("<ul><li>a<ul><li>b<li>c</ul><li>d</ul>"),
    document(
      element("ul", [
        element("li", [
          text("a"),
          element("ul", [element("li", [text("b")]), element("li", [text("c")])]),
        ]),
        element("li", [text("d")]),
      ]),
    ),
  );
  assert.deepEqual(
    html2json("<dl><dt>a<dd>b<dt>c<dd>d</dl>"),
    document(
      element("dl", [
        element("dt", [text("a")]),
        element("dd", [text("b")]),
        element("dt", [text("c")]),
        element("dd", [text("d")]),
      ]),
    ),
  );
});

test("paragraphs, headings and head close on appropriate opening tags", () => {
  assert.deepEqual(
    html2json("<p>a<em>b<div>c</div><p>d<p>e"),
    document(
      element("p", [text("a"), element("em", [text("b")])]),
      element("div", [text("c")]),
      element("p", [text("d")]),
      element("p", [text("e")]),
    ),
  );
  assert.deepEqual(
    html2json("<h1>a<h2>b"),
    document(element("h1", [text("a")]), element("h2", [text("b")])),
  );
  const html = html2json("<html><head><title>x</title><body>y</html>").children[0];
  assert.deepEqual(
    elements(html).map((node) => node.tagName),
    ["head", "body"],
  );
  assert.deepEqual(
    html2json("<head><title>x</title><p>body"),
    document(element("head", [element("title", [text("x")])]), element("p", [text("body")])),
  );
});

test("optional-end recovery respects table, list, button and template scopes", () => {
  const scoped = html2json("<p>outer<table><tr><td><p>inner<div>x</div></table>");
  assert.equal(scoped.children[0].tagName, "p");
  assert.equal(scoped.children[1].tagName, "table");
  assert.deepEqual(
    html2json("<p>a<button><div>b</div></button>c</p>"),
    document(
      element("p", [text("a"), element("button", [element("div", [text("b")])]), text("c")]),
    ),
  );
  assert.deepEqual(
    html2json("<ul><li>a<template><li>b</template>c</ul>"),
    document(
      element("ul", [
        element("li", [text("a"), element("template", [element("li", [text("b")])]), text("c")]),
      ]),
    ),
  );
});

test("options, table sections, rows and cells close implicitly", () => {
  const roots = elements(html2json(fixture("omitted-end-tags")));
  const select = roots.find((node) => node.tagName === "select");
  assert.deepEqual(
    select,
    element("select", [
      element("optgroup", [element("option", [text("one")]), element("option", [text("two")])], {
        label: "A",
      }),
      element("optgroup", [element("option", [text("three")])], { label: "B" }),
    ]),
  );
  const table = roots.find((node) => node.tagName === "table");
  assert.deepEqual(
    table,
    element("table", [
      element("thead", [element("tr", [element("th", [text("A")]), element("th", [text("B")])])]),
      element("tbody", [
        element("tr", [element("td", [text("1")]), element("td", [text("2")])]),
        element("tr", [element("td", [text("3")]), element("td", [text("4")])]),
      ]),
    ]),
  );
  const ruby = roots.find((node) => node.tagName === "ruby");
  assert.deepEqual(ruby.children, [
    text("字"),
    element("rt", [text("ji")]),
    element("rp", [text("(")]),
    element("rt", [text("zi")]),
  ]);
  assert.deepEqual(
    html2json("<table><colgroup><col><tr><td>x</table>"),
    document(
      element("table", [
        element("colgroup", [element("col")]),
        element("tr", [element("td", [text("x")])]),
      ]),
    ),
  );
});

test("mismatched endings close intervening elements and unmatched endings are ignored", () => {
  assert.deepEqual(
    html2json(fixture("mismatched-end-tags")),
    document(
      element("div", [
        text("start"),
        element("b", [text("bold"), element("i", [text("italic")])]),
        text("tail"),
      ]),
      element("span", [text("last")]),
      text("after\n"),
    ),
  );
  assert.deepEqual(html2json("a</unknown>b"), document(text("ab")));
});

test("unfinished input is retained without throwing", () => {
  for (const suffix of ["<div", "<div ", '<div a="unfinished', "<div a=", "</div", "</div a='"]) {
    assert.deepEqual(
      html2json("<section>before" + suffix),
      document(element("section", [text("before" + suffix)])),
    );
  }
  assert.deepEqual(html2json("<!--unfinished"), document({ type: "comment", value: "unfinished" }));
  assert.deepEqual(html2json("<!DOCTYPE html"), document({ type: "doctype", value: "html" }));
  assert.deepEqual(
    html2json("<?unfinished"),
    document({ type: "declaration", value: "?unfinished" }),
  );
  assert.deepEqual(
    html2json("<script>x</script"),
    document(element("script", [text("x</script")])),
  );
  assert.deepEqual(
    html2json("<svg><![CDATA[x"),
    document(element("svg", [{ type: "cdata", value: "x" }])),
  );
});

test("SVG and MathML integration points handle HTML children and CDATA", () => {
  const [svg, math] = elements(html2json(fixture("foreign-content")));
  assert.deepEqual(
    svg.children[0],
    element("g", [{ type: "cdata", value: "a < b && <tag>" }, element("path")]),
  );
  assert.deepEqual(
    svg.children[1],
    element("foreignobject", [element("div", [text("HTML child")])]),
  );
  assert.deepEqual(svg.children[2], element("title", [element("b", [text("SVG title child")])]));
  assert.deepEqual(
    math.children[0],
    element("mtext", [element("span", [text("HTML text")]), element("mglyph")]),
  );
  assert.deepEqual(math.children[1].children, [element("p", [text("annotation")])]);
  assert.deepEqual(
    html2json("<![CDATA[<b>text</b>]]>"),
    document({ type: "declaration", value: "![CDATA[<b>text</b>]]" }),
  );
});

test("long text and many siblings retain their full size and order", () => {
  const longSource = fixture("long-text");
  const paragraph = html2json(longSource).children[0];
  assert.equal(paragraph.children.length, 1);
  assert.equal(paragraph.children[0].value, "0123456789 Привіт 世界 🌍 &amp; ".repeat(10000));
  const siblings = html2json(fixture("many-siblings")).children[0].children;
  assert.equal(siblings.length, 10000);
  for (let index = 0; index < siblings.length; index++) {
    assert.equal(siblings[index].attributes["data-i"], String(index));
    assert.deepEqual(siblings[index].children, [text(String(index))]);
  }
});

test("20,000 levels of nesting parse and serialize without recursion", () => {
  const result = html2json(fixture("deep-nesting"));
  let node = result;
  for (let depth = 0; depth < 20000; depth++) {
    assert.equal(node.children.length, 1);
    node = node.children[0];
    assert.equal(node.tagName, "div");
  }
  assert.deepEqual(node.children, [text("bottom")]);
  const restored = JSON.parse(stringifyHtmlJson(result));
  validateTree(restored);
  assert.ok(stringifyHtmlJson(result).length < 15000000);
});

test("adversarial names, missing end tags and repeated less-than signs make progress", () => {
  const count = 20000;
  const unmatched = html2json("<div>".repeat(count) + "</missing>".repeat(count));
  validateTree(unmatched);
  const omitted = html2json("<p>x".repeat(count));
  assert.equal(omitted.children.length, count);
  const source = "< ".repeat(100000);
  assert.deepEqual(html2json(source), document(text(source)));
  assert.equal(html2json("<" + "x".repeat(200000) + ">ok").children[0].children[0].value, "ok");
});

test("deterministic malformed-input fuzzing produces serializable trees", () => {
  let seed = 0x12345678;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
  const tokens = [
    "<",
    ">",
    "'",
    '"',
    "/",
    "=",
    " ",
    "\n",
    "\0",
    "\ud800",
    "İ",
    "🌍",
    "&amp;",
    "a",
    "<!--",
    "-->",
    "<!DOCTYPE",
    "<![CDATA[",
    "]]>",
    "<p>",
    "</p>",
    "<div/>",
    "<script>",
    "</script>",
    "<svg>",
    "</svg>",
    "<math>",
    "<mi>",
    "</mi>",
  ];
  for (let sample = 0; sample < 1500; sample++) {
    const count = random() % 150;
    let source = "";
    for (let index = 0; index < count; index++) source += tokens[random() % tokens.length];
    const result = html2json(source);
    validateTree(result);
    assert.deepEqual(JSON.parse(stringifyHtmlJson(result)), result);
    assert.deepEqual(html2json(source), result);
  }
});

test("the existing browser entry points work without loading a DOM parser", () => {
  const fields = { html: { value: "" }, json: { textContent: "" } };
  const context = vm.createContext({ document: { getElementById: (id) => fields[id] } });
  const source = fs.readFileSync(path.join(__dirname, "..", "html2json.js"), "utf8");
  vm.runInContext(source, context);
  for (const example of ["showExample1()", "showExample2()"]) {
    vm.runInContext(example, context);
    const html = fields.html.value;
    assert.deepEqual(JSON.parse(fields.json.textContent), html2json(html));
  }
  fields.html.value = fixture("deep-nesting");
  vm.runInContext("convertHtml2JsonAndSet()", context);
  validateTree(JSON.parse(fields.json.textContent));
});
