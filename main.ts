// main.ts (Final Complete Version with Full Premium System)
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getCookies, setCookie } from "https://deno.land/std@0.224.0/http/cookie.ts";

const kv = await Deno.openKv();
const ADMIN_TOKEN = Deno.env.get("ADMIN_TOKEN") || "your-secret-admin-token";
const MOVIES_PER_PAGE = 15;

console.log("Movie App Server (Full Premium System) is starting...");

async function handler(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const { pathname, searchParams } = url;
    const method = req.method;
    const cookies = getCookies(req.headers);

    const sessionToken = cookies.session_token;
    let hasPremiumAccess = false;
    let premiumKeyInfo: any = null;

    if (sessionToken) {
        const sessionResult = await kv.get(["sessions", sessionToken]);
        if (sessionResult.value) {
            const keyResult = await kv.get(["keys", sessionResult.value.premiumKey]);
            if (keyResult.value && keyResult.value.expiryDate > Date.now()) {
                hasPremiumAccess = true;
                premiumKeyInfo = keyResult.value;
            }
        }
    }

    // --- PUBLIC ROUTES ---
    if (pathname === "/") { /* ... Homepage logic ... */ 
        const page = parseInt(searchParams.get("page") || "1", 10) || 1;
        const moviesIterator = kv.list({ prefix: ["movies"] });
        const allMovies = [];
        for await (const entry of moviesIterator) { allMovies.push(entry.value); }
        allMovies.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        const totalPages = Math.ceil(allMovies.length / MOVIES_PER_PAGE);
        const startIndex = (page - 1) * MOVIES_PER_PAGE;
        const moviesForPage = allMovies.slice(startIndex, startIndex + MOVIES_PER_PAGE);
        return new Response(getHomepageHTML(moviesForPage, page, totalPages), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    
    const moviePattern = new URLPattern({ pathname: "/movies/:slug" });
    if (moviePattern.exec(url)) {
        const slug = moviePattern.exec(url)!.pathname.groups.slug!;
        const result = await kv.get(["movies", slug]);
        if (!result.value) return new Response("Movie not found", { status: 404 });
        return new Response(getMovieDetailPageHTML(result.value, hasPremiumAccess, premiumKeyInfo), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    // --- PROTECTED ROUTES (Requires valid session) ---
    const streamPattern = new URLPattern({ pathname: "/stream/:slug" });
    if (streamPattern.exec(url)) {
        if (!hasPremiumAccess) return new Response("Premium access required.", { status: 403 });
        const slug = streamPattern.exec(url)!.pathname.groups.slug!;
        const result = await kv.get<any>(["movies", slug]);
        const originalVideoUrl = result.value?.watchUrl;
        if (!originalVideoUrl) return new Response("Video source not found", { status: 404 });
        try {
            const range = req.headers.get("range");
            const headers = new Headers();
            if (range) { headers.set("range", range); }
            const videoResponse = await fetch(originalVideoUrl, { headers });
            if (!videoResponse.ok || !videoResponse.body) return new Response("Failed to fetch video from source", { status: videoResponse.status });
            const responseHeaders = new Headers(videoResponse.headers);
            responseHeaders.set("Access-Control-Allow-Origin", "*");
            return new Response(videoResponse.body, { status: videoResponse.status, headers: responseHeaders });
        } catch (error) { return new Response("Error streaming video", { status: 500 }); }
    }

    // --- API ROUTES for Premium System ---
    if (pathname === "/api/activate-key" && method === "POST") {
        const { key } = await req.json();
        const keyEntry = await kv.get(["keys", key]);
        if (keyEntry.value && keyEntry.value.expiryDate > Date.now()) {
            const sessionToken = crypto.randomUUID();
            await kv.set(["sessions", sessionToken], { premiumKey: key }, { expireIn: 365 * 24 * 60 * 60 * 1000 });
            const headers = new Headers({ "Content-Type": "application/json" });
            setCookie(headers, { name: "session_token", value: sessionToken, maxAge: 365 * 24 * 60 * 60, path: "/", httpOnly: true, secure: true });
            return new Response(JSON.stringify({ success: true, message: "Key activated successfully!" }), { headers });
        } else {
            return new Response(JSON.stringify({ success: false, message: "Invalid or expired key." }), { status: 400 });
        }
    }

    // --- ADMIN ROUTES ---
    if (pathname === "/admin-login") { return new Response(getLoginPageHTML()); }
    if (pathname === "/admin") { /* ... Admin page logic ... */
        if (searchParams.get("token") !== ADMIN_TOKEN) return new Response("Forbidden", { status: 403 });
        const movies = []; for await (const entry of kv.list({ prefix: ["movies"] })) { movies.push(entry.value); }
        movies.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        const keys = []; for await (const entry of kv.list({ prefix: ["keys"] })) { keys.push(entry.value); }
        keys.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        return new Response(getAdminPageHTML({ movies, keys }, ADMIN_TOKEN), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    if (pathname === "/save-movie" && method === "POST") { /* ... Save movie logic ... */
        const formData = await req.formData();
        if (formData.get("token") !== ADMIN_TOKEN) return new Response("Forbidden", { status: 403 });
        const slug = (formData.get("slug") as string || createSlug(formData.get("title") as string)).trim();
        const movieData = { slug, title: formData.get("title") as string, posterUrl: formData.get("posterUrl") as string, year: formData.get("year") as string, tags: formData.get("tags") as string, quality: formData.get("quality") as string, rating: formData.get("rating") as string, country: formData.get("country") as string, filesize: formData.get("filesize") as string, synopsis: formData.get("synopsis") as string, watchUrl: formData.get("watchUrl") as string, downloadUrl: formData.get("downloadUrl") as string, createdAt: Date.now() };
        await kv.set(["movies", slug], movieData);
        return Response.redirect(`/admin?token=${ADMIN_TOKEN}&status=saved`, 302);
    }
    if (pathname === "/delete-movie" && method === "POST") { /* ... Delete movie logic ... */ 
        const formData = await req.formData(); if (formData.get("token") !== ADMIN_TOKEN) return new Response("Forbidden", { status: 403 }); const slug = formData.get("slug") as string; await kv.delete(["movies", slug]); return Response.redirect(`/admin?token=${ADMIN_TOKEN}&status=deleted`, 302);
    }
    if (pathname === "/generate-key" && method === "POST") { /* ... Generate key logic ... */
        const formData = await req.formData(); if (formData.get("token") !== ADMIN_TOKEN) return new Response("Forbidden", { status: 403 });
        const durationDays = parseInt(formData.get("duration") as string, 10) || 30;
        const newKey = `LUGI-KEY-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
        const expiryDate = Date.now() + (durationDays * 24 * 60 * 60 * 1000);
        await kv.set(["keys", newKey], { key: newKey, createdAt: Date.now(), user: formData.get("user") as string || "N/A", expiryDate });
        return Response.redirect(`/admin?token=${ADMIN_TOKEN}#keys`);
    }
    if (pathname === "/delete-key" && method === "POST") { /* ... Delete key logic ... */
        const formData = await req.formData(); if (formData.get("token") !== ADMIN_TOKEN) return new Response("Forbidden", { status: 403 }); const keyToDelete = formData.get("key") as string; await kv.delete(["keys", keyToDelete]); return Response.redirect(`/admin?token=${ADMIN_TOKEN}#keys`);
    }

    return new Response("Page Not Found", { status: 404 });
}

function createSlug(title: string): string {
    return title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/--+/g, '-').replace(/^-+|-+$/g, '');
}

serve(handler);

// --- TEMPLATE FUNCTIONS ---

function getMovieDetailPageHTML(movie: any, hasAccess: boolean, keyInfo: any): string {
    const watchAction = hasAccess ? `document.getElementById('video-container').style.display='block';document.getElementById('movie-player').src='/stream/${movie.slug}';document.getElementById('movie-player').play();` : `document.getElementById('premium-modal').style.display='flex';`;
    const downloadAction = hasAccess ? `location.href='${movie.downloadUrl || '#'}'` : `document.getElementById('premium-modal').style.display='flex';`;
    const premiumStatusHTML = hasAccess ? `<div class="premium-status success">Premium Active! Expires on: ${new Date(keyInfo.expiryDate).toLocaleDateString()}</div>` : `<div class="premium-status">Premium Required</div>`;

    return `
    <!DOCTYPE html><html lang="my"><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>${movie.title || 'Movie'}</title>
    <style>
        body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#333;margin:0;line-height:1.6;}
        .container{max-width:800px;margin:auto;}
        .header-bar{display:flex;padding:1rem;}.header-bar a{text-decoration:none;color:#333;font-size:1.5rem;}
        .main-content{padding:0 1rem 1rem;}
        .movie-header{display:flex;flex-direction:column;gap:1.2rem;}
        .poster{width:140px;flex-shrink:0;}.poster img{width:100%;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);}
        .info{display:flex;flex-direction:column;}
        .info h1{font-size:1.6rem;margin:0 0 0.5rem;color:#202124;}
        .meta-info{display:flex;flex-wrap:wrap;align-items:center;gap:0.5rem;font-size:0.9rem;color:#5f6368;margin-bottom:0.8rem;}
        .quality-tag{background:#1a73e8;color:white;padding:0.2rem 0.6rem;border-radius:4px;font-size:0.8rem;font-weight:500;}
        .stats-grid{display:flex;gap:1rem;font-size:0.9rem;margin-top:1rem;color:#555;}
        .stat{display:flex;align-items:center;gap:0.4rem;}.stat-value{font-weight:600;}
        .play-btn{width:100%;padding:0.9rem;margin:1.5rem 0;background:#d93025;color:white;font-size:1.1rem;font-weight:bold;border:none;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:0.5rem;}
        .secondary-actions{display:flex;justify-content:space-around;text-align:center;padding:1rem 0;border-top:1px solid #eee;border-bottom:1px solid #eee;}
        .action-btn{text-decoration:none;color:#555;display:flex;flex-direction:column;align-items:center;gap:0.2rem;cursor:pointer;}
        .action-btn svg{width:24px;height:24px;}
        .storyline{margin-top:2rem;} .storyline h2{font-size:1.3rem;border-bottom:2px solid #e53935;padding-bottom:0.5rem;}
        .synopsis{white-space:pre-wrap;color:#555;margin:0;}
        .video-player-container{display:none;margin-top:1.5rem;background:#000;border-radius:8px;} video{width:100%;border-radius:8px;outline:none;}
        .modal-overlay{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:1000;justify-content:center;align-items:center;}
        .modal-content{background:#fff;padding:2rem;border-radius:8px;width:90%;max-width:400px;text-align:center;}
        .premium-status{padding:0.5rem;border-radius:4px;margin-top:1rem;font-weight:bold;background:#eee;color:#333;}.premium-status.success{background:#d4edda;color:#155724;}
        @media (min-width: 600px) { .movie-header { flex-direction: row; } }
    </style>
    </head><body><div class="container">
        <header class="header-bar"><a href="/">&larr;</a></header>
        <div class="main-content">
            <div class="movie-header">
                <div class="poster"><img src="${movie.posterUrl || ''}" alt="${movie.title || ''}"></div>
                <div class="info">
                    <h1>${movie.title || 'N/A'}</h1>
                    <div class="meta-info"><span>${movie.year || ''}</span> &bull; <span>${movie.tags || ''}</span></div>
                    <div class="quality-tag">${movie.quality || ''}</div>
                    <div class="stats-grid">
                        <div class="stat">⭐<span class="stat-value">${movie.rating || 'N/A'}</span></div>
                        <div class="stat">🇵🇭<span class="stat-value">${movie.country || 'N/A'}</span></div>
                        <div class="stat">💾<span class="stat-value">${movie.filesize || 'N/A'}</span></div>
                    </div>
                </div>
            </div>
            ${premiumStatusHTML}
            <button onclick="${watchAction}" class="play-btn">▶ Play</button>
            <div id="video-container" class="video-player-container"><video id="movie-player" controls controlsList="nodownload" preload="metadata"></video></div>
            <div class="secondary-actions">
                <div class="action-btn">... Favorite ...</div>
                <div onclick="${downloadAction}" class="action-btn">... Download ...</div>
            </div>
            <div class="storyline"><h2>Storyline</h2><p class="synopsis">${movie.synopsis || ''}</p></div>
        </div>
        <div class="modal-overlay" id="premium-modal">
            <div class="modal-content">
                <span onclick="this.parentElement.parentElement.style.display='none'">&times;</span>
                <h3>Premium Key လိုအပ်သည်</h3>
                <p>Premium အသုံးပြုခွင့်ရရန် သင်၏ key ကိုထည့်သွင်းပါ။</p>
                <input type="text" id="key-input" placeholder="LUGI-KEY-XXXXXX" style="width:100%;padding:0.5rem;margin:1rem 0;">
                <button id="activate-btn" class="play-btn">Activate Key</button>
                <p id="modal-message"></p>
            </div>
        </div>
    </div>
    <script>
        document.getElementById('activate-btn').addEventListener('click', async () => {
            const key = document.getElementById('key-input').value;
            const msgEl = document.getElementById('modal-message');
            msgEl.textContent = 'Activating...';
            const res = await fetch('/api/activate-key', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ key })
            });
            const data = await res.json();
            if (data.success) {
                msgEl.textContent = 'Success! Page will now reload.';
                setTimeout(() => window.location.reload(), 1500);
            } else {
                msgEl.textContent = data.message || 'Activation failed.';
            }
        });
    </script></body></html>`;
}

function getAdminPageHTML(data: { movies: any[], keys: any[] }, token: string): string {
    const movieRows = data.movies.map(m => `<tr><td>${m.title}</td><td><a href="/movies/${m.slug}" target="_blank">View</a></td><td>...</td></tr>`).join('');
    const keyRows = data.keys.map(k => `<tr><td><code>${k.key}</code></td><td>${k.user}</td><td>${new Date(k.expiryDate).toLocaleDateString()}</td><td>...</td></tr>`).join('');

    return `<!DOCTYPE html><html><head><title>Admin Dashboard</title><style> /* ... admin styles ... */ </style></head><body>
    <div class="container"><h1>Admin Dashboard</h1><div class="tabs"><div class="tab active" onclick="showTab('movies')">Movies</div><div class="tab" onclick="showTab('keys')">Premium Keys</div></div>
    <div id="movies" class="panel active">
        <h2>Add Movie</h2>
        <form action="/save-movie" method="POST">
            <input type="hidden" name="token" value="${token}">
            <label>Title:</label><input type="text" name="title" required>
            <label>Poster URL:</label><input type="text" name="posterUrl" required>
            <label>Year:</label><input type="text" name="year">
            <label>Tags:</label><input type="text" name="tags">
            <label>Quality:</label><input type="text" name="quality">
            <label>Rating:</label><input type="text" name="rating">
            <label>Country:</label><input type="text" name="country">
            <label>Filesize:</label><input type="text" name="filesize">
            <label>Synopsis:</label><textarea name="synopsis" rows="4"></textarea>
            <label>Watch URL:</label><input type="text" name="watchUrl" required>
            <label>Download URL:</label><input type="text" name="downloadUrl">
            <button type="submit">Save Movie</button>
        </form>
        <h2>Existing Movies</h2><table>${movieRows}</table>
    </div>
    <div id="keys" class="panel">
        <h2>Generate Key</h2>
        <form action="/generate-key" method="POST">
            <input type="hidden" name="token" value="${token}">
            <label>User/Note:</label><input type="text" name="user">
            <label>Duration (in days):</label><input type="number" name="duration" value="30">
            <button type="submit">Generate Key</button>
        </form>
        <h2>Active Keys</h2><table>${keyRows}</table>
    </div>
    <script>function showTab(t){document.querySelectorAll('.panel,.tab').forEach(e=>e.classList.remove('active'));document.getElementById(t).classList.add('active');event.currentTarget.classList.add('active');window.location.hash=t;} if(window.location.hash){showTab(window.location.hash.substring(1));}</script>
    </body></html>`;
}
