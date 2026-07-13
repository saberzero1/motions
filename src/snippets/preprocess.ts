import type { PreprocessContext } from './types';
import { resolveVariables } from './variables';

export function preprocessSnippetBody(
    body: string | string[],
    ctx: PreprocessContext,
): string {
    let template = Array.isArray(body) ? body.join('\n') : body;
    template = resolveVariables(template, ctx);
    return template;
}
