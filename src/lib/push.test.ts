import { afterEach, describe, expect, it } from "vitest";
import { buildNotificationPayload, isVapidConfigured } from "./push";

const VAPID_KEYS = ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"];

function clearVapid() {
  for (const key of VAPID_KEYS) {
    delete process.env[key];
  }
}

afterEach(() => {
  clearVapid();
});

describe("buildNotificationPayload", () => {
  it("task_created defaults to Nueva tarea with the owner URL", () => {
    expect(buildNotificationPayload({ type: "task_created" })).toEqual({
      title: "Nueva tarea",
      body: "Se cargó una nueva tarea.",
      url: "/owner",
    });
  });

  it("task_status defaults to Estado actualizado with the portal URL", () => {
    expect(buildNotificationPayload({ type: "task_status" })).toEqual({
      title: "Estado actualizado",
      body: "Una tarea cambió de estado.",
      url: "/",
    });
  });

  it("task_comment defaults to Nuevo comentario with the owner URL", () => {
    expect(buildNotificationPayload({ type: "task_comment" })).toEqual({
      title: "Nuevo comentario",
      body: "Te dejaron un comentario.",
      url: "/owner",
    });
  });

  it("honors explicit title, body and url overrides", () => {
    expect(
      buildNotificationPayload({
        type: "task_created",
        title: "Mi título",
        body: "Mi cuerpo",
        url: "/owner",
      }),
    ).toEqual({ title: "Mi título", body: "Mi cuerpo", url: "/owner" });
  });
});

describe("isVapidConfigured", () => {
  it("returns false when no VAPID env vars are set", () => {
    clearVapid();
    expect(isVapidConfigured()).toBe(false);
  });

  it("returns false when only some VAPID env vars are set", () => {
    clearVapid();
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "pub";
    expect(isVapidConfigured()).toBe(false);
  });

  it("returns true when all three VAPID env vars are set", () => {
    clearVapid();
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "pub";
    process.env.VAPID_PRIVATE_KEY = "priv";
    process.env.VAPID_SUBJECT = "mailto:test@example.com";
    expect(isVapidConfigured()).toBe(true);
  });
});
