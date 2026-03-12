#!/usr/bin/env bun
/**
 * Migrate GitHub stars to Codeberg.
 *
 * Usage:
 *   GITHUB_TOKEN=ghp_... CODEBERG_TOKEN=... bun run scripts/migrate-stars.ts
 *
 * The script will:
 *   1. Fetch all your GitHub starred repos (paginated)
 *   2. For each one, try to find it on Codeberg (exact match or mirror of the GH repo)
 *   3. Star it on Codeberg if found
 *   4. Write a report to data/migrate-stars-report.json
 */

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const CODEBERG_TOKEN = process.env.CODEBERG_TOKEN;

if (!GITHUB_TOKEN) {
  console.error("Error: GITHUB_TOKEN env var is required");
  process.exit(1);
}
if (!CODEBERG_TOKEN) {
  console.error("Error: CODEBERG_TOKEN env var is required");
  process.exit(1);
}

const GH_API = "https://api.github.com";
const CB_API = "https://codeberg.org/api/v1";

// Rate-limit: add a small delay between Codeberg requests to be polite
const DELAY_MS = 300;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── GitHub helpers ────────────────────────────────────────────────────────────

interface GHRepo {
  full_name: string; // "owner/repo"
  name: string;
  owner: { login: string };
  html_url: string;
}

async function fetchAllGithubStars(): Promise<GHRepo[]> {
  const stars: GHRepo[] = [];
  let page = 1;
  while (true) {
    const res = await fetch(
      `${GH_API}/user/starred?per_page=100&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );
    if (!res.ok) {
      throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
    }
    const batch: GHRepo[] = await res.json();
    if (batch.length === 0) break;
    stars.push(...batch);
    console.log(`  Fetched page ${page} (${batch.length} repos, total so far: ${stars.length})`);
    if (batch.length < 100) break;
    page++;
  }
  return stars;
}

// ── Codeberg helpers ──────────────────────────────────────────────────────────

interface CBRepo {
  id: number;
  full_name: string; // "owner/repo"
  name: string;
  owner: { login: string };
  mirror: boolean;
  original_url?: string;
}

async function cbGet(path: string): Promise<Response> {
  return fetch(`${CB_API}${path}`, {
    headers: {
      Authorization: `token ${CODEBERG_TOKEN}`,
      "Content-Type": "application/json",
    },
  });
}

async function cbPut(path: string): Promise<Response> {
  return fetch(`${CB_API}${path}`, {
    method: "PUT",
    headers: {
      Authorization: `token ${CODEBERG_TOKEN}`,
      "Content-Type": "application/json",
    },
  });
}

/** Check if an exact owner/repo exists on Codeberg. Returns the repo or null. */
async function findExactOnCodeberg(owner: string, repo: string): Promise<CBRepo | null> {
  const res = await cbGet(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
  if (res.status === 200) return res.json();
  return null;
}

/**
 * Search Codeberg for a mirror whose original_url matches the GitHub repo URL.
 * Falls back to searching by repo name and filtering mirrors.
 */
async function findMirrorOnCodeberg(ghRepo: GHRepo): Promise<CBRepo | null> {
  // Search by repo name, check if any result is a mirror of the GH repo
  const res = await cbGet(
    `/repos/search?q=${encodeURIComponent(ghRepo.name)}&limit=50`
  );
  if (!res.ok) return null;
  const data: { data: CBRepo[] } = await res.json();
  const ghUrl = ghRepo.html_url.toLowerCase().replace(/\/$/, "");
  for (const r of data.data ?? []) {
    if (r.mirror && r.original_url) {
      const origUrl = r.original_url.toLowerCase().replace(/\/$/, "").replace(/\.git$/, "");
      if (origUrl === ghUrl) return r;
    }
  }
  return null;
}

/** Star a Codeberg repo. Returns true on success. */
async function starOnCodeberg(owner: string, repo: string): Promise<boolean> {
  const res = await cbPut(
    `/user/starred/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
  );
  // 204 = starred, 200 = already starred (some Gitea versions)
  return res.status === 204 || res.status === 200;
}

// ── Report types ──────────────────────────────────────────────────────────────

type Status = "starred" | "mirror_starred" | "not_found" | "error";

interface ReportEntry {
  github: string;
  codeberg?: string;
  status: Status;
  note?: string;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== GitHub → Codeberg star migration ===\n");

  console.log("Step 1: Fetching GitHub stars...");
  const ghStars = await fetchAllGithubStars();
  console.log(`  Total GitHub stars: ${ghStars.length}\n`);

  const report: ReportEntry[] = [];
  let countStarred = 0;
  let countMirror = 0;
  let countNotFound = 0;
  let countError = 0;

  console.log("Step 2: Processing each star...\n");

  for (let i = 0; i < ghStars.length; i++) {
    const gh = ghStars[i];
    const prefix = `[${i + 1}/${ghStars.length}] ${gh.full_name}`;

    try {
      // a) Try exact match
      const exact = await findExactOnCodeberg(gh.owner.login, gh.name);
      await sleep(DELAY_MS);

      if (exact) {
        const ok = await starOnCodeberg(exact.owner.login, exact.name);
        await sleep(DELAY_MS);
        if (ok) {
          console.log(`  ✓ ${prefix} → starred (exact: ${exact.full_name})`);
          report.push({ github: gh.full_name, codeberg: exact.full_name, status: "starred" });
          countStarred++;
          continue;
        }
      }

      // b) Try mirror search
      const mirror = await findMirrorOnCodeberg(gh);
      await sleep(DELAY_MS);

      if (mirror) {
        const ok = await starOnCodeberg(mirror.owner.login, mirror.name);
        await sleep(DELAY_MS);
        if (ok) {
          console.log(`  ~ ${prefix} → mirror starred (${mirror.full_name})`);
          report.push({ github: gh.full_name, codeberg: mirror.full_name, status: "mirror_starred" });
          countMirror++;
          continue;
        }
      }

      // c) Not found
      console.log(`  ✗ ${prefix} → not found on Codeberg`);
      report.push({ github: gh.full_name, status: "not_found" });
      countNotFound++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ! ${prefix} → error: ${msg}`);
      report.push({ github: gh.full_name, status: "error", note: msg });
      countError++;
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  console.log("\n=== Summary ===");
  console.log(`  Starred (exact match): ${countStarred}`);
  console.log(`  Starred (mirror):      ${countMirror}`);
  console.log(`  Not found:             ${countNotFound}`);
  console.log(`  Errors:                ${countError}`);
  console.log(`  Total processed:       ${ghStars.length}`);

  // ── Write report ───────────────────────────────────────────────────────────

  const reportPath = "data/migrate-stars-report.json";
  await Bun.write(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nFull report written to ${reportPath}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
