import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Peptime",
    short_name: "Peptime",
    description: "Privat, enkel logg för dina egna peptiddata.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#1c1a18",
    theme_color: "#1c1a18",
    lang: "sv-SE",
    orientation: "portrait",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
