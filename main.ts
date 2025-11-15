// main.ts (Final Complete Version with All Fixes)
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getCookies, setCookie } from "https://deno.land/std@0.224.0/http/cookie.ts";

const kv = await Deno.openKv();
const ADMIN_TOKEN = Deno.env.get("ADMIN_TOKEN") || "your-secret-admin-token";
const MOVIES_PER_PAGE = 15;

console.log("Movie App Server (Final Fix) is starting...");

async function handler(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const { pathname, searchParams } = url;
    const method = req.method;
    const cookies = getCookies(req.headers);

    // --- PREMIUM KEY ACTIVATION ---
    const premiumKeyParam = searchParams.get("premium_key");
    if (premiumKeyParam) {
        const keyEntry = await kv.get(["keys", premiumKeyParam]);
        if (keyEntry.value && (keyEntry.value as any).expiryDate > Date.now()) {
            const sessionToken = crypto.randomUUID();
            await kv.set(["sessions", sessionToken], { premiumKey: premiumKeyParam }, { expireIn: 365 * 24 * 60 * 60 * 1000 });
            const headers = new Headers({ Location: "/" });
            setCookie(headers, { name: "session_token", value: sessionToken, maxAge: 365 * 24 * 60 * 60, path: "/", httpOnly: true, secure: true });
            return new Response(null, { status: 302, headers });
        } else {
            return Response.redirect(`${url.origin}/?error=invalid_key`, 302);
        }
    }

    const sessionToken = cookies.session_token;
    let hasPremiumAccess = false;
    let premiumKeyInfo: any = null;

    if (sessionToken) {
        const sessionResult = await kv.get<{ premiumKey: string }>(["sessions", sessionToken]);
        if (sessionResult.value) {
            const keyResult = await kv.get(["keys", sessionResult.value.premiumKey]);
            if (keyResult.value && (keyResult.value as any).expiryDate > Date.now()) {
                hasPremiumAccess = true;
                premiumKeyInfo = keyResult.value;
            }
        }
    }

    // --- PUBLIC ROUTES ---
    if (pathname === "/") {
        const page = parseInt(searchParams.get("page") || "1", 10) || 1;
        const moviesIterator = kv.list({ prefix: ["movies"] });
        const allMovies: any[] = [];
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

    // --- PROTECTED ROUTES ---
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

    // --- API ROUTES ---
    if (pathname === "/api/activate-key" && method === "POST") {
        try {
            const { key } = await req.json();
            const keyEntry = await kv.get(["keys", key]);
            if (keyEntry.value && (keyEntry.value as any).expiryDate > Date.now()) {
                const sessionToken = crypto.randomUUID();
                await kv.set(["sessions", sessionToken], { premiumKey: key }, { expireIn: 365 * 24 * 60 * 60 * 1000 });
                const headers = new Headers({ "Content-Type": "application/json" });
                setCookie(headers, { name: "session_token", value: sessionToken, maxAge: 365 * 24 * 60 * 60, path: "/", httpOnly: true, secure: true });
                return new Response(JSON.stringify({ success: true, message: "Key activated successfully!" }), { headers });
            } else {
                return new Response(JSON.stringify({ success: false, message: "Invalid or expired key." }), { status: 400 });
            }
        } catch {
            return new Response(JSON.stringify({ success: false, message: "Invalid request." }), { status: 400 });
        }
    }

    // --- ADMIN ROUTES ---
    if (pathname === "/admin-login") { return new Response(getLoginPageHTML()); }
    if (pathname === "/admin") {
        if (searchParams.get("token") !== ADMIN_TOKEN) return new Response("Forbidden", { status: 403 });
        const movies: any[] = []; for await (const entry of kv.list({ prefix: ["movies"] })) { movies.push(entry.value); }
        movies.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        const keys: any[] = []; for await (const entry of kv.list({ prefix: ["keys"] })) { keys.push(entry.value); }
        keys.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        return new Response(getAdminPageHTML({ movies, keys }, ADMIN_TOKEN), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    if (pathname === "/save-movie" && method === "POST") {
        const formData = await req.formData();
        if (formData.get("token") !== ADMIN_TOKEN) return new Response("Forbidden", { status: 403 });
        const slug = (formData.get("slug") as string || createSlug(formData.get("title") as string)).trim();
        const movieData = { slug, title: formData.get("title") as string, posterUrl: formData.get("posterUrl") as string, year: formData.get("year") as string, tags: formData.get("tags") as string, quality: formData.get("quality") as string, rating: formData.get("rating") as string, country: formData.get("country") as string, filesize: formData.get("filesize") as string, synopsis: formData.get("synopsis") as string, watchUrl: formData.get("watchUrl") as string, downloadUrl: formData.get("downloadUrl") as string, createdAt: Date.now() };
        await kv.set(["movies", slug], movieData);
        return Response.redirect(`/admin?token=${ADMIN_TOKEN}&status=saved`);
    }
    if (pathname === "/delete-movie" && method === "POST") {
        const formData = await req.formData(); if (formData.get("token") !== ADMIN_TOKEN) return new Response("Forbidden", { status: 403 }); const slug = formData.get("slug") as string; await kv.delete(["movies", slug]); return Response.redirect(`/admin?token=${ADMIN_TOKEN}&status=deleted`);
    }
    if (pathname === "/generate-key" && method === "POST") {
        const formData = await req.formData(); if (formData.get("token") !== ADMIN_TOKEN) return new Response("Forbidden", { status: 403 });
        const durationDays = parseInt(formData.get("duration") as string, 10) || 30;
        const newKey = `LUGI-KEY-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
        const expiryDate = Date.now() + (durationDays * 24 * 60 * 60 * 1000);
        await kv.set(["keys", newKey], { key: newKey, createdAt: Date.now(), user: formData.get("user") as string || "N/A", expiryDate });
        return Response.redirect(`/admin?token=${ADMIN_TOKEN}#keys`);
    }
    if (pathname === "/delete-key" && method === "POST") {
        const formData = await req.formData(); if (formData.get("token") !== ADMIN_TOKEN) return new Response("Forbidden", { status: 403 }); const keyToDelete = formData.get("key") as string; await kv.delete(["keys", keyToDelete]); return Response.redirect(`/admin?token=${ADMIN_TOKEN}#keys`);
    }

    return new Response("Page Not Found", { status: 404 });
}

function createSlug(title: string): string {
    return title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/--+/g, '-').replace(/^-+|-+$/g, '');
}

serve(handler);

function getHomepageHTML(movies: any[], currentPage: number, totalPages: number): string {
    const movieCards = movies.length > 0 ? movies.map(movie => `<a href="/movies/${movie.slug}" class="movie-card"><img src="${movie.posterUrl}" alt="${movie.title}" loading="lazy"><div class="movie-info"><h3>${movie.title}</h3></div></a>`).join('') : '<p>No movies have been added yet.</p>';
    let paginationHTML = '';
    if (totalPages > 1) {
        paginationHTML += '<div class="pagination">';
        if (currentPage > 1) paginationHTML += `<a href="/?page=${currentPage - 1}" class="page-link">Previous</a>`;
        for (let i = 1; i <= totalPages; i++) paginationHTML += `<a href="/?page=${i}" class="page-link ${i === currentPage ? 'active' : ''}">${i}</a>`;
        if (currentPage < totalPages) paginationHTML += `<a href="/?page=${currentPage + 1}" class="page-link">Next</a>`;
        paginationHTML += '</div>';
    }
    return `<!DOCTYPE html><html lang="my"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Lugi Kar Movies</title><style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0d1117;color:#c9d1d9;margin:0;} .container{max-width:1200px;margin:auto;padding:1rem 2rem;} .header{text-align:center;margin:2rem 0;font-size:2rem;color:#58a6ff;} .grid{display:grid;grid-template-columns:repeat(auto-fill, minmax(220px, 1fr));gap:1.5rem;} .movie-card{display:block;text-decoration:none;color:inherit;background:#161b22;border:1px solid #30363d;border-radius:8px;overflow:hidden;position:relative;transition:transform 0.2s;} .movie-card:hover{transform:scale(1.05); z-index:10;} .movie-card img{width:100%;height:auto;aspect-ratio:2/3;object-fit:cover;} .movie-info{position:absolute;bottom:0;left:0;right:0;background:linear-gradient(to top,rgba(0,0,0,0.95) 20%,transparent);padding:2rem 1rem 1rem;} .movie-info h3{margin:0;font-size:1rem;color:#fff;} .pagination{display:flex;justify-content:center;gap:0.5rem;margin-top:3rem;} .page-link{padding:0.5rem 1rem;background:#21262d;color:#c9d1d9;text-decoration:none;border-radius:5px;border:1px solid #30363d;} .page-link.active{background:#58a6ff;color:#fff;font-weight:bold;} @media(max-width: 500px) { .grid { grid-template-columns: repeat(2, 1fr); gap: 1rem; } }</style></head><body><div class="container"><header><h1>Lugi Kar Movies</h1></header><main><div class="grid">${movieCards}</div>${paginationHTML}</main></div></body></html>`;
}

function getMovieDetailPageHTML(movie: any, hasAccess: boolean, keyInfo: any): string {
    const watchAction = hasAccess ? `document.getElementById('video-container').style.display='block';document.getElementById('movie-player').src='/stream/${movie.slug}';document.getElementById('movie-player').play();` : `document.getElementById('premium-modal').style.display='flex';`;
    const downloadAction = hasAccess ? `location.href='${movie.downloadUrl || '#'}'` : `document.getElementById('premium-modal').style.display='flex';`;
    const premiumStatusHTML = hasAccess ? `<div class="premium-status success">Premium Active! Expires on: ${new Date(keyInfo.expiryDate).toLocaleDateString()}</div>` : `<div class="premium-status required" onclick="document.getElementById('premium-modal').style.display='flex'">Premium Required to Watch/Download</div>`;

    return `
    <!DOCTYPE html><html lang="my"><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>${movie.title || 'Movie'}</title>
    <style>
        :root{--bg-color:#fff;--text-color:#3c4043;--title-color:#202124;--red-btn:#d93025;--blue-tag:#1a73e8;--meta-text:#5f6368;}
        body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:var(--bg-color);color:var(--text-color);margin:0;line-height:1.6;}
        .container{max-width:800px;margin:auto;}
        .header-bar{display:flex;padding:1rem;}.header-bar a{text-decoration:none;color:#333;font-size:1.5rem;}
        .main-content{padding:0 1rem 1rem;}
        .movie-header{display:flex;flex-direction:row;gap:1.2rem;align-items:flex-start;}
        .poster{width:140px;flex-shrink:0;}.poster img{width:100%;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);}
        .info{display:flex;flex-direction:column;min-width:0;}
        .info h1{font-size:1.6rem;margin:0 0 0.5rem;color:var(--title-color);}
        .meta-info{display:flex;flex-wrap:wrap;align-items:center;gap:0.5rem;font-size:0.9rem;color:var(--meta-text);margin-bottom:0.8rem;}
        .quality-tag{background:var(--blue-tag);color:white;padding:0.2rem 0.6rem;border-radius:4px;font-size:0.8rem;font-weight:500;}
        .stats-grid{display:grid;grid-template-columns:repeat(auto-fit, minmax(80px, 1fr));gap:1rem;font-size:0.9rem;margin-top:1rem;color:#555;}
        .stat{display:flex;align-items:center;gap:0.4rem;}.stat-value{font-weight:600;}
        .premium-status{padding:0.5rem;text-align:center;border-radius:4px;margin-top:1rem;font-weight:bold;}.premium-status.required{background:#eee;color:#333;cursor:pointer;}.premium-status.success{background:#d4edda;color:#155724;}
        .play-btn{width:100%;padding:0.9rem;margin:1.5rem 0;background:var(--red-btn);color:white;font-size:1.1rem;font-weight:bold;border:none;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:0.5rem;}
        .secondary-actions{display:flex;justify-content:space-around;text-align:center;padding:1rem 0;border-top:1px solid #eee;border-bottom:1px solid #eee;}
        .action-btn{text-decoration:none;color:#555;display:flex;flex-direction:column;align-items:center;gap:0.2rem;cursor:pointer;}
        .action-btn svg{width:24px;height:24px;}
        .storyline{margin-top:2rem;} .storyline h2{font-size:1.3rem;border-bottom:2px solid #e53935;padding-bottom:0.5rem;}
        .synopsis{white-space:pre-wrap;color:#555;margin:0;}
        .video-player-container{margin-top:1.5rem;background:#000;border-radius:8px;} video{width:100%;border-radius:8px;outline:none;}
        .modal-overlay{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:1000;justify-content:center;align-items:center;}
        .modal-content{background:#fff;padding:2rem;border-radius:8px;width:90%;max-width:400px;text-align:center;}
        @media(max-width:480px){.movie-header{flex-direction:column;align-items:center;text-align:center;}.info{align-items:center;}}
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
            <div id="video-container" style="display:none;"><video id="movie-player" controls controlsList="nodownload" preload="metadata"></video></div>
            <div class="secondary-actions">
                <div class="action-btn"><div><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg></div><span>Favorite</span></div>
                <div onclick="${downloadAction}" class="action-btn"><div><svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"></path></svg></div><span>Download</span></div>
            </div>
            <div class="storyline"><h2>Storyline</h2><p class="synopsis">${movie.synopsis || ''}</p></div>
        </div>
        <div class="modal-overlay" id="premium-modal"><div class="modal-content"><span onclick="this.parentElement.parentElement.style.display='none'" style="float:right;cursor:pointer;">&times;</span><h3>Premium Key လိုအပ်သည်</h3><p>Premium အသုံးပြုခွင့်ရရန် သင်၏ key ကိုထည့်သွင်းပါ။</p><input type="text" id="key-input" placeholder="LUGI-KEY-XXXXXX" style="width:100%;padding:0.5rem;margin:1rem 0;"><button id="activate-btn" class="play-btn">Activate Key</button><p id="modal-message"></p></div></div>
    </div>
    <script>
        document.getElementById('activate-btn').addEventListener('click',async()=>{const k=document.getElementById('key-input').value,m=document.getElementById('modal-message');m.textContent='Activating...';const r=await fetch('/api/activate-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:k})}),d=await r.json();if(d.success){m.textContent='Success! Reloading...';setTimeout(()=>window.location.reload(),1e3)}else{m.textContent=d.message||'Activation failed.';}});
    </script></body></html>`;
}

function getLoginPageHTML(): string {
    return `<!DOCTYPE html><html><head><title>Admin Login</title><style>body{display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8f9fa;}form{padding:2rem;background:white;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,.1);}</style></head><body><form id="login-form"><h1>Admin Login</h1><input type="password" id="token-input" placeholder="Enter Token" required style="width:250px;padding:0.5rem;margin-bottom:1rem;"><button type="submit" style="width:100%;padding:0.5rem;">Login</button></form><script>document.getElementById('login-form').addEventListener('submit',(e)=>{e.preventDefault();window.location.href='/admin?token='+document.getElementById('token-input').value;});</script></body></html>`;
}

function getAdminPageHTML(data: { movies: any[], keys: any[] }, token: string): string {
    const movieRows = data.movies.map(m => `<tr><td>${m.title}</td><td><a href="/movies/${m.slug}" target="_blank">View</a></td><td><form method="POST" onsubmit="return confirm('Delete this movie?');"><input type="hidden" name="token" value="${token}"><input type="hidden" name="slug" value="${m.slug}"><button formaction="/delete-movie">Delete</button></form></td></tr>`).join('');
    const keyRows = data.keys.map(k => `<tr><td><code>${k.key}</code></td><td>${k.user}</td><td>${new Date(k.expiryDate).toLocaleDateString()}</td><td><form method="POST" onsubmit="return confirm('Delete this key?');"><input type="hidden" name="token" value="${token}"><input type="hidden" name="key" value="${k.key}"><button formaction="/delete-key">Delete</button></form></td></tr>`).join('');
    return `<!DOCTYPE html><html><head><title>Admin Dashboard</title><style>body{font-family:sans-serif;padding:2rem;background:#f8f9fa;} .container{max-width:1000px;margin:auto;} .tabs{display:flex;gap:1rem;border-bottom:1px solid #ccc;margin-bottom:1rem;} .tab{padding:0.5rem 1rem;cursor:pointer;} .tab.active{border:1px solid #ccc;border-bottom:1px solid #f8f9fa;background:#f8f9fa;} .panel{display:none;} .panel.active{display:block;} form{display:grid;grid-template-columns:1fr 1fr;gap:1rem;} .full-width{grid-column:1/-1;} table{width:100%;border-collapse:collapse;margin-top:1rem;}th,td{border:1px solid #ccc;padding:0.5rem;}</style></head><body>
    <div class="container"><h1>Admin Dashboard</h1><div class="tabs"><div class="tab active" onclick="showTab('movies')">Movies</div><div class="tab" onclick="showTab('keys')">Premium Keys</div></div>
    <div id="movies" class="panel active">
        <h2>Add Movie</h2><form action="/save-movie" method="POST"><input type="hidden" name="token" value="${token}">
        <div class="full-width"><label>Title:</label><input type="text" name="title" required></div>
        <div class="full-width"><label>Poster URL:</label><input type="text" name="posterUrl" required></div>
        <div><label>Year:</label><input type="text" name="year"></div><div><label>Tags:</label><input type="text" name="tags"></div>
        <div><label>Quality:</label><input type="text" name="quality"></div><div><label>Rating:</label><input type="text" name="rating"></div>
        <div><label>Country:</label><input type="text" name="country"></div><div><label>Filesize:</label><input type="text" name="filesize"></div>
        <div class="full-width"><label>Synopsis:</label><textarea name="synopsis" rows="4"></textarea></div>
        <div class="full-width"><label>Watch URL:</label><input type="text" name="watchUrl" required></div>
        <div class="full-width"><label>Download URL:</label><input type="text" name="downloadUrl"></div>
        <div class="full-width"><button type="submit">Save Movie</button></div></form>
        <h2>Existing Movies</h2><table><thead><tr><th>Title</th><th>View</th><th>Action</th></tr></thead><tbody>${movieRows}</tbody></table>
    </div>
    <div id="keys" class="panel">
        <h2>Generate Key</h2><form action="/generate-key" method="POST"><input type="hidden" name="token" value="${token}"><label>User/Note:</label><input type="text" name="user"><label>Duration (days):</label><input type="number" name="duration" value="30"><button type="submit">Generate Key</button></form>
        <h2>Active Keys</h2><table><thead><tr><th>Key</th><th>User</th><th>Expires On</th><th>Action</th></tr></thead><tbody>${keyRows}</tbody></table>
    </div></div>
    <script>function showTab(t){document.querySelectorAll('.panel,.tab').forEach(e=>e.classList.remove('active'));document.getElementById(t).classList.add('active');event.currentTarget.classList.add('active');window.location.hash=t;} if(window.location.hash){showTab(window.location.hash.substring(1));}</script>
    </body></html>`;
}
