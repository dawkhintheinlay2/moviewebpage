// main.ts (Final Single-File App-Like Homepage)
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// --- Database & Server Setup (unchanged) ---
const kv = await Deno.openKv();
const ADMIN_TOKEN = Deno.env.get("ADMIN_TOKEN") || "your-secret-admin-token";

console.log("Single-File Movie App Server is starting...");

// --- Main Request Handler ---
async function handler(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // Homepage is the main focus
    if (pathname === "/") {
        // For demonstration, we'll create some dummy movies.
        // In a real scenario, this would fetch from Deno KV.
        const latestMovies = [
            { slug: "jolly-llb-3", title: "Jolly LLB 3", posterUrl: "https://i.ibb.co/qD4Zz7P/jolly-llb-3-poster.jpg", quality: "FHD", year: "2025" },
            { slug: "moppala", title: "Moppala", posterUrl: "https://i.ibb.co/L9n7X7V/moppala-poster.jpg", quality: "FHD", year: "2025" },
            { slug: "the-woman-in-the-line", title: "The Woman in the...", posterUrl: "https://i.ibb.co/x1bC8wT/the-woman-in-the-line-poster.jpg", quality: "FHD", year: "2025" }
        ];
        const latestSeries = [
            { slug: "last-samurai", title: "Last Samurai Sta...", posterUrl: "https://i.ibb.co/h7g8tqK/last-samurai-standing-poster.jpg", quality: "FHD", year: "2025" },
            { slug: "love-and-crown", title: "Love & Crown", posterUrl: "https://i.ibb.co/mHq3QdF/love-and-crown-poster.jpg", quality: "FHD", year: "2025" },
            { slug: "love-exe", title: "LOVE.exe", posterUrl: "https://i.ibb.co/f2zF6sL/love-exe-poster.jpg", quality: "FHD", year: "2025" }
        ];

        return new Response(getHomepageHTML({ latestMovies, latestSeries }), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    // You can add other routes like /movies/:slug for detail pages here later.
    
    return new Response("Page Not Found", { status: 404 });
}

serve(handler);


// --- HTML TEMPLATE FUNCTION for the Homepage ---
function getHomepageHTML(data: { latestMovies: any[], latestSeries: any[] }): string {
    
    const createMovieCard = (movie: any) => `
        <a href="/movies/${movie.slug}" class="movie-card">
            <div class="poster-container">
                <img src="${movie.posterUrl}" alt="${movie.title}" loading="lazy">
                <div class="tag quality-tag">${movie.quality}</div>
                <div class="tag year-tag">${movie.year}</div>
            </div>
            <p class="movie-title">${movie.title}</p>
        </a>`;

    const latestMoviesHTML = data.latestMovies.map(createMovieCard).join('');
    const latestSeriesHTML = data.latestSeries.map(createMovieCard).join('');

    return `
    <!DOCTYPE html><html lang="my"><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Thuta Khit</title>
    <style>
        :root { --bg: #fff; --text: #333; --text-light: #777; --primary: #6a5af9; --header-text: #000; }
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: var(--bg); color: var(--text); margin: 0; padding-bottom: 80px; }
        .container { padding: 0 1rem; }
        .header { display: flex; justify-content: space-between; align-items: center; padding: 1rem; }
        .header h1 { font-size: 1.5rem; color: var(--header-text); margin: 0; }
        .search-btn { background: #eee; border: none; padding: 0.7rem; border-radius: 8px; }
        .country-scroller { display: flex; gap: 0.8rem; overflow-x: auto; padding: 0 1rem 1rem; scrollbar-width: none; -ms-overflow-style: none; }
        .country-scroller::-webkit-scrollbar { display: none; }
        .country-btn { flex-shrink: 0; padding: 0.6rem 1.2rem; border-radius: 20px; border: none; font-weight: 600; display: flex; align-items: center; gap: 0.5rem; }
        .country-btn.china { background: linear-gradient(45deg, #a8e063, #56ab2f); color: white; }
        .country-btn.thailand { background: linear-gradient(45deg, #a044ff, #6a3093); color: white; }
        .country-btn.india { background: linear-gradient(45deg, #f4791f, #f12711); color: white; }
        .section { margin-top: 1.5rem; }
        .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; padding: 0 1rem; }
        .section-header h2 { font-size: 1.2rem; margin: 0; }
        .more-btn { background: var(--primary); color: white; border: none; border-radius: 20px; padding: 0.4rem 1rem; font-size: 0.8rem; }
        .movie-scroller { display: flex; gap: 0.8rem; overflow-x: auto; padding: 0 1rem; scrollbar-width: none; -ms-overflow-style: none; }
        .movie-scroller::-webkit-scrollbar { display: none; }
        .movie-card { text-decoration: none; color: var(--text); flex-shrink: 0; width: 140px; }
        .poster-container { position: relative; }
        .movie-card img { width: 100%; height: 210px; object-fit: cover; border-radius: 12px; }
        .tag { position: absolute; background: rgba(0,0,0,0.6); color: white; padding: 0.2rem 0.5rem; border-radius: 5px; font-size: 0.7rem; font-weight: bold; }
        .quality-tag { top: 8px; left: 8px; }
        .year-tag { top: 8px; right: 8px; background: var(--primary); }
        .movie-title { font-weight: 600; margin: 0.5rem 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .bottom-nav { position: fixed; bottom: 0; left: 0; width: 100%; background: #fff; box-shadow: 0 -2px 10px rgba(0,0,0,0.1); display: flex; justify-content: space-around; padding: 0.5rem 0; }
        .nav-item { display: flex; flex-direction: column; align-items: center; color: var(--text-light); text-decoration: none; font-size: 0.7rem; }
        .nav-item.active { color: var(--primary); }
        .nav-item svg { width: 24px; height: 24px; }
        .center-nav-btn { position: absolute; top: -20px; left: 50%; transform: translateX(-50%); width: 50px; height: 50px; background: var(--primary); border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 4px solid white; }
    </style>
    </head><body>
        <header class="header"><h1>Thuta Khit</h1><button class="search-btn">Search</button></header>
        <div class="container">
            <div class="country-scroller">
                <button class="country-btn china">🇨🇳 China</button>
                <button class="country-btn thailand">🇹🇭 Thailand</button>
                <button class="country-btn india">🇮🇳 India</button>
            </div>
            <section class="section">
                <div class="section-header"><h2>Latest Movies</h2><button class="more-btn">&gt; More</button></div>
                <div class="movie-scroller">${latestMoviesHTML}</div>
            </section>
            <section class="section">
                <div class="section-header"><h2>Latest TV Series</h2><button class="more-btn">&gt; More</button></div>
                <div class="movie-scroller">${latestSeriesHTML}</div>
            </section>
        </div>
        <nav class="bottom-nav">
            <a href="#" class="nav-item active"><svg>...</svg><span>Home</span></a>
            <a href="#" class="nav-item"><svg>...</svg><span>Movies</span></a>
            <div class="center-nav-btn"><svg>...</svg></div>
            <a href="#" class="nav-item"><svg>...</svg><span>Series</span></a>
            <a href="#" class="nav-item"><svg>...</svg><span>Menu</span></a>
        </nav>
    </body></html>`;
}
