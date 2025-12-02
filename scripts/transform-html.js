// Script to transform HTML files to use dynamic data loading
import { readFileSync, writeFileSync } from 'fs';

function transformInteractiveSentiment() {
    let content = readFileSync('interactive-sentiment.html', 'utf8');

    // 1. Add loading div and replace hardcoded data section with dynamic loading
    const oldDataSection = `    <div class="tooltip" id="tooltip"></div>

    <script>
        // ============ DATA ============
        const projects = ["wolfpack", "gellyscope", "gellyscape", "drunk-simulator", "vt-geodata", "svg-grouper"];
        const colors = {
            "wolfpack": "#f97316",
            "gellyscope": "#22c55e",
            "gellyscape": "#3b82f6",
            "drunk-simulator": "#ec4899",
            "vt-geodata": "#a855f7",
            "svg-grouper": "#eab308"
        };`;

    const newDataSection = `    <div class="tooltip" id="tooltip"></div>

    <div id="loading" style="text-align: center; padding: 40px; color: #8b949e;">
        Loading data...
    </div>

    <script>
        // ============ DATA (loaded from JSON) ============
        let projects, colors, allData, startDate, endDate, meta;
        const parseDate = d3.timeParse("%Y-%m-%d");

        async function loadData() {
            try {
                const [commitsRes, metaRes] = await Promise.all([
                    fetch('data/commits.json'),
                    fetch('data/meta.json')
                ]);
                const commits = await commitsRes.json();
                meta = await metaRes.json();
                projects = meta.projects;
                colors = meta.colors;

                // URL params for custom date range
                const urlParams = new URLSearchParams(window.location.search);
                startDate = parseDate(urlParams.get('start') || meta.dateRange.start);
                endDate = parseDate(urlParams.get('end') || meta.dateRange.end);

                // Process commits with sentiment
                allData = commits.map(d => ({
                    ...d,
                    dateObj: parseDate(d.date),
                    sentiment: calculateSentiment(d.msg)
                }));

                document.getElementById('loading').style.display = 'none';
                return true;
            } catch (error) {
                console.error('Failed to load data:', error);
                document.getElementById('loading').innerHTML = 'Failed to load data. <a href="#" onclick="location.reload()">Retry</a>';
                return false;
            }
        }`;

    content = content.replace(oldDataSection, newDataSection);

    // 2. Remove the hardcoded allData array and processing code
    // Pattern: from "// Combined commit and PR data" to "const endDate = parseDate..."
    const allDataPattern = /        \/\/ Combined commit and PR data[\s\S]*?const endDate = parseDate\("[^"]+"\);\n\n/;
    content = content.replace(allDataPattern, '');

    // 3. Add async init wrapper after getItemId function
    content = content.replace(
        `        function getItemId(d) {
            return \`item-\${hashCode(d.date + d.project + d.msg)}\`;
        }

        // ============ STATE ============`,
        `        function getItemId(d) {
            return \`item-\${hashCode(d.date + d.project + d.msg)}\`;
        }

        // Main initialization
        async function init() {
            if (!await loadData()) return;

        // ============ STATE ============`
    );

    // 4. Close init function and call it at the end
    content = content.replace(
        `        // Initial render
        updateChart();
    </script>`,
        `        // Initial render
        updateChart();
        }

        // Start the application
        init();
    </script>`
    );

    writeFileSync('interactive-sentiment.html', content);
    console.log('Transformed interactive-sentiment.html');
}

function transformChartExamples() {
    // chart-examples.html was already transformed, just verify
    const content = readFileSync('chart-examples.html', 'utf8');
    if (content.includes('async function loadData()')) {
        console.log('chart-examples.html already transformed');
    } else {
        console.log('chart-examples.html needs transformation');
    }
}

transformInteractiveSentiment();
transformChartExamples();
console.log('Done!');
