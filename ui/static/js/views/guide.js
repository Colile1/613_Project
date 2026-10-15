// guide.js : User guide - getting started, a tour of every page, a demo script, troubleshooting.
import { h, icon, card, pageHead, code, callout } from '../ui.js';

const P = (...t) => h('p', {}, ...t);
const B = (t) => h('b', {}, t);
const section = (iconName, title, ...body) => h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('div', { class: 'row' }, icon(iconName), h('h3', {}, title))), ...body);

const TOUR = [
  ['dashboard', 'Overview', 'The whole pipeline as five connected stages with live counts. Click a stage to open it. The rubric table shows where each marking criterion is demonstrated.'],
  ['input', '1 · Extract', 'Tune the simulator (rate, duplicates, out-of-order, late, malformed, fraud spikes, bursts) and watch the live feed. Each row shows its flags; click a row for the exact JSON sent to Event Hubs. Sub-tabs show the schema, the 50-card reference data and producer.py.'],
  ['move_to_inbox', '2 · Ingest', 'Event Hubs view: events per partition (key card_id), throughput per second with visible bursts, and the arrival-lag bands that Stream Analytics must absorb.'],
  ['transform', '3 · Transform', 'Stream Analytics view: change the late-arrival and out-of-order tolerances or the alert thresholds and press "Apply and re-process". Each of the six query steps opens to show its SQL and how many documents it produced.'],
  ['database', '4 · Warehouse', 'Cosmos DB view: the three containers with partition key, TTL and throughput, and six sub-tabs. Search, filter on a field, sort by clicking a column header, export a whole tab as CSV or JSON, or switch to Data model for the lineage diagram, relationships and field profiles.'],
  ['manage_search', 'Query', 'Query the whole warehouse two ways and switch at any time: the drag-and-drop builder (automatic joins, calculated columns, AND/OR filters, Having, custom grouping) or SQL with highlighting and autocomplete. Save any query as a view. Results show as a table or chart and export as CSV or JSON.'],
  ['monitoring', '5 · Analytics', 'The Power BI pages: Live operations, Fraud trends (top 10 flagged cards turn red above 5 alerts), Pipeline health and the Card detail drill-through. Use the slicers to filter by tier, category and alert type.'],
  ['cloud', 'Azure', 'Run: the real producer.py (duration, rate, malformed share, burst). Settings: simulator/.env form (secrets never shown back), fetch the connection string, install packages. Deploy: sign in, deploy everything, start / stop the Stream Analytics job, upload card data, delete all - each with a confirmation. Cost: estimator and a session cost log written to docs/cost_tracking.md.'],
  ['build', 'Tools', 'Run the velocity and amount studies, regenerate the card reference data, rebuild the architecture diagram, capture screenshots of every page, tick todo.md and add log.md entries, back up, restore and import sessions.'],
  ['folder_open', 'Project files', 'Read every document, query, template and data file of the project without leaving the app.'],
];

