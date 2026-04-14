import bcrypt from "bcryptjs";
import { db } from "../server/db";
import { customerAccounts, jobs, quotes, systemSettings } from "../shared/schema";

async function seed() {
  console.log("Seeding database...");

  // Create sample customer account
  const passwordHash = await bcrypt.hash("demo123", 10);
  
  try {
    await db.insert(customerAccounts).values({
      accountCode: "ACME001",
      accountName: "ACME Corporation",
      passwordHash,
    }).onConflictDoNothing();

    await db.insert(customerAccounts).values({
      accountCode: "BETA002",
      accountName: "Beta Industries",
      passwordHash,
    }).onConflictDoNothing();

    console.log("Created customer accounts");

    // Create sample jobs
    const jobsData = [
      {
        jobId: "JOB-2024-001",
        accountCode: "ACME001",
        siteName: "ACME HQ - Main Building",
        status: "in_progress",
        createdDate: new Date("2024-12-01"),
        lastUpdatedDate: new Date("2024-12-15"),
        shortDescription: "HVAC system maintenance and repair",
        engineerName: "John Smith",
        priority: "Gold",
        jobValueEstimate: "2500.00",
      },
      {
        jobId: "JOB-2024-002",
        accountCode: "ACME001",
        siteName: "ACME Warehouse",
        status: "awaiting_parts",
        createdDate: new Date("2024-12-05"),
        lastUpdatedDate: new Date("2024-12-18"),
        shortDescription: "Refrigeration unit replacement",
        engineerName: "Sarah Johnson",
        priority: "Standard",
        jobValueEstimate: "8500.00",
      },
      {
        jobId: "JOB-2024-003",
        accountCode: "ACME001",
        siteName: "ACME Regional Office",
        status: "completed",
        createdDate: new Date("2024-11-15"),
        lastUpdatedDate: new Date("2024-12-01"),
        shortDescription: "Emergency boiler repair",
        engineerName: "Mike Wilson",
        priority: "Gold",
        jobValueEstimate: "1200.00",
      },
      {
        jobId: "JOB-2024-004",
        accountCode: "ACME001",
        siteName: "ACME Data Center",
        status: "scheduled",
        createdDate: new Date("2024-12-10"),
        lastUpdatedDate: new Date("2024-12-20"),
        shortDescription: "Cooling system upgrade",
        engineerName: "Tom Davis",
        priority: "Gold",
        jobValueEstimate: "15000.00",
      },
      {
        jobId: "JOB-2024-005",
        accountCode: "BETA002",
        siteName: "Beta Factory Floor",
        status: "in_progress",
        createdDate: new Date("2024-12-08"),
        lastUpdatedDate: new Date("2024-12-16"),
        shortDescription: "Industrial ventilation maintenance",
        engineerName: "John Smith",
        priority: "Standard",
        jobValueEstimate: "3200.00",
      },
    ];

    for (const job of jobsData) {
      await db.insert(jobs).values(job).onConflictDoNothing();
    }

    console.log("Created sample jobs");

    // Create sample quotes
    const quotesData = [
      {
        quoteId: "QUO-2024-001",
        jobId: "JOB-2024-002",
        accountCode: "ACME001",
        quoteStatus: "awaiting_approval",
        netTotal: "7083.33",
        vatTotal: "1416.67",
        grossTotal: "8500.00",
        quoteDate: new Date("2024-12-10"),
        leadTimeText: "2-3 weeks for parts delivery",
        topLinesSummary: "1x Industrial Refrigeration Unit, Installation Labour, Disposal of old unit",
      },
      {
        quoteId: "QUO-2024-002",
        jobId: "JOB-2024-004",
        accountCode: "ACME001",
        quoteStatus: "awaiting_approval",
        netTotal: "12500.00",
        vatTotal: "2500.00",
        grossTotal: "15000.00",
        quoteDate: new Date("2024-12-12"),
        leadTimeText: "4-6 weeks",
        topLinesSummary: "2x Precision Cooling Units, Control Panel Upgrade, Installation and Commissioning",
      },
      {
        quoteId: "QUO-2024-003",
        jobId: "JOB-2024-001",
        accountCode: "ACME001",
        quoteStatus: "approved",
        netTotal: "2083.33",
        vatTotal: "416.67",
        grossTotal: "2500.00",
        quoteDate: new Date("2024-12-02"),
        leadTimeText: "1 week",
        topLinesSummary: "HVAC Filter Replacement, Coil Cleaning, Labour",
      },
      {
        quoteId: "QUO-2024-004",
        jobId: "JOB-2024-005",
        accountCode: "BETA002",
        quoteStatus: "awaiting_approval",
        netTotal: "2666.67",
        vatTotal: "533.33",
        grossTotal: "3200.00",
        quoteDate: new Date("2024-12-09"),
        leadTimeText: "1-2 weeks",
        topLinesSummary: "Ventilation System Service, Filter Replacement, Duct Cleaning",
      },
    ];

    for (const quote of quotesData) {
      await db.insert(quotes).values(quote).onConflictDoNothing();
    }

    console.log("Created sample quotes");

    // Set last import timestamp
    await db.insert(systemSettings).values({
      key: "last_import",
      value: new Date().toISOString(),
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: systemSettings.key,
      set: { value: new Date().toISOString(), updatedAt: new Date() },
    });

    console.log("Database seeded successfully!");
    console.log("");
    console.log("Demo credentials:");
    console.log("  Customer: ACME001 / demo123");
    console.log("  Customer: BETA002 / demo123");
    console.log("  Admin: admin123");

  } catch (error) {
    console.error("Seed error:", error);
  }

  process.exit(0);
}

seed();
