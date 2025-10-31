import request from "supertest";
import { app } from "../../src/app.js";
import Job from "../../src/models/Jobs.js";
import Customer from "../../src/models/Customer.js";

describe("Public intake API", () => {
  test("creates a job with normalized payload", async () => {
    const payload = {
      name: "Jane Doe",
      phone: "+15555550123",
      pickupAddress: "123 Main St",
      serviceType: "Towing",
      notes: "Flat tire",
    };

    const res = await request(app).post("/api/public/jobs").send(payload);

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.jobId).toBeDefined();

    const job = await Job.findById(res.body.jobId).lean();
    expect(job).toBeTruthy();
    expect(job.serviceType).toBe("Towing");
    expect(job.pickupAddress).toBe("123 Main St");

    const customer = await Customer.findOne({ phone: "+15555550123" }).lean();
    expect(customer).toBeTruthy();
    expect(customer.name).toBe("Jane Doe");
  });

  test("rejects invalid payloads", async () => {
    const res = await request(app).post("/api/public/jobs").send({
      phone: "+15555550123",
      serviceType: "Towing",
    });

    expect(res.status).toBe(400);
    expect(res.body?.message).toBeDefined();
  });
});
