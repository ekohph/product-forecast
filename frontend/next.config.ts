import type { NextConfig } from "next";
import { API_PATH, BASE_PATH } from "./src/lib/paths";

const backendOrigin = process.env.BACKEND_ORIGIN ?? "http://127.0.0.1:8000";

const config: NextConfig = {
  basePath: BASE_PATH,
  async rewrites() {
    return [{
      source: `${API_PATH}/:path*`,
      destination: `${backendOrigin.replace(/\/$/, "")}${API_PATH}/:path*`,
      basePath: false,
    }];
  },
};

export default config;
