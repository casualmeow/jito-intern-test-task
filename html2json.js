function convertHtml2JsonAndSet() {
  const htmlTextAreaValue = document.getElementById("html").value;
  const jsonObj = html2json(htmlTextAreaValue);
  const jsonArea = document.getElementById("json");
  jsonArea.textContent = stringifyHtmlJson(jsonObj);
}

function html2json(htmlText) {
  return new HtmlSourceParser(typeof htmlText === "string" ? htmlText : "").parse();
}

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

const TEXT_TAGS = new Set([
  "script",
  "style",
  "textarea",
  "title",
  "xmp",
  "iframe",
  "noembed",
  "noframes",
]);

const PARAGRAPH_END_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "center",
  "dd",
  "details",
  "dialog",
  "dir",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hgroup",
  "hr",
  "li",
  "listing",
  "main",
  "menu",
  "nav",
  "ol",
  "p",
  "plaintext",
  "pre",
  "search",
  "section",
  "summary",
  "table",
  "ul",
  "xmp",
]);

const SCOPE_TAGS = [
  "applet",
  "caption",
  "html",
  "table",
  "td",
  "th",
  "marquee",
  "object",
  "template",
  "svg",
  "math",
  "foreignobject",
  "annotation-xml",
];

const HEADINGS = ["h1", "h2", "h3", "h4", "h5", "h6"];
const TABLE_SECTIONS = ["thead", "tbody", "tfoot"];
const TABLE_CELLS = ["td", "th"];
const SVG_INTEGRATION_TAGS = new Set(["foreignobject", "desc", "title"]);
const MATH_TEXT_TAGS = new Set(["mi", "mo", "mn", "ms", "mtext"]);
const HEAD_TAGS = new Set([
  "html",
  "head",
  "base",
  "basefont",
  "bgsound",
  "link",
  "meta",
  "title",
  "noscript",
  "noframes",
  "script",
  "style",
  "template",
]);

function isHtmlSpace(character) {
  return (
    character === " " ||
    character === "\t" ||
    character === "\n" ||
    character === "\r" ||
    character === "\f"
  );
}

function isAsciiLetter(character) {
  return (character >= "a" && character <= "z") || (character >= "A" && character <= "Z");
}

function lowerAscii(value) {
  return value.replace(/[A-Z]/g, (character) => character.toLowerCase());
}

class HtmlSourceParser {
  constructor(source) {
    this.source = source;
    this.position = 0;
    this.document = { type: "document", children: [] };
    this.stack = [{ node: this.document, namespace: "html" }];
    this.openTags = new Map();
  }

  current() {
    return this.stack[this.stack.length - 1];
  }

  append(node) {
    this.current().node.children.push(node);
  }

  appendText(value) {
    if (value.length === 0) return;
    const children = this.current().node.children;
    const previous = children[children.length - 1];
    if (previous && previous.type === "text") {
      previous.value += value;
    } else {
      children.push({ type: "text", value });
    }
  }

  lastOpen(names) {
    let index = 0;
    for (const name of names) {
      const positions = this.openTags.get(name);
      if (positions && positions.length > 0) {
        index = Math.max(index, positions[positions.length - 1]);
      }
    }
    return index;
  }

  closeFrom(index) {
    if (index === 0) return;
    while (this.stack.length > index) {
      const { node } = this.stack.pop();
      const positions = this.openTags.get(node.tagName);
      positions.pop();
      if (positions.length === 0) this.openTags.delete(node.tagName);
    }
  }

  closeOptional(names, boundaries) {
    const index = this.lastOpen(names);
    if (index > this.lastOpen(boundaries)) this.closeFrom(index);
  }

