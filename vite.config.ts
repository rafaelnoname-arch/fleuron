import vinext from "vinext";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import { readExecutionProfile } from "./scripts/execution-profile.mjs";
import { sites } from "./build/sites-vite-plugin";

const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const managedLinux = readExecutionProfile() === "managed-linux";

export default defineConfig({
  server: {
    ...(managedLinux
      ? { host: "0.0.0.0", allowedHosts: ["terminal.local"] }
      : {}),
    ...(isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : {}),
  },
  plugins: [
    vinext(),
    sites({ mockAuth: !managedLinux }),
    nitro(),
  ],
});
