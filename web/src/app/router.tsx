import { createBrowserHistory, createRouter } from "@tanstack/react-router";

import { routeTree } from "@/app/routeTree.gen";

const basepath = import.meta.env.VITE_BASE_PATH || "/";

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