  closeImplied(tagName) {
    if (!HEAD_TAGS.has(tagName)) {
      this.closeOptional(["head"], ["html", "template"]);
    }
    if (tagName !== "col" && tagName !== "template") {
      this.closeOptional(["colgroup"], ["table", "template"]);
    }
    if (PARAGRAPH_END_TAGS.has(tagName)) {
      this.closeOptional(["p"], [...SCOPE_TAGS, "button"]);
    }
    if (tagName === "li") {
      this.closeOptional(["li"], [...SCOPE_TAGS, "ol", "ul", "menu"]);
    } else if (tagName === "dt" || tagName === "dd") {
      this.closeOptional(["dt", "dd"], [...SCOPE_TAGS, "dl"]);
    } else if (tagName === "option" || tagName === "optgroup") {
      this.closeOptional(["option"], ["select", "datalist", "template"]);
      if (tagName === "optgroup") {
        this.closeOptional(["optgroup"], ["select", "datalist", "template"]);
      }
    } else if (TABLE_CELLS.includes(tagName)) {
      this.closeOptional(TABLE_CELLS, ["table", "tr", "template"]);
    } else if (tagName === "tr") {
      this.closeOptional(["tr"], ["table", ...TABLE_SECTIONS, "template"]);
    } else if (TABLE_SECTIONS.includes(tagName)) {
      this.closeOptional([...TABLE_SECTIONS, "tr", "colgroup", "caption"], ["table", "template"]);
      this.closeOptional(TABLE_SECTIONS, ["table", "template"]);
    } else if (tagName === "rt" || tagName === "rp") {
      this.closeOptional(["rt", "rp"], ["ruby", "template"]);
    } else if (HEADINGS.includes(tagName)) {
      this.closeOptional(HEADINGS, SCOPE_TAGS);
    }
  }

  namespaceFor(tagName) {
    const { node, namespace } = this.current();
    let inherited = namespace;
    if (namespace === "svg" && SVG_INTEGRATION_TAGS.has(node.tagName)) {
      inherited = "html";
    } else if (namespace === "math") {
      const encoding = lowerAscii(node.attributes.encoding || "");
      if (
        node.tagName === "annotation-xml" &&
        (encoding === "text/html" || encoding === "application/xhtml+xml")
      ) {
        inherited = "html";
      } else if (
        MATH_TEXT_TAGS.has(node.tagName) &&
        tagName !== "mglyph" &&
        tagName !== "malignmark"
      ) {
        inherited = "html";
      }
      if (node.tagName === "annotation-xml" && tagName === "svg") return "svg";
    }
    if (inherited === "html" && (tagName === "svg" || tagName === "math")) {
      return tagName;
    }
    return inherited;
  }

