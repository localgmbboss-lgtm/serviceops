import request from "supertest";
import { randomBytes } from "crypto";
import { app } from "../../src/app.js";
import Customer from "../../src/models/Customer.js";
import Job from "../../src/models/Jobs.js";
import Bid from "../../src/models/Bid.js";
import Vendor from "../../src/models/Vendor.js";

const createTestCustomer = () =>
  Customer.create({
    name: "Test Customer",
    phone: "+15555550000",
  });

const createJob = async (overrides = {}) => {
  const customer = await createTestCustomer();
  const job = await Job.create({
    customerId: customer._id,
    status: "Unassigned",
    serviceType: "Towing",
    biddingOpen: true,
    vendorToken: overrides.vendorToken || randomBytes(8).toString("hex"),
    created: new Date(),
    ...overrides,
  });
  return { job, customer };
};

describe("Bid routes", () => {
  test("accepts a vendor bid", async () => {
    const { job } = await createJob();

    const res = await request(app)
      .post(`/api/bids/${job.vendorToken}`)
      .send({
        vendorName: "Tow Hero",
        vendorPhone: "+15555551234",
        etaMinutes: 30,
        price: 120,
      });

    expect(res.status).toBe(201);
    expect(res.body._id).toBeDefined();

    const bid = await Bid.findById(res.body._id).lean();
    expect(bid).toBeTruthy();
    expect(bid.vendorName).toBe("Tow Hero");
    expect(bid.price).toBe(120);
  });

  test("rejects invalid vendor bid payload", async () => {
    const { job } = await createJob();

    const res = await request(app)
      .post(`/api/bids/${job.vendorToken}`)
      .send({
        vendorPhone: "+15555551234",
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBeDefined();
  });

  test("selects a bid and assigns vendor", async () => {
    const { job } = await createJob();

    const bidRes = await request(app)
      .post(`/api/bids/${job.vendorToken}`)
      .send({
        vendorName: "Tow Squad",
        vendorPhone: "+15555554321",
        etaMinutes: 25,
        price: 150,
      });

    const bidId = bidRes.body._id;
    const selectRes = await request(app)
      .post(`/api/bids/${bidId}/select`)
      .send();

    expect(selectRes.status).toBe(200);
    expect(selectRes.body.ok).toBe(true);

    const updatedJob = await Job.findById(job._id).lean();
    expect(updatedJob.status).toBe("Assigned");
    expect(updatedJob.vendorName).toBe("Tow Squad");
    expect(updatedJob.vendorPhone).toBe("+15555554321");
    expect(updatedJob.vendorId).toBeTruthy();

    const vendor = await Vendor.findById(updatedJob.vendorId).lean();
    expect(vendor).toBeTruthy();
    expect(vendor.phone).toBe("+15555554321");
  });
});
