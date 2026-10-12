# Session orientation cost: how much context does an agent session in a
# repository build before its first edit to a repository file? This is the
# rediscovery cost a durable knowledge substrate should remove. Reads the Claude
# Code transcripts of one project (default ~/.claude/projects/-home-emsenn-info).
import json, glob, os, statistics, sys
root = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else '~/.claude/projects/-home-emsenn-info')
EDIT = {'Edit', 'Write', 'NotebookEdit', 'MultiEdit'}
rows = []
for f in glob.glob(root + '/*.jsonl'):
    ctx_at_edit = None; calls = 0; reads = 0; last_ctx = 0; peak = 0; out_tokens = 0
    try:
        for line in open(f):
            try: o = json.loads(line)
            except Exception: continue
            if o.get('type') != 'assistant': continue
            m = o.get('message') or {}
            u = m.get('usage') or {}
            ctx = (u.get('input_tokens') or 0) + (u.get('cache_read_input_tokens') or 0) + (u.get('cache_creation_input_tokens') or 0)
            if ctx: last_ctx = ctx; peak = max(peak, ctx)
            out_tokens += u.get('output_tokens') or 0
            for c in m.get('content') or []:
                if not isinstance(c, dict) or c.get('type') != 'tool_use': continue
                calls += 1
                name = c.get('name'); inp = c.get('input') or {}
                if name in ('Read', 'Grep', 'Glob') or (name == 'Bash' and any(k in str(inp.get('command', ''))[:200] for k in ('grep', 'find ', 'cat ', 'ls', 'sed -n', 'head', 'git log', 'git show'))): reads += 1
                if ctx_at_edit is None and name in EDIT and not str(inp.get('file_path', '')).startswith('/tmp'):
                    ctx_at_edit = (last_ctx, calls, reads)
    except Exception as e:
        continue
    if calls: rows.append((os.path.basename(f), ctx_at_edit, calls, peak, out_tokens))
edited = [r for r in rows if r[1]]
print(f'sessions with tool use: {len(rows)}; sessions that ever edited a repo file: {len(edited)}')
if edited:
    ctxs = [r[1][0] for r in edited]; calls = [r[1][1] for r in edited]; reads = [r[1][2] for r in edited]
    print(f'context at first repo edit: median {statistics.median(ctxs):,.0f} tokens, mean {statistics.mean(ctxs):,.0f}, p90 {sorted(ctxs)[int(.9*len(ctxs))]:,.0f}')
    print(f'tool calls before first edit: median {statistics.median(calls)}, of which read/search: median {statistics.median(reads)}')
peaks = [r[3] for r in rows]
print(f'peak context per session: median {statistics.median(peaks):,.0f}, total output tokens all sessions: {sum(r[4] for r in rows):,}')
