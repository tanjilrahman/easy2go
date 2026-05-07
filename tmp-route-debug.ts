import { calculateRoutes } from "./src/lib/server/route-planner";

const response = await calculateRoutes({
  origin: { name: "Rupnagar Abashik", canonicalId: "stop-rupnagar-abashik", type: "bus_stop" },
  destination: { name: "Gabtoli", canonicalId: "stop-gabtoli", type: "bus_stop" },
  optimization: "recommended",
});

for (const route of response.routes) {
  console.log(route.kind, route.summary, route.estimatedDurationMinutes, route.estimatedDistanceKm, route.totalCost);
  console.log(route.segments.map((s) => `${s.mode}:${s.startLocation}->${s.endLocation}:${s.connectorType ?? ""}:${s.estimatedDistanceKm ?? "?"}km`).join(" | "));
}
console.log("debug technical/ansar");
for (const route of response.debugRoutes.filter((r) => r.segments.some((s) => s.endLocation.includes("Technical") || s.endLocation.includes("Ansar"))).slice(0,50)) {
  console.log(route.kind, route.summary, route.estimatedDurationMinutes, route.estimatedDistanceKm, route.totalCost, route.segments.map((s)=>`${s.mode}:${s.startLocation}->${s.endLocation}:${s.connectorType??""}`).join(" | "));
}
