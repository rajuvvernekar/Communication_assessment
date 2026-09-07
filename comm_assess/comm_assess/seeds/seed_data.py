import frappe
import json

def seed_all():
	"""Seed standard question banks and manager assessment topics into Assessment Question DocType."""
	frappe.db.delete("Assessment Question")
	
	# 1. Grammar Questions
	grammar_questions = [
		{
			"category": "Grammar",
			"set_name": "Set 1",
			"question_stem": "Identify the grammatically correct sentence:",
			"options": ["She don't like coffee.", "She doesn't likes coffee.", "She doesn't like coffee.", "She not like coffee."],
			"correct_answer": "She doesn't like coffee.",
			"explanation": "With third-person singular (she), use 'does not' followed by base verb 'like'."
		},
		{
			"category": "Grammar",
			"set_name": "Set 1",
			"question_stem": "Choose the correct prepositions: He is good ____ mathematics and interested ____ science.",
			"options": ["at, in", "in, at", "with, on", "for, about"],
			"correct_answer": "at, in",
			"explanation": "'Good at' a subject/skill and 'interested in' a topic."
		}
	]

	# 2. Stock Market NRI Questions
	stock_questions = [
		{
			"category": "Stock Market",
			"set_name": "NRI Basics Set 1",
			"question_stem": "Which regulator governs the Indian securities market?",
			"options": ["RBI", "SEBI", "IRDAI", "PFRDA"],
			"correct_answer": "SEBI",
			"explanation": "SEBI (Securities and Exchange Board of India) regulates the stock market in India."
		},
		{
			"category": "Stock Market",
			"set_name": "NRI Basics Set 1",
			"question_stem": "What type of bank account is mandatory for NRIs trading under PIS route?",
			"options": ["NRE / NRO Savings", "NRE PIS Account", "Current Account", "FCNR Account"],
			"correct_answer": "NRE PIS Account",
			"explanation": "Portfolio Investment Scheme (PIS) requires a designated NRE/NRO PIS account."
		}
	]

	# 3. Manager Assessment Topics (The Situation Room, Transcript Autopsy, The Paper Trade, The Red Pen, The Mirror Room)
	manager_topics = [
		{
			"category": "Situation Room",
			"set_name": "Manager Assessment 1",
			"question_stem": "The Unexpected Resignation: Top performer resigns 4 days before peak season. Write your exact opening words in Section A, and diagnose the flawed response in Section B.",
			"options": [],
			"correct_answer": "Trainer Scored (Section A: Tone & Ownership, Section B: Error Diagnosis & Rewrite)",
			"explanation": "Evaluates self-audit, tone under pressure, ownership language, and error diagnosis."
		},
		{
			"category": "Situation Room",
			"set_name": "Manager Assessment 1",
			"question_stem": "The HNW Portfolio Delay Crisis: ₹75 Lakh portfolio transfer delayed by 10 days during a market surge. Client threatens legal action & SEBI complaint.",
			"options": [],
			"correct_answer": "Trainer Scored (Section A & B)",
			"explanation": "De-escalating high-net-worth client disputes without deflecting or making unapproved financial guarantees."
		},
		{
			"category": "Transcript Autopsy",
			"set_name": "Manager Assessment 2",
			"question_stem": "SIP Debit With No Unit Allotment (22 Min Zerodha Call): Identify 6+ coaching errors, locate the call turning point, and rewrite the call closure.",
			"options": [],
			"correct_answer": "Trainer Scored (Q1 Mistakes, Q2 Turning Point, Q3 Rewrite Close)",
			"explanation": "Measures quality audit precision and call dissection capability."
		},
		{
			"category": "Transcript Autopsy",
			"set_name": "Manager Assessment 2",
			"question_stem": "NRI PIS Account Opening & Currency Conversion Delay (18 Min Call): Identify 8 agent errors and write a structured coaching report.",
			"options": [],
			"correct_answer": "Trainer Scored",
			"explanation": "Measures coaching feedback precision for complex regulatory & banking processes."
		},
		{
			"category": "Paper Trade",
			"set_name": "Manager Assessment 3",
			"question_stem": "C-Suite Escalation: Handle a live 5-minute call with VP Operations of top client threatening contract termination.",
			"options": [],
			"correct_answer": "Trainer Scored (Live Role-Play)",
			"explanation": "Measures real-time escalation handling, empathy, and composure."
		},
		{
			"category": "Paper Trade",
			"set_name": "Manager Assessment 3",
			"question_stem": "Margin Call Penalty Dispute: Corporate client demands ₹1.8 Lakh penalty refund after system auto-square-off.",
			"options": [],
			"correct_answer": "Trainer Scored (Live Role-Play)",
			"explanation": "Measures handling high-value financial disputes under time pressure."
		},
		{
			"category": "Red Pen",
			"set_name": "Manager Assessment 4",
			"question_stem": "The Burnout Star: Deliver structured feedback to top performer whose engagement dropped while managing pushback.",
			"options": [],
			"correct_answer": "Trainer Scored (Conversational AI Role-Play)",
			"explanation": "Measures feedback structure, empathy, and maintaining relationship standards."
		},
		{
			"category": "Red Pen",
			"set_name": "Manager Assessment 4",
			"question_stem": "The Defiant Team Lead: Deliver feedback to senior lead refusing to adopt new quality audit tools.",
			"options": [],
			"correct_answer": "Trainer Scored (Conversational AI Role-Play)",
			"explanation": "Measures holding team standards against senior pushback."
		},
		{
			"category": "Mirror Room",
			"set_name": "Manager Assessment 5",
			"question_stem": "In-the-Moment Crisis: Team member breaks down in team meeting. State gut reaction, first action, and emotional regulation.",
			"options": [],
			"correct_answer": "Trainer Scored (Scenario Cascade + Debrief)",
			"explanation": "Measures self-awareness, impulse control, empathy, and composure."
		},
		{
			"category": "Mirror Room",
			"set_name": "Manager Assessment 5",
			"question_stem": "Multi-Front Operational Crisis: Server crash, 3 absent leads, and executive review in 15 minutes.",
			"options": [],
			"correct_answer": "Trainer Scored (Scenario Cascade + Debrief)",
			"explanation": "Measures executive presence and emotional regulation under extreme multi-front pressure."
		}
	]

	all_qs = grammar_questions + stock_questions + manager_topics

	for q in all_qs:
		doc = frappe.get_doc({
			"doctype": "Assessment Question",
			"category": q["category"],
			"set_name": q.get("set_name"),
			"question_stem": q["question_stem"],
			"options": json.dumps(q["options"]),
			"correct_answer": q["correct_answer"],
			"explanation": q.get("explanation", "")
		})
		doc.insert(ignore_permissions=True)

	frappe.db.commit()
	print(f"Successfully seeded {len(all_qs)} items into Assessment Question DocType.")
