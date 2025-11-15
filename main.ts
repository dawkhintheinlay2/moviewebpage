// main.ts (Final Version with "Read More" and all fixes)
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const kv = await Deno.openKv();
const ADMIN_TOKEN = Deno.env.get("ADMIN_TOKEN") || "your-secret-admin-token";
const MOVIES_PER_PAGE = 15;

console.log("Movie App Server (Read More feature) is starting...");

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
    
    const moviePattern = new URLPattern({ pathname: "/movies/:slug" });
    if (moviePattern.exec(url)) {
        const slug = moviePattern.exec(url)!.pathname.groups.slug!;
        const result = await kv.get(["movies", slug]);
        if (!result.value) return new Response("Movie not found", { status: 404 });
        return new Response(getMovieDetailPageHTML(result.value), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

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
            if (!videoResponse.ok || !videoResponse.body) return new Response("Failed to fetch video from source", { status: videoResponse.status });
            const responseHeaders = new Headers(videoResponse.headers);
            responseHeaders.set("Access-Control-Allow-Origin", "*");
            return new Response(videoResponse.body, { status: videoResponse.status, headers: responseHeaders });
        } catch (error) { return new Response("Error streaming video", { status: 500 }); }
    }

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
            slug,
            title: formData.get("title") as string, posterUrl: formData.get("posterUrl") as string,
            year: formData.get("year") as string, tags: formData.get("tags") as string,
            quality: formData.get("quality") as string, rating: formData.get("rating") as string,
            country: formData.get("country") as string, filesize: formData.get("filesize") as string,
            synopsis: formData.get("synopsis") as string, watchUrl: formData.get("watchUrl") as string,
            downloadUrl: formData.get("downloadUrl") as string, createdAt: Date.now()
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

function getMovieDetailPageHTML(movie: any): string {
    return `
    <!DOCTYPE html><html lang="my"><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>${movie.title || 'Movie'}</title>
    <style>
        body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#333;margin:0;line-height:1.6;}
        .container{max-width:800px;margin:auto;}
        .header-bar{display:flex;padding:1rem;}.header-bar a{text-decoration:none;color:#333;font-size:1.5rem;}
        .main-content{padding:0 1rem 1rem;}
        .movie-header{display:grid;grid-template-columns:140px 1fr;gap:1.2rem;align-items:flex-start;}
        .poster img{width:100%;border-radius:8px;}
        .info h1{font-size:1.6rem;margin:0 0 0.5rem;color:#111;}
        .meta-info{display:flex;flex-wrap:wrap;align-items:center;gap:0.5rem;font-size:0.9rem;color:#666;margin-bottom:0.8rem;}
        .quality-tag{background:#1a73e8;color:white;padding:0.2rem 0.6rem;border-radius:4px;font-size:0.8rem;font-weight:500;}
        .stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(80px,1fr));gap:1rem;font-size:0.9rem;margin-top:1rem;color:#555;}
        .stat{display:flex;align-items:center;gap:0.4rem;}.stat-value{font-weight:600;}
        .play-btn{width:100%;padding:0.9rem;margin:1.5rem 0;background:#e53935;color:white;font-size:1.1rem;font-weight:bold;border:none;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:0.5rem;}
        .secondary-actions{display:flex;justify-content:space-around;text-align:center;padding:1rem 0;border-top:1px solid #eee;border-bottom:1px solid #eee;}
        .action-btn{text-decoration:none;color:#555;display:flex;flex-direction:column;align-items:center;gap:0.2rem;}
        .action-btn svg{width:24px;height:24px;margin-bottom:0.2rem;}
        .storyline{margin-top:2rem;}
        .storyline h2{font-size:1.3rem;border-bottom:2px solid #e53935;padding-bottom:0.5rem;}
        .synopsis-container{max-height:100px;overflow:hidden;position:relative;transition:max-height 0.5s ease-in-out;}
        .synopsis-container.expanded{max-height:1000px;}
        .synopsis-container::after{content:'';position:absolute;bottom:0;left:0;width:100%;height:40px;background:linear-gradient(to top,white,rgba(255,255,255,0));}
        .synopsis-container.expanded::after{display:none;}
        .synopsis{white-space:pre-wrap;color:#555;margin:0;}
        .read-more-btn{background:none;border:none;color:#1a73e8;font-weight:bold;cursor:pointer;padding:0.5rem 0;}
        .video-player-container{display:none;margin-top:1.5rem;background:#000;border-radius:8px;}
        .video-player-container.active{display:block;} video{width:100%;border-radius:8px;outline:none;}
        @media (max-width: 600px) { .movie-header{grid-template-columns:1fr;text-align:center;} .poster{max-width:200px;margin:0 auto 1.5rem;} .info{text-align:left;} }
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
            <button id="play-btn" class="play-btn"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg> Play</button>
            <div id="video-container" class="video-player-container"><video id="movie-player" controls controlsList="nodownload" preload="metadata"></video></div>
            <div class="secondary-actions">
                <a href="#" class="action-btn"><div><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg></div><span>Favorite</span></a>
                <a href="${movie.downloadUrl || '#'}" class="action-btn"><div><svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"></path></svg></div><span>Download</span></a>
            </div>
            <div class="storyline">
                <h2>Storyline</h2>
                <div class="synopsis-container" id="synopsis-container">
                    <p class="synopsis">${movie.synopsis || ''}</p>
                </div>
                <button id="read-more-btn" class="read-more-btn" style="display:none;">Read More</button>
            </div>
        </div>
    </div>
    <script>
        const playBtn=document.getElementById('play-btn');const videoContainer=document.getElementById('video-container');const player=document.getElementById('movie-player');
        playBtn.addEventListener('click',()=>{videoContainer.classList.toggle('active');if(videoContainer.classList.contains('active')){if(!player.src){player.src='/stream/${movie.slug}';}
        player.play();playBtn.innerHTML='<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"></path></svg> Close Player';}else{player.pause();playBtn.innerHTML='<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg> Play';}});

        const synopsisContainer = document.getElementById('synopsis-container');
        const readMoreBtn = document.getElementById('read-more-btn');
        if (synopsisContainer.scrollHeight > synopsisContainer.clientHeight) {
            readMoreBtn.style.display = 'block';
            readMoreBtn.addEventListener('click', () => {
                synopsisContainer.classList.toggle('expanded');
                readMoreBtn.textContent = synopsisContainer.classList.contains('expanded') ? 'Read Less' : 'Read More';
            });
        }
    </script></body></html>`;
}

