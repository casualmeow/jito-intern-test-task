# Jito's Software Development Intern "html2json" Test Task

## Implementation

`html2json(htmlText)` synchronously returns a JSON-compatible source tree. It has no
runtime dependencies and does not use a DOM parser, execute scripts, or fetch resources.
Open the unchanged `index.html` to use the existing interface, or use CommonJS:

```js
const { html2json, stringifyHtmlJson } = require("./html2json.js");

const tree = html2json('<p class="intro">Hello <b>world</b>!</p>');
console.log(stringifyHtmlJson(tree));
```

The returned object has this shape:

```json
{
  "type": "document",
  "children": [
    {
      "type": "element",
      "tagName": "p",
      "attributes": { "class": "intro" },
      "children": [
        { "type": "text", "value": "Hello " },
        {
          "type": "element",
          "tagName": "b",
          "attributes": {},
          "children": [{ "type": "text", "value": "world" }]
        },
        { "type": "text", "value": "!" }
      ]
    }
  ]
}
```

The document wrapper gives empty input, plain text, and multiple roots the same
return type. Ordered child arrays retain repeated tags and mixed text. Elements
always have `attributes` and `children`, including when those are empty. Text,
comments, doctypes, declarations, and foreign CDATA use `{ type, value }` nodes.
Doctype values omit `<!DOCTYPE`, `>`, and surrounding whitespace. Other declaration
values retain everything between `<` and `>`; for example, `<?target?>` becomes
`{ "type": "declaration", "value": "?target?" }`.

### Parsing rules

- Text and attribute values preserve entity references literally, including
  `&amp;`, numeric references, and unknown names. Text whitespace, line endings,
  Unicode, and the initial newline in `pre` or `textarea` are preserved.
- Only ASCII letters in tag and attribute names are lowercased. Attributes support
  single quotes, double quotes, unquoted values, and empty/boolean values (`""`).
  The first duplicate wins. Names such as `__proto__` are ordinary own properties.
- HTML void elements (including legacy `param`) cannot have children. A trailing
  slash does not close a normal HTML element: `<div/>text` contains `text` inside
  `div`. A slash attached to an unquoted value is part of that value.
- SVG and MathML support self-closing elements, CDATA, and common HTML integration
  points. Their names are also ASCII-lowercased, without DOM namespace metadata.
- `script`, `style`, `textarea`, and `title` consume literal text through a matching,
  case-insensitive end tag. Script comment escape states are handled. Legacy
  `xmp`, `iframe`, `noembed`, and `noframes` also use text mode; `plaintext` consumes
  the remaining input. `noscript` contents are parsed as markup.
- Common omitted endings are recovered for paragraphs, list items, definition
  items, headings, options, option groups, table sections/rows/cells, column groups,
  head, and ruby annotations. Recovery respects relevant container boundaries.
- A matching end tag closes its open element and intervening descendants.
  Unmatched end tags are ignored. Open elements remain in the tree at EOF.
- Incomplete start/end tags are preserved as text. Unterminated comments,
  declarations, CDATA, and raw text consume the remaining input as their content.
  Unsupported non-string arguments return an empty document without coercion.

This is a source parser with defined recovery rules, not a complete WHATWG browser
tree builder or a byte-for-byte round-trip format. It does not insert implied
`html`, `head`, `body`, or `tbody` elements, move text out of tables, reconstruct
misnested formatting elements, or implement every foreign-content recovery rule.
Entities are intentionally not decoded. The syntax rules were checked against
the [HTML syntax specification](https://html.spec.whatwg.org/multipage/syntax.html)
and [tokenization specification](https://html.spec.whatwg.org/multipage/parsing.html#tokenization).

Scanning and tree construction use explicit stacks and indexed open tags. No
recursive traversal is used. `stringifyHtmlJson(tree)` likewise formats parser
output iteratively, capping indentation at 24 spaces to keep deep output manageable.
Use this helper for very deep trees: native `JSON.stringify` has an engine-dependent
recursion limit. Parsing and output size remain subject to available memory.

### Tests and samples

Run with Node.js 18 or newer; no installation step is required:

```sh
node --test html_samples/html2json.test.js
```

`html_samples/` contains empty/plain/mixed inputs, repeated tags and Unicode,
attributes, void elements and slashes, comments/declarations, raw text, omitted
and mismatched endings, unfinished input, and foreign content. The large samples
include 10,000 repetitions of Unicode text, 10,000 siblings, and 20,000 nested
elements. Tests check expected trees, every sample's JSON round trip, 1,500
deterministic malformed inputs, adversarial input, and the existing page callbacks.
The callbacks are tested in a DOM-free VM with stubbed input/output fields.

`index.html` and `ai_help/` are unchanged.

## Task Rationale
This task is designed to evaluate how well you solve problems without having every detail explicitly provided and to assess the quality of your deliverables. This type of task isn't necessarily reflective of your future work but aims to help us understand your thought process and reasoning in the context of software development.

## Assignment
Your task is to implement a function called `html2json`, which converts HTML data into a JSON representation.
AI tools usage is <b>REQUIRED</b>. Is is required that you provide your entire conversation history by attaching a link to the dialogue. Therefore, keep all your research within a single conversation and submit the link along with your task.

## Expected repository structure
- `html2json.js` - This file should contain your implementation of the html2json function.
- `html_samples/` folder - Include files with a text that you used as samples to test your function.
- `index.html` - The initial file we provided. You can leave it unchanged, but please include it in the archive.
- `ai_help/` folder - If you used any resources for code generation:
- Create a file named `chatgpt_chat.txt` with a link to the ChatGPT chat used.
- For any other AI resources, attach relevant `.pdf`, `.png`, or `.mp4` files showing how you used them.
- You can optionally update `README.md` completely if you want to add explanations of your reasoning or any other comments.

## Key Points for Evaluation
- Coverage of various HTML structures and different sizes.
- The code <b>MUST NOT</b> crash.
- Code cleanliness and formatting.
- Using a DOM parser is not allowed.
- How effectively you handled unexpected scenarios, such as situations where your code received valid HTML but still crashed or produced incorrect results. We will evaluate your ability to anticipate edge cases and ensure robustness in your solution.

## P.S. from the team
Please focus on quality rather than speed. Quality in this context means ensuring your solution is well thought-out, robust, and free of obvious issues. The speed of delivery will <b>NOT</b> be prioritized, so take the necessary time to research and refine your approach, as long as you complete the task within the specified timeframe.
Before submitting your final results, double or even triple-check everything:
- Verify that all links you provide are accessible in incognito mode, as broken links will result in your submission <b>NOT</b> being reviewed.
- Just before submitting, test your code again to ensure it still functions correctly and handles the html samples without crashing. If your code crashes or fails on your own samples, it will be treated as a failed submission.
- Make sure all items are included according to the [Expected Deliverables](#expected-deliverables) section. If any required files or information are missing, we will <b>NOT</b> be able to review your task, and it will be <ins>treated as failed</ins>.
- Jito’s senior developer will thoroughly review your solution. Based on this review, if deemed appropriate, you may be invited for a technical code review. This will include questions about the code, your understanding, and the reasoning behind your solution choices.
- The best indicator that you’ve done your best is the feeling of confidence when submitting, knowing that you have thoroughly checked your work and cannot think of anything more to improve.
- You can view test task template [here](https://jito-dev.github.io/jito-intern-test-task/)
