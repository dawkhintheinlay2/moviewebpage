// main.ts (Deno-Powered Code Hosting Service)
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const kv = await Deno.openKv();
const ADMIN_TOKEN = Deno.env.get("ADMIN_TOKEN") || "your-secret-admin-token";

console.log("Deno Code Hosting Service is starting...");

async function handler(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const { pathname, searchParams } = url;
    const method = req.method;

    // The raw endpoint for serving the script
    const rawPattern = new URLPattern({ pathname: "/raw/:filename" });
    const rawMatch = rawPattern.exec(url);
    if (rawMatch) {
        const filename = rawMatch.pathname.groups.filename;
        const result = await kv.get<string>(["scripts", filename]);

        if (!result.value) {
            return new Response("Script not found.", { status: 404 });
        }
        // Respond with the code as plain text, with the correct content type
        return new Response(result.value, {
            headers: { "Content-Type": "application/typescript; charset=utf-8" },
        });
    }

    // Admin login page
    if (pathname === "/" || pathname === "/admin") {
         if (searchParams.get("token") !== ADMIN_TOKEN) {
            return new Response(getLoginPageHTML(), { headers: { "Content-Type": "text/html; charset=utf-8" } });
        }
        // If token is correct, show the editor page
        const scriptResult = await kv.get<string>(["scripts", "main.ts"]);
        const currentCode = scriptResult.value || `// Start writing your Deno script here!\nconsole.log("Hello from my custom script!");`;
        return new Response(getEditorPageHTML(currentCode, ADMIN_TOKEN), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    // Handle saving the code
    if (pathname === "/save" && method === "POST") {
        const formData = await req.formData();
        if (formData.get("token") !== ADMIN_TOKEN) return new Response("Forbidden", { status: 403 });
        
        const code = formData.get("code") as string;
        const filename = "main.ts"; // We can extend this later to support multiple files
        
        await kv.set(["scripts", filename], code);

        // Redirect back to the editor with a success message
        return Response.redirect(`/?token=${ADMIN_TOKEN}&status=saved`, 302);
    }
    
    return new Response("Not Found", { status: 404 });
}

serve(handler);

// --- HTML TEMPLATE FUNCTIONS ---

function getLoginPageHTML(): string {
    return `<!DOCTYPE html><html><head><title>Login</title><style>body{display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#1a1a2e;font-family:sans-serif;} .login-box{background:#162447;padding:2rem;border-radius:8px;} h1{color:#e43f5a;} input,button{width:100%;padding:0.8rem;margin-bottom:1rem;border-radius:5px;} button{background:#e43f5a;color:white;border:none;}</style></head>
    <body><div class="login-box"><h1>Login to Code Editor</h1><form><input type="password" name="token" placeholder="Enter Admin Token"><button type="submit">Enter</button></form></div></body></html>`;
}

function getEditorPageHTML(code: string, token: string): string {
    const rawLink = `${new URL(location.href).origin}/raw/main.ts`;
    return `
    <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Deno Code Editor</title>
    <style>
        body { margin: 0; font-family: monospace; background: #1e1e1e; color: #d4d4d4; }
        .container { display: flex; flex-direction: column; height: 100vh; }
        .header { padding: 1rem; background: #333; }
        .header h1 { margin: 0; font-size: 1.2rem; }
        .raw-link { margin-top: 0.5rem; }
        .raw-link input { width: 100%; background: #444; color: #eee; border: 1px solid #555; padding: 0.5rem; }
        form { flex-grow: 1; display: flex; flex-direction: column; }
        textarea {
            flex-grow: 1; width: 100%; border: none; background: #1e1e1e; color: #d4d4d4;
            padding: 1rem; font-family: monospace; font-size: 16px; line-height: 1.5; resize: none;
            outline: none;
        }
        .footer { padding: 0.5rem; background: #333; text-align: right; }
        button { background: #0e639c; color: white; border: none; padding: 0.8rem 1.5rem; cursor: pointer; }
        .notification { padding:1rem; text-align:center; background: #28a745; color: white; display: none; }
    </style>
    </head><body>
        <div class="container">
            <div id="notification"></div>
            <div class="header">
                <h1>Deno Script Editor (main.ts)</h1>
                <div class="raw-link">
                    <label>Your Raw Link:</label>
                    <input type="text" value="${rawLink}" readonly onclick="this.select()">
                </div>
            </div>
            <form id="editor-form" method="POST" action="/save">
                <input type="hidden" name="token" value="${token}">
                <textarea name="code" spellcheck="false">${code}</textarea>
                <div class="footer">
                    <button type="submit">Save Script</button>
                </div>
            </form>
        </div>
        <script>
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('status') === 'saved') {
                const notif = document.getElementById('notification');
                notif.textContent = 'Script saved successfully!';
                notif.style.display = 'block';
                setTimeout(() => { notif.style.display = 'none'; }, 3000);
            }
        </script>
    </body></html>`;
}
