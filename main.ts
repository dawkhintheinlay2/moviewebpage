// main.ts (Final Movie App Version)
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const kv = await Deno.openKv();
const ADMIN_TOKEN = Deno.env.get("ADMIN_TOKEN") || "your-secret-admin-token";
const MOVIES_PER_PAGE = 15;

console.log("Movie App Server is starting...");

async function handler(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const { pathname, searchParams } = url;
    const method = req.method;

    if (pathname === "/") {
        const page = parseInt(searchParams.get("page") || "1", 10) || 1;
        const moviesIterator = kv.list({ prefix: ["movies"] });
        const allMovies = [];
        for await (const entry of moviesIterator) { allMovies.push(entry.value); }
        allMovies.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        const totalMovies = allMovies.length;
        const totalPages = Math.ceil(totalMovies / MOVIES_PER_PAGE);
        const startIndex = (page - 1) * MOVIES_PER_PAGE;
        const moviesForPage = allMovies.slice(startIndex, startIndex + MOVIES_PER_PAGE);

        return new Response(getHomepageHTML(moviesForPage, page, totalPages), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    
    // Movie Detail Page
    const moviePattern = new URLPattern({ pathname: "/movies/:slug" });
    if (moviePattern.exec(url)) {
        const slug = moviePattern.exec(url)!.pathname.groups.slug!;
        const result = await kv.get(["movies", slug]);
        if (!result.value) return new Response("Movie not found", { status: 404 });
        return new Response(getMovieDetailPageHTML(result.value), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    // --- NEW: Video Stream Proxy Endpoint ---
    const streamPattern = new URLPattern({ pathname: "/stream/:slug" });
    if (streamPattern.exec(url)) {
        const slug = streamPattern.exec(url)!.pathname.groups.slug!;
        const result = await kv.get<any>(["movies", slug]);
        const originalVideoUrl = result.value?.watchUrl;

        if (!originalVideoUrl) return new Response("Video source not found", { status: 404 });
        
        try {
            const range = req.headers.get("range");
            const headers = new Headers();
            if (range) { headers.set("range", range); }

            const videoResponse = await fetch(originalVideoUrl, { headers });
            if (!videoResponse.ok || !videoResponse.body) {
                return new Response("Failed to fetch video from source", { status: videoResponse.status });
            }
            
            const responseHeaders = new Headers(videoResponse.headers);
            responseHeaders.set("Access-Control-Allow-Origin", "*");
            return new Response(videoResponse.body, { status: videoResponse.status, headers: responseHeaders });
        } catch (error) {
            return new Response("Error streaming video", { status: 500 });
        }
    }

    // --- Admin Panel Routes ---
    if (pathname === "/admin-login") { return new Response(getLoginPageHTML(), { headers: { "Content-Type": "text/html; charset=utf-8" } });}
    if (pathname === "/admin") {
        if (searchParams.get("token") !== ADMIN_TOKEN) return new Response("Forbidden", { status: 403 });
        const movies = [];
        for await (const entry of kv.list({ prefix: ["movies"] })) { movies.push(entry.value); }
        movies.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        return new Response(getAdminPageHTML(movies, ADMIN_TOKEN), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    if (pathname === "/save-movie" && method === "POST") {
        const formData = await req.formData();
        if (formData.get("token") !== ADMIN_TOKEN) return new Response("Forbidden", { status: 403 });
        const slug = (formData.get("slug") as string || createSlug(formData.get("title") as string)).trim();
        const movieData = {
            slug: slug,
            title: formData.get("title") as string,
            posterUrl: formData.get("posterUrl") as string,
            synopsis: formData.get("synopsis") as string,
            watchUrl: formData.get("watchUrl") as string,
            downloadUrl: formData.get("downloadUrl") as string,
            screenshots: (formData.get("screenshots") as string).split('\n').filter(Boolean),
            createdAt: Date.now()
        };
        await kv.set(["movies", slug], movieData);
        return Response.redirect(`/admin?token=${ADMIN_TOKEN}&status=saved`, 302);
    }
    if (pathname === "/delete-movie" && method === "POST") {
        const formData = await req.formData();
        if (formData.get("token") !== ADMIN_TOKEN) return new Response("Forbidden", { status: 403 });
        const slug = formData.get("slug") as string;
        await kv.delete(["movies", slug]);
        return Response.redirect(`/admin?token=${ADMIN_TOKEN}&status=deleted`, 302);
    }

    return new Response("Page Not Found", { status: 404 });
}

function createSlug(title: string): string {
    return title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/--+/g, '-').replace(/^-+|-+$/g, '');
}

serve(handler);

// --- HTML TEMPLATES ---

function getHomepageHTML(movies: any[], currentPage: number, totalPages: number): string {
    const movieCards = movies.length > 0 ? movies.map(movie => `
        <a href="/movies/${movie.slug}" class="movie-card">
            <img src="${movie.posterUrl}" alt="${movie.title}" loading="lazy">
            <div class="movie-info"><h3>${movie.title}</h3></div>
        </a>`).join('') : '<p>No movies have been added yet.</p>';
    let paginationHTML = '';
    if (totalPages > 1) {
        paginationHTML += '<div class="pagination">';
        if (currentPage > 1) { paginationHTML += `<a href="/?page=${currentPage - 1}" class="page-link">Previous</a>`; }
        for (let i = 1; i <= totalPages; i++) { paginationHTML += `<a href="/?page=${i}" class="page-link ${i === currentPage ? 'active' : ''}">${i}</a>`; }
        if (currentPage < totalPages) { paginationHTML += `<a href="/?page=${currentPage + 1}" class="page-link">Next</a>`; }
        paginationHTML += '</div>';
    }
    return `<!DOCTYPE html><html lang="my"><head><meta charset="UTF-8"><title>Lugi Kar Movies</title><style>
        body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0d1117;color:#c9d1d9;margin:0;}
        .container{max-width:1200px;margin:auto;padding:1rem 2rem;}
        .header{text-align:center;margin:2rem 0;font-size:2rem;color:#58a6ff;}
        .grid{display:grid;grid-template-columns:repeat(auto-fill, minmax(220px, 1fr));gap:1.5rem;}
        .movie-card{display:block;text-decoration:none;color:inherit;background:#161b22;border:1px solid #30363d;border-radius:8px;overflow:hidden;position:relative;transition:transform 0.2s;}
        .movie-card:hover{transform:scale(1.05); z-index:10;}
        .movie-card img{width:100%;height:auto;aspect-ratio:2/3;object-fit:cover;}
        .movie-info{position:absolute;bottom:0;left:0;right:0;background:linear-gradient(to top,rgba(0,0,0,0.95) 20%,transparent);padding:2rem 1rem 1rem;}
        .movie-info h3{margin:0;font-size:1rem;color:#fff;}
        .pagination{display:flex;justify-content:center;gap:0.5rem;margin-top:3rem;}
        .page-link{padding:0.5rem 1rem;background:#21262d;color:#c9d1d9;text-decoration:none;border-radius:5px;border:1px solid #30363d;}
        .page-link.active{background:#58a6ff;color:#fff;font-weight:bold;}
        @media(max-width: 500px) { .grid { grid-template-columns: repeat(2, 1fr); gap: 1rem; } }
    </style></head><body><div class="container"><header><h1>Lugi Kar Movies</h1></header><main><div class="grid">${movieCards}</div>${paginationHTML}</main></div></body></html>`;
}

function getMovieDetailPageHTML(movie: any): string {
    const screenshots = movie.screenshots.map((img: string) => `<img src="${img}" alt="Screenshot">`).join('');
    return `
    <!DOCTYPE html><html lang="my"><head><meta charset="UTF-8"><title>${movie.title}</title>
    <style>
        :root{--bg:#0d1117;--card-bg:#161b22;--text:#c9d1d9;--title:#58a6ff;--btn-watch:#e53935;--btn-dl:#30363d;}
        body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:var(--bg);color:var(--text);margin:0;line-height:1.7;}
        .container{max-width:960px;margin:auto;padding:1rem 2rem;}
        a.back-link{color:var(--title);text-decoration:none;display:inline-block;margin-bottom:1rem;}
        .movie-header{display:grid;grid-template-columns:250px 1fr;gap:2rem;align-items:flex-start;}
        .poster img{width:100%;border-radius:8px;}
        .info h1{font-size:2rem;color:var(--title);margin-top:0;}
        .synopsis{white-space:pre-wrap;opacity:0.9;}
        .button-group{display:flex;gap:1rem;margin-top:1.5rem;}
        .btn{padding:0.8rem 1.5rem;text-align:center;text-decoration:none;color:white;font-size:1rem;font-weight:bold;border-radius:5px;border:none;cursor:pointer;}
        .watch-btn{background:var(--btn-watch);} .download-btn{background:var(--btn-dl);color:var(--text);}
        .video-player-container{display:none;margin-top:2rem;background:#000;border-radius:8px;}
        .video-player-container.active{display:block;}
        video{width:100%;border-radius:8px;}
        .screenshots{display:grid;grid-template-columns:repeat(auto-fill, minmax(200px, 1fr));gap:1rem;margin-top:2rem;}
        .screenshots img{width:100%;border-radius:5px;}
        @media (max-width: 768px) { .movie-header{grid-template-columns:1fr;} .poster{max-width:250px;margin:0 auto 1.5rem;} }
    </style>
    </head><body><div class="container">
        <a href="/" class="back-link">&larr; Back to Home</a>
        <div class="movie-header">
            <div class="poster"><img src="${movie.posterUrl}" alt="${movie.title}"></div>
            <div class="info">
                <h1>${movie.title}</h1>
                <h3>ဇာတ်လမ်းအကျဉ်း</h3><p class="synopsis">${movie.synopsis}</p>
                <div class="button-group">
                    <button id="watch-btn" class="btn watch-btn">Watch</button>
                    <a href="${movie.downloadUrl || '#'}" class="btn download-btn">Download</a>
                </div>
            </div>
        </div>
        <div id="video-container" class="video-player-container">
            <video id="movie-player" controls controlsList="nodownload" preload="metadata" style="display:none;"></video>
        </div>
        <hr style="border-color:#30363d;margin:2rem 0;">
        <h2>Screenshots</h2><div class="screenshots">${screenshots}</div>
    </div>
    <script>
        const watchBtn = document.getElementById('watch-btn');
        const videoContainer = document.getElementById('video-container');
        const player = document.getElementById('movie-player');

        watchBtn.addEventListener('click', () => {
            videoContainer.classList.toggle('active');
            if (videoContainer.classList.contains('active')) {
                player.style.display = 'block';
                if (!player.src) {
                    // This is our proxy stream URL
                    player.src = '/stream/${movie.slug}';
                }
                player.play();
                watchBtn.textContent = 'Close Player';
            } else {
                player.pause();
                player.style.display = 'none';
                watchBtn.textContent = 'Watch';
            }
        });
    </script></body></html>`;
}

function getLoginPageHTML(): string {
    return `<!DOCTYPE html><html><head><title>Admin Login</title><style>body{display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8f9fa;}form{padding:2rem;background:white;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,.1);}</style></head><body><form id="login-form"><h1>Admin Login</h1><input type="password" id="token-input" placeholder="Enter Token" required style="width:250px;padding:0.5rem;margin-bottom:1rem;"><button type="submit" style="width:100%;padding:0.5rem;">Login</button></form><script>document.getElementById('login-form').addEventListener('submit',(e)=>{e.preventDefault();window.location.href='/admin?token='+document.getElementById('token-input').value;});</script></body></html>`;
}

function getAdminPageHTML(movies: any[], token: string): string {
    const movieRows = movies.map(movie=>`<tr><td>${movie.title}</td><td><a href="/movies/${movie.slug}" target="_blank">View</a></td><td><form action="/delete-movie" method="POST"><input type="hidden" name="token" value="${token}"><input type="hidden" name="slug" value="${movie.slug}"><button type="submit">Delete</button></form></td></tr>`).join('');
    return `<!DOCTYPE html><html><head><title>Admin Dashboard</title><style>body{font-family:sans-serif;padding:2rem;background:#f8f9fa;color:#212529;} .container{max-width:960px;margin:auto;} .form-container{background:white;padding:2rem;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,.1);} form, .form-group{display:flex;flex-direction:column;margin-bottom:1rem;}input,textarea{padding:0.5rem;margin-bottom:0.5rem;border:1px solid #ced4da;border-radius:4px;}table{width:100%;border-collapse:collapse;margin-top:2rem;}th,td{border:1px solid #dee2e6;padding:0.8rem;text-align:left;} .notification{padding:1rem;margin-bottom:1rem;border-radius:4px;display:none;} .success{background:#d4edda;color:#155724;border-color:#c3e6cb;}</style></head><body>
    <div class="container"><div id="notification" class="notification"></div><div class="form-container"><h1>Admin Dashboard</h1><h2>Add/Edit Movie</h2><form action="/save-movie" method="POST"><input type="hidden" name="token" value="${token}"><label>Slug (auto-generated if empty):</label><input type="text" name="slug"><label>Title:</label><input type="text" name="title" required><label>Poster URL:</label><input type="text" name="posterUrl" required><label>Synopsis:</label><textarea name="synopsis" rows="5" required></textarea>
    <label>Watch URL (Direct MP4 or your generated link):</label><input type="text" name="watchUrl" required>
    <label>Download URL:</label><input type="text" name="downloadUrl">
    <label>Screenshot URLs (one per line):</label><textarea name="screenshots" rows="3"></textarea><button type="submit">Save Movie</button></form></div>
    <h2>Existing Movies</h2><table><thead><tr><th>Title</th><th>View</th><th>Action</th></tr></thead><tbody>${movieRows}</tbody></table></div>
    <script>const u=new URLSearchParams(window.location.search);if(u.get('status')==='saved'){const n=document.getElementById('notification');n.textContent='Movie saved successfully!';n.className='notification success';n.style.display='block';setTimeout(()=>{n.style.display='none';},3000);}</script>
    </body></html>`;
}
