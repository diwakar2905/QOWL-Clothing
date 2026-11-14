/** Run periodic jobs once (for a system cron or worker): npm run jobs:run */
import "dotenv/config";

async function main() {
  const url = `${process.env.APP_URL}/api/cron/jobs`;
  const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
  console.log(res.status, await res.text());
  if (!res.ok) process.exit(1);
}
main();