function getLoginPageHTML(): string {
    return `<!DOCTYPE html><html><head><title>Admin Login</title><style>body{display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8f9fa;}form{padding:2rem;background:white;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,.1);}</style></head><body><form id="login-form"><h1>Admin Login</h1><input type="password" id="token-input" placeholder="Enter Token" required style="width:250px;padding:0.5rem;margin-bottom:1rem;"><button type="submit" style="width:100%;padding:0.5rem;">Login</button></form><script>document.getElementById('login-form').addEventListener('submit',(e)=>{e.preventDefault();window.location.href='/admin?token='+document.getElementById('token-input').value;});</script></body></html>`;
}

function getAdminPageHTML(movies: any[], token: string): string {
    const movieRows = movies.map(movie=>`<tr><td>${movie.title}</td><td><a href="/movies/${movie.slug}" target="_blank">View</a></td><td><form action="/delete-movie" method="POST"><input type="hidden" name="token" value="${token}"><input type="hidden" name="slug" value="${movie.slug}"><button type="submit">Delete</button></form></td></tr>`).join('');
    return `<!DOCTYPE html><html><head><title>Admin Dashboard</title><style>body{font-family:sans-serif;padding:2rem;background:#f8f9fa;color:#212529;} .container{max-width:960px;margin:auto;} .form-container{background:white;padding:2rem;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,.1);} form{display:grid;grid-template-columns:1fr 1fr;gap:1rem;} label{font-weight:bold;margin-bottom:0.2rem;grid-column:1/-1;} input,textarea{width:100%;padding:0.5rem;border:1px solid #ced4da;border-radius:4px;} .full-width{grid-column:1/-1;} table{width:100%;border-collapse:collapse;margin-top:2rem;}th,td{border:1px solid #dee2e6;padding:0.8rem;text-align:left;} .notification{padding:1rem;margin-bottom:1rem;border-radius:4px;display:none;} .success{background:#d4edda;color:#155724;}</style></head><body>
    <div class="container"><div id="notification" class="notification"></div><div class="form-container"><h1>Admin Dashboard</h1><h2>Add/Edit Movie</h2>
    <form action="/save-movie" method="POST">
        <input type="hidden" name="token" value="${token}">
        <div class="full-width"><label>Title:</label><input type="text" name="title" required></div>
        <div class="full-width"><label>Poster URL:</label><input type="text" name="posterUrl" required></div>
        <div><label>Year:</label><input type="text" name="year"></div>
        <div><label>Tags (e.g., Horror, Thriller):</label><input type="text" name="tags"></div>
        <div><label>Quality (e.g., Web-dl 1080p):</label><input type="text" name="quality"></div>
        <div><label>Rating (e.g., 5.6 / 10):</label><input type="text" name="rating"></div>
        <div><label>Country (e.g., philippines):</label><input type="text" name="country"></div>
        <div><label>Filesize (e.g., 1.3 GB):</label><input type="text" name="filesize"></div>
        <div class="full-width"><label>Synopsis:</label><textarea name="synopsis" rows="5" required></textarea></div>
        <div class="full-width"><label>Watch URL (Direct or Proxy Link):</label><input type="text" name="watchUrl" required></div>
        <div class="full-width"><label>Download URL:</label><input type="text" name="downloadUrl"></div>
        <div class="full-width"><button type="submit">Save Movie</button></div>
    </form></div>
    <h2>Existing Movies</h2><table><thead><tr><th>Title</th><th>View</th><th>Action</th></tr></thead><tbody>${movieRows}</tbody></table></div>
    <script>const u=new URLSearchParams(window.location.search);if(u.get('status')==='saved'){const n=document.getElementById('notification');n.textContent='Movie saved successfully!';n.className='notification success';n.style.display='block';setTimeout(()=>{n.style.display='none';},3000);}</script>
    </body></html>`;
}
