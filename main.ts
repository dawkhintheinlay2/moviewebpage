// main.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const kv = await Deno.openKv();
const ADMIN_TOKEN = Deno.env.get("ADMIN_TOKEN") || "your-secret-admin-token";
const MOVIES_PER_PAGE = 15;

console.log("Movie Website Server with Custom Detail Page is starting...");

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
        return new Response(getAdminPageHTML(movies, ADMIN_TOKEN), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    if (pathname === "/save-movie" && method === "POST") {
        const formData = await req.formData();
        if (formData.get("token") !== ADMIN_TOKEN) return new Response("Forbidden", { status: 403 });
        const slug = formData.get("slug") as string || createSlug(formData.get("title") as string);
        const movieData = {
            slug: slug,
            title: formData.get("title") as string,
            posterUrl: formData.get("posterUrl") as string,
            synopsis: formData.get("synopsis") as string,
            links: (formData.get("links") as string).split('\n').filter(Boolean),
            screenshots: (formData.get("screenshots") as string).split('\n').filter(Boolean)
        };
        await kv.set(["movies", slug], movieData);
        return Response.redirect(`/admin?token=${ADMIN_TOKEN}`, 302);
    }
    if (pathname === "/delete-movie" && method === "POST") {
        const formData = await req.formData();
        if (formData.get("token") !== ADMIN_TOKEN) return new Response("Forbidden", { status: 403 });
        const slug = formData.get("slug") as string;
        await kv.delete(["movies", slug]);
        return Response.redirect(`/admin?token=${ADMIN_TOKEN}`, 302);
    }

    return new Response("Page Not Found", { status: 404 });
}

