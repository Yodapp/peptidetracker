import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Peptime",
    short_name: "Peptime",
    description: "Privat, enkel logg för dina egna peptiddata.",
    start_url: "/",
    display: "standalone",
    background_color: "#1c1a18",
    theme_color: "#1c1a18",
    lang: "sv-SE",
    orientation: "portrait",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
