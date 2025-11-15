// main.ts (Final Form Submission Fix)
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const kv = await Deno.openKv();
const ADMIN_TOKEN = Deno.env.get("ADMIN_TOKEN") || "your-secret-admin-token";
const CHUNK_SIZE = 64000;

console.log("Code Hosting Service (Form Fix) is starting...");

async function handler(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const { pathname, searchParams } = url;
    const method = req.method;

    const rawPattern = new URLPattern({ pathname: "/raw/:filename" });
    if (rawPattern.exec(url)) {
        const filename = rawPattern.exec(url)!.pathname.groups.filename!;
        const scriptIterator = kv.list<string>({ prefix: ["scripts", filename] });
        const chunks = [];
        for await (const entry of scriptIterator) { chunks.push({ index: parseInt(entry.key.at(-1)!.toString().split('_').pop()!), value: entry.value }); }
        if (chunks.length === 0) return new Response("Script not found.", { status: 404 });
        chunks.sort((a, b) => a.index - b.index);
        const fullCode = chunks.map(c => c.value).join('');
        return new Response(fullCode, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }

    if (pathname === "/" || pathname === "/admin-login") {
         if (searchParams.get("token") === ADMIN_TOKEN) { return Response.redirect(`${url.origin}/editor?token=${ADMIN_TOKEN}`); }
         return new Response(getLoginPageHTML(), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    
    if (pathname === "/editor") {
        if (searchParams.get("token") !== ADMIN_TOKEN) return new Response("Forbidden", { status: 403 });
        const scriptIterator = kv.list({ prefix: ["scripts"] });
        const scriptNames = new Set<string>();
        for await (const entry of scriptIterator) { scriptNames.add(entry.key[1] as string); }
        let activeScript = searchParams.get("file") || "main.ts";
        if (scriptNames.size === 0) {
            await kv.set(["scripts", "main.ts", "chunk_0"], `// Welcome! This is your first script.`);
            scriptNames.add("main.ts");
        }
        if (!scriptNames.has(activeScript)) { activeScript = scriptNames.values().next().value; }
        const chunkIterator = kv.list<string>({ prefix: ["scripts", activeScript] });
        const chunks = [];
        for await (const entry of chunkIterator) { chunks.push({ index: parseInt(entry.key.at(-1)!.toString().split('_').pop()!), value: entry.value });}
        chunks.sort((a, b) => a.index - b.index);
        const currentCode = chunks.map(c => c.value).join('');
        return new Response(getEditorPageHTML(currentCode, Array.from(scriptNames), activeScript, ADMIN_TOKEN, url.origin), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    if (pathname === "/save" && method === "POST") {
        const formData = await req.formData();
        if (formData.get("token") !== ADMIN_TOKEN) return new Response("Forbidden", { status: 403 });
        const code = formData.get("code") as string;
        const filename = formData.get("filename") as string;
        const oldChunks = kv.list({ prefix: ["scripts", filename] });
        for await (const chunk of oldChunks) { await kv.delete(chunk.key); }
        if (code) {
            for (let i = 0; i * CHUNK_SIZE < code.length; i++) {
                const chunkContent = code.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
                await kv.set(["scripts", filename, `chunk_${i}`], chunkContent);
            }
        } else { await kv.set(["scripts", filename, `chunk_0`], ""); }
        return Response.redirect(`/editor?token=${ADMIN_TOKEN}&file=${filename}&status=saved`, 302);
    }
    
    if (pathname === "/create-script" && method === "POST") {
        const formData = await req.formData();
        const token = formData.get("token") as string;
        if (token !== ADMIN_TOKEN) return new Response("Forbidden", { status: 403 });
        const newFilename = (formData.get("newFilename") as string).trim();
        if (newFilename) {
            const existing = await kv.get(["scripts", newFilename, "chunk_0"]);
            if (existing.value === null) {
                await kv.set(["scripts", newFilename, `chunk_0`], `// New script created: ${newFilename}`);
            }
        }
        return Response.redirect(`/editor?token=${token}&file=${newFilename}`, 302);
    }
    
    return new Response("Not Found", { status: 404 });
}

serve(handler);

function getLoginPageHTML(): string {
    return `<!DOCTYPE html><html><head><title>Login</title><style>body{display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#1a1a2e;font-family:sans-serif;} .login-box{background:#162447;padding:2rem;border-radius:8px;} h1{color:#e43f5a;} form{display:flex;flex-direction:column;gap:1rem;} input,button{width:100%;padding:0.8rem;border-radius:5px;} button{background:#e43f5a;color:white;border:none;cursor:pointer;}</style></head>
    <body><div class="login-box"><h1>Login to Code Editor</h1><form action="/editor"><input type="password" name="token" placeholder="Enter Admin Token" required><button type="submit">Enter</button></form></div></body></html>`;
}

function getEditorPageHTML(code: string, scriptNames: string[], activeScript: string, token: string, origin: string): string {
    const rawLink = `${origin}/raw/${activeScript}`;
    const scriptListHTML = scriptNames.sort().map(name => `<li><a href="/editor?token=${token}&file=${name}" class="${name === activeScript ? 'active' : ''}">${name}</a></li>`).join('');

    return `
    <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Deno Code Editor</title>
    <style>
        body { margin: 0; font-family: sans-serif; background: #1e1e1e; }
        .layout { display: flex; height: 100vh; }
        .sidebar { width: 250px; background: #252526; border-right: 1px solid #333; display: flex; flex-direction: column; padding: 1rem; box-sizing: border-box; }
        .sidebar h2 { font-size: 1.2rem; margin: 0 0 1rem 0; color: #ccc; }
        .sidebar ul { list-style: none; padding: 0; margin: 0 0 1rem 0; overflow-y: auto; flex-grow: 1; }
        .sidebar ul a { display: block; padding: 0.5rem; text-decoration: none; color: #ccc; border-radius: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sidebar ul a.active, .sidebar ul a:hover { background: #3a3d41; color: white; }
        .new-script-form { margin-top: auto; }
        .new-script-form input { width: 100%; box-sizing: border-box; padding: 0.5rem; background: #333; border: 1px solid #444; color: #eee; border-radius: 4px; margin-bottom: 0.5rem; }
        .new-script-form button { width: 100%; padding: 0.5rem; background: #0e639c; color: white; border: none; border-radius: 4px; cursor: pointer; }
        .main-content { flex-grow: 1; display: flex; flex-direction: column; }
        .header { padding: 1rem; background: #252526; }
        .header input { width: 100%; box-sizing: border-box; background: #333; color: #eee; border: 1px solid #444; padding: 0.5rem; border-radius: 4px; }
        form#editor-form { flex-grow: 1; display: flex; flex-direction: column; }
        textarea { flex-grow: 1; border: none; background: #1e1e1e; color: #d4d4d4; padding: 1rem; font-family: monospace; font-size: 16px; resize: none; outline: none; }
        .footer { padding: 0.5rem 1rem; background: #007acc; text-align: right; }
        .footer button { background: transparent; color: white; border: none; padding: 0.8rem 1.5rem; cursor: pointer; font-size: 1rem; font-weight: bold; }
        .notification { padding:1rem; text-align:center; background: #28a745; color:white; display: none; position: fixed; top: 0; left: 0; width: 100%; z-index: 2000; }
    </style>
    </head><body>
        <div id="notification"></div>
        <div class="layout">
            <div class="sidebar">
                <h2>Scripts</h2>
                <ul>${scriptListHTML}</ul>
                <form class="new-script-form" method="POST" action="/create-script">
                    <input type="hidden" name="token" value="${token}">
                    <input type="text" name="newFilename" placeholder="new-script.ts" required>
                    <button type="submit">Create New Script</button>
                </form>
            </div>
            <div class="main-content">
                <div class="header"><input type="text" value="${rawLink}" readonly onclick="this.select()"></div>
                <form id="editor-form" method="POST" action="/save">
                    <input type="hidden" name="token" value="${token}">
                    <input type="hidden" name="filename" value="${activeScript}">
                    <textarea name="code" spellcheck="false" autocapitalize="off">${code}</textarea>
                    <div class="footer"><button type="submit">Save Changes</button></div>
                </form>
            </div>
        </div>
        <script>
            if (new URLSearchParams(window.location.search).get('status') === 'saved') {
                const notif = document.getElementById('notification');
                notif.textContent = 'Script saved successfully!';
                notif.style.display = 'block';
                setTimeout(() => { notif.style.display = 'none'; }, 3000);
            }
        </script>
    </body></html>`;
}
