// main.ts (The Simple, Stable, Single-File Editor)
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const kv = await Deno.openKv();
const ADMIN_TOKEN = Deno.env.get("ADMIN_TOKEN") || "your-secret-admin-token";
const SCRIPT_KEY = ["scripts", "main.ts"]; // We will manage only one script for stability

console.log("Simple & Stable Code Hosting Service is starting...");

async function handler(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const { pathname, searchParams } = url;
    const method = req.method;

    // Raw endpoint for the single script
    if (pathname === "/raw") {
        const result = await kv.get<string>(SCRIPT_KEY);
        if (!result.value) return new Response("// No script saved yet.", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
        return new Response(result.value, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }

    // Admin login and editor page
    if (pathname === "/") {
        if (searchParams.get("token") !== ADMIN_TOKEN) {
            return new Response(getLoginPageHTML(), { headers: { "Content-Type": "text/html; charset=utf-8" } });
        }
        
        const scriptResult = await kv.get<string>(SCRIPT_KEY);
        const currentCode = scriptResult.value || `// Start writing your script here!\nconsole.log("Hello, Deno!");`;
        
        return new Response(getEditorPageHTML(currentCode, ADMIN_TOKEN, url.origin), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    // Handle saving the code
    if (pathname === "/save" && method === "POST") {
        const formData = await req.formData();
        if (formData.get("token") !== ADMIN_TOKEN) return new Response("Forbidden", { status: 403 });
        
        const code = formData.get("code") as string;
        await kv.set(SCRIPT_KEY, code);

        return Response.redirect(`/?token=${ADMIN_TOKEN}&status=saved`, 302);
    }
    
    return new Response("Not Found", { status: 404 });
}

serve(handler);

// --- HTML TEMPLATE FUNCTIONS ---

function getLoginPageHTML(): string {
    return `<!DOCTYPE html><html><head><title>Login</title><style>body{display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#1a1a2e;font-family:sans-serif;} .login-box{background:#162447;padding:2rem;border-radius:8px;} h1{color:#e43f5a;} form{display:flex;flex-direction:column;gap:1rem;} input,button{width:100%;padding:0.8rem;border-radius:5px;} button{background:#e43f5a;color:white;border:none;cursor:pointer;}</style></head>
    <body><div class="login-box"><h1>Login to Code Editor</h1><form><input type="password" name="token" placeholder="Enter Admin Token" required><button type="submit">Enter</button></form></div></body></html>`;
}

function getEditorPageHTML(code: string, token: string, origin: string): string {
    const rawLink = `${origin}/raw`;
    return `
    <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Deno Script Editor</title>
    <style>
        body { margin: 0; font-family: monospace; background: #1e1e1e; color: #d4d4d4; }
        .container { display: flex; flex-direction: column; height: 100vh; }
        .header { padding: 1rem; background: #252526; border-bottom: 1px solid #333; }
        .header h1 { margin: 0 0 0.5rem 0; font-size: 1.2rem; }
        .raw-link input { width: 100%; box-sizing: border-box; background: #333; color: #eee; border: 1px solid #444; padding: 0.5rem; border-radius: 4px;}
        form { flex-grow: 1; display: flex; flex-direction: column; }
        textarea { flex-grow: 1; width: 100%; border: none; background: #1e1e1e; color: #d4d4d4; padding: 1rem; font-family: monospace; font-size: 16px; line-height: 1.5; resize: none; outline: none; }
        .footer { padding: 0.5rem 1rem; background: #007acc; text-align: right; }
        .footer button { background: transparent; color: white; border: none; padding: 0.8rem 1.5rem; cursor: pointer; font-size: 1rem; font-weight: bold; }
        .notification { padding:1rem; text-align:center; background: #28a745; color:white; display: none; position: fixed; top: 0; left: 0; width: 100%; z-index: 2000; }
    </style>
    </head><body>
        <div id="notification"></div>
        <div class="container">
            <div class="header">
                <h1>Script Editor</h1>
                <div class="raw-link"><input type="text" value="${rawLink}" readonly onclick="this.select()"></div>
            </div>
            <form id="editor-form" method="POST" action="/save">
                <input type="hidden" name="token" value="${token}">
                <textarea name="code" spellcheck="false" autocapitalize="off">${code}</textarea>
                <div class="footer"><button type="submit">Save Script</button></div>
            </form>
        </div>
        <script>
            if (new URLSearchParams(window.location.search).get('status') === 'saved') {
                const notif = document.getElementById('notification');
                notif.textContent = 'Script saved successfully!';
                notif.style.display = 'block';
                setTimeout(() => { notif.style.display = 'none'; history.replaceState(null, '', window.location.pathname + '?token=${token}'); }, 3000);
            }
        </script>
    </body></html>`;
}
