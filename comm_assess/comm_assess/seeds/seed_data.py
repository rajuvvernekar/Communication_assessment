import frappe
import json
import os

def seed_all():
	"""Seed standard question banks into Assessment Question DocType."""
	frappe.db.delete("Assessment Question")
	
	# Sample Grammar Questions
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

	# Sample Stock Market NRI Questions
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

	all_qs = grammar_questions + stock_questions

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
	print(f"Successfully seeded {len(all_qs)} questions into Assessment Question DocType.")
