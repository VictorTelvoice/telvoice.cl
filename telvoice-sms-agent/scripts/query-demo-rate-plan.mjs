import "dotenv/config";
import pg from "pg";
const demo = "6cd1db92-d5c7-45e0-8548-df8907843350";
const cs = process.env.DATABASE_URL?.trim();
const c = new pg.Client({
  connectionString: cs,
  ssl: cs.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});
await c.connect();
const r = await c.query(
  `SELECT crp.id, crp.country, crp.traffic_type, crp.live_enabled, crp.rate_plan_id,
          srp.name, srp.code
   FROM company_rate_plans crp
   LEFT JOIN sms_rate_plans srp ON srp.id = crp.rate_plan_id
   WHERE crp.company_id = $1 AND crp.status = 'active'`,
  [demo],
);
console.log(JSON.stringify(r.rows, null, 2));
await c.end();