export default {
  mount(root) {
    root.append(
      pageHead('Help', 'User guide', 'Everything you need to run the control centre, demonstrate the pipeline and take it to Azure.'),
      h('div', { class: 'grid g2' },
        section('rocket_launch', 'Getting started',
          P('From the project root, start the app (Python 3.10+, no extra packages needed):'),
          code('python -m ui\n# options: --port 8613  --no-browser'),
          P('Your browser opens at ', B('http://127.0.0.1:8613'), '. The server only listens on this computer.'),
          P('Then press ', B('Generate 5 min of data'), ' on the Overview, or the play button in the top bar for a live stream.')),
        section('tune', 'The top bar controls',
          h('ul', {},
            h('li', {}, B('Play / pause'), ' - runs the simulated clock live.'),
            h('li', {}, B('Speed (1x-60x)'), ' - simulated seconds per real second. 10x turns one real minute into ten simulated minutes.'),
            h('li', {}, B('Fast-forward'), ' - instantly adds one simulated minute of traffic.'),
            h('li', {}, B('Bolt'), ' - forces a 30-second burst at 5x the rate.'),
            h('li', {}, B('Session chip'), ' - shows the open session; click it to switch, create, rename, export or delete sessions and back up the database.'),
            h('li', {}, B('Clear'), ' - deletes the open session’s events (settings stay). Azure is never touched.'),
            h('li', {}, B('Moon'), ' - switches light and dark theme.')))),
      section('save', 'Saving and sessions',
        P('You never need to save. Every simulated second of events, every setting, the page you are on, its tabs and filters, and the theme are written to a SQLite database as they change (', h('code', {}, 'ui/data/control_centre.db'), ').'),
        h('ul', {},
          h('li', {}, B('Restart safe: '), 'close the browser or stop the app with Ctrl+C; the next start reopens the same session, page and filters. If the stream was running you are offered to resume it.'),
          h('li', {}, B('Sessions: '), 'keep separate runs side by side, e.g. "Practice" and "Demo for marker". Each has its own events, clock and settings.'),
          h('li', {}, B('Same view everywhere: '), 'two browser tabs show the same session and live data; theme changes follow across tabs.'),
          h('li', {}, B('Backups: '), 'the Sessions dialog writes a consistent copy to ui/data/backups/, or exports one session as JSON.'))),
      section('manage_search', 'Querying the warehouse',
        P('Open ', B('Query'), ' in the rail. Two modes, one query - switch with ', B('Drag & drop / SQL'), ' at any time:'),
        h('ul', {},
          h('li', {}, B('Tables & joins: '), 'drag a table in. Drop a column from another table and it is joined automatically (on card_id, transaction_id... from the Data model); change the join type or its ON condition in place.'),
          h('li', {}, B('Columns: '), 'value, count, count distinct, sum, average, min or max, an output name, Distinct rows, and calculated columns for any expression - CASE, ROUND(), window functions such as RANK() OVER (...).'),
          h('li', {}, B('Filters: '), 'match All (AND) or Any (OR); =, !=, >, <, contains, starts / ends with, like, in list, between, empty; or a custom condition in SQL.'),
          h('li', {}, B('Group by / Having / Sort: '), 'grouping is automatic (or customise it); Having filters groups (COUNT(*) > 5); sort by any output, column or expression; Limit and Offset.'),
          h('li', {}, B('SQL: '), 'highlighting, autocomplete (type an alias and a dot for that table\u2019s columns; Ctrl + Space), Format, Ctrl + Enter to run.'),
          h('li', {}, B('Back to the builder: '), 'any single SELECT opens in the builder. WITH, UNION and sub-queries in FROM can be ', B('saved as a view'), ' - the view then appears in the schema panel and the builder uses it like a table.'),
          h('li', {}, B('Library: '), 'eight example queries, your saved queries (they reopen in the mode you saved them in) and the last 20 queries you ran.')),
        P('Queries are read-only and run on a copy of the current session\u2019s warehouse: tables events, cards, card_windows, category_trends, transactions, velocity_alerts, high_amount_alerts, dead_letter, views aggregates and fraud_alerts named after the Cosmos DB containers, and your saved views.')),
      card('Tour of the pages', null, h('div', { class: 'grid g2' }, TOUR.map(([i, t, d]) =>
        h('div', { class: 'row', style: { alignItems: 'flex-start', flexWrap: 'nowrap' } }, h('div', { class: 'icon-tile' }, icon(i)),
          h('div', {}, h('h4', {}, t), h('p', { class: 'muted small' }, d)))))),
      h('div', { class: 'grid g2' },
        section('slideshow', 'A five-minute demo script',
          h('ol', { class: 'steps' },
            h('li', {}, h('div', {}, B('Overview. '), 'Explain the scenario and the five stages. Press "Generate 5 min of data".')),
            h('li', {}, h('div', {}, B('Extract. '), 'Point out out-of-order, late, duplicate and burst flags in the live feed; open one event as JSON.')),
            h('li', {}, h('div', {}, B('Ingest. '), 'Show the even partition spread and the burst spikes in throughput.')),
            h('li', {}, h('div', {}, B('Transform. '), 'Open query 4 and 5. Read the tuning insight, raise the velocity threshold to 15 and re-process.')),
            h('li', {}, h('div', {}, B('Warehouse. '), 'Walk through the containers and sub-tabs; search a card; show a dead-letter reason.')),
            h('li', {}, h('div', {}, B('Analytics. '), 'Show Fraud trends, click a red card to drill through, then Pipeline health.')))),
        section('help', 'Troubleshooting',
          h('ul', {},
            h('li', {}, B('Warehouse tabs are empty: '), 'windows close only when the watermark passes them. Generate another simulated minute.'),
            h('li', {}, B('Almost every event raises a VELOCITY alert: '), 'this session was generated with the old 50-card pool. Start a new session: the simulator now uses 5 000 cards (docs/decisions/velocity_rule.md).'),
            h('li', {}, B('No dead-letter events: '), 'raise "Malformed events" in Extract. On Azure, producer.py sends 1% malformed events by default (--malformed).'),
            h('li', {}, B('"Start producer" is greyed out: '), 'fill in simulator/.env and install the requirements on the Azure page.'),
            h('li', {}, B('Icons show as words: '), 'the icon font loads from Google Fonts; connect to the internet once.'),
            h('li', {}, B('Port already in use: '), h('code', {}, 'python -m ui --port 8700')),
            h('li', {}, B('"Use this query in the builder?": '), 'the query uses WITH, UNION or a sub-query in FROM. Save it as a view and build on top of it, or keep working in SQL.'),
            h('li', {}, B('Query results look old: '), 'queries run on a snapshot; when new events arrive the page says so - press Run again.')))),
      callout('info', 'Local mode mirrors Azure: the same schema, partition key, query steps and container layout. Use it to practise and to capture screenshots, then run the real producer from the Azure page for the live cloud demo.'));
  },
};