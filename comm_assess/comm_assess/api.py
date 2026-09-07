import frappe
import json

@frappe.whitelist(allow_guest=True)
def register_or_get_trainee(full_name, emp_id):
	"""Register a new trainee or return existing record by employee ID."""
	if not emp_id or not full_name:
		frappe.throw("Full Name and Employee ID are required.")
		
	emp_id = str(emp_id).strip().upper()
	full_name = str(full_name).strip()

	trainee_name = frappe.db.get_value("Assessment Trainee", {"emp_id": emp_id}, "name")
	if trainee_name:
		doc = frappe.get_doc("Assessment Trainee", trainee_name)
		if doc.full_name != full_name:
			doc.full_name = full_name
			doc.save(ignore_permissions=True)
		return doc.as_dict()

	doc = frappe.get_doc({
		"doctype": "Assessment Trainee",
		"emp_id": emp_id,
		"full_name": full_name
	})
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return doc.as_dict()


@frappe.whitelist(allow_guest=True)
def get_questions(category=None, set_name=None):
	"""Fetch questions by category and optional set name."""
	filters = {}
	if category:
		filters["category"] = category
	if set_name:
		filters["set_name"] = set_name

	questions = frappe.get_all(
		"Assessment Question",
		filters=filters,
		fields=["name", "category", "set_name", "question_stem", "options", "correct_answer", "explanation", "media_url"],
		order_by="idx ascii, name ascii"
	)
	
	# Parse JSON string options back to python list/dict if needed
	for q in questions:
		if q.options and isinstance(q.options, str):
			try:
				q["options"] = json.loads(q.options)
			except Exception:
				pass
	return questions


@frappe.whitelist(allow_guest=True)
def submit_assessment(trainee_emp_id, module_type, total_score=0, max_score=0, submission_data=None, audio_url=None, ai_feedback=None):
	"""Submit test assessment results."""
	if not trainee_emp_id:
		frappe.throw("Trainee Employee ID is required.")

	emp_id = str(trainee_emp_id).strip().upper()
	trainee = frappe.db.get_value("Assessment Trainee", {"emp_id": emp_id}, "name")
	if not trainee:
		# Auto create trainee if missing
		trainee_doc = frappe.get_doc({
			"doctype": "Assessment Trainee",
			"emp_id": emp_id,
			"full_name": f"Trainee {emp_id}"
		})
		trainee_doc.insert(ignore_permissions=True)
		trainee = trainee_doc.name

	sub_data_str = json.dumps(submission_data) if isinstance(submission_data, (dict, list)) else (submission_data or "")
	ai_fb_str = json.dumps(ai_feedback) if isinstance(ai_feedback, (dict, list)) else (ai_feedback or "")

	doc = frappe.get_doc({
		"doctype": "Assessment Record",
		"trainee": trainee,
		"module_type": module_type,
		"total_score": float(total_score or 0),
		"max_score": float(max_score or 0),
		"status": "AI Evaluated" if ai_feedback else ("Completed" if total_score > 0 else "Pending"),
		"submission_data": sub_data_str,
		"audio_recording": audio_url or "",
		"ai_feedback": ai_fb_str
	})
	doc.insert(ignore_permissions=True)
	frappe.db.commit()

	return {"status": "success", "assessment_id": doc.name}


@frappe.whitelist(allow_guest=True)
def upload_audio():
	"""Handle audio recording upload into Frappe File Manager."""
	file = frappe.request.files.get("file")
	if not file:
		frappe.throw("No audio file uploaded.")

	filename = file.filename or "recording.webm"
	content = file.read()

	saved_file = frappe.get_doc({
		"doctype": "File",
		"file_name": filename,
		"is_private": 0,
		"content": content
	})
	saved_file.save(ignore_permissions=True)
	frappe.db.commit()

	return {"status": "success", "file_url": saved_file.file_url}


@frappe.whitelist(allow_guest=True)
def get_admin_assessments(status=None, module_type=None):
	"""Fetch assessments for admin evaluation dashboard."""
	filters = {}
	if status:
		filters["status"] = status
	if module_type:
		filters["module_type"] = module_type

	records = frappe.get_all(
		"Assessment Record",
		filters=filters,
		fields=["name", "trainee", "module_type", "status", "total_score", "max_score", "audio_recording", "ai_feedback", "admin_feedback", "creation"],
		order_by="creation desc"
	)

	for r in records:
		trainee_info = frappe.db.get_value("Assessment Trainee", r.trainee, ["full_name", "emp_id"], as_dict=True)
		if trainee_info:
			r["trainee_name"] = trainee_info.full_name
			r["emp_id"] = trainee_info.emp_id

	return records


@frappe.whitelist(allow_guest=True)
def evaluate_assessment(assessment_id, total_score, admin_feedback=None, status="Evaluated"):
	"""Admin evaluation endpoint to update scores and feedback."""
	if not frappe.db.exists("Assessment Record", assessment_id):
		frappe.throw(f"Assessment Record {assessment_id} not found.")

	doc = frappe.get_doc("Assessment Record", assessment_id)
	doc.total_score = float(total_score)
	doc.admin_feedback = admin_feedback or ""
	doc.status = status
	doc.save(ignore_permissions=True)
	frappe.db.commit()

	return {"status": "success", "assessment_id": doc.name}


@frappe.whitelist(allow_guest=True)
def get_manager_analytics():
	"""Fetch summary metrics for manager dashboard."""
	total_trainees = frappe.db.count("Assessment Trainee")
	total_assessments = frappe.db.count("Assessment Record")
	completed_assessments = frappe.db.count("Assessment Record", {"status": ["in", ["Evaluated", "Completed", "AI Evaluated"]]})
	
	assessments = frappe.get_all(
		"Assessment Record",
		fields=["name", "trainee", "module_type", "status", "total_score", "max_score", "creation"],
		order_by="creation desc",
		limit=100
	)

	for a in assessments:
		t = frappe.db.get_value("Assessment Trainee", a.trainee, ["full_name", "emp_id"], as_dict=True)
		if t:
			a["full_name"] = t.full_name
			a["emp_id"] = t.emp_id

	return {
		"total_trainees": total_trainees,
		"total_assessments": total_assessments,
		"completed_assessments": completed_assessments,
		"recent_assessments": assessments
	}
