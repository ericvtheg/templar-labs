import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";

const handle = createStartHandler(defaultStreamHandler);
export default {
  async fetch(request: Request) {
    const response = await handle(request);
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "same-origin");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("Permissions-Policy", "microphone=(self), camera=(), geolocation=()");
    return response;
  },
};
