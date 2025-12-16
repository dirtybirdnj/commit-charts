import { Octokit } from '@octokit/rest';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Read config
const config = JSON.parse(readFileSync(join(rootDir, 'repos.config.json'), 'utf-8'));

// Initialize Octokit (uses GITHUB_TOKEN env var if available)
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

async function fetchCommits(owner, repo) {
  const commits = [];
  let page = 1;

  console.log(`Fetching commits for ${owner}/${repo}...`);

  while (true) {
    try {
      const response = await octokit.repos.listCommits({
        owner,
        repo,
        per_page: 100,
        page
      });

      if (response.data.length === 0) break;

      commits.push(...response.data.map(commit => ({
        date: commit.commit.author.date.split('T')[0],
        project: repo,
        type: 'commit',
        msg: commit.commit.message.split('\n')[0], // First line only
        sha: commit.sha.substring(0, 7)
      })));

      if (response.data.length < 100) break;
      page++;
    } catch (error) {
      console.error(`Error fetching commits for ${repo}:`, error.message);
      break;
    }
  }

  console.log(`  Found ${commits.length} commits`);
  return commits;
}

async function fetchPRs(owner, repo) {
  const prs = [];
  let page = 1;

  console.log(`Fetching PRs for ${owner}/${repo}...`);

  while (true) {
    try {
      const response = await octokit.pulls.list({
        owner,
        repo,
        state: 'all',
        per_page: 100,
        page
      });

      if (response.data.length === 0) break;

      prs.push(...response.data.map(pr => ({
        date: pr.created_at.split('T')[0],
        project: repo,
        type: 'pr',
        msg: `PR #${pr.number}: ${pr.title}`,
        number: pr.number,
        state: pr.state,
        merged: pr.merged_at !== null
      })));

      if (response.data.length < 100) break;
      page++;
    } catch (error) {
      console.error(`Error fetching PRs for ${repo}:`, error.message);
      break;
    }
  }

  console.log(`  Found ${prs.length} PRs`);
  return prs;
}

async function main() {
  const allCommits = [];
  const allPRs = [];

  // Fetch data from all repos
  for (const repo of config.repos) {
    const commits = await fetchCommits(config.owner, repo.name);
    const prs = await fetchPRs(config.owner, repo.name);

    allCommits.push(...commits);
    allPRs.push(...prs);
  }

  // Combine commits and PRs
  let allData = [...allCommits, ...allPRs].sort((a, b) =>
    new Date(a.date) - new Date(b.date)
  );

  // Apply date filter if configured
  if (config.startDate) {
    const startDate = config.startDate;
    allData = allData.filter(d => d.date >= startDate);
    console.log(`\nFiltered to commits from ${startDate} onwards`);
  }

  // Calculate date range
  const dates = allData.map(d => new Date(d.date));
  const minDate = new Date(Math.min(...dates));
  const maxDate = new Date(Math.max(...dates));

  // Apply padding
  const padding = config.dateRange?.padding || 7;
  minDate.setDate(minDate.getDate() - padding);
  maxDate.setDate(maxDate.getDate() + padding);

  // Generate daily stats (commit counts per project per day) - use filtered data
  const statsMap = new Map();
  allData.filter(d => d.type === 'commit').forEach(commit => {
    const key = `${commit.date}-${commit.project}`;
    if (!statsMap.has(key)) {
      statsMap.set(key, { date: commit.date, project: commit.project, commits: 0 });
    }
    statsMap.get(key).commits++;
  });
  const stats = Array.from(statsMap.values()).sort((a, b) =>
    new Date(a.date) - new Date(b.date)
  );

  // Build repo colors map
  const colors = {};
  config.repos.forEach(r => {
    colors[r.name] = r.color;
  });

  // Create meta info
  const meta = {
    lastUpdated: new Date().toISOString(),
    dateRange: {
      start: minDate.toISOString().split('T')[0],
      end: maxDate.toISOString().split('T')[0]
    },
    projects: config.repos.map(r => r.name),
    colors,
    totals: {
      commits: allData.filter(d => d.type === 'commit').length,
      prs: allData.filter(d => d.type === 'pr').length,
      projects: config.repos.length
    }
  };

  // Ensure data directory exists
  const dataDir = join(rootDir, 'data');
  mkdirSync(dataDir, { recursive: true });

  // Write output files
  writeFileSync(
    join(dataDir, 'commits.json'),
    JSON.stringify(allData, null, 2)
  );
  console.log(`\nWrote ${allData.length} items to data/commits.json`);

  writeFileSync(
    join(dataDir, 'stats.json'),
    JSON.stringify(stats, null, 2)
  );
  console.log(`Wrote ${stats.length} daily stats to data/stats.json`);

  writeFileSync(
    join(dataDir, 'meta.json'),
    JSON.stringify(meta, null, 2)
  );
  console.log(`Wrote metadata to data/meta.json`);

  console.log(`\nDate range: ${meta.dateRange.start} to ${meta.dateRange.end}`);
  console.log(`Total: ${meta.totals.commits} commits, ${meta.totals.prs} PRs across ${meta.totals.projects} projects`);
}

main().catch(console.error);
