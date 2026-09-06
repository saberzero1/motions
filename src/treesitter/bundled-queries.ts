// Node names are checked against the shipped WASM grammars in unit tests.
// Markdown's block grammar does not contain inline_link or link_text.
export const MARKDOWN_TEXTOBJECTS = `
(section) @class.outer
(atx_heading (inline) @function.inner) @function.outer
(setext_heading (paragraph) @function.inner) @function.outer
(fenced_code_block (code_fence_content) @block.inner) @block.outer
(indented_code_block) @block.outer
(block_quote) @block.outer
(list_item (paragraph) @parameter.inner) @parameter.outer
(pipe_table) @class.outer
(pipe_table_row) @parameter.outer
(pipe_table_cell) @parameter.inner
(link_reference_definition (link_destination) @parameter.inner) @parameter.outer
`;

export const MARKDOWN_INLINE_TEXTOBJECTS = `
(inline_link (link_text) @parameter.inner) @parameter.outer
(full_reference_link (link_text) @parameter.inner) @parameter.outer
(collapsed_reference_link (link_text) @parameter.inner) @parameter.outer
(code_span) @block.outer
`;

export const HTML_TEXTOBJECTS = `
(element) @class.outer
(element (text) @class.inner)
(attribute) @parameter.outer
(attribute (quoted_attribute_value (attribute_value) @parameter.inner))
(script_element (raw_text) @block.inner) @block.outer
(style_element (raw_text) @block.inner) @block.outer
`;

export const BUNDLED_TEXTOBJECTS: ReadonlyMap<string, string> = new Map([
    ['markdown', MARKDOWN_TEXTOBJECTS],
    ['markdown_inline', MARKDOWN_INLINE_TEXTOBJECTS],
    ['html', HTML_TEXTOBJECTS],
]);
