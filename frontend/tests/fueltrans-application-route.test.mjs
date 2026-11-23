import test from "node:test";
import assert from "node:assert/strict";
import {
  FUELTRANS_APPLICATION_ROUTE,
  FUELTRANS_BOARD_ID,
  fuelTransApplicationHref,
  parseFuelTransApplicationRoute,
} from "../fueltrans-application-route.js";

test("FuelTrans uses one canonical native application route and the existing board identity", () => {
  assert.equal(FUELTRANS_APPLICATION_ROUTE, "#/fueltrans");
  assert.equal(FUELTRANS_BOARD_ID, "b520cefe-6abb-446a-abec-ae5589329a99");
  assert.equal(fuelTransApplicationHref(), "#/fueltrans");
  assert.equal(fuelTransApplicationHref("dashboard"), "#/fueltrans/dashboard");
  assert.equal(
    fuelTransApplicationHref("ticket/123"),
    "#/fueltrans/ticket/123",
  );
});

test("FuelTrans route parser preserves supported nested application navigation", () => {
  assert.deepEqual(parseFuelTransApplicationRoute(["fueltrans"]), {
    route: "dashboard",
    canonicalHash: "#/fueltrans",
  });
  assert.deepEqual(parseFuelTransApplicationRoute(["fueltrans", "tickets"]), {
    route: "tickets",
    canonicalHash: "#/fueltrans/tickets",
  });
  assert.deepEqual(
    parseFuelTransApplicationRoute(["fueltrans", "ticket", "123"]),
    {
      route: "ticket/123",
      canonicalHash: "#/fueltrans/ticket/123",
    },
  );
  assert.equal(
    parseFuelTransApplicationRoute(["boards", FUELTRANS_BOARD_ID]),
    null,
  );
});
