import Link from "next/link";

const styles = [
  { id: 1, name: "Modern Minimalist", description: "Clean white/gray, high whitespace, thin borders, sidebar navigation.", path: "/mock/style-1" },
  { id: 2, name: "Glassmorphism", description: "Animated gradient background, frosted glass panels, floating dock navigation.", path: "/mock/style-2" },
  { id: 3, name: "Cyberpunk / Sci-Fi", description: "Dark background, neon pink/cyan borders, glowing text, angled cuts, top bar navigation.", path: "/mock/style-3" },
  { id: 4, name: "Neumorphism", description: "Soft UI, extruded elements with light/dark drop shadows, sidebar navigation.", path: "/mock/style-4" },
  { id: 5, name: "Material Flat", description: "Bold primary colors, distinct card shadows, top app bar + floating action button.", path: "/mock/style-5" },
  { id: 6, name: "Retro Pixel Art", description: "8-bit font, chunky black borders, solid bright colors, blocky sidebar layout.", path: "/mock/style-6" },
  { id: 7, name: "Artsy / Organic", description: "Pastel colors, asymmetrical layouts, rounded/blob shapes, floating navigation.", path: "/mock/style-7" },
  { id: 8, name: "Old Web / Win95", description: "Classic gray #c0c0c0, beveled borders, MS Sans Serif, bottom taskbar navigation.", path: "/mock/style-8" },
  { id: 9, name: "Brutalist", description: "High contrast (black/white/yellow), huge bold typography, overlapping elements, huge sticky header.", path: "/mock/style-9" },
  { id: 10, name: "Elegant Dark", description: "Deep black/charcoal, gold/silver accents, thin elegant serif fonts, minimalist top navigation.", path: "/mock/style-10" },
];

export default function MockIndexPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold mb-4">Dashboard UI Revamp Mockups</h1>
        <p className="text-zinc-400 mb-12 text-lg">
          Explore 10 different aesthetic and layout directions for the new dashboard.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {styles.map((style) => (
            <Link
              key={style.id}
              href={style.path}
              className="block p-6 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/50 hover:border-zinc-700 transition-all group"
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xl font-semibold group-hover:text-primary-400 transition-colors">
                  Style {style.id}: {style.name}
                </h2>
                <span className="text-zinc-500 group-hover:text-zinc-300 transition-colors">→</span>
              </div>
              <p className="text-zinc-400 text-sm leading-relaxed">
                {style.description}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
