import { describe, expect, it } from "vitest";
import { openApiDocument } from "@/lib/openapi/document";

describe("OpenAPI document", () => {
  it("documents every v1 endpoint with auth, schemas, errors, and an example", () => {
    expect(Object.keys(openApiDocument.paths).sort()).toEqual(["/api/v1/events", "/api/v1/stream"]);

    const report = openApiDocument.paths["/api/v1/events"].post;
    expect(report.security).toEqual([{ apiKey: [] }]);
    expect(report.requestBody.content["application/json"].example.id).toBe("evt-demo-1");
    expect(report.responses["201"].description).toContain("stored");
    for (const status of ["400", "401", "409", "413", "429"] as const) {
      expect(report.responses[status].description.length).toBeGreaterThan(0);
    }

    const stream = openApiDocument.paths["/api/v1/stream"].get;
    expect(stream.security).toEqual([{ session: [] }]);
    expect(stream.parameters.some((parameter) => parameter.name === "projectId" && parameter.required)).toBe(true);
    expect(stream.responses["200"].content["text/event-stream"].example).toContain("data:");
    expect(stream.responses["401"].description.length).toBeGreaterThan(0);
    expect(stream.responses["403"].description.length).toBeGreaterThan(0);
  });
});
