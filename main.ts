// main.ts (Final Version - All Bugs Fixed)
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const kv = await Deno.openKv();
const ADMIN_TOKEN = Deno.env.get("ADMIN_TOKEN") || "your-secret-admin-token";
const MOVIES_PER_PAGE = 15;

console.log("Movie Website Server (All Bugs Fixed) is starting...");

async function handler(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const { pathname, searchParams } = url;
    const method = req.method;

    if (pathname === "/") {
        const page = parseInt(searchParams.get("page") || "1", 10) || 1;
        const moviesIterator = kv.list({ prefix: ["movies"] });
        const allMovies = [];
        for await (const entry of moviesIterator) {
            allMovies.push(entry.value);
        }
        allMovies.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); // Sort by newest first

        const totalMovies = allMovies.length;
        const totalPages = Math.ceil(totalMovies / MOVIES_PER_PAGE);
        const startIndex = (page - 1) * MOVIES_PER_PAGE;
        const moviesForPage = allMovies.slice(startIndex, startIndex + MOVIES_PER_PAGE);

        return new Response(getHomepageHTML(moviesForPage, page, totalPages), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    
    const moviePattern = new URLPattern({ pathname: "/movies/:slug" });
    const movieMatch = moviePattern.exec(url);
    if (movieMatch) {
        const slug = movieMatch.pathname.groups.slug;
        const result = await kv.get(["movies", slug]);
        if (!result.value) return new Response("Movie not found", { status: 404 });
        return new Response(getMovieDetailPageHTML(result.value), { headers: { "Content-Type": "text/html; charset=utf-8" } });
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
            slug: slug,
            title: formData.get("title") as string,
            posterUrl: formData.get("posterUrl") as string,
            synopsis: formData.get("synopsis") as string,
            links: (formData.get("links") as string).split('\n').filter(Boolean),
            screenshots: (formData.get("screenshots") as string).split('\n').filter(Boolean),
            createdAt: Date.now()
        };
        await kv.set(["movies", slug], movieData);
        // Redirect back to admin page with a success message
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
    const movieCards = movies.length > 0 ? movies.map(movie => `
        <a href="/movies/${movie.slug}" class="movie-card">
            <img src="${movie.posterUrl}" alt="${movie.title}" loading="lazy">
            <div class="movie-info"><h3>${movie.title}</h3></div>
        </a>`).join('') : '<p>No movies have been added yet. Please check back later.</p>';
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
        .grid{display:grid;grid-template-columns:repeat(auto-fill, minmax(200px, 1fr));gap:1.5rem;}
        .movie-card{display:block;text-decoration:none;color:inherit;background:#161b22;border:1px solid #30363d;border-radius:8px;overflow:hidden;position:relative;transition:transform 0.2s;}
        .movie-card:hover{transform:scale(1.05);}
        .movie-card img{width:100%;height:auto;aspect-ratio:2/3;object-fit:cover;}
        .movie-info{position:absolute;bottom:0;left:0;right:0;background:linear-gradient(to top,rgba(0,0,0,0.95),transparent);padding:2rem 1rem 1rem;}
        .movie-info h3{margin:0;font-size:1rem;color:#fff;}
        .pagination{display:flex;justify-content:center;gap:0.5rem;margin-top:3rem;}
        .page-link{padding:0.5rem 1rem;background:#21262d;color:#c9d1d9;text-decoration:none;border-radius:5px;border:1px solid #30363d;}
        .page-link.active{background:#58a6ff;color:#fff;font-weight:bold;}
    </style></head><body><div class="container"><header><h1>Lugi Kar Movies</h1></header><main><div class="grid">${movieCards}</div>${paginationHTML}</main></div></body></html>`;
}

function getMovieDetailPageHTML(movie: any): string {
    const watchLink = movie.links[0] || '#';
    const downloadLink = movie.links[1] || '#';
    const screenshots = movie.screenshots.map((img: string) => `<img src="${img}" alt="Screenshot">`).join('');
    return `
    <!DOCTYPE html><html lang="my"><head><meta charset="UTF-8"><title>${movie.title}</title>
    <style>
        :root{--bg-color:#f0f2f5;--text-color:#3c4043;--title-color:#1a1a1a;--red-btn:#d93025;--grey-btn:#dadce0;}
        body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:var(--bg-color);color:var(--text-color);margin:0;line-height:1.8;}
        .container{max-width:800px;margin:auto;background:#fff;box-shadow:0 1px 6px rgba(32,33,36,.28);}
        main{padding:1.5rem;}
        .poster{width:100%;}
        .poster img{width:100%;height:auto;}
        .title-section{text-align:center;padding:1.2rem;font-size:1.5rem;font-weight:600;color:var(--title-color);border-bottom:1px solid #dfe1e5;}
        .screenshots-grid{display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;margin:1.5rem 0;}
        .screenshots-grid img{width:100%;border-radius:8px;}
        .synopsis{margin:1.5rem 0;font-size:1.1rem;white-space:pre-wrap;}
        .button-group{display:grid;gap:1rem;margin-top:2rem;}
        .btn{display:block;width:100%;padding:1rem;text-align:center;text-decoration:none;color:white;font-size:1.2rem;font-weight:bold;border-radius:8px;border:none;cursor:pointer;}
        .watch-btn{background-color:var(--red-btn);}
        .download-btn{background-color:var(--grey-btn);color:#202124;}
        .back-to-top{position:fixed;bottom:20px;right:20px;background:var(--red-btn);color:white;width:50px;height:50px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.5rem;text-decoration:none;box-shadow:0 4px 8px rgba(0,0,0,0.2);opacity:0;transition:opacity 0.3s;}
        .back-to-top.visible{opacity:1;}
    </style>
    </head><body><div class="container"><div class="poster"><img src="${movie.posterUrl}" alt="${movie.title}"></div>
    <div class="title-section">${movie.title}</div><main><div class="screenshots-grid">${screenshots}</div>
    <p class="synopsis">${movie.synopsis}</p><div class="button-group"><a href="${watchLink}" class="btn watch-btn">Watch</a><a href="${downloadLink}" class="btn download-btn">Download</a></div></main></div>
    <a href="#" class="back-to-top" id="back-to-top">▲</a>
    <script>const b=document.getElementById('back-to-top');window.addEventListener('scroll',()=>{window.pageYOffset>300?b.classList.add('visible'):b.classList.remove('visible');});b.addEventListener('click',(e)=>{e.preventDefault();window.scrollTo({top:0,behavior:'smooth'});});</script></body></html>`;
}

function getLoginPageHTML(): string {
    return `<!DOCTYPE html><html><head><title>Admin Login</title><style>body{display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8f9fa;}form{padding:2rem;background:white;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,.1);}</style></head><body><form id="login-form"><h1>Admin Login</h1><input type="password" id="token-input" placeholder="Enter Token" required style="width:250px;padding:0.5rem;margin-bottom:1rem;"><button type="submit" style="width:100%;padding:0.5rem;">Login</button></form><script>document.getElementById('login-form').addEventListener('submit',(e)=>{e.preventDefault();window.location.href='/admin?token='+document.getElementById('token-input').value;});</script></body></html>`;
}

function getAdminPageHTML(movies: any[], token: string): string {
    const movieRows = movies.map(movie=>`<tr><td>${movie.title}</td><td><a href="/movies/${movie.slug}" target="_blank">View</a></td><td><form action="/delete-movie" method="POST"><input type="hidden" name="token" value="${token}"><input type="hidden" name="slug" value="${movie.slug}"><button type="submit">Delete</button></form></td></tr>`).join('');
    return `<!DOCTYPE html><html><head><title>Admin Dashboard</title><style>body{font-family:sans-serif;padding:2rem;background:#f8f9fa;color:#212529;} .container{max-width:960px;margin:auto;} .form-container{background:white;padding:2rem;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,.1);} form, .form-group{display:flex;flex-direction:column;margin-bottom:1rem;}input,textarea{padding:0.5rem;margin-bottom:0.5rem;border:1px solid #ced4da;border-radius:4px;}table{width:100%;border-collapse:collapse;margin-top:2rem;}th,td{border:1px solid #dee2e6;padding:0.8rem;text-align:left;} .notification{padding:1rem;margin-bottom:1rem;border-radius:4px;display:none;} .success{background:#d4edda;color:#155724;border-color:#c3e6cb;}</style></head><body>
    <div class="container"><div id="notification" class="notification"></div><div class="form-container"><h1>Admin Dashboard</h1><h2>Add/Edit Movie</h2><form action="/save-movie" method="POST"><input type="hidden" name="token" value="${token}"><label>Slug (auto-generated if empty):</label><input type="text" name="slug"><label>Title:</label><input type="text" name="title" required><label>Poster URL:</label><input type="text" name="posterUrl" required><label>Synopsis:</label><textarea name="synopsis" rows="5" required></textarea><label>Download Links (one per line):</label><textarea name="links" rows="3" required></textarea><label>Screenshot URLs (one per line):</label><textarea name="screenshots" rows="3"></textarea><button type="submit">Save Movie</button></form></div>
    <h2>Existing Movies</h2><table><thead><tr><th>Title</th><th>View</th><th>Action</th></tr></thead><tbody>${movieRows}</tbody></table></div>
    <script>
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('status') === 'saved') {
            const notif = document.getElementById('notification');
            notif.textContent = 'Movie saved successfully!';
            notif.className = 'notification success';
            notif.style.display = 'block';
            setTimeout(() => { notif.style.display = 'none'; }, 3000);
        }
    </script>
    </body></html>`;
}
