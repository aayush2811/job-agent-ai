/**
 * Backfill userId on legacy jobs for SaaS multi-tenant visibility.
 *
 * Usage:
 *   node scripts/migrate-job-ownership.js --dry-run
 *   node scripts/migrate-job-ownership.js
 *   node scripts/migrate-job-ownership.js --user-id=<mongoObjectId>
 */
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const mongoose = require("mongoose");
const Job = require("../src/jobs/job.model");
const User = require("../src/users/user.model");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const userArg = args.find((a) => a.startsWith("--user-id="));
const targetUserId = userArg ? userArg.split("=")[1] : null;

async function resolveTargetUserId() {
  if (targetUserId) {
    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      throw new Error(`Invalid --user-id: ${targetUserId}`);
    }
    const u = await User.findById(targetUserId).lean();
    if (!u) throw new Error(`User not found: ${targetUserId}`);
    return String(u._id);
  }

  const fromEnv = process.env.DEFAULT_PIPELINE_USER_ID;
  if (fromEnv && mongoose.Types.ObjectId.isValid(fromEnv)) {
    const u = await User.findById(fromEnv).lean();
    if (u) return String(u._id);
  }

  const admin = await User.findOne({ role: "admin" }).sort({ createdAt: 1 }).lean();
  if (admin?._id) return String(admin._id);

  const first = await User.findOne().sort({ createdAt: 1 }).lean();
  if (first?._id) return String(first._id);

  throw new Error("No target user — set DEFAULT_PIPELINE_USER_ID or --user-id=");
}

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error("[Migrate] MONGO_URI required");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("[Migrate] MongoDB connected");
  console.log("[Migrate] dry-run:", dryRun);

  const ownerId = await resolveTargetUserId();
  const owner = await User.findById(ownerId).select("email name role").lean();
  console.log("[Migrate] target owner:", {
    id: ownerId,
    email: owner?.email,
    name: owner?.name,
    role: owner?.role,
  });

  const filter = {
    $or: [{ userId: null }, { userId: { $exists: false } }],
  };

  const missing = await Job.countDocuments(filter);
  console.log("[Migrate] jobs missing userId:", missing);

  if (missing === 0) {
    console.log("[Migrate] nothing to do");
    await mongoose.disconnect();
    process.exit(0);
  }

  const sample = await Job.find(filter).limit(5).select("role company status createdAt").lean();
  console.log("[Migrate] sample orphans:", sample);

  if (dryRun) {
    console.log("[Migrate] dry-run — would assign", missing, "jobs to", ownerId);
    await mongoose.disconnect();
    process.exit(0);
  }

  const result = await Job.updateMany(filter, { $set: { userId: ownerId } });
  console.log("[Migrate] jobs reassigned:", result.modifiedCount);
  console.log("[Migrate] jobs skipped:", missing - (result.modifiedCount || 0));

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("[Migrate] failed:", err.message);
  process.exit(1);
});