  readTag(start, closing) {
    const source = this.source;
    let cursor = start + (closing ? 2 : 1);
    const nameStart = cursor;
    while (
      cursor < source.length &&
      !isHtmlSpace(source[cursor]) &&
      source[cursor] !== "/" &&
      source[cursor] !== ">"
    )
      cursor++;
    const tagName = lowerAscii(source.slice(nameStart, cursor));
    const attributes = {};
    let selfClosing = false;

    while (cursor < source.length) {
      while (isHtmlSpace(source[cursor])) cursor++;
      if (source[cursor] === ">") {
        return { tagName, attributes, selfClosing, end: cursor + 1 };
      }
      if (source[cursor] === "/") {
        cursor++;
        if (source[cursor] === ">") selfClosing = true;
        continue;
      }
      if (cursor === source.length) break;

      const attributeStart = cursor;
      if (source[cursor] === "=") cursor++;
      while (
        cursor < source.length &&
        !isHtmlSpace(source[cursor]) &&
        source[cursor] !== "=" &&
        source[cursor] !== "/" &&
        source[cursor] !== ">"
      )
        cursor++;
      const name = lowerAscii(source.slice(attributeStart, cursor));
      while (isHtmlSpace(source[cursor])) cursor++;
      let value = "";

      if (source[cursor] === "=") {
        cursor++;
        while (isHtmlSpace(source[cursor])) cursor++;
        const quote = source[cursor];
        if (quote === '"' || quote === "'") {
          const valueStart = ++cursor;
          const valueEnd = source.indexOf(quote, cursor);
          if (valueEnd === -1) return null;
          value = source.slice(valueStart, valueEnd);
          cursor = valueEnd + 1;
        } else {
          const valueStart = cursor;
          while (cursor < source.length && !isHtmlSpace(source[cursor]) && source[cursor] !== ">")
            cursor++;
          value = source.slice(valueStart, cursor);
        }
      }

      if (!closing && !Object.hasOwn(attributes, name)) {
        Object.defineProperty(attributes, name, {
          value,
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
    }
    return null;
  }

  readComment() {
    const start = this.position + 4;
    const ending = /--!?>/g;
    ending.lastIndex = start;
    let end;
    let next;
    if (this.source[start] === ">" || this.source.startsWith("->", start)) {
      end = start;
      next = start + (this.source[start] === ">" ? 1 : 2);
    } else {
      const match = ending.exec(this.source);
      end = match ? match.index : this.source.length;
      next = match ? ending.lastIndex : end;
    }
    this.append({ type: "comment", value: this.source.slice(start, end) });
    this.position = next;
  }

  readDeclaration() {
    const start = this.position;
    let cursor = start + 2;
    let quote = "";
    let brackets = 0;
    while (cursor < this.source.length) {
      const character = this.source[cursor];
      if (quote) {
        if (character === quote) quote = "";
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === "[") {
        brackets++;
      } else if (character === "]" && brackets > 0) {
        brackets--;
      } else if (character === ">" && brackets === 0) {
        break;
      }
      cursor++;
    }
    const isDoctype =
      lowerAscii(this.source.slice(start + 2, start + 9)) === "doctype" &&
      (isHtmlSpace(this.source[start + 9]) ||
        this.source[start + 9] === ">" ||
        start + 9 === this.source.length);
    this.append({
      type: isDoctype ? "doctype" : "declaration",
      value: isDoctype
        ? this.source.slice(start + 9, cursor).trim()
        : this.source.slice(start + 1, cursor),
    });
    this.position = Math.min(cursor + 1, this.source.length);
  }

  readCdata() {
    const start = this.position + 9;
    const ending = this.source.indexOf("]]>", start);
    const end = ending === -1 ? this.source.length : ending;
    this.append({ type: "cdata", value: this.source.slice(start, end) });
    this.position = ending === -1 ? end : end + 3;
  }

  rawTextEnd(tagName) {
    const pattern =
      tagName === "script"
        ? /<!--|-->|<\/?script(?=[\t\n\f\r />])/gi
        : new RegExp(`</${tagName}(?=[\\t\\n\\f\\r />])`, "gi");
    pattern.lastIndex = this.position;
    let state = "data";
    let match;
    while ((match = pattern.exec(this.source)) !== null) {
      const token = lowerAscii(match[0]);
      if (token === "<!--" && state === "data") {
        state = "escaped";
      } else if (token === "-->") {
        state = "data";
      } else if (token === "<script" && state === "escaped") {
        state = "double-escaped";
      } else if (token.startsWith("</")) {
        if (state === "double-escaped") {
          state = "escaped";
        } else {
          const tag = this.readTag(match.index, true);
          return tag ? { start: match.index, end: tag.end } : null;
        }
      }
    }
    return null;
  }

  readTextElement(tagName) {
    const ending = tagName === "plaintext" ? null : this.rawTextEnd(tagName);
    this.appendText(this.source.slice(this.position, ending ? ending.start : this.source.length));
    this.position = ending ? ending.end : this.source.length;
    if (ending) this.closeFrom(this.stack.length - 1);
  }

  open(tag) {
    const namespace = this.namespaceFor(tag.tagName);
    if (namespace === "html") this.closeImplied(tag.tagName);
    const node = {
      type: "element",
      tagName: tag.tagName,
      attributes: tag.attributes,
      children: [],
    };
    this.append(node);
    if (namespace === "html" ? VOID_TAGS.has(tag.tagName) : tag.selfClosing) return;
    const positions = this.openTags.get(tag.tagName) || [];
    positions.push(this.stack.length);
    this.openTags.set(tag.tagName, positions);
    this.stack.push({ node, namespace });
  }

  parse() {
    while (this.position < this.source.length) {
      const { node, namespace } = this.current();
      if (namespace === "html" && (TEXT_TAGS.has(node.tagName) || node.tagName === "plaintext")) {
        this.readTextElement(node.tagName);
        continue;
      }
      if (this.source[this.position] !== "<") {
        const next = this.source.indexOf("<", this.position);
        const end = next === -1 ? this.source.length : next;
        this.appendText(this.source.slice(this.position, end));
        this.position = end;
        continue;
      }
      if (this.source.startsWith("<!--", this.position)) {
        this.readComment();
        continue;
      }
      if (namespace !== "html" && this.source.startsWith("<![CDATA[", this.position)) {
        this.readCdata();
        continue;
      }
      const next = this.source[this.position + 1];
      if (next === "!" || next === "?") {
        this.readDeclaration();
        continue;
      }
      const closing = next === "/";
      const nameStart = this.position + (closing ? 2 : 1);
      if (!isAsciiLetter(this.source[nameStart])) {
        this.appendText("<");
        this.position++;
        continue;
      }
      const tag = this.readTag(this.position, closing);
      if (!tag) {
        this.appendText(this.source.slice(this.position));
        break;
      }
      this.position = tag.end;
      if (closing) {
        this.closeFrom(this.lastOpen([tag.tagName]));
      } else {
        this.open(tag);
      }
    }
    return this.document;
  }
}

function stringifyHtmlJson(value) {
  const output = [];
  const pending = [{ value, depth: 0 }];
  const indent = (depth) => "  ".repeat(Math.min(depth, 12));

  while (pending.length > 0) {
    const item = pending.pop();
    if (Object.hasOwn(item, "text")) {
      output.push(item.text);
      continue;
    }
    const { value: current, depth } = item;
    if (current === null || typeof current !== "object") {
      output.push(JSON.stringify(current));
      continue;
    }
    const isArray = Array.isArray(current);
    const keys = Object.keys(current);
    const opening = isArray ? "[" : "{";
    const closing = isArray ? "]" : "}";
    if (keys.length === 0) {
      output.push(opening + closing);
      continue;
    }
    output.push(opening + "\n");
    pending.push({ text: "\n" + indent(depth) + closing });
    for (let index = keys.length - 1; index >= 0; index--) {
      const key = keys[index];
      if (index < keys.length - 1) pending.push({ text: ",\n" });
      pending.push({ value: current[key], depth: depth + 1 });
      pending.push({
        text: indent(depth + 1) + (isArray ? "" : JSON.stringify(key) + ": "),
      });
    }
  }
  return output.join("");
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { html2json, stringifyHtmlJson };
}

function showExample1() {
  const htmlExample = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport">
    <title>Sample HTML</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <header>
        <h1>Welcome to My Website</h1>
    </header>
    <nav>
        <ul>
            <li><a href="#home">Home</a></li>
            <li><a href="#about">About</a></li>
            <li><a href="#contact">Contact</a></li>
        </ul>
    </nav>
    <main>
        <section id="home">
            <h2>Home Section</h2>
            <p>This is the home section of the webpage.</p>
        </section>
        <section id="about">
            <h2>About Section</h2>
            <p>This is the about section of the webpage.</p>
        </section>
    </main>
    <footer>
        <p>&copy; 2024 My Website</p>
    </footer>
    <script src="script.js"></script>
</body>
</html>
`;
  document.getElementById("html").value = htmlExample;
  convertHtml2JsonAndSet();
}

function showExample2() {
  const htmlExample = `<div>
<p>Hello world!</p>
  <button>Click me!</button>
  <textarea>Some very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very long string.</textarea>
</div>
`;
  document.getElementById("html").value = htmlExample;
  convertHtml2JsonAndSet();
}
