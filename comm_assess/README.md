# CommAssess — Corporate Communication Assessment Frappe App

A native Frappe Framework app providing a comprehensive assessment platform for Pick & Speak, Mock Calls, Role Play, Group Discussions, Written Communication, Grammar, Listening, and Stock Market MCQs.

## Installation

1. Copy or clone `comm_assess` into your Frappe Bench `apps/` directory:
   ```bash
   cp -r /path/to/comm_assess ~/frappe-bench/apps/
   ```

2. Install the app into your site:
   ```bash
   bench --site site1.local install-app comm_assess
   ```

3. Seed default question banks:
   ```bash
   bench --site site1.local execute comm_assess.seeds.seed_data.seed_all
   ```

4. Access the web portals:
   - **Trainee Portal:** `https://your-site.com/comm_assess`
   - **Admin Portal:** `https://your-site.com/comm_assess/admin`
   - **Manager Dashboard:** `https://your-site.com/comm_assess/manager`
