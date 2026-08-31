import { createBrowserHistory, createRouter } from "@tanstack/react-router";

import { routeTree } from "@/app/routeTree.gen";

const configuredBasepath = import.meta.env.VITE_BASE_PATH || "/";

const basepath =
  configuredBasepath !== "/" &&
  typeof window !== "undefined" &&
  !window.location.pathname.startsWith(configuredBasepath)
    ? "/"
    : configuredBasepath;

export const router = createRouter({
  routeTree,
  basepath,
  history: createBrowserHistory(),
  scrollRestoration: true,
  getScrollRestorationKey: (location: { pathname: string }) =>
    location.pathname,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
