import os
import re

admin_files = [
    "/Users/girisha/Communication_assessment/js/admin.js",
    "/Users/girisha/Communication_assessment/clean_repository/js/admin.js",
    "/Users/girisha/Communication_assessment/comm_assess/comm_assess/public/js/admin.js"
]

db_files = [
    "/Users/girisha/Communication_assessment/js/db.js",
    "/Users/girisha/Communication_assessment/clean_repository/js/db.js",
    "/Users/girisha/Communication_assessment/comm_assess/comm_assess/public/js/db.js"
]

bulletproof_seed_manager = """  // ── Auto-seed Manager Topics into DB (Item-by-item verification) ───────────────────────
  async function seedManagerTopics() {
    try {
      const allTopics = await DB.getAll('topics');
      const existingIds = new Set(allTopics.map(t => t.id));

      const MANAGER_SCENARIOS_POOL = [
        // Situation Room
        { id: 'mgr-sr1', module: 'mgr-situation-room', title: 'The Unexpected Resignation', description: 'Top performer resigns 4 days before peak season.', scenario: 'Your top performer, Vikram, has just walked into your office and quietly resigned — effective in 2 weeks. He handles 40% of your team\\'s output. Peak season starts in 4 days. The rest of the team doesn\\'t know yet.', wrongResponse: 'Vikram, honestly I\\'m shocked. The timing couldn\\'t be worse...', sectionAPrompt: 'Write the EXACT words you say to Vikram in the next 2–3 minutes.', enabled: true },
        { id: 'mgr-sr2', module: 'mgr-situation-room', title: 'The Compliance Breach', description: 'Two senior agents bypassed mandatory documentation for 6 weeks.', scenario: 'Your compliance lead informed you that Priya and Ravi bypassed mandatory documentation protocol for 6 consecutive weeks to hit monthly targets.', wrongResponse: 'Okay, I\\'ll get straight to the point. What you two have done is a serious compliance violation...', sectionAPrompt: 'Write the EXACT words you say to open this conversation.', enabled: true },
        { id: 'mgr-sr5', module: 'mgr-situation-room', title: 'The HNW Portfolio Delay Crisis', description: '₹75 Lakh portfolio transfer delayed by 10 days.', scenario: 'Your HNW client Mr. Rakesh Kapoor initiated a ₹75 Lakh portfolio transfer that took 10 working days instead of 2 due to back-office delay. Market rallied 4.5%. Client demands meeting.', wrongResponse: 'Mr. Kapoor, thank you for coming in. Look, I understand you\\'re upset...', sectionAPrompt: 'Write the EXACT words you say to open this meeting with Mr. Kapoor.', enabled: true },
        { id: 'mgr-sr6', module: 'mgr-situation-room', title: 'The Multi-Team Outage Conflict', description: 'System outage blamestorming between Ops and IT.', scenario: 'During morning opening hours, 45 trade orders failed. Operations blames IT for server misconfiguration; IT blames Operations for bad batch files.', wrongResponse: 'Alright, shut the door. What was that embarrassing display out on the floor?...', sectionAPrompt: 'Write your EXACT opening words in the next 60 seconds.', enabled: true },

        // Transcript Autopsy
        { id: 'mgr-ta1', module: 'mgr-transcript-autopsy', title: 'SIP Debit With No Unit Allotment — 22 Min Call', description: 'Preethi Mehta calling about ₹10,000 SIP debited without unit allotment.', scenario: 'BACKGROUND: Preethi Mehta calling Zerodha support for 3rd time about SIP debit without units. 8+ agent errors committed.', enabled: true },
        { id: 'mgr-ta2', module: 'mgr-transcript-autopsy', title: 'Mutual Fund Redemption Blocked — 26 Min Call', description: 'Vikram Shetty liquid fund redemption outstanding for 45 days.', scenario: 'BACKGROUND: Vikram Shetty placed ₹2,50,000 redemption request 45 days ago for medical emergency. 9+ coaching opportunities.', enabled: true },
        { id: 'mgr-ta3', module: 'mgr-transcript-autopsy', title: 'NRI PIS Account & Currency Conversion Delay — 18 Min Call', description: 'Sunita Rao NRE PIS account opening delayed by 3 weeks.', scenario: 'BACKGROUND: Sunita Rao (Dubai NRI) applied for NRE PIS account 3 weeks ago. Missed infrastructure bond issue due to bank rejection delay.', enabled: true },

        // Mock Call (Paper Trade)
        { id: 'mgr-mc1', module: 'mgr-mock-call', title: 'C-Suite Escalation', description: 'VP Operations threatening contract termination.', scenario: 'You are on a call with the VP Operations of your biggest client. Three major deliverables were missed this quarter due to internal resourcing issues.', enabled: true },
        { id: 'mgr-mc2', module: 'mgr-mock-call', title: 'Contract at Risk', description: '₹45 Crore account in jeopardy.', scenario: 'A key enterprise client worth ₹45 crores annually is on the line. Their procurement head says they have better proposals from competitors.', enabled: true },
        { id: 'mgr-mc4', module: 'mgr-mock-call', title: 'Margin Call Penalty Dispute', description: 'Corporate client disputing ₹1.8 Lakh margin penalty.', scenario: 'A high-volume corporate trader calls in a rage after receiving a ₹1.8 Lakh margin penalty from auto-square-off.', enabled: true },
        { id: 'mgr-mc5', module: 'mgr-mock-call', title: 'Cross-Border Regulatory Freeze', description: 'NRI Demat account frozen due to FATCA.', scenario: 'An NRI client based in London has their Demat account suddenly frozen due to pending FATCA re-declaration while travelling.', enabled: true },

        // Feedback (Red Pen)
        { id: 'mgr-fb1', module: 'mgr-feedback', title: 'The Burnout Star', description: 'Top performer experiencing burnout.', scenario: 'Rahul is your best performer. For the last 3 weeks he has been arriving late, missing standups, and giving short responses.', enabled: true },
        { id: 'mgr-fb2', module: 'mgr-feedback', title: 'The Struggling New Hire', description: 'New hire coming across as too blunt.', scenario: 'Priya joined 8 weeks ago. She is technically capable but struggles with customer communication — comes across as too blunt.', enabled: true },
        { id: 'mgr-fb3', module: 'mgr-feedback', title: 'The Dismissive Senior', description: 'Senior agent resistant to new processes.', scenario: 'Arjun has 5 years experience. He dismisses new processes and is condescending to newer team members.', enabled: true },
        { id: 'mgr-fb4', module: 'mgr-feedback', title: 'The Defiant Team Lead', description: 'Senior Lead refusing AI audit tools.', scenario: 'Vikram is a senior Team Lead who has refused to adopt the new automated audit workflow.', enabled: true },

        // EQ (Mirror Room)
        { id: 'mgr-eq1', module: 'mgr-eq', title: 'In-the-Moment Crisis', description: 'Team member breakdown during standup.', scenario: 'During a team meeting, a team member suddenly becomes visibly distressed and says: "I can\\'t do this anymore. Everything is falling apart."', enabled: true },
        { id: 'mgr-eq2', module: 'mgr-eq', title: 'The Public Undermining', description: 'Peer manager undermining team performance.', scenario: 'In a leadership review meeting, a peer manager says: "I think the numbers from your team are misleading — quality tells a different story."', enabled: true },
        { id: 'mgr-eq3', module: 'mgr-eq', title: 'Multi-Front Operational Crisis', description: 'Server crash + 3 absent leads + VP review in 15 mins.', scenario: 'It is 9:15 AM on Monday. Trade execution server crashes, 3 key leads are absent, and VP calls an emergency review in 15 minutes.', enabled: true },
        { id: 'mgr-eq4', module: 'mgr-eq', title: 'Public Peer Challenge', description: 'Direct report challenging strategy in public sync.', scenario: 'During a department strategy meeting, a direct report openly challenges your roadmap in front of executive management.', enabled: true },

        // Listening & Tone
        { id: 'mgr-lt1', module: 'mgr-listening-tone', title: 'Management Communication & Tone Analysis', description: '5 MCQ questions evaluating email communication, empathy, and tone.', scenario: 'Read the email from a manager to their team and answer 5 comprehension and tone questions.', enabled: true },

        // Management Skills
        { id: 'mgr-ms1', module: 'mgr-management-skills', title: '30-60-90 Day Development Plan', description: 'Structured plan for newly promoted Team Lead.', scenario: 'Write a structured 30-60-90 day development plan for a high-performing agent newly promoted to Team Lead.', enabled: true },
        { id: 'mgr-ms2', module: 'mgr-management-skills', title: 'CRM Change Management Brief', description: 'Change management strategy for system migration.', scenario: 'Your team of 12 agents will migrate to a new CRM system in 4 weeks. Write a comprehensive change management brief.', enabled: true }
      ];

      for (const item of MANAGER_SCENARIOS_POOL) {
        if (!existingIds.has(item.id)) {
          await DB.put('topics', item);
        }
      }
    } catch (e) {
      console.warn('seedManagerTopics failed:', e);
    }
  }"""

for target in admin_files:
    if os.path.exists(target):
        with open(target, "r", encoding="utf-8") as f:
            code = f.read()

        # Fix tab-btn click listener to be ASYNC
        code = re.sub(
            r"btn\.onclick\s*=\s*\(\)\s*=>\s*\{[^}]*await\s+seedManagerTopics\(\);[^}]*\}",
            """btn.onclick = async () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _topicsFilter = btn.dataset.module;
        await seedManagerTopics();
        renderTopicsList();
      }""",
            code
        )

        # Replace seedManagerTopics function body
        code = re.sub(
            r"async function seedManagerTopics\(\)\s*\{.*?\n\s*\}\s*\n\s*async function loadTopics",
            bulletproof_seed_manager + "\n\n  async function loadTopics",
            code,
            flags=re.DOTALL
        )

        with open(target, "w", encoding="utf-8") as f:
            f.write(code)
        print(f"Updated seedManagerTopics in {target}")