function createSlug(title: string): string {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

serve(handler);

function getHomepageHTML(movies: any[], currentPage: number, totalPages: number): string {
    const movieCards = movies.map(movie => `
        <a href="/movies/${movie.slug}" class="movie-card">
            <img src="${movie.posterUrl}" alt="${movie.title}" loading="lazy">
            <div class="movie-info"><h3>${movie.title}</h3></div>
        </a>`).join('');
    let paginationHTML = '';
    if (totalPages > 1) {
        paginationHTML += '<div class="pagination">';
        if (currentPage > 1) { paginationHTML += `<a href="/?page=${currentPage - 1}" class="page-link">Previous</a>`; }
        for (let i = 1; i <= totalPages; i++) { paginationHTML += `<a href="/?page=${i}" class="page-link ${i === currentPage ? 'active' : ''}">${i}</a>`; }
        if (currentPage < totalPages) { paginationHTML += `<a href="/?page=${currentPage + 1}" class="page-link">Next</a>`; }
        paginationHTML += '</div>';
    }
    return `<!DOCTYPE html><html lang="my"><head><meta charset="UTF-8"><title>My Movie Site</title><style>
        body{font-family:sans-serif;background:#111;color:#fff;margin:0;}
        .container{max-width:1200px;margin:auto;padding:2rem;}
        .header{text-align:center;margin-bottom:2rem;}
        .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1.5rem;}
        .movie-card{display:block;text-decoration:none;color:inherit;background:#222;border-radius:8px;overflow:hidden;position:relative;}
        .movie-card img{width:100%;height:auto;aspect-ratio:2/3;object-fit:cover;}
        .movie-info{position:absolute;bottom:0;left:0;right:0;background:linear-gradient(to top,rgba(0,0,0,0.9),transparent);padding:2rem 1rem 1rem;}
        .movie-info h3{margin:0;font-size:1.2rem;}
        .pagination{display:flex;justify-content:center;gap:0.5rem;margin-top:3rem;}
        .page-link{padding:0.5rem 1rem;background:#222;color:#eee;text-decoration:none;border-radius:5px;}
        .page-link.active{background:#8a2be2;color:white;font-weight:bold;}
        @media(max-width:768px){.grid{grid-template-columns:repeat(2,1fr);gap:1rem;}.movie-info h3{font-size:0.9rem;}.movie-info{padding:1.5rem 0.8rem 0.8rem;}}
    </style></head><body><div class="container"><header><h1>Lugi Kar Movies</h1></header><main><div class="grid">${movieCards}</div>${paginationHTML}</main></div></body></html>`;
}

function getMovieDetailPageHTML(movie: any): string {
    const watchLink = movie.links[0] || '#';
    const downloadLink = movie.links[1] || '#';
    const screenshots = movie.screenshots.map((img: string) => `<img src="${img}" alt="Screenshot">`).join('');
    return `
    <!DOCTYPE html><html lang="my"><head><meta charset="UTF-8"><title>${movie.title}</title>
    <style>
        :root{--bg-color:#f0f2f5;--text-color:#333;--title-color:#111;--red-btn:#e53935;--grey-btn:#bdbdbd;}
        body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:var(--bg-color);color:var(--text-color);margin:0;line-height:1.7;}
        .container{max-width:800px;margin:auto;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,0.1);}
        main{padding:1rem;}
        .poster img{width:100%;height:auto;}
        .title-section{text-align:center;padding:1rem;font-size:1.4rem;font-weight:600;color:var(--title-color);border-bottom:1px solid #eee;}
        .screenshots-grid{display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin:1rem 0;}
        .screenshots-grid img{width:100%;border-radius:4px;}
        .synopsis{margin:1.5rem 0;font-size:1rem;white-space:pre-wrap;}
        .button-group{display:grid;gap:1rem;margin-top:1.5rem;}
        .btn{display:block;width:100%;padding:1rem;text-align:center;text-decoration:none;color:white;font-size:1.2rem;font-weight:bold;border-radius:8px;border:none;cursor:pointer;}
        .watch-btn{background-color:var(--red-btn);}
        .download-btn{background-color:var(--grey-btn);color:#212121;}
        .back-to-top{position:fixed;bottom:20px;right:20px;background:var(--red-btn);color:white;width:50px;height:50px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.5rem;text-decoration:none;box-shadow:0 4px 8px rgba(0,0,0,0.2);opacity:0;transition:opacity 0.3s;}
        .back-to-top.visible{opacity:1;}
    </style>
    </head><body><div class="container"><div class="poster"><img src="${movie.posterUrl}" alt="${movie.title}"></div>
    <div class="title-section">${movie.title}</div><main><div class="screenshots-grid">${screenshots}</div>
    <p class="synopsis">${movie.synopsis}</p><div class="button-group"><a href="${watchLink}" class="btn watch-btn">Watch</a><a href="${downloadLink}" class="btn download-btn">Download</a></div></main></div>
    <a href="#" class="back-to-top" id="back-to-top">▲</a>
    <script>
        const backToTopButton=document.getElementById('back-to-top');window.addEventListener('scroll',()=>{window.pageYOffset>300?backToTopButton.classList.add('visible'):backToTopButton.classList.remove('visible');});
        backToTopButton.addEventListener('click',(e)=>{e.preventDefault();window.scrollTo({top:0,behavior:'smooth'});});
    </script></body></html>`;
}

function getLoginPageHTML(): string {
    return `<!DOCTYPE html><html><head><title>Admin Login</title></head><body><form id="login-form"><h1>Admin Login</h1><input type="password" id="token-input" placeholder="Enter Token"><button type="submit">Login</button></form><script>document.getElementById('login-form').addEventListener('submit',(e)=>{e.preventDefault();window.location.href='/admin?token='+document.getElementById('token-input').value;});</script></body></html>`;
}

function getAdminPageHTML(movies: any[], token: string): string {
    const movieRows = movies.map(movie=>`<tr><td>${movie.title}</td><td><a href="/movies/${movie.slug}" target="_blank">View</a></td><td><form action="/delete-movie" method="POST"><input type="hidden" name="token" value="${token}"><input type="hidden" name="slug" value="${movie.slug}"><button type="submit">Delete</button></form></td></tr>`).join('');
    return `<!DOCTYPE html><html><head><title>Admin Dashboard</title><style>body{font-family:sans-serif;padding:2rem;background:#eee;color:#333;}form, .form-group{display:flex;flex-direction:column;margin-bottom:1rem;}input,textarea{padding:0.5rem;margin-bottom:0.5rem;}table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ccc;padding:0.5rem;text-align:left;}</style></head><body><h1>Admin Dashboard</h1><h2>Add/Edit Movie</h2><form action="/save-movie" method="POST"><input type="hidden" name="token" value="${token}"><label>Slug (auto-generated if empty):</label><input type="text" name="slug"><label>Title:</label><input type="text" name="title" required><label>Poster URL:</label><input type="text" name="posterUrl" required><label>Synopsis:</label><textarea name="synopsis" rows="5"></textarea><label>Download Links (one per line):</label><textarea name="links" rows="3"></textarea><label>Screenshot URLs (one per line):</label><textarea name="screenshots" rows="3"></textarea><button type="submit">Save Movie</button></form><h2>Existing Movies</h2><table><thead><tr><th>Title</th><th>View</th><th>Action</th></tr></thead><tbody>${movieRows}</tbody></table></body></html>`;
}
