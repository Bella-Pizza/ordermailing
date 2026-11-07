import type { Config } from "vike/types";
import vikePhoton from "vike-photon/config";
import vikeVue from "vike-vue/config";

// Default config (can be overridden by pages)
// https://vike.dev/config

export default {
  // https://vike.dev/head-tags
  title: "Ordermailing",

  description: "Ordermailing",
  extends: [vikeVue, vikePhoton],

  // https://vike.dev/vike-photon
  photon: {
    server: "../server/entry.ts",
  },

  // Vike deletes dist/server after pre-rendering by default, but the Vercel bundling
  // step that runs afterwards still imports dist/server/entry.mjs.
  prerender: { keepDistServer: true },
} as Config;
