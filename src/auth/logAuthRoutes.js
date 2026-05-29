/**
 * Log all routes registered on an Express router at startup.
 * @param {string} mountPath e.g. "/api/auth"
 * @param {import('express').Router} router
 */
function logMountedAuthRoutes(mountPath, router) {
  const routes = [];
  router.stack.forEach((layer) => {
    if (!layer.route) return;
    const methods = Object.keys(layer.route.methods)
      .filter((m) => layer.route.methods[m])
      .map((m) => m.toUpperCase())
      .join(",");
    routes.push(`${methods} ${mountPath}${layer.route.path}`);
  });

  console.log("[AUTH] routes mounted at", mountPath);
  routes.forEach((route) => console.log(`[AUTH]   ${route}`));
}

module.exports = { logMountedAuthRoutes };
