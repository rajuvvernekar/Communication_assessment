import os
import re

db_files = [
    "/Users/girisha/Communication_assessment/js/db.js",
    "/Users/girisha/Communication_assessment/clean_repository/js/db.js",
    "/Users/girisha/Communication_assessment/comm_assess/comm_assess/public/js/db.js"
]

for target in db_files:
    if os.path.exists(target):
        with open(target, "r", encoding="utf-8") as f:
            code = f.read()

        # Update _seedLocalStorageDefaults to also call _seedManagerTopics
        if "function _seedLocalStorageDefaults()" in code and "_seedManagerTopics()" not in code.split("function _seedLocalStorageDefaults()")[1].split("}")[0]:
            code = code.replace("_localPut('settings', { key: 'adminPassword', value: 'admin123' });", "_localPut('settings', { key: 'adminPassword', value: 'admin123' });\n    await _seedManagerTopics();")

        # Update _seedManagerTopics to handle LocalStorage fallback
        if "async function _seedManagerTopics()" in code:
            old_func_pattern = r"async function _seedManagerTopics\(\)\s*\{[^}]+\}"
            new_func = """async function _seedManagerTopics() {
    try {
      let existingCount = 0;
      if (_useLocalStorage) {
        const localT = _localGetAll('topics');
        existingCount = localT.filter(t => t.module && t.module.startsWith('mgr-')).length;
      } else {
        const { count } = await _sb.from('topics').select('*', { count: 'exact', head: true }).like('module', 'mgr-%');
        existingCount = count || 0;
      }

      if (existingCount >= 10) return; // already seeded

      const mgrTopics = [
        // ── Situation Room
        { id: 'mgr-sr1', module: 'mgr-situation-room', title: 'The Unexpected Resignation', enabled: true, description: 'A crisis scenario requiring immediate team leadership and strategic thinking.', scenario: 'Your top performer — handling 40% of team output — has resigned effective immediately citing burnout and poor management from you personally. The team already knows via WhatsApp. You have a leadership review call with your VP in 90 minutes.\\n\\nSpeak for 4-5 minutes: Your immediate 24-hour action plan, how you address the team\\'s concerns directly (including the "poor management" claim), talent risk mitigation, and what you tell your VP.', checklist: [], wrongResponse: 'Vikram, honestly I\\'m shocked. The timing couldn\\'t be worse...', sectionAPrompt: 'Write the EXACT words you say to Vikram in the next 2–3 minutes.' },
        { id: 'mgr-sr2', module: 'mgr-situation-room', title: 'The Compliance Breach', enabled: true, description: 'A high-stakes compliance failure requiring immediate escalation and damage control.', scenario: 'Your two senior agents bypassed compliance protocols for 8 weeks, marking 23 customer complaints as resolved without documentation. Regulators have flagged 3 of these cases. Your CXO has been notified and wants a briefing in 2 hours.\\n\\nSpeak for 4-5 minutes: Your escalation approach, how you handle the agents, customer remediation plan, your accountability to senior leadership, and systemic prevention measures.', checklist: [], wrongResponse: 'Okay, I\\'ll get straight to the point. What you two have done is a serious compliance violation...', sectionAPrompt: 'Write the EXACT words you say to open this conversation.' },
        { id: 'mgr-sr5', module: 'mgr-situation-room', title: 'The HNW Portfolio Delay Crisis', enabled: true, description: '₹75 Lakh portfolio transfer delayed by 10 days.', scenario: 'Your HNW client Mr. Rakesh Kapoor initiated a ₹75 Lakh portfolio transfer that took 10 working days instead of 2 due to back-office delay. Market rallied 4.5%. Client demands meeting.', wrongResponse: 'Mr. Kapoor, thank you for coming in. Look, I understand you\\'re upset...', sectionAPrompt: 'Write the EXACT words you say to open this meeting with Mr. Kapoor.', checklist: [] },
        { id: 'mgr-sr6', module: 'mgr-situation-room', title: 'The Multi-Team Outage Conflict', enabled: true, description: 'System outage blamestorming between Ops and IT.', scenario: 'During morning opening hours, 45 trade orders failed. Operations blames IT for server misconfiguration; IT blames Operations for bad batch files.', wrongResponse: 'Alright, shut the door. What was that embarrassing display out on the floor?...', sectionAPrompt: 'Write your EXACT opening words in the next 60 seconds.', checklist: [] },

        // ── Transcript Autopsy
        { id: 'mgr-ta1', module: 'mgr-transcript-autopsy', title: 'SIP Debit With No Unit Allotment — 22 Min Call', enabled: true, description: 'Analyse a difficult inbound call with 8+ coaching opportunities across all key service competencies.', scenario: 'BACKGROUND: Preethi Mehta is calling Zerodha support for the third time. Her ₹10,000 monthly SIP was debited on the 2nd but units were never allotted. Ticket TKT-88244 (raised 3 weeks ago) was falsely marked resolved.\\n\\nYOUR TASK: Write a structured coaching report. Identify at minimum 6 coaching opportunities.', checklist: [] },
        { id: 'mgr-ta2', module: 'mgr-transcript-autopsy', title: 'Mutual Fund Redemption Blocked — 26 Min Call', enabled: true, description: 'A high-frustration escalation call with 9+ coaching opportunities across service quality dimensions.', scenario: 'BACKGROUND: Vikram Shetty has been waiting 45 days for ₹2,50,000 redemption to credit. He has called 4 times, received conflicting explanations, and has a medical emergency.\\n\\nYOUR TASK: Identify minimum 8 coaching opportunities.', checklist: [] },
        { id: 'mgr-ta3', module: 'mgr-transcript-autopsy', title: 'NRI PIS Account & Currency Conversion Delay — 18 Min Call', enabled: true, description: 'Sunita Rao NRE PIS account opening delayed by 3 weeks.', scenario: 'BACKGROUND: Sunita Rao (Dubai NRI) applied for NRE PIS account 3 weeks ago. Missed infrastructure bond issue due to bank rejection delay.', checklist: [] },

        // ── Mock Call (Paper Trade)
        { id: 'mgr-mc1', module: 'mgr-mock-call', title: 'C-Suite Escalation — Contract at Final Risk', enabled: true, description: 'Handle a furious C-suite client call where the relationship is at final breaking point.', scenario: 'You are the Relationship Manager for Altus Capital, a ₹80 crore institutional client. The CFO, Priya Nair, is on the line. Three consecutive quarter-end reports were delivered late.', checklist: ['Acknowledge failures without deflection', 'Show specific corrective actions already taken', 'Propose concrete accountability milestones', 'Demonstrate understanding of client business impact', 'Make a credible commitment with a safety net offer'] },
        { id: 'mgr-mc2', module: 'mgr-mock-call', title: 'Regulatory Audit Call — Explain Your Team\'s Non-Compliance', enabled: true, description: 'Handle a call from a compliance auditor who has identified systematic non-compliance in your team.', scenario: 'You are on a call with Meera Krishnamurthy, the Internal Compliance Auditor. She has found that your team has been marking calls as "first-call resolved" when follow-up tickets were still open.', checklist: ['Be transparent without being evasive', 'Take appropriate ownership based on actual knowledge', 'Show immediate corrective actions', 'Do not throw team leads under the bus unfairly', 'Propose systemic fix with timeline'] },
        { id: 'mgr-mc4', module: 'mgr-mock-call', title: 'Margin Call Penalty Dispute', enabled: true, description: 'Corporate client disputing ₹1.8 Lakh margin penalty.', scenario: 'A high-volume corporate trader calls in a rage after receiving a ₹1.8 Lakh margin penalty from auto-square-off.', checklist: [] },
        { id: 'mgr-mc5', module: 'mgr-mock-call', title: 'Cross-Border Regulatory Freeze', enabled: true, description: 'NRI Demat account frozen due to FATCA.', scenario: 'An NRI client based in London has their Demat account suddenly frozen due to pending FATCA re-declaration while travelling.', checklist: [] },

        // ── Feedback (Red Pen)
        { id: 'mgr-fb1', module: 'mgr-feedback', title: 'The Burnout Star', enabled: true, description: 'Give structured feedback to a top performer whose engagement has suddenly dropped.', scenario: 'Rahul is your best performer — always exceeds targets. For the last 3 weeks he has been arriving late, missing standups, and being short and impatient with teammates.', checklist: [] },
        { id: 'mgr-fb2', module: 'mgr-feedback', title: 'The Struggling New Hire', enabled: true, description: 'Give honest but supportive feedback to a new hire whose communication is damaging customer relationships.', scenario: 'Priya joined 8 weeks ago. She is technically capable but comes across as too blunt with customers. Two formal complaints have been filed.', checklist: [] },
        { id: 'mgr-fb3', module: 'mgr-feedback', title: 'The Dismissive Senior', enabled: true, description: 'Challenge a high-performing but culturally toxic senior agent on behaviour that is undermining team culture.', scenario: 'Arjun has 5 years of experience and is technically your best agent. He dismisses new processes publicly, makes condescending comments to junior staff.', checklist: [] },
        { id: 'mgr-fb4', module: 'mgr-feedback', title: 'The Defiant Team Lead', enabled: true, description: 'Senior Lead refusing AI audit tools.', scenario: 'Vikram is a senior Team Lead who has refused to adopt the new automated audit workflow.', checklist: [] },

        // ── Emotional Intelligence (Mirror Room)
        { id: 'mgr-eq1', module: 'mgr-eq', title: 'The Breaking Point in a Team Meeting', enabled: true, description: 'Respond to a team member\'s public emotional breakdown with professional, human leadership.', scenario: 'During a Monday morning team meeting with 11 people present, your agent Sana suddenly says through tears: "I can\'t keep doing this. The pressure is impossible."', checklist: [] },
        { id: 'mgr-eq2', module: 'mgr-eq', title: 'The Public Undermining by a Peer Manager', enabled: true, description: 'Respond to deliberate public undermining with professional self-regulation and strategic thinking.', scenario: 'In a cross-functional leadership review, a peer manager says: "I think the numbers from your team look good on paper, but the quality escalations tell a different story."', checklist: [] },
        { id: 'mgr-eq3', module: 'mgr-eq', title: 'Multi-Front Operational Crisis', enabled: true, description: 'Server crash + 3 absent leads + VP review in 15 mins.', scenario: 'It is 9:15 AM on Monday. Trade execution server crashes, 3 key leads are absent, and VP calls an emergency review in 15 minutes.', checklist: [] },
        { id: 'mgr-eq4', module: 'mgr-eq', title: 'Public Peer Challenge', enabled: true, description: 'Direct report challenging strategy in public sync.', scenario: 'During a department strategy meeting, a direct report openly challenges your roadmap in front of executive management.', checklist: [] },

        // ── Listening & Tone
        { id: 'mgr-lt1', module: 'mgr-listening-tone', title: 'Listening & Tone — Manager Email Analysis', enabled: true, description: 'Analyse the tone, subtext, and communication quality of a real manager email.', scenario: 'Read the email carefully and answer 5 analytical questions about tone, impact, and what is unsaid.', checklist: [] },

        // ── Management Skills
        { id: 'mgr-ms1', module: 'mgr-management-skills', title: '30-60-90 Day Plan for a First-Time Team Lead', enabled: true, description: 'Design a rigorous, structured development plan for a newly promoted team lead.', scenario: 'You have just promoted Kiran, your highest-performing agent, to Team Lead. She is technically outstanding but has never managed people.', checklist: [] },
        { id: 'mgr-ms2', module: 'mgr-management-skills', title: 'Change Management Brief — CRM Migration', enabled: true, description: 'Lead a high-stakes system migration after a previous failure that damaged team trust.', scenario: 'Your team of 14 agents will migrate to a new CRM system in 4 weeks.', checklist: [] }
      ];

      if (_useLocalStorage) {
        for (const item of mgrTopics) {
          _localPut('topics', item);
        }
      } else {
        await _sb.from('topics').insert(mgrTopics.map(t => ({ ...t, created_at: new Date().toISOString() })));
      }
      console.log(`[DB] Successfully seeded ${mgrTopics.length} manager topics.`);
    } catch (e) {
      console.warn('[DB] _seedManagerTopics failed:', e.message || e);
    }
  }"""
            code = re.sub(old_func_pattern, new_func, code, flags=re.DOTALL)

        with open(target, "w", encoding="utf-8") as f:
            f.write(code)
        print(f"Updated DB manager seeding in {target}")

